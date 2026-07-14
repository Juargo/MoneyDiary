import { ActivityIndicator, Text, View } from 'react-native';

/**
 * Loading state (MOB-03): shown while the resumen request is in flight.
 * Renders only a spinner + label — no bucket data, no error copy.
 */
export function Loading() {
  return (
    <View>
      <ActivityIndicator testID="loading-spinner" />
      <Text>Cargando resumen…</Text>
    </View>
  );
}
