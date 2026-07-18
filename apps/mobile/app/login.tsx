import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { postLogin } from '../src/api/client';
import { guardarToken } from '../src/api/session-store';
import { LoginScreen, type LoginEstado } from '../src/components/LoginScreen';
import { COLORS } from '../src/theme/colors';

/**
 * The mobile login route (Expo Router `app/login.tsx`, MOB-01). Thin
 * container mirroring `app/index.tsx`'s conventions: owns the
 * {idle|submitting|error} state via `useState` and delegates all rendering
 * to the pure `LoginScreen` presentational component.
 *
 * On success it persists the session token via `guardarToken` (SecureStore)
 * and navigates to `/` — it never surfaces or logs the token itself beyond
 * that single hand-off.
 */
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [estado, setEstado] = useState<LoginEstado>({ fase: 'idle' });

  const enviar = useCallback(async () => {
    setEstado({ fase: 'submitting' });
    const resultado = await postLogin(email, password);

    if (!resultado.ok) {
      setEstado({ fase: 'error' });
      return;
    }

    await guardarToken(resultado.value.token);
    router.replace('/');
  }, [email, password, router]);

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
