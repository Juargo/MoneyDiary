import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  CATEGORIAS_QUERY_KEY,
  categoriasQueryOptions,
  useCategorias,
} from './use-categorias';
import type { CatalogoDto } from './types';

// `.tsx`, not `.ts` — `crearWrapper` returns JSX (`<QueryClientProvider>`),
// same reason as `use-me.test.tsx`/`use-resumen.test.tsx`.

const catalogoValido: CatalogoDto = {
  categorias: [
    {
      id: 'cat-1',
      nombre: 'Supermercado',
      bucket: 'Necesidades',
      patrones: [],
      transaccionesCount: 3,
    },
  ],
};

function crearWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('CATEGORIAS_QUERY_KEY / categoriasQueryOptions', () => {
  it('el query key es ["categorias"], namespaced por el endpoint que refleja', () => {
    expect(CATEGORIAS_QUERY_KEY).toEqual(['categorias']);
  });

  it('categoriasQueryOptions() usa CATEGORIAS_QUERY_KEY como queryKey', () => {
    expect(categoriasQueryOptions().queryKey).toEqual(CATEGORIAS_QUERY_KEY);
  });
});

describe('useCategorias', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a GET /api/categorias y expone el CatalogoDto parseado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(catalogoValido),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCategorias(), {
      wrapper: crearWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith('/api/categorias', {
      credentials: 'same-origin',
    });
    expect(result.current.data).toEqual(catalogoValido);
  });

  it('expone el ApiError tipado cuando la request falla (query.error, no un throw crudo)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    const { result } = renderHook(() => useCategorias(), {
      wrapper: crearWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      tag: 'unauthorized',
      message: 'Sesión no válida.',
    });
  });
});
