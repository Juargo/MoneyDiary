import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postCategoria } from './categorias';
import type { CategoriaInput } from './categorias';
import type { ApiError } from './client';
import { invalidarCatalogoYDashboard } from './categorias-invalidacion';

/**
 * useCrearCategoria — `useMutation` para `POST /api/categorias` (US-043
 * design.md §1/Q9a, WCTG-02, WCTG-09). `NuevaCategoriaForm` (PR #3a) es el
 * único caller: el formulario inline de creación en el tope de la lista.
 *
 * `mutationFn` delega a `postCategoria` y lanza `result.error` en falla —
 * mismo idioma `useEliminarIngesta`/`useGuardarPerfil` (una sola llamada
 * HTTP, un solo desenlace de falla, sin unión de resultado que modelar).
 *
 * Perfil B (`invalidarCatalogoYDashboard`), no perfil A: crear una categoría
 * es una mutación de CATEGORÍA (design.md §1/Q5 — `categorias-invalidacion.ts`).
 * A diferencia de un rename/re-bucket, una categoría recién creada no tiene
 * transacciones que reclasificar todavía, pero la matriz de invalidación no
 * distingue por eso — perfil B se aplica a las tres mutaciones de categoría
 * (crear/renombrar/re-bucketear/borrar) uniformemente, no solo a las que
 * mueven dinero ya existente.
 */
export function useCrearCategoria() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, CategoriaInput>({
    mutationFn: async (input) => {
      const result = await postCategoria(input);
      if (!result.ok) {
        throw result.error;
      }
      return result.value;
    },
    onSuccess: () => {
      invalidarCatalogoYDashboard(queryClient);
    },
  });
}
