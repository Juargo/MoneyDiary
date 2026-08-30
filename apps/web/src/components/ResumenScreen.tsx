import { IngresoCard } from './IngresoCard';
import { SemaforoHeroCard } from './SemaforoHeroCard';
import { DistribucionPie } from './DistribucionPie';
import { LeyendaGasto } from './LeyendaGasto';
import { ResumenAnual } from './ResumenAnual';
import type { ResumenViewModel } from '@/domain/resumen-view-model';
import { anioDePeriodo } from '@/domain/periodo-anual';
import { BUCKETS_5030, BUCKETS_ANILLO } from '@/domain/distribucion-gasto';
import { construirVeredictoSemaforo } from '@/domain/veredicto-semaforo';
import { calcularVariacionIngreso } from '@/domain/variacion-ingreso';
import { calcularBarrasIngreso } from '@/domain/sparkline-ingreso';
import { useResumenAnual } from '@/api/use-resumen-anual';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';
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
 * single-arg signature (D-06) and THIS screen owns the drill-down wiring:
 * `onSelectBucket(bucket, destacar?)` is threaded from the router
 * (`ResumenPage`); the `destacar` flag is set only for the Sin categoría
 * drill-down (WDM-04), which the route turns into `?destacar=sin-categoria`
 * so the month-scoped page arrives with the unassigned group highlighted.
 * Every other bucket drills down without it.
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
 * pie renders the REAL 4-item `viewModel.distribucionGasto` (all
 * `BUCKETS_ANILLO` members, SinCategoria included) with its donut hole
 * enabled (`conInterior`, D-01). The legend reads the real, non-shim
 * `leyendaPrincipal`/`leyendaComplemento` fields (PR2 T5); WG5-13's
 * ring-percentage dilution is user-visible in both places at once.
 *
 * Design critique P0 fix (impeccable audit, PRODUCT.md principle 1 — "the
 * monthly verdict comes first"): the semáforo used to be a `text-xs` pill
 * (`SemaforoTag`) tucked into this chart card's header, upstaged by
 * `IngresoCard`'s big display-scale amount. `SemaforoHeroCard` is now the
 * FIRST card on the page — the verdict, not income, leads — at
 * `IngresoCard`'s own display scale. (Income-card redesign 2026-08-30:
 * `IngresoCard`'s surface itself went back to neutral — the ingreso wash now
 * lives in the trend pill and the highlighted sparkline bar, not the card
 * background — but the hero-leads-income ordering decided here is
 * unaffected.) The chart card DROPS its `SemaforoTag` entirely (redundant
 * with the hero directly above it); the `data-testid="semaforo-global"`
 * smoke anchor MOVED to the hero (`SemaforoHeroCard`), so existing tests
 * keep resolving through the single remaining instance.
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
  // D-06: both chart controls keep their single-arg `onSelectBucket`; THIS
  // screen owns the `destacar` flag — the Sin categoría drill-down carries
  // it so the route can pin `?destacar=sin-categoria` (WDM-04, e2e case 4).
  // Every other bucket drills down without it. Sin categoría is the ring's
  // LAST member by construction (`BUCKETS_ANILLO` = [...BUCKETS_5030,
  // 'SinCategoria']) — no raw literal here (DRY).
  const onSeleccionarBucket = (bucket: string) =>
    onSelectBucket(
      bucket,
      bucket === BUCKETS_ANILLO[BUCKETS_ANILLO.length - 1],
    );

  // Hero verdict copy (redesign 2026-08-30): phrased from the per-bucket
  // estados the view model already carries verbatim (never recomputed). The
  // UI label resolution (Deseos → 'Gustos') happens HERE so the pure domain
  // function stays lib-free; canonical 50/30/20 order comes from
  // `BUCKETS_5030`, and a bucket absent from the DTO degrades to estado
  // null (the function falls back to its self-contained per-estado line).
  const veredicto = construirVeredictoSemaforo(
    viewModel.estadoGlobal,
    BUCKETS_5030.map((bucket) => ({
      nombre: ETIQUETA_BUCKET[bucket] ?? bucket,
      estado:
        viewModel.buckets.find((b) => b.bucket === bucket)?.estadoSemaforo ??
        null,
    })),
  );

  // Income card redesign (2026-08-30): the trend pill and sparkline derive
  // from the annual payload. Same queryKey as `ResumenAnual`'s own
  // self-contained query below (`['resumen-anual', anio]`), so TanStack
  // dedupes this into ONE request — no prop threading into that component,
  // no second fetch. While the query loads/errors, `meses` is empty and the
  // pure helpers degrade the card to its base render (no pill, no bars).
  const anio = anioDePeriodo(viewModel.periodo, new Date().getUTCFullYear());
  const anual = useResumenAnual(anio);
  const mesesAnual = anual.data?.meses ?? [];
  const variacionIngreso = calcularVariacionIngreso(
    viewModel.periodo,
    mesesAnual,
  );
  const barrasIngreso = calcularBarrasIngreso(viewModel.periodo, mesesAnual);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4">
      <h1 className="sr-only">Resumen mensual</h1>
      <SemaforoHeroCard
        estadoGlobal={viewModel.estadoGlobal}
        periodo={viewModel.periodo}
        veredicto={veredicto}
      />
      <IngresoCard
        totalIngreso={viewModel.totalIngreso}
        periodo={viewModel.periodo}
        variacion={variacionIngreso}
        barras={barrasIngreso}
      />

      {/* D-06: single column at every breakpoint — the transactions panel is
          retired, so there is no second column to pair the chart card with.
          The wrapper/testid stays (jsdom WDS-04 smoke check anchors on
          `.grid`; the `lg:grid-cols-2` class is GONE). */}
      <div className="grid grid-cols-1 gap-4" data-testid="dashboard-page-grid">
        <div className={cn(DASHBOARD_CARD_CLASS, 'flex flex-col gap-4')}>
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-widest text-secondary uppercase">
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
              onSelectBucket={onSeleccionarBucket}
              conInterior
            />
            <LeyendaGasto
              principales={viewModel.leyendaPrincipal}
              complemento={viewModel.leyendaComplemento}
              onSelectBucket={onSeleccionarBucket}
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
