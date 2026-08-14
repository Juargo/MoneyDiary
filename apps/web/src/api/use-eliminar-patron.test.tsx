import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useEliminarPatron } from './use-eliminar-patron';

/**
 * use-eliminar-patron.test.tsx (US-043 PR #4, design.md §1/Q9b, WCTG-04,
 * WCTG-09) — `DELETE /api/patrones/:id`, fired with NO confirmation dialog
 * (a pattern carries no impact — it touches no transaction, `CAT038-04`
 * does not apply). Perfil A (`invalidarCatalogo`).
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

describe('useEliminarPatron', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a DELETE /api/patrones/:id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);
    const { queryClient } = crearQueryClientEspiado();

    const { result } = renderHook(() => useEliminarPatron(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('pat-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/patrones/pat-1', {
      credentials: 'same-origin',
      method: 'DELETE',
    });
  });

  it('al tener éxito invalida EXACTAMENTE ["categorias"] (WCTG-09 perfil A, inclusión)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204 }),
    );
    const { queryClient, claves } = crearQueryClientEspiado();

    const { result } = renderHook(() => useEliminarPatron(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('pat-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(claves()).toEqual([['categorias']]);
  });

  it('una mutación fallida no invalida ninguna caché', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    const { queryClient, claves } = crearQueryClientEspiado();

    const { result } = renderHook(() => useEliminarPatron(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('pat-1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(claves()).toEqual([]);
  });

  it('expone el ApiError tipado cuando falla, no un throw crudo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );
    const { queryClient } = crearQueryClientEspiado();

    const { result } = renderHook(() => useEliminarPatron(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('pat-1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      tag: 'unauthorized',
      message: 'Sesión no válida.',
    });
  });

  it('LA EXCLUSIÓN (non-negotiable #4, task 39) — eliminar un patrón NO invalida las claves LIVE del dashboard', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204 }),
    );
    const { queryClient } = crearQueryClientEspiado();
    // Seed the three dashboard keys as LIVE queries (see
    // `use-crear-patron.test.tsx`'s dedicated exclusion test for why —
    // exact-array-equality on `claves()` already proves the inclusion test
    // above; a byte-identical second `it` on the same spy adds zero
    // coverage. Asserting the seeded queries' OWN `isInvalidated` state
    // gives this test an independent failure mode).
    queryClient.setQueryData(['resumen'], { total: 1 });
    queryClient.setQueryData(['resumen-anual'], { total: 1 });
    queryClient.setQueryData(['detalle-bucket'], { total: 1 });

    const { result } = renderHook(() => useEliminarPatron(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('pat-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(['resumen'])?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(['resumen-anual'])?.isInvalidated).toBe(
      false,
    );
    expect(queryClient.getQueryState(['detalle-bucket'])?.isInvalidated).toBe(
      false,
    );
  });
});
