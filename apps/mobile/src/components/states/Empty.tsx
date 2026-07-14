import { Text, View } from 'react-native';

/**
 * Empty state (MOB-03): shown when `sinIngreso: true`. Explicit "no income
 * this period" copy, deliberately distinct from a bucket rendering "$0" or
 * "0%" — those describe a zero amount/percentage, not an absent income.
 */
export function Empty() {
  return (
    <View>
      <Text>Sin ingresos registrados este período</Text>
    </View>
  );
}
