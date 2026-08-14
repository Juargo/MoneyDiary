import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
 * Integration proof for US-042 WCFG-01, using the REAL generated route tree
 * (same pattern as `redirect-after-login.test.tsx` / `app-shell-layout.test.tsx`):
 * `/configuracion` is session-protected for free by `_authenticated`'s
 * existing guard, and both entry points (the `Configuración` nav item and the
 * sidebar-footer icon link) navigate to it.
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

    // Any other call (e.g. /api/resumen for the home route's own data) is
    // irrelevant to this test, which only asserts on navigation.
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

describe('/configuracion entry points and session guard (real route tree, WCFG-01)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('redirects an unauthenticated visit to /login?redirect=/configuracion', async () => {
    vi.stubGlobal('fetch', buildFetchStub(false));

    const router = renderApp('/configuracion');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toEqual({
      redirect: '/configuracion',
    });
  });

  it('redirects an unauthenticated visit to the nested categorías edit route (WCTG-01/WCFG-01 delta), via the same _authenticated guard, no new guard code', async () => {
    vi.stubGlobal('fetch', buildFetchStub(false));

    const router = renderApp('/configuracion/categorias/abc123');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toEqual({
      redirect: '/configuracion/categorias/abc123',
    });
  });

  it('navigates to /configuracion when the Configuración nav item is activated', async () => {
    vi.stubGlobal('fetch', buildFetchStub(true));

    const router = renderApp('/');

    const sidebar = await screen.findByRole('navigation', {
      name: 'Navegación principal',
    });
    const link = within(sidebar).getByRole('link', { name: 'Configuración' });
    expect(link).toHaveAttribute('href', '/configuracion');

    fireEvent.click(link);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/configuracion'),
    );
  });

  it('navigates to /configuracion when the sidebar-footer icon link is activated', async () => {
    vi.stubGlobal('fetch', buildFetchStub(true));

    const router = renderApp('/');

    const link = await screen.findByRole('link', {
      name: 'Configuración de la cuenta',
    });
    expect(link).toHaveAttribute('href', '/configuracion');

    fireEvent.click(link);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/configuracion'),
    );
  });
});
