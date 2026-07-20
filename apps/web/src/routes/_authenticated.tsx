import { createFileRoute, Outlet } from '@tanstack/react-router'
import { fetchMe } from '@/api/auth'
import { requireSession } from '@/lib/require-session'
import { DemoBanner } from '@/components/DemoBanner'
import { AppShell } from '@/components/app-shell/AppShell'

/**
 * Pathless protected layout (AUTH-10, design.md §6.1): every route nested
 * under `_authenticated/` runs `requireSession(fetchMe, location.href)` in
 * `beforeLoad` before rendering — an `unauthorized` result throws a redirect
 * to `/login`, carrying the current internal path (`location.href` —
 * TanStack Router's pathname+search+hash, NOT a full absolute URL) as the
 * `redirect` search param so `/login` can send the user back afterward (see
 * `lib/require-session.ts`, unit-tested there since a live router context
 * can't be cheaply constructed for a `beforeLoad` test here — the
 * integration test at `test/redirect-after-login.test.tsx` covers the
 * end-to-end round trip through the real generated route tree; it lives
 * outside `routes/` on purpose, since the TanStack Router Vite plugin scans
 * every file under `routes/` as a route candidate).
 *
 * demo-trial-mode (DEMO-UI-02): `requireSession` now resolves with the
 * fetched `MeDto` on success (instead of discarding it to `void`), so
 * `esDemo` is threaded into this route's `context` here — the ONLY
 * `fetchMe()` call for this layout. `component` reads it back via
 * `Route.useRouteContext()` to conditionally mount `<DemoBanner>`; this
 * satisfies "MUST NOT make an additional API call" (see
 * `test/demo-banner-layout.test.tsx` for the end-to-end proof, same pattern
 * as `redirect-after-login.test.tsx`).
 *
 * `AppShell` (responsive nav shell, `web-dashboard-redesign-mobile`
 * design.md §5) is mounted here — NOT in `__root.tsx` — because this
 * pathless layout is the exact logged-in boundary: everything nested under
 * `_authenticated/` gets the sidebar/bottom-tabs chrome, and `/login`
 * (outside this layout) never does, with no extra path guard needed. See
 * `test/app-shell-layout.test.tsx` for the end-to-end proof (real route
 * tree, same pattern as the two tests above).
 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const me = await requireSession(fetchMe, location.href)
    return { esDemo: me.esDemo }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { esDemo } = Route.useRouteContext()
  return (
    <AppShell>
      <DemoBanner esDemo={esDemo} />
      <Outlet />
    </AppShell>
  )
}
