/**
 * mensajes-catalogo.ts (US-044 PR5a, T5a.6)
 *
 * Ported from `apps/web/src/components/configuracion/categorias/mensajes-catalogo.ts:33-163`
 * with two mobile-specific adaptations:
 *
 * 1. Tag adaptation (D-05): mobile's `ApiError` uses `{ tag: 'http' }` where
 *    web uses `{ tag: 'server' }` and `{ tag: 'invalid' }`. The `http` tag
 *    covers all non-2xx responses (both the 4xx/5xx "server" cases and any
 *    status that web would call "invalid").
 *
 * 2. `unauthorized` resolution (D-08/D-16): web maps `unauthorized → ''`
 *    because the `_authenticated` layout guard redirects before the screen
 *    renders. Mobile has no in-screen 401 interception — the existing
 *    convention is to render `copiaPorApiError`'s message (design §1.7).
 *
 * Totality:
 * - `COPY: Record<CodigoCatalogo, string>` enforces that every `CodigoCatalogo`
 *   member has a row at the definition site (tsc-enforced, no `switch` needed).
 * - `mensajeDeErrorCatalogo` is closed with `const _exhaustive: never` so a
 *   new `ApiError` tag fails `tsc` (design §1.7's totality discipline).
 *
 * `ETIQUETA_BUCKET` and `etiquetaTransacciones` are NOT imported here — they
 * belong to PR6b's `impacto-catalogo.ts`, not this module.
 *
 * Pure: no React, no fetch, no env.
 */

import type { ApiError } from './api-error';
import { copiaPorApiError } from './api-error';
import type { MatchType } from './catalogo-constantes';

/**
 * CodigoCatalogo — the closed literal union of the 12 codes the deployed
 * catalog API returns (ported verbatim from web's mensajes-catalogo.ts:62-74).
 * 12 members in total. Google-only perfil codes
 * (VINCULO_REQUIERE_PASSWORD/GOOGLE_YA_VINCULADO/GOOGLE_NO_DISPONIBLE) are
 * NOT members — mobile never calls the Google-link endpoints (design §1.9).
 */
export type CodigoCatalogo =
  | 'NOMBRE_INVALIDO'
  | 'BUCKET_NO_ASIGNABLE'
  | 'PATRON_INVALIDO'
  | 'MATCH_TYPE_INVALIDO'
  | 'REGEX_INVALIDA'
  | 'PRIORIDAD_INVALIDA'
  | 'BODY_INVALIDO'
  | 'DEMO_SOLO_LECTURA'
  | 'CATEGORIA_NO_ENCONTRADA'
  | 'PATRON_NO_ENCONTRADO'
  | 'NOMBRE_DUPLICADO'
  | 'PATRON_DUPLICADO';

/**
 * ETIQUETA_MATCH_TYPE — `MatchType` → UI label (ported from web's
 * mensajes-catalogo.ts:43-47). A `Record<MatchType, string>` so a new
 * `MatchType` member fails `tsc` until this row is added.
 */
export const ETIQUETA_MATCH_TYPE: Record<MatchType, string> = {
  CONTAINS: 'CONTIENE',
  STARTS_WITH: 'EMPIEZA CON',
  REGEX: 'REGEX',
};

const GENERICO = 'Ocurrió un error inesperado. Intenta nuevamente.';

/**
 * COPY — the 12-row table, verbatim from web's mensajes-catalogo.ts:90-105.
 *
 * Notes preserved from web:
 * - `BUCKET_NO_ASIGNABLE` says `Gustos`, not `Deseos` — A1 applies to error
 *   copy too.
 * - `PRIORIDAD_INVALIDA` is UNREACHABLE from this UI (no control sends
 *   `prioridad`). The row exists so a future control doesn't silently fall
 *   to GENERICO.
 * - `DEMO_SOLO_LECTURA` is a DEFENSIVE row (CQ-4) — the demo feature is not
 *   proactively surfaced on mobile, but if a 403 DEMO_SOLO_LECTURA arrives,
 *   it maps to this honest string rather than the generic fallback.
 */
const COPY: Record<CodigoCatalogo, string> = {
  NOMBRE_INVALIDO: 'El nombre debe tener entre 1 y 40 caracteres.',
  BUCKET_NO_ASIGNABLE: 'Elige un bucket: Necesidades, Gustos o Ahorro.',
  PATRON_INVALIDO: 'El patrón debe tener entre 1 y 200 caracteres.',
  MATCH_TYPE_INVALIDO: 'Elige un tipo de coincidencia válido.',
  REGEX_INVALIDA: 'Esa expresión regular no es válida.',
  PRIORIDAD_INVALIDA: 'La prioridad debe ser un número entre 1 y 999.',
  BODY_INVALIDO:
    'No se pudo procesar la solicitud. Revisa los datos e intenta nuevamente.',
  DEMO_SOLO_LECTURA:
    'Estás en una cuenta de demostración. Crea una cuenta real para editar tus categorías.',
  CATEGORIA_NO_ENCONTRADA:
    'Esa categoría ya no existe. Vuelve a la lista y recarga.',
  PATRON_NO_ENCONTRADO: 'Ese patrón ya no existe. Vuelve y recarga.',
  NOMBRE_DUPLICADO: 'Ya tienes una categoría con ese nombre en ese bucket.',
  PATRON_DUPLICADO: 'Ya tienes un patrón con ese texto.',
};

/**
 * mensajeDeErrorCatalogo — resolves by axis (D-08):
 * - Transport tags (`network` / `unauthorized` / `parse`) → `copiaPorApiError`
 *   (the cross-screen transport copy this app already owns in one place).
 * - `http` + known `code` → the ported COPY table (the parity surface).
 * - `http` + unknown/absent `code` → GENERICO.
 *
 * `parse` maps to `COPY.BODY_INVALIDO`, consistent with how web handles it
 * (both a `tag: 'parse'` from `fetchCatalogo` and a `tag: 'http', code:
 * 'BODY_INVALIDO'` from a mutation produce the same message — two producers,
 * one copy string, same as web's mensajes-catalogo.ts).
 *
 * Closed with `const _exhaustive: never` so a new `ApiError` tag fails `tsc`.
 */
export function mensajeDeErrorCatalogo(error: ApiError): string {
  switch (error.tag) {
    case 'network':
      return copiaPorApiError(error);
    case 'unauthorized':
      // D-16: mobile has no in-screen 401 interception — use the shared
      // transport copy rather than '' (which would render nothing on mobile).
      return copiaPorApiError(error);
    case 'parse':
      // The same string `BODY_INVALIDO` maps to both `tag: 'parse'` (when
      // fetchCatalogo rejects a 2xx body) and `tag: 'http', code:
      // 'BODY_INVALIDO'` (when the backend rejects a mutation body) — two
      // real producers, one copy string, both intentional.
      return COPY.BODY_INVALIDO;
    case 'http':
      return error.code !== undefined && Object.hasOwn(COPY, error.code)
        ? COPY[error.code as CodigoCatalogo]
        : GENERICO;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}
