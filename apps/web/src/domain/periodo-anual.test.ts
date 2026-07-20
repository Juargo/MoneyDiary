import { describe, expect, it } from 'vitest'
import {
  anioDePeriodo,
  esMesActual,
  esPeriodoFuturo,
  mesAbreviado,
  mesAnterior,
  mesCompletoLabel,
  mesSiguiente,
  periodoActualUTC,
  periodoDesde,
} from './periodo-anual'

// US-030 Slice C (task 30.11/30.12): pure helpers for the annual grid — month
// abbreviations, accessible full-month labels, deriving a year from a
// `periodo`, and resolving "today" as `YYYY-MM` in UTC (never local time —
// same discipline as the rest of the app's ISO-8601 UTC dates).
describe('mesAbreviado', () => {
  it('maps the first and last month of the year', () => {
    expect(mesAbreviado('2026-01')).toBe('ENE')
    expect(mesAbreviado('2026-12')).toBe('DIC')
  })

  it('maps a mid-year month', () => {
    expect(mesAbreviado('2026-07')).toBe('JUL')
  })

  it('returns the input verbatim for an unparseable periodo instead of throwing', () => {
    expect(mesAbreviado('not-a-periodo')).toBe('not-a-periodo')
  })
})

describe('mesCompletoLabel', () => {
  it('formats YYYY-MM to a lowercase full month name + year', () => {
    expect(mesCompletoLabel('2026-01')).toBe('enero 2026')
    expect(mesCompletoLabel('2026-12')).toBe('diciembre 2026')
  })

  it('returns the input verbatim for an unparseable periodo instead of throwing', () => {
    expect(mesCompletoLabel('garbage')).toBe('garbage')
  })
})

describe('anioDePeriodo', () => {
  it('extracts the year from a valid periodo', () => {
    expect(anioDePeriodo('2026-07', 1999)).toBe(2026)
  })

  it('falls back to the provided default year for an unparseable periodo', () => {
    expect(anioDePeriodo('not-a-periodo', 1999)).toBe(1999)
  })
})

describe('periodoActualUTC', () => {
  it('formats a given date as YYYY-MM in UTC', () => {
    expect(periodoActualUTC(new Date('2026-07-19T12:00:00.000Z'))).toBe('2026-07')
  })

  it('pads single-digit months', () => {
    expect(periodoActualUTC(new Date('2026-01-05T00:00:00.000Z'))).toBe('2026-01')
  })
})

// period-selector-header (WPER-02/03/04): pure string arithmetic for the
// header's prev/next/Hoy controls — no `Date` math, so no TZ drift risk.
describe('mesAnterior', () => {
  it('moves back one month within the same year', () => {
    expect(mesAnterior('2026-07')).toBe('2026-06')
  })

  it('rolls over from January to December of the previous year', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12')
  })
})

describe('mesSiguiente', () => {
  it('moves forward one month within the same year', () => {
    expect(mesSiguiente('2026-06')).toBe('2026-07')
  })

  it('rolls over from December to January of the next year', () => {
    expect(mesSiguiente('2026-12')).toBe('2027-01')
  })
})

describe('esMesActual', () => {
  it('returns true when periodo matches the current UTC month', () => {
    expect(esMesActual('2026-07', new Date('2026-07-19T12:00:00.000Z'))).toBe(true)
  })

  it('returns false when periodo is a past month', () => {
    expect(esMesActual('2026-06', new Date('2026-07-19T12:00:00.000Z'))).toBe(false)
  })

  it('returns false when periodo is a future month', () => {
    expect(esMesActual('2026-08', new Date('2026-07-19T12:00:00.000Z'))).toBe(false)
  })
})

// month-year-picker (WMYP-03): composes a periodo from separate (anio, mes)
// parts — the grid selects a month within a displayed year, independent of
// the currently-viewed periodo.
describe('periodoDesde', () => {
  it('composes and zero-pads a single-digit month', () => {
    expect(periodoDesde(2026, 3)).toBe('2026-03')
  })

  it('handles the December boundary (mes1a12 = 12)', () => {
    expect(periodoDesde(2026, 12)).toBe('2026-12')
  })

  it('handles the January boundary (mes1a12 = 1)', () => {
    expect(periodoDesde(2026, 1)).toBe('2026-01')
  })
})

// month-year-picker (WMYP-04/05): drives the future-month clamp in the grid
// and the next-year clamp in the popover's year navigation.
describe('esPeriodoFuturo', () => {
  it('returns true for a period after the current one', () => {
    expect(esPeriodoFuturo('2026-08', new Date('2026-07-19T12:00:00.000Z'))).toBe(true)
  })

  it('returns false for a period before the current one', () => {
    expect(esPeriodoFuturo('2026-06', new Date('2026-07-19T12:00:00.000Z'))).toBe(false)
  })

  it('returns false when periodo equals the current month (edge case)', () => {
    expect(esPeriodoFuturo('2026-07', new Date('2026-07-19T12:00:00.000Z'))).toBe(false)
  })
})
