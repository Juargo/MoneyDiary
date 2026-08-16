import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { resolverEstiloSemaforo } from '@/lib/semaforo-estilos';

// TEMPORARY PR2 shim (US-047; removed by PR3/T12, which registers the real
// `/semaforo` route in `routeTree.gen.ts`): `<Link>`'s `to` prop is
// typechecked against the app's GLOBALLY REGISTERED route tree (the
// `declare module '@tanstack/react-router' { interface Register ... }`
// block in `main.tsx`), NOT against whichever router instance a test's
// `RouterProvider` happens to supply at runtime — so `to="/semaforo"` fails
// `tsc` today even inside a router harness, because that literal route
// isn't in `routeTree.gen.ts` yet (verified directly: `tsc -b` reports
// `Type '"/semaforo"' is not assignable to type ...` against the CURRENT
// generated route union). Casting `Link` to a loosely-typed alias here is
// the narrowest possible escape hatch: it affects ONLY this file's
// `to`/`search` prop CHECKING, not `Link`'s runtime behavior — it is still
// the real TanStack Router `Link`, still real client-side navigation, still
// a real `<a href>` under the hood. Remove this cast the moment T12 lands
// the real route; at that point `to="/semaforo"` typechecks normally and
// this alias becomes unused (the compiler will flag it).
const NavLink = Link as unknown as (props: {
  readonly to: string;
  // Narrowed from `Record<string, unknown>` (judgment-day fix): `to` stays
  // loosely typed (the whole point of this shim), but `search`'s shape is
  // known — `{ periodo }` — so a wrong-shaped search param still fails
  // `tsc`, same discipline the real generated route will enforce once T12
  // lands and this cast is removed.
  readonly search?: { periodo?: string };
  readonly className?: string;
  readonly children?: ReactNode;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLAnchorElement>) => void;
}) => ReactElement;

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
    <NavLink
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
    </NavLink>
  );
}
