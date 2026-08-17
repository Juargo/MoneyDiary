import { ActivityIndicator, Text, View } from 'react-native';
import { COLORS } from '../../theme/colors';

/**
 * Loading state (MOB-03): shown while the resumen request is in flight.
 * Centered spinner + label — no bucket data, no error copy. `mensaje` is
 * optional (T5b.1, US-050) so a caller other than the route shell can ask
 * for a different label; the default keeps the pre-US-050 copy verbatim.
 */
export function Loading({
  mensaje = 'Cargando resumen…',
}: {
  readonly mensaje?: string;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-canvas">
      <ActivityIndicator testID="loading-spinner" color={COLORS.ingreso} />
      <Text className="text-base text-muted">{mensaje}</Text>
    </View>
  );
}
