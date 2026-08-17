import type {
  ResumenMesDto,
  ResumenAnualDto,
  MeDto,
} from '../domain/resumen.types';
import { NETWORK_LEG_TIMEOUT_MS } from './con-timeout';

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

const validMeDto: MeDto = {
  userId: 'user-1',
  email: 'a@b.com',
  esDemo: false,
  nombre: 'Usuario de Prueba',
  googleVinculado: false,
};

const validLoginResponse = {
  token: 'session-token',
  userId: 'user-1',
  expiresAt: '2026-07-25T00:00:00.000Z',
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

// `leerToken` is mocked at the module boundary (MOB-02/MOB-04) so the client's
// Bearer-header wiring is what's under test, never a real SecureStore call.
const mockLeerToken = jest.fn<Promise<string | null>, []>();
jest.mock('./session-store', () => ({
  leerToken: () => mockLeerToken(),
}));

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

  it('sends GET {base}/api/resumen?periodo=YYYY-MM with only the x-api-key header when no token is stored (MOB-01, MOB-02)', async () => {
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
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(
      (options.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
  });

  it('sends both x-api-key and Authorization: Bearer <token> when a token is stored (MOB-02)', async () => {
    mockLeerToken.mockResolvedValue('stored-token');
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validDto),
    });
    const { fetchResumen } = requireClient();

    await fetchResumen();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key',
          Authorization: 'Bearer stored-token',
        }),
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

  // D-14 money guard: a malformed bucket.total must never reach
  // formatearMontoConSigno (which throws on a bad string) — the boundary
  // guard rejects it as {tag: 'parse'} instead of crashing the render.
  it('maps a bucket.total that fails esMontoStringValido (e.g. "12.5") to {tag: "parse"} (D-14)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ...validDto,
          buckets: validDto.buckets.map((b, i) =>
            i === 0 ? { ...b, total: '12.5' } : b,
          ),
        }),
    });
    const { fetchResumen } = requireClient();

    const result = await fetchResumen();

    expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
  });

  // FIX 1 (CRITICAL, judgment-day): a `null`/non-object element inside
  // `buckets` must reject with {tag: 'parse'}, never throw a raw TypeError
  // out of `esResumenMesDto` (which would REJECT the returned promise
  // instead of resolving it, breaking the never-throws contract, MOB-02).
  it('maps a null element inside buckets to {tag: "parse"} instead of rejecting', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ...validDto, buckets: [null] }),
    });
    const { fetchResumen } = requireClient();

    await expect(fetchResumen()).resolves.toEqual({
      ok: false,
      error: { tag: 'parse' },
    });
  });

  it('maps a non-object (string) element inside buckets to {tag: "parse"} instead of rejecting', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ...validDto, buckets: ['x'] }),
    });
    const { fetchResumen } = requireClient();

    await expect(fetchResumen()).resolves.toEqual({
      ok: false,
      error: { tag: 'parse' },
    });
  });

  // FIX 2 (WARNING, judgment-day): reject coverage for the totalIngreso
  // guard — mutation-proven zero coverage without this (removing the
  // `esMontoStringValido(candidato.totalIngreso)` check kept every test
  // green).
  it('maps a malformed totalIngreso (e.g. "12.5") to {tag: "parse"} with otherwise well-formed buckets', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ...validDto, totalIngreso: '12.5' }),
    });
    const { fetchResumen } = requireClient();

    const result = await fetchResumen();

    expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
  });
});

