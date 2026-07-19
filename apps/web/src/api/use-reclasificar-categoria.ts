import { useMutation, useQueryClient } from '@tanstack/react-query'
import { postReclasificarCategoria } from './client'
import type { ApiError } from './client'
import type { ReclasificarCategoriaDto } from './types'

export interface ReclasificarCategoriaInput {
  readonly transaccionId: string
  readonly categoria: string
}

/**
 * useReclasificarCategoria — `useMutation` para
 * `PATCH /api/transacciones/:id/categoria` (US-013 S6b, WCAT-04).
 *
 * `periodo`/`bucket` llegan como argumentos explícitos (mismo diseño que
 * `useDetalleBucket`/`useResumen`: el caller — `ReclasificarCategoriaControl`,
 * que ya conoce ambos porque los recibe de `BucketDetailList` — decide de
 * dónde salen, este hook solo los usa para construir las query keys exactas
 * a invalidar).
 *
 * Invalidation story (design.md §4.3/§7.2): el backend solo persiste (no hay
 * resumen materializado que recalcular), así que la ÚNICA fuente de verdad
 * post-reclasificación es el próximo read — `onSuccess` invalida:
 * - `['resumen', periodo]` (exacto — coincide con `useResumen`'s queryKey):
 *   refresca el pie + semáforo del período visible.
 * - `['detalle-bucket', bucket, periodo]` (exacto — coincide con
 *   `useDetalleBucket`'s queryKey): refresca el panel agrupado.
 * - `['resumen-anual']` (PARCIAL, sin `anio` — deviation deliberada del
 *   design.md's `['resumen-anual', anio]`: este hook no conoce el año que la
 *   grilla anual está mostrando, así que invalida TODOS los años cacheados
 *   en vez de adivinar uno; TanStack Query matchea por prefijo de key, así
 *   que esto no afecta `['resumen', ...]` ni `['detalle-bucket', ...]` —
 *   claves distintas en la posición 0).
 */
export function useReclasificarCategoria(periodo: string | undefined, bucket: string) {
  const queryClient = useQueryClient()

  return useMutation<ReclasificarCategoriaDto, ApiError, ReclasificarCategoriaInput>({
    mutationFn: async ({ transaccionId, categoria }) => {
      const result = await postReclasificarCategoria(transaccionId, categoria)
      if (!result.ok) {
        throw result.error
      }
      return result.value
    },
    onSuccess: () => {
      const clave = periodo ?? 'actual'
      void queryClient.invalidateQueries({ queryKey: ['resumen', clave] })
      void queryClient.invalidateQueries({ queryKey: ['detalle-bucket', bucket, clave] })
      void queryClient.invalidateQueries({ queryKey: ['resumen-anual'] })
    },
  })
}
