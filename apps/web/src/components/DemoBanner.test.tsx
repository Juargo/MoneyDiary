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
import { DemoBanner } from './DemoBanner';

// demo-trial-mode (DEMO-UI-02, DEMO-UI-04): a prop-driven, presentational
// banner. `_authenticated.tsx` decides WHETHER to pass `esDemo: true` (from
// the cached `MeDto.esDemo` in route context — no extra fetch, DEMO-UI-02
// "Banner drives from auth context"), `DemoBanner` decides whether that
// makes it visible. Dismissal is in-memory `useState` (design.md open
// question, resolved: SessionScope) — the banner remounts fresh on the next
// real session (logout unmounts `_authenticated`, a fresh demo session
// remounts it), so no localStorage/sessionStorage persistence is needed.
//
// "Salir del demo" needs a Router (useNavigate) and a QueryClient
// (useQueryClient), so every render below goes through a small real router
// + QueryClientProvider — same pattern as `LoginForm.test.tsx`.
function mockFetchOnce(response: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderDemoBanner(esDemo: boolean) {
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <DemoBanner esDemo={esDemo} />,
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
  const { unmount } = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient, unmount };
}

describe('DemoBanner', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is visible for a demo user (esDemo=true)', async () => {
    await renderDemoBanner(true);

    expect(
      screen.getByRole('status', { name: /aviso de modo demo/i }),
    ).toHaveTextContent(/modo demo/i);
    expect(
      screen.getByRole('link', { name: /crear cuenta/i }),
    ).toBeInTheDocument();
  });

  it('does NOT render for a real user (esDemo=false)', async () => {
    await renderDemoBanner(false);

    expect(
      screen.queryByRole('status', { name: /aviso de modo demo/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /crear cuenta/i }),
    ).not.toBeInTheDocument();
  });

  it('hides immediately after clicking the dismiss button', async () => {
    await renderDemoBanner(true);
    expect(
      screen.getByRole('status', { name: /aviso de modo demo/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /cerrar aviso de modo demo/i }),
    );

    expect(
      screen.queryByRole('status', { name: /aviso de modo demo/i }),
    ).not.toBeInTheDocument();
  });

  // DEMO-UI-04 "reappears on new session": dismissal is deliberately
  // in-memory `useState`, NOT persisted to localStorage/sessionStorage (see
  // component doc). This proves the `descartado` state does not leak across
  // mounts through any shared/module-level/persisted storage — a fresh
  // mount (the real-world equivalent of `_authenticated` remounting on a
  // new session) always starts undismissed.
  it('does not leak dismissal across mounts — a fresh instance shows the banner again', async () => {
    const { unmount } = await renderDemoBanner(true);
    fireEvent.click(
      screen.getByRole('button', { name: /cerrar aviso de modo demo/i }),
    );
    expect(
      screen.queryByRole('status', { name: /aviso de modo demo/i }),
    ).not.toBeInTheDocument();
    unmount();

    await renderDemoBanner(true);

    expect(
      screen.getByRole('status', { name: /aviso de modo demo/i }),
    ).toBeInTheDocument();
  });

  it('renders a "Salir del demo" action', async () => {
    await renderDemoBanner(true);

    expect(
      screen.getByRole('button', { name: 'Salir del demo' }),
    ).toBeInTheDocument();
  });

  it('"Salir del demo": calls postLogout, clears the query cache, and navigates to /login', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200 });
    const { router, queryClient } = await renderDemoBanner(true);
    queryClient.setQueryData(['resumen', '2026-08'], { esDemo: true });
    // Same call-order proof as `LoginForm.test.tsx`: `useNavigate()` delegates
    // to `router.navigate` at call time, so `invocationCallOrder` shows the
    // cache is cleared BEFORE navigating (final state alone would still pass
    // if the two were reordered).
    const clearSpy = vi.spyOn(queryClient, 'clear');
    const navigateSpy = vi.spyOn(router, 'navigate');

    fireEvent.click(screen.getByRole('button', { name: 'Salir del demo' }));

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

  it('"Salir del demo": still clears the cache and navigates to /login when logout responds non-2xx (500)', async () => {
    mockFetchOnce({ ok: false, status: 500 });
    const { router, queryClient } = await renderDemoBanner(true);
    queryClient.setQueryData(['resumen', '2026-08'], { esDemo: true });

    fireEvent.click(screen.getByRole('button', { name: 'Salir del demo' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByText('pantalla de login')).toBeInTheDocument();
    expect(queryClient.getQueryData(['resumen', '2026-08'])).toBeUndefined();
  });

  it('"Salir del demo": still clears the cache and navigates to /login even when the logout request fails (network error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );
    const { router, queryClient } = await renderDemoBanner(true);
    queryClient.setQueryData(['resumen', '2026-08'], { esDemo: true });

    fireEvent.click(screen.getByRole('button', { name: 'Salir del demo' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByText('pantalla de login')).toBeInTheDocument();
    expect(queryClient.getQueryData(['resumen', '2026-08'])).toBeUndefined();
  });
});
