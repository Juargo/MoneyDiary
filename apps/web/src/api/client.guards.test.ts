/**
 * Guard unit tests for `esPreviewIngestaDto` and `esCommitIngestaDto`
 * (US-059 PR1, T-01 RED → T-02 GREEN).
 *
 * esPreviewIngestaDto: WEB-PRV-03 — must REQUIRE canonical `filas` + `resumen`;
 * reject legacy-only shapes (muestra/estructura without filas/resumen).
 * esCommitIngestaDto: validates commit response shape (D-08).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewIngesta, postCommitIngesta } from './client';

// ---------------------------------------------------------------------------
// Canonical preview payload factory
// ---------------------------------------------------------------------------

function unaFila(overrides: Record<string, unknown> = {}) {
  return {
    rowIndex: 0,
    fecha: '2026-07-15T00:00:00.000Z',
    descripcion: 'Supermercado',
    cargo: '50000',
    abono: '0',
    esDuplicado: false,
    sugerido: { bucket: 'Necesidades', categoriaId: 'cat-01' },
    ...overrides,
  };
}

const validCanonicalPreviewBody = {
  banco: 'BancoEstado',
  tipoCuenta: 'CuentaRUT',
  numeroCuenta: '12345678',
  // legacy fields present (backend still emits them until US-061)
  estructura: { totalFilasDatos: 1 },
  muestra: [
    {
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'Supermercado',
      cargo: '50000',
      abono: '0',
    },
  ],
  // canonical fields — these are what the hardened guard requires
  filas: [unaFila()],
  resumen: { totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 },
};

const validCommitResponseBody = {
  ingestaId: 'ingesta-001',
  totalTransacciones: 1,
  duplicadosOmitidos: 0,
  transacciones: [
    {
      bucket: 'Necesidades',
      categoriaId: 'cat-01',
      cargo: '50000',
      abono: '0',
      descripcion: 'Supermercado',
      fecha: '2026-07-15T00:00:00.000Z',
    },
  ],
};

function archivoDePrueba(): File {
  return new File([new Uint8Array(10)], 'cartola.xlsx');
}

function mockFetchOk(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    }),
  );
}

// ---------------------------------------------------------------------------
// esPreviewIngestaDto — via previewIngesta() which calls the guard internally
// ---------------------------------------------------------------------------

describe('esPreviewIngestaDto (hardened — requires canonical filas + resumen)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('REJECTS a payload missing filas (legacy shape with only muestra/estructura) → {tag:"parse"}', async () => {
    const legacyBody = {
      banco: 'BancoEstado',
      tipoCuenta: 'CuentaRUT',
      numeroCuenta: '12345678',
      estructura: { totalFilasDatos: 1 },
      muestra: [
        {
          fecha: '2026-07-15T00:00:00.000Z',
          descripcion: 'Supermercado',
          cargo: '50000',
          abono: '0',
        },
      ],
      // filas absent
      // resumen absent
    };
    mockFetchOk(legacyBody);

    const result = await previewIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('REJECTS a payload with filas present but resumen absent → {tag:"parse"}', async () => {
    const bodySinResumen = {
      ...validCanonicalPreviewBody,
      resumen: undefined,
    };
    mockFetchOk(bodySinResumen);

    const result = await previewIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('REJECTS a row with cargo: "12.5" (decimal) → {tag:"parse"} (esMontoStringValido gate)', async () => {
    const bodyConDecimal = {
      ...validCanonicalPreviewBody,
      filas: [unaFila({ cargo: '12.5' })],
    };
    mockFetchOk(bodyConDecimal);

    const result = await previewIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('REJECTS a row with cargo: "" (empty string) → {tag:"parse"}', async () => {
    const bodyConVacio = {
      ...validCanonicalPreviewBody,
      filas: [unaFila({ cargo: '' })],
    };
    mockFetchOk(bodyConVacio);

    const result = await previewIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('REJECTS a row with malformed sugerido (missing categoriaId) → {tag:"parse"}', async () => {
    const bodyConSugeridoMalformado = {
      ...validCanonicalPreviewBody,
      filas: [unaFila({ sugerido: { bucket: 'Necesidades' } })], // categoriaId missing
    };
    mockFetchOk(bodyConSugeridoMalformado);

    const result = await previewIngesta(archivoDePrueba());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('ACCEPTS a canonical payload with filas[] + resumen.* + well-formed rows → {ok:true}', async () => {
    mockFetchOk(validCanonicalPreviewBody);

    const result = await previewIngesta(archivoDePrueba());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.filas).toHaveLength(1);
      expect(result.value.resumen.totalFilas).toBe(1);
    }
  });

  it('ACCEPTS a row with sugerido: null (unclassified) → {ok:true}', async () => {
    const bodyConSugeridoNull = {
      ...validCanonicalPreviewBody,
      filas: [unaFila({ sugerido: null })],
    };
    mockFetchOk(bodyConSugeridoNull);

    const result = await previewIngesta(archivoDePrueba());

    expect(result.ok).toBe(true);
  });

  it('ACCEPTS a row with sugerido.categoriaId: null (auto-classified to bucket, no specific category) → {ok:true}', async () => {
    const bodyConCatNull = {
      ...validCanonicalPreviewBody,
      filas: [unaFila({ sugerido: { bucket: 'Ingreso', categoriaId: null } })],
    };
    mockFetchOk(bodyConCatNull);

    const result = await previewIngesta(archivoDePrueba());

    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// esCommitIngestaDto — via postCommitIngesta() which calls the guard internally
// ---------------------------------------------------------------------------

describe('esCommitIngestaDto', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('REJECTS a payload missing ingestaId → {tag:"parse"}', async () => {
    const { ingestaId: _omitido, ...bodySinId } = validCommitResponseBody;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(bodySinId),
      }),
    );

    const result = await postCommitIngesta(archivoDePrueba(), []);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.tag).toBe('parse');
  });

  it('ACCEPTS a valid commit response with ingestaId, totalTransacciones, duplicadosOmitidos, transacciones[] → {ok:true}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(validCommitResponseBody),
      }),
    );

    const result = await postCommitIngesta(archivoDePrueba(), []);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ingestaId).toBe('ingesta-001');
      expect(result.value.totalTransacciones).toBe(1);
    }
  });
});
