import { formatearPeriodoLabel } from './periodo-label';

describe('formatearPeriodoLabel', () => {
  it('formatea YYYY-MM al nombre del mes capitalizado + año (es)', () => {
    expect(formatearPeriodoLabel('2026-06')).toBe('Junio 2026');
  });

  it('mapea el primer y el último mes del año', () => {
    expect(formatearPeriodoLabel('2026-01')).toBe('Enero 2026');
    expect(formatearPeriodoLabel('2026-12')).toBe('Diciembre 2026');
  });

  it('devuelve el periodo crudo si no matchea YYYY-MM (nunca lanza)', () => {
    expect(formatearPeriodoLabel('basura')).toBe('basura');
    expect(formatearPeriodoLabel('2026-13')).toBe('2026-13');
  });
});
