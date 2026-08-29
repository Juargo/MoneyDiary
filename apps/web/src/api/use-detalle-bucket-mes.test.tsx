import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useDetalleBucketMes } from './use-detalle-bucket-mes';
import type { DetalleBucketMesDto } from './types';

const validDto: DetalleBucketMesDto = {
  periodo: '2026-07',
  bucket: 'Necesidades',
  total: '500000',
  totalTransacciones: 2,
  totalCategorias: 1,
  porcentajeBp: 5000,
  metaBp: 5000,
  grupos: [
    {
      categoriaId: 'cat-supermercado',
      nombre: 'Supermercado',
      subtotal: '500000',
      conteo: 2,
      transacciones: [
        {
          id: 'tx-1',
          fecha: '2026-07-15T00:00:00.000Z',
          descripcion: 'Supermercado Líder',
          origen: 'BCI',
          monto: '300000',
        },
        {
          id: 'tx-2',
          fecha: '2026-07-16T00:00:00.000Z',
          descripcion: 'Supermercado Jumbo',
          origen: 'BCI',
          monto: '200000',
        },
      ],
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

describe('useDetalleBucketMes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a /api/buckets/:bucket/detalle con el query param periodo y expone el DTO parseado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validDto),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useDetalleBucketMes('Necesidades', '2026-07'),
      { wrapper: crearWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/buckets/Necesidades/detalle?periodo=2026-07',
    );
    expect(result.current.data).toEqual(validDto);
  });

  it('sin periodo, llama a /api/buckets/:bucket/detalle sin query param (resuelve al mes actual en el backend)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validDto),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDetalleBucketMes('Necesidades'), {
      wrapper: crearWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith('/api/buckets/Necesidades/detalle');
  });

  it('expone el ApiError tipado cuando la request falla', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    const { result } = renderHook(() => useDetalleBucketMes('Necesidades'), {
      wrapper: crearWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      tag: 'unauthorized',
      message: 'Sin acceso.',
    });
  });
});
