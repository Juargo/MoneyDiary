import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routeTree } from '@/routeTree.gen';
import type { MeDto } from '@/api/types';

/**
 * Route-tree integration proof for US-047 WG5-09 (T12), using the REAL
 * generated route tree (same pattern as `configuracion-entry-points.test.tsx`
 * / `redirect-after-login.test.tsx`): `/semaforo` is a genuinely registered
 * route (not just a component that COULD render), session-protected for free
 * by the existing `_authenticated` guard, and never presents a dead-end
 * (blank page or 404) between this change shipping and US-049 landing.
 */
const ME_DTO: MeDto = {
  userId: 'user-1',
  email: 'usuario@moneydiary.cl',
  esDemo: false,
  nombre: 'Usuario de Prueba',
  googleVinculado: false,
};

function buildFetchStub(authenticated: boolean) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.startsWith('/api/auth/me')) {
      return authenticated
        ? { ok: true, status: 200, json: () => Promise.resolve(ME_DTO) }
        : { ok: false, status: 401, json: () => Promise.resolve({}) };
    }

    // Any other call is irrelevant to this test, which only asserts on
    // navigation/rendered content of the stub route itself.
    return { ok: false, status: 401, json: () => Promise.resolve({}) };
  });
}

function renderApp(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return router;
}

describe('/semaforo stub route (real route tree, WG5-09)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('navigating to /semaforo (authenticated) resolves and renders the explicit "en construcción" state, not blank or a 404', async () => {
    vi.stubGlobal('fetch', buildFetchStub(true));

    const router = renderApp('/semaforo?periodo=2026-07');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/semaforo'),
    );
    expect(
      await screen.findByRole('heading', { name: 'Semáforo' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/en construcción/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Volver al resumen' }),
    ).toBeInTheDocument();
  });

  it('redirects an unauthenticated visit to /login?redirect=/semaforo, via the existing _authenticated guard, no new guard code', async () => {
    vi.stubGlobal('fetch', buildFetchStub(false));

    const router = renderApp('/semaforo');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toEqual({ redirect: '/semaforo' });
  });
});
