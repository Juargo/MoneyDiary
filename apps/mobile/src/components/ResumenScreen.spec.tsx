import { render, screen } from '@testing-library/react-native';
import { ResumenScreen } from './ResumenScreen';
import type { ResumenViewModel } from '../domain/resumen-view-model';

// RED-first (T3.9, sprint3-mvp-mobile, MOB-03/MOB-04): the data-state
// composition. Asserts every Maestro anchor from design.md B.5 renders
// exactly once given a resolved ResumenViewModel (no fetch, no state
// switch here — that's app/index.tsx's job).
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
  estadoGlobal: 'verde',
};

describe('ResumenScreen', () => {
  it('renders the section heading', async () => {
    await render(<ResumenScreen viewModel={viewModel} />);
    expect(screen.getByText('Distribución 50/30/20')).toBeOnTheScreen();
  });

  it('renders totalIngreso formatted as CLP', async () => {
    await render(<ResumenScreen viewModel={viewModel} />);
    expect(screen.getByText('$1.000.000')).toBeOnTheScreen();
  });

  it('renders all 4 bucket labels including SinCategoria', async () => {
    await render(<ResumenScreen viewModel={viewModel} />);
    expect(screen.getByText('Necesidades')).toBeOnTheScreen();
    expect(screen.getByText('Deseos')).toBeOnTheScreen();
    expect(screen.getByText('Ahorro')).toBeOnTheScreen();
    expect(screen.getByText('SinCategoria')).toBeOnTheScreen();
  });

  it('renders the global semáforo with testID "semaforo-global"', async () => {
    await render(<ResumenScreen viewModel={viewModel} />);
    expect(screen.getByTestId('semaforo-global')).toBeOnTheScreen();
  });
});
