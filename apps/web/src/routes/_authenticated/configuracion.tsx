import { useEffect, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ConfiguracionPage } from '@/components/configuracion/ConfiguracionPage';
import type { Mensaje } from '@/components/configuracion/mensajes';

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
  const navigate = useNavigate();
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
    // `replace: true` so Back never returns to the parameterised URL — the
    // message cannot reappear through history (design.md §1/Q6b). No
    // `['auth-me']` invalidation here: the callback that produced this
    // param is a full document load, so `beforeLoad` already primed the
    // POST-link identity (Q6c) — pinned by task 6.2's "exactly once" test.
    void navigate({ to: '/configuracion', search: {}, replace: true });
  }, [google, navigate]);

  return (
    <ConfiguracionPage
      avisoGoogle={avisoGoogle}
      onAvisoGoogleChange={setAvisoGoogle}
    />
  );
}
