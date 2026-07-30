import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteIngesta } from './client'
import type { ApiError } from './client'

/**
 * useEliminarIngesta — `useMutation` para DELETE /api/ingestas/:id
 * (`us-018-eliminar-ingesta` Slice 2, design.md §7.2, ING-06).
 *
 * `mutationFn` delega a `deleteIngesta` y lanza `result.error` en falla,
 * mismo patrón que `useIngesta` (upload) — TanStack ve un `ApiError` tipado
 * en `mutation.error`, nunca un throw crudo.
 *
 * Al tener éxito invalida EXACTAMENTE 4 cachés — las 3 que `useIngesta`
 * (upload) ya invalida (`resumen`, `resumen-anual`, `detalle-bucket`) MÁS
 * `ingestas`, porque a diferencia de subir un archivo, borrar una ingesta
 * también muta la lista que `useIngestas` cachea. Sin `['movimientos']` — esa
 * caché no existe en `apps/web` (verificado en `useIngesta`).
 */
export function useEliminarIngesta() {
  const queryClient = useQueryClient()

  return useMutation<void, ApiError, string>({
    mutationFn: async (id) => {
      const result = await deleteIngesta(id)
      if (!result.ok) {
        throw result.error
      }
      return result.value
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumen'] })
      queryClient.invalidateQueries({ queryKey: ['resumen-anual'] })
      queryClient.invalidateQueries({ queryKey: ['detalle-bucket'] })
      queryClient.invalidateQueries({ queryKey: ['ingestas'] })
    },
  })
}
