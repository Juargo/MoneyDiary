import type { DocumentPickerAsset } from 'expo-document-picker';

const validIngestaResponse = {
  ingestaId: 'ing-1',
  banco: 'BancoEstado',
  tipoCuenta: 'CuentaRUT',
  numeroCuenta: '123456789',
  archivo: { nombre: 'cartola.xlsx', extension: 'xlsx', tamanoBytes: 20480 },
  totalTransacciones: 2,
  transacciones: [
    { fecha: '2026-07-01T00:00:00.000Z', descripcion: 'Compra', cargo: '5000', abono: '0' },
    { fecha: '2026-07-02T00:00:00.000Z', descripcion: 'Sueldo', cargo: '0', abono: '500000' },
  ],
};

function archivoSeleccionado(
  overrides: Partial<DocumentPickerAsset> = {},
): DocumentPickerAsset {
  return {
    uri: 'file:///tmp/cartola.xlsx',
    name: 'cartola.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    lastModified: Date.now(),
    ...overrides,
  };
}

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

// `construirHeadersSesion` is mocked at the module boundary so the transport
// under test (multipart body shape + MIME-per-extension) is what's exercised,
// never a real SecureStore/session-store call (mirrors client.spec.ts's
// `leerToken` mocking style).
const mockConstruirHeadersSesion = jest.fn<Promise<Record<string, string>>, []>();
jest.mock('./client', () => ({
  construirHeadersSesion: () => mockConstruirHeadersSesion(),
}));

/**
 * `post-ingesta.ts` reads `config.ts` at module-load time (same as
 * `client.ts`), so each test that needs a specific env must reset the module
 * registry and re-require it (mirrors `client.spec.ts`'s `requireClient`).
 */
function requirePostIngesta(): typeof import('./post-ingesta') {
  return jest.requireActual('./post-ingesta');
}

