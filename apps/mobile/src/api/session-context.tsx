import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchMe } from './client';
import { borrarToken, leerToken } from './session-store';

export type SessionGateEstado = 'checking' | 'authenticated' | 'unauthenticated';

export interface SessionContextValue {
  readonly estado: SessionGateEstado;
  readonly signIn: (token: string) => void;
  readonly signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

/**
 * Synchronous session/auth context (MOB-03) — the official Expo Router
 * auth-gating pattern (`Stack.Protected` + a context whose guard flips via a
 * plain `setState`), and the root-cause fix for the Slice 4 review's
 * login/logout deadlock finding.
 *
 * The PREVIOUS implementation (`use-session-gate.ts`, deleted by this fix)
 * derived `estado` from an async `fetchResumen()` call keyed on
 * `usePathname()`. On login, `app/login.tsx` stored the token and called
 * `router.replace('/')` while `estado` was still `'unauthenticated'` —
 * `Stack.Protected` blocked the navigation (guard still false), so the URL
 * never actually changed, `usePathname()` never fired, the gate's effect
 * never re-ran, and the user was stranded on `/login` despite holding a
 * valid token (logout mirrored the same deadlock in reverse).
 *
 * This fix removes the external re-trigger entirely: `signIn`/`signOut` are
 * synchronous `setState` calls that flip `estado` directly, so
 * `Stack.Protected` re-renders on the SAME render pass that calls them —
 * no pathname, no re-fetch, no dependency on navigation having already
 * happened.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<SessionGateEstado>('checking');

  useEffect(() => {
    let cancelado = false;

    // Cold-start check ONLY — runs once on mount. `signIn`/`signOut` are the
    // sole source of truth for every subsequent `estado` change.
    void (async () => {
      const token = await leerToken();
      if (!token) {
        if (!cancelado) {
          setEstado('unauthenticated');
        }
        return;
      }

      // Validate the stored token via the dedicated `/api/auth/me` round
      // trip (not `fetchResumen`) — keeps the auth gate decoupled from the
      // resumen screen's own data fetch, avoiding a duplicate
      // `/api/resumen` call on every cold start with a stored token.
      const resultado = await fetchMe();
      if (!resultado.ok && resultado.error.tag === 'unauthorized') {
        await borrarToken();
        if (!cancelado) {
          setEstado('unauthenticated');
        }
        return;
      }

      // Any other failure (network/parse/http) is optimistically treated as
      // still-authenticated — a transient blip is not proof the session
      // itself is invalid; the resumen screen's own error/retry UI handles
      // that case.
      if (!cancelado) {
        setEstado('authenticated');
      }
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  const signIn = useCallback((_token: string) => {
    // Token persistence is the CALLER's responsibility (`app/login.tsx`
    // calls `guardarToken` before this) — this context only owns the guard
    // boolean `Stack.Protected` reacts to.
    setEstado('authenticated');
  }, []);

  const signOut = useCallback(() => {
    setEstado('unauthenticated');
  }, []);

  return (
    <SessionContext.Provider value={{ estado, signIn, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
