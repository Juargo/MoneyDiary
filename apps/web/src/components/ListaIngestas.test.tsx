import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ListaIngestas } from './ListaIngestas'
import type { IngestaListItemDto } from '@/api/types'

const dosIngestas: IngestaListItemDto[] = [
  { id: 'ingesta-1', banco: 'BancoEstado', fecha: '2026-07-15T00:00:00.000Z', totalTransacciones: 12 },
  { id: 'ingesta-2', banco: 'BCI', fecha: '2026-07-01T00:00:00.000Z', totalTransacciones: 1 },
]

function crearWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function mockFetchOnce(response: { ok: boolean; status: number; json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('ListaIngestas', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders the loading state while the query is pending', () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ ingestas: dosIngestas }) })

    render(<ListaIngestas />, { wrapper: crearWrapper() })

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders the error state with a retry affordance when the request fails', async () => {
    mockFetchOnce({ ok: false, status: 500 })

    render(<ListaIngestas />, { wrapper: crearWrapper() })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('renders the empty state when there are no ingestas', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ ingestas: [] }) })

    render(<ListaIngestas />, { wrapper: crearWrapper() })

    expect(await screen.findByText(/no hay cartolas/i)).toBeInTheDocument()
  })

  it('renders each ingesta row with banco, formatted fecha, and the movement count, plus its delete control', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ ingestas: dosIngestas }) })

    render(<ListaIngestas />, { wrapper: crearWrapper() })

    expect(await screen.findByText('BancoEstado')).toBeInTheDocument()
    expect(screen.getByText('2026-07-15')).toBeInTheDocument()
    expect(screen.getByText('12 movimientos')).toBeInTheDocument()

    expect(screen.getByText('BCI')).toBeInTheDocument()
    expect(screen.getByText('2026-07-01')).toBeInTheDocument()
    expect(screen.getByText('1 movimiento')).toBeInTheDocument()

    expect(screen.getAllByRole('button', { name: 'Eliminar' })).toHaveLength(2)
  })
})
