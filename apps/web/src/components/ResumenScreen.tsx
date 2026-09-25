import { SemaforoHeroCard } from './SemaforoHeroCard';
import { DistribucionPie } from './DistribucionPie';
import { LeyendaGasto } from './LeyendaGasto';
import { ResumenAnual } from './ResumenAnual';
import type { ResumenViewModel } from '@/domain/resumen-view-model';
import { anioDePeriodo } from '@/domain/periodo-anual';
import { DASHBOARD_CARD_CLASS } from '@/lib/dashboard-card';
import { cn } from '@/lib/utils';

/**
 * Dashboard body (US-030 Slice B, tasks 30.9/30.10 — US-053 PR3 D-06): income
 * header + the single "Distribución del gasto" card (pie + legend, with the
 * GLOBAL semáforo in its header). The interim transactions panel (US-030
 * task 30.10 — `BucketDetailList` inline, `bucketElegido` selection state,
 * FIX 5 cross-month reset) is RETIRED: the pie + legend now NAVIGATE to the
 * month-scoped `/buckets/:bucket` page (US-053) instead of swapping an
 * inline panel, so the whole selection state is gone with it. The page grid
 * is therefore SINGLE-column at every breakpoint (no `lg:grid-cols-2`).
 *
 * Container-presentational split (CLAUDE.md): `DistribucionPie`/
 * `LeyendaGasto` stay pure props-in — their `onSelectBucket` keeps its
 * single-arg signature (D-06). `onSelectBucket(bucket, destacar?)` is
 * threaded straight through from the router (`ResumenPage`) unchanged: this
 * screen no longer computes a `destacar` value of its own. Issue #778
 * tramo5b PR1 retired the Sin categoría wedge/row — that was the ONLY case
 * that ever passed `destacar: true` (WDM-04, `?destacar=sin-categoria`), so
 * `onSelectBucket` is passed straight to both controls; TypeScript accepts
 * this because a function's optional trailing parameter never has to be
 * supplied by the caller.
 *
 * The annual 50/30/20 summary (US-030 Slice C, task 30.12) renders BELOW the
 * chart card — `ResumenAnual` is self-contained (owns its own
 * `useResumenAnual` query), so this screen only derives its `anio` from the
 * CURRENT `viewModel.periodo` (`anioDePeriodo`) and forwards
 * `onPeriodoChange` — the SAME callback `ResumenPage` already threads from
 * the router's `Route.useNavigate()` for `PeriodoSelector`, reused verbatim
 * rather than inventing a second period-setting path. Clicking a month in
 * the grid just calls it with that month's `periodo`.
 *
 * A11y (ADR-018): this is the data screen's single page-level `<h1>` — kept
 * visually hidden (`sr-only`); "Distribución del gasto" stays the visible
 * subheading. With the panel gone there is no second card to demote — the
 * `<h1>` guard in `ResumenScreen.test.tsx` stays as the regression
 * tripwire.
 *
 * US-047 T11/PR3: the PR1 shim (`distribucionGastoInterina`) is gone — the
 * pie renders `viewModel.distribucionGasto` directly with its donut hole
 * enabled (`conInterior`, D-01). The legend reads the real, non-shim
 * `leyendaPrincipal`/`leyendaComplemento` fields (PR2 T5). Issue #778
 * tramo5b PR1: `distribucionGasto`/`leyendaComplemento` no longer include a
 * SinCategoria member at all — the ring/legend show only the 3 spend
 * buckets plus Ingresos.
 *
 * Design critique P0 fix (impeccable audit, PRODUCT.md principle 1 — "the
 * monthly verdict comes first"): the semáforo used to be a `text-xs` pill
 * (`SemaforoTag`) tucked into this chart card's header. `SemaforoHeroCard`
 * is now the FIRST card on the page. The chart card DROPS its `SemaforoTag`
 * entirely (redundant with the hero directly above it); the
 * `data-testid="semaforo-global"` smoke anchor MOVED to the hero
 * (`SemaforoHeroCard`), so existing tests keep resolving through the single
 * remaining instance.
 *
 * Dashboard order (2026-08-30): the sr-only `<h1>` leads, then
 * `SemaforoHeroCard` (a single-line status row, minimalist-ui pass), then
 * the "Distribución del gasto" chart card, then `ResumenAnual`. The
 * `IngresoCard` that used to sit between the hero and the chart card is
 * REMOVED (income stays reachable from the legend's "Ingresos" row →
 * `/ingresos`, via `onSelectIngresos`) — `anio`/`anioDePeriodo` stay because
 * `ResumenAnual` below still needs them. The hero's own verdict copy
 * (`construirVeredictoSemaforo`) is ALSO removed from this screen (same
 * pass): the row now only links to `/semaforo`, where the verdict lives —
 * this screen no longer computes a `veredicto` or feeds it as a prop.
 *
 * The card BODY wraps the pie + legend in the T1 tablet grid (design D-09):
 * stacked below `md`, side-by-side at `md:grid-cols-2` — independent of the
 * PAGE-level single-column layout above it. The hint text below the body
 * (design D-08) is plain visible text, kept verbatim (still true: tapping a
 * chart item or legend row navigates to its month detail); no
 * `aria-describedby` wiring — the rows already announce themselves via their
 * own accessible names (T7).
 */
