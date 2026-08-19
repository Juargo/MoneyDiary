/**
 * plural.ts (US-044 PR5a, T5a.4)
 *
 * Ported verbatim from
 * `apps/web/src/components/configuracion/categorias/plural.ts:12-26`.
 *
 * Two named helpers, not one generic pluraliser: `etiquetaPatrones`'s zero
 * form is a different WORD (`sin patrones`), not `0 patrones` — the exact
 * defect a naive `${n} patrón${n === 1 ? '' : 'es'}` produces.
 *
 * `etiquetaTransacciones` is called by `fraseDeImpacto` (PR6b) for the
 * `n ≥ 1` impact copy (design.md §1.6).
 *
 * Pure: no React, no fetch, no env.
 */

/** Tres formas: 0 → `sin patrones` · 1 → `1 patrón` · n≥2 → `N patrones`. */
export function etiquetaPatrones(n: number): string {
  if (n === 0) {
    return 'sin patrones';
  }
  return n === 1 ? '1 patrón' : `${n} patrones`;
}

/**
 * Dos formas. In practice called with n ≥ 1 (the zero case has its own
 * softened phrase in `fraseDeImpacto`), but the function is total and
 * correct for n === 0 as well.
 */
export function etiquetaTransacciones(n: number): string {
  return n === 1 ? '1 transacción' : `${n} transacciones`;
}
