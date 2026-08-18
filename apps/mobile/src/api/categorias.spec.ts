/**
 * categorias.spec.ts — call-shape + fetcher-specific guards ONLY (US-044,
 * design.md §3 punto 5, tasks.md T2b.4). `enviarMutacion` es mockeado en el
 * límite del módulo para las seis mutaciones: la matriz completa de
 * branches (red/401/no-2xx/parse) ya se afirma una única vez en
 * `mutacion.spec.ts` y NO se repite aquí (mismo patrón que `perfil.spec.ts`).
 *
 * `fetchCatalogo` es la excepción: tiene SU PROPIO `fetch` (no
 * `enviarMutacion`, design §1.4), así que su llamado + su guard de forma
 * (`esCatalogoDto`/`esCategoriaDto`/`esPatronDto`) sí se prueban aquí — pero
 * SOLO la forma del llamado y el guard, no la matriz genérica red/401/http
 * ya cubierta por el mismo esqueleto en `client.spec.ts` (`fetchMe`,
 * `fetchResumen`): repetirla sería la misma duplicación que el punto 5 del
 * §3 prohíbe para las mutaciones.
 */
import {
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
  crearPatron,
  actualizarPatron,
  eliminarPatron,
} from './categorias';
import { enviarMutacion } from './mutacion';
import type { CatalogoDto } from '../domain/catalogo.types';

jest.mock('./mutacion', () => ({
  enviarMutacion: jest.fn(),
}));

const mockEnviarMutacion = enviarMutacion as jest.Mock;

// `leerToken` es mockeado en el límite del módulo (igual que
// `mutacion.spec.ts`) porque `fetchCatalogo` reusa `construirHeadersSesion`
// de `client.ts`, que sí llama a SecureStore.
const mockLeerToken = jest.fn<Promise<string | null>, []>();
jest.mock('./session-store', () => ({
  leerToken: () => mockLeerToken(),
}));

