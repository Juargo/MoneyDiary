import { render, screen } from '@testing-library/react-native';
import { ResumenScreen } from './ResumenScreen';
import type { ResumenViewModel } from '../domain/resumen-view-model';

// The data-state composition (Stitch mockup). Asserts the Maestro anchors —
// the "Distribución del gasto" heading and testID="semaforo-global" — plus the
// header period, income, and the 3-bucket legend ("Gustos" is the UI label for
// the domain's "Deseos"; SinCategoria is not shown in the pie/legend).
const viewModel: ResumenViewModel = {
  periodo: '2026-07',
  periodoLabel: 'Julio 2026',
  totalIngreso: '$1.000.000',
  sinIngreso: false,
  buckets: [
    { bucket: 'Necesidades', total: '$500.000', porcentajeLabel: '50%', estadoSemaforo: 'verde' },
    { bucket: 'Deseos', total: '$300.000', porcentajeLabel: '30%', estadoSemaforo: 'amarillo' },
    { bucket: 'Ahorro', total: '$200.000', porcentajeLabel: '20%', estadoSemaforo: 'verde' },
    { bucket: 'SinCategoria', total: '$0', porcentajeLabel: '—', estadoSemaforo: null },
  ],
  distribucionGasto: [
    { bucket: 'Necesidades', porcentaje: 50, fraccion: 0.5 },
    { bucket: 'Deseos', porcentaje: 30, fraccion: 0.3 },
    { bucket: 'Ahorro', porcentaje: 20, fraccion: 0.2 },
  ],
  targets: { Necesidades: 50, Deseos: 30, Ahorro: 20 },
  estadoGlobal: 'verde',
};

describe('ResumenScreen', () => {
  it('renders the section heading anchor', async () => {
    await render(<ResumenScreen viewModel={viewModel} />);
    expect(screen.getByText('Distribución del gasto')).toBeOnTheScreen();
  });

  it('renders the period label in the header', async () => {
    await render(<ResumenScreen viewModel={viewModel} />);
    expect(screen.getByText('Julio 2026')).toBeOnTheScreen();
  });

  it('renders totalIngreso formatted as CLP', async () => {
    await render(<ResumenScreen viewModel={viewModel} />);
    expect(screen.getByText('$1.000.000')).toBeOnTheScreen();
  });

  it('renders the 3-bucket legend with the UI label "Gustos" for Deseos', async () => {
    await render(<ResumenScreen viewModel={viewModel} />);
    expect(screen.getByText('Necesidades')).toBeOnTheScreen();
    expect(screen.getByText('Gustos')).toBeOnTheScreen();
    expect(screen.getByText('Ahorro')).toBeOnTheScreen();
    expect(screen.queryByText('Deseos')).not.toBeOnTheScreen();
    expect(screen.queryByText('SinCategoria')).not.toBeOnTheScreen();
  });

  it('renders the global semáforo with testID "semaforo-global"', async () => {
    await render(<ResumenScreen viewModel={viewModel} />);
    expect(screen.getByTestId('semaforo-global')).toBeOnTheScreen();
  });
});
