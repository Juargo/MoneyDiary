import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { routeTree } from '@/routeTree.gen';
import { useMe } from '@/api/use-me';
import { QUERY_CLIENT_DEFAULTS } from '@/api/query-client-defaults';
import type { MeDto } from '@/api/types';

/**
 * Integration proof for US-042 WCFG-03 (design.md §1/Q3b/Q3c/Q9c), using the
 * REAL generated route tree (same pattern as `redirect-after-login.test.tsx`
 * / `demo-banner-layout.test.tsx`): landing on any `_authenticated` route
 * primes `['auth-me']` via `beforeLoad`, and a `useMe()` consumer mounted
 * afterward — with a `QueryClient` built from `QUERY_CLIENT_DEFAULTS`, same
 * `staleTime` as production — reads that primed entry with NO second
 * `/api/auth/me` request.
 *
 * `router.load()` (not a full `render(<RouterProvider>)`) runs `beforeLoad`
 * for the matched route without mounting any component — the home route's
 * own `useResumen()` etc. never fire, so this test observes ONLY the
 * priming mechanism, not incidental home-route traffic.
 */
const ME_DTO: MeDto = {
  userId: 'user-1',
  email: 'usuario@moneydiary.cl',
  esDemo: false,
  nombre: 'Usuario de Prueba',
  googleVinculado: false,
};

function buildFetchStub() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/api/auth/me')) {
      return { ok: true, status: 200, json: () => Promise.resolve(ME_DTO) };
    }
    return { ok: false, status: 401, json: () => Promise.resolve({}) };
  });
}

describe('useMe priming on landing (real route tree)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches /api/auth/me exactly once: beforeLoad primes the cache, useMe() reads it fresh', async () => {
    const fetchStub = buildFetchStub();
    vi.stubGlobal('fetch', fetchStub);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          ...QUERY_CLIENT_DEFAULTS.defaultOptions?.queries,
          retry: false,
        },
      },
    });
    const router = createRouter({
      routeTree,
      context: { queryClient },
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });

    await router.load();

    const { result } = renderHook(() => useMe(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.data).toEqual(ME_DTO));

    const meCalls = fetchStub.mock.calls.filter(([input]) =>
      (typeof input === 'string' ? input : input.toString()).startsWith(
        '/api/auth/me',
      ),
    );
    expect(meCalls).toHaveLength(1);
  });
});
