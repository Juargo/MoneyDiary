import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
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
    const dto: AuthCapabilitiesDto = {
      googleLoginEnabled: true,
      googleLoginMobileEnabled: true,
    };
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
    vi.useRealTimers();
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

  it('expone el ApiError tipado cuando la request falla (tras agotar los reintentos, issue #323)', async () => {
    // `500` es un fallo transitorio (`esErrorPermanente` no lo corta) —
    // con el retry acotado del hook, un 500 persistente reintenta antes de
    // asentarse en error. Fake timers para no esperar en tiempo real el
    // backoff (ver el describe de retry más abajo, mismo patrón).
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    const { result } = renderHook(() => useAuthCapabilities(), {
      wrapper: crearWrapper(),
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });
});

/**
 * Retry policy contra el cold start de Render (issue #323): el API vive en
 * el free tier y se duerme; un arranque en frío midió 73s. `retry: false`
 * (el estado previo) da un único intento — el primer visitante del día
 * pierde la opción de Google en silencio para el resto de la sesión, aunque
 * el backend nunca dejó de tener el kill switch prendido.
 *
 * `crearWrapper()` fija `retry: false` en el `QueryClient` de test, pero eso
 * es solo el default del cliente — la opción `retry` que pasa
 * `useAuthCapabilities` a `useQuery` gana sobre el default (misma jerarquía
 * que usa la app real), así que estos tests SÍ ejercitan el retry real del
 * hook.
 *
 * Fake timers: el backoff exponencial default de TanStack Query llega a
 * decenas de segundos — sin fake timers la suite tardaría minutos reales.
 *
 * `waitFor` de Testing Library queda deliberadamente afuera de este bloque:
 * su polling interno usa `setInterval`/`setTimeout`, que con fake timers
 * activos nunca vuelve a dispararse salvo que se avance el reloj a mano —
 * cuelga hasta el timeout del test. En su lugar se usa `vi.runAllTimersAsync()`
 * envuelto en `act(...)`, que corre en cascada cada `setTimeout` del backoff
 * (y las micro-tareas de cada intento de fetch) hasta que no queda ninguno
 * pendiente — se detiene solo porque el retry está acotado (nunca reintentos
 * indefinidos) — y luego se assertea directo sobre `result.current`.
 */
describe('useAuthCapabilities — retry acotado ante cold start (issue #323)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function correrTodosLosReintentos() {
    await act(async () => {
      await vi.runAllTimersAsync();
    });
  }

  it('reintenta un fallo transitorio (network) y expone el resultado cuando un intento posterior tiene éxito', async () => {
    let intentos = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      intentos += 1;
      if (intentos < 3) {
        return Promise.reject(new Error('offline'));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ googleLoginEnabled: true }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAuthCapabilities(), {
      wrapper: crearWrapper(),
    });

    await correrTodosLosReintentos();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toEqual({ googleLoginEnabled: true });
  });

  it('NO reintenta un fallo permanente (unauthorized) — exactamente un fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAuthCapabilities(), {
      wrapper: crearWrapper(),
    });

    await correrTodosLosReintentos();

    expect(result.current.isError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('acota los reintentos: un fallo transitorio persistente termina fail-closed tras el máximo configurado', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAuthCapabilities(), {
      wrapper: crearWrapper(),
    });

    // corre todo el backoff configurado hasta agotar los reintentos.
    await correrTodosLosReintentos();

    expect(result.current.isError).toBe(true);
    // intento inicial + reintentos acotados, nunca reintentos indefinidos.
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6);
  });
});
