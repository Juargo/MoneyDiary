import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteCategoria } from './categorias';
import type { ApiError } from './client';
import { invalidarCatalogoYDashboard } from './categorias-invalidacion';

/**
 * useEliminarCategoria — `useMutation` for `DELETE /api/categorias/:id`
 * (US-043 design.md §1/Q6d, WCTG-08, WCTG-09). Reused by BOTH delete entry
 * points (`CategoriaFila`'s list-row icon, PR #5; `EditarCategoria`'s
 * footer button, this PR) — one hook, one `ConfirmarImpactoDialog` shape,
 * only the post-success behaviour differs at the call site (the list row's
 * dialog just closes via invalidation; the edit screen navigates back).
 *
 * `mutationFn` delegates to `deleteCategoria` and throws `result.error` on
 * failure — same idiom as every other mutation hook in this feature.
 *
 * `deleteCategoria` ALWAYS answers `204` for the caller's own row (decision
 * 5, `CAT038-04`) — **no `409` branch exists here and none should be
 * written**; a `409` (if it somehow arrived) falls through to the generic
 * `isError` path, exactly like any other undistinguished status
 * (`use-eliminar-categoria.test.tsx` asserts this explicitly, mirroring
 * `categorias.test.ts`'s client-level assertion at the hook level).
 *
 * Profile B (`invalidarCatalogoYDashboard`): deleting a category is a
 * mutation of CATEGORÍA, and its transactions fold to `Sin categoría`
 * across all periods — the dashboard's 50/30/20 split changes.
 */
export function useEliminarCategoria() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: async (id) => {
      const result = await deleteCategoria(id);
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
