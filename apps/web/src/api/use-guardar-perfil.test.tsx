import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { construirPerfilPatch, useGuardarPerfil } from './use-guardar-perfil';
import { ME_QUERY_KEY, useMe } from './use-me';
import { QUERY_CLIENT_DEFAULTS } from './query-client-defaults';
import type { MeDto } from './types';
import type { DraftPerfil } from './use-guardar-perfil';

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

function draftDeMe(overrides: Partial<DraftPerfil> = {}): DraftPerfil {
  return {
    nombre: ME.nombre,
    email: ME.email ?? '',
    passwordActual: '',
    passwordNueva: '',
    ...overrides,
  };
}

function clienteConMe(me: MeDto = ME) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(ME_QUERY_KEY, me);
  return queryClient;
}

/** Captura `MÉTODO url` en orden, para las tres pruebas de secuencia de Q9a. */
function stubFetchOrdenado(
  respuestas: Record<string, { status: number; body?: unknown }>,
) {
  const llamadas: string[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const metodo = init?.method ?? 'GET';
      llamadas.push(`${metodo} ${url}`);
      const respuesta = respuestas[url] ?? { status: 500 };
      return {
        ok: respuesta.status >= 200 && respuesta.status < 300,
        status: respuesta.status,
        json: async () => respuesta.body ?? {},
      };
    },
  );
  return { fetchMock, llamadas };
}

describe('construirPerfilPatch — Q2a change detection', () => {
  it('sin cambios devuelve undefined', () => {
    expect(construirPerfilPatch(draftDeMe(), ME)).toBeUndefined();
  });

  it('un cambio de nombre solo NO exige passwordActual en el patch', () => {
    const patch = construirPerfilPatch(draftDeMe({ nombre: 'Ana María' }), ME);
    expect(patch).toEqual({ nombre: 'Ana María' });
  });

  it('un cambio de email agrega passwordActual al patch', () => {
    const patch = construirPerfilPatch(
      draftDeMe({ email: 'nueva@example.com', passwordActual: 'secreta' }),
      ME,
    );
    expect(patch).toEqual({
      email: 'nueva@example.com',
      passwordActual: 'secreta',
    });
  });

  it('espacios en blanco alrededor NO cuentan como cambio (trim ambos lados)', () => {
    expect(
      construirPerfilPatch(draftDeMe({ nombre: `  ${ME.nombre}  ` }), ME),
    ).toBeUndefined();
  });

  it('me.email null (cuenta demo) se compara contra "" — total, no reporta cambio fantasma', () => {
    const demo: MeDto = { ...ME, esDemo: true, email: null };
    expect(
      construirPerfilPatch(draftDeMe({ email: '' }), demo),
    ).toBeUndefined();
  });
});

