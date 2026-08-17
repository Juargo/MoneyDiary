import { useQuery } from '@tanstack/react-query';
import { fetchSemaforoDetalle } from './client';
import type { ApiError } from './client';
import type { SemaforoDetalleDto } from './types';

/**
 * useSemaforoDetalle — hook TanStack Query para
 * GET /api/resumen/semaforo[?periodo=YYYY-MM] (US-049, design §1.7). Mismo
 * shape que `useResumen`: `periodo` es un argumento explícito (quien llame
 * decide de dónde sale — router search params, un valor fijo en tests, etc.)
 * y `periodo` ausente deja que el backend resuelva el mes actual.
 */
export function useSemaforoDetalle(periodo?: string) {
  return useQuery<SemaforoDetalleDto, ApiError>({
    queryKey: ['semaforo-detalle', periodo ?? 'actual'],
    queryFn: async () => {
      const result = await fetchSemaforoDetalle(periodo);
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
  });
}
