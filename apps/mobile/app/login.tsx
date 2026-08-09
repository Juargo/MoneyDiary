import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  fetchAuthCapabilities,
  postGoogleIdToken,
  postLogin,
} from '../src/api/client';
import { GOOGLE_CLIENT_ID_ANDROID } from '../src/api/config';
import { guardarToken } from '../src/api/session-store';
import { useSession } from '../src/api/session-context';
import { useGoogleIdToken } from '../src/api/use-google-id-token';
import { LoginScreen, type LoginEstado } from '../src/components/LoginScreen';
import { COLORS } from '../src/theme/colors';

/**
 * The mobile login route (Expo Router `app/login.tsx`, MOB-01/MOB-06). Thin
 * container mirroring `app/index.tsx`'s conventions: owns the
 * {idle|submitting|error} state via `useState` and delegates all rendering
 * to the pure `LoginScreen` presentational component. `LoginEstado` is NOT
 * extended for Google — one state machine, one generic message, shared by
 * both sign-in flows (locked decision, design §9.2).
 *
 * On success it persists the session token via `guardarToken` (SecureStore)
 * then calls `useSession().signIn` — a synchronous `setState` that flips the
 * root gate (`app/_layout.tsx`) to `authenticated`. Navigation itself is
 * `Stack.Protected`'s job (MOB-03 fix); this screen never calls
 * `router.replace` directly.
 *
 * Google button visibility (MOB-06, design §9.3): fail-closed, fetched once
 * on mount, no retry. THREE independent conditions must all hold —
 * `googleLoginMobileEnabled`, a configured `GOOGLE_CLIENT_ID_ANDROID`, and a
 * ready native auth request. Any failure of the capabilities call keeps the
 * flag at its default `false`; the button simply never appears (no error
 * surfaced for a hidden affordance).
 */
export default function Login() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [estado, setEstado] = useState<LoginEstado>({ fase: 'idle' });
  const [googleHabilitado, setGoogleHabilitado] = useState(false);
  const { listo: googleListo, obtenerIdToken } = useGoogleIdToken();

  useEffect(() => {
    let cancelado = false;

    // Mount-time only, no retry (design §9.3) — NOT in `SessionProvider`
    // (SRP: that context owns the session gate, not feature discovery).
    void (async () => {
      const resultado = await fetchAuthCapabilities();
      if (!cancelado && resultado.ok) {
        setGoogleHabilitado(resultado.value.googleLoginMobileEnabled);
      }
      // Any failure keeps the default `false` — fail-closed, no error shown.
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  const mostrarGoogle =
    googleHabilitado && GOOGLE_CLIENT_ID_ANDROID !== undefined && googleListo;

  const enviar = useCallback(async () => {
    // Double-tap guard: `disabled={enviando}` on the submit button lags a
    // frame behind this handler's own state update, so a fast double-press
    // can still fire before the first render commits. Guard explicitly.
    // Shared with `ingresarConGoogle` below — a password submit while a
    // Google exchange is in flight (or vice versa) is also blocked.
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

  const ingresarConGoogle = useCallback(async () => {
    // Same guard as `enviar` (design §9.2, review carry-over): two Custom
    // Tab sessions must be impossible.
    if (estado.fase === 'submitting') {
      return;
    }

    setEstado({ fase: 'submitting' });
    const idToken = await obtenerIdToken();

    if (!idToken) {
      // Cancel, dismiss, error, or a missing idToken all collapse here —
      // the SAME generic message as a bad password (locked decision).
      setEstado({ fase: 'error' });
      return;
    }

    const resultado = await postGoogleIdToken(idToken);

    if (!resultado.ok) {
      setEstado({ fase: 'error' });
      return;
    }

    await guardarToken(resultado.value.token);
    signIn(resultado.value.token);
  }, [estado.fase, obtenerIdToken, signIn]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.canvas }}>
      <LoginScreen
        email={email}
        password={password}
        estado={estado}
        onChangeEmail={setEmail}
        onChangePassword={setPassword}
        onSubmit={() => void enviar()}
        mostrarGoogle={mostrarGoogle}
        onGoogleSubmit={() => void ingresarConGoogle()}
      />
    </SafeAreaView>
  );
}
