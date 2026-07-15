import { Text, View } from 'react-native';

/**
 * "INGRESOS" hero card (mockup): a small uppercase label over the month's
 * total income, rendered large. `totalIngreso` arrives already formatted as
 * CLP from the view-model (BigInt-string-safe — never reformatted here). The
 * left accent bar echoes the mockup's card treatment.
 */
export function IngresoCard({ totalIngreso }: { totalIngreso: string }) {
  return (
    <View className="flex-row overflow-hidden rounded-2xl border border-hairline bg-white">
      <View className="w-1.5 bg-ingreso" />
      <View className="flex-1 items-center py-6">
        <Text className="text-xs font-semibold tracking-widest text-muted">INGRESOS</Text>
        <Text className="mt-1 text-4xl font-extrabold text-ingreso">{totalIngreso}</Text>
      </View>
    </View>
  );
}
