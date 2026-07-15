import { ActivityIndicator, Text, View } from 'react-native';
import { COLORS } from '../../theme/colors';

/**
 * Loading state (MOB-03): shown while the resumen request is in flight.
 * Centered spinner + label — no bucket data, no error copy.
 */
export function Loading() {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-canvas">
      <ActivityIndicator testID="loading-spinner" color={COLORS.ingreso} />
      <Text className="text-base text-muted">Cargando resumen…</Text>
    </View>
  );
}
