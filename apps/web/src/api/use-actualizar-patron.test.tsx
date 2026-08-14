import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useActualizarPatron } from './use-actualizar-patron';

/**
 * use-actualizar-patron.test.tsx (US-043 PR #4, design.md §1/Q9b, WCTG-04,
 * WCTG-09) — `PATCH /api/patrones/:id`, fired per row on blur-or-Enter.
 * Perfil A (`invalidarCatalogo`): editing a pattern's `patron`/`matchType`
 * is a mutation of PATRÓN, not of category.
 */
function crearWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function crearQueryClientEspiado() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const espia = vi.spyOn(queryClient, 'invalidateQueries');
  const claves = () => espia.mock.calls.map(([arg]) => arg?.queryKey);
  return { queryClient, claves };
}

describe('useActualizarPatron', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a PATCH /api/patrones/:id con el patch recibido', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const { queryClient } = crearQueryClientEspiado();

    const { result } = renderHook(() => useActualizarPatron(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({ id: 'pat-1', patch: { patron: 'spotify' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/patrones/pat-1', {
      credentials: 'same-origin',
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patron: 'spotify' }),
    });
  });

  it('al tener éxito invalida EXACTAMENTE ["categorias"] (WCTG-09 perfil A, inclusión)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    const { queryClient, claves } = crearQueryClientEspiado();

    const { result } = renderHook(() => useActualizarPatron(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({ id: 'pat-1', patch: { matchType: 'REGEX' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(claves()).toEqual([['categorias']]);
  });

  it('una mutación fallida no invalida ninguna caché', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400 }),
    );
    const { queryClient, claves } = crearQueryClientEspiado();

    const { result } = renderHook(() => useActualizarPatron(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({ id: 'pat-1', patch: { patron: '' } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(claves()).toEqual([]);
  });

  it('expone el ApiError tipado cuando falla, no un throw crudo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    const { queryClient } = crearQueryClientEspiado();

    const { result } = renderHook(() => useActualizarPatron(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({ id: 'pat-1', patch: { patron: 'x' } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      tag: 'unauthorized',
      message: 'Sesión no válida.',
    });
  });

  it('LA EXCLUSIÓN (non-negotiable #4, task 39) — NO invalida ninguna clave del dashboard', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    const { queryClient, claves } = crearQueryClientEspiado();

    const { result } = renderHook(() => useActualizarPatron(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate({ id: 'pat-1', patch: { patron: 'spotify' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(claves()).toEqual([['categorias']]);
  });
});
