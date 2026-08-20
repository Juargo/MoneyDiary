import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useCrearCategoria } from './use-crear-categoria';

/**
 * use-crear-categoria.test.tsx (US-043, design.md §1/Q9a, WCTG-02, WCTG-09)
 * — `POST /api/categorias`. Perfil B (`invalidarCatalogoYDashboard`): una
 * categoría nueva es una mutación de CATEGORÍA, no de patrón.
 *
 * La aserción de invalidación usa el mismo idioma de exact-array-equality de
 * `categorias-invalidacion.test.ts`/PR #1c task 14 — a nivel de hook, no de
 * función pura — para que un `['resumen']` extraviado o un tercer key
 * distinto rompa el test en vez de pasar vacuamente.
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

describe('useCrearCategoria', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a POST /api/categorias con el CategoriaInput recibido', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal('fetch', fetchMock);
    const { queryClient } = crearQueryClientEspiado();

    const { result } = renderHook(() => useCrearCategoria(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({ nombre: 'Streaming', bucket: 'Deseos' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/categorias', {
      credentials: 'same-origin',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre: 'Streaming', bucket: 'Deseos' }),
    });
  });

  it('al tener éxito invalida EXACTAMENTE las 5 claves del perfil B, en orden: categorias, resumen, resumen-anual, detalle-bucket-mes, ingresos-mes (WCTG-09/WDM-09 inclusión)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 201 }),
    );
    const { queryClient, claves } = crearQueryClientEspiado();

    const { result } = renderHook(() => useCrearCategoria(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({ nombre: 'Streaming', bucket: 'Deseos' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(claves()).toEqual([
      ['categorias'],
      ['resumen'],
      ['resumen-anual'],
      ['detalle-bucket-mes'],
      ['ingresos-mes'],
    ]);
  });

  it('una mutación fallida no invalida ninguna caché', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 409 }),
    );
    const { queryClient, claves } = crearQueryClientEspiado();

    const { result } = renderHook(() => useCrearCategoria(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({ nombre: 'Streaming', bucket: 'Deseos' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(claves()).toEqual([]);
  });

  it('expone el ApiError tipado cuando falla, no un throw crudo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    const { queryClient } = crearQueryClientEspiado();

    const { result } = renderHook(() => useCrearCategoria(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({ nombre: 'Streaming', bucket: 'Deseos' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      tag: 'unauthorized',
      message: 'Sesión no válida.',
    });
  });
});
