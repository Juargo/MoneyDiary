import { afterEach, describe, expect, it, vi } from 'vitest';
import { patchPassword, patchPerfil } from './perfil';

describe('patchPerfil', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('llama PATCH /api/perfil same-origin con el patch como body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await patchPerfil({ nombre: 'Nuevo nombre' });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(fetchMock).toHaveBeenCalledWith('/api/perfil', {
      credentials: 'same-origin',
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre: 'Nuevo nombre' }),
    });
  });

  it('un fallo de red se mapea a tag network, nunca lanza', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    );

    const result = await patchPerfil({ nombre: 'X' });

    expect(result).toEqual({
      ok: false,
      error: {
        tag: 'network',
        message: 'No se pudo conectar con el servidor.',
      },
    });
  });

  it('401 se mapea a tag unauthorized', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    const result = await patchPerfil({ email: 'x@example.com' });

    expect(result).toEqual({
      ok: false,
      error: { tag: 'unauthorized', message: 'Sesión no válida.' },
    });
  });

  it('403 PERFIL_RECHAZADO se mapea a tag server con status y code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          message: 'No autorizado.',
          code: 'PERFIL_RECHAZADO',
        }),
      }),
    );

    const result = await patchPerfil({ email: 'taken@example.com' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toEqual({
      tag: 'server',
      status: 403,
      code: 'PERFIL_RECHAZADO',
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });

  it('403 DEMO_SOLO_LECTURA se mapea a tag server con status y code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          message: 'Cuenta demo.',
          code: 'DEMO_SOLO_LECTURA',
        }),
      }),
    );

    const result = await patchPerfil({ nombre: 'X' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toEqual({
      tag: 'server',
      status: 403,
      code: 'DEMO_SOLO_LECTURA',
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });

  it('un body de error no parseable como JSON no rompe — cae a code undefined', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      }),
    );

    const result = await patchPerfil({ nombre: 'X' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });
});

describe('patchPassword', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('llama PATCH /api/perfil/password same-origin y NO parsea body en 204', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await patchPassword({
      passwordActual: 'actual123',
      passwordNueva: 'nueva12345',
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(fetchMock).toHaveBeenCalledWith('/api/perfil/password', {
      credentials: 'same-origin',
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        passwordActual: 'actual123',
        passwordNueva: 'nueva12345',
      }),
    });
  });

  it('403 PERFIL_RECHAZADO en password se mapea igual que en perfil', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          message: 'No autorizado.',
          code: 'PERFIL_RECHAZADO',
        }),
      }),
    );

    const result = await patchPassword({
      passwordActual: 'mala',
      passwordNueva: 'nueva12345',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toEqual({
      tag: 'server',
      status: 403,
      code: 'PERFIL_RECHAZADO',
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });

  it('400 PASSWORD_INVALIDA se mapea a tag server con code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          message: 'Password inválida.',
          code: 'PASSWORD_INVALIDA',
        }),
      }),
    );

    const result = await patchPassword({
      passwordActual: 'actual123',
      passwordNueva: 'x',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toEqual({
      tag: 'server',
      status: 400,
      code: 'PASSWORD_INVALIDA',
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });

  it('un fallo de red se mapea a tag network, nunca lanza', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    );

    const result = await patchPassword({
      passwordActual: 'a',
      passwordNueva: 'b',
    });

    expect(result).toEqual({
      ok: false,
      error: {
        tag: 'network',
        message: 'No se pudo conectar con el servidor.',
      },
    });
  });
});
