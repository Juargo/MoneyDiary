import { useQuery } from '@tanstack/react-query';
import { fetchDetalleBucketMes } from './client';
import type { ApiError } from './client';
import type { DetalleBucketMesDto } from './types';

/**
 * useDetalleBucketMes — hook TanStack Query para
 * GET /api/buckets/:bucket/detalle[?periodo=YYYY-MM] (US-051 `bucket-detalle-mes`,
 * consumido por US-053). Mismo diseño que `useDetalleBucket`: `periodo` llega
 * como argumento explícito, no se lee de `Route.useSearch()` aquí — el caller
 * (la ruta) decide de dónde sale. `periodo` ausente → el backend resuelve el
 * mes actual. Query key propia `['detalle-bucket-mes', ...]` — distinta de la
 * flat `['detalle-bucket', ...]` mientras ambas viven (T-19 agrega la nueva
 * key a las invalidaciones; T-18 elimina la flat por completo).
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
