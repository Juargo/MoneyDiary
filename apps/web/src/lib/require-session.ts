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
 * `unauthorized` → `throw redirect({ to: '/login' })`, capturing `redirectTo`
 * (the internal path the caller was trying to reach — see
 * `routes/_authenticated.tsx`, which passes the current `location.href`) as
 * the `redirect` search param, so `/login` can send the user back after a
 * successful login instead of always landing on `/`. Only captured when
 * `redirectTo` is a meaningful, non-root path — `?redirect=/` would be a
 * no-op since `/` is already the post-login default, so it's omitted
 * entirely rather than round-tripped through the URL. `redirectTo` itself is
 * NOT re-validated here: it comes straight from the router's own
 * `location.href` (never from user-controlled input), and `/login`'s
 * `validateSearch` (via `sanitizeRedirect`) is the actual security boundary
 * for anything read back OUT of the URL.
 *
 * `ok` → resolves with the fetched `MeDto` (instead of discarding it), so the
 * `_authenticated` layout can thread `esDemo` into its route `context` for
 * `DemoBanner` (demo-trial-mode, DEMO-UI-02) WITHOUT a second `fetchMe` call —
 * this is the only place that owns the guard's single `fetchMe()` round trip.
 */
export async function requireSession(
  fetchMe: () => Promise<ApiResult<MeDto>>,
  redirectTo?: string,
): Promise<MeDto> {
  const result = await fetchMe()
  if (result.ok) return result.value

  const meaningfulRedirect = redirectTo !== undefined && redirectTo !== '/' ? redirectTo : undefined

  throw redirect(
    meaningfulRedirect !== undefined
      ? { to: '/login', search: { redirect: meaningfulRedirect } }
      : { to: '/login' },
  )
}
