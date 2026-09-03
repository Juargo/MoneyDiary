/**
 * `hoyLocal` — US-060 (D-04): returns the current local date in the
 * America/Santiago timezone as a `YYYY-MM-DD` string (the `en-CA` locale
 * produces that format directly, no slice needed).
 *
 * NOT a replacement for `aFechaCorta` — they serve different purposes:
 * - `aFechaCorta` slices the date part from a backend UTC ISO-8601 timestamp
 *   (display use); it is TZ-safe for that purpose because the source string
 *   is already UTC.
 * - `hoyLocal` returns TODAY in the user's local calendar. Using
 *   `aFechaCorta(new Date().toISOString())` for "today" would yield
 *   TOMORROW for Chilean evening hours (UTC-4), because
 *   `new Date().toISOString()` is already UTC-next-day by then.
 *
 * Used as: initial `fecha` state default, `max` attribute, and the
 * `fecha <= hoyLocal()` submit-time pre-validation gate.
 */
export function hoyLocal(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
  }).format(new Date());
}

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
 * `aFechaCorta` — US-054 (D-02): parte `YYYY-MM-DD` de un timestamp ISO-8601
 * UTC vía cirugía de string pura (`fechaIso.slice(0, 10)`) — sin round-trip de
 * `Date`, así que cero drift de zona horaria (Chile UTC-4 mueve días a la
 * medianoche UTC; cortar la parte de fecha UTC es TZ-safe). Guardada aguas
 * arriba por el `esFechaValida` del guard del DTO — misma división de trabajo
 * que el docblock de ese predicado: este helper solo corta, nunca valida
 * formato (una `fecha` no parseable se rechaza antes de llegar a este slice).
 *
 * 4ta ocurrencia de `.slice(0, 10)` (regla de 3, DRY). Triggers de migración
 * en vez de un vago "después": los 3 sitios legacy — `PreviewMuestra.tsx:87`,
 * `SubirCartola.tsx:333`, `ListaIngestas.tsx:114` — refactorizan a este helper
 * en su próximo touch (trigger por archivo, salida byte-idéntica, fuera de
 * alcance acá).
 *
 * ✅ CERRADO 2026-09-03: el follow-up de consistencia de display del raw-ISO
 * en la página gemela US-053 (`GrupoMovimientos`). Su columna de fecha visible
 * imprimía el timestamp completo mientras el control de eliminar de la MISMA
 * fila ya usaba este helper — una fila, dos grafías de una fecha. Ahora ambos
 * consumidores pasan por acá. Test: "renders the visible date column via
 * aFechaCorta, never the raw ISO timestamp" en `GrupoMovimientos.test.tsx`.
 */
export function aFechaCorta(fechaIso: string): string {
  return fechaIso.slice(0, 10);
}
