import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { PeriodoSelector } from './PeriodoSelector'

// Period picker backed by the route's search param (design.md D2 — TanStack
// Router search params, not zustand). Pure presentational: the container
// (routes/index.tsx) owns the `navigate({ search: (prev) => ({ ...prev,
// periodo }) })` call; this component only reports the new value via
// `onChange`.
describe('PeriodoSelector', () => {
  it('renders the current periodo as the input value', () => {
    render(<PeriodoSelector periodo="2026-07" onChange={() => {}} />)
    expect(screen.getByLabelText('Período')).toHaveValue('2026-07')
  })

  it('calls onChange with the new YYYY-MM value when the user picks a month', () => {
    const onChange = vi.fn()
    render(<PeriodoSelector periodo="2026-07" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Período'), { target: { value: '2026-06' } })

    expect(onChange).toHaveBeenLastCalledWith('2026-06')
  })
})
