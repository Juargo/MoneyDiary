import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { fetchAuthCapabilities, useAuthCapabilities } from './capabilities';
import type { AuthCapabilitiesDto } from './types';

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

function mockFetchOnce(response: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('fetchAuthCapabilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a GET /api/auth/capabilities same-origin', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ googleLoginEnabled: true }),
    });

    await fetchAuthCapabilities();

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/capabilities');
  });

  it('en éxito resuelve {ok: true, value: AuthCapabilitiesDto}', async () => {
    const dto: AuthCapabilitiesDto = { googleLoginEnabled: true };
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(dto) });

    const result = await fetchAuthCapabilities();

    expect(result).toEqual({ ok: true, value: dto });
  });

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await fetchAuthCapabilities();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('network');
  });

  it('mapea un body 2xx que no cumple la forma esperada a {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ nonsense: true }),
    });

    const result = await fetchAuthCapabilities();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea un 401 a {tag: "unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 });

    const result = await fetchAuthCapabilities();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('unauthorized');
  });
});

describe('useAuthCapabilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('expone googleLoginEnabled: true cuando el backend lo activa', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ googleLoginEnabled: true }),
      }),
    );

    const { result } = renderHook(() => useAuthCapabilities(), {
      wrapper: crearWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ googleLoginEnabled: true });
  });

  it('expone googleLoginEnabled: false cuando el backend lo desactiva (kill switch)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ googleLoginEnabled: false }),
      }),
    );

    const { result } = renderHook(() => useAuthCapabilities(), {
      wrapper: crearWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ googleLoginEnabled: false });
  });

  it('expone el ApiError tipado cuando la request falla', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    const { result } = renderHook(() => useAuthCapabilities(), {
      wrapper: crearWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });
});
