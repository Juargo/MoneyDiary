import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../src/api/session-context';
import { Loading } from '../src/components/states/Loading';

import '../global.css';

/**
 * Root layout required by Expo Router. Wraps every route in
 * `SafeAreaProvider` (device notches/insets) and `SessionProvider` (MOB-03 —
 * the synchronous auth-context gate, see `src/api/session-context.tsx` for
 * why this replaced the pathname-keyed `useSessionGate` hook).
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

/**
 * `checking` shows a loading state (reusing the resumen screen's `Loading`
 * — same spinner, no bucket data either way); `Stack.Protected` then shows
 * either the resumen screen (`authenticated`) or the login screen
 * (`unauthenticated`), auto-redirecting whenever `estado` flips — the
 * official Expo Router pattern for auth-gated stacks. No manual
 * `router.replace` is needed anywhere: `Stack.Protected` reacts to the
 * SAME render pass that calls `signIn`/`signOut` in `session-context.tsx`.
 */
function RootNavigator() {
  const { estado } = useSession();

  if (estado === 'checking') {
    return <Loading />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={estado === 'authenticated'}>
        <Stack.Screen name="index" />
        <Stack.Screen name="subir" />
      </Stack.Protected>
      <Stack.Protected guard={estado === 'unauthenticated'}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}
