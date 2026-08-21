import { fetchDetalleBucketMes, fetchIngresosMes } from './client';

// T-04 RED: branch-matrix specs for detalle fetchers (US-056, D-15/T-C7)
//
// The !API_BASE_URL guard cases use jest.resetModules + jest.doMock +
// jest.requireActual to load a fresh client.ts with API_BASE_URL=undefined,
// mirroring the client.spec.ts pattern (fetchResumen no-base-url test).
// The module-level jest.mock('./config') below covers all other cases;
// the guard cases override it via jest.doMock after resetting the registry.

const VALID_DETALLE_BODY = {
  bucket: 'Necesidades',
  periodo: '2026-07',
  total: '500000',
  totalTransacciones: 2,
  totalCategorias: 1,
  porcentajeBp: 3000,
  metaBp: 5000,
  grupos: [
    {
      categoriaId: 'cat-1',
      nombre: 'Alimentación',
      subtotal: '500000',
      conteo: 2,
      transacciones: [
        {
          id: 'tx-1',
          fecha: '2026-07-01T00:00:00.000Z',
          descripcion: 'Supermercado',
          monto: '300000',
        },
        {
          id: 'tx-2',
          fecha: '2026-07-10T00:00:00.000Z',
          descripcion: 'Feria',
          monto: '200000',
        },
      ],
    },
  ],
};

const VALID_INGRESOS_BODY = {
  conteo: 1,
  total: '1000000',
  transacciones: [
    {
      id: 'ing-1',
      descripcion: 'Sueldo',
      fecha: '2026-07-01T00:00:00.000Z',
      monto: '1000000',
      origen: 'BCI',
    },
  ],
};

function mockFetch(status: number, body: unknown, throws = false) {
  global.fetch = jest.fn().mockImplementation(() => {
    if (throws) {
      return Promise.reject(new Error('Network failure'));
    }
    return Promise.resolve({
      status,
      ok: status >= 200 && status < 300,
      json: () => Promise.resolve(body),
    });
  });
}

// Mock leerToken so headers can be built without a real session store
jest.mock('./session-store', () => ({
  leerToken: () => Promise.resolve(null),
}));

// Mock config so API_BASE_URL is set for the non-guard cases
jest.mock('./config', () => ({
  API_BASE_URL: 'http://localhost:3000',
  API_KEY: 'test-key',
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ---- fetchDetalleBucketMes ----

describe('fetchDetalleBucketMes', () => {
  it('no API_BASE_URL → network error (fetch NOT called)', async () => {
    // Uses jest.resetModules + jest.doMock + jest.requireActual to load a fresh
    // client.ts with API_BASE_URL=undefined, exercising the `if (!API_BASE_URL)`
    // guard (client.ts ~line 617). Falsifiability pin: deleting that guard causes
    // fetch to be called with 'undefined/api/buckets/...' and `expect(fetchMock)
    // .not.toHaveBeenCalled()` fails. Mirrors client.spec.ts's guard test pattern
    // but overrides the module-level jest.mock('./config') via jest.doMock inside
    // a fresh module registry (resetModules clears the prior mock factory).
    jest.resetModules();
    jest.doMock('./config', () => ({
      API_BASE_URL: undefined,
      API_KEY: 'test-key',
    }));
    jest.doMock('./session-store', () => ({
      leerToken: () => Promise.resolve(null),
    }));
    const fetchMock = jest.fn();
    (global as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    const { fetchDetalleBucketMes: fn } = jest.requireActual(
      './client',
    ) as typeof import('./client');
    const result = await fn('Necesidades', '2026-07');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('network');
    }
  });

  it('fetch throws → network error', async () => {
    mockFetch(0, null, true);
    const result = await fetchDetalleBucketMes('Necesidades', '2026-07');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('network');
    }
  });

  it('401 → unauthorized error', async () => {
    mockFetch(401, null);
    const result = await fetchDetalleBucketMes('Necesidades', '2026-07');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('unauthorized');
    }
  });

  it('non-2xx → http error', async () => {
    mockFetch(500, null);
    const result = await fetchDetalleBucketMes('Necesidades', '2026-07');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('http');
    }
  });

  it('bad JSON → parse error', async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        status: 200,
        ok: true,
        json: () => Promise.reject(new SyntaxError('JSON parse error')),
      }),
    );
    const result = await fetchDetalleBucketMes('Necesidades', '2026-07');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('parse');
    }
  });

  it('bad shape → parse error', async () => {
    mockFetch(200, { unexpected: 'body' });
    const result = await fetchDetalleBucketMes('Necesidades', '2026-07');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('parse');
    }
  });

  it('200 ok → ApiResult value with guarded DTO', async () => {
    mockFetch(200, VALID_DETALLE_BODY);
    const result = await fetchDetalleBucketMes('Necesidades', '2026-07');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.bucket).toBe('Necesidades');
      expect(result.value.total).toBe('500000');
    }
  });

  it('malformed monto/total in 200 body → parse error', async () => {
    const badBody = { ...VALID_DETALLE_BODY, total: 'not-a-number' };
    mockFetch(200, badBody);
    const result = await fetchDetalleBucketMes('Necesidades', '2026-07');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('parse');
    }
  });
});

// ---- fetchIngresosMes ----

describe('fetchIngresosMes', () => {
  it('no API_BASE_URL → network error (fetch NOT called)', async () => {
    // Same pattern as the fetchDetalleBucketMes guard test. Deleting the guard
    // at client.ts ~line 659 causes fetch to be called with
    // 'undefined/api/ingresos/mes' — `expect(fetchMock).not.toHaveBeenCalled()` fails.
    jest.resetModules();
    jest.doMock('./config', () => ({
      API_BASE_URL: undefined,
      API_KEY: 'test-key',
    }));
    jest.doMock('./session-store', () => ({
      leerToken: () => Promise.resolve(null),
    }));
    const fetchMock = jest.fn();
    (global as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    const { fetchIngresosMes: fn } = jest.requireActual(
      './client',
    ) as typeof import('./client');
    const result = await fn('2026-07');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('network');
    }
  });

  it('fetch throws → network error', async () => {
    mockFetch(0, null, true);
    const result = await fetchIngresosMes('2026-07');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('network');
    }
  });

  it('401 → unauthorized error', async () => {
    mockFetch(401, null);
    const result = await fetchIngresosMes('2026-07');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('unauthorized');
    }
  });

  it('non-2xx → http error', async () => {
    mockFetch(500, null);
    const result = await fetchIngresosMes('2026-07');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('http');
    }
  });

  it('bad JSON → parse error', async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        status: 200,
        ok: true,
        json: () => Promise.reject(new SyntaxError('JSON parse error')),
      }),
    );
    const result = await fetchIngresosMes('2026-07');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('parse');
    }
  });

  it('bad shape → parse error', async () => {
    mockFetch(200, { random: 'data' });
    const result = await fetchIngresosMes('2026-07');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('parse');
    }
  });

  it('200 ok → ApiResult value with guarded DTO', async () => {
    mockFetch(200, VALID_INGRESOS_BODY);
    const result = await fetchIngresosMes('2026-07');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.total).toBe('1000000');
      expect(result.value.conteo).toBe(1);
    }
  });

  it('malformed monto/total in 200 body → parse error', async () => {
    const badBody = { ...VALID_INGRESOS_BODY, total: 'bad-amount' };
    mockFetch(200, badBody);
    const result = await fetchIngresosMes('2026-07');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('parse');
    }
  });
});
