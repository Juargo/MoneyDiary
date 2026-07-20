import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DistribucionPie } from './DistribucionPie'
import type { TajadaGasto } from '@/domain/distribucion-gasto'

// DOM port of apps/mobile/src/components/DistribucionPie.tsx: a full pie of
// the three spending buckets (share-of-spending, with on-slice percent
// labels) plus a small "IDEAL" reference pie of the 50/30/20 targets. The
// domain view-model only carries bucket/porcentaje/fraccion — color is
// resolved INSIDE this component via lib/bucket-colors (FIX 0: restores
// clean layering, mirrors mobile).
//
// US-030 Slice B (task 30.10): each main-pie slice is also a selectable
// control — clicking (or pressing Enter/Space on) a slice reports its bucket
// via `onSelectBucket`, and the currently selected bucket's slice carries
// `aria-pressed="true"`. The IDEAL reference inset stays non-interactive —
// it's a static target, not one of the 4 selectable buckets.
const tajadas: ReadonlyArray<TajadaGasto> = [
  { bucket: 'Necesidades', porcentaje: 50, fraccion: 0.5 },
  { bucket: 'Deseos', porcentaje: 30, fraccion: 0.3 },
  { bucket: 'Ahorro', porcentaje: 20, fraccion: 0.2 },
]
const targets = { Necesidades: 50, Deseos: 30, Ahorro: 20 }

function renderPie(overrides: Partial<Parameters<typeof DistribucionPie>[0]> = {}) {
  return render(
    <DistribucionPie
      tajadas={tajadas}
      targets={targets}
      bucketSeleccionado={null}
      onSelectBucket={vi.fn()}
      {...overrides}
    />,
  )
}

