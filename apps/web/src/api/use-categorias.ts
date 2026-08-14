import { queryOptions, useQuery } from '@tanstack/react-query';
import { fetchCatalogo } from './categorias';
import type { CatalogoDto } from './types';

/**
 * useCategorias — TanStack Query hook for `GET /api/categorias`
 * (US-043 design.md §1/Q2c, WCTG-02/WCTG-10). `['categorias']`, namespaced
 * by the endpoint it mirrors, same convention as `['resumen']`/
 * `['ingestas']`/`['detalle-bucket']`/`['auth-me']`.
 *
 * **One key serves three consumers**: the list panel, the edit screen
 * (which resolves its `:categoriaId` out of this same cache — there is no
 * `GET /api/categorias/:id`, design.md §1/Q1e/Q2c), and, per §7, the
 * dashboard's reclassify dropdown. Every mutation hook in this feature
 * (`categorias-invalidacion.ts`) invalidates this exact key.
 */
export const CATEGORIAS_QUERY_KEY = ['categorias'] as const;

export function categoriasQueryOptions() {
  return queryOptions({
    queryKey: CATEGORIAS_QUERY_KEY,
    queryFn: async (): Promise<CatalogoDto> => {
      const result = await fetchCatalogo();
      if (!result.ok) {
        // `query.error` surfaces as the typed `ApiError` — same
        // `useMe`/`useEliminarIngesta` idiom (never a raw throw).
        throw result.error;
      }
      return result.value;
    },
  });
}

export function useCategorias() {
  return useQuery(categoriasQueryOptions());
}
