import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DistribucionPie } from './DistribucionPie';
import type { TajadaGasto } from '@/domain/distribucion-gasto';

// DOM port of apps/mobile/src/components/DistribucionPie.tsx: a full pie of
// the three spending buckets (share-of-spending, with on-slice percent
// labels) plus a small "IDEAL" reference pie of the 50/30/20 targets. The
// domain view-model only carries bucket/porcentaje/fraccion — color is
// resolved INSIDE this component via lib/bucket-colors (FIX 0: restores
// clean layering, mirrors mobile).
//
// US-030 Slice B (task 30.10) — US-053 PR3 (D-06): each main-pie slice is a
// NAVIGATION control — clicking (or pressing Enter/Space on) a slice reports
// its bucket via `onSelectBucket`, and the screen/route decides where that
// goes. `aria-pressed` is gone: navigation isn't a toggle. The IDEAL
// reference inset stays non-interactive — it's a static target, not one of
// the 4 drill-down buckets.
const tajadas: ReadonlyArray<TajadaGasto> = [
  { bucket: 'Necesidades', porcentaje: 50, fraccion: 0.5 },
  { bucket: 'Deseos', porcentaje: 30, fraccion: 0.3 },
  { bucket: 'Ahorro', porcentaje: 20, fraccion: 0.2 },
];
const targets = { Necesidades: 50, Deseos: 30, Ahorro: 20 };

function renderPie(
  overrides: Partial<Parameters<typeof DistribucionPie>[0]> = {},
) {
  return render(
    <DistribucionPie
      tajadas={tajadas}
      targets={targets}
      onSelectBucket={vi.fn()}
      {...overrides}
    />,
  );
}

