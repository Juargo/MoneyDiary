import { render, screen } from '@testing-library/react'
import { Loading } from './Loading'

// DOM port of apps/mobile/src/components/states/Loading.spec.tsx: shown
// while the resumen request is in flight — no bucket data, no error copy.
describe('Loading', () => {
  it('renders a loading indicator and label', () => {
    render(<Loading />)
    expect(screen.getByText('Cargando resumen…')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  // A11y (ADR-018): the message must live INSIDE the `role="status"` live
  // region so mounting the loading state announces it to assistive
  // technology — a status region with no accessible content is silent.
  it('announces the loading message inside the accessible status region', () => {
    render(<Loading />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando resumen…')
  })

  // The resumen screen is unchanged (default copy preserved), but other
  // screens reusing this shared component (e.g. bucket detail, US-017) need
  // context-appropriate copy — an optional `message` prop overrides it.
  it('renders a custom message when provided, instead of the resumen-specific default', () => {
    render(<Loading message="Cargando movimientos…" />)
    expect(screen.getByText('Cargando movimientos…')).toBeInTheDocument()
    expect(screen.queryByText('Cargando resumen…')).not.toBeInTheDocument()
  })
})
