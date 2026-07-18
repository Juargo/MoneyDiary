import { redirect } from '@tanstack/react-router'
import type { ApiResult } from '@/api/client'
import type { MeDto } from '@/api/types'

/**
 * requireSession — pure `beforeLoad` guard logic for the `_authenticated`
 * pathless layout (AUTH-10, design.md §6.1). Extracted into its own module
 * so it's unit-testable without a live TanStack Router context: a
 * `createFileRoute`'s `beforeLoad` runs inside a route, this helper doesn't
 * need one — it only needs a `fetchMe`-shaped function, injected so the
 * spec never touches a live `fetch` or router.
 *
 * `unauthorized` → `throw redirect({ to: '/login' })` (TanStack Router's
 * documented pattern: `redirect()` returns a `Response`, callers throw it).
 * `ok` → resolves, letting the protected route's own loader/component run.
 */
export async function requireSession(fetchMe: () => Promise<ApiResult<MeDto>>): Promise<void> {
  const result = await fetchMe()
  if (!result.ok) {
    throw redirect({ to: '/login' })
  }
}
