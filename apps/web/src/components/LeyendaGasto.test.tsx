import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeyendaGasto } from './LeyendaGasto';
import type { ItemLeyenda } from '@/domain/resumen-view-model';

// US-047 (design D-03/D-08): the legend takes two ordered `ItemLeyenda[]`
// groups instead of one flat `LeyendaTajada[]` — a structural divider sits
// between them (viewport-conditional, D-09/T13 owns the Playwright
// visibility proof; this file only proves the element exists at the right
// DOM position). The accessible name is content-derived (the row's own
// visible text), not a bucket-only `aria-label` (R-8/D-08 deliberate
// removal). Issue #778 tramo5b PR1: `complemento` is now just `[ingreso]` —
// the `'sinCategoria'` kind is retired from `ItemLeyenda` entirely.
const principales: ReadonlyArray<ItemLeyenda> = [
  {
    kind: 'gasto',
    bucket: 'Necesidades',
    porcentaje: 42,
    montoLabel: '-$624.500',
  },
  { kind: 'gasto', bucket: 'Deseos', porcentaje: 30, montoLabel: '-$450.000' },
  { kind: 'gasto', bucket: 'Ahorro', porcentaje: 20, montoLabel: '-$300.000' },
];
const complemento: ReadonlyArray<ItemLeyenda> = [
  { kind: 'ingreso', montoLabel: '+$1.500.000' },
];

function renderLeyenda(
  overrides: Partial<Parameters<typeof LeyendaGasto>[0]> = {},
) {
  return render(
    <LeyendaGasto
      principales={principales}
      complemento={complemento}
      onSelectBucket={vi.fn()}
      onSelectIngresos={vi.fn()}
      {...overrides}
    />,
  );
}

