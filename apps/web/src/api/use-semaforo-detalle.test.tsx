import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useSemaforoDetalle } from './use-semaforo-detalle';
import type { SemaforoDetalleDto } from './types';

const validDto: SemaforoDetalleDto = {
  periodo: '2026-07',
  totalIngreso: '1000000',
  sinIngreso: false,
  estadoGlobal: 'amarillo',
  diagnostico: 'Tu mes está en amarillo por Ahorro.',
  bucketsCriticos: ['Ahorro'],
  buckets: [
    {
      bucket: 'Necesidades',
      total: '400000',
      porcentajeBp: 4000,
      estadoSemaforo: 'verde',
      metaBp: 5000,
      bandas: {
        verdeMin: null,
        verdeMax: 5000,
        amarilloMin: null,
        amarilloMax: 6000,
      },
      consejo: null,
    },
    {
      bucket: 'Deseos',
      total: '250000',
      porcentajeBp: 2500,
      estadoSemaforo: 'verde',
      metaBp: 3000,
      bandas: {
        verdeMin: null,
        verdeMax: 3000,
        amarilloMin: null,
        amarilloMax: 4000,
      },
      consejo: null,
    },
    {
      bucket: 'Ahorro',
      total: '150000',
      porcentajeBp: 1500,
      estadoSemaforo: 'amarillo',
      metaBp: 2000,
      bandas: {
        verdeMin: 2000,
        verdeMax: 4000,
        amarilloMin: 1000,
        amarilloMax: 5000,
      },
      consejo: {
        direccion: 'aumentar',
        monto: '49950',
        mensaje: 'Para volver a Verde, aumenta {monto} en Ahorro este mes.',
      },
    },
  ],
  sinCategoria: { cantidad: 2, total: '10000' },
};

// `Wrapper.queryClient` es attached (mirrors `use-detalle-bucket-mes.test.tsx`'s
// own `crearWrapper`) para que un test pueda compartir un único QueryClient
// entre varios `renderHook` (p.ej. inspeccionar `getQueryState` de dos
// queryKeys distintas sin instanciar dos QueryClient independientes).
function crearWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  Wrapper.queryClient = queryClient;
  return Wrapper;
}

describe('useSemaforoDetalle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("usa la queryKey ['semaforo-detalle', periodo ?? 'actual'] y expone el DTO parseado", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validDto),
    });
    vi.stubGlobal('fetch', fetchMock);

    const wrapper = crearWrapper();

    const conPeriodo = renderHook(() => useSemaforoDetalle('2026-07'), {
      wrapper,
    });
    await waitFor(() => expect(conPeriodo.result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/resumen/semaforo?periodo=2026-07',
    );
    expect(conPeriodo.result.current.data).toEqual(validDto);
    expect(
      wrapper.queryClient.getQueryState(['semaforo-detalle', '2026-07']),
    ).toBeDefined();

    const sinPeriodo = renderHook(() => useSemaforoDetalle(), {
      wrapper,
    });
    await waitFor(() => expect(sinPeriodo.result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/resumen/semaforo');
    expect(
      wrapper.queryClient.getQueryState(['semaforo-detalle', 'actual']),
    ).toBeDefined();
  });

  it('expone el ApiError tipado cuando la request falla', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    const { result } = renderHook(() => useSemaforoDetalle(), {
      wrapper: crearWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      tag: 'unauthorized',
      message: 'Sin acceso.',
    });
  });
});
