import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavRoute } from '../app-shell/nav-items';
import { CLASE_BOTON_ICONO } from './estilos';

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-800';

/**
 * BotonVolver (US-063 D-05/D-06, WCTM-04) — the shared back-icon control
 * for the mobile Configuración header, on both the shared-chrome
 * screens (`ConfiguracionLayout`, this PR) and the edit screen
 * (`EditarCategoria`, PR #4).
 *
 * **D-05 — an explicit `<Link to>`, never `router.history.back()`.**
 * Browser-back is unpredictable exactly where this control matters most:
 * the edit screen is deep-linkable, so a cold open has no history entry and
 * `back()` either does nothing or leaves the app. `to` is a narrow literal
 * union (`Extract<NavRoute, '/' | '/configuracion/categorias'>`), not
 * `string` — a third destination must be a deliberate decision, not an
 * accident that silently typechecks.
 *
 * `label` names the destination (the accessible name), never a generic
 * "Volver" — WCTM-04's a11y minimum requires a non-empty, descriptive name
 * reachable by name, not only visually distinguishable as an icon.
 *
 * `CLASE_BOTON_ICONO` (D-06, `estilos.ts`, moved up one level in this same
 * PR) is reused, never redefined — `size-6` = 24×24 CSS px, SC 2.5.8's
 * minimum. The focus ring mirrors `app-shell/NavItem.tsx`'s `FOCUS_RING`
 * idiom (this repo's existing chrome-level convention), not a fourth
 * visible-focus treatment.
 */
export function BotonVolver({
  to,
  label,
}: {
  readonly to: Extract<NavRoute, '/' | '/configuracion/categorias'>;
  readonly label: string;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={cn(CLASE_BOTON_ICONO, FOCUS_RING)}
    >
      <ArrowLeft aria-hidden="true" className="size-[18px]" />
    </Link>
  );
}
