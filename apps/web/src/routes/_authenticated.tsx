import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { UserRound } from 'lucide-react';
import { fetchMe } from '@/api/auth';
import { ME_QUERY_KEY, meQueryOptions } from '@/api/use-me';
import { requireSession } from '@/lib/require-session';
import { consumeSkipNextAuthRefetch } from '@/lib/skip-next-auth-refetch';
import { DemoBanner } from '@/components/DemoBanner';
import { AppShell } from '@/components/app-shell/AppShell';
import { ApiVersionBadge } from '@/components/app-shell/ApiVersionBadge';

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
 *
 * US-042 design.md §1/Q3b: `beforeLoad` primes `['auth-me']`
 * (`context.queryClient.setQueryData`) with the SAME `me` it already paid
 * for, right after `requireSession` resolves. `useMe()` (`api/use-me.ts`)
 * mounted anywhere inside the same navigation then reads a fresh cache entry
 * under the production `staleTime` and issues NO second `/api/auth/me` call
 * (WCFG-03). The return shape stays `{ esDemo: me.esDemo }` — unchanged on
 * purpose: `_authenticated/subir.tsx` reads it, and widening the route
 * context to carry the whole `me` would create a second source of truth for
 * identity (route context vs. query cache) that drifts the instant a
 * mutation invalidates the cache.
 *
 * `beforeLoad` still calls the raw `fetchMe()` on EVERY re-run — this is the
 * session guard's actual security semantics: a fresh server check on each
 * `beforeLoad`, immediate failure, no retry, no cache (an earlier PR#2 fix
 * routed this through `queryClient.ensureQueryData` instead; reverted, since
 * it silently stopped re-validating a stale-but-present `['auth-me']` entry
 * for the rest of the SPA session). The ONE exception is the single
 * self-rewrite `/configuracion`'s `?google=` cleanup effect performs
 * (`router.history.replace`, WCFG-10 Q6b): that rewrite still notifies
 * TanStack Router's `Transitioner` and re-runs `beforeLoad` — there is no
 * public API that changes the URL without doing so — for the SAME landing
 * whose identity was just fetched. `consumeSkipNextAuthRefetch`
 * (`lib/skip-next-auth-refetch.ts`) is a purpose-built one-tick guard armed
 * by only that one call site, so only that synthetic re-run reads the just-
 * primed cache instead of paying for a second `/api/auth/me`. Pinned by
 * `test/configuracion-google-aviso.test.tsx`'s task-6.2 "exactly once" test
 * and its companion "genuine navigation still refetches" test.
 *
 * The sidebar footer also carries a compact icon link to `/configuracion`
 * (US-042 WCFG-01, proposal §1: the literal "avatar" of CA-01) — icon +
 * `aria-label="Configuración de la cuenta"`, deliberately no user name
 * rendered (a name read from route context would go stale the moment the
 * user renames themselves on that very page). `AppShell`/`Sidebar.tsx` are
 * untouched: this rides the existing `sidebarFooter` prop, so the addition is
 * a one-call-site change here.
 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location, context }) => {
    const cachedMe = consumeSkipNextAuthRefetch()
      ? context.queryClient.getQueryData(meQueryOptions().queryKey)
      : undefined;
    const me = cachedMe ?? (await requireSession(fetchMe, location.href));
    context.queryClient.setQueryData(ME_QUERY_KEY, me);
    return { esDemo: me.esDemo };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { esDemo } = Route.useRouteContext();
  return (
    <AppShell
      sidebarFooter={
        <div className="flex flex-col gap-2">
          <ApiVersionBadge />
          <Link
            to="/configuracion"
            aria-label="Configuración de la cuenta"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-800"
          >
            <UserRound className="size-5" aria-hidden="true" />
          </Link>
        </div>
      }
    >
      <DemoBanner esDemo={esDemo} />
      <Outlet />
    </AppShell>
  );
}
