/**
 * conTimeout — races `promise` against a timer that rejects after `ms`
 * milliseconds. Every caller of this helper (`client.ts`,
 * `use-google-id-token.ts`) already wraps its network leg in a try/catch
 * that maps ANY rejection to the same typed failure (an `ApiError` tag or
 * `null`), so a timeout composes with that existing handling for free
 * instead of introducing a second, sentinel-based failure shape (KISS,
 * design.md §9.4).
 *
 * Bounds only network legs that can hang indefinitely with no native
 * cancellation (`fetch`, `exchangeCodeAsync`) — never the user-driven
 * `promptAsync` leg, which is deliberately left unbounded.
 */
export function conTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const temporizador = setTimeout(() => {
      reject(new Error(`Tiempo de espera agotado (${ms}ms)`));
    }, ms);

    promise.then(
      (valor) => {
        clearTimeout(temporizador);
        resolve(valor);
      },
      (error: unknown) => {
        clearTimeout(temporizador);
        reject(error);
      },
    );
  });
}

/**
 * NETWORK_LEG_TIMEOUT_MS — upper bound for the Google sign-in flow's bounded
 * network legs (id-token exchange, backend POST, capabilities GET). Mirrors
 * the backend's `ID_TOKEN_HTTP_TIMEOUT_MS` convention
 * (`apps/api/src/infrastructure/oidc/google-id-token.adapter.ts`, 10s for a
 * server-to-Google call); 20s here leaves headroom for a slower mobile
 * network while still guaranteeing the login screen can never hang forever
 * (design.md §9.4). Deliberately NOT applied to `promptAsync` — that leg is
 * user-driven (Custom Tab; a legitimate 2FA prompt can take minutes) and
 * browser dismissal already resolves it.
 */
export const NETWORK_LEG_TIMEOUT_MS = 20_000;
