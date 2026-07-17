import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { ResumenPage } from './ResumenPage'
import type { ApiError } from '@/api/client'
import type { ResumenMesDto } from '@/api/types'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactElement } from 'react'

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

// The data state renders `ResumenScreen`, which renders a real
// `<Link to="/buckets/$bucket">` per bucket row (US-017 nav) — that throws
// outside a router context. Only the data-state tests below need this
// wrapper; loading/error/empty never reach `ResumenScreen`.
async function renderWithRouter(ui: ReactElement) {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => ui })
  const bucketDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/buckets/$bucket',
    component: () => <div>bucket detail stub</div>,
  })
  const routeTree = rootRoute.addChildren([indexRoute, bucketDetailRoute])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  await router.load()
  return render(<RouterProvider router={router} />)
}

describe('ResumenPage', () => {
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
    await renderWithRouter(
      <ResumenPage query={mockQuery({ data: dataDto })} periodo="2026-07" onPeriodoChange={() => {}} />,
    )
    expect(screen.getByText('$1.000.000')).toBeInTheDocument()
    expect(screen.getByText('Necesidades')).toBeInTheDocument()
    expect(screen.getByText('Deseos')).toBeInTheDocument()
    expect(screen.getByText('Ahorro')).toBeInTheDocument()
    expect(screen.getByTestId('semaforo-global')).toBeInTheDocument()
  })

  it('wires the period selector — reports the new value via onPeriodoChange', async () => {
    const onPeriodoChange = vi.fn()
    await renderWithRouter(
      <ResumenPage query={mockQuery({ data: dataDto })} periodo="2026-07" onPeriodoChange={onPeriodoChange} />,
    )

    fireEvent.change(screen.getByLabelText('Período'), { target: { value: '2026-06' } })

    expect(onPeriodoChange).toHaveBeenCalledWith('2026-06')
  })
})
