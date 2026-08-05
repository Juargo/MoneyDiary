import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteIngesta } from './client';
import type { ApiError } from './client';

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
 *
 * Un 404 (`deleteIngesta`, anti-enumeración) significa que la fila YA no
 * existe server-side — no es un fallo inesperado, es una lista desactualizada
 * (borrada por otra sesión, o un doble-click que ya resolvió la primera
 * request). `onError` trata ese caso como "ya se fue": invalida SOLO
 * `['ingestas']` para que la fila stale desaparezca al refetch, sin tocar
 * `resumen`/`resumen-anual`/`detalle-bucket` — esas cachés ya reflejan
 * cualquier estado previo y no cambiaron por este 404 (review finding).
 * Cualquier otro error (red, 401, 5xx) no invalida nada, igual que antes.
 */
export function useEliminarIngesta() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: async (id) => {
      const result = await deleteIngesta(id);
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumen'] });
      queryClient.invalidateQueries({ queryKey: ['resumen-anual'] });
      queryClient.invalidateQueries({ queryKey: ['detalle-bucket'] });
      queryClient.invalidateQueries({ queryKey: ['ingestas'] });
    },
    onError: (error) => {
      if (error.tag === 'server' && error.status === 404) {
        queryClient.invalidateQueries({ queryKey: ['ingestas'] });
      }
    },
  });
}
