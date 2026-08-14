import { useMutation, useQueryClient } from '@tanstack/react-query';
import { patchPatron } from './categorias';
import type { PatronPatch } from './categorias';
import type { ApiError } from './client';
import { invalidarCatalogo } from './categorias-invalidacion';

/**
 * useActualizarPatron — `useMutation` for `PATCH /api/patrones/:id`
 * (US-043 PR #4, design.md §1/Q9b, WCTG-04, WCTG-09). `PatronFila` calls
 * this on blur-or-Enter, per row, immediately — never batched with
 * `Guardar` (WCTG-04's two independent commit surfaces).
 *
 * `mutationFn` delegates to `patchPatron` and throws `result.error` on
 * failure — same idiom as every other mutation hook in this feature.
 *
 * Profile A (`invalidarCatalogo`) ONLY — see `use-crear-patron.ts`'s
 * docblock for why.
 */
export function useActualizarPatron() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    ApiError,
    { readonly id: string; readonly patch: PatronPatch }
  >({
    mutationFn: async ({ id, patch }) => {
      const result = await patchPatron(id, patch);
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
