import { describe, expect, it } from 'vitest'
import { anioDePeriodo, mesAbreviado, mesCompletoLabel, periodoActualUTC } from './periodo-anual'

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
