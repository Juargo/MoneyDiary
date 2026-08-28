import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { deleteIngesta } from './client';
import type { ApiError } from './client';

/**
 * `eliminarIngesta` — the shared `mutationFn` behind BOTH
 * `useEliminarIngesta` (per-row) and `useEliminarIngestaMasiva` (bulk):
 * delegates to `deleteIngesta` and throws `result.error` on failure, same
 * pattern as `useIngesta` (upload) — TanStack sees a typed `ApiError` on
 * `mutation.error`, never a raw throw. Extracted so the two hooks below
 * can't drift on the request itself while differing only in cache
 * invalidation (DRY).
 */
async function eliminarIngesta(id: string): Promise<void> {
  const result = await deleteIngesta(id);
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}

/**
 * `invalidarCachesIngesta` — the exact 4-key invalidation `useEliminarIngesta`
 * fires on success (`resumen`, `resumen-anual`, `detalle-bucket-mes`,
 * `ingestas`). Extracted (4R review fix, R4-WARNING invalidation storm) so
 * `useSeleccionMasivaIngestas` can call it ONCE after a whole sequential
 * bulk-delete run instead of each of the N deletes triggering its own
 * 4-key invalidation (4×N overlapping refetches).
 */
export function invalidarCachesIngesta(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['resumen'] });
  queryClient.invalidateQueries({ queryKey: ['resumen-anual'] });
  queryClient.invalidateQueries({ queryKey: ['detalle-bucket-mes'] });
  queryClient.invalidateQueries({ queryKey: ['ingestas'] });
}

/**
 * useEliminarIngesta — `useMutation` para DELETE /api/ingestas/:id
 * (`us-018-eliminar-ingesta` Slice 2, design.md §7.2, ING-06).
 *
 * Al tener éxito invalida EXACTAMENTE 4 cachés vía `invalidarCachesIngesta`
 * — las 3 que `useIngesta` (upload) ya invalida (`resumen`, `resumen-anual`,
 * `detalle-bucket-mes`) MÁS `ingestas`, porque a diferencia de subir un
 * archivo, borrar una ingesta también muta la lista que `useIngestas`
 * cachea. Sin `['movimientos']` — esa caché no existe en `apps/web`
 * (verificado en `useIngesta`).
 *
 * Un 404 (`deleteIngesta`, anti-enumeración) significa que la fila YA no
 * existe server-side — no es un fallo inesperado, es una lista desactualizada
 * (borrada por otra sesión, o un doble-click que ya resolvió la primera
 * request). `onError` trata ese caso como "ya se fue": invalida SOLO
 * `['ingestas']` para que la fila stale desaparezca al refetch, sin tocar
 * `resumen`/`resumen-anual`/`detalle-bucket-mes` — esas cachés ya reflejan
 * cualquier estado previo y no cambiaron por este 404 (review finding).
 * Cualquier otro error (red, 401, 5xx) no invalida nada, igual que antes.
 *
 * Used by the PER-ROW `EliminarIngestaControl` only — unchanged by the bulk
 * delete feature (4R review: keep it that way, see `useEliminarIngestaMasiva`
 * below for the bulk path).
 */
export function useEliminarIngesta() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: eliminarIngesta,
    onSuccess: () => invalidarCachesIngesta(queryClient),
    onError: (error) => {
      if (error.tag === 'server' && error.status === 404) {
        queryClient.invalidateQueries({ queryKey: ['ingestas'] });
      }
    },
  });
}

/**
 * useEliminarIngestaMasiva — the SAME `mutationFn` as `useEliminarIngesta`
 * (identical request, identical `ApiError` typing), but with NO `onSuccess`/
 * `onError` cache invalidation of its own (4R review fix, R4-WARNING
 * invalidation storm). `useSeleccionMasivaIngestas` calls this once per
 * selected id inside a sequential loop, then calls `invalidarCachesIngesta`
 * itself exactly ONCE after the whole run — batching what would otherwise be
 * N separate 4-key invalidations (4×N overlapping refetches) into one.
 *
 * No 404-specific handling either: the bulk path treats every thrown error
 * uniformly as "this id failed", surfaced via the caller's own partial-
 * failure reporting — a 404 mid-bulk-run is rare enough (another session or
 * tab deleting the same row concurrently) that a special case isn't worth
 * the complexity here (YAGNI), unlike the per-row control where it is the
 * expected shape of a double-click race.
 */
export function useEliminarIngestaMasiva() {
  return useMutation<void, ApiError, string>({
    mutationFn: eliminarIngesta,
  });
}
