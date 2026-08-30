import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCerrarSesion } from './use-cerrar-sesion';

/**
 * useCerrarSesion (P0 design-hardening fix) — the shared logout semantic
 * extracted from `DemoBanner` so real-user entry points can reuse it (DRY).
 * Same harness shape as `DemoBanner.test.tsx`: the hook needs a Router
 * (`useNavigate`) and a QueryClient (`useQueryClient`), so a tiny test
 * component mounts it behind both providers, with a real `/login` route to
 * navigate to.
 */
function ArnesCerrarSesion() {
  const { cerrarSesion, cerrando } = useCerrarSesion();
  return (
    <button type="button" onClick={() => void cerrarSesion()}>
      {cerrando ? 'Cerrando sesión…' : 'Cerrar sesión'}
    </button>
  );
}

function mockFetchOnce(response: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderArnes() {
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: ArnesCerrarSesion,
  });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: () => <div>pantalla de login</div>,
  });
  const routeTree = rootRoute.addChildren([homeRoute, loginRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await router.load();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

describe('useCerrarSesion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('calls postLogout, clears the query cache, and navigates to /login', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200 });
    const { router, queryClient } = await renderArnes();
    queryClient.setQueryData(['resumen', '2026-08'], { esDemo: false });
    const clearSpy = vi.spyOn(queryClient, 'clear');
    const navigateSpy = vi.spyOn(router, 'navigate');

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/logout',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByText('pantalla de login')).toBeInTheDocument();
    expect(queryClient.getQueryData(['resumen', '2026-08'])).toBeUndefined();
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalled();
    expect(clearSpy.mock.invocationCallOrder[0]).toBeLessThan(
      navigateSpy.mock.invocationCallOrder[0],
    );
  });

  it('still clears the cache and navigates to /login when logout responds non-2xx (500)', async () => {
    mockFetchOnce({ ok: false, status: 500 });
    const { router, queryClient } = await renderArnes();
    queryClient.setQueryData(['resumen', '2026-08'], { esDemo: false });

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByText('pantalla de login')).toBeInTheDocument();
    expect(queryClient.getQueryData(['resumen', '2026-08'])).toBeUndefined();
  });

  it('still clears the cache and navigates to /login even when the logout request fails (network error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );
    const { router, queryClient } = await renderArnes();
    queryClient.setQueryData(['resumen', '2026-08'], { esDemo: false });

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByText('pantalla de login')).toBeInTheDocument();
    expect(queryClient.getQueryData(['resumen', '2026-08'])).toBeUndefined();
  });

  it('flips `cerrando` to true synchronously on invocation, disabling/relabeling the caller', async () => {
    mockFetchOnce({ ok: true, status: 200 });
    await renderArnes();

    expect(
      screen.getByRole('button', { name: 'Cerrar sesión' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(
      screen.getByRole('button', { name: 'Cerrando sesión…' }),
    ).toBeInTheDocument();
  });
});
