import { describe, expect, it } from 'vitest';
import { esFechaValida } from './fecha';

// US-053 T-16 (D-08): `esFechaValida` moved here from the flat chain's
// `detalle-bucket-view-model.ts` (deleted in T-18) — the money-safety
// predicate reused by the api/client.ts guards to reject an unparseable
// `fecha` BEFORE it reaches a positional slice (the mes view model's
// `aFechaLabel` only slices, it never validates format — an unparseable
// `fecha` would render a garbled/empty date instead of failing explicitly).
// KISS: "non-empty + parseable by `Date.parse`" is sufficient, no fancier
// date parsing.
describe('esFechaValida', () => {
  it('acepta un ISO-8601 UTC completo', () => {
    expect(esFechaValida('2026-07-15T00:00:00.000Z')).toBe(true);
  });

  it('rechaza el string vacío', () => {
    expect(esFechaValida('')).toBe(false);
  });

  it('rechaza un string no parseable como fecha', () => {
    expect(esFechaValida('not-a-date')).toBe(false);
  });
});
