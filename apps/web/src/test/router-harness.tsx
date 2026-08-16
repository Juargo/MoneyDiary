import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';

/**
 * Minimal, throwaway router for component tests that render a `<Link>`
 * (`SemaforoTag`, T9 — and transitively `ResumenScreen` once T11 composes
 * it) — NOT the app's real generated `routeTree.gen.ts` (design §4.4). A
 * root route renders whatever `ui` the caller passes in; a `/semaforo`
 * route renders a sentinel so navigating there resolves instead of
 * throwing mid-test. No auth, no `_authenticated` layout, no
 * `normalizarPeriodo` reuse — those are exercised at the route-tree
 * integration layer (`src/test/semaforo-route.test.tsx`, T12), not here.
 *
 * Excluded from coverage: matches this directory's existing `src/test/**`
 * exclusion (test infrastructure, not implementation under test — no
 * assertions live in this file).
 */
export function renderConRouter(
  ui: ReactElement,
  { initialPath = '/' }: { readonly initialPath?: string } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => ui,
  });
  const semaforoRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/semaforo',
    validateSearch: (
      search: Record<string, unknown>,
    ): { periodo?: string } => ({
      periodo: typeof search.periodo === 'string' ? search.periodo : undefined,
    }),
    component: () => (
      <div data-testid="semaforo-sentinel">Semáforo (stub de prueba)</div>
    ),
  });

  const routeTree = rootRoute.addChildren([indexRoute, semaforoRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
