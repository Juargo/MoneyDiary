import { render, screen } from '@testing-library/react'
import { Loading } from './Loading'

// DOM port of apps/mobile/src/components/states/Loading.spec.tsx: shown
// while the resumen request is in flight — no bucket data, no error copy.
describe('Loading', () => {
  it('renders a loading indicator and label', () => {
    render(<Loading />)
    expect(screen.getByText('Cargando resumen…')).toBeInTheDocument()
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
  })
})
