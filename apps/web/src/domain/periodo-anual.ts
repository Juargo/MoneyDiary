/**
 * Pure period helpers for the annual view (US-030 Slice C). All three
 * formatting functions never throw — an unparseable `periodo` returns the
 * input verbatim, mirroring `formatearPeriodoLabel`'s fallback discipline
 * (the "impossible case" guard: `periodo` is backend-validated on the happy
 * path, so this only protects against a defensive edge, never crashes the
 * grid over a formatting concern).
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
] as const

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
] as const

const PERIODO_REGEX = /^(\d{4})-(\d{2})$/

/** "2026-07" → "JUL" — the annual grid's month-cell label. */
export function mesAbreviado(periodo: string): string {
  const match = PERIODO_REGEX.exec(periodo)
  if (!match) {
    return periodo
  }
  const mes = MESES_ABREVIADOS_ES[Number(match[2]) - 1]
  return mes ?? periodo
}

/** "2026-07" → "julio 2026" — used in the accessible name ("Ver julio 2026"). */
export function mesCompletoLabel(periodo: string): string {
  const match = PERIODO_REGEX.exec(periodo)
  if (!match) {
    return periodo
  }
  const mes = MESES_COMPLETOS_ES[Number(match[2]) - 1]
  return mes ? `${mes} ${match[1]}` : periodo
}

/** "2026-07" → 2026. Falls back to `anioPorDefecto` for an unparseable periodo. */
export function anioDePeriodo(periodo: string, anioPorDefecto: number): number {
  const match = PERIODO_REGEX.exec(periodo)
  return match ? Number(match[1]) : anioPorDefecto
}

/**
 * Today's period as `YYYY-MM`, read in UTC — never local time (same
 * discipline as the rest of the app's ISO-8601 UTC dates, e.g.
 * `detalle-bucket-view-model.ts`). Accepts an explicit `ahora` for
 * deterministic tests instead of mocking global `Date`.
 */
export function periodoActualUTC(ahora: Date): string {
  const anio = ahora.getUTCFullYear()
  const mes = String(ahora.getUTCMonth() + 1).padStart(2, '0')
  return `${anio}-${mes}`
}

/**
 * Parses a `YYYY-MM` periodo into its numeric parts. Returns `null` for an
 * unparseable input instead of throwing (same defensive discipline as the
 * formatting helpers above).
 */
function partesDePeriodo(periodo: string): { anio: number; mes: number } | null {
  const match = PERIODO_REGEX.exec(periodo)
  if (!match) {
    return null
  }
  return { anio: Number(match[1]), mes: Number(match[2]) }
}

function formatearPeriodo(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}`
}

/**
 * Composes a `YYYY-MM` periodo from separate `(anio, mes1a12)` parts —
 * month-year-picker (WMYP-03): the grid picks a month within whatever year is
 * currently displayed in the popover, independent of the viewed periodo.
 * Thin public alias over `formatearPeriodo` — no new logic, just promoted
 * naming for this call site (DRY: single source for the zero-pad rule).
 */
export function periodoDesde(anio: number, mes1a12: number): string {
  return formatearPeriodo(anio, mes1a12)
}

/**
 * Whether `periodo` is chronologically after the current UTC calendar month.
 * Zero-padded `YYYY-MM` strings compare lexicographically exactly like they
 * compare chronologically, so this is a pure string comparison — no `Date`
 * math beyond deriving "now" via the existing `periodoActualUTC`
 * (month-year-picker WMYP-04/05: drives the grid's future-month clamp and the
 * popover's next-year clamp). `ahora` is injected for deterministic tests.
 */
export function esPeriodoFuturo(periodo: string, ahora: Date): boolean {
  return periodo > periodoActualUTC(ahora)
}

/**
 * One month back from `periodo`, e.g. "2026-07" → "2026-06", with year
 * rollover ("2026-01" → "2025-12"). Pure integer arithmetic — never `Date`
 * math (period-selector-header design.md #1: zero TZ drift risk). Unbounded
 * — prev is always enabled for any past month (WPER-02).
 */
export function mesAnterior(periodo: string): string {
  const partes = partesDePeriodo(periodo)
  if (!partes) {
    return periodo
  }
  const { anio, mes } = partes
  return mes === 1 ? formatearPeriodo(anio - 1, 12) : formatearPeriodo(anio, mes - 1)
}

/**
 * One month forward from `periodo`, e.g. "2026-06" → "2026-07", with year
 * rollover ("2026-12" → "2027-01"). Callers clamp this at the current month
 * via `esMesActual` (WPER-03) — this helper itself has no upper bound.
 */
export function mesSiguiente(periodo: string): string {
  const partes = partesDePeriodo(periodo)
  if (!partes) {
    return periodo
  }
  const { anio, mes } = partes
  return mes === 12 ? formatearPeriodo(anio + 1, 1) : formatearPeriodo(anio, mes + 1)
}

/**
 * Whether `periodo` is the current UTC calendar month. Drives the "next" and
 * "Hoy" controls' disabled state (WPER-03/04) — `ahora` is injected for
 * deterministic tests instead of mocking global `Date`.
 */
export function esMesActual(periodo: string, ahora: Date): boolean {
  return periodo === periodoActualUTC(ahora)
}
