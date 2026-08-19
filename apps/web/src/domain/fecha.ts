/**
 * `esFechaValida` — pure predicate (never throws) reused by the money-safety
 * guards in `api/client.ts` to reject a malformed `fecha` BEFORE it reaches a
 * positional slice (the mes view model's `aFechaLabel` only slices, it never
 * validates format — an unparseable `fecha` would render a garbled/empty
 * date on screen instead of failing explicitly). KISS: "non-empty + parseable
 * by `Date.parse`" is sufficient, no fancier date parsing.
 *
 * US-053 T-16 (D-08): moved here from the flat chain's
 * `detalle-bucket-view-model.ts` (deleted in T-18) — never deleted, it has
 * live consumers across the api client guards.
 */
export function esFechaValida(fecha: string): boolean {
  return fecha !== '' && !Number.isNaN(Date.parse(fecha));
}
