import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { BucketDetailList } from './BucketDetailList'
import type { DetalleBucketDto } from '@/api/types'

// Owns the fetch (via useDetalleBucket), the {loading|error|empty|data}
// state switch (reusing the shared Loading/ErrorState/Empty from W1), and
// the flat row rendering including the SinCategoria classify CTA + the
// always-disabled inline-edit placeholder (spec W3-03, CA-02/CA-03).
const dataDto: DetalleBucketDto = {
  periodo: '2026-07',
  bucket: 'Necesidades',
  transacciones: [
    {
      id: 'tx-1',
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'Supermercado Líder',
      cargo: '9007199254740993',
      abono: '0',
      banco: 'BancoEstado',
      tipoCuenta: 'CuentaRUT',
      numeroCuenta: '12345678',
    },
  ],
}

const sinCategoriaDto: DetalleBucketDto = {
  periodo: '2026-07',
  bucket: 'SinCategoria',
  transacciones: [
    {
      id: 'tx-2',
      fecha: '2026-07-01T00:00:00.000Z',
      descripcion: 'Transferencia recibida',
      cargo: '0',
      abono: '50000',
      banco: 'BCI',
      tipoCuenta: 'Corriente',
      numeroCuenta: '87654321',
    },
  ],
}

const emptyDto: DetalleBucketDto = { periodo: '2026-07', bucket: 'Ahorro', transacciones: [] }

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

describe('BucketDetailList', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders the loading state while the query is pending', () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(dataDto) })

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, { wrapper: crearWrapper() })

    expect(screen.getByText('Cargando resumen…')).toBeInTheDocument()
  })

  it('renders the error state with a retry affordance when the request fails', async () => {
    mockFetchOnce({ ok: false, status: 500 })

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, { wrapper: crearWrapper() })

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('renders the empty state when the bucket has no transactions in the period', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(emptyDto) })

    render(<BucketDetailList bucket="Ahorro" periodo="2026-07" />, { wrapper: crearWrapper() })

    await waitFor(() => expect(screen.getByText(/Todavía no hay movimientos/)).toBeInTheDocument())
  })

  it('renders each row exact CLP amount, beyond safe-integer precision (spec W3-03)', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(dataDto) })

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, { wrapper: crearWrapper() })

    await waitFor(() => expect(screen.getByText('Supermercado Líder')).toBeInTheDocument())
    expect(screen.getByText(/\$9\.007\.199\.254\.740\.993/)).toBeInTheDocument()
  })

  it('shows a "Clasificar" CTA and a disabled edit placeholder for SinCategoria rows (CA-03)', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(sinCategoriaDto) })

    render(<BucketDetailList bucket="SinCategoria" periodo="2026-07" />, { wrapper: crearWrapper() })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Clasificar' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Editar categoría/ })).toBeDisabled()
  })

  it('renders only the disabled edit placeholder (no classify CTA) for non-SinCategoria buckets', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve(dataDto) })

    render(<BucketDetailList bucket="Necesidades" periodo="2026-07" />, { wrapper: crearWrapper() })

    await waitFor(() => expect(screen.getByRole('button', { name: /Editar categoría/ })).toBeDisabled())
    expect(screen.queryByRole('button', { name: 'Clasificar' })).not.toBeInTheDocument()
  })
})