describe('LeyendaGasto', () => {
  it('renders three 50/30/20 rows, a separator, then Ingresos (issue #778 tramo5b PR1 retired the Sin categoría row)', () => {
    renderLeyenda();
    expect(screen.getAllByTestId('leyenda-item')).toHaveLength(4);
  });

  it('each spend-bucket row announces name, percentage, and amount via a content-derived accessible name (US-047 D-08, aria-label removed)', () => {
    renderLeyenda();
    expect(
      screen.getByRole('button', { name: 'Necesidades 42% -$624.500' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Gustos 30% -$450.000' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ahorro 20% -$300.000' }),
    ).toBeInTheDocument();
  });

  it('still renders the Ingresos row when there is no spending (US-047 D-08, no longer returns null)', () => {
    render(
      <LeyendaGasto
        principales={[]}
        complemento={complemento}
        onSelectBucket={vi.fn()}
        onSelectIngresos={vi.fn()}
      />,
    );
    expect(screen.getByText('Ingresos')).toBeInTheDocument();
    expect(screen.getAllByTestId('leyenda-item')).toHaveLength(1);
  });

  // US-054 T-14 (D-05, WG5-03/06): the Ingresos row IS now a button —
  // the US-047 interim ("none exists today") is removed; the endpoint exists
  // (US-052). No `%` (income is not part of 50/30/20 spend split). Activation
  // calls `onSelectIngresos` (new callback, distinct from `onSelectBucket`).
  it('the Ingresos row IS a button with no %, and activation calls onSelectIngresos (US-054 D-05, WG5-03/06)', () => {
    const onSelectIngresos = vi.fn();
    renderLeyenda({ onSelectIngresos });
    const boton = screen.getByRole('button', { name: /^Ingresos/ });
    expect(boton).toBeInTheDocument();
    expect(boton.textContent).not.toContain('%');
    fireEvent.click(boton);
    expect(onSelectIngresos).toHaveBeenCalledTimes(1);
  });

  it('spend-bucket amounts start with "-", the Ingresos amount starts with "+" (US-047 WG5-04)', () => {
    renderLeyenda();
    expect(screen.getByText('-$624.500')).toBeInTheDocument();
    expect(screen.getByText('+$1.500.000')).toBeInTheDocument();
  });

  // Issue #778 tramo5b PR1: the Sin categoría row (SinCategoria bucket,
  // "N tx" + alert cue + drill-down to `/buckets/SinCategoria`) is RETIRED.
  // `ItemLeyenda` no longer even has a `'sinCategoria'` kind (a compile-time
  // guarantee, not just a runtime one), so `complemento` can only ever be
  // `[ingreso]` — this asserts nothing resembling that old row renders.
  it('never renders a Sin categoría row, its alert icon, or a drill-down to SinCategoria (issue #778 tramo5b PR1)', () => {
    renderLeyenda();
    expect(
      screen.queryByRole('button', { name: /Sin grupo ni categoría/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/ tx$/)).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('leyenda-alerta-sin-categoria'),
    ).not.toBeInTheDocument();
  });

  it('the chevron is aria-hidden and never appears in a row accessible name (US-047 WG5-12)', () => {
    renderLeyenda();
    const boton = screen.getByRole('button', {
      name: 'Necesidades 42% -$624.500',
    });
    const chevron = boton.querySelector('svg');
    expect(chevron).toHaveAttribute('aria-hidden', 'true');
  });

  it('the separator sits structurally between the two rendered groups (US-047 D-03: two arrays, not a grupo field)', () => {
    renderLeyenda();
    const divisor = screen.getByTestId('leyenda-divisor');
    const filas = screen.getAllByTestId('leyenda-item');
    // Divisor must be AFTER the 3rd row (Ahorro, last principal) and BEFORE
    // the 4th row (Ingresos, first complemento item).
    expect(
      filas[2].compareDocumentPosition(divisor) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      filas[3].compareDocumentPosition(divisor) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  // Round-9 critique P3: the old "do NOT re-tint" LOCKED literal
  // (outline-slate-800, #1e293b) converges to the shared --ring token
  // (#1a1c1c) — verified DARKER, so contrast against every bucket fill
  // can only improve (see round-9 report for the computed ratios).
  // `outline-ring` is the class the rest of the app already uses for this
  // same focus grammar (was FIX 3, WCAG 1.4.11).
  it('round-9 P3: uses the shared --ring focus-visible outline, converged from the old slate-800 literal', () => {
    renderLeyenda();
    const boton = screen.getByRole('button', {
      name: 'Necesidades 42% -$624.500',
    });
    expect(boton.className).toContain('outline-ring');
    expect(boton.className).not.toContain('outline-slate-800');
    expect(boton.className).not.toContain('outline-slate-400');
  });

  it('gives each row a comfortable touch target padding on mobile (Phase 4 mobile audit)', () => {
    renderLeyenda();
    const boton = screen.getByRole('button', {
      name: 'Necesidades 42% -$624.500',
    });
    expect(boton.className).toContain('px-2');
    expect(boton.className).toContain('py-1');
  });

  // US-053 PR3 (D-06): `aria-pressed` is GONE — a click navigates to the
  // month-scoped bucket page (not a toggle), and the drill-down contract is
  // the click test below. The old "marks the selected bucket row with
  // aria-pressed" test (LeyendaGasto.test.tsx:173) was removed with it.

  // Restored (judgment-day): dropped without replacement when this file was
  // rewritten for T7 — mirrors DistribucionPie.test.tsx's own color-dot
  // guard (`applies the resolved fill class to each slice...`).
  //
  // `web-theme-switch` PR4 (D3): the dot is now a token-backed `bg-*` class
  // (`claseFondoBucket`, `lib/bucket-colors.ts`), not an inline
  // `backgroundColor` hex. Issue #778 tramo5b PR1: only 3 dots render now —
  // the three `principales` rows (Ingresos has no dot, and `complemento`'s
  // retired `sinCategoria` row used to add a 4th).
  it('applies the resolved fill class to each color dot, never the muted-foreground fallback', () => {
    renderLeyenda();
    const dots = screen.getAllByTestId('leyenda-dot');
    const clasesEsperadas = ['bg-necesidades', 'bg-gustos', 'bg-ahorro'];
    expect(dots).toHaveLength(3);
    dots.forEach((dot, i) => {
      expect(dot).toHaveClass(clasesEsperadas[i]);
      expect(dot).not.toHaveClass('bg-muted-foreground');
    });
  });

  it('clicking a spend-bucket row reports its bucket via onSelectBucket', () => {
    const onSelectBucket = vi.fn();
    renderLeyenda({ onSelectBucket });
    fireEvent.click(
      screen.getByRole('button', { name: 'Gustos 30% -$450.000' }),
    );
    expect(onSelectBucket).toHaveBeenCalledWith('Deseos');
  });

  // The amount's sign is already decided by the view model
  // (`formatearMontoConSigno`: '-' for spend, '+' for income, no sign for a
  // zero amount), so the color reads it straight from `montoLabel` — no money
  // parsing. Zero stays neutral, per the `--color-cargo-foreground` docstring.
  it('colors negative amounts with the expense ink, positive amounts with the income ink', () => {
    renderLeyenda();
    expect(screen.getByText('-$624.500')).toHaveClass('text-cargo-foreground');
    expect(screen.getByText('-$300.000')).toHaveClass('text-cargo-foreground');
    expect(screen.getByText('+$1.500.000')).toHaveClass(
      'text-ingreso-foreground',
    );
  });

  it('leaves a zero amount neutral', () => {
    renderLeyenda({
      complemento: [{ kind: 'ingreso', montoLabel: '$0' }],
    });
    const cero = screen.getByText('$0');
    expect(cero).toHaveClass('text-foreground');
    expect(cero).not.toHaveClass('text-cargo-foreground');
    expect(cero).not.toHaveClass('text-ingreso-foreground');
  });
});
