import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useReclasificarCategoria } from './use-reclasificar-categoria';
import type { ReclasificarCategoriaDto } from './types';

const validDto: ReclasificarCategoriaDto = {
  id: 'tx-1',
  categoria: { id: 'categoria-transporte', nombre: 'Transporte' },
  bucket: 'Necesidades',
};

function crearWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useReclasificarCategoria', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a PATCH /api/transacciones/:id/categoria con el nombre elegido', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validDto),
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => useReclasificarCategoria('2026-07', 'Necesidades'),
      {
        wrapper: crearWrapper(queryClient),
      },
    );

    act(() => {
      result.current.mutate({ transaccionId: 'tx-1', categoria: 'Transporte' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transacciones/tx-1/categoria',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ categoria: 'Transporte' }),
      }),
    );
  });

  it('queda isPending mientras la request está en curso', async () => {
    let resolverFetch: (value: unknown) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolverFetch = resolve;
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => useReclasificarCategoria('2026-07', 'Necesidades'),
      {
        wrapper: crearWrapper(queryClient),
      },
    );

    act(() => {
      result.current.mutate({ transaccionId: 'tx-1', categoria: 'Transporte' });
    });

    await waitFor(() => expect(result.current.isPending).toBe(true));

    resolverFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validDto),
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it('invalida 4 keys on success: resumen, detalle-bucket-mes, resumen-anual, ingresos-mes (WCAT-04/WDM-07)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validDto),
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useReclasificarCategoria('2026-07', 'Necesidades'),
      {
        wrapper: crearWrapper(queryClient),
      },
    );

    act(() => {
      result.current.mutate({ transaccionId: 'tx-1', categoria: 'Transporte' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['resumen', '2026-07'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['detalle-bucket-mes', 'Necesidades', '2026-07'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['resumen-anual'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ingresos-mes'] });
    expect(invalidateSpy).toHaveBeenCalledTimes(4);
  });

  it('sin periodo, invalida ["resumen", "actual"], ["detalle-bucket-mes", bucket, "actual"] e ["ingresos-mes"] (no appends period segment to resumen-anual or ingresos-mes invalidation)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validDto),
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useReclasificarCategoria(undefined, 'Necesidades'),
      {
        wrapper: crearWrapper(queryClient),
      },
    );

    act(() => {
      result.current.mutate({ transaccionId: 'tx-1', categoria: 'Transporte' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['resumen', 'actual'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['detalle-bucket-mes', 'Necesidades', 'actual'],
    });
    // ['resumen-anual'] is a prefix invalidation — no period segment appended
    // (the hook does not know which annual period the client cached, same
    // reasoning as ['ingresos-mes'] prefix). The title claims it; pin it here.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['resumen-anual'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ingresos-mes'] });
    expect(invalidateSpy).toHaveBeenCalledTimes(4);
  });

  it('no invalida nada si la mutación falla', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400 }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useReclasificarCategoria('2026-07', 'Necesidades'),
      {
        wrapper: crearWrapper(queryClient),
      },
    );

    act(() => {
      result.current.mutate({ transaccionId: 'tx-1', categoria: 'NoExiste' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(result.current.error).toEqual({
      tag: 'invalid',
      message: 'La categoría elegida no es válida.',
    });
  });
});