describe('DistribucionPie', () => {
  // FIX 2 (WCAG 4.1.2): role="img" flattens the subtree for AT, which would
  // prune the slice buttons' semantics. An interactive pie must expose
  // role="group" instead — role="img" is reserved for the non-interactive
  // placeholder state (see the "no spending" test below).
  it('renders the main svg as an accessible group (not img) when interactive', () => {
    renderPie();
    expect(
      screen.getByRole('group', { name: 'Distribución del gasto' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Distribución del gasto' }),
    ).not.toBeInTheDocument();
  });

  // US-047 T6: one wedge per RING item, including Sin categoría — the ring
  // now renders all 4 `BUCKETS_ANILLO` members (WG5-01), not just the 3
  // spend buckets.
  const tajadasConSinCategoria: ReadonlyArray<TajadaGasto> = [
    { bucket: 'Necesidades', porcentaje: 44, fraccion: 0.44 },
    { bucket: 'Deseos', porcentaje: 28, fraccion: 0.28 },
    { bucket: 'Ahorro', porcentaje: 18, fraccion: 0.18 },
    { bucket: 'SinCategoria', porcentaje: 10, fraccion: 0.1 },
  ];

  it('renders one wedge per ring item, including Sin categoría (US-047 WG5-01)', () => {
    renderPie({ tajadas: tajadasConSinCategoria });
    expect(screen.getAllByTestId('pie-slice')).toHaveLength(4);
  });

  it('applies the resolved fill class to each slice, including a deliberate neutral grey class for Sin categoría (US-047 D-08, not the muted-foreground fallback)', () => {
    renderPie({ tajadas: tajadasConSinCategoria });
    const slices = screen.getAllByTestId('pie-slice');
    // Brote bucket palette (2026-09-12), now resolved as token-backed
    // classes (D3) instead of hex: steel blue→fill-necesidades,
    // plum→fill-gustos, jade→fill-ahorro, deliberate mid
    // grey→fill-sin-categoria (never the fill-muted-foreground fallback).
    const clasesEsperadas = [
      'fill-necesidades',
      'fill-gustos',
      'fill-ahorro',
      'fill-sin-categoria',
    ];
    slices.forEach((slice, i) => {
      expect(slice).toHaveClass(clasesEsperadas[i]);
      expect(slice).not.toHaveClass('fill-muted-foreground');
    });
  });

  it('renders the percent label on each slice', () => {
    renderPie();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
  });

  // WDS-07 (WCAG 2.2 AA): white labels (#FFFFFF) would fail contrast on the
  // bucket slice fills. The dark on-surface class
  // (`fill-pie-etiqueta-necesidades`/`-gustos`/`-ahorro`, bound to the
  // `--color-pie-etiqueta-*` tokens) clears Necesidades/Deseos/Ahorro at
  // 6.88:1/4.61:1/9.75:1 (Brote re-tint, 2026-09-12 — see
  // `lib/pie-colors.ts`). A dedicated per-bucket token, never the generic
  // `fill-foreground` design-system class: `--foreground` flips with the
  // theme, the bucket fills below the label don't, and reusing it would
  // silently reintroduce this exact contrast failure once dark mode is
  // wired up.
  it('renders percent labels via a dedicated token class for WCAG AA contrast, never the generic fill-foreground token (WDS-07)', () => {
    renderPie();
    const etiquetasPorClase: ReadonlyArray<[string, string]> = [
      ['50%', 'fill-pie-etiqueta-necesidades'],
      ['30%', 'fill-pie-etiqueta-gustos'],
      ['20%', 'fill-pie-etiqueta-ahorro'],
    ];
    for (const [texto, clase] of etiquetasPorClase) {
      const label = screen.getByText(texto);
      expect(label).toHaveClass(clase);
      expect(label).not.toHaveClass('fill-foreground');
    }
  });

  // Brote re-tint (2026-09-12): Sin categoría's new fill (#686663) is too
  // dark for the shared dark label (2.99:1) — the on-wedge label class is
  // resolved per bucket via `claseEtiquetaPie` (`lib/pie-colors.ts`), not a
  // single constant. Necesidades/Deseos/Ahorro keep the dark label class;
  // Sin categoría gets the light one (`fill-pie-etiqueta-sin-categoria`,
  // 4.59:1 on its own fill).
  it('gives the Sin categoría wedge a light on-wedge label class while the other three keep a dark one (Brote re-tint)', () => {
    renderPie({ tajadas: tajadasConSinCategoria });
    expect(screen.getByText('44%')).toHaveClass(
      'fill-pie-etiqueta-necesidades',
    );
    expect(screen.getByText('28%')).toHaveClass('fill-pie-etiqueta-gustos');
    expect(screen.getByText('18%')).toHaveClass('fill-pie-etiqueta-ahorro');
    expect(screen.getByText('10%')).toHaveClass(
      'fill-pie-etiqueta-sin-categoria',
    );
  });

  // WDS-07 (WCAG 1.4.11 non-text contrast): adjacent fill slices can sit
  // close in luminance, so wedges need a visible separator between them. A
  // dedicated `stroke-pie-separador` token class (D3), never the generic
  // `stroke-card` design-system class — no surface token can track this
  // stroke's backdrop (the mini pie alone sits on `bg-card` OR on
  // `bg-ingreso` when its month is selected). That constraint is PERMANENT
  // and this test still guards it.
  //
  // Brote re-tint (2026-09-12) re-measured separation from the bucket fills:
  // 7.70:1 (Necesidades), 5.16:1 (Deseos), 10.91:1 (Ahorro), 3.35:1 (Sin
  // categoría) — see `lib/pie-colors.ts`.
  it('renders a dedicated stroke separator class on each slice for WCAG 1.4.11 adjacency contrast, never the generic stroke-card token', () => {
    renderPie();
    for (const slice of screen.getAllByTestId('pie-slice')) {
      expect(slice).toHaveClass('stroke-pie-separador');
      expect(slice).not.toHaveClass('stroke-card');
      expect(slice).toHaveAttribute('stroke-width', '2');
    }
    // The nested IDEAL reference pie shares the same bucket fills and the
    // same adjacency problem — its wedges need the same separator.
    for (const slice of screen.getAllByTestId('pie-ideal-slice')) {
      expect(slice).toHaveClass('stroke-pie-separador');
      expect(slice).not.toHaveClass('stroke-card');
      expect(slice).toHaveAttribute('stroke-width', '2');
    }
  });

  // TWO-TONE focus indicator (2026-09-03, re-derived for the Brote re-tint
  // 2026-09-12). `--ring` is cyan under the Tecno-Analítico identity: 12.80:1
  // on `bg-card`, but only 1.21-3.95:1 on the bucket wedge fills the
  // outline's bounding box cuts across — three of the four buckets stay
  // under the WCAG 2.2 SC 1.4.11 3:1 floor. No single opaque colour clears
  // that floor against every fill AND `--background` (the luminance interval
  // is still EMPTY; derivation at the call site), so the wedge's own dark
  // stroke thickens on focus to carry the indicator over the fill stretches
  // while `outline-ring` carries it over the dark ones.
  //
  // Asserted as classes, not geometry: jsdom resolves no CSS variables and
  // paints nothing, so the ratio itself is not checkable here — same
  // "mechanism, not geometry" split the stroke/label assertions above use.
  // This exists so a future "simplify the focus ring" pass cannot drop half
  // the indicator and leave the fill stretches under the floor.
  it('gives focused wedges a two-tone indicator: the cyan ring AND a thickened dark stroke', () => {
    renderPie();
    for (const slice of screen.getAllByTestId('pie-slice')) {
      expect(slice).toHaveClass('focus-visible:outline-ring');
      expect(slice).toHaveClass('focus-visible:[stroke-width:4]');
    }
  });

  it('hides the percent label for slivers under 5%', () => {
    const chico: ReadonlyArray<TajadaGasto> = [
      { bucket: 'Necesidades', porcentaje: 97, fraccion: 0.97 },
      { bucket: 'Deseos', porcentaje: 3, fraccion: 0.03 },
    ];
    renderPie({ tajadas: chico });
    expect(screen.getByText('97%')).toBeInTheDocument();
    expect(screen.queryByText('3%')).not.toBeInTheDocument();
  });

  it('renders the nested IDEAL reference pie (50/30/20) with its own accessible name', () => {
    renderPie();
    expect(
      screen.getByRole('img', { name: 'Distribución ideal 50/30/20' }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('pie-ideal-slice')).toHaveLength(3);
    expect(screen.getByText('IDEAL')).toBeInTheDocument();
  });

  it('renders a muted placeholder ring instead of dividing by zero when there is no spending', () => {
    renderPie({ tajadas: [] });
    expect(screen.queryAllByTestId('pie-slice')).toHaveLength(0);
    expect(screen.getByTestId('pie-placeholder')).toBeInTheDocument();
    // The IDEAL inset is independent of spending data — still renders.
    expect(screen.getAllByTestId('pie-ideal-slice')).toHaveLength(3);
  });

  // FIX 2: the non-interactive placeholder state keeps role="img" — there
  // are no interactive children to flatten in that state.
  it('keeps role="img" on the main svg for the non-interactive placeholder state (no spending)', () => {
    renderPie({ tajadas: [] });
    expect(
      screen.getByRole('img', { name: 'Distribución del gasto' }),
    ).toBeInTheDocument();
  });

  it('exposes each main-pie slice as an accessible, navigable button (task 30.10, D-06)', () => {
    renderPie();
    expect(
      screen.getByRole('button', { name: 'Necesidades' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gustos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ahorro' })).toBeInTheDocument();
  });

  // Round-9 critique P3 (converged from the "do NOT re-tint" LOCKED literal):
  // the focus ring moves to the shared --ring token (#1a1c1c) — verified
  // DARKER than the old outline-slate-800 (#1e293b), so contrast against
  // every bucket fill can only improve (see PreviewMuestra/DESIGN.md
  // round-9 report for the computed ratios). `outline-ring` is the class the
  // rest of the app already uses for this same focus grammar.
  it('round-9 P3: uses the shared --ring focus-visible outline, converged from the old slate-800 literal', () => {
    renderPie();
    const boton = screen.getByRole('button', { name: 'Necesidades' });
    // SVG elements expose `className` as an SVGAnimatedString, not a plain
    // string — read the raw `class` attribute instead (same reason other
    // SVG-path assertions in this file use `getAttribute`).
    const clase = boton.getAttribute('class') ?? '';
    expect(clase).toContain('outline-ring');
    expect(clase).not.toContain('outline-slate-800');
  });

  // US-053 PR3 (D-06): `aria-pressed` is GONE — a click navigates (not a
  // toggle), and the drill-down contract is the click/keyboard tests below.
  // The old "marks the selected bucket slice with aria-pressed" test
  // (DistribucionPie.test.tsx:176) was removed with it.
  it('clicking a slice reports its bucket via onSelectBucket', () => {
    const onSelectBucket = vi.fn();
    renderPie({ onSelectBucket });
    fireEvent.click(screen.getByRole('button', { name: 'Ahorro' }));
    expect(onSelectBucket).toHaveBeenCalledWith('Ahorro');
  });

  it('pressing Enter on a focused slice reports its bucket via onSelectBucket', () => {
    const onSelectBucket = vi.fn();
    renderPie({ onSelectBucket });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Necesidades' }), {
      key: 'Enter',
    });
    expect(onSelectBucket).toHaveBeenCalledWith('Necesidades');
  });

  // FIX 8: a bucket with fraccion 0 mixed among non-zero buckets must render
  // without NaN/crash.
  it('renders without NaN when one slice has fraccion 0 mixed with non-zero slices (FIX 8)', () => {
    const conCero: ReadonlyArray<TajadaGasto> = [
      { bucket: 'Necesidades', porcentaje: 60, fraccion: 0.6 },
      { bucket: 'Deseos', porcentaje: 40, fraccion: 0.4 },
      { bucket: 'Ahorro', porcentaje: 0, fraccion: 0 },
    ];
    renderPie({ tajadas: conCero });
    const paths = screen.getAllByTestId('pie-slice');
    expect(paths).toHaveLength(3);
    for (const path of paths) {
      expect(path.getAttribute('d')).not.toMatch(/NaN/);
    }
  });

  // US-047 T6: renamed from 3→4 — the new Sin categoría wedge is ALSO
  // selectable (the ring's 4th member), and the IDEAL inset still
  // contributes zero interactive wedges of its own.
  it('the new Sin categoría wedge is selectable, and the IDEAL inset still contributes zero interactive wedges (US-047)', () => {
    renderPie({ tajadas: tajadasConSinCategoria });
    // The main pie's 4 slices (incl. Sin categoría) ARE buttons; the IDEAL
    // inset's 3 slices must not add extra buttons with the same names.
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(
      screen.getByRole('button', { name: 'Sin grupo ni categoría' }),
    ).toBeInTheDocument();
  });

  // US-047 T6/D-01: the main ring is a DONUT ONLY when `conInterior` is
  // opted in — wedges never start at the SVG centre and carry TWO arc
  // commands (outer arc + inner arc = the hole), vs. a filled wedge's single
  // arc. (Judgment-day fix: `conInterior` defaults to `false` — see the
  // "renders a filled pie by default" test below for the un-opted-in case.)
  it('main-ring wedge paths do not start at the centre and carry an outer + inner arc — the donut hole when conInterior is enabled (US-047 CA-01 donut proof)', () => {
    renderPie({
      tajadas: tajadasConSinCategoria,
      size: 240,
      conInterior: true,
    });
    for (const path of screen.getAllByTestId('pie-slice')) {
      const d = path.getAttribute('d') ?? '';
      expect(d.startsWith('M 120 120')).toBe(false);
      expect(d.match(/A /g)).toHaveLength(2);
    }
  });

  // Judgment-day fix: the donut hole was applied unconditionally, which
  // meant any standalone consumer feeding fewer than the full ring (as
  // `ResumenScreen` still does at this PR2 boundary — 3 items via the PR1
  // shim, no `SinCategoria` wedge) got a hole with a visibly incomplete
  // ring: worse than the pre-US-047 filled pie. The hole is now opt-in via
  // `conInterior` (default `false`), so a caller that hasn't wired the 4th
  // wedge yet keeps the byte-identical filled-pie shape `main` already
  // ships — same single-arc, `M cx cy`-starting path this function always
  // returned before this change (T1's own regression contract).
  it('renders the filled pie (no hole) by default — the donut hole is opt-in via conInterior (US-047 PR2 judgment fix)', () => {
    renderPie({ size: 240 });
    for (const path of screen.getAllByTestId('pie-slice')) {
      const d = path.getAttribute('d') ?? '';
      expect(d.startsWith('M 120 120')).toBe(true);
      expect(d.match(/A /g)).toHaveLength(1);
    }
  });

  // US-047 T6/D-02: the IDEAL inset keeps the OLD filled-wedge shape (no
  // hole) — it did not inherit the donut ring's rInterior. Filled wedges
  // start `M cx cy L ...` (single arc); this is the structural proof, not a
  // literal-coordinate pin (idealSize/2 carries float imprecision).
  it("the IDEAL inset's wedges still start at the centre and still number 3 (US-047 D-02, kept the 50/30/20 set, no hole)", () => {
    renderPie({ tajadas: tajadasConSinCategoria });
    const idealPaths = screen.getAllByTestId('pie-ideal-slice');
    expect(idealPaths).toHaveLength(3);
    for (const path of idealPaths) {
      const d = path.getAttribute('d') ?? '';
      expect(d).toMatch(/^M [\d.]+ [\d.]+ L /);
      expect(d.match(/A /g)).toHaveLength(1);
    }
  });

  // US-047 T6/R-6: the Sin categoría wedge's on-wedge % label follows the
  // SAME uniform ≥5% suppression rule as the other 3 wedges — no special
  // case. The %-omission (WG5-03) is scoped to the LEGEND row only.
  it('shows the Sin categoría on-wedge % label under the same uniform ≥5% rule as the other wedges (US-047 R-6, no ring special-case)', () => {
    renderPie({ tajadas: tajadasConSinCategoria });
    expect(screen.getByText('44%')).toBeInTheDocument();
    expect(screen.getByText('28%')).toBeInTheDocument();
    expect(screen.getByText('18%')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
  });

  it('suppresses the Sin categoría on-wedge % label when its share is under 5%, same as any other wedge (US-047 R-6)', () => {
    const chicoSinCategoria: ReadonlyArray<TajadaGasto> = [
      { bucket: 'Necesidades', porcentaje: 49, fraccion: 0.49 },
      { bucket: 'Deseos', porcentaje: 30, fraccion: 0.3 },
      { bucket: 'Ahorro', porcentaje: 18, fraccion: 0.18 },
      { bucket: 'SinCategoria', porcentaje: 3, fraccion: 0.03 },
    ];
    renderPie({ tajadas: chicoSinCategoria });
    expect(screen.getByText('49%')).toBeInTheDocument();
    expect(screen.queryByText('3%')).not.toBeInTheDocument();
  });
});
