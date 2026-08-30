import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteIngesta,
  fetchApiVersion,
  fetchDetalleBucketMes,
  fetchIngestas,
  fetchIngresosMes,
  fetchResumen,
  fetchResumenAnual,
  fetchSemaforoDetalle,
  postCommitIngesta,
  postIngesta,
  postReclasificarCategoria,
  previewIngesta,
} from './client';
import type {
  ApiVersionDto,
  DetalleBucketMesDto,
  IngestaListItemDto,
  IngestaResponseDto,
  IngresosMesDto,
  PreviewIngestaDto,
  ReclasificarCategoriaDto,
  ResumenAnualDto,
  ResumenMesDto,
  SemaforoDetalleDto,
} from './types';

const validDto: ResumenMesDto = {
  periodo: '2026-07',
  totalIngreso: '1000000',
  sinIngreso: false,
  buckets: [
    {
      bucket: 'Necesidades',
      total: '400000',
      porcentajeBp: 4000,
      estadoSemaforo: 'verde',
    },
    {
      bucket: 'Deseos',
      total: '250000',
      porcentajeBp: 2500,
      estadoSemaforo: 'verde',
    },
    {
      bucket: 'Ahorro',
      total: '350000',
      porcentajeBp: 3500,
      estadoSemaforo: 'amarillo',
    },
    {
      bucket: 'SinCategoria',
      total: '0',
      porcentajeBp: 0,
      estadoSemaforo: null,
    },
  ],
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: 'amarillo',
  cantidadSinCategoria: 0,
};

function mockFetchOnce(response: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('fetchResumen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a GET /api/resumen same-origin, sin base URL ni key (W0-02)', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validDto),
    });

    await fetchResumen();

    expect(fetchMock).toHaveBeenCalledWith('/api/resumen');
  });

  it('agrega el query param periodo cuando se provee', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validDto),
    });

    await fetchResumen('2026-07');

    expect(fetchMock).toHaveBeenCalledWith('/api/resumen?periodo=2026-07');
  });

  it('resuelve {ok: true, value} en un body 2xx válido', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validDto),
    });

    const result = await fetchResumen();

    expect(result).toEqual({ ok: true, value: validDto });
  });

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await fetchResumen();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('network');
  });

  it('mapea un 400 a {tag: "invalid"} ("período inválido")', async () => {
    mockFetchOnce({ ok: false, status: 400 });

    const result = await fetchResumen();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'invalid',
      message: 'El período no es válido.',
    });
  });

  it('mapea un 401 a {tag: "unauthorized"} ("sin acceso")', async () => {
    mockFetchOnce({ ok: false, status: 401 });

    const result = await fetchResumen();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'unauthorized',
      message: 'Sin acceso.',
    });
  });

  it('mapea un 5xx a {tag: "server"} genérico', async () => {
    mockFetchOnce({ ok: false, status: 500 });

    const result = await fetchResumen();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });

  it('mapea un body 2xx que no cumple la forma esperada a {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ nonsense: true }),
    });

    const result = await fetchResumen();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea un body 2xx cuyo json() lanza a {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('invalid json')),
    });

    const result = await fetchResumen();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} sin lanzar cuando buckets[0].total es number en vez de string (money-safety boundary)', async () => {
    const bodyConTotalNumerico = {
      ...validDto,
      buckets: [
        { ...validDto.buckets[0], total: 400000 },
        ...validDto.buckets.slice(1),
      ],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyConTotalNumerico),
    });

    const result = await fetchResumen();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} sin lanzar cuando buckets[0].total es un string no decimal (p.ej. "abc") — nunca llega a formatearMontoCLP', async () => {
    const bodyConTotalMalformado = {
      ...validDto,
      buckets: [
        { ...validDto.buckets[0], total: 'abc' },
        ...validDto.buckets.slice(1),
      ],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyConTotalMalformado),
    });

    const result = await fetchResumen();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  // US-047 WG5-05 (design §3 "DTO guard extension"): `esResumenMesDto` did
  // not validate `cantidadSinCategoria` — a payload missing it, or carrying
  // it as a non-number, used to pass the guard unchanged. The legend now
  // reads the field directly, so either malformed shape must take the same
  // pre-existing WAC-02 rejection path — no new error-handling branch.
  it('mapea a {tag: "parse"} sin lanzar cuando cantidadSinCategoria falta o no es number (WG5-05)', async () => {
    const { cantidadSinCategoria: _omitido, ...bodySinCantidadSinCategoria } =
      validDto;
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodySinCantidadSinCategoria),
    });
    const resultadoFaltante = await fetchResumen();
    expect(resultadoFaltante.ok).toBe(false);
    expect(!resultadoFaltante.ok && resultadoFaltante.error.tag).toBe('parse');

    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ...validDto, cantidadSinCategoria: '7' }),
    });
    const resultadoTipoIncorrecto = await fetchResumen();
    expect(resultadoTipoIncorrecto.ok).toBe(false);
    expect(
      !resultadoTipoIncorrecto.ok && resultadoTipoIncorrecto.error.tag,
    ).toBe('parse');

    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ...validDto, cantidadSinCategoria: null }),
    });
    const resultadoNull = await fetchResumen();
    expect(resultadoNull.ok).toBe(false);
    expect(!resultadoNull.ok && resultadoNull.error.tag).toBe('parse');
  });

  // A legitimate zero must not be confused with a missing/invalid field by
  // the guard itself (WG5-05) — `validDto` already carries
  // `cantidadSinCategoria: 0` and every prior passing test in this describe
  // block (e.g. the "resuelve {ok: true, value}" case) is the accept-path
  // proof; this test names that proof explicitly for `cantidadSinCategoria`.
  it('acepta cantidadSinCategoria: 0 — un cero legítimo no se confunde con un campo faltante (WG5-05)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ...validDto, cantidadSinCategoria: 0 }),
    });

    const result = await fetchResumen();

    expect(result.ok).toBe(true);
  });
});

function mesConPeriodo(periodo: string): ResumenMesDto {
  return { ...validDto, periodo };
}

