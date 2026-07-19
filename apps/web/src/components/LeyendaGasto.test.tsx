import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LeyendaGasto } from './LeyendaGasto'
import type { LeyendaTajada } from './LeyendaGasto'

// DOM port of apps/mobile/src/components/LeyendaGasto.tsx: one legend row per
// spending bucket, with its color dot, UI label ("Gustos" for the domain's
// "Deseos"), and share-of-spending percent. The domain view-model only
// carries bucket/porcentaje/fraccion — color+label are resolved INSIDE this
// component via lib/bucket-colors (FIX 0: restores clean layering).
//
// US-030 Slice B (task 30.10): every row is a real, selectable `<button>` —
// clicking one reports its bucket via `onSelectBucket`, and the selected
// bucket's row carries `aria-pressed="true"`. `porcentaje` is optional: a
// bucket outside the pie (SinCategoria) is still selectable via this legend,
// just without a share-of-spending percent badge.
const tajadas: ReadonlyArray<LeyendaTajada> = [
  { bucket: 'Necesidades', porcentaje: 50 },
  { bucket: 'Deseos', porcentaje: 30 },
  { bucket: 'Ahorro', porcentaje: 20 },
]

function renderLeyenda(overrides: Partial<Parameters<typeof LeyendaGasto>[0]> = {}) {
  return render(
    <LeyendaGasto tajadas={tajadas} bucketSeleccionado={null} onSelectBucket={vi.fn()} {...overrides} />,
  )
}

describe('LeyendaGasto', () => {
  it('renders one legend row per tajada', () => {
    renderLeyenda()
    expect(screen.getAllByTestId('leyenda-item')).toHaveLength(3)
  })

  it('renders the UI label ("Gustos" for the domain bucket "Deseos")', () => {
    renderLeyenda()
    expect(screen.getByText('Gustos')).toBeInTheDocument()
    expect(screen.queryByText('Deseos')).not.toBeInTheDocument()
  })

  it('renders the share-of-spending percent for each bucket', () => {
    renderLeyenda()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(screen.getByText('20%')).toBeInTheDocument()
  })

  it('applies the resolved color to each color dot', () => {
    renderLeyenda()
    const dots = screen.getAllByTestId('leyenda-dot')
    expect(dots.map((dot) => dot.style.backgroundColor)).toEqual([
      'rgb(70, 75, 105)', // #464B69
      'rgb(231, 225, 191)', // #E7E1BF
      'rgb(62, 155, 82)', // #3E9B52
    ])
  })

  it('renders nothing when there is no spending', () => {
    const { container } = renderLeyenda({ tajadas: [] })
    expect(screen.queryAllByTestId('leyenda-item')).toHaveLength(0)
    expect(container.firstChild).toBeNull()
  })

  // FIX 3 (WCAG 1.4.11): the legend's focus ring must match the pie slices'
  // (`outline-slate-800`, >3:1) — `outline-slate-400` was ~2.6:1 on white.
  it('uses the same focus-visible outline color as the pie slices (FIX 3, WCAG 1.4.11)', () => {
    renderLeyenda()
    const boton = screen.getByRole('button', { name: 'Necesidades' })
    expect(boton.className).toContain('outline-slate-800')
    expect(boton.className).not.toContain('outline-slate-400')
  })

  it('renders each row as a real button with the UI label as its accessible name', () => {
    renderLeyenda()
    expect(screen.getByRole('button', { name: 'Necesidades' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gustos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ahorro' })).toBeInTheDocument()
  })

  it('marks the selected bucket row with aria-pressed, others not pressed', () => {
    renderLeyenda({ bucketSeleccionado: 'Ahorro' })
    expect(screen.getByRole('button', { name: 'Ahorro' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Necesidades' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking a row reports its bucket via onSelectBucket', () => {
    const onSelectBucket = vi.fn()
    renderLeyenda({ onSelectBucket })
    fireEvent.click(screen.getByRole('button', { name: 'Gustos' }))
    expect(onSelectBucket).toHaveBeenCalledWith('Deseos')
  })

  it('renders a bucket outside the pie (SinCategoria) as a selectable row without a percent badge', () => {
    const conSinCategoria: ReadonlyArray<LeyendaTajada> = [...tajadas, { bucket: 'SinCategoria' }]
    const onSelectBucket = vi.fn()
    renderLeyenda({ tajadas: conSinCategoria, onSelectBucket })

    const boton = screen.getByRole('button', { name: 'Sin categoría' })
    expect(boton).toBeInTheDocument()

    fireEvent.click(boton)
    expect(onSelectBucket).toHaveBeenCalledWith('SinCategoria')
  })
})
