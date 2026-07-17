import { render, screen } from '@testing-library/react'
import { Empty } from './Empty'

// DOM port of apps/mobile/src/components/states/Empty.spec.tsx (spec
// W1-02): shown when `sinIngreso: true`. Copy invites a cartola upload,
// deliberately distinct from a bucket rendering "$0" or "0%" — those
// describe a zero amount/percentage, not an absent income.
describe('Empty', () => {
  it('renders empty-state copy inviting a cartola upload, distinct from $0 or 0%', () => {
    render(<Empty />)
    expect(screen.getByText(/no hay movimientos/i)).toBeInTheDocument()
    expect(screen.getByText(/cartola/i)).toBeInTheDocument()
    expect(screen.queryByText('$0')).not.toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })
})
