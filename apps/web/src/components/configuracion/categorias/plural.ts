/**
 * plural.ts — the three-form pattern-count pluraliser (US-043, design.md
 * §1/Q7a, WCTG-03). `fraseDeImpacto` (PR #3b) reuses `etiquetaTransacciones`
 * for its `n ≥ 1` copy (design.md §1/Q6b).
 *
 * Two named helpers, not one generic pluraliser: `etiquetaPatrones`'s zero
 * form is a different WORD (`sin patrones`), not `0 patrones` — the exact
 * defect a naive `${n} patrón${n === 1 ? '' : 'es'}` produces.
 */

/** Tres formas (WCTG-03): 0 → `sin patrones` · 1 → `1 patrón` · n≥2 → `N patrones`. */
export function etiquetaPatrones(n: number): string {
  if (n === 0) {
    return 'sin patrones';
  }
  return n === 1 ? '1 patrón' : `${n} patrones`;
}

/**
 * Dos formas. En la práctica solo se llama con n ≥ 1 (el caso 0 tiene su
 * propia frase softened en `fraseDeImpacto`, design.md §1/Q6b), pero la
 * función es total y correcta para n === 0 también.
 */
export function etiquetaTransacciones(n: number): string {
  return n === 1 ? '1 transacción' : `${n} transacciones`;
}
