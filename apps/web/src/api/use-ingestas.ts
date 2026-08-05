import { useQuery } from '@tanstack/react-query';
import { fetchIngestas } from './client';
import type { ApiError } from './client';
import type { IngestaListItemDto } from './types';

/**
 * useIngestas — hook TanStack Query para GET /api/ingestas
 * (`us-018-eliminar-ingesta` Slice 2, design.md §7.2). Mismo patrón unwrap-or-
 * throw-ApiError que `use-resumen.ts`: `queryFn` desenvuelve el `ApiResult`
 * y lanza `result.error` en falla, para que TanStack vea un `ApiError`
 * tipado en `query.error`, nunca un throw crudo.
 *
 * Sin argumentos — a diferencia de `useResumen`/`useDetalleBucket`, la lista
 * de ingestas no está parametrizada por período.
 */
export function useIngestas() {
  return useQuery<IngestaListItemDto[], ApiError>({
    queryKey: ['ingestas'],
    queryFn: async () => {
      const result = await fetchIngestas();
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
  });
}
