import { useEffect, useState } from 'react'
import { IngresoCard } from './IngresoCard'
import { SemaforoBadge } from './SemaforoBadge'
import { DistribucionPie } from './DistribucionPie'
import { LeyendaGasto } from './LeyendaGasto'
import { BucketDetailList } from './BucketDetailList'
import { ResumenAnual } from './ResumenAnual'
import type { LeyendaTajada } from './LeyendaGasto'
import type { ResumenViewModel } from '@/domain/resumen-view-model'
import { anioDePeriodo } from '@/domain/periodo-anual'

const BUCKET_SIN_CATEGORIA = 'SinCategoria'

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
 * FIX 5: an explicit selection must NOT leak across months — the `useEffect`
 * below resets `bucketElegido` to `null` whenever `viewModel.periodo`
 * changes, so a newly-loaded month always starts at ITS OWN default bucket.
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
 * SinCategoria is deliberately NOT one of the pie's 3 slices
 * (`distribucionGasto` excludes it, `domain/distribucion-gasto.ts`) but MUST
 * stay reachable — it's appended to the legend's entries with no `porcentaje`
 * (task 30.10), so it renders as a selectable row without a misleading
 * share-of-spending percent.
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
  readonly viewModel: ResumenViewModel
  readonly onPeriodoChange: (periodo: string) => void
}) {
  const [bucketElegido, setBucketElegido] = useState<string | null>(null)

  // FIX 5: reset the explicit selection when the month changes — otherwise
  // the OLD month's choice would leak into the new month's panel.
  useEffect(() => {
    setBucketElegido(null)
  }, [viewModel.periodo])

  const bucketSeleccionado = bucketElegido ?? viewModel.bucketPorDefecto

  const entradasLeyenda: ReadonlyArray<LeyendaTajada> = [
    ...viewModel.distribucionGasto,
    { bucket: BUCKET_SIN_CATEGORIA },
  ]

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4">
      <h1 className="sr-only">Resumen mensual</h1>
      <IngresoCard totalIngreso={viewModel.totalIngreso} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-widest text-secondary uppercase">
              Distribución del gasto
            </h2>
            <span data-testid="semaforo-global">
              <SemaforoBadge estadoSemaforo={viewModel.estadoGlobal} size={28} />
            </span>
          </div>

          <DistribucionPie
            tajadas={viewModel.distribucionGasto}
            targets={viewModel.targets}
            bucketSeleccionado={bucketSeleccionado}
            onSelectBucket={setBucketElegido}
          />
          <LeyendaGasto
            tajadas={entradasLeyenda}
            bucketSeleccionado={bucketSeleccionado}
            onSelectBucket={setBucketElegido}
          />
        </div>

        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          {/* FIX 4: `bucketSeleccionado` is only `null` when `bucketPorDefecto`
              was `null` (empty `buckets` from the backend) AND the user hasn't
              picked one — defensive, not expected today. Skip the panel
              instead of passing `null` where `BucketDetailList` requires a
              `string`. */}
          {bucketSeleccionado && (
            <BucketDetailList bucket={bucketSeleccionado} periodo={viewModel.periodo} headingLevel="h2" />
          )}
        </div>
      </div>

      <ResumenAnual anio={anioDePeriodo(viewModel.periodo, new Date().getUTCFullYear())} onSelectPeriodo={onPeriodoChange} />
    </div>
  )
}
