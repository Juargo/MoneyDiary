import { render, screen } from '@testing-library/react';
import { IngresoCard } from './IngresoCard';

// DOM port of apps/mobile/src/components/IngresoCard.tsx (spec W1-01):
// `totalIngreso` arrives already formatted as CLP from the view-model
// (BigInt-string-safe) — rendered verbatim, never reformatted here.
describe('IngresoCard', () => {
  it('renders the pre-formatted income amount exactly, including beyond-safe-integer digits', () => {
    render(<IngresoCard totalIngreso="$9.007.199.254.740.993" />);
    expect(screen.getByText('$9.007.199.254.740.993')).toBeInTheDocument();
  });

  it('renders an "INGRESOS" label', () => {
    render(<IngresoCard totalIngreso="$1.000.000" />);
    expect(screen.getByText('INGRESOS')).toBeInTheDocument();
  });

  it('renders a trend icon signaling income identity [spec: DCR-01]', () => {
    render(<IngresoCard totalIngreso="$1.000.000" />);
    expect(screen.getByTestId('ingreso-trend-icon')).toBeInTheDocument();
  });

  it('has no decorative left-border accent [spec: DCR-02]', () => {
    const { container } = render(<IngresoCard totalIngreso="$1.000.000" />);
    const card = container.querySelector('[data-slot="card"]');
    expect(card).not.toHaveClass('border-l-4');
    expect(card).not.toHaveClass('border-l-slate-800');
  });

  // REWRITTEN (design critique P1, DCR-01/DCR-03 amended): income is
  // NEUTRALIZED, not recolored — bucket colors carry bucket semantics, so
  // this card must not borrow the generic "green = money in" fintech
  // convention. It now sits on the same neutral `bg-card` white surface
  // every other dashboard card uses, not the mint `--color-ingreso` fill.
  it('renders on the neutral dashboard card surface, not a colored income fill (design critique P1)', () => {
    const { container } = render(<IngresoCard totalIngreso="$1.000.000" />);
    const card = container.querySelector('[data-slot="card"]');
    expect(card).toHaveClass('bg-card');
    expect(card).not.toHaveClass('bg-ingreso');
  });

  // REWRITTEN (design critique P1): the 4xl/extrabold display scale is now
  // EXCLUSIVE to `SemaforoHeroCard` — two competing headlines diluted the
  // "one verdict" hierarchy (PRODUCT.md principle 1). This card drops to a
  // calm supporting-stat scale and loses the mint text token.
  it('renders the income figure as a calm supporting stat, not competing with the hero scale (design critique P1)', () => {
    render(<IngresoCard totalIngreso="$1.000.000" />);
    const figura = screen.getByText('$1.000.000');
    expect(figura).toHaveClass('text-2xl');
    expect(figura).toHaveClass('font-semibold');
    expect(figura).not.toHaveClass('text-4xl');
    expect(figura).not.toHaveClass('font-extrabold');
    expect(figura).not.toHaveClass('text-ingreso-foreground');
  });
});
