import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteCategoria,
  deletePatron,
  fetchCatalogo,
  patchCategoria,
  patchPatron,
  postCategoria,
  postPatron,
} from './categorias';

const CATEGORIA_VALIDA = {
  id: 'cat-1',
  nombre: 'Supermercado',
  bucket: 'Necesidades',
  transaccionesCount: 3,
  patrones: [
    {
      id: 'pat-1',
      categoriaId: 'cat-1',
      patron: 'LIDER',
      matchType: 'CONTAINS',
      prioridad: 100,
    },
  ],
};

describe('fetchCatalogo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('llama GET /api/categorias same-origin y devuelve el catálogo guardado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ categorias: [CATEGORIA_VALIDA] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchCatalogo();

    expect(result).toEqual({
      ok: true,
      value: { categorias: [CATEGORIA_VALIDA] },
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/categorias', {
      credentials: 'same-origin',
    });
  });

  it('un fallo de red se mapea a tag network, nunca lanza', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    );

    const result = await fetchCatalogo();

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

    const result = await fetchCatalogo();

    expect(result).toEqual({
      ok: false,
      error: { tag: 'unauthorized', message: 'Sesión no válida.' },
    });
  });

  it('403 DEMO_SOLO_LECTURA nunca ocurre en GET pero se mapea igual si el servidor lo enviara', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: 'x', code: 'DEMO_SOLO_LECTURA' }),
      }),
    );

    const result = await fetchCatalogo();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toEqual({
      tag: 'server',
      status: 403,
      code: 'DEMO_SOLO_LECTURA',
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });

  it('un 200 con un body que no es un objeto se mapea a tag parse, nunca lanza', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, json: async () => null }),
    );

    const result = await fetchCatalogo();

    expect(result).toEqual({
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    });
  });

  it('un 200 cuya categoría no trae transaccionesCount (guardada como number) se mapea a tag parse', async () => {
    const { transaccionesCount, ...sinConteo } = CATEGORIA_VALIDA;
    void transaccionesCount;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ categorias: [sinConteo] }),
      }),
    );

    const result = await fetchCatalogo();

    expect(result).toEqual({
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    });
  });

  it('un 200 cuyo patrón anidado no trae prioridad (guardada como number) se mapea a tag parse', async () => {
    const categoriaConPatronRoto = {
      ...CATEGORIA_VALIDA,
      patrones: [{ ...CATEGORIA_VALIDA.patrones[0], prioridad: 'cien' }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ categorias: [categoriaConPatronRoto] }),
      }),
    );

    const result = await fetchCatalogo();

    expect(result).toEqual({
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    });
  });

  it('un bucket desconocido NO rompe el guard — el servidor es la autoridad de validez (ADR-024)', async () => {
    const categoriaBucketDesconocido = { ...CATEGORIA_VALIDA, bucket: 'Otros' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ categorias: [categoriaBucketDesconocido] }),
      }),
    );

    const result = await fetchCatalogo();

    expect(result).toEqual({
      ok: true,
      value: { categorias: [categoriaBucketDesconocido] },
    });
  });
});

