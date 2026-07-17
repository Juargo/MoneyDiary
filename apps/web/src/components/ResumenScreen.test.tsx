import { render, screen } from '@testing-library/react'
import { ResumenScreen } from './ResumenScreen'
import type { ResumenViewModel } from '@/domain/resumen-view-model'

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
  it('renders totalIngreso formatted exactly as received (spec W1-01)', () => {
    render(<ResumenScreen viewModel={viewModel} />)
    expect(screen.getByText('$1.000.000')).toBeInTheDocument()
  })

  // A11y (ADR-018): the document must start at a page-level <h1> instead of
  // jumping straight to <h2> — a broken heading outline confuses assistive
  // technology users navigating by heading.
  it('renders exactly one page-level <h1> heading', () => {
    render(<ResumenScreen viewModel={viewModel} />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('renders all 4 bucket slices — income + distribution visible together (spec W1-02)', () => {
    render(<ResumenScreen viewModel={viewModel} />)
    expect(screen.getByText('Necesidades')).toBeInTheDocument()
    expect(screen.getByText('$500.000')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('Deseos')).toBeInTheDocument()
    expect(screen.getByText('Ahorro')).toBeInTheDocument()
    expect(screen.getByText('SinCategoria')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('renders the global semáforo (spec W2-01) with a distinct testID anchor', () => {
    render(<ResumenScreen viewModel={viewModel} />)
    expect(screen.getByTestId('semaforo-global')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Verde' }).length).toBeGreaterThan(0)
  })

  it('renders the per-bucket semáforo passthrough, including a distinct "Sin datos" for null (spec W2-02)', () => {
    render(<ResumenScreen viewModel={viewModel} />)
    expect(screen.getByRole('img', { name: 'Amarillo' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Sin datos' })).toBeInTheDocument()
  })
})
