import { render, screen } from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { ResumenScreen } from './ResumenScreen'
import type { ResumenViewModel } from '@/domain/resumen-view-model'

// `ResumenScreen` renders a real `<Link>` per bucket row (spec W3-03 nav),
// which throws outside a router context — a minimal in-test router (root +
// the two real leaf routes) lets these tests assert on rendered
// href/accessible-name without depending on the generated routeTree.gen.ts.
// `router.load()` must resolve before `render()`: `RouterProvider`'s first
// paint is an empty shell until route matching finishes (async internally).
async function renderWithRouter(viewModel: ResumenViewModel) {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <ResumenScreen viewModel={viewModel} />,
  })
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

// Data-state composition (spec W1-02/W2-01/W2-03): income + all 4 bucket
// slices rendered together, above the fold — no pagination/expand-to-see
// interaction gates any of them (the DOM proxy for "visible without
// scrolling" jsdom can't measure directly, mirrors
// apps/mobile/src/components/ResumenScreen.spec.tsx's approach).
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
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: 'verde',
}

describe('ResumenScreen', () => {
  it('renders totalIngreso formatted exactly as received (spec W1-01)', async () => {
    await renderWithRouter(viewModel)
    expect(screen.getByText('$1.000.000')).toBeInTheDocument()
  })

  // A11y (ADR-018): the document must start at a page-level <h1> instead of
  // jumping straight to <h2> — a broken heading outline confuses assistive
  // technology users navigating by heading.
  it('renders exactly one page-level <h1> heading', async () => {
    await renderWithRouter(viewModel)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('renders all 4 bucket slices — income + distribution visible together (spec W1-02)', async () => {
    await renderWithRouter(viewModel)
    expect(screen.getByText('Necesidades')).toBeInTheDocument()
    expect(screen.getByText('$500.000')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('Deseos')).toBeInTheDocument()
    expect(screen.getByText('Ahorro')).toBeInTheDocument()
    expect(screen.getByText('SinCategoria')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('renders the global semáforo (spec W2-01) with a distinct testID anchor', async () => {
    await renderWithRouter(viewModel)
    expect(screen.getByTestId('semaforo-global')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Verde' }).length).toBeGreaterThan(0)
  })

  it('renders the per-bucket semáforo passthrough, including a distinct "Sin datos" for null (spec W2-02)', async () => {
    await renderWithRouter(viewModel)
    expect(screen.getByRole('img', { name: 'Amarillo' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Sin datos' })).toBeInTheDocument()
  })

  it('renders a real navigable link per bucket row to the detail screen, preserving the period (US-017 nav)', async () => {
    await renderWithRouter(viewModel)

    const link = screen.getByRole('link', { name: 'Ver detalle de Necesidades' })

    expect(link).toHaveAttribute('href', '/buckets/Necesidades?periodo=2026-07')
  })

  it('gives every bucket row its own accessible link name', async () => {
    await renderWithRouter(viewModel)

    expect(screen.getByRole('link', { name: 'Ver detalle de Deseos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver detalle de Ahorro' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver detalle de SinCategoria' })).toBeInTheDocument()
  })
})