describe('postCategoria', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('llama POST /api/categorias same-origin con el input como body y devuelve la categoría creada (D-06)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => CATEGORIA_VALIDA,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await postCategoria({
      nombre: 'Mascotas',
      bucket: 'Deseos',
    });

    expect(result).toEqual({ ok: true, value: CATEGORIA_VALIDA });
    expect(fetchMock).toHaveBeenCalledWith('/api/categorias', {
      credentials: 'same-origin',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre: 'Mascotas', bucket: 'Deseos' }),
    });
  });

  it('serializa patrones en el body cuando se envían (CAT038-10)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => CATEGORIA_VALIDA,
    });
    vi.stubGlobal('fetch', fetchMock);

    await postCategoria({
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones: [{ patron: 'PETCO', matchType: 'CONTAINS' }],
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/categorias', {
      credentials: 'same-origin',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Mascotas',
        bucket: 'Deseos',
        patrones: [{ patron: 'PETCO', matchType: 'CONTAINS' }],
      }),
    });
  });

  it('un 201 con body malformado (sin transaccionesCount) se mapea a tag parse, nunca lanza', async () => {
    const { transaccionesCount, ...malformado } = CATEGORIA_VALIDA;
    void transaccionesCount;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => malformado,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await postCategoria({
      nombre: 'Mascotas',
      bucket: 'Deseos',
    });

    expect(result).toEqual({
      ok: false,
      error: { tag: 'parse', message: 'Respuesta inesperada del servidor.' },
    });
  });

  it('400 con indice se levanta a ApiError.server.indice (CAT038-11)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          message: 'x',
          code: 'PATRON_FORMATO_INVALIDO',
          indice: 1,
        }),
      }),
    );

    const result = await postCategoria({
      nombre: 'Mascotas',
      bucket: 'Deseos',
      patrones: [
        { patron: 'A', matchType: 'CONTAINS' },
        { patron: '', matchType: 'CONTAINS' },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toEqual({
      tag: 'server',
      status: 400,
      code: 'PATRON_FORMATO_INVALIDO',
      indice: 1,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });

  it('un fallo de red se mapea a tag network, nunca lanza', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    );

    const result = await postCategoria({ nombre: 'X', bucket: 'Ahorro' });

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

    const result = await postCategoria({ nombre: 'X', bucket: 'Ahorro' });

    expect(result).toEqual({
      ok: false,
      error: { tag: 'unauthorized', message: 'Sesión no válida.' },
    });
  });

  it('400 NOMBRE_INVALIDO se mapea a tag server con status y code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          message: 'El nombre debe tener entre 1 y 40 caracteres.',
          code: 'NOMBRE_INVALIDO',
        }),
      }),
    );

    const result = await postCategoria({ nombre: '', bucket: 'Ahorro' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toEqual({
      tag: 'server',
      status: 400,
      code: 'NOMBRE_INVALIDO',
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });

  it('403 DEMO_SOLO_LECTURA se mapea a tag server con code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: 'x', code: 'DEMO_SOLO_LECTURA' }),
      }),
    );

    const result = await postCategoria({ nombre: 'X', bucket: 'Ahorro' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toEqual({
      tag: 'server',
      status: 403,
      code: 'DEMO_SOLO_LECTURA',
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });

  it('409 NOMBRE_DUPLICADO se mapea a tag server con code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ message: 'x', code: 'NOMBRE_DUPLICADO' }),
      }),
    );

    const result = await postCategoria({
      nombre: 'Mascotas',
      bucket: 'Ahorro',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toEqual({
      tag: 'server',
      status: 409,
      code: 'NOMBRE_DUPLICADO',
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

    const result = await postCategoria({ nombre: 'X', bucket: 'Ahorro' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });
});

describe('patchCategoria', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('llama PATCH /api/categorias/:id same-origin con el patch como body y descarta el body de éxito', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => CATEGORIA_VALIDA,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await patchCategoria('cat-1', { bucket: 'Deseos' });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(fetchMock).toHaveBeenCalledWith('/api/categorias/cat-1', {
      credentials: 'same-origin',
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bucket: 'Deseos' }),
    });
  });

  it('404 CATEGORIA_NO_ENCONTRADA se mapea a tag server con code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: 'x', code: 'CATEGORIA_NO_ENCONTRADA' }),
      }),
    );

    const result = await patchCategoria('cat-borrada', { nombre: 'X' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toEqual({
      tag: 'server',
      status: 404,
      code: 'CATEGORIA_NO_ENCONTRADA',
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });
});

