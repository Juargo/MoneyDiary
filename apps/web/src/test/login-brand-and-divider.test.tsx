import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routeTree } from '@/routeTree.gen';

/**
 * `/login` brand + surface treatment (impeccable critique round 7, P1) and
 * the auth-path divider that only appears when BOTH the password form and
 * the Google entry point render (P1 follow-up in the same finding). Uses
 * the REAL generated route tree, same pattern as
 * `login-error-param.test.tsx`, so the capability-gated `GoogleLoginButton`
 * runs exactly as the router mounts it.
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

function renderApp(initialPath = '/login') {
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

describe('/login — brand block + surface (real route tree)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the MoneyDiary wordmark and tagline', async () => {
    vi.stubGlobal('fetch', buildFetchStub());

    renderApp();

    await screen.findByLabelText('Email');
    expect(screen.getByText('MoneyDiary')).toBeInTheDocument();
    expect(screen.getByText('Tu mes, un veredicto claro.')).toBeInTheDocument();
  });

  // ── fresh-review SUGGESTION: /login had no heading at all ────────────────
  it('renders the wordmark as the page <h1> (the only heading on this screen)', async () => {
    vi.stubGlobal('fetch', buildFetchStub());

    renderApp();

    await screen.findByLabelText('Email');
    expect(
      screen.getByRole('heading', { level: 1, name: 'MoneyDiary' }),
    ).toBeInTheDocument();
  });

  it('does not render the auth-path divider while Google login is disabled (password-only path)', async () => {
    vi.stubGlobal('fetch', buildFetchStub({ googleLoginEnabled: false }));

    renderApp();

    await screen.findByLabelText('Email');
    await waitFor(() =>
      expect(screen.queryByRole('link')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('o')).not.toBeInTheDocument();
  });

  it('renders the auth-path divider between the form and the Google button when both paths are present', async () => {
    vi.stubGlobal('fetch', buildFetchStub({ googleLoginEnabled: true }));

    renderApp();

    await screen.findByRole('link', { name: 'Continuar con Google' });
    expect(screen.getByText('o')).toBeInTheDocument();
  });

  // ── fresh-review SUGGESTION: cover the unsettled states too, not just the
  // two settled outcomes above ─────────────────────────────────────────────

  it('does not render the auth-path divider while the capability request is still pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise(() => {})), // never resolves
    );

    renderApp();

    await screen.findByLabelText('Email');
    expect(screen.queryByText('o')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('does not render the auth-path divider when the capability request fails (fail-closed)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.startsWith('/api/auth/capabilities')) {
          return { ok: false, status: 401 };
        }
        return { ok: false, status: 401 };
      }),
    );

    renderApp();

    await screen.findByLabelText('Email');
    await waitFor(() =>
      expect(screen.queryByRole('link')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('o')).not.toBeInTheDocument();
  });
});
