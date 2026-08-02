import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ListaIngestas } from './ListaIngestas'
import type { IngestaListItemDto } from '@/api/types'

const dosIngestas: IngestaListItemDto[] = [
  {
    id: 'ingesta-1',
    banco: 'BancoEstado',
    nombreArchivo: 'cartola-julio.xlsx',
    fecha: '2026-07-15T14:30:00.000Z',
    estado: 'exitoso',
    totalTransacciones: 12,
    motivoFallo: null,
  },
  {
    id: 'ingesta-2',
    banco: 'BCI',
    nombreArchivo: 'movimientos.xlsx',
    fecha: '2026-07-01T09:05:00.000Z',
    estado: 'exitoso',
    totalTransacciones: 1,
    motivoFallo: null,
  },
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

  it('renders each ingesta row with nombre de archivo, banco, formatted fecha, estado, and the movement count, plus its delete control', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ ingestas: dosIngestas }) })

    render(<ListaIngestas />, { wrapper: crearWrapper() })

    expect(await screen.findByText('cartola-julio.xlsx')).toBeInTheDocument()
    expect(screen.getByText('BancoEstado')).toBeInTheDocument()
    expect(screen.getByText('2026-07-15 14:30')).toBeInTheDocument()
    expect(screen.getByText('12 movimientos')).toBeInTheDocument()

    expect(screen.getByText('movimientos.xlsx')).toBeInTheDocument()
    expect(screen.getByText('BCI')).toBeInTheDocument()
    expect(screen.getByText('2026-07-01 09:05')).toBeInTheDocument()
    expect(screen.getByText('1 movimiento')).toBeInTheDocument()

    // CA-02: estado visible por fila (ambas exitosas aquí)
    expect(screen.getAllByText('Exitosa')).toHaveLength(2)

    expect(screen.getAllByRole('button', { name: /^Eliminar cartola/i })).toHaveLength(2)
  })

  it('shows estado + motivoFallo for a failed ingesta and hides the movement count (CA-03/CA-04)', async () => {
    const conFallidaYPendiente: IngestaListItemDto[] = [
      {
        id: 'ingesta-fallida',
        banco: 'Santander',
        nombreArchivo: 'rota.xlsx',
        fecha: '2026-07-20T00:00:00.000Z',
        estado: 'fallido',
        totalTransacciones: 0,
        motivoFallo: 'Formato de fecha no reconocido',
      },
      {
        id: 'ingesta-pendiente',
        banco: 'BCI',
        nombreArchivo: 'a-medias.xlsx',
        fecha: '2026-07-19T00:00:00.000Z',
        estado: 'pendiente',
        totalTransacciones: 0,
        motivoFallo: null,
      },
    ]
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ ingestas: conFallidaYPendiente }) })

    render(<ListaIngestas />, { wrapper: crearWrapper() })

    expect(await screen.findByText('rota.xlsx')).toBeInTheDocument()
    expect(screen.getByText('Fallida')).toBeInTheDocument()
    expect(screen.getByText('Formato de fecha no reconocido')).toBeInTheDocument()
    expect(screen.getByText('Pendiente')).toBeInTheDocument()

    // CA-03: el conteo solo se muestra en las exitosas — nunca "0 movimientos"
    expect(screen.queryByText(/movimiento/)).not.toBeInTheDocument()
  })

  it('a successful delete removes the row, announces it in a stable live region, and keeps focus off document.body', async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ ingestas: dosIngestas }) })
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204 })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ingestas: [dosIngestas[1]] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<ListaIngestas />, { wrapper: crearWrapper() })

    await screen.findByText('BancoEstado')
    await user.click(screen.getByRole('button', { name: /Eliminar cartola BancoEstado/i }))
    await screen.findByRole('alertdialog')
    await user.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(screen.queryByText('BancoEstado')).not.toBeInTheDocument())
    expect(screen.getByText('BCI')).toBeInTheDocument()

    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Gestionar cartolas' }))
    expect(screen.getByText('Cartola eliminada.')).toBeInTheDocument()
  })

  it('cancelling a delete keeps the existing return-focus-to-trigger behavior intact', async () => {
    mockFetchOnce({ ok: true, status: 200, json: () => Promise.resolve({ ingestas: dosIngestas }) })
    const user = userEvent.setup()

    render(<ListaIngestas />, { wrapper: crearWrapper() })

    await screen.findByText('BancoEstado')
    const trigger = screen.getByRole('button', { name: /Eliminar cartola BancoEstado/i })
    await user.click(trigger)
    await screen.findByRole('alertdialog')

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
