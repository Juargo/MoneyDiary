import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MiniDistribucionPie } from './MiniDistribucionPie'
import type { TajadaGasto } from '@/domain/distribucion-gasto'

// US-030 Slice C (task 30.12): compact, non-interactive, decorative pie for
// the annual grid. Reuses pie-geometry directly (no duplicated arc math) —
// see the component's docstring for why this is a thin wrapper rather than a
// `compact` flag threaded through `DistribucionPie`.
const tajadas: ReadonlyArray<TajadaGasto> = [
  { bucket: 'Necesidades', porcentaje: 50, fraccion: 0.5 },
  { bucket: 'Deseos', porcentaje: 30, fraccion: 0.3 },
  { bucket: 'Ahorro', porcentaje: 20, fraccion: 0.2 },
]

describe('MiniDistribucionPie', () => {
  it('renders one slice per tajada with its resolved color', () => {
    render(<MiniDistribucionPie tajadas={tajadas} />)
    const fills = screen.getAllByTestId('mini-pie-slice').map((el) => el.getAttribute('fill'))
    // Serene Finance palette: azul→Necesidades, lavanda→Gustos, amarillo→Ahorro.
    expect(fills).toEqual(['#8FA7D1', '#B1A7D1', '#E6D194'])
  })

  it('renders no percent labels, legend, or IDEAL inset — only the wedges', () => {
    render(<MiniDistribucionPie tajadas={tajadas} />)
    expect(screen.queryByText('50%')).not.toBeInTheDocument()
    expect(screen.queryByText('IDEAL')).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Distribución ideal 50/30/20' })).not.toBeInTheDocument()
  })

  it('is decorative — hidden from the accessibility tree', () => {
    const { container } = render(<MiniDistribucionPie tajadas={tajadas} />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('is non-interactive — no button roles on slices', () => {
    render(<MiniDistribucionPie tajadas={tajadas} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('renders a muted placeholder ring instead of dividing by zero when there is no spending', () => {
    render(<MiniDistribucionPie tajadas={[]} />)
    expect(screen.queryAllByTestId('mini-pie-slice')).toHaveLength(0)
    expect(screen.getByTestId('mini-pie-placeholder')).toBeInTheDocument()
  })

  it('renders without NaN when one slice has fraccion 0 mixed with non-zero slices', () => {
    const conCero: ReadonlyArray<TajadaGasto> = [
      { bucket: 'Necesidades', porcentaje: 60, fraccion: 0.6 },
      { bucket: 'Deseos', porcentaje: 40, fraccion: 0.4 },
      { bucket: 'Ahorro', porcentaje: 0, fraccion: 0 },
    ]
    render(<MiniDistribucionPie tajadas={conCero} />)
    const paths = screen.getAllByTestId('mini-pie-slice')
    expect(paths).toHaveLength(3)
    for (const path of paths) {
      expect(path.getAttribute('d')).not.toMatch(/NaN/)
    }
  })
})
