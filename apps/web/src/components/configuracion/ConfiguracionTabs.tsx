import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { FOCUS_RING } from './estilos';

/**
 * Active-state contrast (fixed 2026-09-01).
 *
 * `TAB_ACTIVE` was `bg-accent font-semibold text-primary` — `NavItem`'s fill
 * copied over WITHOUT the rail that carries it there. On white (the sidebar)
 * the `--accent` grey #eeeeee still reads; these tabs sit on `--background`
 * #e8f0fa, where that same grey measures **1.07:1** against the ground. Not
 * "low contrast" — indistinguishable. `--accent` is defined as
 * "surface-container" for WHITE surfaces, and this is not one.
 *
 * The fix reuses `NavItem`'s full idiom instead of half of it:
 *
 * | Signal | Value | Contrast on #e8f0fa |
 * |---|---|---|
 * | rail | `border-primary` #2260b2, 4px | **5.36:1** (SC 1.4.11 needs 3:1 for non-text) |
 * | fill | `bg-card` #ffffff | 1.16:1 — weak alone, deliberately |
 * | text | `text-primary` #2260b2 on white | 6.21:1 |
 *
 * The rail carries the contrast; the white fill is NOT there for contrast but
 * for meaning — the selected tab takes the same white as the content cards to
 * its right, so it reads as "this tab owns that panel". `bg-accent` could
 * never do that job even if it were visible, because the grey is not the
 * surface colour of anything on this screen.
 *
 * **Why the rail is on the LEFT here and on the right in the sidebar.** The
 * sidebar uses `border-r-4` because its right edge IS the boundary with the
 * content. This list has no such boundary: a right rail would float in the
 * middle of the blue gutter, pointing at nothing. It goes on the item's
 * leading edge, where the eye enters the row. Same device, different
 * placement, for a reason.
 *
 * **Below `md` the rail goes on the BOTTOM, not the left.** There the list is
 * a horizontal row (D-01/WCTM-02), and a vertical bar beside a pill in a
 * horizontal row does not read as "selected", it reads as broken.
 * `border-b-4` below `md`, `border-l-4` from `md` up — the base state's
 * `border-transparent` reserves the space in both orientations, so activating
 * a tab shifts nothing.
 *
 * Two further drifts against `NavItem` that this closes:
 * - inactive moves from `text-muted-foreground` (#44474e, neutral grey) to
 *   `text-secondary` (#61597f, the strong lavanda) — the SAME colour the
 *   sidebar uses for a non-active nav link. They were two different answers
 *   to one question. 5.59:1 on the blue ground, AA.
 * - these tabs had NO focus ring at all while `NavItem` has one. A nav link
 *   with no visible focus indication is a real a11y gap (SC 2.4.7), not a
 *   stylistic preference.
 *
 * `hover` changes too: `hover:bg-accent` was the same invisible grey. It is
 * now `hover:bg-card` plus a text darkening, so the change is perceivable
 * through two channels instead of none.
 */
const TAB_BASE = cn(
  'block border-b-4 border-transparent px-3 py-2 text-center text-sm font-medium text-secondary transition-colors',
  'hover:bg-card hover:text-foreground',
  'md:border-b-0 md:border-l-4 md:text-left',
  FOCUS_RING,
);
const TAB_ACTIVE = 'border-primary bg-card font-semibold text-primary';

/**
 * ConfiguracionTabs — the section-tab list, now shared chrome rendered once
 * by `ConfiguracionLayout` (US-043 design.md §1/Q1a) rather than owned by
 * `ConfiguracionPage`. Both entries are real `<Link>`s to their own route
 * (`NavItem.tsx`'s `activeProps` idiom, DRY): `aria-current="page"` is
 * derived from the actual matched route, never hardcoded — a static
 * `aria-current` on `Perfil` would leave TWO tabs claiming to be current the
 * moment `/configuracion/categorias` became reachable, which is exactly the
 * a11y defect a tab list must not have (proposal §7).
 *
 * `Categorías` replaces the disabled placeholder `<button>` this file used
 * to render (`NavItem.tsx:56-68`'s "not built yet" treatment) — WCTG-01: it
 * is now a real, active link on its own route.
 *
 * `activeOptions={{ exact: true }}` on `Perfil` stops `/configuracion` from
 * matching as a PREFIX once `/configuracion/categorias` exists — otherwise
 * both tabs would show active at once on the Categorías route.
 *
 * **US-063 D-01/WCTM-02:** below `md` the `<ul>` switches to `flex-row`
 * (from `flex-col`) — a single horizontal row instead of the tablet/desktop
 * vertical column. The `<ul>`'s direct flex items are the `<li>` elements,
 * not the `<a>`s inside them, so the row-sharing `flex-1`/`md:flex-none`
 * pair lives on `<li>` (`TAB_LI` below) — putting it on `TAB_BASE`'s `<a>`
 * instead does nothing for width distribution, because that `<a>` is not a
 * flex item of `<ul>`. `TAB_BASE` keeps `text-center`/`md:text-left` (its
 * own concern); the `<a>` is `block`, so it fills whatever width its now
 * flex-growing `<li>` gives it. CSS-only (D-08) — jsdom can only assert the
 * class literal is present, not that the row is actually horizontal (let
 * alone full-width) at a real viewport; that's `e2e/mobile-header.e2e.ts`'s
 * job (`E-01`'s tabs-row half).
 *
 * **Mobile bottom-nav redesign, fresh-review fix (Impeccable critique P1):**
 * a trailing "Ayuda" `<li>` closes the list. `BottomTabs` dropped "Ayuda"
 * to fit the 3-5 tab convention (`nav-items.ts`'s `hideFromBottomTabs`);
 * mobile users need a discoverable path to it, and this landmark — the one
 * other nav list rendered on `/configuracion` — is where it lives now. An
 * earlier version placed it as a separate `NavItem` (`Sidebar`'s
 * icon+rail-accent styling) next to this list, in its own wrapper; review
 * caught two problems with that: it sat outside any nav/list landmark, and
 * its sidebar-shaped visuals (icon, `border-r-4` accent, active-route
 * styling that can never fire here — `/ayuda` never matches inside
 * `/configuracion`) read as a foreign element beside these icon-less
 * pills. Folding it in here fixes both: same landmark, same `TAB_BASE`
 * pill, no icon, no `activeProps` (a static, always-inactive tab would be
 * pointless — Perfil/Categorías earn `activeProps` because they really can
 * become the current route in this tree; Ayuda never can). `lg:hidden` on
 * the `<li>` — not the whole component — because the desktop `Sidebar`
 * already renders "Ayuda" from that breakpoint up; showing it here too
 * would be a redundant second link to the same destination.
 */
const TAB_LI = 'flex-1 md:flex-none';

export function ConfiguracionTabs() {
  return (
    <nav aria-label="Secciones de configuración">
      <ul className="flex flex-row gap-1 md:flex-col">
        <li className={TAB_LI}>
          <Link
            to="/configuracion"
            activeOptions={{ exact: true }}
            activeProps={{ className: TAB_ACTIVE, 'aria-current': 'page' }}
            className={TAB_BASE}
          >
            Perfil
          </Link>
        </li>
        <li className={TAB_LI}>
          <Link
            to="/configuracion/categorias"
            activeProps={{ className: TAB_ACTIVE, 'aria-current': 'page' }}
            className={TAB_BASE}
          >
            Categorías
          </Link>
        </li>
        <li className={cn(TAB_LI, 'lg:hidden')}>
          <Link to="/ayuda" className={TAB_BASE}>
            Ayuda
          </Link>
        </li>
      </ul>
    </nav>
  );
}
