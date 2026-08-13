import { queryOptions, useQuery } from '@tanstack/react-query';
import { fetchMe } from './auth';
import type { MeDto } from './types';

/**
 * useMe — TanStack Query hook for the identity payload GET /api/auth/me
 * already returns (US-042 design.md §1/Q3a, WCFG-03/WCFG-04).
 *
 * `['auth-me']`, not `['me']`: namespaced by the endpoint it mirrors, same
 * convention as `['resumen']`/`['ingestas']`/`['detalle-bucket']`. This is
 * the ONLY cache that holds identity, so it is also the only key any mutation
 * on this page ever invalidates.
 *
 * `_authenticated.tsx`'s `beforeLoad` already pays for one `fetchMe()` round
 * trip per visit and primes this exact key (`setQueryData`) before any
 * `useMe()` consumer mounts — so under the production `staleTime` (30s,
 * `query-client-defaults.ts`) this hook issues NO additional request on a
 * normal navigation. See design.md §1/Q3b/Q3c.
 */
export const ME_QUERY_KEY = ['auth-me'] as const;

export function meQueryOptions() {
  return queryOptions({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<MeDto> => {
      const result = await fetchMe();
      if (!result.ok) {
        // `query.error` surfaces as the typed `ApiError` — same
        // `useEliminarIngesta`/`useResumen` idiom (never a raw throw).
        throw result.error;
      }
      return result.value;
    },
  });
}

export function useMe() {
  return useQuery(meQueryOptions());
}
