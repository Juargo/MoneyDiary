/**
 * mensajes-catalogo.spec.ts (US-044 PR5a, T5a.5)
 *
 * Two independent halves:
 * 1. Runtime error-table cases — literal-pinned rows for all 12 CodigoCatalogo
 *    members + transport tags + unknown code fallback + GENERICO fallback.
 * 2. Type-level absence proofs — three `// @ts-expect-error` assignments that
 *    confirm the three Google-only codes are NOT members of CodigoCatalogo.
 *    Each @ts-expect-error MUST trigger a tsc error; if it does not, tsc itself
 *    fails — that is the proof working (do not conflate the two halves: the
 *    runtime rows pin copy strings; the type-level proofs pin union membership).
 *
 * Mobile adaptation from web's `mensajeDeErrorCatalogo`:
 * - Web uses `{ tag: 'server'; code?: string }` and `{ tag: 'invalid' }`.
 * - Mobile uses `{ tag: 'http'; status: number; code?: string }` (D-05).
 * - `unauthorized` maps to `copiaPorApiError(e)` (D-08), NOT `''`
 *   (mobile has no in-screen 401 interception — D-16).
 * - Transport tags (`network`/`unauthorized`/`parse`) → `copiaPorApiError(e)`
 *   (D-08's cross-screen axis).
 *
 * Judgment-anticipated class 1: per-code case, one per CodigoCatalogo member.
 * Judgment-anticipated class 3: the three Google-only codes from web's perfil
 *   table are ABSENT from mobile's CodigoCatalogo union — proved at the
 *   type level (T5a.5, design §1.9).
 *
 * MCTG-06 scenarios:
 * - Every CodigoCatalogo member has a literal-pinned copy row.
 * - `403 DEMO_SOLO_LECTURA` maps to its own copy row DEFENSIVELY (CQ-4),
 *   not the generic fallback.
 * - An unmapped/unknown code → generic fallback string.
 */

import type { ApiError } from './api-error';
import { copiaPorApiError } from './api-error';
import type { CodigoCatalogo } from './mensajes-catalogo';
import {
  ETIQUETA_MATCH_TYPE,
  mensajeDeErrorCatalogo,
} from './mensajes-catalogo';
import { MATCH_TYPES } from './catalogo-constantes';

/** Helper: build an `http` ApiError the way `enviarMutacion` does (D-05). */
function http(status: number, code: string): ApiError {
  return { tag: 'http', status, code };
}

/** Helper: build an `http` ApiError WITHOUT a code (non-2xx, unparseable body). */
function httpSinCodigo(status: number): ApiError {
  return { tag: 'http', status };
}