const validResumenAnualDto: ResumenAnualDto = {
  anio: 2026,
  meses: Array.from({ length: 12 }, (_, i) =>
    mesConPeriodo(`2026-${String(i + 1).padStart(2, '0')}`),
  ),
};

describe('fetchResumenAnual', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a GET /api/resumen/anual same-origin, sin base URL ni key', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validResumenAnualDto),
    });

    await fetchResumenAnual();

    expect(fetchMock).toHaveBeenCalledWith('/api/resumen/anual');
  });

  it('agrega el query param anio cuando se provee', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validResumenAnualDto),
    });

    await fetchResumenAnual(2026);

    expect(fetchMock).toHaveBeenCalledWith('/api/resumen/anual?anio=2026');
  });

  it('resuelve {ok: true, value} en un body 2xx válido con 12 meses', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validResumenAnualDto),
    });

    const result = await fetchResumenAnual(2026);

    expect(result).toEqual({ ok: true, value: validResumenAnualDto });
  });

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await fetchResumenAnual();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('network');
  });

  it('mapea un 400 a {tag: "invalid"} ("año inválido")', async () => {
    mockFetchOnce({ ok: false, status: 400 });

    const result = await fetchResumenAnual();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'invalid',
      message: 'El año no es válido.',
    });
  });

  it('mapea un 401 a {tag: "unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 });

    const result = await fetchResumenAnual();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'unauthorized',
      message: 'Sin acceso.',
    });
  });

  it('mapea un 5xx a {tag: "server"} genérico', async () => {
    mockFetchOnce({ ok: false, status: 500 });

    const result = await fetchResumenAnual();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });

  it('mapea un body 2xx que no cumple la forma esperada a {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ nonsense: true }),
    });

    const result = await fetchResumenAnual();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea un body con menos de 12 meses a {tag: "parse"}', async () => {
    const bodyIncompleto = {
      ...validResumenAnualDto,
      meses: validResumenAnualDto.meses.slice(0, 11),
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyIncompleto),
    });

    const result = await fetchResumenAnual();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea un body con más de 12 meses (13) a {tag: "parse"}', async () => {
    const bodyConExceso = {
      ...validResumenAnualDto,
      meses: [...validResumenAnualDto.meses, mesConPeriodo('2027-01')],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyConExceso),
    });

    const result = await fetchResumenAnual();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea un body con meses: [] a {tag: "parse"}', async () => {
    const bodyVacio = { ...validResumenAnualDto, meses: [] };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyVacio),
    });

    const result = await fetchResumenAnual();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} sin lanzar cuando un mes trae total malformado (money-safety boundary)', async () => {
    const bodyConTotalMalformado = {
      ...validResumenAnualDto,
      meses: [
        {
          ...validResumenAnualDto.meses[0],
          buckets: [
            { ...validResumenAnualDto.meses[0].buckets[0], total: 'abc' },
          ],
        },
        ...validResumenAnualDto.meses.slice(1),
      ],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyConTotalMalformado),
    });

    const result = await fetchResumenAnual();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });
});

const validDetalleBucketMesDto: DetalleBucketMesDto = {
  periodo: '2026-07',
  bucket: 'Necesidades',
  total: '500000',
  totalTransacciones: 2,
  totalCategorias: 1,
  porcentajeBp: 5000,
  metaBp: 5000,
  grupos: [
    {
      categoriaId: 'cat-supermercado',
      nombre: 'Supermercado',
      subtotal: '500000',
      conteo: 2,
      transacciones: [
        {
          id: 'tx-1',
          fecha: '2026-07-15T00:00:00.000Z',
          descripcion: 'Supermercado Líder',
          origen: 'BCI',
          monto: '300000',
        },
        {
          id: 'tx-2',
          fecha: '2026-07-16T00:00:00.000Z',
          descripcion: 'Supermercado Jumbo',
          origen: 'BCI',
          monto: '200000',
        },
      ],
    },
  ],
};

