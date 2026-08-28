/**
 * Tests for `useRegistrarMovimiento` hook — US-060 T-06 (RED) → T-07 (GREEN).
 *
 * Coverage (D-05):
 * - mutationFn unwraps a successful ApiResult<RegistrarMovimientoManualDto>.
 * - mutationFn throws the tagged ApiError when postMovimientoManual returns ok:false.
 * - onSuccess invalidates EXACTLY ['resumen'], ['resumen-anual'],
 *   ['detalle-bucket-mes'], ['ingresos-mes'] (all 4 keys, verified individually).
 * - onSuccess does NOT call invalidateQueries with ['ingestas'] (the wrong 4th
 *   key from useCommitIngesta — must not appear in useRegistrarMovimiento).
 * - Router-agnostic: verified by absence of any router import in the hook (static guarantee, D-05).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useRegistrarMovimiento } from './use-registrar-movimiento';
import { unMovimientoManualDto } from '@/test-utils/movimiento-fixtures';

// ---------------------------------------------------------------------------
// Canonical DTO
// ---------------------------------------------------------------------------

const canonicalDto = unMovimientoManualDto({
  fecha: '2026-08-22T14:30:00.000Z',
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function crearWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const validIngresoBody = {
  tipo: 'Ingreso' as const,
  fecha: '2026-08-22',
  descripcion: 'Almuerzo',
  monto: '5000',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useRegistrarMovimiento', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mutationFn unwraps a successful ApiResult and resolves the typed DTO', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(canonicalDto),
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useRegistrarMovimiento(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate(validIngresoBody);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(canonicalDto);
  });

  it('mutationFn throws the tagged ApiError when postMovimientoManual returns ok:false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useRegistrarMovimiento(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate(validIngresoBody);

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual({
      tag: 'unauthorized',
      message: 'Tu sesión expiró. Inicia sesión de nuevo.',
    });
  });

  it('onSuccess invalidates exactly the 4 required query keys', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(canonicalDto),
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useRegistrarMovimiento(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate(validIngresoBody);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledTimes(4);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['resumen'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['resumen-anual'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['detalle-bucket-mes'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['ingresos-mes'],
    });
  });

  it('onSuccess does NOT invalidate ["ingestas"] (wrong 4th key from useCommitIngesta)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(canonicalDto),
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useRegistrarMovimiento(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate(validIngresoBody);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['ingestas'],
    });
  });
});
