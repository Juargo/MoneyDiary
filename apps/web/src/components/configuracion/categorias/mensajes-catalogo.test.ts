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
 * `catalogo-http-error.ts`'s own `_exhaustive: never` guard. `BODY_INVALIDO`
 * is NOT driven through `servidor()` below: nothing in this codebase ever
 * sets `code: 'BODY_INVALIDO'` on a `tag: 'server'` response — that shape is
 * a client-only invention and asserting against it proves nothing about the
 * row it claims to cover. It has its own dedicated test against the real
 * `tag: 'parse'` shape instead (see below).
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

describe('mensajeDeErrorCatalogo — la tabla cerrada de 11 códigos servidor + BODY_INVALIDO (parse)', () => {
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
