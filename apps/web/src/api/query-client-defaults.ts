import type { QueryClientConfig } from '@tanstack/react-query';

/**
 * QUERY_CLIENT_DEFAULTS — the one production `QueryClient` setting that a
 * `QueryClient` built inside a test must also carry: `staleTime: 30_000`
 * (mirrors `main.tsx`'s production client). Extracted so `main.tsx` and every
 * test that builds its own `QueryClient` against the real route tree share
 * one source (`dry`), instead of the test client silently drifting to
 * TanStack's own default (`staleTime: 0`).
 *
 * US-042 design.md §1/Q3c: `_authenticated.tsx`'s `beforeLoad` primes
 * `['auth-me']` via `setQueryData`, which stamps `dataUpdatedAt = now`. A
 * `useMe()` mounted moments later inside the same navigation only skips its
 * own fetch if that entry is still fresh — i.e. only if the client's
 * `staleTime` matches production. A test client built with `staleTime: 0`
 * would refetch instantly, failing the "exactly one `/api/auth/me`" call-count
 * assertion for a reason that has nothing to do with the app under test.
 *
 * Deliberately does NOT carry `refetchOnWindowFocus`/`retry` — those are
 * production-only concerns (`shouldRetryQuery` lives in `main.tsx`, which
 * calls `createRoot` at module scope and can't be imported by a test); tests
 * that need `retry: false` still set it themselves, merged with this object.
 */
export const QUERY_CLIENT_DEFAULTS: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
};
