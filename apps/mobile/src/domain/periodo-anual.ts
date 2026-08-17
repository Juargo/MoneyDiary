/**
 * Pure period helpers for the annual grid (US-050, design §1.3). Verbatim
 * port of the subset of apps/web/src/domain/periodo-anual.ts this screen
 * actually consumes — `periodoDesde`, `esPeriodoFuturo`, `mesAnterior`,
 * `mesSiguiente`, `esMesActual` serve web's month/year picker and prev/next
 * header, both explicitly out of scope for mobile (design.md binding
 * decision 4). All functions never throw — an unparseable `periodo` returns
 * the input verbatim, mirroring `formatearPeriodoLabel`'s fallback
 * discipline.
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
