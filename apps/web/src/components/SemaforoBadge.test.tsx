import { render, screen } from '@testing-library/react'
import { SemaforoBadge } from './SemaforoBadge'

// DOM port of apps/mobile/src/components/SemaforoBadge.spec.tsx (W2.1). The
// state word is exposed via `aria-label`, not visible text alone — asserts
// the distinct label per `estadoSemaforo`, including `null` (never silently
// coerced into a known color, spec W2-02).
describe('SemaforoBadge', () => {
  it('exposes the green label for "verde"', () => {
    render(<SemaforoBadge estadoSemaforo="verde" />)
    expect(screen.getByLabelText('Verde')).toBeInTheDocument()
  })

  it('exposes the yellow label for "amarillo"', () => {
    render(<SemaforoBadge estadoSemaforo="amarillo" />)
    expect(screen.getByLabelText('Amarillo')).toBeInTheDocument()
  })

  it('exposes the red label for "rojo"', () => {
    render(<SemaforoBadge estadoSemaforo="rojo" />)
    expect(screen.getByLabelText('Rojo')).toBeInTheDocument()
  })

  it('exposes a distinct "Sin datos" label for null, not a crash', () => {
    render(<SemaforoBadge estadoSemaforo={null} />)
    expect(screen.getByLabelText('Sin datos')).toBeInTheDocument()
  })

  it('does not coerce an unknown value into a known color', () => {
    render(<SemaforoBadge estadoSemaforo="turquesa" />)
    expect(screen.getByLabelText('Sin datos')).toBeInTheDocument()
  })

  it('exposes the state via role="img" — not color alone (ADR-018)', () => {
    render(<SemaforoBadge estadoSemaforo="rojo" />)
    expect(screen.getByRole('img', { name: 'Rojo' })).toBeInTheDocument()
  })
})
