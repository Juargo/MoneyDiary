import { useMutation } from '@tanstack/react-query'
import { previewIngesta } from './client'
import type { ApiError } from './client'
import type { PreviewIngestaDto } from './types'

/**
 * usePreviewIngesta (`us-003-vista-previa` Slice 2, design.md §9.4) — faithful
 * mirror of `useIngesta`'s `mutationFn` (unwraps a successful `ApiResult` or
 * throws the tagged `ApiError`), so TanStack sees the same typed
 * `mutation.error` shape as every other mutation in this codebase.
 *
 * Deliberately does NOT call `useQueryClient()`/`invalidateQueries` (contrast
 * `useIngesta`, which invalidates 3 caches on success) — preview persists
 * nothing server-side (PREV-02), so there is nothing to invalidate. This
 * absence is the hook-level echo of CA-04 (design.md D10).
 */
export function usePreviewIngesta() {
  return useMutation<PreviewIngestaDto, ApiError, File>({
    mutationFn: async (file) => {
      const result = await previewIngesta(file)
      if (!result.ok) {
        throw result.error
      }
      return result.value
    },
  })
}