describe('mensajeDeErrorCatalogo — 12-member CodigoCatalogo table', () => {
  it.each<readonly [CodigoCatalogo, string]>([
    ['NOMBRE_INVALIDO', 'El nombre debe tener entre 1 y 40 caracteres.'],
    ['BUCKET_NO_ASIGNABLE', 'Elige un bucket: Necesidades, Gustos o Ahorro.'],
    ['PATRON_INVALIDO', 'El patrón debe tener entre 1 y 200 caracteres.'],
    ['MATCH_TYPE_INVALIDO', 'Elige un tipo de coincidencia válido.'],
    ['REGEX_INVALIDA', 'Esa expresión regular no es válida.'],
    ['PRIORIDAD_INVALIDA', 'La prioridad debe ser un número entre 1 y 999.'],
    [
      'BODY_INVALIDO',
      'No se pudo procesar la solicitud. Revisa los datos e intenta nuevamente.',
    ],
    // MCTG-06 scenario: 403 DEMO_SOLO_LECTURA is a REAL defensive row, not a fallback.
    // CQ-4: no proactive demo layer — but this exact code gets its own copy string.
    [
      'DEMO_SOLO_LECTURA',
      'Estás en una cuenta de demostración. Crea una cuenta real para editar tus categorías.',
    ],
    [
      'CATEGORIA_NO_ENCONTRADA',
      'Esa categoría ya no existe. Vuelve a la lista y recarga.',
    ],
    ['PATRON_NO_ENCONTRADO', 'Ese patrón ya no existe. Vuelve y recarga.'],
    [
      'NOMBRE_DUPLICADO',
      'Ya tienes una categoría con ese nombre en ese bucket.',
    ],
    ['PATRON_DUPLICADO', 'Ya tienes un patrón con ese texto.'],
  ])('%s → correcto copy string', (code, esperado) => {
    expect(mensajeDeErrorCatalogo(http(400, code))).toBe(esperado);
  });

  it('tag:parse → COPY.BODY_INVALIDO (la forma que produce fetchCatalogo cuando esCatalogoDto rechaza un body 2xx)', () => {
    const result = mensajeDeErrorCatalogo({ tag: 'parse' });
    expect(result).toBe(
      'No se pudo procesar la solicitud. Revisa los datos e intenta nuevamente.',
    );
  });

  it('tag:network → copiaPorApiError (D-08: transport copy tiene un dueño cross-screen)', () => {
    const e: ApiError = { tag: 'network' };
    expect(mensajeDeErrorCatalogo(e)).toBe(copiaPorApiError(e));
  });

  it('tag:unauthorized → copiaPorApiError (D-08/D-16: mobile no intercepta 401 en-pantalla)', () => {
    const e: ApiError = { tag: 'unauthorized' };
    expect(mensajeDeErrorCatalogo(e)).toBe(copiaPorApiError(e));
  });

  it('tag:http sin code → fallback genérico', () => {
    expect(mensajeDeErrorCatalogo(httpSinCodigo(500))).toBe(
      'Ocurrió un error inesperado. Intenta nuevamente.',
    );
  });

  it('tag:http con código NO documentado → fallback genérico', () => {
    expect(
      mensajeDeErrorCatalogo({
        tag: 'http',
        status: 400,
        code: 'CODIGO_INVENTADO',
      }),
    ).toBe('Ocurrió un error inesperado. Intenta nuevamente.');
  });

  it('BODY_INVALIDO tiene dos productores reales: tag:parse (fetchCatalogo rechaza body 2xx) y tag:http con code (backend emite 400 BODY_INVALIDO) — ambos producen el mismo string', () => {
    const viaHttp = mensajeDeErrorCatalogo(http(400, 'BODY_INVALIDO'));
    const viaParse = mensajeDeErrorCatalogo({ tag: 'parse' });
    expect(viaHttp).toBe(viaParse);
    expect(viaParse).toBe(
      'No se pudo procesar la solicitud. Revisa los datos e intenta nuevamente.',
    );
  });

  it('nunca renderiza error.code verbatim — siempre copy fijo del cliente (anti-enumeration)', () => {
    const resultado = mensajeDeErrorCatalogo(http(400, 'NOMBRE_INVALIDO'));
    expect(resultado).not.toBe('NOMBRE_INVALIDO');
  });

  // MCTG-06 — type-level absence proofs (judgment-anticipated class 3, T5a.5):
  // The three Google-only codes are ABSENT from CodigoCatalogo — not a runtime
  // check but a compile-time guarantee. Each @ts-expect-error MUST trigger a tsc
  // error; if it does not, tsc itself fails (that is the proof working).
  it('MCTG-06: los tres códigos Google-only son ausentes de CodigoCatalogo — type-level proof', () => {
    // Paired positive: a real member IS in CodigoCatalogo (anchor the test).
    const _real: CodigoCatalogo = 'NOMBRE_INVALIDO';
    void _real;

    // Compile-time absence proofs: each line below MUST trigger a TypeScript error.
    // If any @ts-expect-error is NOT followed by an actual error, tsc itself fails —
    // that is the point of the test (T5a.5, design §1.9).

    // @ts-expect-error — VINCULO_REQUIERE_PASSWORD is Google-only, not in CodigoCatalogo
    const _a: CodigoCatalogo = 'VINCULO_REQUIERE_PASSWORD';
    // @ts-expect-error — GOOGLE_YA_VINCULADO is Google-only, not in CodigoCatalogo
    const _b: CodigoCatalogo = 'GOOGLE_YA_VINCULADO';
    // @ts-expect-error — GOOGLE_NO_DISPONIBLE is Google-only, not in CodigoCatalogo
    const _c: CodigoCatalogo = 'GOOGLE_NO_DISPONIBLE';

    // Suppress unused-variable warnings without touching the type check above
    void _a;
    void _b;
    void _c;
  });
});

describe('ETIQUETA_MATCH_TYPE', () => {
  it.each<readonly [string, string]>([
    ['CONTAINS', 'CONTIENE'],
    ['STARTS_WITH', 'EMPIEZA CON'],
    ['REGEX', 'REGEX'],
  ])('%s → etiqueta %s', (matchType, etiqueta) => {
    expect(
      ETIQUETA_MATCH_TYPE[matchType as keyof typeof ETIQUETA_MATCH_TYPE],
    ).toBe(etiqueta);
  });

  it('es total sobre los tres MATCH_TYPES de catalogo-constantes', () => {
    for (const matchType of MATCH_TYPES) {
      expect(ETIQUETA_MATCH_TYPE[matchType]).toBeDefined();
    }
  });
});
