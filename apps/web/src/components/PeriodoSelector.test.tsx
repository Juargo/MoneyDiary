import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PeriodoSelector } from './PeriodoSelector'

// Period header backed by the route's search param (design.md D2 — TanStack
// Router search params, not zustand). Pure presentational: the container
// (routes/index.tsx) owns the `navigate({ search: (prev) => ({ ...prev,
// periodo }) })` call; this component only reports the new value via
// `onChange` (period-selector-header WPER-01..07). Props stay verbatim
// `{ periodo, onChange }` (design.md decision #2), so "today" is faked via
// vitest's system clock rather than an extra prop. Uses `fireEvent` (not
// `userEvent`) — `userEvent`'s async click scheduling hangs under fake
// timers.
describe('PeriodoSelector', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-19T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the formatted month label prominently', () => {
    render(<PeriodoSelector periodo="2026-07" onChange={() => {}} />)
    expect(screen.getByText('julio 2026')).toBeInTheDocument()
  })

  it('calls onChange with the previous month when "Mes anterior" is activated', () => {
    const onChange = vi.fn()
    render(<PeriodoSelector periodo="2026-07" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))

    expect(onChange).toHaveBeenLastCalledWith('2026-06')
  })

  it('calls onChange with the next month when "Mes siguiente" is activated and not at the current month', () => {
    const onChange = vi.fn()
    render(<PeriodoSelector periodo="2026-06" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))

    expect(onChange).toHaveBeenLastCalledWith('2026-07')
  })

  it('disables "Mes siguiente" when viewing the current month', () => {
    render(<PeriodoSelector periodo="2026-07" onChange={() => {}} />)

    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
  })

  it('calls onChange with the current month when "Ir al mes actual" is activated', () => {
    const onChange = vi.fn()
    render(<PeriodoSelector periodo="2026-03" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Ir al mes actual' }))

    expect(onChange).toHaveBeenLastCalledWith('2026-07')
  })

  it('disables "Ir al mes actual" when already viewing the current month', () => {
    render(<PeriodoSelector periodo="2026-07" onChange={() => {}} />)

    expect(screen.getByRole('button', { name: 'Ir al mes actual' })).toBeDisabled()
  })

  it('gives prev, next, and Hoy distinct Spanish aria-labels', () => {
    render(<PeriodoSelector periodo="2026-06" onChange={() => {}} />)

    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ir al mes actual' })).toBeInTheDocument()
  })
})
