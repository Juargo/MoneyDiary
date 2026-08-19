import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useActualizarCategoria } from './use-actualizar-categoria';

/**
 * use-actualizar-categoria.test.tsx (US-043, design.md §1/Q3b/Q5b, WCTG-09)
 * — `PATCH /api/categorias/:id`. Profile B (`invalidarCatalogoYDashboard`):
 * a rename OR a bucket-change are both mutations of CATEGORÍA.
 *
 * The belt-and-braces case (Q5c/Q5b): a RENAME-ONLY patch (bucket
 * unchanged) still produces the FULL profile-B list — the assertion that
 * would fail if someone later "optimises" the rename path to skip
 * `['detalle-bucket-mes']`, which is WRONG (design.md §1/Q5b: the grouped
 * mes endpoint groups by `tx.categoria?.nombre`, so a rename changes what
 * the bucket drill-down displays).
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

describe('useActualizarCategoria', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a PATCH /api/categorias/:id con el patch recibido', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const { queryClient } = crearQueryClientEspiado();

    const { result } = renderHook(() => useActualizarCategoria(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({ id: 'cat-1', patch: { bucket: 'Deseos' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/categorias/cat-1', {
      credentials: 'same-origin',
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bucket: 'Deseos' }),
    });
  });

  it('un cambio de bucket invalida EXACTAMENTE las 4 claves del perfil B, en orden (WCTG-09 inclusión)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    const { queryClient, claves } = crearQueryClientEspiado();

    const { result } = renderHook(() => useActualizarCategoria(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({ id: 'cat-1', patch: { bucket: 'Deseos' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(claves()).toEqual([
      ['categorias'],
      ['resumen'],
      ['resumen-anual'],
      ['detalle-bucket-mes'],
    ]);
  });

  it('BELT-AND-BRACES — un rename-only (bucket sin cambios) TAMBIÉN invalida las 4 claves completas (design.md §1/Q5b, no negociable)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    const { queryClient, claves } = crearQueryClientEspiado();

    const { result } = renderHook(() => useActualizarCategoria(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({ id: 'cat-1', patch: { nombre: 'Super Jumbo' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(claves()).toEqual([
      ['categorias'],
      ['resumen'],
      ['resumen-anual'],
      ['detalle-bucket-mes'],
    ]);
  });

  it('una mutación fallida no invalida ninguna caché', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 409 }),
    );
    const { queryClient, claves } = crearQueryClientEspiado();

    const { result } = renderHook(() => useActualizarCategoria(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({ id: 'cat-1', patch: { nombre: 'X' } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(claves()).toEqual([]);
  });

  it('expone el ApiError tipado cuando falla, no un throw crudo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    const { queryClient } = crearQueryClientEspiado();

    const { result } = renderHook(() => useActualizarCategoria(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({ id: 'cat-1', patch: { nombre: 'X' } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      tag: 'unauthorized',
      message: 'Sesión no válida.',
    });
  });
});
