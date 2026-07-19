import { useQuery } from '@tanstack/react-query'
import { fetchMovimientos } from './client'
import type { ApiError } from './client'
import type { MovimientosMesDto } from './types'

/**
 * useMovimientos — hook TanStack Query para GET /api/movimientos[?periodo=YYYY-MM]
 * (Slice 2 de `group-transactions-by-category`). Mismo diseño que
 * `useDetalleBucket`: `periodo` llega como argumento explícito, no se lee de
 * `Route.useSearch()` aquí — el caller decide de dónde sale. `periodo`
 * ausente → el backend resuelve el mes actual.
 */
export function useMovimientos(periodo?: string) {
  return useQuery<MovimientosMesDto, ApiError>({
    queryKey: ['movimientos', periodo ?? 'actual'],
    queryFn: async () => {
      const result = await fetchMovimientos(periodo)
      if (!result.ok) {
        throw result.error
      }
      return result.value
    },
  })
}
