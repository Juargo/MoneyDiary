import { View } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import type { TajadaGasto } from '../domain/distribucion-gasto';
import { calcularAngulos, arcoPath } from '../domain/pie-geometry';
import { COLOR_BUCKET, COLORS } from '../theme/colors';

/** Donut hole radius as a fraction of the outer radius (design §1.7). Kept in
 * sync by hand with `MiniDistribucionPie`'s copy — extract a shared constant
 * on a third occurrence (DRY 3-strikes). */
const RATIO_INTERIOR = 0.58;

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
 * "Distribución del gasto" chart: a label-less 4-wedge donut of the full
 * `BUCKETS_ANILLO` ring (Necesidades/Deseos/Ahorro/SinCategoria), with a
 * white wedge separator (WCAG 1.4.11). Pure presentation — all math is done
 * upstream (view-model + `pie-geometry`). When there is no spending, the
 * ring renders a muted placeholder ring instead of dividing by zero.
 *
 * US-050 PR4a rewrite (design §1.7, MOB-15): the IDEAL 50/30/20 reference
 * inset, `slicesIdeales`, the `targets` prop, `centroidLabel`, and the
 * on-wedge `%` labels are REMOVED — the ring is label-less by design (D-07),
 * percentages live only in the legend (`LeyendaGasto`, Phase 4b).
 */
export function DistribucionPie({
  tajadas,
  size = 240,
}: {
  readonly tajadas: readonly TajadaGasto[];
  readonly size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;
  const rInterior = r * RATIO_INTERIOR;

  return (
    <View className="items-center justify-center" style={{ height: size }}>
      <Svg
        width={size}
        height={size}
        accessibilityLabel="Distribución del gasto"
      >
        {tajadas.length === 0 ? (
          <Circle
            testID="pie-placeholder"
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
                testID="pie-slice"
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
                strokeWidth={2}
              />
            ));
          })()
        )}
      </Svg>
    </View>
  );
}