// US-053 (T-03): fetchDetalleBucketMes mirrors fetchResumen's
// never-throw ApiResult<T> shape + status mapping (400/401/5xx/network/parse),
// same-origin GET to /api/buckets/:bucket/detalle[?periodo=YYYY-MM]. The extra
// "parse" cases pin the money-guard-at-the-boundary lesson (WG5-05) for the
// grouped DTO: `total`/`grupos[].subtotal`/`transacciones[].monto` are
// BigInt-safe decimal strings, `porcentajeBp`/`metaBp` are number|null — any
// malformed shape must become a typed ApiError, never reach
// `formatearMontoCLP`/`aDetalleBucketMesViewModel` (D-04).
describe('fetchDetalleBucketMes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a GET /api/buckets/:bucket/detalle same-origin, sin base URL ni key, encodeando el :bucket y agregando periodo cuando se provee', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validDetalleBucketMesDto),
    });

    await fetchDetalleBucketMes('Necesidades');
    expect(fetchMock).toHaveBeenCalledWith('/api/buckets/Necesidades/detalle');

    await fetchDetalleBucketMes('Sin Categoria', '2026-07');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/buckets/Sin%20Categoria/detalle?periodo=2026-07',
    );
  });

  it('resuelve {ok: true, value} en un body 2xx válido', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validDetalleBucketMesDto),
    });

    const result = await fetchDetalleBucketMes('Necesidades', '2026-07');

    expect(result).toEqual({ ok: true, value: validDetalleBucketMesDto });
  });

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await fetchDetalleBucketMes('Necesidades');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('network');
  });

  it('mapea un 400 a {tag: "invalid"} (bucket o período inválido)', async () => {
    mockFetchOnce({ ok: false, status: 400 });

    const result = await fetchDetalleBucketMes('invalido');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'invalid',
      message: 'El bucket o el período no son válidos.',
    });
  });

  it('mapea un 401 a {tag: "unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 });

    const result = await fetchDetalleBucketMes('Necesidades');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'unauthorized',
      message: 'Sin acceso.',
    });
  });

  it('mapea un 5xx a {tag: "server"} genérico', async () => {
    mockFetchOnce({ ok: false, status: 500 });

    const result = await fetchDetalleBucketMes('Necesidades');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });

  it('mapea un body 2xx que no cumple la forma esperada a {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ nonsense: true }),
    });

    const result = await fetchDetalleBucketMes('Necesidades');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} sin lanzar cuando total es un string no decimal (p.ej. "abc") — nunca llega a formatearMontoCLP', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ ...validDetalleBucketMesDto, total: 'abc' }),
    });

    const result = await fetchDetalleBucketMes('Necesidades');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} sin lanzar cuando grupos[0].subtotal es un string no decimal (money-safety boundary)', async () => {
    const bodyConSubtotalMalformado = {
      ...validDetalleBucketMesDto,
      grupos: [
        { ...validDetalleBucketMesDto.grupos[0], subtotal: '12.5' },
        ...validDetalleBucketMesDto.grupos.slice(1),
      ],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyConSubtotalMalformado),
    });

    const result = await fetchDetalleBucketMes('Necesidades');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} sin lanzar cuando transacciones[0].monto es un string no decimal (money guard, WG5-05)', async () => {
    const bodyConMontoMalformado = {
      ...validDetalleBucketMesDto,
      grupos: [
        {
          ...validDetalleBucketMesDto.grupos[0],
          transacciones: [
            {
              ...validDetalleBucketMesDto.grupos[0].transacciones[0],
              monto: '12.5',
            },
            ...validDetalleBucketMesDto.grupos[0].transacciones.slice(1),
          ],
        },
        ...validDetalleBucketMesDto.grupos.slice(1),
      ],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyConMontoMalformado),
    });

    const result = await fetchDetalleBucketMes('Necesidades');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} sin lanzar cuando transacciones[0].fecha no es una fecha parseable', async () => {
    const bodyConFechaMalformada = {
      ...validDetalleBucketMesDto,
      grupos: [
        {
          ...validDetalleBucketMesDto.grupos[0],
          transacciones: [
            {
              ...validDetalleBucketMesDto.grupos[0].transacciones[0],
              fecha: 'not-a-date',
            },
            ...validDetalleBucketMesDto.grupos[0].transacciones.slice(1),
          ],
        },
        ...validDetalleBucketMesDto.grupos.slice(1),
      ],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyConFechaMalformada),
    });

    const result = await fetchDetalleBucketMes('Necesidades');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} sin lanzar cuando porcentajeBp es un string en vez de number|null', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ ...validDetalleBucketMesDto, porcentajeBp: '5000' }),
    });

    const result = await fetchDetalleBucketMes('Necesidades');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} sin lanzar cuando grupos no es un array', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ ...validDetalleBucketMesDto, grupos: 'nope' }),
    });

    const result = await fetchDetalleBucketMes('Necesidades');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });
});

const validIngresosMesDto: IngresosMesDto = {
  conteo: 3,
  total: '1500000',
  transacciones: [
    {
      id: 'tx-1',
      fecha: '2026-07-03T00:00:00.000Z',
      descripcion: 'Sueldo',
      monto: '1000000',
      origen: 'BCI',
    },
    {
      id: 'tx-2',
      fecha: '2026-07-10T00:00:00.000Z',
      descripcion: 'Freelance',
      monto: '300000',
      origen: 'BancoEstado',
    },
    {
      id: 'tx-3',
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'Venta garage',
      monto: '200000',
      origen: 'Manual',
    },
  ],
};

// US-054 PR1 (T-03, D-06): fetchIngresosMes + esIngresosMesDto — same
// never-throw ApiResult discipline as the sibling drill-down fetchers, with
// the money-safety guard pinning `total`/`monto` via esMontoStringValido and
// `fecha` via esFechaValida (fail-closed → {tag:'parse'}).
describe('fetchIngresosMes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('calls GET /api/ingresos/mes same-origin, without periodo, and appends ?periodo= when provided', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validIngresosMesDto),
    });

    await fetchIngresosMes();
    expect(fetchMock).toHaveBeenCalledWith('/api/ingresos/mes');

    await fetchIngresosMes('2026-07');
    expect(fetchMock).toHaveBeenCalledWith('/api/ingresos/mes?periodo=2026-07');
  });

  it('resolves {ok: true, value} on a valid 2xx body', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validIngresosMesDto),
    });

    const result = await fetchIngresosMes('2026-07');

    expect(result).toEqual({ ok: true, value: validIngresosMesDto });
  });

  it('accepts the WDI-04 empty-month body (200 zeros)', async () => {
    const bodyMesVacio = { conteo: 0, total: '0', transacciones: [] };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyMesVacio),
    });

    const result = await fetchIngresosMes('2026-02');

    expect(result).toEqual({ ok: true, value: bodyMesVacio });
  });

  it('maps a fetch rejection to {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await fetchIngresosMes();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('network');
  });

  it('maps a 400 to {tag: "invalid"} (invalid period)', async () => {
    mockFetchOnce({ ok: false, status: 400 });

    const result = await fetchIngresosMes('2026-13');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'invalid',
      message: 'El período no es válido.',
    });
  });

  it('maps a 401 to {tag: "unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 });

    const result = await fetchIngresosMes();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'unauthorized',
      message: 'Sin acceso.',
    });
  });

  it('maps a 5xx to a generic {tag: "server"}', async () => {
    mockFetchOnce({ ok: false, status: 500 });

    const result = await fetchIngresosMes();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });

  it('maps a 2xx body whose json() rejects to {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('invalid json')),
    });

    const result = await fetchIngresosMes();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('maps to {tag: "parse"} without throwing when total is not a decimal string (e.g. "abc")', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ...validIngresosMesDto, total: 'abc' }),
    });

    const result = await fetchIngresosMes();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('maps to {tag: "parse"} without throwing when transacciones[0].monto is a non-BigInt-safe decimal (e.g. "12.5")', async () => {
    const bodyConMontoMalformado = {
      ...validIngresosMesDto,
      transacciones: [
        {
          ...validIngresosMesDto.transacciones[0],
          monto: '12.5',
        },
        ...validIngresosMesDto.transacciones.slice(1),
      ],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyConMontoMalformado),
    });

    const result = await fetchIngresosMes();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('maps to {tag: "parse"} without throwing when transacciones[0].fecha is not a parseable date', async () => {
    const bodyConFechaMalformada = {
      ...validIngresosMesDto,
      transacciones: [
        {
          ...validIngresosMesDto.transacciones[0],
          fecha: 'not-a-date',
        },
        ...validIngresosMesDto.transacciones.slice(1),
      ],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyConFechaMalformada),
    });

    const result = await fetchIngresosMes();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('maps to {tag: "parse"} without throwing when transacciones[0].origen is not a string (shape-reject, MID-02)', async () => {
    const bodyConOrigenInvalido = {
      ...validIngresosMesDto,
      transacciones: [
        {
          ...validIngresosMesDto.transacciones[0],
          origen: 42,
        },
        ...validIngresosMesDto.transacciones.slice(1),
      ],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyConOrigenInvalido),
    });

    const result = await fetchIngresosMes();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('maps to {tag: "parse"} without throwing when transacciones[0].origen is empty (contract §6: non-empty string)', async () => {
    const bodyConOrigenVacio = {
      ...validIngresosMesDto,
      transacciones: [
        {
          ...validIngresosMesDto.transacciones[0],
          origen: '',
        },
        ...validIngresosMesDto.transacciones.slice(1),
      ],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyConOrigenVacio),
    });

    const result = await fetchIngresosMes();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('maps to {tag: "parse"} without throwing when transacciones[0].monto is a JSON number, not a decimal string', async () => {
    const bodyConMontoNumerico = {
      ...validIngresosMesDto,
      transacciones: [
        {
          ...validIngresosMesDto.transacciones[0],
          monto: 1000000,
        },
        ...validIngresosMesDto.transacciones.slice(1),
      ],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyConMontoNumerico),
    });

    const result = await fetchIngresosMes();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('maps to {tag: "parse"} without throwing when conteo is not a number', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ...validIngresosMesDto, conteo: '3' }),
    });

    const result = await fetchIngresosMes();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('maps to {tag: "parse"} without throwing when transacciones is not an array', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ ...validIngresosMesDto, transacciones: 'nope' }),
    });

    const result = await fetchIngresosMes();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });
});

