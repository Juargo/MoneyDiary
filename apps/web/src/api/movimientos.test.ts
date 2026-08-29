/**
 * Tests for `postMovimientoManual` (client fn) and `esRegistrarMovimientoManualDto`
 * (response guard) — US-060 T-03 (RED) → T-04 (GREEN).
 *
 * Coverage:
 * - postMovimientoManual: 201 unwrap, 400-no-body → fixed message (no body read),
 *   401, 500, network throw, malformed 201 (guard-fail → parse).
 * - esRegistrarMovimientoManualDto: accepts canonical 8-field 201;
 *   rejects missing/malformed fields (id, origen, cargo, abono).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  postMovimientoManual,
  deleteMovimiento,
  esRegistrarMovimientoManualDto,
} from './movimientos';
import { unMovimientoManualDto } from '@/test-utils/movimiento-fixtures';

// ---------------------------------------------------------------------------
// Canonical 201 response factory
// ---------------------------------------------------------------------------

const canonicalDto = unMovimientoManualDto({
  fecha: '2026-08-22T14:30:00.000Z',
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOnce(response: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const validIngresoBody = {
  tipo: 'Ingreso' as const,
  fecha: '2026-08-22',
  descripcion: 'Almuerzo',
  monto: '5000',
};

// ---------------------------------------------------------------------------
// postMovimientoManual — transport tests
// ---------------------------------------------------------------------------

describe('postMovimientoManual', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('201: resuelve a { ok: true, value: RegistrarMovimientoManualDto }', async () => {
    mockFetchOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve(canonicalDto),
    });

    const result = await postMovimientoManual(validIngresoBody);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(canonicalDto);
    }
  });

  it('400 (no body): resuelve a { ok: false, error: { tag: "invalid", message: "Datos inválidos..." } } sin llamar a res.json()', async () => {
    // D-06 §0: 400 carries NO JSON body — the client MUST NOT call res.json()
    const jsonSpy = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: jsonSpy,
      }),
    );

    const result = await postMovimientoManual(validIngresoBody);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('invalid');
      expect(result.error.message).toBe(
        'Datos inválidos. Revisa los campos y vuelve a intentar.',
      );
    }
    // CRITICAL: must NOT attempt to read the body on 400 (no body exists)
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('401: resuelve a { ok: false, error: { tag: "unauthorized", message: "Tu sesión expiró..." } }', async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      json: vi
        .fn()
        .mockRejectedValue(
          new Error(
            'unexpected res.json() call on 401 — this response has no body',
          ),
        ),
    });

    const result = await postMovimientoManual(validIngresoBody);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('unauthorized');
      expect(result.error.message).toBe(
        'Tu sesión expiró. Inicia sesión de nuevo.',
      );
    }
  });

  it('500: resuelve a { ok: false, error: { tag: "server", status: 500 } }', async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      json: vi
        .fn()
        .mockRejectedValue(
          new Error(
            'unexpected res.json() call on 500 — this response has no body',
          ),
        ),
    });

    const result = await postMovimientoManual(validIngresoBody);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('server');
      if (result.error.tag === 'server') {
        expect(result.error.status).toBe(500);
      }
    }
  });

  it('network throw: resuelve a { ok: false, error: { tag: "network" } }', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await postMovimientoManual(validIngresoBody);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('network');
    }
  });

  it('201 malformado (guard falla): resuelve a { ok: false, error: { tag: "parse" } }', async () => {
    mockFetchOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ nonsense: true }),
    });

    const result = await postMovimientoManual(validIngresoBody);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('parse');
    }
  });
});

// ---------------------------------------------------------------------------
// deleteMovimiento — DELETE /api/movimientos/:id (SDD correccion-movimientos-
// manuales, PR 3, WEB-DEL-01/D-03). Mirrors `deleteIngesta`'s status map
// (client.ts): 204 -> ok/undefined without reading a body, 401 ->
// unauthorized, 404 -> server with a specific "ya no existe" message (merged
// anti-enumeration, DEL-02), any other non-2xx (incl. 403 DEMO_SOLO_LECTURA)
// -> generic server error, network throw -> network.
// ---------------------------------------------------------------------------

describe('deleteMovimiento', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('204: resuelve a { ok: true, value: undefined } sin llamar a res.json()', async () => {
    const jsonSpy = vi.fn();
    const fetchMock = mockFetchOnce({ ok: true, status: 204, json: jsonSpy });

    const result = await deleteMovimiento('tx-1');

    expect(result).toEqual({ ok: true, value: undefined });
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('/api/movimientos/tx-1', {
      method: 'DELETE',
      keepalive: false,
    });
  });

  it('keepalive: true forwards to fetch (design-hardening change, pagehide flush escape hatch)', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });

    await deleteMovimiento('tx-1', { keepalive: true });

    expect(fetchMock).toHaveBeenCalledWith('/api/movimientos/tx-1', {
      method: 'DELETE',
      keepalive: true,
    });
  });

  it('401: resuelve a { ok: false, error: { tag: "unauthorized" } }', async () => {
    mockFetchOnce({ ok: false, status: 401 });

    const result = await deleteMovimiento('tx-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('unauthorized');
    }
  });

  it('404: resuelve a { ok: false, error: { tag: "server", status: 404 } } (DEL-02 merged anti-enumeration)', async () => {
    mockFetchOnce({ ok: false, status: 404 });

    const result = await deleteMovimiento('tx-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('server');
      if (result.error.tag === 'server') {
        expect(result.error.status).toBe(404);
      }
    }
  });

  it('403 (DEMO_SOLO_LECTURA): cae en la rama genérica non-2xx -> server', async () => {
    mockFetchOnce({ ok: false, status: 403 });

    const result = await deleteMovimiento('tx-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('server');
      if (result.error.tag === 'server') {
        expect(result.error.status).toBe(403);
      }
    }
  });

  it('network throw: resuelve a { ok: false, error: { tag: "network" } }', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const result = await deleteMovimiento('tx-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.tag).toBe('network');
    }
  });

  it('encodea el id en la URL', async () => {
    const fetchMock = mockFetchOnce({ ok: true, status: 204 });

    await deleteMovimiento('tx with spaces');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/movimientos/tx%20with%20spaces',
      { method: 'DELETE', keepalive: false },
    );
  });
});

// ---------------------------------------------------------------------------
// esRegistrarMovimientoManualDto — guard tests
// ---------------------------------------------------------------------------

describe('esRegistrarMovimientoManualDto', () => {
  it('acepta el DTO canónico de 8 campos con origen: "Manual"', () => {
    expect(esRegistrarMovimientoManualDto(canonicalDto)).toBe(true);
  });

  it('rechaza cuando falta id', () => {
    const { id: _i, ...sinId } = canonicalDto;
    expect(esRegistrarMovimientoManualDto(sinId)).toBe(false);
  });

  it('rechaza cuando falta origen', () => {
    const { origen: _o, ...sinOrigen } = canonicalDto;
    expect(esRegistrarMovimientoManualDto(sinOrigen)).toBe(false);
  });

  it('rechaza cuando origen !== "Manual"', () => {
    expect(
      esRegistrarMovimientoManualDto({ ...canonicalDto, origen: 'Import' }),
    ).toBe(false);
  });

  it('rechaza cuando falta cargo', () => {
    const { cargo: _c, ...sinCargo } = canonicalDto;
    expect(esRegistrarMovimientoManualDto(sinCargo)).toBe(false);
  });

  it('rechaza cuando falta abono', () => {
    const { abono: _a, ...sinAbono } = canonicalDto;
    expect(esRegistrarMovimientoManualDto(sinAbono)).toBe(false);
  });

  it('rechaza cargo: "12.5" (decimal — no cumple esMontoStringValido)', () => {
    expect(
      esRegistrarMovimientoManualDto({ ...canonicalDto, cargo: '12.5' }),
    ).toBe(false);
  });

  it('rechaza cargo: "" (string vacío)', () => {
    expect(esRegistrarMovimientoManualDto({ ...canonicalDto, cargo: '' })).toBe(
      false,
    );
  });

  it('acepta fecha como timestamp ISO-8601 completo (esFechaValida — parseability, not short-date format)', () => {
    expect(
      esRegistrarMovimientoManualDto({
        ...canonicalDto,
        fecha: '2026-08-22T14:30:00.000Z',
      }),
    ).toBe(true);
  });

  it('rechaza fecha vacía', () => {
    expect(esRegistrarMovimientoManualDto({ ...canonicalDto, fecha: '' })).toBe(
      false,
    );
  });

  it('rechaza categoriaId que no es string ni null', () => {
    expect(
      esRegistrarMovimientoManualDto({ ...canonicalDto, categoriaId: 123 }),
    ).toBe(false);
  });

  it('acepta categoriaId: null (Ingreso rows)', () => {
    expect(
      esRegistrarMovimientoManualDto({ ...canonicalDto, categoriaId: null }),
    ).toBe(true);
  });
});
