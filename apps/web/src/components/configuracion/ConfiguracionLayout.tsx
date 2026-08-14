import type { ReactNode } from 'react';
import { ConfiguracionTabs } from './ConfiguracionTabs';

/**
 * ConfiguracionLayout — the shared chrome for `/configuracion` and its
 * sibling leaves (US-043 design.md §1/Q1a, D-09): the `Configuración` h1
 * (A2, replacing the page-owned `Editar perfil` h1 the pre-split
 * `ConfiguracionPage` used to render), the fluid T1 grid reproduced verbatim
 * from that same shipped component (`grid-cols-1 lg:grid-cols-[200px_1fr]`,
 * WCFG-11), and `ConfiguracionTabs`.
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
 */
export function ConfiguracionLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold text-slate-900">Configuración</h1>
      <div
        data-testid="configuracion-grid"
        className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]"
      >
        <ConfiguracionTabs />
        <div data-testid="configuracion-content-track" className="min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
