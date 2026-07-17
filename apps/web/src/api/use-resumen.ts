import { useQuery } from '@tanstack/react-query'
import { fetchResumen } from './client'
import type { ApiError } from './client'
import type { ResumenMesDto } from './types'

/**
 * useResumen — hook TanStack Query para GET /api/resumen[?periodo=YYYY-MM].
 *
 * Recibe `periodo` como argumento explícito en lugar de leerlo de
 * `Route.useSearch()` directamente: la pantalla/selector de período es un
 * work unit posterior (W1 componentes) — este hook solo necesita aceptar el
 * valor, quien lo llame decide de dónde sale (search params de router, un
 * valor fijo en tests, etc.).
 *
 * `periodo` ausente → el backend resuelve el mes actual (mismo contrato que
 * `GET /api/resumen` sin query param).
 */
export function useResumen(periodo?: string) {
  return useQuery<ResumenMesDto, ApiError>({
    queryKey: ['resumen', periodo ?? 'actual'],
    queryFn: async () => {
      const result = await fetchResumen(periodo)
      if (!result.ok) {
        throw result.error
      }
      return result.value
    },
  })
}
