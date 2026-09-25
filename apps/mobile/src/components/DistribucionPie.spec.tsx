import { render, screen } from '@testing-library/react-native';
import { DistribucionPie } from './DistribucionPie';
import type { TajadaGasto } from '../domain/distribucion-gasto';

// US-050 PR4a: donut rewrite (design §1.7). The main ring renders all
// `BUCKETS_ANILLO` members (label-less, D-07) with a donut hole
// (RATIO_INTERIOR = 0.58) and a white wedge separator (WCAG 1.4.11). The
// IDEAL 50/30/20 reference inset, `slicesIdeales`, the `targets` prop, and
// the on-wedge `%` labels are REMOVED (MOB-15, Closed Question 2).
//
// Issue #778 tramo5b PR2: `BUCKETS_ANILLO` dropped SinCategoria upstream
// (`distribucion-gasto.ts`/`resumen-view-model.ts`) — this generic,
// bucket-agnostic renderer never decides what it's fed, so the fixture
// below just reflects the ring's real, current 3-item shape.
const tajadas: readonly TajadaGasto[] = [
  { bucket: 'Necesidades', porcentaje: 44, fraccion: 0.44 },
  { bucket: 'Deseos', porcentaje: 28, fraccion: 0.28 },
  { bucket: 'Ahorro', porcentaje: 28, fraccion: 0.28 },
];

describe('DistribucionPie', () => {
  it('renders one wedge path per ring item', async () => {
    await render(<DistribucionPie tajadas={tajadas} />);
    expect(screen.getAllByTestId('pie-slice')).toHaveLength(3);
  });

  it('renders a muted placeholder ring instead of dividing by zero when there is no spending', async () => {
    await render(<DistribucionPie tajadas={[]} />);
    expect(screen.queryAllByTestId('pie-slice')).toHaveLength(0);
    expect(screen.getByTestId('pie-placeholder')).toBeOnTheScreen();
  });

  it('does not accept a targets prop (IDEAL inset removed, MOB-15)', async () => {
    // @ts-expect-error — `targets` is no longer part of DistribucionPie's public props.
    await render(<DistribucionPie tajadas={tajadas} targets={{}} />);
    expect(screen.queryByLabelText('Distribución ideal 50/30/20')).toBeNull();
  });

  it('renders no on-wedge percent text nodes (label-less ring, D-07)', async () => {
    await render(<DistribucionPie tajadas={tajadas} />);
    expect(screen.queryByText('44%')).toBeNull();
    expect(screen.queryByText('28%')).toBeNull();
  });

  it('keeps accessibilityLabel="Distribución del gasto" (Maestro anchor)', async () => {
    await render(<DistribucionPie tajadas={tajadas} />);
    expect(screen.getByLabelText('Distribución del gasto')).toBeOnTheScreen();
  });

  // Fix 3 (MOB-08 D-01): donut slices are decorative SVG paths — no per-slice
  // press handler must be attached (the whole ring is inert; navigation lives
  // in LeyendaGasto rows, not in the chart).
  it('no pie-slice element carries an onPress handler (D-01: decorative only)', async () => {
    await render(<DistribucionPie tajadas={tajadas} />);
    const slices = screen.getAllByTestId('pie-slice');
    expect(slices.length).toBeGreaterThan(0);
    slices.forEach((slice) => {
      expect(slice.props.onPress).toBeUndefined();
    });
  });

  it('a single 100% bucket renders one donut path with two subpaths (360°+donut branch, D-01)', async () => {
    const unaTajada: readonly TajadaGasto[] = [
      { bucket: 'Necesidades', porcentaje: 100, fraccion: 1 },
    ];
    await render(<DistribucionPie tajadas={unaTajada} />);
    const slices = screen.getAllByTestId('pie-slice');
    expect(slices).toHaveLength(1);
    const d = slices[0].props.d as string;
    expect((d.match(/M /g) ?? []).length).toBe(2);
    expect((d.match(/Z/g) ?? []).length).toBe(2);
  });
});
