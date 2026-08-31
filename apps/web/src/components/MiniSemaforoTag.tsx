import { Link } from '@tanstack/react-router';
import { mesCompletoLabel } from '@/domain/periodo-anual';
import { resolverEstiloSemaforo } from '@/lib/semaforo-estilos';

/**
 * Compact, icon-only semáforo entry point for the annual grid (US-048,
 * design D-06/D-07) — a 28×28 CSS px `<Link>` (WCAG 2.5.8's 24×24 floor
 * plus 4px headroom, D-06) that sits as a SIBLING of the month control
 * inside each `MesCelda`, never nested inside it (D-01/D-03). Reads the
 * SAME `resolverEstiloSemaforo` table `SemaforoTag` reads (WG5-08) — never
 * a second, driftable copy of the estado→(label, cara, className) mapping.
 *
 * The accessible name is MONTH-scoped (`Semáforo de {mes}: {estado}`,
 * D-07), not `SemaforoTag`'s plain `Semáforo: {estado}`: twelve identically
 * named links in one grid would be an AX failure, and the plain form would
 * collide with `SemaforoTag`'s own `/Semáforo: Muy Saludable/` query on the
 * composed dashboard (`ResumenScreen.test.tsx`, T14) since RTL's
 * `getByRole` throws on multiple matches.
 *
 * Layout is intentionally absent: no margin, no positioning, no
 * `className` prop — the call site (`MesCelda`) positions this component
 * (D-01, SRP — this component does not know it lives in a corner).
 *
 * The Space-key handler below is a DELIBERATE ~7-line duplicate of
 * `SemaforoTag`'s own handler (D-08, `WG5-12`: no browser natively
 * activates an `<a href>` on Space). Two occurrences is not yet DRY's rule
 * of three — extract to a shared helper only when a THIRD semáforo link is
 * authored, not pre-emptively here.
 */
export function MiniSemaforoTag({
  estadoGlobal,
  periodo,
}: {
  readonly estadoGlobal: string | null;
  readonly periodo: string;
}) {
  const estilo = resolverEstiloSemaforo(estadoGlobal);

  return (
    <Link
      to="/semaforo"
      search={{ periodo }}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${estilo.className}`}
      onKeyDown={(event) => {
        // WG5-12/D-08: Space doesn't natively activate an <a href> —
        // prevent its default (page scroll) and trigger the same
        // navigation a click would (Link's own click handler runs the
        // actual routing).
        if (event.key === ' ') {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
    >
      <span aria-hidden="true" className="text-[14px] leading-none">
        {estilo.cara}
      </span>
      <span className="sr-only">
        Semáforo de {mesCompletoLabel(periodo)}: {estilo.label}
      </span>
    </Link>
  );
}
