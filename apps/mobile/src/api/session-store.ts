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
 */
export async function borrarToken(): Promise<void> {
  try {
    await deleteItemAsync(KEY);
  } catch {
    // Intentionally swallowed — clearing local state must never throw.
  }
}
