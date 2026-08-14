import { describe, expect, it } from 'vitest';
import type { ApiError } from '@/api/client';
import {
  MENSAJE_DEMO_CATALOGO,
  mensajeDeErrorCatalogo,
} from './mensajes-catalogo';

/**
 * mensajes-catalogo.test.ts, error-table portion (US-043 design.md §1/Q8,
 * WCTG-12) — the 12-code closed union, keyed by `code` alone (Q8a): one
 * error class ⇒ one status ⇒ one code, verified against
 * `catalogo-http-error.ts`'s own `_exhaustive: never` guard.
 *
 * `BODY_INVALIDO` has TWO real producers, both covered below:
 * - `tag: 'server', status: 400, code: 'BODY_INVALIDO'` — the backend emits
 *   this literal shape via `res.status(400).json(BODY_INVALIDO)` in
 *   `apps/api/src/infrastructure/http-express/routes/categorias.routes.ts`
 *   and `apps/api/src/infrastructure/http-express/routes/patrones.routes.ts`
 *   whenever `.safeParse()` rejects a mutation body. `errorConCodigo`
 *   (`apps/web/src/api/categorias.ts`) lifts any `code` string from a
 *   non-2xx body verbatim into `{ tag: 'server', status, code }`, so this is
 *   a genuine, reachable production shape (malformed write payload, id-path
 *   schema rejection, or client/API skew) — not a client-only invention.
 * - `tag: 'parse'` — produced client-side by `fetchCatalogo` when a 2xx body
 *   fails `esCatalogoDto` (no `code` field exists on this tag at all).
 *
 * Both shapes are asserted below: two distinct producers converge on the
 * same `COPY.BODY_INVALIDO` message.
 */

function servidor(status: number, code: string): ApiError {
  return { tag: 'server', status, message: 'ignored — never rendered', code };
}

describe('MENSAJE_DEMO_CATALOGO', () => {
  it('es un mensaje NUEVO, propio de la pantalla de categorías — no reutiliza MENSAJE_DEMO_SOLO_LECTURA verbatim (Q6c CORRECTION)', () => {
    expect(MENSAJE_DEMO_CATALOGO).toBe(
      'Estás en una cuenta de demostración. Crea una cuenta real para editar tus categorías.',
    );
    // La frase existente de Perfil dice "tu perfil" — sería falsa acá.
    expect(MENSAJE_DEMO_CATALOGO).not.toContain('tu perfil');
  });
});

describe('mensajeDeErrorCatalogo — la tabla cerrada de 12 códigos (11 vía `it.each` + BODY_INVALIDO, con dos productores: `tag: "server"` real del backend y `tag: "parse"` del cliente)', () => {
  it.each([
    ['NOMBRE_INVALIDO', 'El nombre debe tener entre 1 y 40 caracteres.'],
    ['BUCKET_NO_ASIGNABLE', 'Elige un bucket: Necesidades, Gustos o Ahorro.'],
    ['PATRON_INVALIDO', 'El patrón debe tener entre 1 y 200 caracteres.'],
    ['MATCH_TYPE_INVALIDO', 'Elige un tipo de coincidencia válido.'],
    ['REGEX_INVALIDA', 'Esa expresión regular no es válida.'],
    ['PRIORIDAD_INVALIDA', 'La prioridad debe ser un número entre 1 y 999.'],
    ['DEMO_SOLO_LECTURA', MENSAJE_DEMO_CATALOGO],
    [
      'CATEGORIA_NO_ENCONTRADA',
      'Esa categoría ya no existe. Vuelve a la lista y recarga.',
    ],
    ['PATRON_NO_ENCONTRADO', 'Ese patrón ya no existe. Recarga la página.'],
    ['NOMBRE_DUPLICADO', 'Ya tienes una categoría con ese nombre.'],
    ['PATRON_DUPLICADO', 'Ya tienes un patrón con ese texto.'],
  ] as const)('%s → %s', (code, mensajeEsperado) => {
    expect(mensajeDeErrorCatalogo(servidor(400, code))).toBe(mensajeEsperado);
  });

  it('un error de red mapea al mensaje fijo de conexión', () => {
    expect(
      mensajeDeErrorCatalogo({
        tag: 'network',
        message: 'ignored',
      }),
    ).toBe('No se pudo conectar con el servidor.');
  });

  it('`tag: "parse"` (la forma REAL que produce fetchCatalogo cuando el body 2xx no tiene la forma esperada) mapea a COPY.BODY_INVALIDO', () => {
    expect(
      mensajeDeErrorCatalogo({
        tag: 'parse',
        message: 'Respuesta inesperada del servidor.',
      }),
    ).toBe(
      'No se pudo procesar la solicitud. Revisa los datos e intenta nuevamente.',
    );
  });

  it('`tag: "server", status: 400, code: "BODY_INVALIDO"` (la forma REAL que emite el backend cuando `.safeParse()` rechaza el body de una mutación — ver `categorias.routes.ts`/`patrones.routes.ts`) mapea al MISMO COPY.BODY_INVALIDO', () => {
    expect(mensajeDeErrorCatalogo(servidor(400, 'BODY_INVALIDO'))).toBe(
      'No se pudo procesar la solicitud. Revisa los datos e intenta nuevamente.',
    );
  });

  it('`tag: "unauthorized"` mapea a cadena vacía — el guard _authenticated redirige a /login antes de renderizar', () => {
    expect(
      mensajeDeErrorCatalogo({ tag: 'unauthorized', message: 'ignored' }),
    ).toBe('');
  });

  it('`tag: "invalid"` (400 período inválido, ajeno a los endpoints de catálogo) cae al fallback genérico', () => {
    expect(mensajeDeErrorCatalogo({ tag: 'invalid', message: 'ignored' })).toBe(
      'Ocurrió un error inesperado. Intenta nuevamente.',
    );
  });

  it('un código no documentado (12° hipotético) cae al fallback genérico', () => {
    expect(mensajeDeErrorCatalogo(servidor(400, 'CODIGO_INEXISTENTE'))).toBe(
      'Ocurrió un error inesperado. Intenta nuevamente.',
    );
  });

  it('un error server sin `code` (no-code) cae al fallback genérico', () => {
    expect(
      mensajeDeErrorCatalogo({
        tag: 'server',
        status: 500,
        message: 'ignored',
      }),
    ).toBe('Ocurrió un error inesperado. Intenta nuevamente.');
  });

  it('nunca renderiza `error.message` del servidor, siempre el copy fijo del cliente', () => {
    const resultado = mensajeDeErrorCatalogo(servidor(400, 'NOMBRE_INVALIDO'));
    expect(resultado).not.toBe('ignored — never rendered');
  });
});
