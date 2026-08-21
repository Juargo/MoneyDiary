import { reclasificarCategoria } from './categorias';

import { enviarMutacion } from './mutacion';

// T-04 RED: unit specs for reclasificarCategoria wrapper (US-056, D-16/T-C8)

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
  it('request body is { categoria } only — no bucket field', async () => {
    const mockResponse = {
      status: 200,
      ok: true,
      json: () => Promise.resolve(VALID_RECLASIFICAR_BODY),
    } as Response;
    mockEnviarMutacion.mockResolvedValue({ ok: true, value: mockResponse });

    await reclasificarCategoria('tx-1', 'Alimentación');

    expect(mockEnviarMutacion).toHaveBeenCalledWith(
      expect.stringContaining('tx-1'),
      'PATCH',
      { categoria: 'Alimentación' },
    );
    // Verify no bucket field in the body
    const callArgs = mockEnviarMutacion.mock.calls[0];
    const body = callArgs[2] as Record<string, unknown>;
    expect(body).not.toHaveProperty('bucket');
  });

  it('200 ok returns guarded ReclasificarCategoriaDto value', async () => {
    const mockResponse = {
      status: 200,
      ok: true,
      json: () => Promise.resolve(VALID_RECLASIFICAR_BODY),
    } as Response;
    mockEnviarMutacion.mockResolvedValue({ ok: true, value: mockResponse });

    const result = await reclasificarCategoria('tx-1', 'Alimentación');
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

    const result = await reclasificarCategoria('tx-1', 'Alimentación');
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

    const result = await reclasificarCategoria('tx-1', 'Alimentación');
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
    await reclasificarCategoria(specialId, 'Alimentación');

    const calledUrl = mockEnviarMutacion.mock.calls[0][0];
    expect(calledUrl).toContain(encodeURIComponent(specialId));
    expect(calledUrl).not.toContain('tx/with spaces');
  });
});
