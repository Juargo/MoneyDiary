import {
  CANTIDAD_PREVIEW_DEFECTO,
  OPCIONES_CANTIDAD_PREVIEW,
  formatearFilaPreview,
  sliceMuestra,
} from './preview-cartola';
import type { PreviewTransaccionDto } from '../api/preview-ingesta';

// Pure domain logic (US-003 Slice 3, design.md §10.2) — no React Native
// import, tested with plain Jest like `formatear-monto.spec.ts`.

function filaDePreview(overrides: Partial<PreviewTransaccionDto> = {}): PreviewTransaccionDto {
  return {
    fecha: '2026-07-01T00:00:00.000Z',
    descripcion: 'Compra supermercado',
    cargo: '5000',
    abono: '0',
    ...overrides,
  };
}

function muestraDe(cantidad: number): ReadonlyArray<PreviewTransaccionDto> {
  return Array.from({ length: cantidad }, (_, i) =>
    filaDePreview({ descripcion: `Movimiento ${i + 1}` }),
  );
}

describe('OPCIONES_CANTIDAD_PREVIEW / CANTIDAD_PREVIEW_DEFECTO', () => {
  it('exposes the CA-01 selector options 10/25/50 with a default of 10', () => {
    expect(OPCIONES_CANTIDAD_PREVIEW).toEqual([10, 25, 50]);
    expect(CANTIDAD_PREVIEW_DEFECTO).toBe(10);
  });
});

describe('sliceMuestra', () => {
  it('slices the first N rows for each selector option (PREV-06)', () => {
    const muestra = muestraDe(50);

    expect(sliceMuestra(muestra, 10)).toHaveLength(10);
    expect(sliceMuestra(muestra, 25)).toHaveLength(25);
    expect(sliceMuestra(muestra, 50)).toHaveLength(50);
  });

  it('a selector larger than the sample shows every available row, no padding or error (PREV-06 boundary)', () => {
    const muestra = muestraDe(12);

    const resultado = sliceMuestra(muestra, 25);

    expect(resultado).toHaveLength(12);
    expect(resultado).toEqual(muestra);
  });

  it('an empty sample returns an empty array regardless of the selector', () => {
    expect(sliceMuestra([], 50)).toEqual([]);
  });

  it('does not fire any request — it is a pure in-memory slice', () => {
    const muestra = muestraDe(3);

    const resultado = sliceMuestra(muestra, 10);

    expect(resultado).toEqual(muestra);
  });
});

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
