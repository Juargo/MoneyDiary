import { normalizarDestacar, normalizarPeriodo } from './periodo';

// Locks the invalid-periodo -> fallback contract (spec W1.8): a malformed or
// absent `periodo` search param must normalize to `undefined` so the caller
// falls back to the backend's current-month default, never throws
// client-side. Regex behavior was manually verified correct — this test
// exists to pin it down, not to change it.
describe('normalizarPeriodo', () => {
  it.each([
    ['2026-01', '2026-01'],
    ['2026-12', '2026-12'],
  ])('keeps a valid YYYY-MM period %s', (input, expected) => {
    expect(normalizarPeriodo(input)).toBe(expected);
  });

  it.each([
    ['2026-13', 'month out of range (13)'],
    ['2026-00', 'month out of range (00)'],
    ['2026-7', 'month not zero-padded'],
    ['99999-07', 'year not exactly 4 digits'],
    ['nope', 'not a periodo at all'],
    ['', 'empty string'],
    ['2026-01 ', 'trailing whitespace'],
    [' 2026-01', 'leading whitespace'],
  ])('normalizes invalid periodo %s (%s) to undefined', (input) => {
    expect(normalizarPeriodo(input)).toBeUndefined();
  });

  it.each([[undefined], [null], [123], [{}], [['2026-01']]])(
    'normalizes non-string input %s to undefined',
    (input) => {
      expect(normalizarPeriodo(input)).toBeUndefined();
    },
  );
});

// US-053 (T-07, D-01): `destacar` is a strict, fail-closed search param —
// exactly the semantic literal 'sin-categoria', anything else normalizes to
// undefined (never coerced, never defaulted). The literal travels as the
// named constant CLAVE_SIN_CATEGORIA (re-homed to periodo.ts in T-17) so the
// 'sin-categoria' string never appears raw in route wiring (DRY).
describe('normalizarDestacar', () => {
  it('keeps the exact literal sin-categoria', () => {
    expect(normalizarDestacar('sin-categoria')).toBe('sin-categoria');
  });

  const casosDestacarInvalidos: ReadonlyArray<[string, string]> = [
    ['1', 'numeric-looking value'],
    ['true', 'boolean-looking value'],
    ['SIN-CATEGORIA', 'wrong case'],
    ['sin categoría', 'space instead of dash'],
  ];
  it.each(casosDestacarInvalidos)(
    'normalizes %s (%s) to undefined (fail-closed)',
    (input) => {
      expect(normalizarDestacar(input)).toBeUndefined();
    },
  );

  it.each([[123], [true]])('normalizes non-string %s to undefined', (input) => {
    expect(normalizarDestacar(input)).toBeUndefined();
  });

  it.each([[''], [undefined], [null]])(
    'normalizes %s to undefined',
    (input) => {
      expect(normalizarDestacar(input)).toBeUndefined();
    },
  );
});
