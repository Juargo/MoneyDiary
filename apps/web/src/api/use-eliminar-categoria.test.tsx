import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useEliminarCategoria } from './use-eliminar-categoria';

/**
 * use-eliminar-categoria.test.tsx (US-043, design.md §1/Q6d, WCTG-08,
 * WCTG-09) — `DELETE /api/categorias/:id`. Always `204` (decisión 5,
 * `CAT038-04`): NO existe rama `409` y nunca la habrá — la misma
 * aserción de `categorias.ts`/task 12, repetida aquí a nivel de hook para
 * que un futuro mantenedor tampoco encuentre nada que "arreglar" en este
 * nivel.
 *
 * Reused by BOTH delete entry points (list row, PR #5; edit-screen footer,
 * this PR) — mismo hook, mismo diálogo.
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

describe('useEliminarCategoria', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a DELETE /api/categorias/:id con el id recibido', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);
    const { queryClient } = crearQueryClientEspiado();

    const { result } = renderHook(() => useEliminarCategoria(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('cat-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/categorias/cat-1', {
      credentials: 'same-origin',
      method: 'DELETE',
    });
  });

  it('al tener éxito invalida EXACTAMENTE las 5 claves del perfil B, en orden (WCTG-09/WDM-09 inclusión)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204 }),
    );
    const { queryClient, claves } = crearQueryClientEspiado();

    const { result } = renderHook(() => useEliminarCategoria(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('cat-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(claves()).toEqual([
      ['categorias'],
      ['resumen'],
      ['resumen-anual'],
      ['detalle-bucket-mes'],
      ['ingresos-mes'],
    ]);
  });

  /**
   * WCTG-08 (scenario: "No 409 handling exists to find") — decisión 5,
   * CAT038-04: mirroring `categorias.test.ts`'s client-level assertion at
   * the HOOK level. Si llegara un 409 (nunca debería), este hook no tiene
   * ninguna rama dedicada: cae en `isError` genérico, exactamente igual
   * que cualquier otro status no distinguido.
   */
  it('un 409 (si llegara) cae en el error genérico — no existe rama dedicada a nivel de hook', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ message: 'x', code: 'ALGO_NO_DOCUMENTADO' }),
      }),
    );
    const { queryClient, claves } = crearQueryClientEspiado();

    const { result } = renderHook(() => useEliminarCategoria(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('cat-1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      tag: 'server',
      status: 409,
      code: 'ALGO_NO_DOCUMENTADO',
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
    expect(claves()).toEqual([]);
  });

  it('una mutación fallida no invalida ninguna caché', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    const { queryClient, claves } = crearQueryClientEspiado();

    const { result } = renderHook(() => useEliminarCategoria(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('cat-1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(claves()).toEqual([]);
  });

  it('expone el ApiError tipado cuando falla, no un throw crudo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    const { queryClient } = crearQueryClientEspiado();

    const { result } = renderHook(() => useEliminarCategoria(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('cat-1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      tag: 'unauthorized',
      message: 'Sesión no válida.',
    });
  });
});