describe('fetchResumenAnual', () => {
  const ORIGINAL_ENV = process.env;

  // MOB-10 mandates exactly 12 cells (FIX 4, judgment-day) — the fixture
  // must build all 12 months for the accept-path tests to stay green.
  const validAnualDto: ResumenAnualDto = {
    anio: 2026,
    meses: Array.from({ length: 12 }, () => validDto),
  };

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

  it('sends GET {base}/api/resumen/anual with no query when anio is omitted (MOB-10)', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validAnualDto),
    });
    const { fetchResumenAnual } = requireClient();

    await fetchResumenAnual();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/resumen/anual',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'test-api-key' }),
      }),
    );
  });

  it('appends ?anio=2026 when anio is given', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validAnualDto),
    });
    const { fetchResumenAnual } = requireClient();

    await fetchResumenAnual(2026);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/resumen/anual?anio=2026',
      expect.anything(),
    );
  });

  it('sends both x-api-key and Authorization: Bearer <token> when a token is stored', async () => {
    mockLeerToken.mockResolvedValue('stored-token');
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validAnualDto),
    });
    const { fetchResumenAnual } = requireClient();

    await fetchResumenAnual();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key',
          Authorization: 'Bearer stored-token',
        }),
      }),
    );
  });

  it('resolves {ok: true, value} on a valid 2xx body', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validAnualDto),
    });
    const { fetchResumenAnual } = requireClient();

    const result = await fetchResumenAnual();

    expect(result).toEqual({ ok: true, value: validAnualDto });
  });

  it('maps res.status === 401 to {tag: "unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 });
    const { fetchResumenAnual } = requireClient();

    const result = await fetchResumenAnual();

    expect(result).toEqual({ ok: false, error: { tag: 'unauthorized' } });
  });

  it('maps a 500 to {tag: "http", status: 500}', async () => {
    mockFetchOnce({ ok: false, status: 500 });
    const { fetchResumenAnual } = requireClient();

    const result = await fetchResumenAnual();

    expect(result).toEqual({ ok: false, error: { tag: 'http', status: 500 } });
  });

  // D-03: mobile never sends a user-authored `anio` (it is derived from a
  // YYYY-MM the backend itself emitted), so an invalid-anio 400 collapses
  // into the generic 'http' bucket rather than a dedicated tag.
  it('maps a 400 (invalid anio) to {tag: "http", status: 400} (D-03)', async () => {
    mockFetchOnce({ ok: false, status: 400 });
    const { fetchResumenAnual } = requireClient();

    const result = await fetchResumenAnual();

    expect(result).toEqual({ ok: false, error: { tag: 'http', status: 400 } });
  });

  it('maps a fetch rejection to {tag: "network"}', async () => {
    (global as unknown as { fetch: typeof fetch }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const { fetchResumenAnual } = requireClient();

    const result = await fetchResumenAnual();

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
  });

  it('returns {tag: "network"} without fetching when API_BASE_URL is missing', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = '';
    const fetchMock = mockFetchOnce({ ok: true, status: 200 });
    const { fetchResumenAnual } = requireClient();

    const result = await fetchResumenAnual();

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a 2xx body whose json() throws to {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('invalid json')),
    });
    const { fetchResumenAnual } = requireClient();

    const result = await fetchResumenAnual();

    expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
  });

  it('maps a malformed 2xx body (wrong shape) to {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ nonsense: true }),
    });
    const { fetchResumenAnual } = requireClient();

    const result = await fetchResumenAnual();

    expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
  });

  // D-14 money guard, annual side: a malformed bucket.total inside any
  // meses[] entry must reject the whole payload — reuses esResumenMesDto
  // per month (DRY), so this is the same guard exercised at meses[2].
  it('maps a malformed bucket.total inside meses[2] to {tag: "parse"} (D-14)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          anio: 2026,
          meses: Array.from({ length: 12 }, (_, i) =>
            i === 2
              ? {
                  ...validDto,
                  buckets: validDto.buckets.map((b, j) =>
                    j === 0 ? { ...b, total: '12.5' } : b,
                  ),
                }
              : validDto,
          ),
        }),
    });
    const { fetchResumenAnual } = requireClient();

    const result = await fetchResumenAnual();

    expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
  });

  // FIX 1 (CRITICAL, judgment-day): same null-safe guard, exercised inside
  // a meses[] entry (with an otherwise-valid 12-entry array, so the length
  // guard from FIX 4 doesn't mask what's under test) — a null bucket
  // anywhere in the year must reject with {tag: 'parse'} instead of
  // rejecting the promise with a raw TypeError.
  it('maps a null element inside meses[2].buckets to {tag: "parse"} instead of rejecting', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          anio: 2026,
          meses: Array.from({ length: 12 }, (_, i) =>
            i === 2 ? { ...validDto, buckets: [null] } : validDto,
          ),
        }),
    });
    const { fetchResumenAnual } = requireClient();

    await expect(fetchResumenAnual()).resolves.toEqual({
      ok: false,
      error: { tag: 'parse' },
    });
  });

  it('maps a non-object (string) element inside meses[2].buckets to {tag: "parse"} instead of rejecting', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          anio: 2026,
          meses: Array.from({ length: 12 }, (_, i) =>
            i === 2 ? { ...validDto, buckets: ['x'] } : validDto,
          ),
        }),
    });
    const { fetchResumenAnual } = requireClient();

    await expect(fetchResumenAnual()).resolves.toEqual({
      ok: false,
      error: { tag: 'parse' },
    });
  });

  // FIX 2 (WARNING, judgment-day): reject coverage for meses[2].totalIngreso
  // — pins deep validation (not just index 0) the same way the D-14 bucket
  // guard above already does. Kept at a 12-entry length so FIX 4's length
  // guard doesn't mask the assertion under test.
  it('maps a malformed meses[2].totalIngreso (e.g. "12.5") to {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          anio: 2026,
          meses: Array.from({ length: 12 }, (_, i) =>
            i === 2 ? { ...validDto, totalIngreso: '12.5' } : validDto,
          ),
        }),
    });
    const { fetchResumenAnual } = requireClient();

    const result = await fetchResumenAnual();

    expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
  });

  // FIX 4 (SUGGESTION, judgment-day): MOB-10 mandates exactly 12 cells —
  // an 11-month payload must reject as {tag: 'parse'}, mirroring web's
  // `meses.length === 12` guard parity.
  it('maps a meses array with 11 entries (not 12) to {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          anio: 2026,
          meses: Array.from({ length: 11 }, () => validDto),
        }),
    });
    const { fetchResumenAnual } = requireClient();

    const result = await fetchResumenAnual();

    expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
  });
});

