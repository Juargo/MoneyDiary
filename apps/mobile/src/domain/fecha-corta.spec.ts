import { aFechaCorta } from './fecha-corta';

// T-04 RED: unit specs for aFechaCorta (US-056, D-14/T-C3)

describe('aFechaCorta', () => {
  it('slices ISO string to YYYY-MM-DD', () => {
    expect(aFechaCorta('2026-07-19T00:00:00.000Z')).toBe('2026-07-19');
  });

  it('passthrough on short/malformed input', () => {
    expect(aFechaCorta('2026-07')).toBe('2026-07');
  });
});
