import { render, screen } from '@testing-library/react-native';
import { IngresoCard } from './IngresoCard';
import type { VariacionIngreso } from '../domain/variacion-ingreso';
import type { BarraIngreso } from '../domain/sparkline-ingreso';

// Income card redesign (2026-08-30 mock): eyebrow + trend pill, display
// amount, period subtext, and a bar sparkline. Mirrors the web contract
// (`IngresoCard.test.tsx`): `totalIngreso` renders verbatim (BigInt-string-
// safe), `variacion`/`barras` arrive pre-computed and null/empty degrades to
// the base card.
const sube: VariacionIngreso = {
  etiqueta: '+12% vs mes anterior',
  direccion: 'sube',
};

const barras: readonly BarraIngreso[] = [
  { periodo: '2026-06', fraccion: 0.62, esActual: false },
  { periodo: '2026-07', fraccion: 1, esActual: true },
];

async function renderCard(
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
  it('renders the pre-formatted income amount exactly, including beyond-safe-integer digits', async () => {
    await renderCard({ totalIngreso: '$9.007.199.254.740.993' });
    expect(screen.getByText('$9.007.199.254.740.993')).toBeOnTheScreen();
  });

  it('renders the INGRESOS TOTALES eyebrow', async () => {
    await renderCard();
    expect(screen.getByText('INGRESOS TOTALES')).toBeOnTheScreen();
  });

  it('renders the period as the honest subtext (never fake freshness copy)', async () => {
    await renderCard();
    expect(screen.getByText('Julio 2026')).toBeOnTheScreen();
    expect(
      screen.queryByText(/Actualizado hace unos instantes/),
    ).not.toBeOnTheScreen();
  });

  it('renders the trend pill when the comparison is computable', async () => {
    await renderCard({ variacion: sube });
    expect(screen.getByText('+12% vs mes anterior')).toBeOnTheScreen();
  });

  it('renders NO pill when the comparison is not computable', async () => {
    await renderCard();
    expect(screen.queryByText(/vs mes anterior/)).not.toBeOnTheScreen();
  });

  // `includeHiddenElements`: the sparkline is DELIBERATELY hidden from
  // assistive tech (decoration — the pill carries the trend in words), so
  // RNTL's default a11y-respecting queries can't see it; that invisibility
  // is itself part of the contract this test pins.
  it('renders the sparkline (hidden from a11y) flagging only the current month', async () => {
    await renderCard({ barras });
    expect(
      screen.getByTestId('ingreso-sparkline', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId('barra-2026-06', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId('barra-2026-07', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('ingreso-sparkline')).not.toBeOnTheScreen();
  });

  it('renders NO sparkline when there are no bars', async () => {
    await renderCard();
    expect(
      screen.queryByTestId('ingreso-sparkline', {
        includeHiddenElements: true,
      }),
    ).not.toBeOnTheScreen();
  });
});
