import { Pressable, Text, View } from 'react-native';

/**
 * Top app bar (mockup): menu affordance, current-period title, and a user
 * avatar. The menu + avatar are presentational stubs for this read-only MVP —
 * there is no drawer navigation or account screen yet (no US for them). The
 * hamburger is kept as an accessible button so wiring it later is a one-liner.
 */
export function Header({
  periodoLabel,
  iniciales = 'JD',
}: {
  periodoLabel: string;
  iniciales?: string;
}) {
  return (
    <View className="flex-row items-center justify-between px-5 py-3">
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir menú" hitSlop={8}>
        <Text className="text-2xl text-heading">☰</Text>
      </Pressable>

      <Text className="text-lg font-bold text-heading">{periodoLabel}</Text>

      <View
        accessibilityRole="image"
        accessibilityLabel="Perfil"
        className="h-9 w-9 items-center justify-center rounded-full bg-avatar"
      >
        <Text className="text-xs font-bold text-white">{iniciales}</Text>
      </View>
    </View>
  );
}
