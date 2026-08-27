import { useMe } from '@/api/use-me';
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
 */
export function PerfilPanel({
  avisoGoogle,
  onAvisoGoogleChange,
}: {
  readonly avisoGoogle?: Mensaje;
  readonly onAvisoGoogleChange?: (mensaje: Mensaje | undefined) => void;
} = {}) {
  const { data: me } = useMe();

  if (!me) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-xl font-semibold text-foreground">Editar perfil</h2>
      <PerfilForm me={me} />
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
        className="text-sm text-red-600"
      >
        {avisoGoogle?.tono === 'error' &&
          avisoGoogle.lineas.map((linea, indice) => (
            <p key={indice}>{linea}</p>
          ))}
      </div>
    </div>
  );
}
