import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MonthYearPicker } from './MonthYearPicker'

// month-year-picker (WMYP-02..05, 07): props-only component, no fake timers
// — `periodo` and `periodoActual` are injected plain `YYYY-MM` strings, so
// "now" never depends on the real clock (design.md D3).
describe('MonthYearPicker', () => {
  it('renders 12 cells with Spanish mesAbreviado for the displayed year', () => {
    render(<MonthYearPicker periodo="2026-07" periodoActual="2026-07" onSelect={() => {}} />)

    expect(screen.getByRole('button', { name: /enero 2026/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /diciembre 2026/i })).toBeInTheDocument()
    expect(screen.getByText('ENE')).toBeInTheDocument()
    expect(screen.getByText('DIC')).toBeInTheDocument()
  })

  it('marks only the cell matching periodo as active', () => {
    render(<MonthYearPicker periodo="2026-07" periodoActual="2026-07" onSelect={() => {}} />)

    expect(screen.getByRole('button', { name: /julio 2026/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /junio 2026/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onSelect with the composed YYYY-MM when an enabled past month is clicked', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<MonthYearPicker periodo="2026-07" periodoActual="2026-07" onSelect={onSelect} />)

    await user.click(screen.getByRole('button', { name: /marzo 2026/i }))

    expect(onSelect).toHaveBeenCalledWith('2026-03')
  })

  it('calls onSelect with the current month when it is clicked', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<MonthYearPicker periodo="2026-07" periodoActual="2026-07" onSelect={onSelect} />)

    await user.click(screen.getByRole('button', { name: /julio 2026/i }))

    expect(onSelect).toHaveBeenCalledWith('2026-07')
  })

  it('disables months after the current month when the displayed year equals the current year', () => {
    render(<MonthYearPicker periodo="2026-07" periodoActual="2026-07" onSelect={() => {}} />)

    expect(screen.getByRole('button', { name: /agosto 2026/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /diciembre 2026/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /julio 2026/i })).not.toBeDisabled()
  })

  it('does not call onSelect when a disabled future month is clicked', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<MonthYearPicker periodo="2026-07" periodoActual="2026-07" onSelect={onSelect} />)

    await user.click(screen.getByRole('button', { name: /agosto 2026/i }))

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('prev-year button is always enabled and shows the previous year grid', async () => {
    const user = userEvent.setup()
    render(<MonthYearPicker periodo="2026-07" periodoActual="2026-07" onSelect={() => {}} />)

    expect(screen.getByRole('button', { name: 'Año anterior' })).not.toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Año anterior' }))

    expect(screen.getByRole('button', { name: /julio 2025/i })).toBeInTheDocument()
    // 2025 is fully past, so no month should be disabled anymore.
    expect(screen.getByRole('button', { name: /diciembre 2025/i })).not.toBeDisabled()
  })

  it('next-year button is disabled at the current year and enabled after navigating back', async () => {
    const user = userEvent.setup()
    render(<MonthYearPicker periodo="2026-07" periodoActual="2026-07" onSelect={() => {}} />)

    expect(screen.getByRole('button', { name: 'Año siguiente' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Año anterior' }))

    expect(screen.getByRole('button', { name: 'Año siguiente' })).not.toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Año siguiente' }))

    expect(screen.getByRole('button', { name: /julio 2026/i })).toBeInTheDocument()
  })

  it('is keyboard-operable: Tab reaches a cell and Enter activates it', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<MonthYearPicker periodo="2026-07" periodoActual="2026-07" onSelect={onSelect} />)

    const marzo = screen.getByRole('button', { name: /marzo 2026/i })
    marzo.focus()
    expect(marzo).toHaveFocus()

    await user.keyboard('{Enter}')

    expect(onSelect).toHaveBeenCalledWith('2026-03')
  })
})
