import type { ResumenMesDto, MeDto } from '../domain/resumen.types';

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

const validMeDto: MeDto = { userId: 'user-1', email: 'a@b.com' };

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
    expect((options.headers as Record<string, string>).Authorization).toBeUndefined();
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
    expect((options.headers as Record<string, string>).Authorization).toBeUndefined();
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