const validReclasificarDto: ReclasificarCategoriaDto = {
  id: 'tx-1',
  categoria: { id: 'categoria-transporte', nombre: 'Transporte' },
  bucket: 'Necesidades',
};

describe('postReclasificarCategoria', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a PATCH /api/transacciones/:id/categoria same-origin con { categoria } en el body', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validReclasificarDto),
    });

    await postReclasificarCategoria('tx-1', 'Transporte');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transacciones/tx-1/categoria',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ categoria: 'Transporte' }),
      },
    );
  });

  it('encodea el :id en la URL', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validReclasificarDto),
    });

    await postReclasificarCategoria('tx con espacio', 'Transporte');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transacciones/tx%20con%20espacio/categoria',
      expect.anything(),
    );
  });

  it('resuelve {ok: true, value} en un body 2xx válido', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validReclasificarDto),
    });

    const result = await postReclasificarCategoria('tx-1', 'Transporte');

    expect(result).toEqual({ ok: true, value: validReclasificarDto });
  });

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await postReclasificarCategoria('tx-1', 'Transporte');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('network');
  });

  it('mapea un 400 a {tag: "invalid"} (categoría desconocida)', async () => {
    mockFetchOnce({ ok: false, status: 400 });

    const result = await postReclasificarCategoria('tx-1', 'NoExiste');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('invalid');
  });

  it('mapea un 401 a {tag: "unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 });

    const result = await postReclasificarCategoria('tx-1', 'Transporte');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'unauthorized',
      message: 'Sin acceso.',
    });
  });

  it('mapea un 404 (no existe / no es del usuario) a {tag: "server", status: 404}', async () => {
    mockFetchOnce({ ok: false, status: 404 });

    const result = await postReclasificarCategoria('tx-ajena', 'Transporte');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 404,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });

  it('mapea un 5xx a {tag: "server"} genérico', async () => {
    mockFetchOnce({ ok: false, status: 500 });

    const result = await postReclasificarCategoria('tx-1', 'Transporte');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });

  it('mapea un body 2xx que no cumple la forma esperada a {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ nonsense: true }),
    });

    const result = await postReclasificarCategoria('tx-1', 'Transporte');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });
});

const validIngestaDto: IngestaResponseDto = {
  ingestaId: 'ingesta-1',
  banco: 'BancoEstado',
  tipoCuenta: 'CuentaRUT',
  numeroCuenta: '12345678',
  archivo: { nombre: 'cartola.xlsx', extension: '.xlsx', tamanoBytes: 2048 },
  totalTransacciones: 1,
  duplicadosOmitidos: 0,
  transacciones: [
    {
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'Supermercado',
      cargo: '50000',
      abono: '0',
    },
  ],
};

function archivoDePrueba(): File {
  return new File([new Uint8Array(10)], 'cartola.xlsx');
}

