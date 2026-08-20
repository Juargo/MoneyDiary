/**
 * `esFechaValida` — pure predicate (never throws) reused by the money-safety
 * guards in `api/client.ts` to reject a malformed `fecha` BEFORE it reaches a
 * positional slice (`aFechaCorta` only slices, it never
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

/**
 * `aFechaCorta` — US-054 (D-02): `YYYY-MM-DD` date part of an ISO-8601 UTC
 * timestamp via pure string surgery (`fechaIso.slice(0, 10)`) — no `Date`
 * round-trip, so zero timezone drift (Chile UTC-4 shifts midnight-UTC days;
 * slicing the UTC date part is TZ-safe). Guarded upstream by the DTO
 * guard's `esFechaValida` — same division of labor as that predicate's own
 * docblock: this helper only slices, it never validates format (an
 * unparseable `fecha` is rejected before it ever reaches this slice).
 *
 * 4th `.slice(0, 10)` occurrence (DRY rule of 3). Migration triggers instead
 * of a vague "later": the 3 legacy slice sites — `PreviewMuestra.tsx:87`,
 * `SubirCartola.tsx:333`, `ListaIngestas.tsx:114` — refactor to this helper
 * on their next touch (per-file trigger, byte-identical output, out of
 * scope here); the US-053 twin bucket page's raw-ISO display
 * (`GrupoMovimientos.tsx:69`) is a separate display-consistency follow-up
 * (renders `aFechaCorta`, NOT byte-identical).
 */
export function aFechaCorta(fechaIso: string): string {
  return fechaIso.slice(0, 10);
}
