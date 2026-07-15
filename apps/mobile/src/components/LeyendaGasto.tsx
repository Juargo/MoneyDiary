import { Text, View } from 'react-native';
import type { TajadaGasto } from '../domain/distribucion-gasto';
import { COLOR_BUCKET, ETIQUETA_BUCKET } from '../theme/colors';

/**
 * Pie legend: one row per spending bucket with its color dot, user-facing
 * label ("Gustos" for the domain's "Deseos"), and share-of-spending percent —
 * the SAME numbers as the pie slices. Purely presentational; the tajadas are
 * already computed by the view-model.
 */
export function LeyendaGasto({ tajadas }: { tajadas: ReadonlyArray<TajadaGasto> }) {
  return (
    <View className="flex-row flex-wrap justify-center gap-x-6 gap-y-2">
      {tajadas.map((tajada) => (
        <View key={tajada.bucket} className="flex-row items-center gap-2">
          <View
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: COLOR_BUCKET[tajada.bucket] ?? '#CCCCCC' }}
          />
          <Text className="text-[15px] text-heading">
            {ETIQUETA_BUCKET[tajada.bucket] ?? tajada.bucket}
          </Text>
          <Text className="text-[15px] font-semibold text-heading">{tajada.porcentaje}%</Text>
        </View>
      ))}
    </View>
  );
}