function mockFetchOnce(response: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}) {
  const fetchMock = jest.fn().mockResolvedValue(response);
  (global as unknown as { fetch: typeof fetch }).fetch =
    fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/**
 * `fetchCatalogo` reusa `construirHeadersSesion` de `client.ts`, que lee
 * `config.ts` al cargar el módulo — mismo gotcha que `client.spec.ts`/
 * `mutacion.spec.ts`: cada test resetea el registro de módulos y
 * re-requiere.
 */
function requireCategorias(): typeof import('./categorias') {
  return jest.requireActual('./categorias');
}

const patronValido = {
  id: 'pat1',
  categoriaId: 'cat1',
  patron: 'uber',
  matchType: 'CONTAINS',
  prioridad: 100,
};

const categoriaValida = {
  id: 'cat1',
  nombre: 'Transporte',
  bucket: 'Necesidades',
  transaccionesCount: 3,
  patrones: [patronValido],
};

const catalogoValido: CatalogoDto = { categorias: [categoriaValida] };

describe('fetchCatalogo', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    mockLeerToken.mockReset().mockResolvedValue(null);
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_API_BASE_URL: 'https://api.example.com',
      EXPO_PUBLIC_API_KEY: 'test-api-key',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  it('sends GET /api/categorias with construirHeadersSesion headers and resolves the parsed catalog', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(catalogoValido),
    });
    const { fetchCatalogo } = requireCategorias();

    const result = await fetchCatalogo();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/categorias',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'test-api-key' }),
      }),
    );
    expect(result).toEqual({ ok: true, value: catalogoValido });
  });

  it('accepts an unrecognised bucket/matchType value as plain string (D-07 — server is authority, ADR-024/036/037)', async () => {
    const catalogo: CatalogoDto = {
      categorias: [
        {
          ...categoriaValida,
          bucket: 'Otros',
          patrones: [{ ...patronValido, matchType: 'FUZZY' }],
        },
      ],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(catalogo),
    });
    const { fetchCatalogo } = requireCategorias();

    const result = await fetchCatalogo();

    expect(result).toEqual({ ok: true, value: catalogo });
  });

  // Judgment-anticipated test class 1 (tasks.md T2b.4): one accept/reject
  // case per field, missing + wrong-typed — never a single "malformed body"
  // case standing in for all of them. Also covers T2b.6's per-element
  // degrade case (a `null`/non-object element inside `categorias`/
  // `patrones` must resolve `{tag:'parse'}`, never throw).
  type Mutador = (catalogo: CatalogoDto) => unknown;

  function conCategoria(mutar: (categoria: unknown) => unknown): Mutador {
    return (catalogo) => ({
      categorias: (catalogo.categorias as unknown[]).map((cat, i) =>
        i === 0 ? mutar(cat) : cat,
      ),
    });
  }

  function conPatron(mutar: (patron: unknown) => unknown): Mutador {
    return conCategoria((cat) => {
      const categoria = cat as { patrones: unknown[] };
      return {
        ...categoria,
        patrones: categoria.patrones.map((p, i) => (i === 0 ? mutar(p) : p)),
      };
    });
  }

  const CASOS_RECHAZADOS: readonly [string, Mutador][] = [
    [
      'catalogo: categorias falta',
      (c) => {
        const { categorias: _categorias, ...resto } = c;
        return resto;
      },
    ],
    [
      'catalogo: categorias mal-tipado',
      (c) => ({ ...c, categorias: 'no-array' }),
    ],
    [
      'catalogo: elemento de categorias no es objeto (null)',
      () => ({ categorias: [null] }),
    ],
    [
      'categoria: id falta',
      conCategoria((cat) => {
        const { id: _id, ...resto } = cat as Record<string, unknown>;
        return resto;
      }),
    ],
    [
      'categoria: id mal-tipado',
      conCategoria((cat) => ({ ...(cat as object), id: 1 })),
    ],
    [
      'categoria: nombre falta',
      conCategoria((cat) => {
        const { nombre: _nombre, ...resto } = cat as Record<string, unknown>;
        return resto;
      }),
    ],
    [
      'categoria: nombre mal-tipado',
      conCategoria((cat) => ({ ...(cat as object), nombre: 1 })),
    ],
    [
      'categoria: bucket falta',
      conCategoria((cat) => {
        const { bucket: _bucket, ...resto } = cat as Record<string, unknown>;
        return resto;
      }),
    ],
    [
      'categoria: bucket mal-tipado',
      conCategoria((cat) => ({ ...(cat as object), bucket: 1 })),
    ],
    [
      'categoria: transaccionesCount falta',
      conCategoria((cat) => {
        const { transaccionesCount: _t, ...resto } = cat as Record<
          string,
          unknown
        >;
        return resto;
      }),
    ],
    [
      'categoria: transaccionesCount mal-tipado',
      conCategoria((cat) => ({ ...(cat as object), transaccionesCount: '3' })),
    ],
    [
      'categoria: patrones no es array',
      conCategoria((cat) => ({ ...(cat as object), patrones: 'no-array' })),
    ],
    [
      'categoria: elemento de patrones no es objeto (null)',
      conCategoria((cat) => ({ ...(cat as object), patrones: [null] })),
    ],
    [
      'patron: id falta',
      conPatron((p) => {
        const { id: _id, ...resto } = p as Record<string, unknown>;
        return resto;
      }),
    ],
    ['patron: id mal-tipado', conPatron((p) => ({ ...(p as object), id: 1 }))],
    [
      'patron: categoriaId falta',
      conPatron((p) => {
        const { categoriaId: _c, ...resto } = p as Record<string, unknown>;
        return resto;
      }),
    ],
    [
      'patron: categoriaId mal-tipado',
      conPatron((p) => ({ ...(p as object), categoriaId: 1 })),
    ],
    [
      'patron: patron falta',
      conPatron((p) => {
        const { patron: _patron, ...resto } = p as Record<string, unknown>;
        return resto;
      }),
    ],
    [
      'patron: patron mal-tipado',
      conPatron((p) => ({ ...(p as object), patron: 1 })),
    ],
    [
      'patron: matchType falta',
      conPatron((p) => {
        const { matchType: _m, ...resto } = p as Record<string, unknown>;
        return resto;
      }),
    ],
    [
      'patron: matchType mal-tipado',
      conPatron((p) => ({ ...(p as object), matchType: 1 })),
    ],
    [
      'patron: prioridad falta',
      conPatron((p) => {
        const { prioridad: _pr, ...resto } = p as Record<string, unknown>;
        return resto;
      }),
    ],
    [
      'patron: prioridad mal-tipada',
      conPatron((p) => ({ ...(p as object), prioridad: '100' })),
    ],
  ];

  it.each(CASOS_RECHAZADOS)(
    'rejects a malformed catalog body — %s',
    async (_desc, mutar) => {
      mockFetchOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mutar(catalogoValido)),
      });
      const { fetchCatalogo } = requireCategorias();

      const result = await fetchCatalogo();

      expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
    },
  );
});