describe('postIngesta', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a POST /api/ingestas same-origin con el archivo en un FormData bajo el campo "file"', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validIngestaDto),
    });
    const archivo = archivoDePrueba();

    await postIngesta(archivo);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/ingestas');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBe(archivo);
  });

  it('no fija manualmente un header Content-Type (el browser genera el boundary del multipart)', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validIngestaDto),
    });

    await postIngesta(archivoDePrueba());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headerKeys = init.headers
      ? Object.keys(init.headers as Record<string, string>)
      : [];
    expect(headerKeys.some((key) => key.toLowerCase() === 'content-type')).toBe(
      false,
    );
  });

  it('resuelve {ok: true, value} en un body 2xx válido', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validIngestaDto),
    });

    const result = await postIngesta(archivoDePrueba());

    expect(result).toEqual({ ok: true, value: validIngestaDto });
  });

  it('mapea un 400 pasando el body.message del backend verbatim (sin remap del cliente) — mensaje A', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          statusCode: 400,
          message: 'Banco no reconocido.',
          error: 'Bad Request',
        }),
    });

    const result = await postIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'invalid',
      message: 'Banco no reconocido.',
    });
  });

  it('mapea un 400 pasando el body.message del backend verbatim (sin remap del cliente) — mensaje B, distinto del A', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          statusCode: 400,
          message: 'El PDF no contiene texto extraíble.',
          error: 'Bad Request',
        }),
    });

    const result = await postIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'invalid',
      message: 'El PDF no contiene texto extraíble.',
    });
  });

  it('mapea un 400 con body ilegible/malformado a un mensaje genérico de fallback', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () => Promise.reject(new Error('invalid json')),
    });

    const result = await postIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('invalid');
    expect(!result.ok && result.error.message.length).toBeGreaterThan(0);
  });

  it('mapea un 401 a {tag: "unauthorized"} con el mensaje fijo de sesión expirada', async () => {
    mockFetchOnce({ ok: false, status: 401 });

    const result = await postIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'unauthorized',
      message: 'Tu sesión expiró. Inicia sesión de nuevo.',
    });
  });

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await postIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('network');
  });

  it('mapea un body 2xx que no cumple la forma esperada de IngestaResponseDto a {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ nonsense: true }),
    });

    const result = await postIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} sin lanzar cuando transacciones[0].cargo es un string no decimal (money-safety boundary)', async () => {
    const bodyConCargoMalformado = {
      ...validIngestaDto,
      transacciones: [{ ...validIngestaDto.transacciones[0], cargo: 'abc' }],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyConCargoMalformado),
    });

    const result = await postIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando falta el sub-objeto archivo', async () => {
    const { archivo: _omitido, ...bodySinArchivo } = validIngestaDto;
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodySinArchivo),
    });

    const result = await postIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando archivo.tamanoBytes es string en vez de number', async () => {
    const bodyConArchivoMalformado = {
      ...validIngestaDto,
      archivo: { ...validIngestaDto.archivo, tamanoBytes: '2048' },
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyConArchivoMalformado),
    });

    const result = await postIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });
});

// US-059 PR1 (T-02): validPreviewDto updated to the canonical shape.
// The hardened guard now requires `filas` + `resumen` and no longer validates
// `muestra`/`estructura` — those are legacy fields deprecated by US-061.
// Typed with non-optional filas/muestra to avoid `!` in test bodies (Fix 6).
const validPreviewDto: PreviewIngestaDto & {
  filas: NonNullable<PreviewIngestaDto['filas']>;
  muestra: NonNullable<PreviewIngestaDto['muestra']>;
} = {
  banco: 'BancoEstado',
  tipoCuenta: 'CuentaRUT',
  numeroCuenta: '12345678',
  // legacy fields still present in the live response (backend keeps them until US-061)
  estructura: { totalFilasDatos: 120 },
  muestra: [
    {
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'Supermercado',
      cargo: '50000',
      abono: '0',
    },
  ],
  // canonical fields required by the hardened guard (US-057/US-059)
  filas: [
    {
      rowIndex: 0,
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'Supermercado',
      cargo: '50000',
      abono: '0',
      esDuplicado: false,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-01' },
    },
  ],
  resumen: { totalFilas: 120, duplicadosDetectados: 5, nuevas: 115 },
};

// previewIngesta (us-003-vista-previa Slice 2, design.md §9.4): faithful
// mirror of postIngesta's transport tests — same-origin multipart POST to
// /api/ingestas/preview, never throws, same status-mapping conventions.
describe('previewIngesta', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a POST /api/ingestas/preview same-origin con el archivo en un FormData bajo el campo "file"', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validPreviewDto),
    });
    const archivo = archivoDePrueba();

    await previewIngesta(archivo);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/ingestas/preview');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBe(archivo);
  });

  it('resuelve {ok: true, value} en un body 2xx válido', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validPreviewDto),
    });

    const result = await previewIngesta(archivoDePrueba());

    expect(result).toEqual({ ok: true, value: validPreviewDto });
  });

  it('mapea un 400 pasando el body.message del backend verbatim (sin remap del cliente)', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          statusCode: 400,
          message: 'Banco no reconocido.',
          error: 'Bad Request',
        }),
    });

    const result = await previewIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'invalid',
      message: 'Banco no reconocido.',
    });
  });

  it('mapea un 400 con body ilegible/malformado a un mensaje genérico de fallback', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () => Promise.reject(new Error('invalid json')),
    });

    const result = await previewIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('invalid');
    expect(!result.ok && result.error.message.length).toBeGreaterThan(0);
  });

  it('mapea un 401 a {tag: "unauthorized"} con el mensaje fijo de sesión expirada', async () => {
    mockFetchOnce({ ok: false, status: 401 });

    const result = await previewIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'unauthorized',
      message: 'Tu sesión expiró. Inicia sesión de nuevo.',
    });
  });

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await previewIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('network');
  });

  it('mapea a {tag: "parse"} cuando falta banco', async () => {
    const { banco: _omitido, ...bodySinBanco } = validPreviewDto;

    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodySinBanco),
    });

    const result = await previewIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  // US-059 PR1 (T-02): guard no longer validates `estructura` (deprecated field
  // removed in US-061). The hardened guard requires `filas` + `resumen` instead.
  // Updated test: body missing `filas` is rejected even when `estructura` is intact.
  it('mapea a {tag: "parse"} cuando falta filas (guard hardened US-059: canonical field requerida)', async () => {
    const bodySinFilas = { ...validPreviewDto, filas: undefined };

    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodySinFilas),
    });

    const result = await previewIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  // US-059 PR1 (T-02): `muestra` is a deprecated legacy field — the hardened
  // guard no longer validates it. A malformed `muestra` is ignored; only
  // `filas[]` money fields are now validated. This test verifies that a bad
  // `muestra[0].cargo` does NOT trigger a parse error (muestra is unchecked).
  it('acepta payload con muestra[0].cargo malformado porque el guard ya no valida muestra (campo legacy)', async () => {
    const bodyConMuestraMalformada = {
      ...validPreviewDto,
      muestra: [{ ...validPreviewDto.muestra[0], cargo: 'abc' }],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyConMuestraMalformada),
    });

    const result = await previewIngesta(archivoDePrueba());

    // muestra is no longer validated by the hardened guard (US-059, D-08)
    expect(result.ok).toBe(true);
  });

  // US-059 PR1 (T-02): money-safety now applied to canonical `filas[]`, not `muestra[]`.
  it('mapea a {tag: "parse"} sin lanzar cuando filas[0].cargo es un string no decimal (money-safety boundary)', async () => {
    const bodyConCargoMalformado = {
      ...validPreviewDto,
      filas: [{ ...validPreviewDto.filas[0], cargo: 'abc' }],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyConCargoMalformado),
    });

    const result = await previewIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando falta resumen (guard hardened US-059: campo canónico requerido)', async () => {
    const bodySinResumen = { ...validPreviewDto, resumen: undefined };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodySinResumen),
    });

    const result = await previewIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });
});

