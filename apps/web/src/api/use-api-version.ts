import { useQuery } from '@tanstack/react-query';
import { fetchApiVersion } from './client';
import type { ApiError } from './client';
import type { ApiVersionDto } from './types';

/**
 * useApiVersion — hook TanStack Query para GET /version del API (cross-origin,
 * autorizado vía CORS). Es información no crítica y estable entre deploys, así
 * que se cachea indefinidamente y NO se reintenta: si falla, el badge que la
 * consume simplemente no se renderiza (no rompe la UI ni spammea la red).
 */
export function useApiVersion() {
  return useQuery<ApiVersionDto, ApiError>({
    queryKey: ['api-version'],
    queryFn: async () => {
      const result = await fetchApiVersion();
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
    staleTime: Infinity,
    retry: false,
  });
}
