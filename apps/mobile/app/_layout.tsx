import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSessionGate } from '../src/api/use-session-gate';
import { Loading } from '../src/components/states/Loading';

import '../global.css';

/**
 * Root layout required by Expo Router. Wraps every route in
 * `SafeAreaProvider` (device notches/insets), hides the stack header (B.1,
 * sprint3-mvp-mobile), and gates navigation on `useSessionGate` (MOB-03):
 * `checking` shows a loading state (reusing the resumen screen's `Loading`
 * — same spinner, no bucket data either way); `Stack.Protected` then shows
 * either the resumen screen (`authenticated`) or the login screen
 * (`unauthenticated`), auto-redirecting when the guard flips (the official
 * Expo Router pattern for auth-gated stacks — no manual `<Redirect>` needed
 * here since both screens stay registered and the guard decides which one
 * is reachable).
 */
export default function RootLayout() {
  const { estado } = useSessionGate();

  if (estado === 'checking') {
    return (
      <SafeAreaProvider>
        <Loading />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={estado === 'authenticated'}>
          <Stack.Screen name="index" />
        </Stack.Protected>
        <Stack.Protected guard={estado === 'unauthenticated'}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </SafeAreaProvider>
  );
}