describe('useGuardarPerfil — la orquestación secuencial (Q2b/Q2c/Q9a)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Q9a — orden: ambos cambiaron → PATCH /api/perfil ANTES que PATCH /api/perfil/password (array, no "ambos llamados")', async () => {
    const { fetchMock, llamadas } = stubFetchOrdenado({
      '/api/perfil': { status: 200 },
      '/api/perfil/password': { status: 204 },
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = clienteConMe();

    const { result } = renderHook(() => useGuardarPerfil(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate(
      draftDeMe({
        email: 'nueva@example.com',
        passwordActual: 'correcta',
        passwordNueva: 'nueva12345',
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(llamadas).toEqual([
      'PATCH /api/perfil',
      'PATCH /api/perfil/password',
    ]);
    expect(result.current.data).toEqual({
      tipo: 'ok',
      perfilGuardado: true,
      passwordCambiada: true,
    });
  });

  it('Q9a — abort: si el perfil falla, /api/perfil/password NUNCA se llama (row 10)', async () => {
    const { fetchMock, llamadas } = stubFetchOrdenado({
      '/api/perfil': {
        status: 403,
        body: { message: 'No autorizado.', code: 'PERFIL_RECHAZADO' },
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = clienteConMe();

    const { result } = renderHook(() => useGuardarPerfil(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate(
      draftDeMe({
        email: 'taken@example.com',
        passwordActual: 'correcta',
        passwordNueva: 'nueva12345',
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(llamadas).toEqual(['PATCH /api/perfil']);
    expect(result.current.data).toEqual({
      tipo: 'perfil-fallo',
      error: {
        tag: 'server',
        status: 403,
        code: 'PERFIL_RECHAZADO',
        message: 'Ocurrió un error inesperado. Intenta nuevamente.',
      },
    });
  });

  it('Q9a — retry idempotente: tras una falla parcial (row 11), el segundo submit envía SOLO la password (row 11→retry, la caché ya refrescó)', async () => {
    // La password falla la PRIMERA vez (403) y tiene éxito la SEGUNDA — así
    // el test prueba de verdad "el retry manda solo lo que falta", no un
    // stub que siempre rechaza.
    const llamadas: string[] = [];
    let intentosPassword = 0;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const metodo = init?.method ?? 'GET';
        llamadas.push(`${metodo} ${url}`);
        if (url === '/api/perfil') {
          return { ok: true, status: 200, json: async () => ({}) };
        }
        intentosPassword += 1;
        if (intentosPassword === 1) {
          return {
            ok: false,
            status: 403,
            json: async () => ({ message: 'x', code: 'PERFIL_RECHAZADO' }),
          };
        }
        return { ok: true, status: 204, json: async () => ({}) };
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = clienteConMe();

    const { result } = renderHook(() => useGuardarPerfil(), {
      wrapper: crearWrapper(queryClient),
    });

    const draft = draftDeMe({
      nombre: 'Ana Nueva',
      passwordActual: 'correcta',
      passwordNueva: 'nueva12345',
    });

    result.current.mutate(draft);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(llamadas).toEqual([
      'PATCH /api/perfil',
      'PATCH /api/perfil/password',
    ]);
    expect(result.current.data).toEqual({
      tipo: 'password-fallo',
      perfilGuardado: true,
      error: {
        tag: 'server',
        status: 403,
        code: 'PERFIL_RECHAZADO',
        message: 'Ocurrió un error inesperado. Intenta nuevamente.',
      },
    });

    // Simula el refetch que la invalidación de ['auth-me'] dispara en la app
    // real (aquí no hay un `useMe()` observer montado, así que se stampea
    // directo — lo que importa es que la SEGUNDA llamada de `guardar` lea la
    // caché ACTUALIZADA, no un snapshot de montaje).
    queryClient.setQueryData(ME_QUERY_KEY, { ...ME, nombre: 'Ana Nueva' });
    llamadas.length = 0;

    result.current.mutate(draft);
    await waitFor(() =>
      expect(result.current.data).toEqual({
        tipo: 'ok',
        perfilGuardado: false,
        passwordCambiada: true,
      }),
    );

    expect(llamadas).toEqual(['PATCH /api/perfil/password']);
  });

  it('un fallo de perfil (row 6) invalida onSuccess pero NO invalida ["auth-me"] — nada cambió', async () => {
    const { fetchMock } = stubFetchOrdenado({
      '/api/perfil': {
        status: 403,
        body: { code: 'PERFIL_RECHAZADO' },
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = clienteConMe();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useGuardarPerfil(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate(
      draftDeMe({ email: 'x@example.com', passwordActual: 'c' }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('un password-only fallo (row 8, perfilGuardado=false) NO invalida ["auth-me"]', async () => {
    const { fetchMock } = stubFetchOrdenado({
      '/api/perfil/password': {
        status: 403,
        body: { code: 'PERFIL_RECHAZADO' },
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = clienteConMe();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useGuardarPerfil(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate(
      draftDeMe({ passwordActual: 'mala', passwordNueva: 'nueva12345' }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('un password-fallo con perfilGuardado=true SÍ invalida ["auth-me"] (row 11 — la identidad cambió)', async () => {
    const { fetchMock } = stubFetchOrdenado({
      '/api/perfil': { status: 200 },
      '/api/perfil/password': {
        status: 403,
        body: { code: 'PERFIL_RECHAZADO' },
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = clienteConMe();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useGuardarPerfil(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate(
      draftDeMe({
        nombre: 'Otro',
        passwordActual: 'correcta',
        passwordNueva: 'nueva12345',
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ME_QUERY_KEY });
  });

  it('un password-only éxito (perfilGuardado=false) NO invalida nada — ningún campo de MeDto cambió', async () => {
    const { fetchMock, llamadas } = stubFetchOrdenado({
      '/api/perfil/password': { status: 204 },
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = clienteConMe();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useGuardarPerfil(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate(
      draftDeMe({ passwordActual: 'correcta', passwordNueva: 'nueva12345' }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(llamadas).toEqual(['PATCH /api/perfil/password']);
    expect(result.current.data).toEqual({
      tipo: 'ok',
      perfilGuardado: false,
      passwordCambiada: true,
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('mutation.isPending sigue true hasta que el refetch de ["auth-me"] que invalidateQueries dispara resuelve (regresión: el `return` de onSuccess)', async () => {
    // `/api/auth/me` queda colgado en `authMePromise` — controlado a mano
    // (nunca un timer real) hasta que el test decide destrabarlo. Simula un
    // refetch de identidad lento tras guardar el perfil.
    let resolverAuthMe: (value: unknown) => void = () => {};
    const authMePromise = new Promise((resolve) => {
      resolverAuthMe = resolve;
    });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const metodo = init?.method ?? 'GET';
        if (metodo === 'PATCH' && url === '/api/perfil') {
          return { ok: true, status: 200, json: async () => ({}) };
        }
        if (url === '/api/auth/me') {
          await authMePromise;
          return { ok: true, status: 200, json: async () => ME };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    // `QUERY_CLIENT_DEFAULTS` (mismo staleTime que producción): la caché ya
    // primada no dispara un fetch al montar `useMe()` — la ÚNICA llamada a
    // `/api/auth/me` esperada es la que `invalidateQueries` dispara.
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          ...QUERY_CLIENT_DEFAULTS.defaultOptions?.queries,
          retry: false,
        },
      },
    });
    queryClient.setQueryData(ME_QUERY_KEY, ME);

    const { result } = renderHook(
      () => ({ me: useMe(), mutation: useGuardarPerfil() }),
      { wrapper: crearWrapper(queryClient) },
    );

    expect(result.current.me.isSuccess).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    result.current.mutation.mutate(draftDeMe({ nombre: 'Ana Nueva' }));

    // El PATCH de perfil ya resolvió, `onSuccess` disparó `invalidateQueries`,
    // y el refetch de `auth-me` está en vuelo — pero colgado en
    // `authMePromise`.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.anything()),
    );

    // Sin el `return` de `use-guardar-perfil.ts`, `onSuccess` no espera la
    // promesa de `invalidateQueries` y la mutación ya habría despachado
    // `success` acá — este assert es el que pinnea la regresión.
    expect(result.current.mutation.isPending).toBe(true);
    expect(result.current.mutation.isSuccess).toBe(false);

    resolverAuthMe(undefined);

    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true));
  });
});

describe('useGuardarPerfil — la matriz de las filas 1-4 de Q2c (cero requests)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('row 1 — nada cambió, passwordNueva vacía → cero requests, sin-cambios', async () => {
    const { fetchMock, llamadas } = stubFetchOrdenado({});
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = clienteConMe();

    const { result } = renderHook(() => useGuardarPerfil(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate(draftDeMe());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(llamadas).toEqual([]);
    expect(result.current.data).toEqual({ tipo: 'sin-cambios' });
  });

  it('row 2 — passwordActual tecleada sola (sin passwordNueva) sigue siendo sin-cambios', async () => {
    const { fetchMock, llamadas } = stubFetchOrdenado({});
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = clienteConMe();

    const { result } = renderHook(() => useGuardarPerfil(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate(draftDeMe({ passwordActual: 'algo' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(llamadas).toEqual([]);
    expect(result.current.data).toEqual({ tipo: 'sin-cambios' });
  });

  it('row 3 — email cambiado, passwordActual vacía → cero requests, falta-password-actual', async () => {
    const { fetchMock, llamadas } = stubFetchOrdenado({});
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = clienteConMe();

    const { result } = renderHook(() => useGuardarPerfil(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate(draftDeMe({ email: 'nueva@example.com' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(llamadas).toEqual([]);
    expect(result.current.data).toEqual({ tipo: 'falta-password-actual' });
  });

  it('row 4 — passwordNueva tecleada, passwordActual vacía → cero requests, falta-password-actual', async () => {
    const { fetchMock, llamadas } = stubFetchOrdenado({});
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = clienteConMe();

    const { result } = renderHook(() => useGuardarPerfil(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate(draftDeMe({ passwordNueva: 'nueva12345' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(llamadas).toEqual([]);
    expect(result.current.data).toEqual({ tipo: 'falta-password-actual' });
  });

  it('row 5 — solo nombre cambia, sin password → un solo call, ok', async () => {
    const { fetchMock, llamadas } = stubFetchOrdenado({
      '/api/perfil': { status: 200 },
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = clienteConMe();

    const { result } = renderHook(() => useGuardarPerfil(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate(draftDeMe({ nombre: 'Ana Nueva' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(llamadas).toEqual(['PATCH /api/perfil']);
    expect(result.current.data).toEqual({
      tipo: 'ok',
      perfilGuardado: true,
      passwordCambiada: false,
    });
  });

  it('row 6 — solo nombre cambia y el call falla → un solo call, perfil-fallo', async () => {
    const { fetchMock, llamadas } = stubFetchOrdenado({
      '/api/perfil': { status: 400, body: { code: 'NOMBRE_INVALIDO' } },
    });
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = clienteConMe();

    const { result } = renderHook(() => useGuardarPerfil(), {
      wrapper: crearWrapper(queryClient),
    });

    result.current.mutate(draftDeMe({ nombre: '' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(llamadas).toEqual(['PATCH /api/perfil']);
    expect(result.current.data).toMatchObject({ tipo: 'perfil-fallo' });
  });
});
