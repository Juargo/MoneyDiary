import { render, screen } from '@testing-library/react';
import { IngresoCard } from './IngresoCard';
import type { VariacionIngreso } from '@/domain/variacion-ingreso';
import type { BarraIngreso } from '@/domain/sparkline-ingreso';

// Income card redesign (2026-08-30 mock): eyebrow + trend pill, display-scale
// amount, period subtext, and an aria-hidden bar sparkline. `totalIngreso`
// arrives already formatted as CLP from the view-model (BigInt-string-safe,
// spec W1-01) — rendered verbatim, never reformatted here. `variacion` and
// `barras` arrive pre-computed from the pure domain helpers; null/empty means
// the card degrades to the no-pill, no-sparkline base (annual data loading,
// errored, or honestly not comparable).
const sube: VariacionIngreso = {
  etiqueta: '+12% vs mes anterior',
  direccion: 'sube',
};

const barras: ReadonlyArray<BarraIngreso> = [
  { periodo: '2026-06', fraccion: 0.62, esActual: false },
  { periodo: '2026-07', fraccion: 1, esActual: true },
];

function renderCard(
  overrides: Partial<React.ComponentProps<typeof IngresoCard>> = {},
) {
  return render(
    <IngresoCard
      totalIngreso="$885.017"
      periodo="2026-07"
      variacion={null}
      barras={[]}
      {...overrides}
    />,
  );
}

describe('IngresoCard', () => {
  it('renders the pre-formatted income amount exactly, including beyond-safe-integer digits', () => {
    renderCard({ totalIngreso: '$9.007.199.254.740.993' });
    expect(screen.getByText('$9.007.199.254.740.993')).toBeInTheDocument();
  });

  it('renders the INGRESOS TOTALES eyebrow on the ingreso accent color', () => {
    renderCard();
    const eyebrow = screen.getByText('INGRESOS TOTALES');
    expect(eyebrow).toHaveClass('text-ingreso-foreground');
  });

  it('renders the amount at display scale on the neutral foreground (mock supersedes the P1 hero-exclusive scale)', () => {
    renderCard();
    const figura = screen.getByText('$885.017');
    expect(figura).toHaveClass('text-4xl');
    expect(figura).toHaveClass('font-extrabold');
    expect(figura).toHaveClass('text-foreground');
  });

  it('keeps the card surface neutral: the ingreso wash moved into the pill (mock anatomy)', () => {
    const { container } = renderCard();
    const card = container.querySelector('[data-slot="card"]');
    expect(card).not.toHaveClass('bg-ingreso');
  });

  it('renders the period as the honest subtext (never fake freshness copy)', () => {
    renderCard();
    expect(screen.getByText('julio 2026')).toBeInTheDocument();
    expect(
      screen.queryByText(/Actualizado hace unos instantes/),
    ).not.toBeInTheDocument();
  });

  it('renders the trend pill with the rise icon on the ingreso pair', () => {
    renderCard({ variacion: sube });
    const pill = screen.getByText('+12% vs mes anterior');
    expect(pill.closest('span')).toHaveClass('bg-ingreso');
    expect(screen.getByTestId('ingreso-trend-icon')).toBeInTheDocument();
  });

  it('renders the drop pill with the fall icon', () => {
    renderCard({
      variacion: { etiqueta: '-8% vs mes anterior', direccion: 'baja' },
    });
    expect(screen.getByText('-8% vs mes anterior')).toBeInTheDocument();
    expect(screen.getByTestId('ingreso-trend-icon')).toBeInTheDocument();
  });

  it('renders the sin-cambio pill without a trend icon', () => {
    renderCard({
      variacion: {
        etiqueta: 'Sin cambio vs mes anterior',
        direccion: 'igual',
      },
    });
    expect(screen.getByText('Sin cambio vs mes anterior')).toBeInTheDocument();
    expect(screen.queryByTestId('ingreso-trend-icon')).not.toBeInTheDocument();
  });

  it('renders NO pill when the comparison is not computable', () => {
    renderCard();
    expect(screen.queryByText(/vs mes anterior/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('ingreso-trend-icon')).not.toBeInTheDocument();
  });

  it('renders the sparkline aria-hidden with only the current month on the deep ingreso tone', () => {
    renderCard({ barras });
    const sparkline = screen.getByTestId('ingreso-sparkline');
    expect(sparkline).toHaveAttribute('aria-hidden', 'true');
    const barrasDom = sparkline.querySelectorAll('[data-barra]');
    expect(barrasDom).toHaveLength(2);
    expect(barrasDom[0]).toHaveClass('bg-muted');
    expect(barrasDom[1]).toHaveClass('bg-ingreso-foreground');
  });

  it('renders NO sparkline when there are no bars', () => {
    renderCard();
    expect(screen.queryByTestId('ingreso-sparkline')).not.toBeInTheDocument();
  });
});
