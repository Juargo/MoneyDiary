import { useState } from 'react';
import { IngresoCard } from './IngresoCard';
import { SemaforoBadge } from './SemaforoBadge';
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
 * SinCategoria is STILL deliberately excluded from the pie's rendered
 * slices at this PR2 boundary, even though `viewModel.distribucionGasto`
 * now returns all 4 `BUCKETS_ANILLO` members, SinCategoria included
 * (US-047 D-05, `domain/distribucion-gasto.ts`) and `DistribucionPie`
 * itself is donut-ready for a 4th wedge (T6). This screen still passes the
 * PIE the TEMPORARY PR1 shim field `viewModel.distribucionGastoInterina`
 * (judgment-day round 2 CRITICAL fix) — renormalized over just the 3 spend
 * buckets so `porcentaje` sums to exactly 100 — rather than the real
 * 4-item `distribucionGasto`; rewiring the pie itself to the real 4-wedge
 * reading is T11's job (design D-09's grid/composition rewrite lands
 * together with it), not this batch's.
 *
 * The LEGEND wiring below, however, IS the real thing as of PR2: it passes
 * `viewModel.leyendaPrincipal`/`leyendaComplemento` (T5, built from
 * `distribucionGastoInterina` internally — see `resumen-view-model.ts`'s
 * own docblock) straight into `LeyendaGasto`'s new `principales`/
 * `complemento` props (T7) — no local array-building in this component
 * anymore. This is not new shim surface: `leyendaPrincipal`/
 * `leyendaComplemento` are ALREADY the real, non-shim fields T5 shipped in
 * PR1; only `distribucionGastoInterina` itself remains a shim, and only
 * the PIE still reads it. T11 removes `distribucionGastoInterina` (both
 * the view-model field and the pie's remaining call site) once the pie
 * also moves to the real 4-item `distribucionGasto`.
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={cn(DASHBOARD_CARD_CLASS, 'flex flex-col gap-4')}>
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-widest text-secondary uppercase">
              Distribución del gasto
            </h2>
            <span data-testid="semaforo-global">
              <SemaforoBadge
                estadoSemaforo={viewModel.estadoGlobal}
                size={28}
              />
            </span>
          </div>

          <DistribucionPie
            tajadas={viewModel.distribucionGastoInterina}
            targets={viewModel.targets}
            bucketSeleccionado={bucketSeleccionado}
            onSelectBucket={setBucketElegido}
          />
          <LeyendaGasto
            principales={viewModel.leyendaPrincipal}
            complemento={viewModel.leyendaComplemento}
            bucketSeleccionado={bucketSeleccionado}
            onSelectBucket={setBucketElegido}
          />
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
        onSelectPeriodo={onPeriodoChange}
      />
    </div>
  );
}
