import { View, Text } from 'react-native';
import Svg, { Path, Circle, G, Text as SvgText } from 'react-native-svg';
import type { TajadaGasto } from '../domain/distribucion-gasto';
import type { ResumenMesDto } from '../domain/resumen.types';
import { calcularAngulos, arcoPath } from '../domain/pie-geometry';
import { COLOR_BUCKET, COLORS } from '../theme/colors';

const ORDEN_BUCKET = ['Necesidades', 'Deseos', 'Ahorro'] as const;

interface Slice {
  readonly color: string;
  readonly fraccion: number;
  readonly porcentaje: number;
}

function centroidLabel(cx: number, cy: number, r: number, inicio: number, fin: number) {
  const medio = ((inicio + fin) / 2) * (Math.PI / 180);
  return {
    x: cx + r * 0.62 * Math.sin(medio),
    y: cy - r * 0.62 * Math.cos(medio),
  };
}

function Pie({
  slices,
  size,
  showLabels = false,
}: {
  slices: ReadonlyArray<Slice>;
  size: number;
  showLabels?: boolean;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  if (slices.length === 0) {
    return <Circle cx={cx} cy={cy} r={r} fill={COLORS.hairline} />;
  }

  const tramos = calcularAngulos(slices.map((s) => s.fraccion));

  return (
    <>
      {slices.map((slice, i) => (
        <Path key={i} d={arcoPath(cx, cy, r, tramos[i].inicio, tramos[i].fin)} fill={slice.color} />
      ))}
      {showLabels &&
        slices.map((slice, i) => {
          if (slice.porcentaje < 5) {
            return null;
          }
          const { x, y } = centroidLabel(cx, cy, r, tramos[i].inicio, tramos[i].fin);
          return (
            <SvgText
              key={`l${i}`}
              x={x}
              y={y}
              fill="#FFFFFF"
              fontSize={size * 0.09}
              fontWeight="bold"
              textAnchor="middle"
              alignmentBaseline="middle"
            >
              {`${slice.porcentaje}%`}
            </SvgText>
          );
        })}
    </>
  );
}

function slicesDesdeTajadas(tajadas: ReadonlyArray<TajadaGasto>): Slice[] {
  return tajadas.map((t) => ({
    color: COLOR_BUCKET[t.bucket] ?? '#CCCCCC',
    fraccion: t.fraccion,
    porcentaje: t.porcentaje,
  }));
}

function slicesIdeales(targets: ResumenMesDto['targets']): Slice[] {
  const total = targets.Necesidades + targets.Deseos + targets.Ahorro;
  if (total <= 0) {
    return [];
  }
  const valores: Record<(typeof ORDEN_BUCKET)[number], number> = {
    Necesidades: targets.Necesidades,
    Deseos: targets.Deseos,
    Ahorro: targets.Ahorro,
  };
  return ORDEN_BUCKET.map((bucket) => ({
    color: COLOR_BUCKET[bucket],
    fraccion: valores[bucket] / total,
    porcentaje: Math.round((valores[bucket] / total) * 100),
  }));
}

/**
 * "Distribución del gasto" chart: a full pie of the three spending buckets
 * (share-of-spending, with on-slice percent labels) plus a small "IDEAL"
 * reference pie of the 50/30/20 targets. Pure presentation — all math is done
 * upstream (view-model + pie-geometry). When there is no spending, the pie
 * renders a muted placeholder ring instead of dividing by zero.
 */
export function DistribucionPie({
  tajadas,
  targets,
  size = 240,
}: {
  tajadas: ReadonlyArray<TajadaGasto>;
  targets: ResumenMesDto['targets'];
  size?: number;
}) {
  const idealSize = size * 0.34;

  return (
    <View className="items-center justify-center" style={{ height: size }}>
      <Svg width={size} height={size} accessibilityLabel="Distribución del gasto">
        <Pie slices={slicesDesdeTajadas(tajadas)} size={size} showLabels />
      </Svg>

      {/* IDEAL reference inset — bottom-right, matching the mockup. */}
      <View className="absolute bottom-0 right-1 items-center">
        <View
          className="items-center justify-center rounded-full border-2 border-white bg-white"
          style={{ padding: 3 }}
        >
          <Svg width={idealSize} height={idealSize} accessibilityLabel="Distribución ideal 50/30/20">
            <G>
              <Pie slices={slicesIdeales(targets)} size={idealSize} />
            </G>
          </Svg>
        </View>
        <Text className="mt-0.5 text-[10px] font-semibold tracking-wider text-muted">IDEAL</Text>
      </View>
    </View>
  );
}
