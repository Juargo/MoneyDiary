import { useQuery } from '@tanstack/react-query'
import { fetchDetalleBucket } from './client'
import type { ApiError } from './client'
import type { DetalleBucketDto } from './types'

/**
 * useDetalleBucket — hook TanStack Query para
 * GET /api/buckets/:bucket[?periodo=YYYY-MM] (US-017). Mismo diseño que
 * `useResumen`: `periodo` llega como argumento explícito, no se lee de
 * `Route.useSearch()` aquí — el caller (la ruta) decide de dónde sale.
 * `periodo` ausente → el backend resuelve el mes actual.
 */
export function useDetalleBucket(bucket: string, periodo?: string) {
  return useQuery<DetalleBucketDto, ApiError>({
    queryKey: ['detalle-bucket', bucket, periodo ?? 'actual'],
    queryFn: async () => {
      const result = await fetchDetalleBucket(bucket, periodo)
      if (!result.ok) {
        throw result.error
      }
      return result.value
    },
  })
}
