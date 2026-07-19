import { useQuery } from '@tanstack/react-query'
import { fetchResumenAnual } from './client'
import type { ApiError } from './client'
import type { ResumenAnualDto } from './types'

/**
 * useResumenAnual — hook TanStack Query para GET /api/resumen/anual[?anio=YYYY]
 * (US-030 Slice C). Mirrors `useResumen` exactly: `anio` is an explicit
 * argument (the caller — `ResumenAnual`, self-fetching like
 * `BucketDetailList` — decides where the value comes from), and an absent
 * `anio` lets the backend resolve the current year (same contract as
 * `/api/resumen` without `periodo`).
 */
export function useResumenAnual(anio?: number) {
  return useQuery<ResumenAnualDto, ApiError>({
    queryKey: ['resumen-anual', anio ?? 'actual'],
    queryFn: async () => {
      const result = await fetchResumenAnual(anio)
      if (!result.ok) {
        throw result.error
      }
      return result.value
    },
  })
}
