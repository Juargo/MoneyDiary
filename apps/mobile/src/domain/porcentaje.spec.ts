import { SIN_PORCENTAJE_LABEL, aPorcentajeLabel } from './porcentaje';

// T-04 RED: unit specs for porcentaje helpers (US-056, D-14/T-C4)

describe('aPorcentajeLabel', () => {
  it("null → '—' (SIN_PORCENTAJE_LABEL)", () => {
    expect(aPorcentajeLabel(null)).toBe(SIN_PORCENTAJE_LABEL);
    expect(SIN_PORCENTAJE_LABEL).toBe('—');
  });

  it("0 → '0%'", () => {
    expect(aPorcentajeLabel(0)).toBe('0%');
  });

  it('N/100 format (e.g. 5000bp → 50%)', () => {
    expect(aPorcentajeLabel(5000)).toBe('50%');
  });
});