const validCommitIngestaDto = {
  ingestaId: 'ingesta-001',
  totalTransacciones: 1,
  duplicadosOmitidos: 0,
  transacciones: [
    {
      bucket: 'Necesidades',
      categoriaId: 'cat-01',
      cargo: '50000',
      abono: '0',
      descripcion: 'Supermercado',
      fecha: '2026-07-15T00:00:00.000Z',
    },
  ],
};

// US-059 PR1 (T-02): postCommitIngesta transport suite — faithful mirror of
// previewIngesta's transport tests: same-origin multipart POST to
// /api/ingestas/commit, never throws, same status-mapping conventions.
// Also validates FormData structure (both `file` and `edits` fields).
describe('postCommitIngesta', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a POST /api/ingestas/commit con file en FormData y edits como JSON string', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve(validCommitIngestaDto),
    });
    const archivo = archivoDePrueba();
    const edits = [{ rowIndex: 2, categoriaId: 'cat-02' }];

    await postCommitIngesta(archivo, edits);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/ingestas/commit');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const body = init.body as FormData;
    expect(body.get('file')).toBeInstanceOf(File);
    expect(body.get('file')).toBe(archivo);
    expect(body.get('edits')).toBe(JSON.stringify(edits));
  });

  it('resuelve {ok: true, value} en un body 201 válido', async () => {
    mockFetchOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve(validCommitIngestaDto),
    });

    const result = await postCommitIngesta(archivoDePrueba(), []);

    expect(result).toEqual({ ok: true, value: validCommitIngestaDto });
  });

  it('mapea un 400 pasando el body.message del backend verbatim', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          statusCode: 400,
          message: 'Banco no reconocido.',
          error: 'Bad Request',
        }),
    });

    const result = await postCommitIngesta(archivoDePrueba(), []);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'invalid',
      message: 'Banco no reconocido.',
    });
  });

  it('mapea un 400 con body ilegible/malformado a un mensaje genérico de fallback', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () => Promise.reject(new Error('invalid json')),
    });

    const result = await postCommitIngesta(archivoDePrueba(), []);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('invalid');
    expect(!result.ok && result.error.message.length).toBeGreaterThan(0);
  });

  it('mapea un 401 a {tag: "unauthorized"} con el mensaje fijo de sesión expirada', async () => {
    mockFetchOnce({ ok: false, status: 401 });

    const result = await postCommitIngesta(archivoDePrueba(), []);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'unauthorized',
      message: 'Tu sesión expiró. Inicia sesión de nuevo.',
    });
  });

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await postCommitIngesta(archivoDePrueba(), []);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('network');
  });

  it('mapea un 5xx a {tag: "server"} genérico', async () => {
    mockFetchOnce({ ok: false, status: 500 });

    const result = await postCommitIngesta(archivoDePrueba(), []);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });

  it('mapea a {tag: "parse"} cuando el body 2xx no cumple la forma de CommitIngestaDto', async () => {
    mockFetchOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ nonsense: true }),
    });

    const result = await postCommitIngesta(archivoDePrueba(), []);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });
});

const validIngestaListItem: IngestaListItemDto = {
  id: 'ingesta-1',
  banco: 'BancoEstado',
  nombreArchivo: 'cartola-julio.xlsx',
  estado: 'PROCESADA',
  motivoFallo: null,
  fecha: '2026-07-15T00:00:00.000Z',
  totalTransacciones: 12,
};

const validIngestaFallida: IngestaListItemDto = {
  id: 'ingesta-2',
  banco: null,
  nombreArchivo: 'cartola.docx',
  estado: 'FALLIDA',
  motivoFallo: 'Extensión de archivo no soportada: .docx',
  fecha: '2026-07-16T00:00:00.000Z',
  totalTransacciones: 0,
};

