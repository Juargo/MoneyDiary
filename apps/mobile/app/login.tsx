import { useCallback, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { postLogin } from '../src/api/client';
import { guardarToken } from '../src/api/session-store';
import { useSession } from '../src/api/session-context';
import { LoginScreen, type LoginEstado } from '../src/components/LoginScreen';
import { COLORS } from '../src/theme/colors';

/**
 * The mobile login route (Expo Router `app/login.tsx`, MOB-01). Thin
 * container mirroring `app/index.tsx`'s conventions: owns the
 * {idle|submitting|error} state via `useState` and delegates all rendering
 * to the pure `LoginScreen` presentational component.
 *
 * On success it persists the session token via `guardarToken` (SecureStore)
 * then calls `useSession().signIn` — a synchronous `setState` that flips the
 * root gate (`app/_layout.tsx`) to `authenticated`. Navigation itself is
 * `Stack.Protected`'s job (MOB-03 fix); this screen never calls
 * `router.replace` directly.
 */
export default function Login() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [estado, setEstado] = useState<LoginEstado>({ fase: 'idle' });

  const enviar = useCallback(async () => {
    // Double-tap guard: `disabled={enviando}` on the submit button lags a
    // frame behind this handler's own state update, so a fast double-press
    // can still fire before the first render commits. Guard explicitly.
    if (estado.fase === 'submitting') {
      return;
    }

    setEstado({ fase: 'submitting' });
    const resultado = await postLogin(email, password);

    if (!resultado.ok) {
      setEstado({ fase: 'error' });
      return;
    }

    await guardarToken(resultado.value.token);
    signIn(resultado.value.token);
  }, [email, password, estado.fase, signIn]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.canvas }}>
      <LoginScreen
        email={email}
        password={password}
        estado={estado}
        onChangeEmail={setEmail}
        onChangePassword={setPassword}
        onSubmit={() => void enviar()}
      />
    </SafeAreaView>
  );
}