export function ResumenScreen({
  viewModel,
  onPeriodoChange,
  onSelectBucket,
  onSelectIngresos,
}: {
  readonly viewModel: ResumenViewModel;
  readonly onPeriodoChange: (periodo: string) => void;
  readonly onSelectBucket: (bucket: string, destacar?: boolean) => void;
  readonly onSelectIngresos: () => void;
}) {
  // Issue #778 tramo5b PR1: `onSelectBucket` used to receive a computed
  // `destacar` flag here, set only when the clicked bucket was the ring's
  // SinCategoria wedge (`?destacar=sin-categoria`, WDM-04, e2e case 4) — the
  // ONLY drill-down that ever carried it. That wedge/row is retired, so
  // there is no longer anything to compute: `onSelectBucket` is passed
  // straight through to both chart controls below (D-06, single-arg
  // signature), never invoked with a second argument from this screen.

  // `anio` still feeds `ResumenAnual` below (self-contained, owns its own
  // `useResumenAnual` query) — the income card's own derivations are gone.
  const anio = anioDePeriodo(viewModel.periodo, new Date().getUTCFullYear());

  // SIN `p-4`: el padding de página lo pone `ResumenPage`, que envuelve a este
  // componente (lo necesita para el `PeriodoSelector`, que vive fuera del
  // switch de estados). Tenerlo en los dos lados aplicaba el padding dos veces
  // y empujaba este contenedor 16px fuera del viewport: a 360px el dashboard
  // —la pantalla más visitada del producto— se scrolleaba de costado.
  //
  // Lo encontró el barrido E-10 de `mobile-floor.e2e.ts` al sumar `/` a su
  // lista de `SCREENS`. Ningún test lo veía antes: jsdom no hace layout, y los
  // specs propios del dashboard (`dashboard-donut`, `annual-grid`) sí corren en
  // móvil pero miden comportamiento, no geometría de la página.
  //
  // `mx-auto max-w-6xl` sí se queda acá: es el ancho del CONTENIDO, no el
  // respiro de la página.
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <h1 className="sr-only">Resumen mensual</h1>
      <SemaforoHeroCard
        estadoGlobal={viewModel.estadoGlobal}
        periodo={viewModel.periodo}
      />

      {/* D-06: single column at every breakpoint — the transactions panel is
          retired, so there is no second column to pair the chart card with.
          The wrapper/testid stays (jsdom WDS-04 smoke check anchors on
          `.grid`; the `lg:grid-cols-2` class is GONE). */}
      <div className="grid grid-cols-1 gap-4" data-testid="dashboard-page-grid">
        <div className={cn(DASHBOARD_CARD_CLASS, 'flex flex-col gap-4')}>
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium tracking-widest text-secondary uppercase">
              Distribución del gasto
            </h2>
          </div>

          {/* T1 tablet variant (design D-09): stacked below `md`, side-by-side
              at `md:grid-cols-2`. `data-testid` is a jsdom SMOKE check only;
              the real T1 proof is Playwright (T15/T16, CA-05, WCTG-14
              guard). */}
          <div
            data-testid="grafico-card-body"
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            <DistribucionPie
              tajadas={viewModel.distribucionGasto}
              targets={viewModel.targets}
              onSelectBucket={onSelectBucket}
              conInterior
            />
            <LeyendaGasto
              principales={viewModel.leyendaPrincipal}
              complemento={viewModel.leyendaComplemento}
              onSelectBucket={onSelectBucket}
              onSelectIngresos={onSelectIngresos}
            />
          </div>

          {/* Hint text (design D-08): plain visible text, full width, no
              `aria-describedby` — the rows already announce themselves via
              their own accessible names (T7). */}
          <p className="text-xs text-muted-foreground">
            Toca un ítem del gráfico o la leyenda para ver su detalle del mes
          </p>
        </div>
      </div>

      <ResumenAnual
        anio={anio}
        periodoSeleccionado={viewModel.periodo}
        onSelectPeriodo={onPeriodoChange}
      />
    </div>
  );
}
