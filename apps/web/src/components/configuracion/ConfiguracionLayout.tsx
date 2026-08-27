import type { ReactNode } from 'react';
import { BotonVolver } from './BotonVolver';
import { ConfiguracionTabs } from './ConfiguracionTabs';

/**
 * ConfiguracionLayout — the shared chrome for `/configuracion` and its
 * sibling leaves (US-043 design.md §1/Q1a, D-09): the `Configuración` h1
 * (A2, replacing the page-owned `Editar perfil` h1 the pre-split
 * `ConfiguracionPage` used to render), the fluid T1 grid reproduced verbatim
 * from that same shipped component (`grid-cols-1 md:grid-cols-[200px_1fr]`,
 * WCFG-11), and `ConfiguracionTabs`.
 *
 * **US-063 D-01/D-02 (repairs `WCTG-14`/`WCFG-11` scenario 1):** the grid's
 * boundary moved from `lg` (1024) to `md` (768) — T2/T3's measured width
 * (880px) is `≥ md` but `< lg`, so the pre-existing `lg:` boundary made the
 * grid fall back to `grid-cols-1` (the mobile stack) at that width, the
 * exact defect `WCTG-14` shipped false. 360 stays one track (`md` inactive);
 * 880 and 1280 both get the fixed-tab/fluid-content two-track grid.
 *
 * **US-063 D-07:** the h1 gains `max-md:sr-only` — invisible below `md`
 * (CA-03), still in the a11y tree at every width. **US-063 D-05/D-06:** a
 * `BotonVolver` renders `md:hidden` above the h1, replacing it visually as
 * the mobile header's back-icon control (WCTM-04; `to="/"` — Q-02, shared
 * chrome for both `/configuracion` and `/configuracion/categorias`, so both
 * screens exit to the dashboard, never to each other, since `ConfiguracionTabs`
 * already keeps the Perfil/Categorías switcher immediately below).
 *
 * Takes `children` rather than rendering `<Outlet/>` itself (task 2's route
 * file does that: `<ConfiguracionLayout><Outlet/></ConfiguracionLayout>`) —
 * this keeps the component decoupled from the router beyond what
 * `ConfiguracionTabs`'s `<Link>`s already need, and lets a caller (test or
 * production) hand it any content.
 *
 * `min-w-0` on the content track (Q10a mechanism 1 of 2, WCTG-13 guarantee
 * 1) ships WITH this component, not deferred to a later PR: a grid item's
 * default `min-width: auto` lets a long name inside the fluid `1fr` track
 * force the page to scroll sideways — this is the fix every per-component
 * `truncate` (mechanism 2, later PRs) depends on.
 *
 * **Mobile bottom-nav redesign (Impeccable critique P1):** `BottomTabs`
 * dropped "Ayuda" to fit the 3-5 tab convention (`nav-items.ts`'s
 * `hideFromBottomTabs`). Mobile users keep a discoverable path to it, but
 * it lives inside `ConfiguracionTabs` itself — a trailing, `lg:hidden` tab
 * in that component's own nav/ul (see its docstring) — not as a second
 * element owned by this layout, so this component's structure is
 * unchanged by that redesign.
 */
export function ConfiguracionLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-2 md:hidden">
        <BotonVolver to="/" label="Volver al inicio" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground max-md:sr-only">
        Configuración
      </h1>
      <div
        data-testid="configuracion-grid"
        className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-[200px_1fr]"
      >
        <ConfiguracionTabs />
        <div data-testid="configuracion-content-track" className="min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
