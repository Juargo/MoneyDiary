import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ME_QUERY_KEY, meQueryOptions, useMe } from './use-me';
import type { MeDto } from './types';

// `.tsx`, not `.ts` (task 1.3's filename) — `crearWrapper` returns JSX
// (`<QueryClientProvider>`), which only `.tsx` parses; every other hook test
// in this directory (`use-resumen.test.tsx`, `use-eliminar-ingesta.test.tsx`)
// uses the same extension for the same reason.

const validMeDto: MeDto = {
  userId: 'user-1',
  email: 'usuario@moneydiary.cl',
  esDemo: false,
  nombre: 'Usuario de Prueba',
  googleVinculado: false,
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

describe('ME_QUERY_KEY / meQueryOptions', () => {
  it('el query key es ["auth-me"], namespaced por el endpoint que refleja', () => {
    expect(ME_QUERY_KEY).toEqual(['auth-me']);
  });

  it('meQueryOptions() usa ME_QUERY_KEY como queryKey', () => {
    expect(meQueryOptions().queryKey).toEqual(ME_QUERY_KEY);
  });
});

describe('useMe', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a GET /api/auth/me y expone el MeDto parseado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validMeDto),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMe(), { wrapper: crearWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', {
      credentials: 'same-origin',
    });
    expect(result.current.data).toEqual(validMeDto);
  });

  it('expone el ApiError tipado cuando la request falla (query.error, no un throw crudo)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    const { result } = renderHook(() => useMe(), { wrapper: crearWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      tag: 'unauthorized',
      message: 'Sesión no válida.',
    });
  });
});
