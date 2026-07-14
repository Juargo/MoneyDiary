import { ScrollView, Text, View } from 'react-native';
import { BucketRow } from './BucketRow';
import { SemaforoBadge } from './SemaforoBadge';
import type { ResumenViewModel } from '../domain/resumen-view-model';

/**
 * Data-state composition (MOB-03/MOB-04): renders the resolved
 * `ResumenViewModel` — income, the 4 bucket rows, and the global semáforo.
 * Pure presentation: it consumes already-formatted strings from the
 * view-model (no fetch, no env, no money math here). The `testID`s and the
 * "Distribución 50/30/20" heading are the Maestro anchors (design.md B.5).
 */
export function ResumenScreen({
  viewModel,
}: {
  readonly viewModel: ResumenViewModel;
}) {
  return (
    <ScrollView>
      <Text>Distribución 50/30/20</Text>
      <Text>{viewModel.totalIngreso}</Text>

      {viewModel.buckets.map((bucket) => (
        <BucketRow
          key={bucket.bucket}
          bucket={bucket.bucket}
          total={bucket.total}
          porcentajeLabel={bucket.porcentajeLabel}
          estadoSemaforo={bucket.estadoSemaforo}
        />
      ))}

      <View testID="semaforo-global">
        <SemaforoBadge estadoSemaforo={viewModel.estadoGlobal} />
      </View>
    </ScrollView>
  );
}
