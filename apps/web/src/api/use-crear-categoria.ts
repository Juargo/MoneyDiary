import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postCategoria } from './categorias';
import type { CategoriaInput } from './categorias';
import type { ApiError } from './client';
import type { CatalogoDto, CategoriaDto } from './types';
import { CATEGORIAS_QUERY_KEY } from './use-categorias';
import { invalidarCatalogoYDashboard } from './categorias-invalidacion';

/**
 * useCrearCategoria — `useMutation` para `POST /api/categorias` (US-043
 * design.md §1/Q9a, WCTG-02, WCTG-09; `patrones[]`/cache-seeding añadidos
 * por `crear-categoria-desde-preview` D-06). `NuevaCategoriaForm` sigue
 * siendo un caller (ignora el valor resuelto, `onCerrar: () => void` legal
 * en JS); el preview de subida (PR3/PR4) será el segundo.
 *
 * `mutationFn` delega a `postCategoria` y lanza `result.error` en falla —
 * mismo idioma `useEliminarIngesta`/`useGuardarPerfil` (una sola llamada
 * HTTP, un solo desenlace de falla, sin unión de resultado que modelar).
 *
 * `onSuccess` SEEDEA `['categorias']` con la categoría creada ANTES de
 * invalidar (D-06): la fila que la creó (en el preview) queda con su nuevo
 * `categoriaId` apuntando a una categoría que, hasta que el refetch de la
 * invalidación llegue, no existiría todavía en el caché — sin este seed el
 * `<select>` de esa fila renderizaría un valor sin opción correspondiente.
 * El seed es un append puro (nunca reemplaza categorías existentes);
 * `invalidarCatalogoYDashboard` sigue corriendo después para refrescar el
 * resto del catálogo y el dashboard (perfil B, design.md §1/Q5 — crear una
 * categoría es una mutación de CATEGORÍA, misma matriz que
 * renombrar/re-bucketear/borrar).
 */
export function useCrearCategoria() {
  const queryClient = useQueryClient();

  return useMutation<CategoriaDto, ApiError, CategoriaInput>({
    mutationFn: async (input) => {
      const result = await postCategoria(input);
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: (categoria) => {
      queryClient.setQueryData<CatalogoDto>(CATEGORIAS_QUERY_KEY, (previo) => ({
        categorias: [...(previo?.categorias ?? []), categoria],
      }));
      invalidarCatalogoYDashboard(queryClient);
    },
  });
}
