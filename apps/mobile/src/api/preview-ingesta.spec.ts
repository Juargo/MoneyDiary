import type { DocumentPickerAsset } from 'expo-document-picker';

// Mirrors `post-ingesta.spec.ts` exactly (US-003 Slice 3, design.md §10.2):
// `expo-file-system`'s `File` implements `Blob` over a `file://` URI (US-033
// fix). Its native module is unavailable under jest, so mock it as a real
// `Blob` subclass that records the `uri`.
jest.mock('expo-file-system', () => ({
  File: class MockFile extends Blob {
    readonly uri: string;
    constructor(uri: string) {
      super([]);
      if (uri === 'throw://construct-fails') {
        throw new Error('validatePath failed');
      }
      this.uri = uri;
    }
  },
}));

const validPreviewResponse = {
  banco: 'BancoEstado',
  tipoCuenta: 'CuentaRUT',
  numeroCuenta: '123456789',
  estructura: { totalFilasDatos: 2 },
  muestra: [
    {
      fecha: '2026-07-01T00:00:00.000Z',
      descripcion: 'Compra',
      cargo: '5000',
      abono: '0',
    },
    {
      fecha: '2026-07-02T00:00:00.000Z',
      descripcion: 'Sueldo',
      cargo: '0',
      abono: '500000',
    },
  ],
};

function archivoSeleccionado(
  overrides: Partial<DocumentPickerAsset> = {},
): DocumentPickerAsset {
  return {
    uri: 'file:///tmp/cartola.xlsx',
    name: 'cartola.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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

// `construirHeadersSesion` is mocked at the module boundary, mirroring
// `post-ingesta.spec.ts`.
const mockConstruirHeadersSesion = jest.fn<
  Promise<Record<string, string>>,
  []
>();
jest.mock('./client', () => ({
  construirHeadersSesion: () => mockConstruirHeadersSesion(),
}));

function requirePreviewIngesta(): typeof import('./preview-ingesta') {
  return jest.requireActual('./preview-ingesta');
}

describe('previewIngesta', () => {
  const ORIGINAL_ENV = process.env;
  const HEADERS_SESION = {
    'x-api-key': 'test-api-key',
    Authorization: 'Bearer stored-token',
  };

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

  it('POSTs the file as a Blob FormData part to {base}/api/ingestas/preview under field "file" with the original filename', async () => {
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validPreviewResponse),
    });
    const { previewIngesta } = requirePreviewIngesta();

    await previewIngesta(archivoSeleccionado());

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/ingestas/preview',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.body).toBeInstanceOf(FormData);
    const [campo, valor, filename] = appendSpy.mock.calls[0] as [
      string,
      Blob & { uri?: string },
      string,
    ];
    expect(campo).toBe('file');
    expect(valor).toBeInstanceOf(Blob);
    expect(valor.uri).toBe('file:///tmp/cartola.xlsx');
    expect(filename).toBe('cartola.xlsx');
  });

  it("never sets a Content-Type header manually — only construirHeadersSesion()'s headers are sent", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validPreviewResponse),
    });
    const { previewIngesta } = requirePreviewIngesta();

    await previewIngesta(archivoSeleccionado());

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers).toEqual(HEADERS_SESION);
    expect(headers['Content-Type']).toBeUndefined();
    expect(headers['content-type']).toBeUndefined();
  });

  it('reuses construirHeadersSesion() verbatim for auth headers (x-api-key + Bearer)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validPreviewResponse),
    });
    const { previewIngesta } = requirePreviewIngesta();

    await previewIngesta(archivoSeleccionado());

    expect(mockConstruirHeadersSesion).toHaveBeenCalledTimes(1);
  });

  it('resolves {ok: true, value} on a well-formed 2xx body', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validPreviewResponse),
    });
    const { previewIngesta } = requirePreviewIngesta();

    const result = await previewIngesta(archivoSeleccionado());

    expect(result).toEqual({ ok: true, value: validPreviewResponse });
  });

  it('maps a 400 to {tag:"http", status:400, message} carrying the backend body.message', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'Banco no reconocido.' }),
    });
    const { previewIngesta } = requirePreviewIngesta();

    const result = await previewIngesta(archivoSeleccionado());

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
    const { previewIngesta } = requirePreviewIngesta();

    const result = await previewIngesta(archivoSeleccionado());

    expect(result).toEqual({
      ok: false,
      error: { tag: 'http', status: 400, message: undefined },
    });
  });

  it('maps res.status === 401 to {tag: "unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 });
    const { previewIngesta } = requirePreviewIngesta();

    const result = await previewIngesta(archivoSeleccionado());

    expect(result).toEqual({ ok: false, error: { tag: 'unauthorized' } });
  });

  it('maps other non-2xx statuses to {tag: "http", status}', async () => {
    mockFetchOnce({ ok: false, status: 500 });
    const { previewIngesta } = requirePreviewIngesta();

    const result = await previewIngesta(archivoSeleccionado());

    expect(result).toEqual({ ok: false, error: { tag: 'http', status: 500 } });
  });

  it('maps a synchronous File-construction failure to {tag: "network"} without fetching (never-throws contract)', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 200 });
    const { previewIngesta } = requirePreviewIngesta();

    const result = await previewIngesta(
      archivoSeleccionado({ uri: 'throw://construct-fails' }),
    );

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a fetch rejection to {tag: "network"} (never hangs)', async () => {
    (global as unknown as { fetch: typeof fetch }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const { previewIngesta } = requirePreviewIngesta();

    const result = await previewIngesta(archivoSeleccionado());

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
  });

  it('maps a 2xx body that fails the shape guard (missing banco) to {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ ...validPreviewResponse, banco: undefined }),
    });
    const { previewIngesta } = requirePreviewIngesta();

    const result = await previewIngesta(archivoSeleccionado());

    expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
  });

  it('maps a 2xx body that fails the shape guard (missing estructura.totalFilasDatos) to {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ...validPreviewResponse, estructura: {} }),
    });
    const { previewIngesta } = requirePreviewIngesta();

    const result = await previewIngesta(archivoSeleccionado());

    expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
  });

  it('maps a 2xx body whose muestra rows carry non-string cargo/abono to {tag: "parse"} (mobile renders per-row money)', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ...validPreviewResponse,
          muestra: [
            {
              fecha: '2026-07-01T00:00:00.000Z',
              descripcion: 'Compra',
              cargo: 5000,
              abono: 0,
            },
          ],
        }),
    });
    const { previewIngesta } = requirePreviewIngesta();

    const result = await previewIngesta(archivoSeleccionado());

    expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
  });

  it('accepts a well-formed 2xx body with an empty muestra array', async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ...validPreviewResponse, muestra: [] }),
    });
    const { previewIngesta } = requirePreviewIngesta();

    const result = await previewIngesta(archivoSeleccionado());

    expect(result).toEqual({
      ok: true,
      value: { ...validPreviewResponse, muestra: [] },
    });
  });

  it('returns {tag: "network"} without fetching when API_BASE_URL is missing', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = '';
    const fetchMock = mockFetchOnce({ ok: true, status: 200 });
    const { previewIngesta } = requirePreviewIngesta();

    const result = await previewIngesta(archivoSeleccionado());

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
