import { LogOut } from 'lucide-react';
import { useMe } from '@/api/use-me';
import { useCerrarSesion } from '@/lib/use-cerrar-sesion';
import { Button } from '@/components/ui/button';
import { SeccionConfig } from '../SeccionConfig';
import { PerfilForm } from './PerfilForm';
import { GoogleVinculoSection } from './GoogleVinculoSection';
import type { Mensaje } from './mensajes';

/**
 * PerfilPanel — rename+edit of the pre-split `ConfiguracionPage` (US-043
 * design.md §1/Q1d, D-09's correction: NOT a pure rename). It renders inside
 * `ConfiguracionLayout`'s content track now, so it no longer owns the
 * `Configuración` h1, the fluid grid, or `ConfiguracionTabs` — those moved
 * to `ConfiguracionLayout`. What genuinely belongs to Perfil stays: the
 * `Editar perfil` sub-heading (now an `h2` — the page has exactly one `h1`,
 * owned by the layout, per the Q1d heading table), `PerfilForm`,
 * `GoogleVinculoSection`, and the two Google-aviso regions.
 *
 * `avisoGoogle`/`onAvisoGoogleChange` still arrive by PROPS — the state
 * itself (the `?google=` capture, the URL-cleanup effect) now lives in
 * `routes/_authenticated/configuracion.index.tsx` (design.md §1/Q1c, moved
 * out of the layout route in task 7); this panel only renders the value and
 * forwards the setter to `GoogleVinculoSection` for the same two
 * coordinations US-042 established (Q1b/Q6b): `onAbrirDialogo` clears the
 * aviso when a Google dialog opens (so a stale "Vinculaste tu cuenta" never
 * sits next to a fresh failure), and `onDesvinculado` fills it with the
 * unlink success message.
 *
 * Two regions, not one (`PerfilForm`'s Q7d idiom): `aviso-google`
 * (`aria-live="polite"`, ok tone) and `aviso-google-error` (`role="alert"`,
 * error tone) — `?google=error` needs alert tone, so one polite-only region
 * is not enough.
 *
 * `useMe()` needs no loading/error switch here (unlike `ResumenPage`):
 * `_authenticated.tsx`'s `beforeLoad` already primed `['auth-me']` before
 * this route could mount (WCFG-01/03) — `me` absent is not a reachable
 * production state, only a defensive guard.
 *
 * Design-hardening fix P0 ("no logout"): the second logout entry point (the
 * first is the desktop sidebar footer, `routes/_authenticated.tsx`) lives
 * here, in its own section — mobile has no sidebar, so without this there is
 * no way out of the session on a phone at all.
 *
 * ---
 *
 * **Surface pass (2026-09-01).** Three changes, each fixing a defect that
 * only a browser could show (jsdom does no layout — see `PerfilForm`'s own
 * `mb-4`-on-the-legend note for the same class of bug):
 *
 * 1. **Containment.** The three concerns are three `SeccionConfig` surfaces
 *    now, not naked blocks stacked in one flat column. Identity, Google
 *    linking and session termination carry different risk and are not the
 *    same thing; a flat column said they were. Every other screen in this app
 *    already contains its content on that surface (`ListaIngestas.tsx:293`,
 *    `SubirCartola.tsx:885`, `GrupoMovimientos.tsx:99`) — Configuración was
 *    the outlier, which is why it read as a different product.
 *
 * 2. **Heading parity.** The three sibling `h2`s used to render at two
 *    different sizes (`Editar perfil` at `text-xl`, the other two at
 *    `text-sm`), so the screen-reader outline said "three peers" while the
 *    visual outline said "one title and two sub-labels". Only one of those
 *    could be right. `SeccionConfig` owns the heading now, so a section can
 *    no longer choose its own weight. The STRING `Editar perfil` is
 *    deliberately preserved: `e2e/mobile-header.e2e.ts:191` and
 *    `test/configuracion-google-aviso.test.tsx` anchor on that accessible
 *    name, and renaming it would spend real risk on a cosmetic redundancy.
 *
 * 3. **~64px of dead space, removed.** The two aviso regions MUST stay
 *    mounted while empty — a live region inserted at the same moment as its
 *    content is not announced, which is what this file's "monta las dos
 *    regiones … vacías" scenario protects. But they were two free-standing
 *    children of a `gap-8` column, and an empty flex item still consumes its
 *    gap: two 32px gaps of nothing, on every render, between the form and
 *    `Sesión`. They now sit INSIDE the Google section in a single `gap-1`
 *    wrapper, adjacent to the control whose outcome they report. Still
 *    mounted, still empty, no longer 64px.
 *
 * The error region also moves off the raw `text-red-600` (#dc2626) onto the
 * `text-destructive` token (#ba1a1a): `PerfilForm` already used the token for
 * the identical semantic, so the screen was rendering two different reds for
 * "this failed".
 */
export function PerfilPanel({
  avisoGoogle,
  onAvisoGoogleChange,
}: {
  readonly avisoGoogle?: Mensaje;
  readonly onAvisoGoogleChange?: (mensaje: Mensaje | undefined) => void;
} = {}) {
  const { data: me } = useMe();
  const { cerrarSesion, cerrando } = useCerrarSesion();

  if (!me) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <SeccionConfig titulo="Editar perfil">
        <PerfilForm me={me} />
      </SeccionConfig>

      <SeccionConfig titulo="Cuenta de Google">
        <GoogleVinculoSection
          me={me}
          onAbrirDialogo={() => onAvisoGoogleChange?.(undefined)}
          onDesvinculado={() =>
            onAvisoGoogleChange?.({
              tono: 'ok',
              lineas: ['Desvinculaste tu cuenta de Google.'],
            })
          }
        />
        <div className="flex flex-col gap-1">
          <div
            aria-live="polite"
            data-testid="aviso-google"
            className="text-sm text-exito-foreground"
          >
            {avisoGoogle?.tono === 'ok' &&
              avisoGoogle.lineas.map((linea, indice) => (
                <p key={indice}>{linea}</p>
              ))}
          </div>
          <div
            role="alert"
            data-testid="aviso-google-error"
            className="text-sm text-destructive"
          >
            {avisoGoogle?.tono === 'error' &&
              avisoGoogle.lineas.map((linea, indice) => (
                <p key={indice}>{linea}</p>
              ))}
          </div>
        </div>
      </SeccionConfig>

      <SeccionConfig
        titulo="Sesión"
        descripcion="Cierra la sesión en este dispositivo. Tus datos no se borran."
      >
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={cerrando}
            onClick={() => void cerrarSesion()}
            className="gap-2"
          >
            <LogOut aria-hidden="true" className="size-4" />
            {cerrando ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </Button>
        </div>
      </SeccionConfig>
    </div>
  );
}