describe('deleteCategoria', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('llama DELETE /api/categorias/:id same-origin y NO parsea body en 204', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deleteCategoria('cat-1');

    expect(result).toEqual({ ok: true, value: undefined });
    expect(fetchMock).toHaveBeenCalledWith('/api/categorias/cat-1', {
      credentials: 'same-origin',
      method: 'DELETE',
    });
  });

  /**
   * WCTG-08 (scenario: "No 409 handling exists to find") — decisión 5,
   * CAT038-04: el borrado SIEMPRE responde 204 para la propia fila del
   * caller, en uso o no. Este test no asume que un 409 sea imposible de
   * enviar por el mock; prueba que SI llegara, `deleteCategoria` no tiene
   * ninguna rama dedicada para él — cae en la rama genérica `!res.ok`
   * exactamente igual que un 500, con el `code` del body levantado sin
   * transformación especial. Una rama `if (res.status === 409)` agregada
   * por error haría este test fallar (produciría un mensaje o forma
   * distinta a la genérica).
   */
  it('un 409 (si llegara) cae en la rama genérica no-2xx — no existe rama dedicada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ message: 'x', code: 'ALGO_NO_DOCUMENTADO' }),
      }),
    );

    const result = await deleteCategoria('cat-1');

    expect(result).toEqual({
      ok: false,
      error: {
        tag: 'server',
        status: 409,
        code: 'ALGO_NO_DOCUMENTADO',
        message: 'Ocurrió un error inesperado. Intenta nuevamente.',
      },
    });
  });

  it('un fallo de red se mapea a tag network, nunca lanza', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    );

    const result = await deleteCategoria('cat-1');

    expect(result).toEqual({
      ok: false,
      error: {
        tag: 'network',
        message: 'No se pudo conectar con el servidor.',
      },
    });
  });
});

describe('postPatron', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('llama POST /api/patrones same-origin con el input como body y descarta el body de éxito', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => CATEGORIA_VALIDA.patrones[0],
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await postPatron({
      categoriaId: 'cat-1',
      patron: 'JUMBO',
      matchType: 'CONTAINS',
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(fetchMock).toHaveBeenCalledWith('/api/patrones', {
      credentials: 'same-origin',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        categoriaId: 'cat-1',
        patron: 'JUMBO',
        matchType: 'CONTAINS',
      }),
    });
  });

  it('400 REGEX_INVALIDA se mapea a tag server con code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'x', code: 'REGEX_INVALIDA' }),
      }),
    );

    const result = await postPatron({
      categoriaId: 'cat-1',
      patron: '(',
      matchType: 'REGEX',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toEqual({
      tag: 'server',
      status: 400,
      code: 'REGEX_INVALIDA',
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });
});

describe('patchPatron', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('llama PATCH /api/patrones/:id same-origin con el patch como body y descarta el body de éxito', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => CATEGORIA_VALIDA.patrones[0],
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await patchPatron('pat-1', { matchType: 'STARTS_WITH' });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(fetchMock).toHaveBeenCalledWith('/api/patrones/pat-1', {
      credentials: 'same-origin',
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matchType: 'STARTS_WITH' }),
    });
  });

  it('404 PATRON_NO_ENCONTRADO se mapea a tag server con code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: 'x', code: 'PATRON_NO_ENCONTRADO' }),
      }),
    );

    const result = await patchPatron('pat-borrado', { patron: 'X' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toEqual({
      tag: 'server',
      status: 404,
      code: 'PATRON_NO_ENCONTRADO',
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });
});

describe('deletePatron', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('llama DELETE /api/patrones/:id same-origin y NO parsea body en 204', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deletePatron('pat-1');

    expect(result).toEqual({ ok: true, value: undefined });
    expect(fetchMock).toHaveBeenCalledWith('/api/patrones/pat-1', {
      credentials: 'same-origin',
      method: 'DELETE',
    });
  });

  it('409 PATRON_DUPLICADO (aunque delete no lo emite hoy) se mapea a tag server con code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ message: 'x', code: 'PATRON_DUPLICADO' }),
      }),
    );

    const result = await deletePatron('pat-1');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toEqual({
      tag: 'server',
      status: 409,
      code: 'PATRON_DUPLICADO',
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });
});
