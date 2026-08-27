import type { ReactElement } from 'react';
import { act, useState } from 'react';
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
 * (`SemaforoTag`, T9 — and transitively `ResumenScreen`, T11) — NOT the
 * app's real generated `routeTree.gen.ts` (design §4.4). A root route
 * renders whatever `ui` the caller passes in; a `/semaforo` route renders a
 * sentinel so navigating there resolves instead of throwing mid-test. No
 * auth, no `_authenticated` layout, no `normalizarPeriodo` reuse — those are
 * exercised at the route-tree integration layer
 * (`src/test/semaforo-route.test.tsx`, T12), not here.
 *
 * The returned `rerenderConRouter` (not RTL's own `rerender`, T11 addendum):
 * the index route's rendered content is a stable `Host` component that
 * re-reads a mutable `ui` box on a forced re-render — RTL's own `rerender`
 * would replace the ENTIRE tree (including the `RouterProvider` itself)
 * with just the new element, since this harness doesn't use RTL's `wrapper`
 * option; that crashes any `<Link>` inside with "useRouter must be used
 * inside a <RouterProvider>". `rerenderConRouter` instead updates `ui` in
 * place and re-renders the SAME mounted `Host` instance, matching what a
 * real parent passing a new prop down to an already-mounted child does
 * (needed by FIX 5's periodo-change-resets-selection test).
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

  let uiActual = ui;
  let forzarActualizacion: (() => void) | null = null;

  function Host() {
    const [, forzarRerender] = useState(0);
    forzarActualizacion = () => forzarRerender((n) => n + 1);
    return uiActual;
  }

  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Host,
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
  // US-049 T7.3: `SemaforoDetallePage`'s Sin categoría notice links to
  // `/buckets/$bucket` (`WSEM-05`/CA-06) — this sentinel lets that `<Link>`
  // resolve to a real destination instead of throwing mid-test, mirroring
  // the `/semaforo` sentinel above. No real `BucketDetalleMesPage` rendering
  // here — that component carries its own tests.
  const bucketRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/buckets/$bucket',
    validateSearch: (
      search: Record<string, unknown>,
    ): { periodo?: string } => ({
      periodo: typeof search.periodo === 'string' ? search.periodo : undefined,
    }),
    component: () => (
      <div data-testid="bucket-sentinel">Bucket (stub de prueba)</div>
    ),
  });
  // SemaforoHeroCard's SIN_DATOS CTA links to `/subir` — this sentinel lets
  // that `<Link>` resolve in tests instead of throwing mid-test, same
  // pattern as the `/semaforo` and `/buckets/$bucket` sentinels above.
  const subirRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/subir',
    component: () => (
      <div data-testid="subir-sentinel">Subir (stub de prueba)</div>
    ),
  });
  // AyudaPage's "¿Dónde hago…?" section links to these three — same
  // sentinel treatment as `/subir` above, added for that page's tests.
  const registrarRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/registrar',
    component: () => (
      <div data-testid="registrar-sentinel">Registrar (stub de prueba)</div>
    ),
  });
  const ingestasRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/ingestas',
    component: () => (
      <div data-testid="ingestas-sentinel">Ingestas (stub de prueba)</div>
    ),
  });
  const configuracionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/configuracion',
    component: () => (
      <div data-testid="configuracion-sentinel">
        Configuración (stub de prueba)
      </div>
    ),
  });

  const routeTree = rootRoute.addChildren([
    indexRoute,
    semaforoRoute,
    bucketRoute,
    subirRoute,
    registrarRoute,
    ingestasRoute,
    configuracionRoute,
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  const resultado = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return {
    ...resultado,
    /** See this function's own docblock above for why this exists instead of RTL's `rerender`. */
    rerenderConRouter(nuevoUi: ReactElement) {
      uiActual = nuevoUi;
      act(() => {
        forzarActualizacion?.();
      });
    },
  };
}
