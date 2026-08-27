import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { DASHBOARD_CARD_CLASS } from '@/lib/dashboard-card';
import { mesCompletoLabel } from '@/domain/periodo-anual';
import { resolverEstiloSemaforo } from '@/lib/semaforo-estilos';
import { cn } from '@/lib/utils';

/**
 * SemaforoHeroCard — design critique P0 fix. The semáforo is the product's
 * core promise (PRODUCT.md principle 1, "the monthly verdict comes first"),
 * but it used to render as a `text-xs` pill (`SemaforoTag`) buried in the
 * chart card's header, upstaged by `IngresoCard`'s 4xl mint hero. This card
 * is now the FIRST card on the dashboard (`ResumenScreen`), at
 * `IngresoCard`'s own display scale (`text-4xl font-extrabold`) — the
 * verdict wins the squint test.
 *
 * Reuses `resolverEstiloSemaforo` — the estado → (label, cara, className)
 * table is NOT forked here (`SemaforoBadge`/`SemaforoTag` share the same
 * source, `lib/semaforo-estilos.ts`).
 *
 * `data-testid="semaforo-global"` MOVED here from the chart card header's
 * `SemaforoTag` wrapper (`ResumenScreen.tsx`) — the chart card drops its own
 * copy as redundant with the hero directly above it. Existing smoke anchors
 * (`ResumenScreen.test.tsx`) keep resolving through this single instance.
 *
 * Two renders, not one component forked by a boolean:
 * - A known estado (verde/amarillo/rojo) renders the WHOLE card as a
 *   `<Link>` to `/semaforo?periodo=…` — the primary entry point to the
 *   verdict detail. `aria-label` gives it ONE accessible name combining the
 *   verdict and the period ("Semáforo: Verde — julio 2026"); the visible
 *   face emoji is `aria-hidden` (color/emoji are never the only carrier —
 *   the label text always renders). The Space-key handler mirrors
 *   `SemaforoTag`'s own precedent (WG5-12): no browser natively activates
 *   an `<a href>` on Space, so it's wired explicitly.
 * - `estadoGlobal: null` (SIN_DATOS) is NOT a `/semaforo` link — there is no
 *   verdict to explain yet. It renders "Sin datos" calmly with a real CTA
 *   (`Button asChild` → `<Link to="/subir">`), fixing the previously
 *   observed "empty state without a CTA" gap. This is a deliberate
 *   deviation from `SemaforoTag`'s "always navigable, never disabled"
 *   precedent — appropriate here because the hero's whole purpose in this
 *   state is to drive the user to the ingestion flow, not to a verdict page
 *   with nothing on it.
 */
export function SemaforoHeroCard({
  estadoGlobal,
  periodo,
}: {
  readonly estadoGlobal: string | null;
  readonly periodo: string;
}) {
  const estilo = resolverEstiloSemaforo(estadoGlobal);

  const cara = (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-14 items-center justify-center rounded-full text-3xl',
        estilo.className,
      )}
    >
      {estilo.cara}
    </span>
  );

  if (!estadoGlobal) {
    return (
      <div
        data-testid="semaforo-global"
        className={cn(
          DASHBOARD_CARD_CLASS,
          'flex flex-col items-center gap-2 text-center',
        )}
      >
        {cara}
        <span className="text-4xl font-extrabold text-foreground">
          Sin datos
        </span>
        <p className="text-sm text-muted-foreground">
          Carga una cartola para conocer tu mes
        </p>
        <Button asChild className="mt-2">
          <Link to="/subir">Subir cartola</Link>
        </Button>
      </div>
    );
  }

  return (
    <Link
      to="/semaforo"
      search={{ periodo }}
      data-testid="semaforo-global"
      aria-label={`Semáforo: ${estilo.label} — ${mesCompletoLabel(periodo)}`}
      className={cn(
        DASHBOARD_CARD_CLASS,
        'flex flex-col items-center gap-2 text-center transition hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
      )}
      onKeyDown={(event) => {
        // WG5-12 precedent (SemaforoTag): Space doesn't natively activate an
        // <a href> — prevent its default (page scroll) and trigger the same
        // navigation a click would.
        if (event.key === ' ') {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
    >
      {cara}
      <span className="text-4xl font-extrabold text-foreground">
        Semáforo: {estilo.label}
      </span>
      <p className="text-sm text-muted-foreground">
        {COPIA_SOPORTE[estadoGlobal] ?? COPIA_SOPORTE_DEFECTO}
      </p>
    </Link>
  );
}

/**
 * Static, calm supporting copy per estado (Serene Finance voice — even rojo
 * states the fact plainly and points to the detail, never alarmist). Keyed
 * by the wire enum value, same discipline as `lib/semaforo-estilos.ts`'s
 * `ESTILOS` table — an estado outside this set (should not happen, the
 * backend contract is closed) falls back to a neutral line instead of
 * rendering `undefined`.
 */
const COPIA_SOPORTE: Record<string, string> = {
  verde: 'Tus gastos del mes están dentro del plan.',
  amarillo: 'Vas ajustado este mes — revisa el detalle para no pasarte.',
  rojo: 'Te pasaste del plan este mes. Revisa el detalle para ver dónde.',
};

const COPIA_SOPORTE_DEFECTO = 'Revisa el detalle de tu mes.';
