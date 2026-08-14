import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postPatron } from './categorias';
import type { PatronInput } from './categorias';
import type { ApiError } from './client';
import { invalidarCatalogo } from './categorias-invalidacion';

/**
 * useCrearPatron — `useMutation` for `POST /api/patrones` (US-043 PR #4,
 * design.md §1/Q9b, WCTG-04, WCTG-09). `PatronFila`'s blank appended row is
 * the only caller: its first commit (blur-or-Enter) is a `POST`, every
 * commit after that is a `PATCH` (`useActualizarPatron`).
 *
 * `mutationFn` delegates to `postPatron` and throws `result.error` on
 * failure — same idiom as every other mutation hook in this feature.
 *
 * Profile A (`invalidarCatalogo`) ONLY — a pattern mutation touches no
 * persisted transaction, so the dashboard keys are deliberately excluded
 * (design.md §1/Q5, WCTG-09's exclusion scenario).
 */
export function useCrearPatron() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, PatronInput>({
    mutationFn: async (input) => {
      const result = await postPatron(input);
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
