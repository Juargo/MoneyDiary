import { Text, View } from 'react-native';

/**
 * Boot-only placeholder for the single route (Expo Router `app/index.tsx`).
 * The 4-state switch (loading/error/empty/data) and the Resumen fetch/screen
 * wiring are PR 3 scope (Track B feature) — this task only proves the app
 * boots and renders under the real Expo toolchain (T2.5, sprint3-mvp-mobile).
 */
export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-xl font-semibold">Resumen</Text>
    </View>
  );
}
