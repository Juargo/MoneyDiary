import { Text, View } from 'react-native';
import { SemaforoBadge } from './SemaforoBadge';

/**
 * Renders a single bucket row: label, already-formatted CLP total, the
 * percentage label resolved upstream by the view-model (never recomputed
 * here — MOB-06's null-vs-0% distinction lives in resumen-view-model.ts,
 * not in this component), and the per-bucket semáforo indicator.
 * Props in / JSX out — no fetch, no env, no money math.
 */
export function BucketRow({
  bucket,
  total,
  porcentajeLabel,
  estadoSemaforo,
}: {
  readonly bucket: string;
  readonly total: string;
  readonly porcentajeLabel: string;
  readonly estadoSemaforo: string | null;
}) {
  return (
    <View>
      <Text>{bucket}</Text>
      <Text>{total}</Text>
      <Text>{porcentajeLabel}</Text>
      <SemaforoBadge estadoSemaforo={estadoSemaforo} />
    </View>
  );
}
