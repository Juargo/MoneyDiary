import type { DocumentPickerAsset } from 'expo-document-picker';

// Mirrors `preview-ingesta.spec.ts` exactly (design.md D-03: no shared
// multipart helper, transport doctrine copied per call site):
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

const validCommitResponse = {
  ingestaId: 'ing-1',
  totalTransacciones: 2,
  duplicadosOmitidos: 0,
  transacciones: [
    {
      fecha: '2026-07-01T00:00:00.000Z',
      descripcion: 'Compra',
      cargo: '5000',
      abono: '0',
      bucket: 'Necesidades',
      categoriaId: null,
    },
    {
      fecha: '2026-07-02T00:00:00.000Z',
      descripcion: 'Sueldo',
      cargo: '0',
      abono: '500000',
      bucket: 'Ingreso',
      categoriaId: null,
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
// `preview-ingesta.spec.ts`.
const mockConstruirHeadersSesion = jest.fn<
  Promise<Record<string, string>>,
  []
>();
jest.mock('./client', () => ({
  construirHeadersSesion: () => mockConstruirHeadersSesion(),
}));

function requireCommitIngesta(): typeof import('./commit-ingesta') {
  return jest.requireActual('./commit-ingesta');
}

describe('commitIngesta', () => {
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

  it('POSTs the file as a Blob FormData part to {base}/api/ingestas/commit under field "file" with the original filename', async () => {
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve(validCommitResponse),
    });
    const { commitIngesta } = requireCommitIngesta();

    await commitIngesta(archivoSeleccionado(), []);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/ingestas/commit',
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

  it('MOB-PRV-04: always sends the edits field as a JSON string, even for an empty overlay ([])', async () => {
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    mockFetchOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve(validCommitResponse),
    });
    const { commitIngesta } = requireCommitIngesta();

    await commitIngesta(archivoSeleccionado(), []);

    const llamadaEdits = appendSpy.mock.calls.find(
      ([campo]) => campo === 'edits',
    ) as [string, string] | undefined;
    expect(llamadaEdits).toBeDefined();
    expect(llamadaEdits?.[1]).toBe('[]');
  });

  it('sends a sparse edits overlay as a JSON-stringified array of {rowIndex, categoriaId}', async () => {
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    mockFetchOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve(validCommitResponse),
    });
    const { commitIngesta } = requireCommitIngesta();

    await commitIngesta(archivoSeleccionado(), [
      { rowIndex: 3, categoriaId: 'cat-ahorro' },
      { rowIndex: 7, categoriaId: 'cat-ocio' },
    ]);

    const llamadaEdits = appendSpy.mock.calls.find(
      ([campo]) => campo === 'edits',
    ) as [string, string] | undefined;
    expect(llamadaEdits?.[1]).toBe(
      JSON.stringify([
        { rowIndex: 3, categoriaId: 'cat-ahorro' },
        { rowIndex: 7, categoriaId: 'cat-ocio' },
      ]),
    );
  });

  it("never sets a Content-Type header manually — only construirHeadersSesion()'s headers are sent", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve(validCommitResponse),
    });
    const { commitIngesta } = requireCommitIngesta();

    await commitIngesta(archivoSeleccionado(), []);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers).toEqual(HEADERS_SESION);
    expect(headers['Content-Type']).toBeUndefined();
    expect(headers['content-type']).toBeUndefined();
  });

  it('reuses construirHeadersSesion() verbatim for auth headers (x-api-key + Bearer)', async () => {
    mockFetchOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve(validCommitResponse),
    });
    const { commitIngesta } = requireCommitIngesta();

    await commitIngesta(archivoSeleccionado(), []);

    expect(mockConstruirHeadersSesion).toHaveBeenCalledTimes(1);
  });

  it('resolves {ok: true, value} on a well-formed 201 body', async () => {
    mockFetchOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve(validCommitResponse),
    });
    const { commitIngesta } = requireCommitIngesta();

    const result = await commitIngesta(archivoSeleccionado(), []);

    expect(result).toEqual({ ok: true, value: validCommitResponse });
  });

  it('MOB-PRV-10: maps a 400 to {tag:"http", status:400, message} carrying the backend body.message', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'El campo edits es inválido.' }),
    });
    const { commitIngesta } = requireCommitIngesta();

    const result = await commitIngesta(archivoSeleccionado(), []);

    expect(result).toEqual({
      ok: false,
      error: {
        tag: 'http',
        status: 400,
        message: 'El campo edits es inválido.',
      },
    });
  });

  it('maps a 400 with an unreadable body to {tag:"http", status:400, message: undefined}', async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      json: () => Promise.reject(new Error('invalid json')),
    });
    const { commitIngesta } = requireCommitIngesta();

    const result = await commitIngesta(archivoSeleccionado(), []);

    expect(result).toEqual({
      ok: false,
      error: { tag: 'http', status: 400, message: undefined },
    });
  });

  it('MOB-PRV-10: maps res.status === 401 to {tag: "unauthorized"}', async () => {
    mockFetchOnce({ ok: false, status: 401 });
    const { commitIngesta } = requireCommitIngesta();

    const result = await commitIngesta(archivoSeleccionado(), []);

    expect(result).toEqual({ ok: false, error: { tag: 'unauthorized' } });
  });

  it('maps other non-2xx statuses to {tag: "http", status}', async () => {
    mockFetchOnce({ ok: false, status: 500 });
    const { commitIngesta } = requireCommitIngesta();

    const result = await commitIngesta(archivoSeleccionado(), []);

    expect(result).toEqual({ ok: false, error: { tag: 'http', status: 500 } });
  });

  it('MOB-PRV-10: maps a synchronous File-construction failure to {tag: "network"} without fetching (never-throws contract)', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 201 });
    const { commitIngesta } = requireCommitIngesta();

    const result = await commitIngesta(
      archivoSeleccionado({ uri: 'throw://construct-fails' }),
      [],
    );

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('MOB-PRV-10: maps a fetch rejection to {tag: "network"} (never hangs)', async () => {
    (global as unknown as { fetch: typeof fetch }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    const { commitIngesta } = requireCommitIngesta();

    const result = await commitIngesta(archivoSeleccionado(), []);

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
  });

  it('maps a 2xx body that fails the shape guard (missing duplicadosOmitidos) to {tag: "parse"}', async () => {
    mockFetchOnce({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          ...validCommitResponse,
          duplicadosOmitidos: undefined,
        }),
    });
    const { commitIngesta } = requireCommitIngesta();

    const result = await commitIngesta(archivoSeleccionado(), []);

    expect(result).toEqual({ ok: false, error: { tag: 'parse' } });
  });

  it('returns {tag: "network"} without fetching when API_BASE_URL is missing', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = '';
    const fetchMock = mockFetchOnce({ ok: true, status: 201 });
    const { commitIngesta } = requireCommitIngesta();

    const result = await commitIngesta(archivoSeleccionado(), []);

    expect(result).toEqual({ ok: false, error: { tag: 'network' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
