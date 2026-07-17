import { Badge } from '@/components/ui/badge'
import { IngresoCard } from './IngresoCard'
import { SemaforoBadge } from './SemaforoBadge'
import type { ResumenViewModel } from '@/domain/resumen-view-model'

/**
 * Data-state composition (spec W1-02/W2-01/W2-03): income + the 50/30/20
 * distribution rendered together, above the fold. DOM port of
 * `apps/mobile/src/components/ResumenScreen.tsx`, minus the pie chart (no
 * `distribucionGasto` in the web view-model — deferred, design.md YAGNI
 * call). Pure presentation: consumes already-formatted strings and the
 * backend-computed semáforo state verbatim, no money math, no fetch. The
 * "Distribución del gasto" heading and `data-testid="semaforo-global"` are
 * the e2e anchors (mirrors the mobile Maestro anchor).
 *
 * A11y (ADR-018): this is the data screen's single page-level `<h1>` — the
 * document previously started at `<h2>`, which breaks the heading outline
 * for assistive technology. Visually hidden (`sr-only`); "Distribución del
 * gasto" stays the visible subheading.
 */
export function ResumenScreen({ viewModel }: { readonly viewModel: ResumenViewModel }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 p-4">
      <h1 className="sr-only">Resumen mensual</h1>
      <IngresoCard totalIngreso={viewModel.totalIngreso} />

      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
            Distribución del gasto
          </h2>
          <span data-testid="semaforo-global">
            <SemaforoBadge estadoSemaforo={viewModel.estadoGlobal} size={28} />
          </span>
        </div>

        <ul className="flex flex-col gap-2">
          {viewModel.buckets.map((bucket) => (
            <li
              key={bucket.bucket}
              className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0"
            >
              <div className="flex items-center gap-2">
                <SemaforoBadge estadoSemaforo={bucket.estadoSemaforo} size={24} />
                <span className="text-sm font-medium text-slate-700">{bucket.bucket}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-900">{bucket.total}</span>
                <Badge variant="secondary">{bucket.porcentajeLabel}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
