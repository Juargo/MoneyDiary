import { MESES_COMPLETOS_ES } from './periodo-anual';

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
 * fila ya usaba este helper — una fila, dos grafías de una fecha.
 *
 * ⚠️ Nota post-rediseño (bucket-detalle-lista-rediseño, Cambio 3): la columna
 * de fecha VISIBLE de `GrupoMovimientos` migró a `aDiaConSemana` (día +
 * abreviatura de día de semana, más un `sr-only` vía `aFechaLargaLabel`) —
 * este helper deja de usarse ahí. Sigue viva en esa misma fila para el
 * `fechaLabel` del control de eliminar (`EliminarMovimientoControl`), que
 * mantiene el formato corto `YYYY-MM-DD` en su diálogo de confirmación.
 */
export function aFechaCorta(fechaIso: string): string {
  return fechaIso.slice(0, 10);
}

const DIAS_SEMANA_ABREVIADOS_ES = [
  'dom',
  'lun',
  'mar',
  'mié',
  'jue',
  'vie',
  'sáb',
] as const;

/**
 * `aDiaConSemana` — bucket-detalle-lista-rediseño (Cambio 3): splits an
 * ISO-8601 UTC timestamp into the two-cell fecha column of the redesigned
 * movimientos row — a 2-digit day (`dia`) and a lowercase weekday
 * abbreviation (`diaSemana`). Lowercase on purpose: versalita/uppercase
 * presentation is a CSS concern (`uppercase` class at the call site), never
 * a domain decision.
 *
 * `dia` is a pure positional slice (`fechaIso.slice(8, 10)`) — same TZ-safe
 * discipline as `aFechaCorta` above, no `Date` round-trip. `diaSemana` DOES
 * need a `Date` (there is no pure-string way to derive a weekday), but it is
 * anchored to a FIXED `T00:00:00Z` suffix and read back via `getUTCDay()` —
 * never `Intl.DateTimeFormat` with a `timeZone` option (that would make the
 * output depend on the RUNTIME's locale/ICU data, not a deliberate app
 * decision — `hoyLocal`'s `Intl` usage above is the one legitimate exception,
 * because it explicitly ASKS for America/Santiago; this helper has no
 * timezone to ask for, it only reads the UTC calendar day already encoded in
 * the wire string). Defensive: `Number.isNaN(fecha.getTime())` guards an
 * unparseable `fechaIso` — `dia` still falls back to the same positional
 * slice, `diaSemana` becomes `''` (never thrown).
 */
export function aDiaConSemana(fechaIso: string): {
  dia: string;
  diaSemana: string;
} {
  const dia = fechaIso.slice(8, 10);
  const fecha = new Date(`${fechaIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) {
    return { dia, diaSemana: '' };
  }
  return { dia, diaSemana: DIAS_SEMANA_ABREVIADOS_ES[fecha.getUTCDay()] };
}

/**
 * `aFechaLargaLabel` — bucket-detalle-lista-rediseño (Cambio 3): the `sr-only`
 * full Spanish date label a screen reader announces for a movimientos row
 * ("3 de agosto de 2026"), pairing with the terse visible `aDiaConSemana`
 * pair. Reuses `MESES_COMPLETOS_ES` from `./periodo-anual` (DRY — the array
 * is not duplicated here) and the same UTC-anchored `Date` read as
 * `aDiaConSemana`, for the same TZ-drift reason. Day is NOT zero-padded
 * (`Number(...)` strips the leading zero, matching how a person reads a
 * date aloud). Defensive: an unparseable `fechaIso` falls back to
 * `aFechaCorta` — never throws.
 */
export function aFechaLargaLabel(fechaIso: string): string {
  const fecha = new Date(`${fechaIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) {
    return aFechaCorta(fechaIso);
  }
  const dia = fecha.getUTCDate();
  const mes = MESES_COMPLETOS_ES[fecha.getUTCMonth()];
  const anio = fecha.getUTCFullYear();
  return `${dia} de ${mes} de ${anio}`;
}
