import { useQuery } from '@tanstack/react-query';
import { fetchIngresosMes } from './client';
import type { ApiError } from './client';
import type { IngresosMesDto } from './types';

/**
 * useIngresosMes — TanStack Query hook for
 * GET /api/ingresos/mes[?periodo=YYYY-MM] (US-052 `ingresos-detalle-mes`,
 * consumed by US-054). Same design as `useDetalleBucketMes`/`useResumen`:
 * `periodo` arrives as an explicit argument, not read from
 * `Route.useSearch()` here — the caller (the route) decides where it comes
 * from. Absent `periodo` → the backend resolves the current month (MID-04).
 * Query key `['ingresos-mes', periodo ?? 'actual']` (D-06) — distinct from
 * the dashboard/bucket keys, so no invalidation-matrix change is needed
 * (D-07: no mutation co-mounts with `/ingresos`).
 */
export function useIngresosMes(periodo?: string) {
  return useQuery<IngresosMesDto, ApiError>({
    queryKey: ['ingresos-mes', periodo ?? 'actual'],
    queryFn: async () => {
      const result = await fetchIngresosMes(periodo);
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
  });
}
