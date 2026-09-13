import {
  aOverlayEdits,
  categoriaEfectiva,
  esFilaEditable,
  formatearFilaPreview,
} from './preview-cartola';
import type { PreviewFilaDto } from '@moneydiary/api-client';

// Pure domain logic (Phase 4, design.md D-04/D-05) — no React Native import,
// tested with plain Jest like `formatear-monto.spec.ts`.

function filaDePreview(
  overrides: Partial<PreviewFilaDto> = {},
): PreviewFilaDto {
  return {
    rowIndex: 0,
    fecha: '2026-07-01T00:00:00.000Z',
    descripcion: 'Compra supermercado',
    cargo: '5000',
    abono: '0',
    esDuplicado: false,
    sugerido: { bucket: 'Necesidades', categoriaId: 'cat-arriendo' },
    ...overrides,
  };
}

describe('formatearFilaPreview', () => {
  it('formats cargo/abono as CLP over the string amount (never parses to number)', () => {
    const fila = filaDePreview({ cargo: '9007199254740993', abono: '0' });

    const resultado = formatearFilaPreview(fila);

    expect(resultado.cargo).toBe('$9.007.199.254.740.993');
    expect(resultado.abono).toBe('$0');
  });

  it('slices the ISO fecha down to its date-only portion (YYYY-MM-DD)', () => {
    const fila = filaDePreview({ fecha: '2026-07-15T13:45:00.000Z' });

    const resultado = formatearFilaPreview(fila);

    expect(resultado.fecha).toBe('2026-07-15');
  });

  it('passes descripcion through unchanged', () => {
    const fila = filaDePreview({ descripcion: 'Transferencia recibida' });

    const resultado = formatearFilaPreview(fila);

    expect(resultado.descripcion).toBe('Transferencia recibida');
  });
});

describe('esFilaEditable (MOB-PRV-06)', () => {
  it('is false for a duplicate row', () => {
    const fila = filaDePreview({ esDuplicado: true });

    expect(esFilaEditable(fila)).toBe(false);
  });

  it('is false for a row the backend classified as income (sugerido.bucket === "Ingreso")', () => {
    const fila = filaDePreview({
      esDuplicado: false,
      sugerido: { bucket: 'Ingreso', categoriaId: null },
    });

    expect(esFilaEditable(fila)).toBe(false);
  });

  it('is true for a non-duplicate, non-Ingreso row', () => {
    const fila = filaDePreview({
      esDuplicado: false,
      sugerido: { bucket: 'Necesidades', categoriaId: 'cat-arriendo' },
    });

    expect(esFilaEditable(fila)).toBe(true);
  });

  it('is true when the row has no suggestion yet (sugerido: null)', () => {
    const fila = filaDePreview({ esDuplicado: false, sugerido: null });

    expect(esFilaEditable(fila)).toBe(true);
  });
});

describe('categoriaEfectiva (D-04 merge rule)', () => {
  it('returns the pending edit when one exists for the row (edits win)', () => {
    const fila = filaDePreview({ rowIndex: 2 });
    const edits = new Map([[2, 'cat-transporte']]);

    expect(categoriaEfectiva(fila, edits)).toBe('cat-transporte');
  });

  it('falls back to sugerido.categoriaId when there is no pending edit', () => {
    const fila = filaDePreview({
      rowIndex: 3,
      sugerido: { bucket: 'Deseos', categoriaId: 'cat-ocio' },
    });

    expect(categoriaEfectiva(fila, new Map())).toBe('cat-ocio');
  });

  it('returns null when neither a pending edit nor a suggestion exist', () => {
    const fila = filaDePreview({ rowIndex: 4, sugerido: null });

    expect(categoriaEfectiva(fila, new Map())).toBeNull();
  });
});

describe('aOverlayEdits (MOB-PRV-08)', () => {
  it('includes only rows with a pending edit', () => {
    const filas = [
      filaDePreview({ rowIndex: 0 }),
      filaDePreview({ rowIndex: 1 }),
      filaDePreview({ rowIndex: 2 }),
    ];
    const edits = new Map([
      [0, 'cat-a'],
      [2, 'cat-b'],
    ]);

    expect(aOverlayEdits(filas, edits)).toEqual([
      { rowIndex: 0, categoriaId: 'cat-a' },
      { rowIndex: 2, categoriaId: 'cat-b' },
    ]);
  });

  it('excludes a duplicate row even if it were present in the edits map (defensive, MOB-PRV-08)', () => {
    const filas = [filaDePreview({ rowIndex: 5, esDuplicado: true })];
    const edits = new Map([[5, 'cat-a']]);

    expect(aOverlayEdits(filas, edits)).toEqual([]);
  });

  it('excludes an Ingreso row even if it were present in the edits map (defensive, MOB-PRV-08)', () => {
    const filas = [
      filaDePreview({
        rowIndex: 6,
        esDuplicado: false,
        sugerido: { bucket: 'Ingreso', categoriaId: null },
      }),
    ];
    const edits = new Map([[6, 'cat-a']]);

    expect(aOverlayEdits(filas, edits)).toEqual([]);
  });

  it('returns an empty array when there are no pending edits', () => {
    const filas = [filaDePreview({ rowIndex: 0 })];

    expect(aOverlayEdits(filas, new Map())).toEqual([]);
  });
});
