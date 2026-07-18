import { createFileRoute, Outlet } from '@tanstack/react-router'
import { fetchMe } from '@/api/auth'
import { requireSession } from '@/lib/require-session'

/**
 * Pathless protected layout (AUTH-10, design.md §6.1): every route nested
 * under `_authenticated/` runs `requireSession(fetchMe)` in `beforeLoad`
 * before rendering — an `unauthorized` result throws a redirect to `/login`
 * (see `lib/require-session.ts`, unit-tested there since a live router
 * context can't be cheaply constructed for a `beforeLoad` test here).
 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: () => requireSession(fetchMe),
  component: () => <Outlet />,
})