describe('mutaciones de categorías', () => {
  beforeEach(() => {
    mockEnviarMutacion.mockReset().mockResolvedValue({ ok: true, value: {} });
  });

  it('crearCategoria calls enviarMutacion with POST /api/categorias and the input as body', async () => {
    await crearCategoria({ nombre: 'Transporte', bucket: 'Necesidades' });

    expect(mockEnviarMutacion).toHaveBeenCalledWith('/api/categorias', 'POST', {
      nombre: 'Transporte',
      bucket: 'Necesidades',
    });
  });

  it('actualizarCategoria calls enviarMutacion with PATCH /api/categorias/:id (URL-encoded) and the patch as body', async () => {
    await actualizarCategoria('cat 1', { bucket: 'Deseos' });

    expect(mockEnviarMutacion).toHaveBeenCalledWith(
      '/api/categorias/cat%201',
      'PATCH',
      { bucket: 'Deseos' },
    );
  });

  it('eliminarCategoria calls enviarMutacion with DELETE /api/categorias/:id and no body', async () => {
    await eliminarCategoria('cat1');

    expect(mockEnviarMutacion).toHaveBeenCalledWith(
      '/api/categorias/cat1',
      'DELETE',
    );
  });
});

describe('mutaciones de patrones', () => {
  beforeEach(() => {
    mockEnviarMutacion.mockReset().mockResolvedValue({ ok: true, value: {} });
  });

  it('crearPatron calls enviarMutacion with POST /api/patrones and prioridad absent from the body (binding decision 3)', async () => {
    await crearPatron({
      categoriaId: 'cat1',
      patron: 'uber',
      matchType: 'CONTAINS',
    });

    expect(mockEnviarMutacion).toHaveBeenCalledWith('/api/patrones', 'POST', {
      categoriaId: 'cat1',
      patron: 'uber',
      matchType: 'CONTAINS',
    });
    const [, , body] = mockEnviarMutacion.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(body).not.toHaveProperty('prioridad');
  });

  it('actualizarPatron calls enviarMutacion with PATCH /api/patrones/:id and prioridad absent from the body (binding decision 3)', async () => {
    await actualizarPatron('pat1', { matchType: 'REGEX' });

    expect(mockEnviarMutacion).toHaveBeenCalledWith(
      '/api/patrones/pat1',
      'PATCH',
      { matchType: 'REGEX' },
    );
    const [, , body] = mockEnviarMutacion.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(body).not.toHaveProperty('prioridad');
  });

  it('eliminarPatron calls enviarMutacion with DELETE /api/patrones/:id and no body', async () => {
    await eliminarPatron('pat1');

    expect(mockEnviarMutacion).toHaveBeenCalledWith(
      '/api/patrones/pat1',
      'DELETE',
    );
  });
});
