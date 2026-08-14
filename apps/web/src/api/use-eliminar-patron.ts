import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deletePatron } from './categorias';
import type { ApiError } from './client';
import { invalidarCatalogo } from './categorias-invalidacion';

/**
 * useEliminarPatron — `useMutation` for `DELETE /api/patrones/:id` (US-043
 * PR #4, design.md §1/Q9b, WCTG-04, WCTG-09). `PatronFila`'s delete icon
 * fires this with **no confirmation dialog** — a pattern carries no impact
 * (it touches no persisted transaction, `CAT038-04` does not apply; a
 * confirmation for a reversible one-field edit is friction, not safety).
 *
 * `mutationFn` delegates to `deletePatron` and throws `result.error` on
 * failure — same idiom as every other mutation hook in this feature.
 *
 * Profile A (`invalidarCatalogo`) ONLY — see `use-crear-patron.ts`'s
 * docblock for why.
 */
export function useEliminarPatron() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: async (id) => {
      const result = await deletePatron(id);
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: () => {
      invalidarCatalogo(queryClient);
    },
  });
}
