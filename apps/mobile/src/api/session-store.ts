import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';

/**
 * Wraps `expo-secure-store` for the mobile session token (MOB-01, design.md
 * §6.2). SecureStore persists to the iOS Keychain / Android Keystore, which
 * is the closest RN analogue to a web HttpOnly cookie — survives app
 * kill+relaunch, not readable by other apps.
 */
export const KEY = 'md_session_token';

/** Persists the session token returned by `POST /api/auth/login`. */
export async function guardarToken(token: string): Promise<void> {
  await setItemAsync(KEY, token);
}

/** Reads the stored token, or `null` when none is stored. */
export async function leerToken(): Promise<string | null> {
  return getItemAsync(KEY);
}

/**
 * Clears the stored token. Never throws across the boundary (mirrors the
 * backend's Result-never-throws discipline) — logout must always be able
 * to drop the local token even if the keychain operation itself fails.
 *
 * SEC MEDIUM fix: a rejected (or silently no-op) `deleteItemAsync` must not
 * let logout look like it succeeded while a valid token remains on the
 * device. Verifies the delete by re-reading the key; if the token is still
 * present, retries once. If it STILL persists after the retry, surfaces
 * that via `console.warn` (observable, but still never throws — callers
 * always get a resolved `Promise<void>`).
 */
export async function borrarToken(): Promise<void> {
  await intentarBorrarUnaVez();

  if ((await leerToken()) === null) {
    return;
  }

  await intentarBorrarUnaVez();

  if ((await leerToken()) !== null) {
    console.warn(
      '[session-store] borrarToken: el token persiste tras reintentar el borrado — el keychain pudo haber fallado',
    );
  }
}

async function intentarBorrarUnaVez(): Promise<void> {
  try {
    await deleteItemAsync(KEY);
  } catch {
    // Intentionally swallowed — clearing local state must never throw.
    // The caller verifies success via re-read instead of trusting this.
  }
}
