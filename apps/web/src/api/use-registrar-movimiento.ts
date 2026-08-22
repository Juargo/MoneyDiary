import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postMovimientoManual } from './movimientos';
import type { RegistrarMovimientoManualInput } from './movimientos';
import type { ApiError } from './client';
import type { RegistrarMovimientoManualDto } from './types';

/**
 * useRegistrarMovimiento — POST /api/movimientos (US-060, D-05).
 *
 * Mutation variables: `RegistrarMovimientoManualInput` — the discriminated union
 * on `tipo` (Ingreso | Gasto). The request body is BUILT by the component's
 * `construirBody()` function and passed directly as variables (D-01/D-07).
 *
 * `mutationFn` mirrors `useCommitIngesta`: calls `postMovimientoManual`, unwraps
 * `ApiResult`, or throws `result.error` so TanStack sees a typed `ApiError` in
 * `mutation.error` (never a raw throw). Router-agnostic — no navigation here.
 *
 * `onSuccess`: invalidates the 4 query keys that become stale after a successful
 * manual movement:
 *   - `['resumen']`           — monthly 50/30/20 totals change
 *   - `['resumen-anual']`     — annual summary changes
 *   - `['detalle-bucket-mes']` — bucket detail list changes
 *   - `['ingresos-mes']`      — an Ingreso changes the month's income total
 *
 * The 4th key is `['ingresos-mes']`, NOT `['ingestas']` — a manual movement does
 * NOT create an ingesta row (no file upload, `origen="Manual"`), but an Ingreso
 * movement DOES change the ingresos detail (US-054). All 4 keys are invalidated
 * regardless of `tipo` — a Gasto over-invalidates `['ingresos-mes']` harmlessly
 * (simpler than conditional invalidation, D-05 / exploration R-08).
 *
 * Navigation (to `/` or anywhere else) is the CALL SITE's responsibility — the
 * component may pass an `onSuccess` callback to `mutation.mutate(body, { onSuccess })`.
 * This keeps the hook router-agnostic and testable with a plain `QueryClientProvider`.
 */
export function useRegistrarMovimiento() {
  const queryClient = useQueryClient();

  return useMutation<
    RegistrarMovimientoManualDto,
    ApiError,
    RegistrarMovimientoManualInput
  >({
    mutationFn: async (vars) => {
      const result = await postMovimientoManual(vars);
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumen'] });
      queryClient.invalidateQueries({ queryKey: ['resumen-anual'] });
      queryClient.invalidateQueries({ queryKey: ['detalle-bucket-mes'] });
      queryClient.invalidateQueries({ queryKey: ['ingresos-mes'] });
    },
  });
}
