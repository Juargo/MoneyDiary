import { render, screen } from '@testing-library/react'
import { DemoUploadNudge } from './DemoUploadNudge'

// upload-cartola-ui (US-032, CU-07): a nudge shown only on the upload screen
// for demo sessions — non-blocking, no gate. Isolated in its own file/test
// (mirrors `DemoBanner.tsx`'s own-file-own-test style) so its visibility
// logic is independently testable from `SubirCartola`'s state machine.
describe('DemoUploadNudge', () => {
  it('renders a temporary-data notice and a CTA to create an account when esDemo is true', () => {
    render(<DemoUploadNudge esDemo={true} />)

    expect(screen.getByRole('status', { name: /aviso de subida en modo demo/i })).toHaveTextContent(/temporal/i)
    expect(screen.getByRole('link', { name: /crear cuenta/i })).toBeInTheDocument()
  })

  it('renders null when esDemo is false', () => {
    render(<DemoUploadNudge esDemo={false} />)

    expect(screen.queryByRole('status', { name: /aviso de subida en modo demo/i })).not.toBeInTheDocument()
  })

  it('renders null when esDemo is absent (defaults to false)', () => {
    render(<DemoUploadNudge />)

    expect(screen.queryByRole('status', { name: /aviso de subida en modo demo/i })).not.toBeInTheDocument()
  })
})
