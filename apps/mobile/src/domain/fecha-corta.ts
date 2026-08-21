/**
 * aFechaCorta — pure string helper (US-056, D-14).
 * Verbatim port of apps/web/src/domain/fecha.ts:34-36.
 * Slices an ISO-8601 timestamp to YYYY-MM-DD via positional surgery — TZ-safe
 * because it never reaches for `Date` math. A short/malformed input shorter
 * than 10 chars is returned verbatim (passthrough fallback).
 */
export function aFechaCorta(fechaIso: string): string {
  return fechaIso.slice(0, 10);
}
