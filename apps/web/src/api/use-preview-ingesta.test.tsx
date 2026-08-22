import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { usePreviewIngesta } from './use-preview-ingesta';
import type { PreviewIngestaDto } from './types';

// US-059 PR1 (T-02/T-04): updated to canonical shape — the hardened
// `esPreviewIngestaDto` guard now requires `filas` + `resumen` (D-08).
// Legacy `muestra`/`estructura` still present (backend emits them until US-061).
const validDto: PreviewIngestaDto = {
  banco: 'BancoEstado',
  tipoCuenta: 'CuentaRUT',
  numeroCuenta: '12345678',
  estructura: { totalFilasDatos: 120 },
  muestra: [
    {
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'Supermercado',
      cargo: '50000',
      abono: '0',
    },
  ],
  filas: [
    {
      rowIndex: 0,
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'Supermercado',
      cargo: '50000',
      abono: '0',
      esDuplicado: false,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-01' },
    },
  ],
  resumen: { totalFilas: 120, duplicadosDetectados: 5, nuevas: 115 },
};

function archivoDePrueba(): File {
  return new File([new Uint8Array(10)], 'cartola.xlsx');
}

function crearWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('usePreviewIngesta', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('transiciona status idle -> pending -> success y expone el PreviewIngestaDto en data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(validDto),
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => usePreviewIngesta(), {
      wrapper: crearWrapper(queryClient),
    });

    expect(result.current.status).toBe('idle');

    result.current.mutate(archivoDePrueba());

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual(validDto);
  });

  it('expone el ApiError tipado cuando falla, no un throw crudo (mismo patrón que useIngesta)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => usePreviewIngesta(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate(archivoDePrueba());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      tag: 'unauthorized',
      message: 'Tu sesión expiró. Inicia sesión de nuevo.',
    });
  });

  // D10 (design.md §9.4) — the hook-level echo of CA-04: preview mutates
  // nothing server-side, so a successful preview must NOT invalidate any
  // TanStack Query cache, unlike useIngesta (which invalidates 3 on success).
  it('en éxito NO invalida ninguna query (D10, CA-04 a nivel de hook)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(validDto),
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => usePreviewIngesta(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate(archivoDePrueba());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
