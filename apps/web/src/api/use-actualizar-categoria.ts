import { useMutation, useQueryClient } from '@tanstack/react-query';
import { patchCategoria } from './categorias';
import type { CategoriaPatch } from './categorias';
import type { ApiError } from './client';
import { invalidarCatalogoYDashboard } from './categorias-invalidacion';

/**
 * useActualizarCategoria — `useMutation` for `PATCH /api/categorias/:id`
 * (US-043 design.md §1/Q3b/Q5b, WCTG-04, WCTG-09). `EditarCategoria` (PR
 * #3b) is the only caller: submitting `#form-identidad` (a rename, a
 * bucket-change, or both) and confirming a bucket-change impact dialog both
 * go through this ONE hook — the caller decides whether to gate the call
 * behind `ConfirmarImpactoDialog` first (design.md §1/Q3b mechanism 1).
 *
 * `mutationFn` delegates to `patchCategoria` and throws `result.error` on
 * failure — same `useEliminarIngesta`/`useCrearCategoria` idiom (one HTTP
 * call, one failure shape, no result union to model).
 *
 * Profile B (`invalidarCatalogoYDashboard`) UNCONDITIONALLY — **including a
 * rename-only patch** (design.md §1/Q5b: `['detalle-bucket-mes']` is not
 * over-invalidation for a rename, the grouped drill-down endpoint groups
 * transactions by `tx.categoria?.nombre`, so a rename changes what the
 * bucket drill-down displays). This hook does NOT branch on which fields
 * changed — the caller (`EditarCategoria`) is the one that decides whether
 * a bucket-change needs the impact dialog FIRST; once `mutate` is called
 * here, the invalidation is always the full profile B.
 */
export function useActualizarCategoria() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    ApiError,
    { readonly id: string; readonly patch: CategoriaPatch }
  >({
    mutationFn: async ({ id, patch }) => {
      const result = await patchCategoria(id, patch);
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: () => {
      invalidarCatalogoYDashboard(queryClient);
    },
  });
}
