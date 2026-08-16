import { useState } from 'react';
import { IngresoCard } from './IngresoCard';
import { SemaforoTag } from './SemaforoTag';
import { DistribucionPie } from './DistribucionPie';
import { LeyendaGasto } from './LeyendaGasto';
import { BucketDetailList } from './BucketDetailList';
import { ResumenAnual } from './ResumenAnual';
import type { ResumenViewModel } from '@/domain/resumen-view-model';
import { anioDePeriodo } from '@/domain/periodo-anual';
import { DASHBOARD_CARD_CLASS } from '@/lib/dashboard-card';
import { cn } from '@/lib/utils';

/**
 * Dashboard body (US-030 Slice B, tasks 30.9/30.10): income header + a
 * 2-column section — left "Distribución del gasto" card (pie + legend, with
 * the GLOBAL semáforo in its header) and right the selected bucket's
 * transactions panel — 2 columns on desktop (`lg:` breakpoint), stacked on
 * mobile, same components either way (plain Tailwind grid, no separate
 * mobile/desktop component trees).
 *
 * Evolves `apps/mobile/src/components/ResumenScreen.tsx`'s data composition:
 * the OLD per-bucket `<Link to="/buckets/$bucket">` breakdown list is GONE
 * (task 30.9) — the pie + legend now represent that split, and picking a
 * bucket shows its transactions INLINE (right panel) instead of navigating
 * away. The standalone `/buckets/:bucket` route (`BucketDetailList` reused
 * directly, `headingLevel="h2"` here) still exists for deep links; this
 * screen just no longer points at it.
 *
 * `bucketSeleccionado` (task 30.10): local interaction state, defaulting to
 * `viewModel.bucketPorDefecto` (the bucket with the largest total among the
 * 4 — computed once in the view-model, BigInt-safe) until the user picks one
 * explicitly. `useState<string | null>(null)` + `??` distinguishes "nothing
 * chosen yet" from an explicit choice without recomputing a default guess on
 * every render.
 *
 * FIX 5: an explicit selection must NOT leak across months — the render-time
 * guard below resets `bucketElegido` to `null` whenever `viewModel.periodo`
 * changes, so a newly-loaded month always starts at ITS OWN default bucket.
 * Done during render (React's "adjust state on prop change" pattern) instead
 * of an effect, so the stale selection never renders for even one frame.
 *
 * FIX 4: `bucketPorDefecto` is `string | null` (`null` only if the backend
 * ever sent an empty `buckets` array — defensive, not expected today). The
 * transactions panel only renders once there is a selected bucket, so a
 * `null` default never reaches `BucketDetailList` (which requires `string`).
 *
 * Container-presentational split (CLAUDE.md): `DistribucionPie`/
 * `LeyendaGasto` stay pure props-in — this screen is the only thing that
 * owns the selection state and wires `onSelectBucket` to both. The right
 * panel is `BucketDetailList` unmodified except for the heading-level prop —
 * it owns ITS OWN `useDetalleBucket` query (established pattern, see its own
 * docstring), so this screen never touches bucket-detail data directly.
 *
 * The annual 50/30/20 summary (US-030 Slice C, task 30.12) renders BELOW the
 * 2-column section — `ResumenAnual` is self-contained (owns its own
 * `useResumenAnual` query, like `BucketDetailList` owns `useDetalleBucket`),
 * so this screen only derives its `anio` from the CURRENT `viewModel.periodo`
 * (`anioDePeriodo`) and forwards `onPeriodoChange` — the SAME callback
 * `ResumenPage` already threads from the router's `Route.useNavigate()` for
 * `PeriodoSelector`, reused verbatim rather than inventing a second
 * period-setting path. Clicking a month in the grid just calls it with that
 * month's `periodo`.
 *
 * A11y (ADR-018): this is the data screen's single page-level `<h1>` — kept
 * visually hidden (`sr-only`); "Distribución del gasto" stays the visible
 * subheading. `BucketDetailList`'s own heading demotes to `<h2>` so this
 * stays the ONLY `<h1>` even though its transactions panel is embedded here.
 *
 * US-047 T11/PR3: the PR1 shim (`distribucionGastoInterina`) is gone — the
 * pie now renders the REAL 4-item `viewModel.distribucionGasto` (all
 * `BUCKETS_ANILLO` members, SinCategoria included) with its donut hole
 * enabled (`conInterior`, D-01) now that the ring it wraps is complete. The
 * legend was already reading the real, non-shim `leyendaPrincipal`/
 * `leyendaComplemento` fields since PR2 (T5); WG5-13's ring-percentage
 * dilution is therefore now user-visible in both places at once, by
 * construction — not a staged rollout.
 *
 * The card header swaps the static `SemaforoBadge` for the clickable
 * `SemaforoTag` (T9, design D-06/WG5-07) — a navigation entry point to the
 * `/semaforo` stub (T12), carrying `viewModel.periodo` as a search param.
 *
 * The card BODY wraps the pie + legend in the T1 tablet grid (design D-09):
 * stacked below `md`, side-by-side at `md:grid-cols-2` — independent of the
 * PAGE-level `lg:grid-cols-2` boundary above it, which stays untouched. The
 * hint text below the body (design D-08) is plain visible text, no
 * `aria-describedby` wiring — the rows already announce themselves via their
 * own accessible names (T7).
 */
