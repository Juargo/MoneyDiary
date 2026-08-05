import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useEliminarIngesta } from './use-eliminar-ingesta';

function crearWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useEliminarIngesta', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('al tener éxito invalida EXACTAMENTE las 4 queries (resumen, resumen-anual, detalle-bucket, ingestas) — ING-06', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204 }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useEliminarIngesta(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('ingesta-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledTimes(4);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['resumen'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['resumen-anual'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['detalle-bucket'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ingestas'] });
  });

  it('una mutación fallida con un error genérico (500) no invalida ninguna caché', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useEliminarIngesta(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('ingesta-1');

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('un 404 (fila ya eliminada, anti-enumeración) invalida SOLO la lista de ingestas, no las vistas de dinero', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useEliminarIngesta(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('ingesta-1');

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ingestas'] });
  });

  it('expone el ApiError tipado cuando falla, no un throw crudo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useEliminarIngesta(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('ingesta-1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      tag: 'unauthorized',
      message: 'Sin acceso.',
    });
  });

  it('llama a DELETE /api/ingestas/:id con el id recibido', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useEliminarIngesta(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('ingesta-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/ingestas/ingesta-1', {
      method: 'DELETE',
    });
  });
});
