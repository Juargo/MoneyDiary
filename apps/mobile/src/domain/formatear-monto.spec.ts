import { formatearMontoCLP } from './formatear-monto';

describe('formatearMontoCLP', () => {
  it('agrupa los miles con punto y antepone $', () => {
    expect(formatearMontoCLP(1500000)).toBe('$1.500.000');
  });

  it('no agrupa montos menores a mil', () => {
    expect(formatearMontoCLP(999)).toBe('$999');
  });

  it('conserva el signo de los montos negativos', () => {
    expect(formatearMontoCLP(-2500)).toBe('-$2.500');
  });

  it('rechaza montos con decimales (dinero exacto, nunca float)', () => {
    expect(() => formatearMontoCLP(10.5)).toThrow();
  });
});
