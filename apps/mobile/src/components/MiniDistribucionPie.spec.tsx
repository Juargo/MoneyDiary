import { render, screen } from '@testing-library/react-native';
import { MiniDistribucionPie } from './MiniDistribucionPie';
import type { TajadaGasto } from '../domain/distribucion-gasto';

// US-050 PR5a (design §1.7): port of `DistribucionPie` for the annual grid's
// 44px mini-mini. Fixed size, label-less — carries NO accessibility props of
// its own (the parent `Pressable`, `MesCelda`, is `accessible` and collapses
// the subtree into a single AT node).
const tajadas: readonly TajadaGasto[] = [
  { bucket: 'Necesidades', porcentaje: 44, fraccion: 0.44 },
  { bucket: 'Deseos', porcentaje: 28, fraccion: 0.28 },
  { bucket: 'Ahorro', porcentaje: 18, fraccion: 0.18 },
  { bucket: 'SinCategoria', porcentaje: 10, fraccion: 0.1 },
];

describe('MiniDistribucionPie', () => {
  it('renders at most 4 wedge paths for a 4-item ring', async () => {
    await render(<MiniDistribucionPie tajadas={tajadas} />);
    expect(screen.getAllByTestId('mini-pie-slice')).toHaveLength(4);
  });

  it('renders a muted placeholder circle instead of dividing by zero when there is no spending', async () => {
    await render(<MiniDistribucionPie tajadas={[]} />);
    expect(screen.queryAllByTestId('mini-pie-slice')).toHaveLength(0);
    expect(screen.getByTestId('mini-pie-placeholder')).toBeOnTheScreen();
  });

  it('renders no text/label nodes (no on-wedge percentages, no accessibilityLabel)', async () => {
    await render(<MiniDistribucionPie tajadas={tajadas} />);
    expect(screen.queryByText('44%')).toBeNull();
    expect(screen.queryByLabelText('Distribución del gasto')).toBeNull();
  });
});
