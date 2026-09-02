import { reclasificarCategoria } from './categorias';

import { enviarMutacion } from './mutacion';

// T-04 RED: unit specs for reclasificarCategoria wrapper (US-056, D-16/T-C8)
// categoria-unica-por-bucket PR3 (ADR-042, D-08): the wire moved from
// { categoria: <nombre> } to { categoriaId } — nombres stopped identifying a
// categoria (a nombre can now repeat across buckets). This is the ONLY gate
// on that migration: the rename is a positional string -> string signature
// change and the body is an untyped object literal, so tsc accepts either
// shape silently. These assertions must fail against the old { categoria }
// body for the change to be verifiable at all.

const VALID_RECLASIFICAR_BODY = {
  id: 'tx-1',
  bucket: 'Necesidades',
  categoria: { id: 'cat-1', nombre: 'Alimentación' },
};

jest.mock('./mutacion', () => ({
  enviarMutacion: jest.fn(),
}));

jest.mock('./session-store', () => ({
  leerToken: () => Promise.resolve('test-token'),
}));

jest.mock('./config', () => ({
  API_BASE_URL: 'http://localhost:3000',
  API_KEY: 'test-key',
}));
const mockEnviarMutacion = enviarMutacion as jest.MockedFunction<
  typeof enviarMutacion
>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('reclasificarCategoria', () => {
  it('request body is { categoriaId } only — never { categoria }, no bucket field', async () => {
    const mockResponse = {
      status: 200,
      ok: true,
      json: () => Promise.resolve(VALID_RECLASIFICAR_BODY),
    } as Response;
    mockEnviarMutacion.mockResolvedValue({ ok: true, value: mockResponse });

    await reclasificarCategoria('tx-1', 'cat-1');

    expect(mockEnviarMutacion).toHaveBeenCalledWith(
      expect.stringContaining('tx-1'),
      'PATCH',
      { categoriaId: 'cat-1' },
    );
    const callArgs = mockEnviarMutacion.mock.calls[0];
    const body = callArgs[2] as Record<string, unknown>;
    // The decisive assertions (ADR-042): the legacy { categoria } shape must
    // never be sent again, and there is still no bucket field — the server
    // derives the destination bucket.
    expect(body).not.toHaveProperty('categoria');
    expect(body).not.toHaveProperty('bucket');
  });

  it('200 ok returns guarded ReclasificarCategoriaDto value', async () => {
    const mockResponse = {
      status: 200,
      ok: true,
      json: () => Promise.resolve(VALID_RECLASIFICAR_BODY),
    } as Response;
    mockEnviarMutacion.mockResolvedValue({ ok: true, value: mockResponse });

    const result = await reclasificarCategoria('tx-1', 'cat-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.bucket).toBe('Necesidades');
      expect(result.value.categoria.nombre).toBe('Alimentación');
    }
  });

  it('non-2xx propagated from enviarMutacion', async () => {
    mockEnviarMutacion.mockResolvedValue({
      ok: false,
      error: { tag: 'http', status: 404 },
    });

    const result = await reclasificarCategoria('tx-1', 'cat-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('http');
    }
  });

  it('bad shape → parse error', async () => {
    const mockResponse = {
      status: 200,
      ok: true,
      json: () => Promise.resolve({ unexpected: 'response' }),
    } as Response;
    mockEnviarMutacion.mockResolvedValue({ ok: true, value: mockResponse });

    const result = await reclasificarCategoria('tx-1', 'cat-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('parse');
    }
  });

  it('URL encodes transaccionId via encodeURIComponent', async () => {
    const mockResponse = {
      status: 200,
      ok: true,
      json: () => Promise.resolve(VALID_RECLASIFICAR_BODY),
    } as Response;
    mockEnviarMutacion.mockResolvedValue({ ok: true, value: mockResponse });

    const specialId = 'tx/with spaces';
    await reclasificarCategoria(specialId, 'cat-1');

    const calledUrl = mockEnviarMutacion.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent(specialId));
    expect(calledUrl).not.toContain('tx/with spaces');
  });
});
