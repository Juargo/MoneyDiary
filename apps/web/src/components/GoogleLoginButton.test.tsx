import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { GoogleLoginButton } from './GoogleLoginButton';

/**
 * GoogleLoginButton MUST render as a real top-level `<a href>` navigation to
 * `/api/auth/google` (AUTH-17) — never a button with an `onClick` handler
 * issuing `fetch`/`window.location`, because the backend's Sec-Fetch guard
 * on the initiate route requires a genuine top-level document navigation
 * (same reasoning as the landing page's demo link).
 *
 * Visibility is driven entirely by `GET /api/auth/capabilities`
 * (design.md §4.5) — fail-closed: hidden while loading (reserve space, no
 * flash of a dead button) and hidden when `googleLoginEnabled: false`.
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

function renderWithQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return render(<GoogleLoginButton />, { wrapper: Wrapper });
}

describe('GoogleLoginButton', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders nothing (no link role) while the capability is still loading', () => {
    // fetch never resolves within this test — capability stays pending.
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

    renderWithQueryClient();

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a top-level <a href="/api/auth/google"> when googleLoginEnabled is true', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ googleLoginEnabled: true }),
    });

    renderWithQueryClient();

    const link = await screen.findByRole('link', {
      name: 'Continuar con Google',
    });
    expect(link).toHaveAttribute('href', '/api/auth/google');
    // Never an onClick-driven navigation — this must stay a real anchor.
    expect(link.tagName).toBe('A');
  });

  it('renders nothing when googleLoginEnabled is false (kill switch off)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ googleLoginEnabled: false }),
    });

    renderWithQueryClient();

    await waitFor(() =>
      expect(screen.queryByRole('link')).not.toBeInTheDocument(),
    );
  });

  it('renders nothing when the capabilities fetch fails (fail-closed)', async () => {
    mockFetchOnce({ ok: false, status: 500 });

    renderWithQueryClient();

    await waitFor(() =>
      expect(screen.queryByRole('link')).not.toBeInTheDocument(),
    );
  });

  it('the visible button is keyboard-accessible (a real anchor, no tabindex removal)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ googleLoginEnabled: true }),
    });

    renderWithQueryClient();

    const link = await screen.findByRole('link', {
      name: 'Continuar con Google',
    });
    expect(link).not.toHaveAttribute('tabindex', '-1');
  });
});