describe('postIngesta', () => {
  const ORIGINAL_ENV = process.env;
  const HEADERS_SESION = { 'x-api-key': 'test-api-key', Authorization: 'Bearer stored-token' };

  beforeEach(() => {
    jest.resetModules();
    mockConstruirHeadersSesion.mockReset().mockResolvedValue(HEADERS_SESION);
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

  it('POSTs the file as RN FormData to {base}/api/ingestas under field "file" (Decision 3)', async () => {
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validIngestaResponse),
    });
    const { postIngesta } = requirePostIngesta();

    await postIngesta(archivoSeleccionado());

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/ingestas',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.body).toBeInstanceOf(FormData);
    expect(appendSpy).toHaveBeenCalledWith(
      'file',
      expect.objectContaining({
        uri: 'file:///tmp/cartola.xlsx',
        name: 'cartola.xlsx',
      }),
    );
  });

  it('derives the MIME type from the .xlsx extension, ignoring a wrong picker mimeType (Decision 3)', async () => {
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validIngestaResponse) });
    const { postIngesta } = requirePostIngesta();

    await postIngesta(archivoSeleccionado({ name: 'cartola.xlsx', mimeType: 'text/plain' }));

    expect(appendSpy).toHaveBeenCalledWith(
      'file',
      expect.objectContaining({
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
  });

  it('derives the MIME type from the .pdf extension when the picker mimeType is missing (Decision 3)', async () => {
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validIngestaResponse) });
    const { postIngesta } = requirePostIngesta();

    await postIngesta(
      archivoSeleccionado({ name: 'cartola.pdf', mimeType: undefined }),
    );

    expect(appendSpy).toHaveBeenCalledWith(
      'file',
      expect.objectContaining({ type: 'application/pdf' }),
    );
  });

  it('falls back to application/octet-stream for an unknown extension and still sends the request (backend is the extension authority)', async () => {
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validIngestaResponse),
    });
    const { postIngesta } = requirePostIngesta();

    await postIngesta(archivoSeleccionado({ name: 'documento.docx' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(appendSpy).toHaveBeenCalledWith(
      'file',
      expect.objectContaining({ type: 'application/octet-stream' }),
    );
  });

  it('lower-cases the extension before MIME lookup (case-insensitive match)', async () => {
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validIngestaResponse) });
    const { postIngesta } = requirePostIngesta();

    await postIngesta(archivoSeleccionado({ name: 'CARTOLA.XLSX' }));

    expect(appendSpy).toHaveBeenCalledWith(
      'file',
      expect.objectContaining({
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
  });

  it('never sets a Content-Type header manually — only construirHeadersSesion()\'s headers are sent (Decision 3)', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validIngestaResponse),
    });
    const { postIngesta } = requirePostIngesta();

    await postIngesta(archivoSeleccionado());

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers).toEqual(HEADERS_SESION);
    expect(headers['Content-Type']).toBeUndefined();
    expect(headers['content-type']).toBeUndefined();
  });

  it('reuses construirHeadersSesion() verbatim for auth headers (x-api-key + Bearer)', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validIngestaResponse) });
    const { postIngesta } = requirePostIngesta();

    await postIngesta(archivoSeleccionado());

    expect(mockConstruirHeadersSesion).toHaveBeenCalledTimes(1);
  });

  it('resolves {ok: true, value} on a well-formed 2xx body', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(validIngestaResponse) });
    const { postIngesta } = requirePostIngesta();

    const result = await postIngesta(archivoSeleccionado());

    expect(result).toEqual({ ok: true, value: validIngestaResponse });
  });

  it('maps a 400 to {tag:"http", status:400, message} carrying the backend body.message (Decision 4, CU-11)', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'Banco no reconocido.' }),
    });
    const { postIngesta } = requirePostIngesta();

    const result = await postIngesta(archivoSeleccionado());

    expect(result).toEqual({
      ok: false,
      error: { tag: 'http', status: 400, message: 'Banco no reconocido.' },
    });
  });

  it('maps a 400 with an unreadable body to {tag:"http", status:400, message: undefined}', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () => Promise.reject(new Error('invalid json')),
    });
    const { postIngesta } = requirePostIngesta();

    const result = await postIngesta(archivoSeleccionado());

    expect(result).toEqual({
      ok: false,
      error: { tag: 'http', status: 400, message: undefined },
    });
  });

  it('maps a 400 with a readable body but no usable string message to {tag:"http", status:400, message: undefined}', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 123 }),
    });
    const { postIngesta } = requirePostIngesta();

    const result = await postIngesta(archivoSeleccionado());

    expect(result).toEqual({
      ok: false,
      error: { tag: 'http', status: 400, message: undefined },
    });
  });

  it('maps res.status === 401 to {tag: "unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 });
    const { postIngesta } = requirePostIngesta();

    const result = await postIngesta(archivoSeleccionado());

    expect(result).toEqual({ ok: false, error: { tag: 'unauthorized' } });
  });

  it('maps other non-2xx statuses to {tag: "http", status}', async () => {
    mockFetchOnce({ ok: false, status: 500 });
    const { postIngesta } = requirePostIngesta();

    const result = await postIngesta(archivoSeleccionado());

    expect(result).toEqual({ ok: false, error: { tag: 'http', status: 500 } });
  });

  it('maps a fetch rejection to {tag: "network"} (CU-11 — never hangs)', async () => {
    (global as unknown as { fetch: typeof fetch }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const { postIngesta } = requirePostIngesta();

    const result = await postIngesta(archivoSeleccionado());

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
  });

  it('maps a 2xx body that fails the shape guard to {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ nonsense: true }),
    });
    const { postIngesta } = requirePostIngesta();

    const result = await postIngesta(archivoSeleccionado());

    expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
  });

  it('returns {tag: "network"} without fetching when API_BASE_URL is missing', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = '';
    const fetchMock = mockFetchOnce({ ok: true, status: 200 });
    const { postIngesta } = requirePostIngesta();

    const result = await postIngesta(archivoSeleccionado());

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
