import { View } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import type { TajadaGasto } from '../domain/distribucion-gasto';
import { calcularAngulos, arcoPath } from '../domain/pie-geometry';
import { COLOR_BUCKET, COLORS } from '../theme/colors';

/** Donut hole radius as a fraction of the outer radius — same constant as
 * `DistribucionPie` (kept in sync by hand; extract shared on a 3rd copy). */
const RATIO_INTERIOR = 0.58;

/** Fixed mini size (design §1.7) — every annual-grid cell renders the same size. */
const SIZE = 44;

interface Slice {
  readonly color: string;
  readonly fraccion: number;
}

function slicesDesdeTajadas(tajadas: readonly TajadaGasto[]): Slice[] {
  return tajadas.map((t) => ({
    color: COLOR_BUCKET[t.bucket] ?? '#CCCCCC',
    fraccion: t.fraccion,
  }));
}

/**
 * `MiniDistribucionPie` — the 44px donut that sits inside each annual-grid
 * cell (US-050 PR5a, design §1.7). Port of MOBILE's own `DistribucionPie`
 * (NOT web's mini, which is a solid pie): the ring shape is a deliberate
 * divergence so the grid minis match the main chart's donut family.
 * Fixed-size and label-less: no `accessibilityLabel`, no on-wedge text. Carries NO
 * accessibility props of its own — the parent `Pressable` (`MesCelda`,
 * `ResumenAnual.tsx`) is `accessible`, which collapses this whole subtree
 * into a single AT node, so a second accessible child here would be dead
 * weight at best and a duplicate AT stop at worst.
 */
export function MiniDistribucionPie({
  tajadas,
}: {
  readonly tajadas: readonly TajadaGasto[];
}) {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = SIZE / 2;
  const rInterior = r * RATIO_INTERIOR;

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <Svg width={SIZE} height={SIZE}>
        {tajadas.length === 0 ? (
          <Circle
            testID="mini-pie-placeholder"
            cx={cx}
            cy={cy}
            r={r}
            fill={COLORS.hairline}
          />
        ) : (
          (() => {
            const slices = slicesDesdeTajadas(tajadas);
            const tramos = calcularAngulos(slices.map((s) => s.fraccion));
            return slices.map((slice, i) => (
              <Path
                key={i}
                testID="mini-pie-slice"
                d={arcoPath(
                  cx,
                  cy,
                  r,
                  tramos[i].inicio,
                  tramos[i].fin,
                  rInterior,
                )}
                fill={slice.color}
                stroke="#FFFFFF"
                strokeWidth={1}
              />
            ));
          })()
        )}
      </Svg>
    </View>
  );
}
