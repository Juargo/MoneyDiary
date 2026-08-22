import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postCommitIngesta } from './client';
import type { ApiError } from './client';
import type { CommitIngestaDto } from './types';

/**
 * useCommitIngesta — POST /api/ingestas/commit (US-059 PR1, D-05).
 *
 * Mutation variables: `{ file: File; edits: ReadonlyArray<{ rowIndex: number;
 * categoriaId: string | null }> }` — both are required to call the commit
 * endpoint (the edits overlay is always sent, even when empty).
 *
 * `mutationFn` mirrors `useIngesta` and `usePreviewIngesta`: calls
 * `postCommitIngesta`, unwraps `ApiResult`, or throws `result.error` so
 * TanStack sees a typed `ApiError` in `mutation.error` (never a raw throw).
 *
 * `onSuccess`: invalidates the 4 query keys that become stale after a
 * successful commit — `['resumen']`, `['resumen-anual']`,
 * `['detalle-bucket-mes']`, `['ingestas']`. The fourth key (`['ingestas']`)
 * is new vs `useIngesta` — committing an import adds a new ingesta row, so
 * the historial list must refresh. Navigation to `/` is wired at the call site
 * in `SubirCartola` (`mutate(vars, { onSuccess: () => navigate({to:'/'}) })`)
 * so this hook stays router-agnostic and testable without a router mock (D-05).
 */
export function useCommitIngesta() {
  const queryClient = useQueryClient();

  return useMutation<
    CommitIngestaDto,
    ApiError,
    {
      file: File;
      edits: ReadonlyArray<{ rowIndex: number; categoriaId: string | null }>;
    }
  >({
    mutationFn: async ({ file, edits }) => {
      const result = await postCommitIngesta(file, edits);
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumen'] });
      queryClient.invalidateQueries({ queryKey: ['resumen-anual'] });
      queryClient.invalidateQueries({ queryKey: ['detalle-bucket-mes'] });
      queryClient.invalidateQueries({ queryKey: ['ingestas'] });
    },
  });
}
