import { useQuery } from '@tanstack/react-query';
import { fetchDetalleBucketMes } from './client';
import type { ApiError } from './client';
import type { DetalleBucketMesDto } from './types';

/**
 * useDetalleBucketMes — hook TanStack Query para
 * GET /api/buckets/:bucket/detalle[?periodo=YYYY-MM] (US-051 `bucket-detalle-mes`,
 * consumido por US-053). Mismo diseño que `useResumen`: `periodo` llega
 * como argumento explícito, no se lee de `Route.useSearch()` aquí — el caller
 * (la ruta) decide de dónde sale. `periodo` ausente → el backend resuelve el
 * mes actual. Query key `['detalle-bucket-mes', ...]` — la ÚNICA clave de
 * drill-down que queda tras T-18 (la cadena flat, con su
 * `['detalle-bucket', ...]`, fue eliminada; T-19 la renombró en todas las
 * invalidaciones).
 */
export function useDetalleBucketMes(bucket: string, periodo?: string) {
  return useQuery<DetalleBucketMesDto, ApiError>({
    queryKey: ['detalle-bucket-mes', bucket, periodo ?? 'actual'],
    queryFn: async () => {
      const result = await fetchDetalleBucketMes(bucket, periodo);
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
  });
}
