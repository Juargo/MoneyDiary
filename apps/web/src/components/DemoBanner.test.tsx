import { render, screen, fireEvent } from '@testing-library/react'
import { DemoBanner } from './DemoBanner'

// demo-trial-mode (DEMO-UI-02, DEMO-UI-04): a prop-driven, presentational
// banner. `_authenticated.tsx` decides WHETHER to pass `esDemo: true` (from
// the cached `MeDto.esDemo` in route context — no extra fetch, DEMO-UI-02
// "Banner drives from auth context"), `DemoBanner` decides whether that
// makes it visible. Dismissal is in-memory `useState` (design.md open
// question, resolved: SessionScope) — the banner remounts fresh on the next
// real session (logout unmounts `_authenticated`, a fresh demo session
// remounts it), so no localStorage/sessionStorage persistence is needed.
describe('DemoBanner', () => {
  it('is visible for a demo user (esDemo=true)', () => {
    render(<DemoBanner esDemo={true} />)

    expect(screen.getByRole('status', { name: /aviso de modo demo/i })).toHaveTextContent(/modo demo/i)
    expect(screen.getByRole('link', { name: /crear cuenta/i })).toBeInTheDocument()
  })

  it('does NOT render for a real user (esDemo=false)', () => {
    render(<DemoBanner esDemo={false} />)

    expect(screen.queryByRole('status', { name: /aviso de modo demo/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /crear cuenta/i })).not.toBeInTheDocument()
  })

  it('hides immediately after clicking the dismiss button', () => {
    render(<DemoBanner esDemo={true} />)
    expect(screen.getByRole('status', { name: /aviso de modo demo/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /cerrar aviso de modo demo/i }))

    expect(screen.queryByRole('status', { name: /aviso de modo demo/i })).not.toBeInTheDocument()
  })
})
