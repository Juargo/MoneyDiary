import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import type { NavRoute } from '@/components/app-shell/nav-items';

/**
 * Empty state (spec W1-02): shown when `sinIngreso: true`. Invites the user
 * to load a cartola — deliberately distinct from a bucket rendering "$0" or
 * "0%", which describe a zero amount, not an absent income. DOM port of
 * `apps/mobile/src/components/states/Empty.tsx`.
 *
 * Reused verbatim by the bucket detail screen (`BucketDetalleMesPage`,
 * US-053):
 * the default copy ("Carga una cartola…") is resumen-specific and
 * misleading when a bucket simply has no transactions this period. The
 * optional `title`/`description` props let other screens supply
 * context-appropriate copy without duplicating this component (DRY) — the
 * resumen screen keeps the defaults, unchanged.
 *
 * Design-system hardening round 2 (P1): reskinned off raw `slate-*` onto the
 * semantic tokens, which is why it followed the Tecno-Analítico restyle
 * (2026-09-03) with no edit — only the measurements moved. Contrast
 * (index.css hexes): title `--foreground` (#e6e9ef) on `--background`
 * (#090a0f) ≈ 16.26:1; description `--muted-foreground` (#949cad) on
 * `--background` ≈ 7.17:1 (both AA). Under the retired light palette these
 * were 14.9:1 and 8.13:1.
 *
 * Design critique P1 fix ("empty state without a CTA"): `accion` is OPT-IN
 * — this component never assumes "upload a cartola" is every caller's true
 * next step (e.g. `CategoriasPanel`'s empty state wants "create a category",
 * not `/subir`). Callers whose empty copy genuinely points at ingestion wire
 * it explicitly; the button + `Link` pattern (and its exact copy, "Subir
 * cartola") is copied from `SemaforoHeroCard`'s own `sinDatos` CTA rather
 * than invented fresh, so the product speaks with one voice for the same
 * next step. `to` is narrowed to `/subir` (not a bare `string`) — the ONLY
 * destination every current caller needs (YAGNI); widen the literal union
 * the day a second destination shows up, same discipline as
 * `BotonVolver.tsx`'s `Extract<NavRoute, …>`.
 *
 * Semantic wash extension (DESIGN.md "Status Families" update, 2026-08-29):
 * unlike `SemaforoHeroCard`/`BucketSemaforoCard`, this
 * component has no estado to wash and no card surface of its own — it sits
 * directly on the pale-sky `--background`. Scoped instead to a soft, modest
 * `bg-muted/40` + `border-border` box (the SAME notice idiom `SubirCartola`
 * already uses for its draft-recovery notice) around the copy, so an empty
 * period reads as a considered state rather than bare floating text — no
 * illustration, no new token. Contrast is effectively unchanged from the
 * `--background` figures documented above: `--muted` blended at 40% over
 * `--background` shifts the surface by only a few RGB points.
 */
export function Empty({
  title = 'Todavía no hay movimientos este período',
  description = 'Carga una cartola para ver tu resumen del mes.',
  accion,
}: {
  readonly title?: string;
  readonly description?: string;
  readonly accion?: {
    readonly label: string;
    readonly to: Extract<NavRoute, '/subir'>;
  };
} = {}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-8 text-center">
      <div className="flex max-w-sm flex-col items-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-8">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
        {accion && (
          <Button asChild className="mt-2">
            <Link to={accion.to}>{accion.label}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
