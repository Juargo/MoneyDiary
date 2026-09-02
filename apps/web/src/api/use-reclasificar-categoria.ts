import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postReclasificarCategoria } from './client';
import type { ApiError } from './client';
import type { ReclasificarCategoriaDto } from './types';

export interface ReclasificarCategoriaInput {
  readonly transaccionId: string;
  readonly categoriaId: string;
}

/**
 * useReclasificarCategoria — `useMutation` para
 * `PATCH /api/transacciones/:id/categoria` (US-013 S6b, WCAT-04).
 *
 * `periodo`/`bucket` llegan como argumentos explícitos (mismo diseño que
 * `useDetalleBucketMes`/`useResumen`: el caller — `BucketDetalleMesPage` /
 * `ReclasificarCategoriaControl`, que ya conoce ambos porque los recibe de
 * la ruta — decide de dónde salen, este hook solo los usa para construir las
 * query keys exactas a invalidar).
 *
 * Invalidation story (design.md §4.3/§7.2, US-055 D-09): el backend solo
 * persiste (no hay resumen materializado que recalcular), así que la ÚNICA
 * fuente de verdad post-reclasificación es el próximo read — `onSuccess`
 * invalida 4 keys:
 * - `['resumen', periodo]` (exacto — coincide con `useResumen`'s queryKey):
 *   refresca el pie + semáforo del período visible.
 * - `['detalle-bucket-mes', bucket, periodo]` (exacto — coincide con
 *   `useDetalleBucketMes`'s queryKey, US-053 T-05): refresca la página
 *   Detalle MES-BUCKET cuando una reclasificación ocurre desde ella.
 * - `['resumen-anual']` (PARCIAL, sin `anio` — deviation deliberada del
 *   design.md's `['resumen-anual', anio]`: este hook no conoce el año que la
 *   grilla anual está mostrando, así que invalida TODOS los años cacheados
 *   en vez de adivinar uno; TanStack Query matchea por prefijo de key, así
 *   que esto no afecta `['resumen', ...]` ni
 *   `['detalle-bucket-mes', ...]` — claves distintas en la posición 0).
 * - `['ingresos-mes']` (PREFIX — coincide con `useIngresosMes`'s
 *   `['ingresos-mes', periodo ?? 'actual']` en la posición 0): una
 *   reclasificación hacia/desde Ingresos no puede ocurrir vía este control
 *   (BUCKETS_ASIGNABLES filtra ese bucket), pero un cambio de bucket puede
 *   re-estempar totales de ingresos — se invalida por prefijo igual que
 *   `['resumen-anual']`, sin adivinar el período cacheado en esa página.
 */
export function useReclasificarCategoria(
  periodo: string | undefined,
  bucket: string,
) {
  const queryClient = useQueryClient();

  return useMutation<
    ReclasificarCategoriaDto,
    ApiError,
    ReclasificarCategoriaInput
  >({
    mutationFn: async ({ transaccionId, categoriaId }) => {
      const result = await postReclasificarCategoria(
        transaccionId,
        categoriaId,
      );
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: () => {
      const clave = periodo ?? 'actual';
      void queryClient.invalidateQueries({ queryKey: ['resumen', clave] });
      void queryClient.invalidateQueries({
        queryKey: ['detalle-bucket-mes', bucket, clave],
      });
      void queryClient.invalidateQueries({ queryKey: ['resumen-anual'] });
      void queryClient.invalidateQueries({ queryKey: ['ingresos-mes'] });
    },
  });
}
