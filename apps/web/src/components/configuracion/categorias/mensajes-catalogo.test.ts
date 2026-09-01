import { describe, expect, it } from 'vitest';
import type { ApiError } from '@/api/client';
import { MATCH_TYPES } from '@/api/catalogo-constantes';
import type { MatchType } from '@/api/catalogo-constantes';
import {
  ETIQUETA_MATCH_TYPE,
  fraseDeImpacto,
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
    [
      'NOMBRE_DUPLICADO',
      'Ya tienes una categoría con ese nombre en ese bucket.',
    ],
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

/**
 * fraseDeImpacto — el traductor puro de las cuatro filas de design.md
 * §1/Q6b, verbatim (US-043 PR #3b, WCTG-07, WCTG-08). El caso zero SUAVIZA
 * la frase, nunca SALTA el diálogo — las cuatro filas siguen devolviendo un
 * `titulo`/`lineas`/`textoConfirmar` completo, nunca `null`.
 */
describe('fraseDeImpacto', () => {
  it('eliminar, n ≥ 1: cuenta las transacciones y advierte sobre TODOS los períodos', () => {
    const frase = fraseDeImpacto({
      tipo: 'eliminar',
      nombre: 'Supermercado',
      transaccionesCount: 3,
    });

    expect(frase).toEqual({
      titulo: 'Eliminar categoría',
      lineas: [
        'Vas a eliminar «Supermercado».',
        '3 transacciones quedan en Sin categoría, en todos los períodos.',
        'Esta acción no se puede deshacer.',
      ],
      textoConfirmar: 'Eliminar',
    });
  });

  it('eliminar, n = 1: el verbo concuerda con la forma singular de etiquetaTransacciones', () => {
    const frase = fraseDeImpacto({
      tipo: 'eliminar',
      nombre: 'Supermercado',
      transaccionesCount: 1,
    });

    expect(frase.lineas[1]).toBe(
      '1 transacción queda en Sin categoría, en todos los períodos.',
    );
  });

  it('eliminar, n = 0: SUAVIZA la frase, no la salta — el diálogo igual se abre', () => {
    const frase = fraseDeImpacto({
      tipo: 'eliminar',
      nombre: 'Suscripciones',
      transaccionesCount: 0,
    });

    expect(frase).toEqual({
      titulo: 'Eliminar categoría',
      lineas: [
        'Vas a eliminar «Suscripciones».',
        'No tiene transacciones asociadas.',
        'Esta acción no se puede deshacer.',
      ],
      textoConfirmar: 'Eliminar',
    });
  });

  it('cambiar-bucket, n ≥ 1: nombra ambos buckets vía A1 (Deseos se muestra "Gustos") y advierte de meses cerrados', () => {
    const frase = fraseDeImpacto({
      tipo: 'cambiar-bucket',
      nombre: 'Supermercado',
      transaccionesCount: 12,
      bucketAnterior: 'Necesidades',
      bucketNuevo: 'Deseos',
    });

    expect(frase).toEqual({
      titulo: 'Cambiar el bucket',
      lineas: [
        '«Supermercado» pasa de Necesidades a Gustos.',
        'Esto mueve 12 transacciones en TODOS los períodos, incluidos los meses ya cerrados.',
        'Tu resumen 50/30/20 va a cambiar para esos meses.',
      ],
      textoConfirmar: 'Cambiar bucket',
    });
  });

  it('cambiar-bucket, n = 0: SUAVIZA la frase — sin línea de "meses cerrados" ni de "resumen 50/30/20"', () => {
    const frase = fraseDeImpacto({
      tipo: 'cambiar-bucket',
      nombre: 'Suscripciones',
      transaccionesCount: 0,
      bucketAnterior: 'Ahorro',
      bucketNuevo: 'Necesidades',
    });

    expect(frase).toEqual({
      titulo: 'Cambiar el bucket',
      lineas: [
        '«Suscripciones» pasa de Ahorro a Necesidades.',
        'No tiene transacciones asociadas, así que no se mueve ningún monto.',
      ],
      textoConfirmar: 'Cambiar bucket',
    });
  });
});

describe('ETIQUETA_MATCH_TYPE (US-043 PR #4, design.md §1/Q9b/D-07)', () => {
  it.each<readonly [MatchType, string]>([
    ['CONTAINS', 'CONTIENE'],
    ['STARTS_WITH', 'EMPIEZA CON'],
    ['REGEX', 'REGEX'],
  ])('etiqueta %s como %s', (matchType, etiqueta) => {
    expect(ETIQUETA_MATCH_TYPE[matchType]).toBe(etiqueta);
  });

  it('es total sobre los tres MATCH_TYPES — cada miembro tiene una fila', () => {
    for (const matchType of MATCH_TYPES) {
      expect(ETIQUETA_MATCH_TYPE[matchType]).toBeDefined();
    }
  });
});