describe('fetchIngestas', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a GET /api/ingestas same-origin, sin base URL ni key', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [validIngestaListItem] }),
    });

    await fetchIngestas();

    expect(fetchMock).toHaveBeenCalledWith('/api/ingestas');
  });

  it('resuelve {ok: true, value} con el array de ingestas del wrapper {ingestas: [...]}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [validIngestaListItem] }),
    });

    const result = await fetchIngestas();

    expect(result).toEqual({ ok: true, value: [validIngestaListItem] });
  });

  it('resuelve {ok: true, value: []} con una lista vacía', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [] }),
    });

    const result = await fetchIngestas();

    expect(result).toEqual({ ok: true, value: [] });
  });

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await fetchIngestas();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('network');
  });

  it('mapea un 401 a {tag: "unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 });

    const result = await fetchIngestas();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'unauthorized',
      message: 'Sin acceso.',
    });
  });

  it('mapea un 5xx a {tag: "server"} genérico', async () => {
    mockFetchOnce({ ok: false, status: 500 });

    const result = await fetchIngestas();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });

  it('mapea un body 2xx que no cumple la forma esperada (sin campo ingestas) a {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ nonsense: true }),
    });

    const result = await fetchIngestas();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando body.ingestas no es un array', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: 'no-array' }),
    });

    const result = await fetchIngestas();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando un item trae totalTransacciones como string en vez de number', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ingestas: [{ ...validIngestaListItem, totalTransacciones: '12' }],
        }),
    });

    const result = await fetchIngestas();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando un item le falta el campo banco', async () => {
    const { banco: _omitido, ...itemSinBanco } = validIngestaListItem;
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [itemSinBanco] }),
    });

    const result = await fetchIngestas();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('acepta un item FALLIDA con banco null, motivoFallo string, y totalTransacciones 0 (US-004, ING-03)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [validIngestaFallida] }),
    });

    const result = await fetchIngestas();

    expect(result).toEqual({ ok: true, value: [validIngestaFallida] });
  });

  it('acepta una lista mixta PROCESADA + FALLIDA (US-004)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ingestas: [validIngestaListItem, validIngestaFallida],
        }),
    });

    const result = await fetchIngestas();

    expect(result).toEqual({
      ok: true,
      value: [validIngestaListItem, validIngestaFallida],
    });
  });

  it('mapea a {tag: "parse"} cuando a un item le falta el campo nombreArchivo (US-004)', async () => {
    const { nombreArchivo: _omitido, ...itemSinNombreArchivo } =
      validIngestaListItem;
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [itemSinNombreArchivo] }),
    });

    const result = await fetchIngestas();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando un item trae un estado fuera de la unión PROCESADA/FALLIDA (US-004)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ingestas: [{ ...validIngestaListItem, estado: 'CANCELADA' }],
        }),
    });

    const result = await fetchIngestas();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando un item PROCESADA trae banco como number en vez de string|null (US-004)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ingestas: [{ ...validIngestaListItem, banco: 123 }],
        }),
    });

    const result = await fetchIngestas();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando un item trae motivoFallo como number en vez de string|null (US-004)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ingestas: [{ ...validIngestaFallida, motivoFallo: 404 }],
        }),
    });

    const result = await fetchIngestas();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea un body 2xx cuyo json() lanza a {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('invalid json')),
    });

    const result = await fetchIngestas();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });
});

describe('deleteIngesta', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('llama a DELETE /api/ingestas/:id same-origin, encodeando el id', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });

    await deleteIngesta('ingesta con espacio');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ingestas/ingesta%20con%20espacio',
      { method: 'DELETE', keepalive: false },
    );
  });

  it('keepalive: true forwards to fetch (design-hardening change, pagehide flush escape hatch)', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });

    await deleteIngesta('ingesta-1', { keepalive: true });

    expect(fetchMock).toHaveBeenCalledWith('/api/ingestas/ingesta-1', {
      method: 'DELETE',
      keepalive: true,
    });
  });

  it('en un 204 resuelve {ok: true, value: undefined} SIN llamar res.json() (D7 — un 204 no tiene body)', async () => {
    const jsonSpy = vi
      .fn()
      .mockRejectedValue(
        new Error('204 has no body — json() must not be called'),
      );
    mockFetchOnce({ ok: true, status: 204, json: jsonSpy });

    const result = await deleteIngesta('ingesta-1');

    expect(result).toEqual({ ok: true, value: undefined });
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await deleteIngesta('ingesta-1');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('network');
  });

  it('mapea un 401 a {tag: "unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 });

    const result = await deleteIngesta('ingesta-1');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'unauthorized',
      message: 'Sin acceso.',
    });
  });

  it('mapea un 404 (no existe / no es del usuario, anti-enumeration) a {tag: "server", status: 404}', async () => {
    mockFetchOnce({ ok: false, status: 404 });

    const result = await deleteIngesta('ingesta-ajena');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 404,
      message: 'La cartola ya no existe. La lista se actualizará.',
    });
  });

  it('mapea un 5xx a {tag: "server"} genérico', async () => {
    mockFetchOnce({ ok: false, status: 500 });

    const result = await deleteIngesta('ingesta-1');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });
});

describe('fetchApiVersion', () => {
  const validVersion: ApiVersionDto = {
    version: '0.2.0',
    commit: 'abc1234',
    ref: 'main',
    builtAt: '2026-07-28T17:00:00.000Z',
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('llama GET {VITE_API_BASE_URL}/version cross-origin y devuelve el DTO', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.test');
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validVersion),
    });

    const result = await fetchApiVersion();

    expect(fetchMock).toHaveBeenCalledWith('https://api.test/version');
    expect(result).toEqual({ ok: true, value: validVersion });
  });

  it('mapea 401 a unauthorized', async () => {
    mockFetchOnce({ ok: false, status: 401 });

    const result = await fetchApiVersion();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('unauthorized');
  });

  it('mapea un body con forma inesperada a parse', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ version: 1 }),
    });

    const result = await fetchApiVersion();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea un fetch rechazado (red) a network', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchApiVersion();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('network');
  });
});

const validSemaforoDetalleDto: SemaforoDetalleDto = {
  periodo: '2026-07',
  totalIngreso: '1000000',
  sinIngreso: false,
  estadoGlobal: 'amarillo',
  diagnostico: 'Tu veredicto del mes es Saludable por Ahorro.',
  bucketsCriticos: ['Ahorro'],
  buckets: [
    {
      bucket: 'Necesidades',
      total: '400000',
      porcentajeBp: 4000,
      estadoSemaforo: 'verde',
      metaBp: 5000,
      bandas: {
        verdeMin: null,
        verdeMax: 5000,
        amarilloMin: null,
        amarilloMax: 6000,
      },
      consejo: null,
    },
    {
      bucket: 'Deseos',
      total: '250000',
      porcentajeBp: 2500,
      estadoSemaforo: 'verde',
      metaBp: 3000,
      bandas: {
        verdeMin: null,
        verdeMax: 3000,
        amarilloMin: null,
        amarilloMax: 4000,
      },
      consejo: null,
    },
    {
      bucket: 'Ahorro',
      total: '150000',
      porcentajeBp: 1500,
      estadoSemaforo: 'amarillo',
      metaBp: 2000,
      bandas: {
        verdeMin: 2000,
        verdeMax: 4000,
        amarilloMin: 1000,
        amarilloMax: 5000,
      },
      consejo: {
        direccion: 'aumentar',
        monto: '49950',
        mensaje:
          'Para volver a Muy Saludable, aumenta {monto} en Ahorro este mes.',
      },
    },
  ],
  sinCategoria: { cantidad: 2, total: '10000' },
};

