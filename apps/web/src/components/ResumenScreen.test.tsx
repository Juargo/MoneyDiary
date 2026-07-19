import { afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import type { ReactNode } from 'react'
import { ResumenScreen } from './ResumenScreen'
import type { ResumenViewModel } from '@/domain/resumen-view-model'
import type { MovimientosMesDto, ResumenAnualDto } from '@/api/types'

// Slice 2 of `group-transactions-by-category`: the right panel now always
// shows ALL non-empty category groups at once (`TransaccionesAgrupadas`,
// design.md D5) instead of one bucket at a time (`BucketDetailList`).
// Clicking a pie slice/legend entry scrolls to and highlights that group
// instead of swapping the panel — see `TransaccionesAgrupadas.spec.tsx` for
// the scroll/focus mechanics themselves; this file only asserts the wiring
// (bucketElegido → bucketResaltado) and that the panel never narrows to a
// single bucket.
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

function mesSinDatos(periodo: string): ResumenAnualDto['meses'][number] {
  return {
    periodo,
    totalIngreso: '0',
    sinIngreso: true,
    buckets: [
      { bucket: 'Necesidades', total: '0', porcentajeBp: null, estadoSemaforo: null },
      { bucket: 'Deseos', total: '0', porcentajeBp: null, estadoSemaforo: null },
      { bucket: 'Ahorro', total: '0', porcentajeBp: null, estadoSemaforo: null },
      { bucket: 'SinCategoria', total: '0', porcentajeBp: null, estadoSemaforo: null },
    ],
    targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
    estadoGlobal: null,
  }
}

function mesConDatos(periodo: string): ResumenAnualDto['meses'][number] {
  return {
    periodo,
    totalIngreso: '1000000',
    sinIngreso: false,
    buckets: [
      { bucket: 'Necesidades', total: '500000', porcentajeBp: 5000, estadoSemaforo: 'verde' },
      { bucket: 'Deseos', total: '300000', porcentajeBp: 3000, estadoSemaforo: 'verde' },
      { bucket: 'Ahorro', total: '200000', porcentajeBp: 2000, estadoSemaforo: 'verde' },
      { bucket: 'SinCategoria', total: '0', porcentajeBp: null, estadoSemaforo: null },
    ],
    targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
    estadoGlobal: 'verde',
  }
}

function movimientosDto(): MovimientosMesDto {
  return {
    periodo: '2026-07',
    totalTransacciones: 3,
    transacciones: [
      {
        id: 'tx-necesidades',
        fecha: '2026-07-15T00:00:00.000Z',
        descripcion: 'Movimiento de Necesidades',
        cargo: '1000',
        abono: '0',
        banco: 'BancoEstado',
        tipoCuenta: 'CuentaRUT',
        numeroCuenta: '12345678',
        bucket: 'Necesidades',
      },
      {
        id: 'tx-deseos',
        fecha: '2026-07-16T00:00:00.000Z',
        descripcion: 'Movimiento de Deseos',
        cargo: '2000',
        abono: '0',
        banco: 'BCI',
        tipoCuenta: 'Corriente',
        numeroCuenta: '87654321',
        bucket: 'Deseos',
      },
      {
        id: 'tx-sincategoria',
        fecha: '2026-07-17T00:00:00.000Z',
        descripcion: 'Movimiento de SinCategoria',
        cargo: '3000',
        abono: '0',
        banco: 'Santander',
        tipoCuenta: 'Corriente',
        numeroCuenta: '11223344',
        bucket: 'SinCategoria',
      },
    ],
  }
}

/**
 * Mocks `fetch` for `/api/movimientos` (the grouped panel's own data source,
 * Slice 2) AND `/api/resumen/anual` (US-030 Slice C — `ResumenAnual`
 * self-fetches). Returns the SAME fixed movimientos set regardless of
 * `periodo` — this file tests the pie/legend → highlight wiring, not
 * period-specific data (see `TransaccionesAgrupadas.spec.tsx`/
 * `agrupar-movimientos-por-bucket.spec.ts` for grouping/data behavior).
 */
function mockFetchMovimientos() {
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/resumen/anual')) {
      const dto: ResumenAnualDto = {
        anio: 2026,
        meses: Array.from({ length: 12 }, (_, i) => {
          const periodo = `2026-${String(i + 1).padStart(2, '0')}`
          return i === 0 ? mesConDatos(periodo) : mesSinDatos(periodo)
        }),
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dto) })
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(movimientosDto()) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderScreen(vm: ResumenViewModel = viewModel, onPeriodoChange: (periodo: string) => void = vi.fn()) {
  return render(<ResumenScreen viewModel={vm} onPeriodoChange={onPeriodoChange} />, { wrapper: crearWrapper() })
}

