import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { postLogout } from '@/api/auth';

/**
 * useCerrarSesion — design-hardening fix (P0, "no logout"). Before this,
 * `postLogout` (`api/auth.ts`) was called from exactly one place:
 * `DemoBanner`'s "Salir del demo", demo-only. A real user had no in-app way
 * to end their session. Extracted here so `DemoBanner` and the two new
 * real-user entry points (sidebar footer, Perfil panel) share ONE logout
 * semantic instead of three copies (DRY) — same rationale `DemoBanner`
 * documented for its own exit:
 *
 * `postLogout()` runs and its result is DISCARDED — a network/500 failure
 * must not trap the user in a session they asked to leave. The query cache
 * is cleared BEFORE navigating (identity-switch rationale: a subsequent
 * login, real or demo, must never read a stale identity's cached data),
 * then the app navigates to `/login`. No confirmation dialog — logout is
 * fully recoverable, zero friction (unlike the destructive-action confirms
 * `InlineConfirm` guards).
 *
 * `cerrando` flips to `true` synchronously when `cerrarSesion` is invoked
 * (house in-flight-button pattern, e.g. `PerfilForm`'s "Guardando…") and is
 * never reset: by the time `postLogout`/clear/navigate settle, the caller
 * has already navigated to `/login` and the whole authenticated subtree
 * (sidebar, Perfil panel) unmounts with it — there is no "done" state to
 * return to.
 */
export function useCerrarSesion(): {
  readonly cerrarSesion: () => Promise<void>;
  readonly cerrando: boolean;
} {
  const [cerrando, setCerrando] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function cerrarSesion() {
    setCerrando(true);
    await postLogout();
    queryClient.clear();
    void navigate({ to: '/login' });
  }

  return { cerrarSesion, cerrando };
}
