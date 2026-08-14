import { useEffect, useState } from 'react';
import { createFileRoute, useRouter, useSearch } from '@tanstack/react-router';
import { PerfilPanel } from '@/components/configuracion/perfil/PerfilPanel';
import type { Mensaje } from '@/components/configuracion/perfil/mensajes';
import { markSkipNextAuthRefetch } from '@/lib/skip-next-auth-refetch';

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
 * `/configuracion` (index leaf) — Perfil's landing (US-043 design.md
 * §1/Q1c). This leaf now owns the `?google=` read/clean effect that used to
 * live directly on `configuracion.tsx`: `validateSearch` STAYS on the
 * parent layout route (the shipped WCFG-05 scenarios target that exact
 * route id), but the `useState` capture, cleanup effect, and
 * `markSkipNextAuthRefetch()` describe PERFIL's landing, not the section
 * shell, so they moved here verbatim.
 *
 * Reads the search param via `useSearch({ from:
 * '/_authenticated/configuracion' })` — an explicit `from`, so nothing here
 * depends on search-param inheritance typing from this leaf's own (empty)
 * `validateSearch`.
 */
export const Route = createFileRoute('/_authenticated/configuracion/')({
  component: PerfilRoute,
});

function PerfilRoute() {
  const { google } = useSearch({ from: '/_authenticated/configuracion' });
  const router = useRouter();
  // Captured on the FIRST render, BEFORE the effect below strips the URL —
  // the message lives in state, not derived from the URL, and survives the
  // `replace: true` rewrite (design.md §1/Q1c, carried over from US-042's
  // §1/Q6b). An unexpected value already narrowed to `undefined` by the
  // layout route's `validateSearch` renders nothing here too.
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
    // history (design.md §1/Q1c).
    markSkipNextAuthRefetch();
    router.history.replace('/configuracion');
  }, [google, router]);

  return (
    <PerfilPanel
      avisoGoogle={avisoGoogle}
      onAvisoGoogleChange={setAvisoGoogle}
    />
  );
}
