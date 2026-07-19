import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { TransaccionesAgrupadas } from './TransaccionesAgrupadas'
import type { MovimientosMesDto } from '@/api/types'

const dtoConGrupos: MovimientosMesDto = {
  periodo: '2026-07',
  totalTransacciones: 3,
  transacciones: [
    {
      id: 'tx-1',
      fecha: '2026-07-02T00:00:00.000Z',
      descripcion: 'Supermercado',
      cargo: '10000',
      abono: '0',
      banco: 'BancoEstado',
      tipoCuenta: 'CuentaRUT',
      numeroCuenta: '12345678',
      bucket: 'Necesidades',
    },
    {
      id: 'tx-2',
      fecha: '2026-07-15T00:00:00.000Z',
      descripcion: 'Cine',
      cargo: '8000',
      abono: '0',
      banco: 'BCI',
      tipoCuenta: 'Corriente',
      numeroCuenta: '87654321',
      bucket: 'Deseos',
    },
    {
      id: 'tx-3',
      fecha: '2026-07-05T00:00:00.000Z',
      descripcion: 'Compra sin clasificar',
      cargo: '3000',
      abono: '0',
      banco: 'Santander',
      tipoCuenta: 'Corriente',
      numeroCuenta: '11223344',
      bucket: 'SinCategoria',
    },
  ],
}

function crearWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function mockFetch(dto: MovimientosMesDto) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(dto) })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPanel(bucketResaltado: string | null = null) {
  return render(<TransaccionesAgrupadas periodo="2026-07" bucketResaltado={bucketResaltado} />, {
    wrapper: crearWrapper(),
  })
}

describe('TransaccionesAgrupadas', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows the loading state while the request is in flight', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderPanel()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows the error state with a retry affordance when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    renderPanel()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('shows the empty state when the period has zero transactions (WG-01)', async () => {
    mockFetch({ periodo: '2026-07', totalTransacciones: 0, transacciones: [] })
    renderPanel()
    await waitFor(() => expect(screen.getByText('No hay movimientos este período')).toBeInTheDocument())
  })

  it('renders one section per non-empty group with an etiqueta · subtotal · N mov header (WG-01/WG-04)', async () => {
    mockFetch(dtoConGrupos)
    renderPanel()

    await waitFor(() => expect(screen.getByText('Supermercado')).toBeInTheDocument())

    expect(screen.getByRole('heading', { name: /Necesidades/ })).toHaveTextContent('Necesidades · $10.000 · 1 mov')
    expect(screen.getByRole('heading', { name: /Gustos/ })).toHaveTextContent('Gustos · $8.000 · 1 mov')
    expect(screen.getByRole('heading', { name: /Sin categoría/ })).toHaveTextContent('Sin categoría · $3.000 · 1 mov')
    expect(screen.queryByRole('heading', { name: /Ahorro/ })).not.toBeInTheDocument()
  })

  it('scrolls to and highlights the matching group, moving focus to its heading, when bucketResaltado is set (WG-05/WG-06)', async () => {
    mockFetch(dtoConGrupos)
    const scrollIntoViewMock = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoViewMock

    const { rerender } = renderPanel(null)
    await waitFor(() => expect(screen.getByText('Cine')).toBeInTheDocument())

    rerender(<TransaccionesAgrupadas periodo="2026-07" bucketResaltado="Deseos" />)

    const heading = screen.getByRole('heading', { name: /Gustos/ })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(scrollIntoViewMock).toHaveBeenCalled()

    // a11y (WCAG 1.4.1): the highlight is not color-only — `aria-current` on
    // the region plus a visible ring/border, not merely a background color.
    const seccionDeseos = heading.closest('section')
    expect(seccionDeseos).toHaveAttribute('aria-current', 'true')
    const seccionNecesidades = screen.getByRole('heading', { name: /Necesidades/ }).closest('section')
    expect(seccionNecesidades).not.toHaveAttribute('aria-current')
  })

  it('degrades gracefully when bucketResaltado targets a category with zero rows this period (WG-05 no-op)', async () => {
    mockFetch(dtoConGrupos)
    const scrollIntoViewMock = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoViewMock

    const { rerender } = renderPanel(null)
    await waitFor(() => expect(screen.getByText('Cine')).toBeInTheDocument())

    rerender(<TransaccionesAgrupadas periodo="2026-07" bucketResaltado="Ahorro" />)

    expect(scrollIntoViewMock).not.toHaveBeenCalled()
  })

  it('honors prefers-reduced-motion by scrolling without a smooth animation (WG-06)', async () => {
    mockFetch(dtoConGrupos)
    const scrollIntoViewMock = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoViewMock
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )

    const { rerender } = renderPanel(null)
    await waitFor(() => expect(screen.getByText('Cine')).toBeInTheDocument())

    rerender(<TransaccionesAgrupadas periodo="2026-07" bucketResaltado="Deseos" />)

    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled())
    expect(scrollIntoViewMock).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }))
  })
})
