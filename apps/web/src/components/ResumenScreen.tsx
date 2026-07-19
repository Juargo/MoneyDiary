import { useEffect, useState } from 'react'
import { IngresoCard } from './IngresoCard'
import { SemaforoBadge } from './SemaforoBadge'
import { DistribucionPie } from './DistribucionPie'
import { LeyendaGasto } from './LeyendaGasto'
import { TransaccionesAgrupadas } from './TransaccionesAgrupadas'
import { ResumenAnual } from './ResumenAnual'
import type { LeyendaTajada } from './LeyendaGasto'
import type { ResumenViewModel } from '@/domain/resumen-view-model'
import { anioDePeriodo } from '@/domain/periodo-anual'

const BUCKET_SIN_CATEGORIA = 'SinCategoria'

/**
 * Dashboard body (US-030 Slice B; grouped panel per `group-transactions-by-
 * category` Slice 2, design.md D4/D5): income header + a 2-column section —
 * left "Distribución del gasto" card (pie + legend, with the GLOBAL
 * semáforo in its header) and right the ALWAYS-VISIBLE grouped transactions
 * panel (`TransaccionesAgrupadas`) — 2 columns on desktop (`lg:` breakpoint),
 * stacked on mobile, same components either way (plain Tailwind grid, no
 * separate mobile/desktop component trees).
 *
 * The right panel shows every non-empty category group AT ONCE (WG-01) —
 * there is no more "one bucket selected at a time" state. Picking a pie
 * slice/legend entry does NOT swap the panel; it scrolls to and highlights
 * that category's group instead (WG-05, see `TransaccionesAgrupadas`'s own
 * docstring for the scroll/focus mechanics). The standalone
 * `/buckets/:bucket` route (`BucketDetailList`) still exists, UNCHANGED, for
 * deep links — this screen just no longer points at it (spec W3-01).
 *
 * `bucketElegido` (repurposed from "selected bucket" to "highlight target",
 * design.md D5): local interaction state, `null` until the user clicks a
 * pie slice/legend row. There is no more default-bucket guess — the whole
 * grouped list is always visible, so `null` simply means "no highlight yet"
 * (list rests at the top); `viewModel.bucketPorDefecto` is left unused by
 * this screen (other consumers/tests of the view-model are untouched).
 *
 * FIX 5: a highlight must NOT leak across months — the `useEffect` below
 * resets `bucketElegido` to `null` whenever `viewModel.periodo` changes, so
 * a newly-loaded month always starts with nothing highlighted.
 *
 * Container-presentational split (CLAUDE.md): `DistribucionPie`/
 * `LeyendaGasto` stay pure props-in — this screen is the only thing that
 * owns the highlight-target state and wires `onSelectBucket` to both (their
 * `aria-pressed`/interactive contract is unchanged, only its downstream
 * EFFECT is). The right panel is `TransaccionesAgrupadas`, which owns ITS
 * OWN `useMovimientos` query (established pattern, see its own docstring) —
 * this screen never touches movimientos data directly, only forwards
 * `periodo` + `bucketResaltado`.
 *
 * SinCategoria is deliberately NOT one of the pie's 3 slices
 * (`distribucionGasto` excludes it, `domain/distribucion-gasto.ts`) but MUST
 * stay reachable — it's appended to the legend's entries with no `porcentaje`
 * (task 30.10), so it renders as a selectable row without a misleading
 * share-of-spending percent. Its group is still highlightable via the same
 * `bucketResaltado` wiring even though it has no pie slice.
 *
 * The annual 50/30/20 summary (US-030 Slice C, task 30.12) renders BELOW the
 * 2-column section — `ResumenAnual` is self-contained (owns its own
 * `useResumenAnual` query, like `TransaccionesAgrupadas` owns
 * `useMovimientos`), so this screen only derives its `anio` from the CURRENT
 * `viewModel.periodo` (`anioDePeriodo`) and forwards `onPeriodoChange` — the
 * SAME callback `ResumenPage` already threads from the router's
 * `Route.useNavigate()` for `PeriodoSelector`, reused verbatim rather than
 * inventing a second period-setting path. Clicking a month in the grid just
 * calls it with that month's `periodo`.
 *
 * A11y (ADR-018): this is the data screen's single page-level `<h1>` — kept
 * visually hidden (`sr-only`); "Distribución del gasto" stays the visible
 * subheading. `TransaccionesAgrupadas`'s group headings are `<h3>` so this
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

  // FIX 5: reset the highlight target when the month changes — otherwise
  // the OLD month's highlight would leak into the new month's panel.
  useEffect(() => {
    setBucketElegido(null)
  }, [viewModel.periodo])

  const entradasLeyenda: ReadonlyArray<LeyendaTajada> = [
    ...viewModel.distribucionGasto,
    { bucket: BUCKET_SIN_CATEGORIA },
  ]

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4">
      <h1 className="sr-only">Resumen mensual</h1>
      <IngresoCard totalIngreso={viewModel.totalIngreso} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
              Distribución del gasto
            </h2>
            <span data-testid="semaforo-global">
              <SemaforoBadge estadoSemaforo={viewModel.estadoGlobal} size={28} />
            </span>
          </div>

          <DistribucionPie
            tajadas={viewModel.distribucionGasto}
            targets={viewModel.targets}
            bucketSeleccionado={bucketElegido}
            onSelectBucket={setBucketElegido}
          />
          <LeyendaGasto
            tajadas={entradasLeyenda}
            bucketSeleccionado={bucketElegido}
            onSelectBucket={setBucketElegido}
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <TransaccionesAgrupadas periodo={viewModel.periodo} bucketResaltado={bucketElegido} />
        </div>
      </div>

      <ResumenAnual anio={anioDePeriodo(viewModel.periodo, new Date().getUTCFullYear())} onSelectPeriodo={onPeriodoChange} />
    </div>
  )
}
