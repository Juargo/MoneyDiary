import { mensajeDeErrorReclasificar } from './mensajes-reclasificar';
import type { ApiError } from './api-error';

// T-04 RED: unit specs for mensajes-reclasificar (US-056, D-21/T-C5)
// CRITICAL: 400/404 responses have content?: never (no body) — no code field.
// The switch branches on HTTP status ONLY, never on a code field.

describe('mensajeDeErrorReclasificar', () => {
  it("{ tag:'http', status:400 } (no code field — body absent) → invalid-category copy", () => {
    const error: ApiError = { tag: 'http', status: 400 };
    const msg = mensajeDeErrorReclasificar(error);
    expect(msg).toBe('La categoría elegida no es válida. Elige otra.');
  });

  it("{ tag:'http', status:404 } → tx-not-found copy", () => {
    const error: ApiError = { tag: 'http', status: 404 };
    const msg = mensajeDeErrorReclasificar(error);
    expect(msg).toBe(
      'Ese movimiento ya no existe. Vuelve al resumen y recarga.',
    );
  });

  it('network → copiaPorApiError', () => {
    const error: ApiError = { tag: 'network' };
    const msg = mensajeDeErrorReclasificar(error);
    expect(msg).toBe(
      'Problema de conexión. Revisa tu internet e intenta de nuevo.',
    );
  });

  it('unauthorized → copiaPorApiError', () => {
    const error: ApiError = { tag: 'unauthorized' };
    const msg = mensajeDeErrorReclasificar(error);
    expect(msg).toBe(
      'No se pudo verificar el acceso. Intenta de nuevo más tarde.',
    );
  });

  it('parse → copiaPorApiError', () => {
    const error: ApiError = { tag: 'parse' };
    const msg = mensajeDeErrorReclasificar(error);
    expect(msg).toBe('Respuesta inesperada del servidor.');
  });

  it('other http status → copiaPorApiError generic http copy', () => {
    const error: ApiError = { tag: 'http', status: 500 };
    const msg = mensajeDeErrorReclasificar(error);
    expect(msg).toBe('Error del servidor (código 500).');
  });
});
