import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useDesvincularGoogle, useVincularGoogle } from './use-google-vinculo';
import { ME_QUERY_KEY } from './use-me';
import type { MeDto } from './types';

/**
 * use-google-vinculo.test.tsx — US-042 design.md §1/Q9c, task 5.4.
 * `useVincularGoogle` navega vía `window.location.assign` — un MÉTODO, no
 * `location.href = ...`, precisamente porque jsdom no permite reemplazar
 * `window.location` por asignación pero SÍ permite espiar un método
 * (`vi.spyOn`). `useDesvincularGoogle` invalida `['auth-me']` en éxito.
 */
function crearWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const ME: MeDto = {
  userId: 'u1',
  nombre: 'Ana',
  email: 'ana@example.com',
  esDemo: false,
  googleVinculado: false,
};

function clienteConMe(me: MeDto = ME) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(ME_QUERY_KEY, me);
  return queryClient;
}

/**
 * stubLocationAssign — jsdom expone `window.location.assign` como una
 * propiedad NO configurable, así que `vi.spyOn(window.location, 'assign')`
 * lanza "Cannot redefine property". El workaround estándar es reemplazar
 * `window.location` completo por un objeto propio (`writable`, por lo tanto
 * SÍ redefinible) que copia todo lo real y sustituye solo `assign` por un
 * `vi.fn()` — el mismo motivo por el que `use-google-vinculo.ts` llama
 * `window.location.assign(url)` como MÉTODO en vez de `location.href = url`
 * (design.md §1/Q9c): un método es lo único que este mecanismo puede espiar.
 */
function stubLocationAssign() {
  const assign = vi.fn();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, assign },
    writable: true,
    configurable: true,
  });
  return assign;
}

describe('useVincularGoogle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('en éxito llama window.location.assign con la urlAutorizacion devuelta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          urlAutorizacion: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
        }),
      }),
    );
    const assignSpy = stubLocationAssign();

    const queryClient = clienteConMe();
    const { result } = renderHook(() => useVincularGoogle(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('actual123');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(assignSpy).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/v2/auth?x=1',
    );
  });

  it('en fallo (403 PERFIL_RECHAZADO) no navega y expone el ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: 'x', code: 'PERFIL_RECHAZADO' }),
      }),
    );
    const assignSpy = stubLocationAssign();

    const queryClient = clienteConMe();
    const { result } = renderHook(() => useVincularGoogle(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('mala');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(assignSpy).not.toHaveBeenCalled();
    expect(result.current.error).toEqual({
      tag: 'server',
      status: 403,
      code: 'PERFIL_RECHAZADO',
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });

  it('en éxito NO invalida [auth-me] — el cliente se va a Google y beforeLoad re-primea al volver', async () => {
    // Contraparte deliberada de `useDesvincularGoogle`, que SÍ invalida.
    // Vincular termina en `window.location.assign`: la caché se descarta con
    // el documento y el `beforeLoad` del callback vuelve a primearla, así que
    // invalidar acá gasta un round trip que la navegación ya hace. Escrito
    // porque WCFG-03 ahora afirma esta exclusión y una afirmación del
    // contrato sin test que la sostenga es exactamente cómo se esconde un
    // requisito no construido.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          urlAutorizacion: 'https://accounts.google.com/o/oauth2/v2/auth?x=1',
        }),
      }),
    );
    stubLocationAssign();

    const queryClient = clienteConMe();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useVincularGoogle(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('actual123');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe('useDesvincularGoogle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('en éxito invalida [auth-me]', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204 }),
    );

    const queryClient = clienteConMe();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDesvincularGoogle(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('actual123');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ME_QUERY_KEY });
  });

  it('en fallo (403 VINCULO_REQUIERE_PASSWORD) NO invalida nada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          message: 'x',
          code: 'VINCULO_REQUIERE_PASSWORD',
        }),
      }),
    );

    const queryClient = clienteConMe();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDesvincularGoogle(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate('actual123');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(result.current.error).toEqual({
      tag: 'server',
      status: 403,
      code: 'VINCULO_REQUIERE_PASSWORD',
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });
});
