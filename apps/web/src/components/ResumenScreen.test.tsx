import { afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import type { ReactNode } from 'react'
import { ResumenScreen } from './ResumenScreen'
import type { ResumenViewModel } from '@/domain/resumen-view-model'
import type { DetalleBucketDto } from '@/api/types'

// US-030 Slice B (tasks 30.9/30.10): the dashboard body. The old per-bucket
// `<Link>` breakdown list is gone — the pie + legend now represent that
// split, and the right panel shows the SELECTED bucket's transactions
// inline (via `BucketDetailList`, which owns its own `useDetalleBucket`
// query) instead of navigating away. A `QueryClientProvider` wrapper (not a
// router) is what these tests need now.
const viewModel: ResumenViewModel = {
  periodo: '2026-07',
  totalIngreso: '$1.000.000',
  sinIngreso: false,
  buckets: [
    { bucket: 'Necesidades', total: '$500.000', porcentajeLabel: '50%', estadoSemaforo: 'verde' },
    { bucket: 'Deseos', total: '$300.000', porcentajeLabel: '30%', estadoSemaforo: 'amarillo' },
    { bucket: 'Ahorro', total: '$200.000', porcentajeLabel: '20%', estadoSemaforo: 'verde' },
    { bucket: 'SinCategoria', total: '$0', porcentajeLabel: '—', estadoSemaforo: null },
  ],
  distribucionGasto: [
    { bucket: 'Necesidades', porcentaje: 50, fraccion: 0.5 },
    { bucket: 'Deseos', porcentaje: 30, fraccion: 0.3 },
    { bucket: 'Ahorro', porcentaje: 20, fraccion: 0.2 },
  ],
  // Necesidades has the largest raw total among the 4 buckets — the
  // dashboard's default transactions-panel selection (task 30.10).
  bucketPorDefecto: 'Necesidades',
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: 'verde',
}

function crearWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

/**
 * Mocks `fetch` for `/api/buckets/:bucket`, returning a bucket-specific
 * transaction so tests can tell WHICH bucket the transactions panel actually
 * fetched, purely by asserting on rendered text.
 */
function mockFetchPorBucket() {
  const fetchMock = vi.fn((url: string) => {
    const match = /\/api\/buckets\/([^/?]+)/.exec(url)
    const bucket = match ? decodeURIComponent(match[1]) : 'desconocido'
    const dto: DetalleBucketDto = {
      periodo: '2026-07',
      bucket,
      transacciones: [
        {
          id: `tx-${bucket}`,
          fecha: '2026-07-15T00:00:00.000Z',
          descripcion: `Movimiento de ${bucket}`,
          cargo: '1000',
          abono: '0',
          banco: 'BancoEstado',
          tipoCuenta: 'CuentaRUT',
          numeroCuenta: '12345678',
        },
      ],
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dto) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderScreen(vm: ResumenViewModel = viewModel) {
  return render(<ResumenScreen viewModel={vm} />, { wrapper: crearWrapper() })
}

describe('ResumenScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders totalIngreso formatted exactly as received (spec W1-01)', () => {
    mockFetchPorBucket()
    renderScreen()
    expect(screen.getByText('$1.000.000')).toBeInTheDocument()
  })

  // A11y (ADR-018): the document must start at a page-level <h1> instead of
  // jumping straight to <h2> — a broken heading outline confuses assistive
  // technology users navigating by heading. Reusing `BucketDetailList` for
  // the right panel must not introduce a SECOND <h1> (it demotes to <h2>).
  it('renders exactly one page-level <h1> heading', async () => {
    mockFetchPorBucket()
    renderScreen()
    await waitFor(() => expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument())
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  // "Necesidades"/"Gustos"/"Ahorro" are each selectable in TWO places (pie
  // slice + legend row, both wired to the same `onSelectBucket`) — hence
  // `getAllByRole` here. "Sin categoría" has no pie slice (excluded from
  // `distribucionGasto` by design), only a legend row.
  it('renders the "Distribución del gasto" pie + legend, with SinCategoria selectable though outside the pie (spec W1-02, task 30.9/30.10)', () => {
    mockFetchPorBucket()
    renderScreen()
    // FIX 2 (WCAG 4.1.2): the interactive main pie is a "group", not an
    // "img" — role="img" would flatten the slice buttons below it.
    expect(screen.getByRole('group', { name: 'Distribución del gasto' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Necesidades' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Gustos' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Ahorro' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Sin categoría' })).toHaveLength(1)
  })

  it('renders the global semáforo (spec W2-01) with a distinct testID anchor', () => {
    mockFetchPorBucket()
    renderScreen()
    expect(screen.getByTestId('semaforo-global')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Verde' }).length).toBeGreaterThan(0)
  })

  it('defaults the transactions panel to the bucket with the largest total (task 30.10)', async () => {
    mockFetchPorBucket()
    renderScreen()

    await waitFor(() => expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument())
    for (const boton of screen.getAllByRole('button', { name: 'Necesidades' })) {
      expect(boton).toHaveAttribute('aria-pressed', 'true')
    }
  })

  it('clicking a different legend/slice row switches the transactions panel to that bucket', async () => {
    mockFetchPorBucket()
    renderScreen()
    await waitFor(() => expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument())

    // Click the legend row (last of the two "Gustos" controls in DOM order —
    // pie slice, then legend).
    const botonesGustos = screen.getAllByRole('button', { name: 'Gustos' })
    fireEvent.click(botonesGustos[botonesGustos.length - 1])

    await waitFor(() => expect(screen.getByText('Movimiento de Deseos')).toBeInTheDocument())
    for (const boton of screen.getAllByRole('button', { name: 'Gustos' })) {
      expect(boton).toHaveAttribute('aria-pressed', 'true')
    }
    for (const boton of screen.getAllByRole('button', { name: 'Necesidades' })) {
      expect(boton).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('SinCategoria is selectable via the legend even though it has no pie slice', async () => {
    mockFetchPorBucket()
    renderScreen()
    await waitFor(() => expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Sin categoría' }))

    await waitFor(() => expect(screen.getByText('Movimiento de SinCategoria')).toBeInTheDocument())
  })

  // FIX 5: an explicit selection must not leak into the next month — when
  // `periodo` changes, the panel resets to THAT month's own default bucket.
  it('resets the bucket selection to the new month\'s own default when periodo changes (FIX 5)', async () => {
    mockFetchPorBucket()
    const { rerender } = renderScreen()
    await waitFor(() => expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument())

    // Explicit selection away from the default.
    const botonesGustos = screen.getAllByRole('button', { name: 'Gustos' })
    fireEvent.click(botonesGustos[botonesGustos.length - 1])
    await waitFor(() => expect(screen.getByText('Movimiento de Deseos')).toBeInTheDocument())

    // periodo changes — the new month's default bucket is Ahorro this time.
    const nuevoViewModel: ResumenViewModel = { ...viewModel, periodo: '2026-08', bucketPorDefecto: 'Ahorro' }
    rerender(<ResumenScreen viewModel={nuevoViewModel} />)

    await waitFor(() => expect(screen.getByText('Movimiento de Ahorro')).toBeInTheDocument())
    for (const boton of screen.getAllByRole('button', { name: 'Ahorro' })) {
      expect(boton).toHaveAttribute('aria-pressed', 'true')
    }
    for (const boton of screen.getAllByRole('button', { name: 'Gustos' })) {
      expect(boton).toHaveAttribute('aria-pressed', 'false')
    }
  })
})
