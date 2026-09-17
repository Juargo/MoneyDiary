import { MESES_COMPLETOS_ES } from './periodo-anual';

/**
 * aFechaCorta — pure string helper (US-056, D-14).
 * Verbatim port of apps/web/src/domain/fecha.ts:34-36.
 * Slices an ISO-8601 timestamp to YYYY-MM-DD via positional surgery — TZ-safe
 * because it never reaches for `Date` math. A short/malformed input shorter
 * than 10 chars is returned verbatim (passthrough fallback).
 *
 * NOT touched by the bucket-detalle-lista-rediseño mobile port below — it has
 * live consumers (`ReclasificarMobileControl`'s confirm copy, among others)
 * that still want the short `YYYY-MM-DD` form.
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
 * aDiaConSemana — bucket-detalle-lista-rediseño mobile port (Cambio 2).
 * Verbatim port of apps/web/src/domain/fecha.ts's `aDiaConSemana`. Splits an
 * ISO-8601 UTC timestamp into the two-cell fecha column shared by both
 * mobile movimientos lists — a 2-digit day (`dia`) and a lowercase weekday
 * abbreviation (`diaSemana`). Lowercase on purpose: uppercase presentation is
 * a styling concern at the call site, never a domain decision.
 *
 * `dia` is a pure positional slice (`fechaIso.slice(8, 10)`) — same TZ-safe
 * discipline as `aFechaCorta` above, no `Date` round-trip. `diaSemana` DOES
 * need a `Date` (there is no pure-string way to derive a weekday), but it is
 * anchored to a FIXED `T00:00:00Z` suffix and read back via `getUTCDay()` —
 * deliberately NEVER `Intl.DateTimeFormat` with a `timeZone` option: that
 * would make the output depend on the RUNTIME's locale/ICU data, and in RN
 * `Intl` support varies by platform and Hermes build — reason enough on its
 * own, on top of the TZ-drift risk `Intl` + `timeZone` would reintroduce.
 * Defensive: `Number.isNaN(fecha.getTime())` guards an unparseable
 * `fechaIso` — `dia` still falls back to the same positional slice,
 * `diaSemana` becomes `''` (never thrown).
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
 * aFechaLargaLabel — bucket-detalle-lista-rediseño mobile port (Cambio 2).
 * Verbatim port of apps/web/src/domain/fecha.ts's `aFechaLargaLabel`: the
 * full Spanish date label used as the fecha cell's `accessibilityLabel`
 * ("3 de agosto de 2026"), pairing with the terse visible `aDiaConSemana`
 * pair. Reuses `MESES_COMPLETOS_ES` from `./periodo-anual` (DRY — the array
 * is not duplicated here) and the same UTC-anchored `Date` read as
 * `aDiaConSemana`, for the same TZ-drift reason. Day is NOT zero-padded
 * (`getUTCDate()` never has a leading zero, matching how a person reads a
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
