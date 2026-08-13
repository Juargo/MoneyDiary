import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import type { QueryClient } from '@tanstack/react-query';

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
  return (
    <>
      <Outlet />
      {import.meta.env.DEV && (
        <>
          <TanStackRouterDevtools position="bottom-right" />
          <ReactQueryDevtools buttonPosition="bottom-left" />
        </>
      )}
    </>
  );
}
