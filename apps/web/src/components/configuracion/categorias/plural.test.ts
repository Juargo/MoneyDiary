import { describe, expect, it } from 'vitest';
import { etiquetaPatrones, etiquetaTransacciones } from './plural';

/**
 * plural.ts (US-043, design.md §1/Q7a, WCTG-03): two named helpers, not one
 * generic pluraliser — the zero form of `etiquetaPatrones` is a different
 * WORD (`sin patrones`), which a naive `${n} patrón${n === 1 ? '' : 'es'}`
 * gets wrong (it would render `0 patrones`). `it.each` at 0/1/2/11 per the
 * task's exact requirement.
 */
describe('etiquetaPatrones', () => {
  it.each([
    [0, 'sin patrones'],
    [1, '1 patrón'],
    [2, '2 patrones'],
    [11, '11 patrones'],
  ])('n=%i → %s', (n, esperado) => {
    expect(etiquetaPatrones(n)).toBe(esperado);
  });
});

describe('etiquetaTransacciones', () => {
  it.each([
    [1, '1 transacción'],
    [2, '2 transacciones'],
    [11, '11 transacciones'],
  ])('n=%i → %s', (n, esperado) => {
    expect(etiquetaTransacciones(n)).toBe(esperado);
  });
});
