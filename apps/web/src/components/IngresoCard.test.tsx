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

  it('renders a trend icon signaling income identity [spec: DCR-01]', () => {
    render(<IngresoCard totalIngreso="$1.000.000" />)
    expect(screen.getByTestId('ingreso-trend-icon')).toBeInTheDocument()
  })

  it('has no decorative left-border accent [spec: DCR-02]', () => {
    const { container } = render(<IngresoCard totalIngreso="$1.000.000" />)
    const card = container.querySelector('[data-slot="card"]')
    expect(card).not.toHaveClass('border-l-4')
    expect(card).not.toHaveClass('border-l-slate-800')
  })

  it('uses the income design tokens for fill and text, not raw slate utilities [spec: DCR-01, DCR-03]', () => {
    const { container } = render(<IngresoCard totalIngreso="$1.000.000" />)
    const card = container.querySelector('[data-slot="card"]')
    expect(card).toHaveClass('bg-ingreso')
    expect(screen.getByText('$1.000.000')).toHaveClass('text-ingreso-foreground')
  })
})