describe('postLogin', () => {
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

  it('POSTs {email,password} to /api/auth/login with only x-api-key (no Bearer — no session yet) (MOB-04)', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validLoginResponse),
    });
    const { postLogin } = requireClient();

    await postLogin('a@b.com', 'secret');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'test-api-key' }),
        body: JSON.stringify({ email: 'a@b.com', password: 'secret' }),
      }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(
      (options.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
  });

  it('resolves {ok:true, value:{token,userId,expiresAt}} on success (MOB-04)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validLoginResponse),
    });
    const { postLogin } = requireClient();

    const result = await postLogin('a@b.com', 'secret');

    expect(result).toEqual({ ok: true, value: validLoginResponse });
  });

  it('maps a 401 (bad credentials) to {tag:"unauthorized"} (MOB-04)', async () => {
    mockFetchOnce({ ok: false, status: 401 });
    const { postLogin } = requireClient();

    const result = await postLogin('a@b.com', 'wrong');

    expect(result).toEqual({ ok: false, error: { tag: 'unauthorized' } });
  });

  it('maps a fetch rejection to {tag:"network"}', async () => {
    (global as unknown as { fetch: typeof fetch }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const { postLogin } = requireClient();

    const result = await postLogin('a@b.com', 'secret');

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
  });
});

describe('fetchMe', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    mockLeerToken.mockReset().mockResolvedValue('stored-token');
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

  it('sends GET /api/auth/me with both x-api-key and Authorization: Bearer <token> (MOB-04)', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validMeDto),
    });
    const { fetchMe } = requireClient();

    await fetchMe();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key',
          Authorization: 'Bearer stored-token',
        }),
      }),
    );
  });

  it('resolves {ok:true, value:MeDto} on success', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validMeDto),
    });
    const { fetchMe } = requireClient();

    const result = await fetchMe();

    expect(result).toEqual({ ok: true, value: validMeDto });
  });

  it('maps a 401 to {tag:"unauthorized"} (MOB-03)', async () => {
    mockFetchOnce({ ok: false, status: 401 });
    const { fetchMe } = requireClient();

    const result = await fetchMe();

    expect(result).toEqual({ ok: false, error: { tag: 'unauthorized' } });
  });

  // US-044 (T1.5/T1.6, design §1.2): `esMeDto` widened + tightened to mirror
  // `AuthMeResponse` exactly — one accept/reject case per field, never a
  // single "malformed body" case standing in for all of them
  // (judgment-anticipated test class 1).
  describe('esMeDto per-field guard (US-044)', () => {
    it('accepts email: null — the regression this change exists to fix (demo accounts, AuthMeResponse)', async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...validMeDto, email: null }),
      });
      const { fetchMe } = requireClient();

      const result = await fetchMe();

      expect(result).toEqual({
        ok: true,
        value: { ...validMeDto, email: null },
      });
    });

    it('rejects a missing nombre', async () => {
      const { nombre: _nombre, ...sinNombre } = validMeDto;
      mockFetchOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(sinNombre),
      });
      const { fetchMe } = requireClient();

      const result = await fetchMe();

      expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
    });

    it('rejects a wrong-typed nombre', async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...validMeDto, nombre: 123 }),
      });
      const { fetchMe } = requireClient();

      const result = await fetchMe();

      expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
    });

    it('rejects a missing esDemo', async () => {
      const { esDemo: _esDemo, ...sinEsDemo } = validMeDto;
      mockFetchOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(sinEsDemo),
      });
      const { fetchMe } = requireClient();

      const result = await fetchMe();

      expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
    });

    it('rejects a wrong-typed esDemo', async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...validMeDto, esDemo: 'no' }),
      });
      const { fetchMe } = requireClient();

      const result = await fetchMe();

      expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
    });

    it('rejects a missing googleVinculado', async () => {
      const { googleVinculado: _googleVinculado, ...sinGoogleVinculado } =
        validMeDto;
      mockFetchOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(sinGoogleVinculado),
      });
      const { fetchMe } = requireClient();

      const result = await fetchMe();

      expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
    });

    it('rejects a wrong-typed googleVinculado', async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...validMeDto, googleVinculado: 'no' }),
      });
      const { fetchMe } = requireClient();

      const result = await fetchMe();

      expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
    });
  });
});

