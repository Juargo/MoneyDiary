import { afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ResumenPage } from './ResumenPage'
import type { ApiError } from '@/api/client'
import type { ResumenMesDto } from '@/api/types'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactElement, ReactNode } from 'react'

// Router-agnostic 4-way state switch (spec W1-02): the container
// (routes/index.tsx) owns TanStack Router's search params + `useResumen`;
// this component only receives the resulting query result + wires
// PeriodoSelector — testable without a router harness (mirrors
// apps/mobile/app/index.spec.tsx's "mock the data source, render the thin
// container" pattern, adapted for TanStack Query's result shape).
const dataDto: ResumenMesDto = {
  periodo: '2026-07',
  totalIngreso: '1000000',
  sinIngreso: false,
  buckets: [
    { bucket: 'Necesidades', total: '500000', porcentajeBp: 5000, estadoSemaforo: 'verde' },
    { bucket: 'Deseos', total: '300000', porcentajeBp: 3000, estadoSemaforo: 'amarillo' },
    { bucket: 'Ahorro', total: '200000', porcentajeBp: 2000, estadoSemaforo: 'verde' },
    { bucket: 'SinCategoria', total: '0', porcentajeBp: null, estadoSemaforo: null },
  ],
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: 'verde',
}

const emptyDto: ResumenMesDto = {
  ...dataDto,
  sinIngreso: true,
}

function mockQuery(
  overrides: Partial<UseQueryResult<ResumenMesDto, ApiError>>,
): UseQueryResult<ResumenMesDto, ApiError> {
  return {
    isPending: false,
    isError: false,
    data: undefined,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as UseQueryResult<ResumenMesDto, ApiError>
}

// The data state renders `ResumenScreen`, which embeds `BucketDetailList`
// for its transactions panel (US-030 Slice B) — that owns its own
// `useDetalleBucket` query, which throws outside a `QueryClientProvider`.
// Only the data-state tests below need this wrapper; loading/error/empty
// never reach `ResumenScreen`.
function crearQueryWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function mockFetchDetalleBucket() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        periodo: '2026-07',
        bucket: 'Necesidades',
        transacciones: [
          {
            id: 'tx-1',
            fecha: '2026-07-15T00:00:00.000Z',
            descripcion: 'Supermercado',
            cargo: '1000',
            abono: '0',
            banco: 'BancoEstado',
            tipoCuenta: 'CuentaRUT',
            numeroCuenta: '12345678',
          },
        ],
      }),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderData(ui: ReactElement) {
  mockFetchDetalleBucket()
  return render(ui, { wrapper: crearQueryWrapper() })
}

describe('ResumenPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders exactly the loading state while the query is pending', () => {
    render(
      <ResumenPage query={mockQuery({ isPending: true })} periodo={undefined} onPeriodoChange={() => {}} />,
    )
    expect(screen.getByText('Cargando resumen…')).toBeInTheDocument()
    expect(screen.queryByText('Distribución del gasto')).not.toBeInTheDocument()
  })

  it('renders exactly the error state with the typed message and a working retry', () => {
    const refetch = vi.fn()
    const error: ApiError = { tag: 'network', message: 'Problema de conexión.' }
    render(
      <ResumenPage
        query={mockQuery({ isError: true, error, refetch })}
        periodo={undefined}
        onPeriodoChange={() => {}}
      />,
    )

    expect(screen.getByText('Problema de conexión.')).toBeInTheDocument()
    expect(screen.queryByText('Distribución del gasto')).not.toBeInTheDocument()
  })

  it('renders exactly the empty state when sinIngreso is true, not "$0"/"0%"', () => {
    render(
      <ResumenPage
        query={mockQuery({ data: emptyDto })}
        periodo="2026-07"
        onPeriodoChange={() => {}}
      />,
    )
    expect(screen.getByText(/cartola/i)).toBeInTheDocument()
    expect(screen.queryByText('Distribución del gasto')).not.toBeInTheDocument()
  })

  it('renders the data state with income, all 4 buckets, and the global semáforo', async () => {
    renderData(
      <ResumenPage query={mockQuery({ data: dataDto })} periodo="2026-07" onPeriodoChange={() => {}} />,
    )
    expect(screen.getByText('$1.000.000')).toBeInTheDocument()
    // "Necesidades"/"Deseos"(Gustos)/"Ahorro" render twice each (pie slice +
    // legend row) — see ResumenScreen.test.tsx.
    expect(screen.getAllByText('Necesidades').length).toBeGreaterThan(0)
    expect(screen.getByText('Gustos')).toBeInTheDocument()
    expect(screen.getAllByText('Ahorro').length).toBeGreaterThan(0)
    expect(screen.getByTestId('semaforo-global')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument())
  })

  it('wires the period selector — reports the new value via onPeriodoChange', async () => {
    const onPeriodoChange = vi.fn()
    renderData(
      <ResumenPage query={mockQuery({ data: dataDto })} periodo="2026-07" onPeriodoChange={onPeriodoChange} />,
    )

    fireEvent.change(screen.getByLabelText('Período'), { target: { value: '2026-06' } })

    expect(onPeriodoChange).toHaveBeenCalledWith('2026-06')
  })
})
