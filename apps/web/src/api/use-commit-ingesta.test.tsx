/**
 * useCommitIngesta unit tests (US-059 PR1, T-06 RED → T-07 GREEN).
 *
 * Tests cover:
 *   - mutationFn unwraps a successful ApiResult<CommitIngestaDto>
 *   - mutationFn throws the tagged ApiError when postCommitIngesta returns ok:false
 *   - onSuccess invalidates all 4 required query keys (resumen, resumen-anual,
 *     detalle-bucket-mes, ingestas) — D-05, WEB-PRV-06
 *
 * Navigation is NOT asserted here — it lives at the call site (SubirCartola),
 * so the hook stays router-agnostic and testable with a plain QueryClientProvider
 * (no router mock required), per D-05.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useCommitIngesta } from './use-commit-ingesta';
import type { CommitIngestaDto } from './types';

const validCommitDto: CommitIngestaDto = {
  ingestaId: 'ingesta-001',
  totalTransacciones: 2,
  duplicadosOmitidos: 1,
  transacciones: [
    {
      bucket: 'Necesidades',
      categoriaId: 'cat-01',
      cargo: '50000',
      abono: '0',
      descripcion: 'Supermercado',
      fecha: '2026-07-15T00:00:00.000Z',
    },
    {
      bucket: 'Ingreso',
      categoriaId: null,
      cargo: '0',
      abono: '1500000',
      descripcion: 'Sueldo',
      fecha: '2026-07-01T00:00:00.000Z',
    },
  ],
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

describe('useCommitIngesta', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mutationFn unwraps a successful ApiResult<CommitIngestaDto> and resolves the DTO', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(validCommitDto),
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useCommitIngesta(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({ file: archivoDePrueba(), edits: [] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({
      ingestaId: 'ingesta-001',
      totalTransacciones: 2,
    });
  });

  it('mutationFn throws the tagged ApiError when postCommitIngesta returns ok:false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useCommitIngesta(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({ file: archivoDePrueba(), edits: [] });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      tag: 'unauthorized',
      message: 'Tu sesión expiró. Inicia sesión de nuevo.',
    });
  });

  it('onSuccess calls invalidateQueries for all 4 required keys (resumen, resumen-anual, detalle-bucket-mes, ingestas)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(validCommitDto),
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCommitIngesta(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({ file: archivoDePrueba(), edits: [] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledTimes(4);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['resumen'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['resumen-anual'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['detalle-bucket-mes'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ingestas'] });
  });

  it('passes the edits overlay to postCommitIngesta via the FormData body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve(validCommitDto),
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useCommitIngesta(), {
      wrapper: crearWrapper(queryClient),
    });

    const edits = [{ rowIndex: 3, categoriaId: 'cat-abc' }];
    result.current.mutate({ file: archivoDePrueba(), edits });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/ingestas/commit');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const body = init.body as FormData;
    expect(body.get('file')).toBeInstanceOf(File);
    expect(body.get('edits')).toBe(JSON.stringify(edits));
  });
});
