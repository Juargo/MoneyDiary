import {
  exchangeCodeAsync,
  makeRedirectUri,
  useAuthRequest,
  useAutoDiscovery,
} from 'expo-auth-session';
import { GOOGLE_CLIENT_ID_ANDROID } from './config';
import { conTimeout, NETWORK_LEG_TIMEOUT_MS } from './con-timeout';

/**
 * useGoogleIdToken — the ONLY file in the repo importing `expo-auth-session`
 * (design.md §2.1/§9.1, ADR-035 M1). Generic `useAuthRequest` against
 * Google's discovery document, `response_type=code` + PKCE S256, using the
 * *Android* OAuth client ID — the code is exchanged on-device via
 * `exchangeCodeAsync` so the minted `id_token`'s `aud` is the Android client
 * ID (never a web client, never the ambiguity the `expo-auth-session/providers/google`
 * helper would introduce — design §2.2).
 *
 * Redirect scheme: reversed-client-id (`com.googleusercontent.apps.<id>`),
 * derived from `GOOGLE_CLIENT_ID_ANDROID` so the two values can never drift.
 * The package-name scheme (`cl.moneydiary.app`) the design bet on first was
 * rejected on-device by Google (`Error 400: invalid_request`, gate C2.8,
 * 2026-08-09) — this is the design's pre-approved contingency (design §2.4).
 * The static counterpart lives in `app.json`'s scheme array (build-time
 * intent filter) and must contain the literal reversed scheme.
 *
 * `useAuthRequest` is a hook and cannot be called conditionally, so an
 * absent `GOOGLE_CLIENT_ID_ANDROID` is handled by passing `''` and
 * reporting `listo: false` (MOB-06's fail-closed gate reads this flag).
 * Every failure path collapses to `null` — nothing here ever throws.
 *
 * `exchangeCodeAsync` is bounded by `conTimeout`/`NETWORK_LEG_TIMEOUT_MS`
 * (design.md §9.4) so a hung token endpoint cannot lock the login screen
 * forever — a timeout falls into the same catch block as any other
 * exchange failure and resolves `null`. `promptAsync` above is deliberately
 * left unbounded: it is user-driven (Custom Tab, a legitimate 2FA prompt
 * can take minutes) and browser dismissal already resolves it.
 */
export interface UseGoogleIdToken {
  readonly listo: boolean;
  readonly obtenerIdToken: () => Promise<string | null>;
}

/** `NNN-xxx.apps.googleusercontent.com` → `com.googleusercontent.apps.NNN-xxx`. */
function esquemaReversedClientId(clientId: string): string {
  return `com.googleusercontent.apps.${clientId.replace(/\.apps\.googleusercontent\.com$/, '')}`;
}

export function useGoogleIdToken(): UseGoogleIdToken {
  const discovery = useAutoDiscovery('https://accounts.google.com');
  const redirectUri = makeRedirectUri({
    scheme: esquemaReversedClientId(GOOGLE_CLIENT_ID_ANDROID ?? ''),
    path: 'oauthredirect',
  });
  const [request, , promptAsync] = useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID_ANDROID ?? '',
      scopes: ['openid', 'email', 'profile'],
      redirectUri,
      responseType: 'code',
      usePKCE: true,
    },
    discovery,
  );

  const obtenerIdToken = async (): Promise<string | null> => {
    if (!request) {
      return null;
    }

    let promptResult: Awaited<ReturnType<typeof promptAsync>>;
    try {
      promptResult = await promptAsync();
    } catch {
      return null;
    }

    if (promptResult.type !== 'success') {
      return null;
    }

    const code = promptResult.params?.code;
    if (!code) {
      return null;
    }

    try {
      const tokenResponse = await conTimeout(
        exchangeCodeAsync(
          {
            clientId: GOOGLE_CLIENT_ID_ANDROID ?? '',
            code,
            redirectUri,
            extraParams: request.codeVerifier
              ? { code_verifier: request.codeVerifier }
              : undefined,
          },
          discovery ?? {},
        ),
        NETWORK_LEG_TIMEOUT_MS,
      );
      return tokenResponse.idToken ?? null;
    } catch {
      return null;
    }
  };

  return { listo: request !== null, obtenerIdToken };
}
