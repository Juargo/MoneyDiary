import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useCrearPatron } from './use-crear-patron';

/**
 * use-crear-patron.test.tsx (US-043 PR #4, design.md §1/Q9b, WCTG-04,
 * WCTG-09) — `POST /api/patrones`. Perfil A (`invalidarCatalogo`): un patrón
 * nuevo es una mutación de PATRÓN, no de categoría — solo `['categorias']`.
 *
 * La aserción de inclusión (task 38) usa el mismo idioma de
 * exact-array-equality que `use-crear-categoria.test.tsx`/PR #1c task 14. La
 * EXCLUSIÓN dedicada (non-negotiable #4) es task 39, más abajo — su propio
 * `it`, no una aserción plegada en el de inclusión.
 */
function crearWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function crearQueryClientEspiado() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const espia = vi.spyOn(queryClient, 'invalidateQueries');
  const claves = () => espia.mock.calls.map(([arg]) => arg?.queryKey);
  return { queryClient, claves };
}

describe('useCrearPatron', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a POST /api/patrones con el PatronInput recibido, sin prioridad', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal('fetch', fetchMock);
    const { queryClient } = crearQueryClientEspiado();

    const { result } = renderHook(() => useCrearPatron(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({
      categoriaId: 'cat-1',
      patron: 'netflix',
      matchType: 'CONTAINS',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/patrones', {
      credentials: 'same-origin',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        categoriaId: 'cat-1',
        patron: 'netflix',
        matchType: 'CONTAINS',
      }),
    });
  });

  it('al tener éxito invalida EXACTAMENTE ["categorias"] (WCTG-09 perfil A, inclusión)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 201 }),
    );
    const { queryClient, claves } = crearQueryClientEspiado();

    const { result } = renderHook(() => useCrearPatron(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({
      categoriaId: 'cat-1',
      patron: 'netflix',
      matchType: 'CONTAINS',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(claves()).toEqual([['categorias']]);
  });

  it('una mutación fallida no invalida ninguna caché', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 409 }),
    );
    const { queryClient, claves } = crearQueryClientEspiado();

    const { result } = renderHook(() => useCrearPatron(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({
      categoriaId: 'cat-1',
      patron: 'netflix',
      matchType: 'CONTAINS',
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(claves()).toEqual([]);
  });

  it('expone el ApiError tipado cuando falla, no un throw crudo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    const { queryClient } = crearQueryClientEspiado();

    const { result } = renderHook(() => useCrearPatron(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({
      categoriaId: 'cat-1',
      patron: 'netflix',
      matchType: 'CONTAINS',
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      tag: 'unauthorized',
      message: 'Sesión no válida.',
    });
  });

  it('LA EXCLUSIÓN (non-negotiable #4, task 39) — NO invalida ninguna clave del dashboard', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 201 }),
    );
    const { queryClient, claves } = crearQueryClientEspiado();

    const { result } = renderHook(() => useCrearPatron(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({
      categoriaId: 'cat-1',
      patron: 'netflix',
      matchType: 'CONTAINS',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Exact array equality — una TERCERA clave (p.ej. ['resumen']) rompe esta
    // aserción, no se infiere por ausencia (design.md §0.3, WCTG-09).
    expect(claves()).toEqual([['categorias']]);
  });
});
