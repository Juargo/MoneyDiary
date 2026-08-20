/**
 * plural.spec.ts (US-044 PR5a, T5a.3)
 *
 * Two named helpers for pattern and transaction count display (ported from
 * apps/web/src/components/configuracion/categorias/plural.ts:12-26).
 *
 * etiquetaPatrones — 3 forms: 0 → `sin patrones` · 1 → `1 patrón` · N≥2 → `N patrones`.
 * etiquetaTransacciones — 2 forms.
 *
 * Not one generic pluraliser: `etiquetaPatrones`'s zero form is a different WORD.
 */

import { etiquetaPatrones, etiquetaTransacciones } from './plural';

describe('etiquetaPatrones', () => {
  it.each([
    [0, 'sin patrones'],
    [1, '1 patrón'],
    [2, '2 patrones'],
    [11, '11 patrones'],
  ] as const)('n=%i → %s', (n, esperado) => {
    expect(etiquetaPatrones(n)).toBe(esperado);
  });
});

describe('etiquetaTransacciones', () => {
  it.each([
    [0, '0 transacciones'],
    [1, '1 transacción'],
    [2, '2 transacciones'],
    [11, '11 transacciones'],
  ] as const)('n=%i → %s', (n, esperado) => {
    expect(etiquetaTransacciones(n)).toBe(esperado);
  });
});
