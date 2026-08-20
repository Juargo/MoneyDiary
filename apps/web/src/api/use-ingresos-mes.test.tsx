import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useIngresosMes } from './use-ingresos-mes';
import type { IngresosMesDto } from './types';

const validDto: IngresosMesDto = {
  conteo: 2,
  total: '1300000',
  transacciones: [
    {
      id: 'tx-1',
      fecha: '2026-07-03T00:00:00.000Z',
      descripcion: 'Sueldo',
      monto: '1000000',
      origen: 'BCI',
    },
    {
      id: 'tx-2',
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'Venta garage',
      monto: '300000',
      origen: 'Manual',
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

describe('useIngresosMes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('calls /api/ingresos/mes with the periodo query param and exposes the parsed DTO', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validDto),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useIngresosMes('2026-07'), {
      wrapper: crearWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith('/api/ingresos/mes?periodo=2026-07');
    expect(result.current.data).toEqual(validDto);
  });

  it('without periodo, calls /api/ingresos/mes with no query param (backend resolves the current month)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validDto),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useIngresosMes(), {
      wrapper: crearWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith('/api/ingresos/mes');
  });

  it('surfaces the typed ApiError when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    const { result } = renderHook(() => useIngresosMes(), {
      wrapper: crearWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      tag: 'unauthorized',
      message: 'Sin acceso.',
    });
  });
});
