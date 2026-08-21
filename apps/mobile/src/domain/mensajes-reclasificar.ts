/**
 * mensajes-reclasificar (US-056, D-21).
 *
 * Closed error table for the reclassify endpoint
 * (`PATCH /api/transacciones/:id/categoria`). Structured like
 * `mensajes-catalogo.ts` but for a disjoint error vocabulary.
 *
 * Both the 400 and 404 responses have `content?: never`
 * (packages/api-client/src/types.gen.ts:1754-1766) — the body is ALWAYS
 * absent, so there is NO error `code` to read. The switch branches on HTTP
 * status only, not on a code field. `CATEGORIA_DESCONOCIDA` is NOT in this
 * table (it was a web-layer string, not a wire response code).
 *
 * Totality: closed with `const _exhaustive: never` so a new `ApiError` tag
 * fails `tsc` (same discipline as mensajes-catalogo.ts).
 *
 * Pure: no React, no fetch, no env.
 */

import type { ApiError } from './api-error';
import { copiaPorApiError } from './api-error';

/**
 * Returns the user-facing Spanish copy for a reclassify API error.
 * - `{ tag: 'http', status: 400 }` — no body, no code → invalid-category copy
 * - `{ tag: 'http', status: 404 }` → tx-not-found copy
 * - transport tags (`network`/`unauthorized`/`parse`) → `copiaPorApiError`
 * - other http statuses → `copiaPorApiError`
 */
export function mensajeDeErrorReclasificar(error: ApiError): string {
  switch (error.tag) {
    case 'http':
      if (error.status === 400) {
        return 'La categoría elegida no es válida. Elige otra.';
      }
      if (error.status === 404) {
        return 'Ese movimiento ya no existe. Vuelve al resumen y recarga.';
      }
      return copiaPorApiError(error);
    case 'network':
    case 'unauthorized':
    case 'parse':
      return copiaPorApiError(error);
    default: {
      const _exhaustive: never = error;
      return copiaPorApiError(_exhaustive);
    }
  }
}
