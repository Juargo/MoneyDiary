import {
  createRootRouteWithContext,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import type { QueryClient } from '@tanstack/react-query';
import { UndoToast } from '@/components/ui/undo-toast';
import { useFlushEliminacionAlNavegar } from '@/lib/use-flush-eliminacion-al-navegar';

/**
 * `createRootRouteWithContext<{ queryClient }>` (US-042 design.md §1/Q3b/D-07)
 * — `main.tsx:71` already passes `context: { queryClient }` to `createRouter`,
 * this just gives that context a type. The payoff: `createRouter({ routeTree })`
 * with NO `context` (as three existing route-tree tests did) becomes a `tsc`
 * error instead of a runtime `TypeError` on `undefined.setQueryData` inside
 * `_authenticated.tsx`'s `beforeLoad`.
 */
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: RootComponent,
  },
);

function RootComponent() {
  // Undo grace window (design-hardening change, resolves critique P1 "No
  // undo/grace period on any destructive action"): mounted ONCE here, not
  // per-page — `UndoToast` reads the shared `undo-manager.ts` singleton
  // directly (no props), so every one of the three delete flows
  // (`EliminarMovimientoControl`/`EliminarIngestaControl`/bulk delete in
  // `useSeleccionMasivaIngestas`) shows through the SAME toast regardless of
  // which route triggered it. `useFlushEliminacionAlNavegar` gives the
  // manager its "navigating away flushes the pending delete" behavior —
  // `location.href` as the watch key means a route change (not just an
  // unmount) also flushes, since React runs an effect's cleanup before the
  // next render's effect on a changed dependency.
  const location = useRouterState({ select: (s) => s.location.href });
  useFlushEliminacionAlNavegar(location);

  return (
    <>
      <Outlet />
      <UndoToast />
      {import.meta.env.DEV && (
        <>
          <TanStackRouterDevtools position="bottom-right" />
          <ReactQueryDevtools buttonPosition="bottom-left" />
        </>
      )}
    </>
  );
}
