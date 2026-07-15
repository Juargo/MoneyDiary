import { Text, View } from 'react-native';

/**
 * Empty state (MOB-03): shown when `sinIngreso: true`. Explicit "no income
 * this period" copy, deliberately distinct from a bucket rendering "$0" or
 * "0%" — those describe a zero amount/percentage, not an absent income.
 */
export function Empty() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas px-8">
      <Text className="text-center text-base text-muted">
        Sin ingresos registrados este período
      </Text>
    </View>
  );
}
