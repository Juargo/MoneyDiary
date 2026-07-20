import { useMutation, useQueryClient } from '@tanstack/react-query'
import { postIngesta } from './client'
import type { ApiError } from './client'
import type { IngestaResponseDto } from './types'

/**
 * useIngesta — la primera `useMutation` de este codebase (design.md
 * Decision 1). `mutationFn` delega a `postIngesta` y lanza `result.error`
 * en falla, mismo patrón que los hooks `useQuery` existentes
 * (`use-resumen.ts`) — así TanStack ve un `ApiError` tipado en
 * `mutation.error`, no un throw crudo.
 *
 * Al tener éxito, invalida exactamente las 3 cachés que dependen de las
 * transacciones recién ingeridas — `resumen`, `resumen-anual`,
 * `detalle-bucket`. NO existe una caché `movimientos` en `apps/web`
 * (verificado, design.md Decision 1) — invalidarla sería un no-op peligroso
 * que da una falsa sensación de cobertura.
 */
export function useIngesta() {
  const queryClient = useQueryClient()

  return useMutation<IngestaResponseDto, ApiError, File>({
    mutationFn: async (file) => {
      const result = await postIngesta(file)
      if (!result.ok) {
        throw result.error
      }
      return result.value
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumen'] })
      queryClient.invalidateQueries({ queryKey: ['resumen-anual'] })
      queryClient.invalidateQueries({ queryKey: ['detalle-bucket'] })
    },
  })
}
