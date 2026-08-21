/**
 * Pure period helpers for the annual grid and month navigation (US-050/US-056).
 * Verbatim port of the relevant subset of apps/web/src/domain/periodo-anual.ts.
 * All functions never throw — an unparseable `periodo` returns the input
 * verbatim, mirroring `formatearPeriodoLabel`'s fallback discipline.
 *
 * US-050 (design §1.3) ported: `mesAbreviado`, `mesCompletoLabel`,
 * `anioDePeriodo`, `periodoActualUTC`.
 *
 * US-056 (D-13) ported: `mesAnterior`, `mesSiguiente`, `esMesActual` —
 * required by `SelectorPeriodoMes` and the detalle-mes routes. These helpers
 * are now available on mobile and actively used (the previous docstring's
 * claim that these were "out of scope for mobile" is no longer accurate and
 * has been removed per the D-13 truthful-comments obligation).
 */

const MESES_ABREVIADOS_ES = [
  'ENE',
  'FEB',
  'MAR',
  'ABR',
  'MAY',
  'JUN',
  'JUL',
  'AGO',
  'SEP',
  'OCT',
  'NOV',
  'DIC',
] as const;

const MESES_COMPLETOS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

const PERIODO_REGEX = /^(\d{4})-(\d{2})$/;

/** "2026-07" → "JUL" — the annual grid's month-cell label. */
export function mesAbreviado(periodo: string): string {
  const match = PERIODO_REGEX.exec(periodo);
  if (!match) {
    return periodo;
  }
  const mes = MESES_ABREVIADOS_ES[Number(match[2]) - 1];
  return mes ?? periodo;
}

/** "2026-07" → "julio 2026" — used in the accessible name ("Ver julio 2026"). */
export function mesCompletoLabel(periodo: string): string {
  const match = PERIODO_REGEX.exec(periodo);
  if (!match) {
    return periodo;
  }
  const mes = MESES_COMPLETOS_ES[Number(match[2]) - 1];
  return mes ? `${mes} ${match[1]}` : periodo;
}

/** "2026-07" → 2026. Falls back to `anioPorDefecto` for an unparseable periodo. */
export function anioDePeriodo(periodo: string, anioPorDefecto: number): number {
  const match = PERIODO_REGEX.exec(periodo);
  return match ? Number(match[1]) : anioPorDefecto;
}

/**
 * Today's period as `YYYY-MM`, read in UTC — never local time (same
 * discipline as the rest of the app's ISO-8601 UTC dates). `ahora` stays an
 * injected argument (never `new Date()` internally) so specs pin "today"
 * without mocking the global.
 */
export function periodoActualUTC(ahora: Date): string {
  const anio = ahora.getUTCFullYear();
  const mes = String(ahora.getUTCMonth() + 1).padStart(2, '0');
  return `${anio}-${mes}`;
}

/**
 * Parses a `YYYY-MM` periodo into its numeric parts. Returns `null` for an
 * unparseable input instead of throwing (same defensive discipline as the
 * formatting helpers above).
 */
function partesDePeriodo(
  periodo: string,
): { anio: number; mes: number } | null {
  const match = PERIODO_REGEX.exec(periodo);
  if (!match) {
    return null;
  }
  return { anio: Number(match[1]), mes: Number(match[2]) };
}

function formatearPeriodo(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

/**
 * One month back from `periodo`, e.g. "2026-07" → "2026-06", with year
 * rollover ("2026-01" → "2025-12"). Pure integer arithmetic — never `Date`
 * math (zero TZ drift risk). Unbounded — prev is always enabled for any past
 * month (ported from web apps/web/src/domain/periodo-anual.ts:128-137, D-13).
 */
export function mesAnterior(periodo: string): string {
  const partes = partesDePeriodo(periodo);
  if (!partes) {
    return periodo;
  }
  const { anio, mes } = partes;
  return mes === 1
    ? formatearPeriodo(anio - 1, 12)
    : formatearPeriodo(anio, mes - 1);
}

/**
 * One month forward from `periodo`, e.g. "2026-06" → "2026-07", with year
 * rollover ("2026-12" → "2027-01"). Callers clamp this at the current month
 * via `esMesActual` — this helper itself has no upper bound
 * (ported from web apps/web/src/domain/periodo-anual.ts:144-153, D-13).
 */
export function mesSiguiente(periodo: string): string {
  const partes = partesDePeriodo(periodo);
  if (!partes) {
    return periodo;
  }
  const { anio, mes } = partes;
  return mes === 12
    ? formatearPeriodo(anio + 1, 1)
    : formatearPeriodo(anio, mes + 1);
}

/**
 * Whether `periodo` is the current UTC calendar month. Drives the "next"
 * arrow's disabled state — `ahora` is injected for deterministic tests
 * (ported from web apps/web/src/domain/periodo-anual.ts:160-162, D-13).
 */
export function esMesActual(periodo: string, ahora: Date): boolean {
  return periodo === periodoActualUTC(ahora);
}
