import { Pressable, Text } from 'react-native';

/**
 * GoogleLoginButton — pure presentational `Pressable` (MOB-06, design §9.2).
 * No fetch, no SecureStore, no navigation — `app/login.tsx` owns the
 * orchestration and `LoginScreen` owns the fail-closed visibility gate
 * (mirrors `ResumenScreen`'s container/presentational split).
 *
 * Visually **secondary**: outlined/neutral, never the filled
 * `COLORS.ingreso` primary the password submit button uses — the accepted
 * product assumption (design §9.2).
 */
export function GoogleLoginButton({
  onPress,
  disabled,
}: {
  readonly onPress: () => void;
  readonly disabled: boolean;
}) {
  return (
    <Pressable
      testID="login-google"
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      className="items-center rounded-full border border-hairline py-3"
      style={{ opacity: disabled ? 0.6 : 1 }}
    >
      <Text className="font-semibold text-heading">Ingresar con Google</Text>
    </Pressable>
  );
}
