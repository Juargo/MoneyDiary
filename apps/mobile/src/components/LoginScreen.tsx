import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { COLORS } from '../theme/colors';

/**
 * Login screen state — mirrors `app/index.tsx`'s {loading|error|data}
 * switch discipline (design.md §6.2, MOB-01): `idle`/`submitting` gate the
 * submit affordance, `error` carries a generic (never-enumerate) message.
 */
export type LoginEstado = { fase: 'idle' } | { fase: 'submitting' } | { fase: 'error' };

const MENSAJE_ERROR_GENERICO =
  'No pudimos iniciar sesión. Verifica tus datos e intenta de nuevo.';

/**
 * Pure presentation (container/presentational split, mirrors
 * `ResumenScreen`): no fetch, no SecureStore, no navigation — just the form
 * and the current state.
 */
export function LoginScreen({
  email,
  password,
  estado,
  onChangeEmail,
  onChangePassword,
  onSubmit,
}: {
  readonly email: string;
  readonly password: string;
  readonly estado: LoginEstado;
  readonly onChangeEmail: (value: string) => void;
  readonly onChangePassword: (value: string) => void;
  readonly onSubmit: () => void;
}) {
  const enviando = estado.fase === 'submitting';
  // View-only state (presentational concern): toggles the password mask so
  // the user can confirm what they typed. No business logic, no side effects.
  const [mostrarPassword, setMostrarPassword] = useState(false);

  return (
    <View className="flex-1 justify-center gap-6 bg-canvas px-8">
      <Text className="text-center text-2xl font-bold text-heading">MoneyDiary</Text>

      <View className="gap-4">
        <TextInput
          testID="login-email"
          accessibilityLabel="Correo electrónico"
          placeholder="Correo electrónico"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={onChangeEmail}
          editable={!enviando}
          className="rounded-xl border border-hairline bg-white px-4 py-3 text-heading"
        />
        <View className="flex-row items-center rounded-xl border border-hairline bg-white pr-2">
          <TextInput
            testID="login-password"
            accessibilityLabel="Contraseña"
            placeholder="Contraseña"
            secureTextEntry={!mostrarPassword}
            value={password}
            onChangeText={onChangePassword}
            editable={!enviando}
            className="flex-1 px-4 py-3 text-heading"
          />
          <Pressable
            testID="login-password-toggle"
            accessibilityRole="button"
            accessibilityLabel={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            onPress={() => setMostrarPassword((visible) => !visible)}
            hitSlop={8}
            className="px-2 py-2"
          >
            <Text className="text-lg">{mostrarPassword ? '🙈' : '👁'}</Text>
          </Pressable>
        </View>
      </View>

      {estado.fase === 'error' && (
        <Text className="text-center text-sm text-red-600">{MENSAJE_ERROR_GENERICO}</Text>
      )}

      <Pressable
        testID="login-submit"
        accessibilityRole="button"
        onPress={onSubmit}
        disabled={enviando}
        className="items-center rounded-full py-3"
        style={{ backgroundColor: COLORS.ingreso, opacity: enviando ? 0.6 : 1 }}
      >
        <Text className="font-semibold text-white">
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </Text>
      </Pressable>
    </View>
  );
}
