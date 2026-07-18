import { useEffect, useState } from 'react';
import { usePathname } from 'expo-router';
import { fetchResumen } from './client';
import { borrarToken, leerToken } from './session-store';

export type SessionGateEstado = 'checking' | 'authenticated' | 'unauthenticated';

/**
 * Root session gate (MOB-03, design.md §6.2). Mirrors mobile's analogue of
 * AUTH-10 (web's protected-route redirect): no/expired/revoked session →
 * `/login`.
 *
 * Validity is checked by calling `fetchResumen()` itself (not a dedicated
 * `/api/auth/me` round trip) — it's the same call the resumen screen needs
 * anyway, so this doubles as "is the stored token still accepted by the
 * server". Only an explicit `{tag:'unauthorized'}` clears the token; any
 * other failure (network, parse, other http status) is treated as
 * optimistically still-authenticated — a transient/server issue is not
 * proof the session itself is invalid, and the resumen screen's own
 * error/retry state handles that case.
 *
 * Re-runs on every navigation (`usePathname()` change) because this hook
 * lives once in the root layout (`app/_layout.tsx`, mounted once for the
 * whole app) — without a pathname-keyed re-check, a successful login
 * elsewhere (`app/login.tsx` storing a token then `router.replace('/')`)
 * would never be observed here, since the effect would otherwise only run
 * once at cold start.
 */
export function useSessionGate(): { estado: SessionGateEstado } {
  const pathname = usePathname();
  const [estado, setEstado] = useState<SessionGateEstado>('checking');

  useEffect(() => {
    let cancelado = false;

    void (async () => {
      const token = await leerToken();
      if (!token) {
        if (!cancelado) {
          setEstado('unauthenticated');
        }
        return;
      }

      const resultado = await fetchResumen();
      if (!resultado.ok && resultado.error.tag === 'unauthorized') {
        await borrarToken();
        if (!cancelado) {
          setEstado('unauthenticated');
        }
        return;
      }

      if (!cancelado) {
        setEstado('authenticated');
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [pathname]);

  return { estado };
}
