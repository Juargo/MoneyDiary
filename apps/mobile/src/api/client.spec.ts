import type { ResumenMesDto } from '../domain/resumen.types';

const validDto: ResumenMesDto = {
  periodo: '2026-07',
  totalIngreso: '1000000',
  sinIngreso: false,
  buckets: [
    { bucket: 'Necesidades', total: '400000', porcentajeBp: 4000, estadoSemaforo: 'verde' },
    { bucket: 'Deseos', total: '250000', porcentajeBp: 2500, estadoSemaforo: 'verde' },
    { bucket: 'Ahorro', total: '350000', porcentajeBp: 3500, estadoSemaforo: 'amarillo' },
    { bucket: 'SinCategoria', total: '0', porcentajeBp: 0, estadoSemaforo: null },
  ],
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: 'amarillo',
};

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
 * `client.ts` reads `config.ts` at module-load time, so each test that needs
 * a specific env must reset the module registry and re-require it — a plain
 * top-level `import` would only ever see the env from the first load.
 */
function requireClient(): typeof import('./client') {
  return jest.requireActual('./client');
}

describe('fetchResumen', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
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

  it('sends GET {base}/api/resumen?periodo=YYYY-MM with the x-api-key header (MOB-01)', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validDto),
    });
    const { fetchResumen } = requireClient();

    await fetchResumen('2026-07');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/resumen?periodo=2026-07',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'test-api-key' }),
      }),
    );
  });

  it('maps a fetch rejection to {tag: "network"} (MOB-02)', async () => {
    (global as unknown as { fetch: typeof fetch }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const { fetchResumen } = requireClient();

    const result = await fetchResumen();

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
  });

  it('maps res.status === 401 to {tag: "unauthorized"} (MOB-02)', async () => {
    mockFetchOnce({ ok: false, status: 401 });
    const { fetchResumen } = requireClient();

    const result = await fetchResumen();

    expect(result).toEqual({ ok: false, error: { tag: 'unauthorized' } });
  });

  it('maps other non-2xx statuses to {tag: "http", status} (MOB-02)', async () => {
    mockFetchOnce({ ok: false, status: 500 });
    const { fetchResumen } = requireClient();

    const result = await fetchResumen();

    expect(result).toEqual({ ok: false, error: { tag: 'http', status: 500 } });
  });

  it('maps a 2xx body that fails the shape guard to {tag: "parse"} (MOB-02)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ nonsense: true }),
    });
    const { fetchResumen } = requireClient();

    const result = await fetchResumen();

    expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
  });

  it('maps a 2xx body whose json() throws to {tag: "parse"} (MOB-02)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('invalid json')),
    });
    const { fetchResumen } = requireClient();

    const result = await fetchResumen();

    expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
  });

  it('resolves {ok: true, value} on a valid 2xx body', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validDto),
    });
    const { fetchResumen } = requireClient();

    const result = await fetchResumen();

    expect(result).toEqual({ ok: true, value: validDto });
  });

  it('returns {tag: "network"} without fetching when API_BASE_URL is missing', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = '';
    const fetchMock = mockFetchOnce({ ok: true, status: 200 });
    const { fetchResumen } = requireClient();

    const result = await fetchResumen();

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