describe('ResumenScreen', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders totalIngreso formatted exactly as received (spec W1-01)', () => {
    mockFetchMovimientos()
    renderScreen()
    expect(screen.getByText('$1.000.000')).toBeInTheDocument()
  })

  it('renders exactly one page-level <h1> heading', async () => {
    mockFetchMovimientos()
    renderScreen()
    await waitFor(() => expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument())
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('renders the "Distribución del gasto" pie + legend, with SinCategoria selectable though outside the pie (spec W1-02, task 30.9/30.10)', () => {
    mockFetchMovimientos()
    renderScreen()
    expect(screen.getByRole('group', { name: 'Distribución del gasto' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Necesidades' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Gustos' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Ahorro' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Sin categoría' })).toHaveLength(1)
  })

  it('renders the global semáforo (spec W2-01) with a distinct testID anchor', () => {
    mockFetchMovimientos()
    renderScreen()
    expect(screen.getByTestId('semaforo-global')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Verde' }).length).toBeGreaterThan(0)
  })

  // WG-01/WG-05: the panel is the ALWAYS-VISIBLE grouped list — it never
  // narrows to a single bucket, before or after a pie/legend click.
  it('shows every non-empty category group at once, with no group highlighted before any selection', async () => {
    mockFetchMovimientos()
    renderScreen()

    await waitFor(() => expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument())
    expect(screen.getByText('Movimiento de Deseos')).toBeInTheDocument()
    expect(screen.getByText('Movimiento de SinCategoria')).toBeInTheDocument()

    for (const boton of screen.getAllByRole('button', { name: 'Necesidades' })) {
      expect(boton).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('clicking a legend/slice row highlights that group WITHOUT removing the others from the panel (WG-05)', async () => {
    mockFetchMovimientos()
    renderScreen()
    await waitFor(() => expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument())

    const botonesGustos = screen.getAllByRole('button', { name: 'Gustos' })
    fireEvent.click(botonesGustos[botonesGustos.length - 1])

    // The panel still shows every group — it did NOT swap to Deseos alone.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Gustos/ }).closest('section')).toHaveAttribute(
        'aria-current',
        'true',
      ),
    )
    expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument()
    expect(screen.getByText('Movimiento de SinCategoria')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Necesidades/ }).closest('section')).not.toHaveAttribute(
      'aria-current',
    )

    for (const boton of screen.getAllByRole('button', { name: 'Gustos' })) {
      expect(boton).toHaveAttribute('aria-pressed', 'true')
    }
  })

  it('SinCategoria is selectable via the legend even though it has no pie slice, highlighting its group', async () => {
    mockFetchMovimientos()
    renderScreen()
    await waitFor(() => expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Sin categoría' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Sin categoría/ }).closest('section')).toHaveAttribute(
        'aria-current',
        'true',
      ),
    )
  })

  // FIX 5: an explicit highlight must not leak into the next month — when
  // `periodo` changes, the highlight resets to "nothing selected".
  it("resets the highlighted group when periodo changes (FIX 5)", async () => {
    mockFetchMovimientos()
    const { rerender } = renderScreen()
    await waitFor(() => expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument())

    const botonesGustos = screen.getAllByRole('button', { name: 'Gustos' })
    fireEvent.click(botonesGustos[botonesGustos.length - 1])
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Gustos/ }).closest('section')).toHaveAttribute(
        'aria-current',
        'true',
      ),
    )

    const nuevoViewModel: ResumenViewModel = { ...viewModel, periodo: '2026-08' }
    rerender(<ResumenScreen viewModel={nuevoViewModel} onPeriodoChange={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Movimiento de Necesidades')).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: /Gustos/ })?.closest('section')).not.toHaveAttribute(
      'aria-current',
    )
    for (const boton of screen.getAllByRole('button', { name: 'Gustos' })) {
      expect(boton).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('renders the annual summary below, deriving the year from the selected periodo', async () => {
    mockFetchMovimientos()
    renderScreen()

    await waitFor(() => expect(screen.getByText('Resumen Anual 2026')).toBeInTheDocument())
  })

  it('wires ResumenAnual month clicks to the same onPeriodoChange callback', async () => {
    const onPeriodoChange = vi.fn()
    mockFetchMovimientos()
    renderScreen(viewModel, onPeriodoChange)

    const boton = await screen.findByRole('button', { name: 'Ver enero 2026' })
    fireEvent.click(boton)

    expect(onPeriodoChange).toHaveBeenCalledWith('2026-01')
  })
})