describe('DistribucionPie', () => {
  // FIX 2 (WCAG 4.1.2): role="img" flattens the subtree for AT, which would
  // prune the slice buttons' semantics. An interactive pie must expose
  // role="group" instead — role="img" is reserved for the non-interactive
  // placeholder state (see the "no spending" test below).
  it('renders the main svg as an accessible group (not img) when interactive', () => {
    renderPie()
    expect(screen.getByRole('group', { name: 'Distribución del gasto' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Distribución del gasto' })).not.toBeInTheDocument()
  })

  it('renders one slice per tajada', () => {
    renderPie()
    expect(screen.getAllByTestId('pie-slice')).toHaveLength(3)
  })

  it('applies the resolved color to each slice', () => {
    renderPie()
    const fills = screen.getAllByTestId('pie-slice').map((el) => el.getAttribute('fill'))
    // Serene Finance palette: azul→Necesidades, lavanda→Gustos, amarillo→Ahorro.
    expect(fills).toEqual(['#8FA7D1', '#B1A7D1', '#E6D194'])
  })

  it('renders the percent label on each slice', () => {
    renderPie()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
    expect(screen.getByText('20%')).toBeInTheDocument()
  })

  // WDS-07 (WCAG 2.2 AA): white labels (#FFFFFF) fail contrast on ALL 4
  // pastel slice fills (1.52-2.49:1, well under the 3:1 large-text floor).
  // The dark on-surface tone (#1a1c1c, `PIE_LABEL_FILL`) passes 7.4-11.9:1
  // against every pastel. Reliability follow-up (post-PR4): reverted from
  // the `fill-foreground` token class back to a theme-immune literal — the
  // pastel slice fills (`COLOR_BUCKET`) are PERMANENT literal hex that do
  // NOT flip with `.dark`, but `--foreground` DOES flip (near-white in
  // dark mode). A token-based label would silently reintroduce this exact
  // contrast failure the moment dark mode is wired up, and this class-based
  // assertion wouldn't catch it (jsdom doesn't resolve CSS vars). Assert the
  // literal `fill` attribute AND that no theme-flipping class is used.
  it('renders percent labels via a theme-immune literal fill for WCAG AA contrast, never white or a theme-flipping token (WDS-07)', () => {
    renderPie()
    for (const label of [screen.getByText('50%'), screen.getByText('30%'), screen.getByText('20%')]) {
      expect(label).toHaveAttribute('fill', '#1a1c1c')
      expect(label).not.toHaveClass('fill-foreground')
    }
  })

  // WDS-07 (WCAG 1.4.11 non-text contrast): adjacent pastel slices can be
  // under 1.2:1 apart, so wedges need a visible separator between them.
  // Reliability follow-up (post-PR4): reverted from the `stroke-card` token
  // class back to a theme-immune literal — same rationale as the label fill
  // above (`--card` flips in dark mode, the permanent pastel fills don't).
  it('renders a theme-immune white stroke separator on each slice for WCAG 1.4.11 adjacency contrast, never a theme-flipping token', () => {
    renderPie()
    for (const slice of screen.getAllByTestId('pie-slice')) {
      expect(slice).toHaveAttribute('stroke', '#ffffff')
      expect(slice).not.toHaveClass('stroke-card')
      expect(slice).toHaveAttribute('stroke-width', '2')
    }
    // The nested IDEAL reference pie shares the same pastel fills and the
    // same adjacency problem — its wedges need the same separator.
    for (const slice of screen.getAllByTestId('pie-ideal-slice')) {
      expect(slice).toHaveAttribute('stroke', '#ffffff')
      expect(slice).not.toHaveClass('stroke-card')
      expect(slice).toHaveAttribute('stroke-width', '2')
    }
  })

  it('hides the percent label for slivers under 5%', () => {
    const chico: ReadonlyArray<TajadaGasto> = [
      { bucket: 'Necesidades', porcentaje: 97, fraccion: 0.97 },
      { bucket: 'Deseos', porcentaje: 3, fraccion: 0.03 },
    ]
    renderPie({ tajadas: chico })
    expect(screen.getByText('97%')).toBeInTheDocument()
    expect(screen.queryByText('3%')).not.toBeInTheDocument()
  })

  it('renders the nested IDEAL reference pie (50/30/20) with its own accessible name', () => {
    renderPie()
    expect(screen.getByRole('img', { name: 'Distribución ideal 50/30/20' })).toBeInTheDocument()
    expect(screen.getAllByTestId('pie-ideal-slice')).toHaveLength(3)
    expect(screen.getByText('IDEAL')).toBeInTheDocument()
  })

  it('renders a muted placeholder ring instead of dividing by zero when there is no spending', () => {
    renderPie({ tajadas: [] })
    expect(screen.queryAllByTestId('pie-slice')).toHaveLength(0)
    expect(screen.getByTestId('pie-placeholder')).toBeInTheDocument()
    // The IDEAL inset is independent of spending data — still renders.
    expect(screen.getAllByTestId('pie-ideal-slice')).toHaveLength(3)
  })

  // FIX 2: the non-interactive placeholder state keeps role="img" — there
  // are no interactive children to flatten in that state.
  it('keeps role="img" on the main svg for the non-interactive placeholder state (no spending)', () => {
    renderPie({ tajadas: [] })
    expect(screen.getByRole('img', { name: 'Distribución del gasto' })).toBeInTheDocument()
  })

  it('exposes each main-pie slice as an accessible, selectable button (task 30.10)', () => {
    renderPie()
    expect(screen.getByRole('button', { name: 'Necesidades' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gustos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ahorro' })).toBeInTheDocument()
  })

  it('marks the selected bucket slice with aria-pressed, others not pressed', () => {
    renderPie({ bucketSeleccionado: 'Deseos' })
    expect(screen.getByRole('button', { name: 'Gustos' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Necesidades' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Ahorro' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking a slice reports its bucket via onSelectBucket', () => {
    const onSelectBucket = vi.fn()
    renderPie({ onSelectBucket })
    fireEvent.click(screen.getByRole('button', { name: 'Ahorro' }))
    expect(onSelectBucket).toHaveBeenCalledWith('Ahorro')
  })

  it('pressing Enter on a focused slice reports its bucket via onSelectBucket', () => {
    const onSelectBucket = vi.fn()
    renderPie({ onSelectBucket })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Necesidades' }), { key: 'Enter' })
    expect(onSelectBucket).toHaveBeenCalledWith('Necesidades')
  })

  // FIX 8: a bucket with fraccion 0 mixed among non-zero buckets must render
  // without NaN/crash.
  it('renders without NaN when one slice has fraccion 0 mixed with non-zero slices (FIX 8)', () => {
    const conCero: ReadonlyArray<TajadaGasto> = [
      { bucket: 'Necesidades', porcentaje: 60, fraccion: 0.6 },
      { bucket: 'Deseos', porcentaje: 40, fraccion: 0.4 },
      { bucket: 'Ahorro', porcentaje: 0, fraccion: 0 },
    ]
    renderPie({ tajadas: conCero })
    const paths = screen.getAllByTestId('pie-slice')
    expect(paths).toHaveLength(3)
    for (const path of paths) {
      expect(path.getAttribute('d')).not.toMatch(/NaN/)
    }
  })

  it('the IDEAL reference inset stays non-interactive (not a selectable button)', () => {
    renderPie()
    // The main pie's 3 slices ARE buttons; the IDEAL inset's 3 slices must
    // not add extra buttons with the same accessible names.
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })
})