export function ResumenScreen({
  viewModel,
  onPeriodoChange,
}: {
  readonly viewModel: ResumenViewModel;
  readonly onPeriodoChange: (periodo: string) => void;
}) {
  const [bucketElegido, setBucketElegido] = useState<string | null>(null);

  // FIX 5: reset the explicit selection when the month changes — otherwise the
  // OLD month's choice would leak into the new month's panel. Reset during
  // render by tracking the previous period (React's documented alternative to
  // a reset-in-effect); React re-runs render immediately without committing.
  const [periodoPrevio, setPeriodoPrevio] = useState(viewModel.periodo);
  if (viewModel.periodo !== periodoPrevio) {
    setPeriodoPrevio(viewModel.periodo);
    setBucketElegido(null);
  }

  const bucketSeleccionado = bucketElegido ?? viewModel.bucketPorDefecto;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4">
      <h1 className="sr-only">Resumen mensual</h1>
      <IngresoCard totalIngreso={viewModel.totalIngreso} />

      <div
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        data-testid="dashboard-page-grid"
      >
        <div className={cn(DASHBOARD_CARD_CLASS, 'flex flex-col gap-4')}>
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-widest text-secondary uppercase">
              Distribución del gasto
            </h2>
            <span data-testid="semaforo-global">
              <SemaforoTag
                estadoGlobal={viewModel.estadoGlobal}
                periodo={viewModel.periodo}
              />
            </span>
          </div>

          {/* T1 tablet variant (design D-09): stacked below `md`, side-by-side
              at `md:grid-cols-2` — independent of the PAGE-level `lg:` grid
              above. `data-testid` is a jsdom SMOKE check only; the real T1
              proof is Playwright (T15/T16, CA-05, WCTG-14 guard). */}
          <div
            data-testid="grafico-card-body"
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            <DistribucionPie
              tajadas={viewModel.distribucionGasto}
              targets={viewModel.targets}
              bucketSeleccionado={bucketSeleccionado}
              onSelectBucket={setBucketElegido}
              conInterior
            />
            <LeyendaGasto
              principales={viewModel.leyendaPrincipal}
              complemento={viewModel.leyendaComplemento}
              bucketSeleccionado={bucketSeleccionado}
              onSelectBucket={setBucketElegido}
            />
          </div>

          {/* Hint text (design D-08): plain visible text, full width, no
              `aria-describedby` — the rows already announce themselves via
              their own accessible names (T7). */}
          <p className="text-xs text-muted-foreground">
            Toca un ítem del gráfico o la leyenda para ver su detalle del mes
          </p>
        </div>

        <div className={DASHBOARD_CARD_CLASS}>
          {/* FIX 4: `bucketSeleccionado` is only `null` when `bucketPorDefecto`
              was `null` (empty `buckets` from the backend) AND the user hasn't
              picked one — defensive, not expected today. Skip the panel
              instead of passing `null` where `BucketDetailList` requires a
              `string`. */}
          {bucketSeleccionado && (
            <BucketDetailList
              bucket={bucketSeleccionado}
              periodo={viewModel.periodo}
              headingLevel="h2"
            />
          )}
        </div>
      </div>

      <ResumenAnual
        anio={anioDePeriodo(viewModel.periodo, new Date().getUTCFullYear())}
        periodoSeleccionado={viewModel.periodo}
        onSelectPeriodo={onPeriodoChange}
      />
    </div>
  );
}
