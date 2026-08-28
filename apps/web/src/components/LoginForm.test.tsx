import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginForm } from './LoginForm';

/**
 * LoginForm owns the actual form state + `postLogin` call + navigation on
 * success (container/presentational split — `routes/login.tsx` only wires
 * TanStack Router's `redirect` search param, same reasoning as
 * `routes/index.tsx` + `ResumenPage`). Rendered inside a real (memory)
 * router so `navigate({ to })` can be asserted the same way
 * `ResumenPage.test.tsx`'s `renderWithRouter` does for `<Link>` — this repo's
 * established pattern is to stub the global `fetch` rather than mock
 * internal modules (see `client.test.ts`/`use-resumen.test.tsx`), so the
 * same discipline is used here instead of mocking `@/api/auth`.
 */
function mockFetchOnce(response: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function renderLoginForm(redirectTo?: string) {
  const rootRoute = createRootRoute();
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: () => <LoginForm redirectTo={redirectTo} />,
  });
  const targetRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: redirectTo ?? '/',
    component: () => <div>destino</div>,
  });
  const routeTree = rootRoute.addChildren([loginRoute, targetRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/login'] }),
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

describe('LoginForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders email and password inputs and a submit button', async () => {
    await renderLoginForm();

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ingresar' }),
    ).toBeInTheDocument();
  });

  it('submit calls postLogin (via POST /api/auth/login) with the entered credentials', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ token: 't', userId: 'u', expiresAt: 'x' }),
    });
    await renderLoginForm();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'usuario@moneydiary.cl' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'secreta123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'usuario@moneydiary.cl',
            password: 'secreta123',
          }),
        }),
      ),
    );
  });

  it('shows a generic error message on failure and does not navigate away from /login', async () => {
    mockFetchOnce({ ok: false, status: 401 });
    const { router } = await renderLoginForm();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'usuario@moneydiary.cl' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'mala-clave' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Credenciales inválidas.',
    );
    expect(router.state.location.pathname).toBe('/login');
  });

  it('#206: on a 401 the submit button is re-enabled (never stuck in the loading state) and stays resubmittable', async () => {
    mockFetchOnce({ ok: false, status: 401 });
    await renderLoginForm();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'usuario@moneydiary.cl' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'mala-clave' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    // The precise symptom #206 reported: after the 401, the button must NOT
    // remain disabled (a permanent loading state). It should re-enable so the
    // user can correct the password and retry.
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled();
  });

  // ── In-button async feedback (impeccable critique round 7, P2) ─────────
  it('swaps the submit label to "Ingresando…" while submitting, and back to "Ingresar" on failure', async () => {
    let resolveFetch!: (value: {
      ok: boolean;
      status: number;
      json?: () => Promise<unknown>;
    }) => void;
    const pending = new Promise<{
      ok: boolean;
      status: number;
      json?: () => Promise<unknown>;
    }>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending));
    await renderLoginForm();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'usuario@moneydiary.cl' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'secreta123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    const boton = await screen.findByRole('button', { name: 'Ingresando…' });
    expect(boton).toBeDisabled();

    resolveFetch({ ok: false, status: 401 });

    expect(
      await screen.findByRole('button', { name: 'Ingresar' }),
    ).toBeEnabled();
  });

  it('navigates to / on success', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ token: 't', userId: 'u', expiresAt: 'x' }),
    });
    const { router } = await renderLoginForm();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'usuario@moneydiary.cl' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'secreta123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByText('destino')).toBeInTheDocument();
  });

  it('honors an optional redirect target on success', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ token: 't', userId: 'u', expiresAt: 'x' }),
    });
    const { router } = await renderLoginForm('/buckets/Necesidades');

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'usuario@moneydiary.cl' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'secreta123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/buckets/Necesidades'),
    );
  });

  it('clears the query cache on successful login, before navigating away', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ token: 't', userId: 'u', expiresAt: 'x' }),
    });
    const { router, queryClient } = await renderLoginForm();
    queryClient.setQueryData(['resumen', '2026-08'], { esDemo: true });
    expect(queryClient.getQueryData(['resumen', '2026-08'])).toBeDefined();
    // `useNavigate()` delegates to `router.navigate` at call time, so an
    // instance spy observes the component's navigation — combined with the
    // `clear` spy, `invocationCallOrder` proves clear-BEFORE-navigate (final
    // state alone would still pass if the two were reordered).
    const clearSpy = vi.spyOn(queryClient, 'clear');
    const navigateSpy = vi.spyOn(router, 'navigate');

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'usuario@moneydiary.cl' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'secreta123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(queryClient.getQueryData(['resumen', '2026-08'])).toBeUndefined();
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalled();
    expect(clearSpy.mock.invocationCallOrder[0]).toBeLessThan(
      navigateSpy.mock.invocationCallOrder[0],
    );
  });

  it('cache-clear does not break redirectTo: cache is cleared AND navigation lands on the redirect target', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ token: 't', userId: 'u', expiresAt: 'x' }),
    });
    const { router, queryClient } = await renderLoginForm(
      '/buckets/Necesidades',
    );
    queryClient.setQueryData(['resumen', '2026-08'], { esDemo: true });

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'usuario@moneydiary.cl' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'secreta123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/buckets/Necesidades'),
    );
    expect(queryClient.getQueryData(['resumen', '2026-08'])).toBeUndefined();
  });
});
