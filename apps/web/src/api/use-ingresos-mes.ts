import { useQuery } from '@tanstack/react-query';
import { fetchIngresosMes } from './client';
import type { ApiError } from './client';
import type { IngresosMesDto } from './types';

/**
 * useIngresosMes — hook TanStack Query para
 * GET /api/ingresos/mes[?periodo=YYYY-MM] (US-052 `ingresos-detalle-mes`,
 * consumido por US-054). Mismo diseño que `useDetalleBucketMes`/`useResumen`:
 * `periodo` llega como argumento explícito, no se lee de `Route.useSearch()`
 * acá — el caller (la ruta) decide de dónde sale. Sin `periodo` → el backend
 * resuelve el mes actual (MID-04). Query key `['ingresos-mes', periodo ?? 'actual']`
 * (D-06) — distinta de las keys del dashboard/buckets, así que no hace falta
 * cambio en la matriz de invalidación (D-07: ninguna mutación co-monta con
 * `/ingresos`).
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
