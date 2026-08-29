import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteMovimiento } from './movimientos';
import { invalidarCachesMovimiento } from './movimientos-invalidacion';
import type { ApiError } from './client';

/**
 * useEliminarMovimiento — `useMutation` for DELETE /api/movimientos/:id
 * (SDD `correccion-movimientos-manuales`, PR 3, design D-03, WEB-DEL-01).
 *
 * `mutationFn` mirrors `useEliminarIngesta`/`useRegistrarMovimiento`: calls
 * `deleteMovimiento`, unwraps `ApiResult`, or throws `result.error` so
 * TanStack Query exposes a typed `ApiError` on `mutation.error` (never a raw
 * throw).
 *
 * On success invalidates EXACTLY the 4 keys `invalidarCachesMovimiento`
 * defines — the same set `useRegistrarMovimiento` already invalidates for
 * the mirror-image mutation (creating a manual movement).
 *
 * Unlike `useEliminarIngesta`, there is NO special 404 branch here: a
 * manual movement has no separate "list" cache analogous to `['ingestas']`
 * to selectively refresh on a stale-row race — `['ingresos-mes']` and
 * `['detalle-bucket-mes']` already ARE that list for this feature, and they
 * only need refreshing on an actual successful delete (KISS; D-03 does not
 * call for this special case).
 *
 * Used by the per-row `EliminarMovimientoControl` on both list surfaces
 * (`IngresosMesTable`, `GrupoMovimientos`) — no bulk variant exists for
 * manual movements (unlike ingestas' `useEliminarIngestaMasiva`), so there
 * is only the one hook.
 */
export function useEliminarMovimiento() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: async (id) => {
      const result = await deleteMovimiento(id);
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: () => invalidarCachesMovimiento(queryClient),
  });
}
