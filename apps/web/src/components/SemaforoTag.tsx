import { ChevronRight } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { resolverEstiloSemaforo } from '@/lib/semaforo-estilos';

/**
 * Clickable semáforo entry point (US-047, design D-06) — a TRANSVERSAL
 * pattern: ANY chart rendering a semáforo indicator uses this, never a
 * static badge (WG5-07). Navigates to `/semaforo` (a US-049 stub for now,
 * T12), carrying the current `periodo` as a search param so a future
 * US-049 content lands on the right month without extra plumbing.
 * `estadoGlobal: null` still renders a navigable "Sin datos" link
 * (WG5-08) — never omitted, never disabled — mirroring `SemaforoBadge`'s
 * existing SIN_DATOS precedent (shared via `lib/semaforo-estilos.ts`, T8).
 * `Link` renders a real `<a>`, so Tab/Enter are keyboard-operable for free
 * (the browser's own default action). Space is NOT — no browser natively
 * activates an `<a href>` on Space (it scrolls instead) — so WG5-12's
 * Tab/Enter/Space requirement needs one explicit `onKeyDown` below
 * (judgment-day fix) to prevent that default and activate navigation.
 */
export function SemaforoTag({
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
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-800 ${estilo.className}`}
      onKeyDown={(event) => {
        // WG5-12: Space doesn't natively activate an <a href> — prevent its
        // default (page scroll) and trigger the same navigation a click
        // would (Link's own click handler runs the actual routing).
        if (event.key === ' ') {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
    >
      <span aria-hidden="true">{estilo.cara}</span>
      <span>Semáforo: {estilo.label}</span>
      <ChevronRight aria-hidden="true" size={14} />
    </Link>
  );
}
