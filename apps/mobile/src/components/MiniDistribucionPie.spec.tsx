import { render, screen } from '@testing-library/react-native';
import { MiniDistribucionPie } from './MiniDistribucionPie';
import type { TajadaGasto } from '../domain/distribucion-gasto';

// US-050 PR5a (design §1.7): port of `DistribucionPie` for the annual grid's
// 44px mini-mini. Fixed size, label-less — carries NO accessibility props of
// its own (the parent `Pressable`, `MesCelda`, is `accessible` and collapses
// the subtree into a single AT node).
//
// Issue #778 tramo5b PR2: `BUCKETS_ANILLO` dropped SinCategoria upstream —
// this generic, bucket-agnostic renderer never decides what it's fed, so the
// fixture below just reflects the ring's real, current 3-item shape.
const tajadas: readonly TajadaGasto[] = [
  { bucket: 'Necesidades', porcentaje: 44, fraccion: 0.44 },
  { bucket: 'Deseos', porcentaje: 28, fraccion: 0.28 },
  { bucket: 'Ahorro', porcentaje: 28, fraccion: 0.28 },
];

describe('MiniDistribucionPie', () => {
  it('renders at most 3 wedge paths for a 3-item ring', async () => {
    await render(<MiniDistribucionPie tajadas={tajadas} />);
    expect(screen.getAllByTestId('mini-pie-slice')).toHaveLength(3);
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