// US-049 (design §1.7, T6.1): fetchSemaforoDetalle mirrors fetchResumen's
// never-throw ApiResult<T> shape + status mapping (400/401/5xx/network/parse).
// The extra "parse" cases pin the money-guard-at-the-boundary lesson (WG5-05):
// a malformed consejo.monto/diagnostico/buckets/sinCategoria.total must never
// reach formatearMontoCLP or downstream render code.
describe('fetchSemaforoDetalle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resuelve {ok: true, value} en un body 2xx válido', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validSemaforoDetalleDto),
    });

    const result = await fetchSemaforoDetalle();

    expect(result).toEqual({ ok: true, value: validSemaforoDetalleDto });
  });

  it('mapea un 400 a {tag: "invalid"} ("período inválido")', async () => {
    mockFetchOnce({ ok: false, status: 400 });

    const result = await fetchSemaforoDetalle();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'invalid',
      message: 'El período no es válido.',
    });
  });

  it('mapea un 401 a {tag: "unauthorized"} ("sin acceso")', async () => {
    mockFetchOnce({ ok: false, status: 401 });

    const result = await fetchSemaforoDetalle();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'unauthorized',
      message: 'Sin acceso.',
    });
  });

  it('mapea un 5xx a {tag: "server"} genérico', async () => {
    mockFetchOnce({ ok: false, status: 500 });

    const result = await fetchSemaforoDetalle();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toEqual({
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
    });
  });

  it('mapea un rechazo de fetch a {tag: "network"}', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await fetchSemaforoDetalle();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('network');
  });

  it('mapea un body 2xx cuyo json() lanza a {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('invalid json')),
    });

    const result = await fetchSemaforoDetalle();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando el consejo.monto de un bucket es "12.5" (money guard, WG5-05)', async () => {
    const bodyConMontoDecimal: SemaforoDetalleDto = {
      ...validSemaforoDetalleDto,
      buckets: [
        validSemaforoDetalleDto.buckets[0],
        validSemaforoDetalleDto.buckets[1],
        {
          ...validSemaforoDetalleDto.buckets[2],
          consejo: {
            ...validSemaforoDetalleDto.buckets[2].consejo!,
            monto: '12.5',
          },
        },
      ],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyConMontoDecimal),
    });

    const result = await fetchSemaforoDetalle();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando diagnostico falta o no es string', async () => {
    const { diagnostico: _omitido, ...bodySinDiagnostico } =
      validSemaforoDetalleDto;
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodySinDiagnostico),
    });

    const result = await fetchSemaforoDetalle();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando buckets no es un array', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ ...validSemaforoDetalleDto, buckets: 'nope' }),
    });

    const result = await fetchSemaforoDetalle();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando sinCategoria.total está malformado', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ...validSemaforoDetalleDto,
          sinCategoria: { cantidad: 2, total: 'abc' },
        }),
    });

    const result = await fetchSemaforoDetalle();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('agrega el query param periodo (URL-encoded) cuando se provee', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validSemaforoDetalleDto),
    });

    await fetchSemaforoDetalle('2026-07');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/resumen/semaforo?periodo=2026-07',
    );
  });

  // WG5-05 recurrence: el guard original NO validaba periodo/sinIngreso/
  // estadoGlobal/bucketsCriticos ni `bucket` dentro de cada bucket, aunque
  // los 4 primeros pasan verbatim a `SemaforoDetalleViewModel` (render) y
  // `bucket`/`estadoSemaforo` viajan a cada `BucketSemaforoViewModel`. Estos
  // casos cierran ese hueco (guard completeness).
  it('mapea a {tag: "parse"} cuando periodo no es un string', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ ...validSemaforoDetalleDto, periodo: 202607 }),
    });

    const result = await fetchSemaforoDetalle();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando sinIngreso es un string en vez de boolean', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ ...validSemaforoDetalleDto, sinIngreso: 'false' }),
    });

    const result = await fetchSemaforoDetalle();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando estadoGlobal tiene un valor fuera del enum', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ...validSemaforoDetalleDto,
          estadoGlobal: 'naranja',
        }),
    });

    const result = await fetchSemaforoDetalle();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando estadoGlobal es un number', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ ...validSemaforoDetalleDto, estadoGlobal: 1 }),
    });

    const result = await fetchSemaforoDetalle();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando bucketsCriticos no es un array', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ...validSemaforoDetalleDto,
          bucketsCriticos: 'Ahorro',
        }),
    });

    const result = await fetchSemaforoDetalle();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando bucketsCriticos trae un elemento no-string', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ...validSemaforoDetalleDto,
          bucketsCriticos: ['Ahorro', 42],
        }),
    });

    const result = await fetchSemaforoDetalle();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando a un bucket le falta `bucket`', async () => {
    const { bucket: _omitido, ...bucketSinNombre } =
      validSemaforoDetalleDto.buckets[0];
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ...validSemaforoDetalleDto,
          buckets: [
            bucketSinNombre,
            validSemaforoDetalleDto.buckets[1],
            validSemaforoDetalleDto.buckets[2],
          ],
        }),
    });

    const result = await fetchSemaforoDetalle();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('mapea a {tag: "parse"} cuando el estadoSemaforo de un bucket tiene un valor fuera del enum', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ...validSemaforoDetalleDto,
          buckets: [
            { ...validSemaforoDetalleDto.buckets[0], estadoSemaforo: 'azul' },
            validSemaforoDetalleDto.buckets[1],
            validSemaforoDetalleDto.buckets[2],
          ],
        }),
    });

    const result = await fetchSemaforoDetalle();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('resuelve {ok: true, value} en un body 2xx válido con estadoGlobal null', async () => {
    const bodyEstadoGlobalNull: SemaforoDetalleDto = {
      ...validSemaforoDetalleDto,
      sinIngreso: true,
      estadoGlobal: null,
      bucketsCriticos: [],
    };
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(bodyEstadoGlobalNull),
    });

    const result = await fetchSemaforoDetalle();

    expect(result).toEqual({ ok: true, value: bodyEstadoGlobalNull });
  });
});
