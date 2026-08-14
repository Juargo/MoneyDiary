import { useEffect, useState } from 'react';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { ConfiguracionPage } from '@/components/configuracion/ConfiguracionPage';
import type { Mensaje } from '@/components/configuracion/mensajes';
import { markSkipNextAuthRefetch } from '@/lib/skip-next-auth-refetch';

type ConfiguracionSearch = { readonly google?: 'vinculado' | 'error' };

/**
 * `AVISO_GOOGLE` — la mitad `?google=` de la tabla de copy cerrada de
 * WCFG-09/design.md §1/Q8b, indexada por el valor narrowed de
 * `validateSearch` (nunca render de contenido de la URL — solo SELECCIONA
 * una de estas dos constantes, mismo `sanitizeRedirect` discipline de abajo).
 */
const AVISO_GOOGLE: Record<'vinculado' | 'error', Mensaje> = {
  vinculado: { tono: 'ok', lineas: ['Vinculaste tu cuenta de Google.'] },
  error: {
    tono: 'error',
    lineas: ['No se pudo vincular tu cuenta de Google. Intenta nuevamente.'],
  },
};

/**
 * `/configuracion` — session-protected for free by nesting under the
 * pathless `_authenticated` layout (WCFG-01; zero new guard code, same
 * pattern as every other `_authenticated/*` route).
 *
 * `validateSearch` narrows `?google=` to the literal union `'vinculado' |
 * 'error'` (US-042 design.md §1/Q6a): any other value — a typo, a hostile
 * string, an array, an object — is dropped to `undefined`. This is the
 * `sanitizeRedirect` discipline `/login` already applies to `?redirect=`: the
 * URL SELECTS a client constant, it never supplies content that gets
 * rendered or interpolated.
 *
 * `component` is `ConfiguracionRoute` (PR #2, task 6.1) — a thin wrapper
 * that owns the `?google=` read/clean effect (design.md §1/Q6b) and hands
 * the resulting `avisoGoogle` state down to `ConfiguracionPage` as props,
 * per Q1a's tree (route: validateSearch + the read/clean effect, thin).
 */
export const Route = createFileRoute('/_authenticated/configuracion')({
  validateSearch: (search: Record<string, unknown>): ConfiguracionSearch => {
    const valor = search.google;
    return valor === 'vinculado' || valor === 'error' ? { google: valor } : {};
  },
  component: ConfiguracionRoute,
});

function ConfiguracionRoute() {
  const { google } = Route.useSearch();
  const router = useRouter();
  // Captured on the FIRST render, BEFORE the effect below strips the URL —
  // the message lives in state, not derived from the URL, and survives the
  // `replace: true` rewrite (design.md §1/Q6b). An unexpected value already
  // narrowed to `undefined` by `validateSearch` renders nothing here too.
  const [avisoGoogle, setAvisoGoogle] = useState<Mensaje | undefined>(
    google === undefined ? undefined : AVISO_GOOGLE[google],
  );

  useEffect(() => {
    if (google === undefined) {
      return;
    }
    // `router.history.replace(...)` rewrites the URL through TanStack
    // Router's own history wrapper, so `router.state.location`, the address
    // bar, and back/forward all stay coherent, and — same as `navigate()` —
    // it IS still a REPLACE history event, which TanStack Router's
    // `Transitioner` always turns into a fresh `router.load()` (there is no
    // public API that rewrites the URL without doing so: even a raw
    // `window.history.replaceState` call is intercepted the same way, since
    // the router monkey-patches it). That re-runs `_authenticated`'s
    // `beforeLoad` a second time for THIS landing — `markSkipNextAuthRefetch`
    // (`lib/skip-next-auth-refetch.ts`) arms a one-tick guard so THAT specific
    // re-run reads the identity `beforeLoad` already primed a moment ago
    // instead of paying for a second `/api/auth/me` (WCFG-03). Back never
    // returns to the parameterised URL — the message cannot reappear through
    // history (design.md §1/Q6b). Pinned by task 6.2's "exactly once" test.
    markSkipNextAuthRefetch();
    router.history.replace('/configuracion');
  }, [google, router]);

  return (
    <ConfiguracionPage
      avisoGoogle={avisoGoogle}
      onAvisoGoogleChange={setAvisoGoogle}
    />
  );
}
