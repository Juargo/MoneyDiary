import { render, screen } from '@testing-library/react'
import { IngresoCard } from './IngresoCard'

// DOM port of apps/mobile/src/components/IngresoCard.tsx (spec W1-01):
// `totalIngreso` arrives already formatted as CLP from the view-model
// (BigInt-string-safe) — rendered verbatim, never reformatted here.
describe('IngresoCard', () => {
  it('renders the pre-formatted income amount exactly, including beyond-safe-integer digits', () => {
    render(<IngresoCard totalIngreso="$9.007.199.254.740.993" />)
    expect(screen.getByText('$9.007.199.254.740.993')).toBeInTheDocument()
  })

  it('renders an "INGRESOS" label', () => {
    render(<IngresoCard totalIngreso="$1.000.000" />)
    expect(screen.getByText('INGRESOS')).toBeInTheDocument()
  })
})