describe('postLogout', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    mockLeerToken.mockReset().mockResolvedValue('stored-token');
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

  it('POSTs /api/auth/logout with both x-api-key and Authorization: Bearer <token> (MOB-04)', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });
    const { postLogout } = requireClient();

    await postLogout();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key',
          Authorization: 'Bearer stored-token',
        }),
      }),
    );
  });

  it('resolves {ok:true} on a 204 success', async () => {
    mockFetchOnce({ ok: true, status: 204 });
    const { postLogout } = requireClient();

    const result = await postLogout();

    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('maps a fetch rejection to {tag:"network"} (logout must never throw)', async () => {
    (global as unknown as { fetch: typeof fetch }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const { postLogout } = requireClient();

    const result = await postLogout();

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
  });
});

describe('postGoogleIdToken', () => {
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

  it('POSTs {idToken} to /api/auth/google/token with only x-api-key (no session yet, mirrors postLogin, design §9.1)', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validLoginResponse),
    });
    const { postGoogleIdToken } = requireClient();

    await postGoogleIdToken('a-google-id-token');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/auth/google/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'test-api-key' }),
        body: JSON.stringify({ idToken: 'a-google-id-token' }),
      }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(
      (options.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
  });

  it('resolves {ok:true, value:{token,userId,expiresAt}} on success, reusing the LoginResponseDto guard', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validLoginResponse),
    });
    const { postGoogleIdToken } = requireClient();

    const result = await postGoogleIdToken('a-google-id-token');

    expect(result).toEqual({ ok: true, value: validLoginResponse });
  });

  it('maps a 401 (generic — no matching user, unverified email, invalid token, etc.) to {tag:"unauthorized"} (AUTH-21)', async () => {
    mockFetchOnce({ ok: false, status: 401 });
    const { postGoogleIdToken } = requireClient();

    const result = await postGoogleIdToken('bad-token');

    expect(result).toEqual({ ok: false, error: { tag: 'unauthorized' } });
  });

  it('maps a 429 (rate limited) to {tag:"http", status:429}', async () => {
    mockFetchOnce({ ok: false, status: 429 });
    const { postGoogleIdToken } = requireClient();

    const result = await postGoogleIdToken('a-google-id-token');

    expect(result).toEqual({ ok: false, error: { tag: 'http', status: 429 } });
  });

  it('maps a fetch rejection to {tag:"network"} (never throws)', async () => {
    (global as unknown as { fetch: typeof fetch }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const { postGoogleIdToken } = requireClient();

    const result = await postGoogleIdToken('a-google-id-token');

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
  });

  it('maps a malformed 2xx body to {tag:"parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ unexpected: true }),
    });
    const { postGoogleIdToken } = requireClient();

    const result = await postGoogleIdToken('a-google-id-token');

    expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
  });

  it('maps a 2xx body whose json() throws to {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('invalid json')),
    });
    const { postGoogleIdToken } = requireClient();

    const result = await postGoogleIdToken('a-google-id-token');

    expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
  });

  it('returns {tag: "network"} without fetching when API_BASE_URL is missing', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = '';
    const fetchMock = mockFetchOnce({ ok: true, status: 200 });
    const { postGoogleIdToken } = requireClient();

    const result = await postGoogleIdToken('a-google-id-token');

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // FIX 1 (CRITICAL, design §9.4): a hung fetch (dead connection, no
  // rejection) must still resolve within the bounded network-leg timeout
  // instead of leaving the login screen stuck in `submitting` forever.
  it('maps a hung fetch to {tag: "network"} once the network-leg timeout elapses (bounded network leg)', async () => {
    jest.useFakeTimers();
    try {
      // Never resolves — simulates a hung connection.
      (global as unknown as { fetch: typeof fetch }).fetch = jest
        .fn()
        .mockReturnValue(new Promise(() => {})) as unknown as typeof fetch;
      const { postGoogleIdToken } = requireClient();

      const resultPromise = postGoogleIdToken('a-google-id-token');
      jest.advanceTimersByTime(NETWORK_LEG_TIMEOUT_MS);

      await expect(resultPromise).resolves.toEqual({
        ok: false,
        error: { tag: 'network' },
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('fetchAuthCapabilities', () => {
  const ORIGINAL_ENV = process.env;
  const validCapabilities = {
    googleLoginEnabled: true,
    googleLoginMobileEnabled: true,
  };

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

  it('GETs /api/auth/capabilities with only x-api-key — no construirHeadersSesion, no session exists yet (design §9.1)', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validCapabilities),
    });
    const { fetchAuthCapabilities } = requireClient();

    await fetchAuthCapabilities();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/auth/capabilities',
      { headers: { 'x-api-key': 'test-api-key' } },
    );
    expect(mockLeerToken).not.toHaveBeenCalled();
  });

  it('resolves {ok:true, value:{googleLoginEnabled,googleLoginMobileEnabled}} on success', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validCapabilities),
    });
    const { fetchAuthCapabilities } = requireClient();

    const result = await fetchAuthCapabilities();

    expect(result).toEqual({ ok: true, value: validCapabilities });
  });

  it('maps a fetch rejection to {tag:"network"} (never throws, MOB-06 fail-closed)', async () => {
    (global as unknown as { fetch: typeof fetch }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const { fetchAuthCapabilities } = requireClient();

    const result = await fetchAuthCapabilities();

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
  });

  it('maps a non-2xx response to {tag:"http", status}', async () => {
    mockFetchOnce({ ok: false, status: 500 });
    const { fetchAuthCapabilities } = requireClient();

    const result = await fetchAuthCapabilities();

    expect(result).toEqual({ ok: false, error: { tag: 'http', status: 500 } });
  });

  it('maps a 401 (missing/bad x-api-key) to {tag:"unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 });
    const { fetchAuthCapabilities } = requireClient();

    const result = await fetchAuthCapabilities();

    expect(result).toEqual({ ok: false, error: { tag: 'unauthorized' } });
  });

  it('maps a malformed 2xx body to {tag:"parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ unexpected: true }),
    });
    const { fetchAuthCapabilities } = requireClient();

    const result = await fetchAuthCapabilities();

    expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
  });

  it('maps a 2xx body whose json() throws to {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('invalid json')),
    });
    const { fetchAuthCapabilities } = requireClient();

    const result = await fetchAuthCapabilities();

    expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
  });

  it('returns {tag: "network"} without fetching when API_BASE_URL is missing', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = '';
    const fetchMock = mockFetchOnce({ ok: true, status: 200 });
    const { fetchAuthCapabilities } = requireClient();

    const result = await fetchAuthCapabilities();

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // FIX 1 (CRITICAL, design §9.4): same bounded-network-leg guarantee as
  // `postGoogleIdToken` — a hung capabilities fetch must not block mount
  // forever (MOB-06 fail-closed gate needs this to resolve).
  it('maps a hung fetch to {tag: "network"} once the network-leg timeout elapses (bounded network leg)', async () => {
    jest.useFakeTimers();
    try {
      (global as unknown as { fetch: typeof fetch }).fetch = jest
        .fn()
        .mockReturnValue(new Promise(() => {})) as unknown as typeof fetch;
      const { fetchAuthCapabilities } = requireClient();

      const resultPromise = fetchAuthCapabilities();
      jest.advanceTimersByTime(NETWORK_LEG_TIMEOUT_MS);

      await expect(resultPromise).resolves.toEqual({
        ok: false,
        error: { tag: 'network' },
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
