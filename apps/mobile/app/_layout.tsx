import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '../global.css';

/**
 * Root layout required by Expo Router. Wraps the single route in
 * `SafeAreaProvider` (device notches/insets) and hides the stack header —
 * this app has one screen, no navigation chrome (B.1, sprint3-mvp-mobile).
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
