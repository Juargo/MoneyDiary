import { createFileRoute, Outlet } from '@tanstack/react-router'
import { fetchMe } from '@/api/auth'
import { requireSession } from '@/lib/require-session'

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
 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => requireSession(fetchMe, location.href),
  component: () => <Outlet />,
})
