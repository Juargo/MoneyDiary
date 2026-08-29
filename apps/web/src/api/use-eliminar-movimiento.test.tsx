import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useEliminarMovimiento } from './use-eliminar-movimiento';

/**
 * use-eliminar-movimiento.test.tsx — SDD `correccion-movimientos-manuales`
 * PR 3 (design D-03). Mirrors `use-eliminar-ingesta.test.tsx`'s shape, minus
 * the ingesta-specific 404 partial-invalidation branch (D-03: this hook's
 * on-success set is the plain `invalidarCachesMovimiento` 4-key call, no
 * special-casing — there is no separate "list" cache analogous to
 * `['ingestas']` for manual movements to refresh on a stale-row 404).
 */
function crearWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useEliminarMovimiento', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('al tener éxito invalida EXACTAMENTE las 4 queries (resumen, resumen-anual, detalle-bucket-mes, ingresos-mes)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204 }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useEliminarMovimiento(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('tx-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledTimes(4);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['resumen'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['resumen-anual'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['detalle-bucket-mes'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ingresos-mes'] });
  });

  it('una mutación fallida no invalida ninguna caché', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useEliminarMovimiento(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('tx-1');

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('expone el ApiError tipado cuando falla, no un throw crudo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useEliminarMovimiento(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('tx-1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      tag: 'unauthorized',
      message: 'Sin acceso.',
    });
  });

  it('llama a DELETE /api/movimientos/:id con el id recibido', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useEliminarMovimiento(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('tx-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/movimientos/tx-1', {
      method: 'DELETE',
    });
  });
});
