import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { ErrorState } from './Error'
import type { ApiError } from '@/api/client'

// DOM port of apps/mobile/src/components/states/Error.spec.tsx. Unlike
// mobile's ApiError, the web client (apps/web/src/api/client.ts) already
// carries a human-readable Spanish `message` per tag — the component renders
// it verbatim instead of duplicating a copy-per-tag switch (DRY). Always
// renders a retry affordance so the user isn't stuck on a dead screen.
describe('ErrorState', () => {
  it('renders the typed error message', () => {
    const error: ApiError = { tag: 'network', message: 'Problema de conexión.' }
    render(<ErrorState error={error} onRetry={() => {}} />)
    expect(screen.getByText('Problema de conexión.')).toBeInTheDocument()
  })

  it('renders the server error message including the status-derived copy', () => {
    const error: ApiError = { tag: 'server', status: 500, message: 'Ocurrió un error inesperado.' }
    render(<ErrorState error={error} onRetry={() => {}} />)
    expect(screen.getByText('Ocurrió un error inesperado.')).toBeInTheDocument()
  })

  it('calls onRetry when the retry affordance is activated', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const error: ApiError = { tag: 'network', message: 'Problema de conexión.' }
    render(<ErrorState error={error} onRetry={onRetry} />)

    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
