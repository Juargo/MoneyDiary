/**
 * mutacion.spec.ts — la matriz de branches COMPLETA de `enviarMutacion` se
 * afirma UNA sola vez aquí (US-044, design.md §3 punto 5, tasks.md T2a.1).
 * `perfil.spec.ts` (y, en PR2b, `categorias.spec.ts`) NO repiten esta
 * matriz: solo verifican la forma del llamado a `enviarMutacion` (URL,
 * método, body) vía `jest.mock('./mutacion')`.
 *
 * Resolución del hallazgo de diseño (§3 vs. §1.3): la fila "malformed 2xx →
 * parse" de la tabla de §3 choca con §1.3, que es explícito en que la vía de
 * éxito de `enviarMutacion` jamás lee el body — devuelve el `Response` crudo
 * tal cual. Se sigue la disciplina de §1.3 y NO se agrega parseo al camino
 * de éxito solo para fabricar un caso `parse`: el primer test de abajo
 * verifica exactamente eso (2xx con un body sin leer, `res.json()` nunca
 * invocado) en lugar de un caso `parse` que `enviarMutacion` no puede
 * producir por diseño.
 */
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

// `leerToken` es mockeado en el límite del módulo (igual que
// `client.spec.ts`) porque `enviarMutacion` reusa `construirHeadersSesion`
// de `client.ts`, que sí llama a SecureStore.
const mockLeerToken = jest.fn<Promise<string | null>, []>();
jest.mock('./session-store', () => ({
  leerToken: () => mockLeerToken(),
}));

/**
 * `mutacion.ts` reusa `construirHeadersSesion` de `client.ts`, que lee
 * `config.ts` al cargar el módulo — mismo gotcha que `client.spec.ts`: cada
 * test que necesita un env específico resetea el registro de módulos y
 * re-requiere.
 */
function requireMutacion(): typeof import('./mutacion') {
  return jest.requireActual('./mutacion');
}

describe('enviarMutacion', () => {
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

  it('returns the raw Response unparsed on a 2xx, never reading the body (design §1.3)', async () => {
    const jsonSpy = jest.fn().mockResolvedValue({ ignored: true });
    const response = { ok: true, status: 200, json: jsonSpy };
    (global as unknown as { fetch: typeof fetch }).fetch = jest
      .fn()
      .mockResolvedValue(response) as unknown as typeof fetch;
    const { enviarMutacion } = requireMutacion();

    const result = await enviarMutacion('/api/perfil', 'PATCH', {
      nombre: 'x',
    });

    expect(result).toEqual({ ok: true, value: response });
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('sets content-type: application/json only when a body is provided', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200 });
    const { enviarMutacion } = requireMutacion();

    await enviarMutacion('/api/perfil', 'PATCH', { nombre: 'x' });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)['content-type']).toBe(
      'application/json',
    );
  });

  it('omits content-type and body on a bodyless call', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200 });
    const { enviarMutacion } = requireMutacion();

    await enviarMutacion('/api/categorias/abc', 'DELETE');

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(
      (options.headers as Record<string, string>)['content-type'],
    ).toBeUndefined();
    expect(options.body).toBeUndefined();
  });

  it('reuses construirHeadersSesion verbatim: x-api-key + Authorization Bearer when a token is stored', async () => {
    mockLeerToken.mockResolvedValue('stored-token');
    const fetchMock = mockFetchOnce({ ok: true, status: 200 });
    const { enviarMutacion } = requireMutacion();

    await enviarMutacion('/api/perfil', 'PATCH', { nombre: 'x' });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/api/perfil');
    expect(options.headers).toEqual(
      expect.objectContaining({
        'x-api-key': 'test-api-key',
        Authorization: 'Bearer stored-token',
      }),
    );
  });

  it('maps res.status === 401 to {tag: "unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 });
    const { enviarMutacion } = requireMutacion();

    const result = await enviarMutacion('/api/perfil', 'PATCH', {
      nombre: 'x',
    });

    expect(result).toEqual({ ok: false, error: { tag: 'unauthorized' } });
  });

  it('maps a non-2xx status with a parseable {code} body to {tag:"http",status,code}', async () => {
    mockFetchOnce({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ code: 'PERFIL_RECHAZADO' }),
    });
    const { enviarMutacion } = requireMutacion();

    const result = await enviarMutacion('/api/perfil', 'PATCH', {
      email: 'x@y.com',
    });

    expect(result).toEqual({
      ok: false,
      error: { tag: 'http', status: 409, code: 'PERFIL_RECHAZADO' },
    });
  });

  it('maps a non-2xx status with an unparseable body to {tag:"http",status,code:undefined}, never throwing', async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    });
    const { enviarMutacion } = requireMutacion();

    const result = await enviarMutacion('/api/perfil', 'PATCH', {
      nombre: 'x',
    });

    expect(result).toEqual({
      ok: false,
      error: { tag: 'http', status: 500, code: undefined },
    });
  });

  it('maps a fetch rejection to {tag: "network"}', async () => {
    (global as unknown as { fetch: typeof fetch }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const { enviarMutacion } = requireMutacion();

    const result = await enviarMutacion('/api/perfil', 'PATCH', {
      nombre: 'x',
    });

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
  });

  it('maps a missing API_BASE_URL to {tag: "network"} with zero fetch calls performed', async () => {
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_API_BASE_URL: '',
      EXPO_PUBLIC_API_KEY: 'test-api-key',
    };
    const fetchMock = jest.fn();
    (global as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;
    const { enviarMutacion } = requireMutacion();

    const result = await enviarMutacion('/api/perfil', 'PATCH', {
      nombre: 'x',
    });

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
