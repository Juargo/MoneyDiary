/**
 * perfil.spec.ts — call-shape + fetcher-specific guards ONLY (US-044,
 * design.md §3 punto 5, tasks.md T2a.3). `enviarMutacion` es mockeado en el
 * límite del módulo: la matriz completa de branches (red/401/no-2xx/parse)
 * ya se afirma una única vez en `mutacion.spec.ts` y NO se repite aquí.
 */
import { enviarMutacion } from './mutacion';
import { patchPerfil, patchPassword } from './perfil';

jest.mock('./mutacion', () => ({
  enviarMutacion: jest.fn(),
}));

const mockEnviarMutacion = enviarMutacion as jest.Mock;

describe('patchPerfil', () => {
  beforeEach(() => {
    mockEnviarMutacion.mockReset();
  });

  it('calls enviarMutacion with PATCH /api/perfil, method PATCH, and the full patch as body', async () => {
    mockEnviarMutacion.mockResolvedValue({ ok: true, value: {} });

    await patchPerfil({
      nombre: 'Nuevo Nombre',
      email: 'nuevo@ej.com',
      passwordActual: 'actual123',
    });

    expect(mockEnviarMutacion).toHaveBeenCalledWith('/api/perfil', 'PATCH', {
      nombre: 'Nuevo Nombre',
      email: 'nuevo@ej.com',
      passwordActual: 'actual123',
    });
  });

  it('calls enviarMutacion with only the given fields when the patch is partial (no email/passwordActual)', async () => {
    mockEnviarMutacion.mockResolvedValue({ ok: true, value: {} });

    await patchPerfil({ nombre: 'Solo Nombre' });

    expect(mockEnviarMutacion).toHaveBeenCalledWith('/api/perfil', 'PATCH', {
      nombre: 'Solo Nombre',
    });
  });

  it('discards the raw Response on success and resolves {ok:true, value:undefined} without reading the body', async () => {
    const jsonSpy = jest.fn();
    mockEnviarMutacion.mockResolvedValue({
      ok: true,
      value: { json: jsonSpy },
    });

    const result = await patchPerfil({ nombre: 'Nuevo Nombre' });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('passes through the enviarMutacion error unchanged on failure', async () => {
    const error = {
      ok: false,
      error: { tag: 'http', status: 409, code: 'PERFIL_RECHAZADO' },
    };
    mockEnviarMutacion.mockResolvedValue(error);

    const result = await patchPerfil({
      email: 'nuevo@ej.com',
      passwordActual: 'x',
    });

    expect(result).toEqual(error);
  });
});

describe('patchPassword', () => {
  beforeEach(() => {
    mockEnviarMutacion.mockReset();
  });

  it('calls enviarMutacion with PATCH /api/perfil/password, method PATCH, and the given patch as body', async () => {
    mockEnviarMutacion.mockResolvedValue({ ok: true, value: {} });

    await patchPassword({
      passwordActual: 'actual123',
      passwordNueva: 'nueva12345',
    });

    expect(mockEnviarMutacion).toHaveBeenCalledWith(
      '/api/perfil/password',
      'PATCH',
      { passwordActual: 'actual123', passwordNueva: 'nueva12345' },
    );
  });

  it('discards the raw Response on success and resolves {ok:true, value:undefined} without reading the body', async () => {
    const jsonSpy = jest.fn();
    mockEnviarMutacion.mockResolvedValue({
      ok: true,
      value: { json: jsonSpy },
    });

    const result = await patchPassword({
      passwordActual: 'actual123',
      passwordNueva: 'nueva12345',
    });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('passes through the enviarMutacion error unchanged on failure', async () => {
    const error = { ok: false, error: { tag: 'unauthorized' } };
    mockEnviarMutacion.mockResolvedValue(error);

    const result = await patchPassword({
      passwordActual: 'actual123',
      passwordNueva: 'nueva12345',
    });

    expect(result).toEqual(error);
  });
});

describe('patchPerfil calls enviarMutacion exactly once per invocation', () => {
  beforeEach(() => {
    mockEnviarMutacion.mockReset();
    mockEnviarMutacion.mockResolvedValue({ ok: true, value: {} });
  });

  it('never calls enviarMutacion more than once for a single patchPerfil call', async () => {
    await patchPerfil({ nombre: 'x' });

    expect(mockEnviarMutacion).toHaveBeenCalledTimes(1);
  });
});
