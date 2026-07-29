import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiVersionBadge } from './ApiVersionBadge'
import { useApiVersion } from '@/api/use-api-version'

vi.mock('@/api/use-api-version', () => ({
  useApiVersion: vi.fn(),
}))

const mockUseApiVersion = vi.mocked(useApiVersion)

function withData(data: unknown) {
  mockUseApiVersion.mockReturnValue({ data } as ReturnType<typeof useApiVersion>)
}

describe('ApiVersionBadge', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('muestra la versión y el commit cuando hay data', () => {
    withData({ version: '0.2.0', commit: 'abc1234', ref: 'main', builtAt: 'x' })

    render(<ApiVersionBadge />)

    const badge = screen.getByTestId('api-version')
    expect(badge).toHaveTextContent('API v0.2.0 · abc1234')
    // Tooltip con el detalle completo del build (commit, ref, fecha).
    expect(badge).toHaveAttribute(
      'title',
      'API 0.2.0 · commit abc1234 · main · build x',
    )
  })

  it('omite el commit cuando es "local" (build local, sin SHA de Render)', () => {
    withData({ version: '0.2.0', commit: 'local', ref: 'local', builtAt: 'x' })

    const badge = render(<ApiVersionBadge />).getByTestId('api-version')

    expect(badge).toHaveTextContent('API v0.2.0')
    expect(badge.textContent).not.toContain('·')
  })

  it('no renderiza nada mientras carga o si falla (sin data)', () => {
    withData(undefined)

    render(<ApiVersionBadge />)

    expect(screen.queryByTestId('api-version')).not.toBeInTheDocument()
  })
})
