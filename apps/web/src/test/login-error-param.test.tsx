import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routeTree } from '@/routeTree.gen';
import { Route as LoginRoute } from '@/routes/login';

/**
 * `?error=` on /login (AUTH-15/AUTH-17, design.md §6.2). Uses the REAL
 * generated route tree (same pattern as
 * `src/test/redirect-after-login.test.tsx`) so `validateSearch`'s whitelist
 * is exercised exactly as the router runs it, not a reimplementation.
 *
 * `validateSearch` MUST whitelist the single literal `'google'` — never
 * echo an attacker-controlled `?error=` value into the page (no reflected
 * XSS surface), mirroring `sanitizeRedirect`'s discipline for `?redirect=`.
 */
function buildFetchStub(
  capabilities: { googleLoginEnabled: boolean } = { googleLoginEnabled: false },
) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/api/auth/capabilities')) {
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(capabilities),
      };
    }
    return { ok: false, status: 401 };
  });
}

function renderApp(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return router;
}

describe('/login — ?error= handling (real route tree)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the generic Google-login alert when ?error=google is present', async () => {
    vi.stubGlobal('fetch', buildFetchStub());

    renderApp('/login?error=google');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos iniciar sesión con Google.',
    );
  });

  it('whitelists error=google — validateSearch keeps it in resolved search params', async () => {
    vi.stubGlobal('fetch', buildFetchStub());

    const router = renderApp('/login?error=google');

    await waitFor(() =>
      expect(router.state.location.search).toEqual({ error: 'google' }),
    );
  });

  it('strips an unknown ?error= value at the validateSearch boundary — never round-trips it', () => {
    const validate = LoginRoute.options.validateSearch as (
      search: Record<string, unknown>,
    ) => { redirect?: string; error?: 'google' };

    expect(validate({ error: '<script>alert(1)</script>' })).toEqual({});
    expect(validate({ error: 'anything-else' })).toEqual({});
  });

  it('strips an unknown ?error= value — never reflected into the rendered page', async () => {
    vi.stubGlobal('fetch', buildFetchStub());

    renderApp(
      '/login?error=' + encodeURIComponent('<script>alert(1)</script>'),
    );

    await screen.findByLabelText('Email');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('<script>alert(1)</script>');
  });

  it('renders no alert when ?error= is absent', async () => {
    vi.stubGlobal('fetch', buildFetchStub());

    renderApp('/login');

    await screen.findByLabelText('Email');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('preserves the existing ?redirect= behavior alongside ?error=google', async () => {
    vi.stubGlobal('fetch', buildFetchStub());

    const router = renderApp('/login?error=google&redirect=/buckets/Deseos');

    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        error: 'google',
        redirect: '/buckets/Deseos',
      }),
    );
  });

  it('shows the Google button below the form when the capability is enabled', async () => {
    vi.stubGlobal('fetch', buildFetchStub({ googleLoginEnabled: true }));

    renderApp('/login');

    expect(
      await screen.findByRole('link', { name: 'Continuar con Google' }),
    ).toHaveAttribute('href', '/api/auth/google');
  });
});
