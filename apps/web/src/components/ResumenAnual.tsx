import { useResumenAnual } from '@/api/use-resumen-anual'
import type { ApiError } from '@/api/client'
import type { ResumenAnualDto, ResumenMesDto } from '@/api/types'
import type { UseQueryResult } from '@tanstack/react-query'
import { Loading } from './states/Loading'
import { ErrorState } from './states/Error'
import { Empty } from './states/Empty'
import { MiniDistribucionPie } from './MiniDistribucionPie'
import { SemaforoBadge } from './SemaforoBadge'
import { calcularDistribucionGasto } from '@/domain/distribucion-gasto'
import { mesAbreviado, mesCompletoLabel, periodoActualUTC } from '@/domain/periodo-anual'
import { cn } from '@/lib/utils'

/**
 * ResumenAnual — the annual 50/30/20 grid below the 2-column dashboard
 * section (US-030 Slice C). Self-contained: owns its own `useResumenAnual`
 * query and its own Loading/Error/Empty states, mirroring `BucketDetailList`
 * (its own `useDetalleBucket`) — the annual load stays independent of the
 * main `/api/resumen` query that feeds the rest of the dashboard.
 *
 * `anio` is derived by the caller (`ResumenScreen`) from the currently
 * selected `periodo`'s year, so navigating months never jumps years.
 * `onSelectPeriodo` reuses the SAME period-setting path the `PeriodoSelector`
 * already uses (`ResumenPage`'s `onPeriodoChange`, threaded down through
 * `ResumenScreen`) — clicking a month with data just sets that periodo, no
 * new navigation mechanism.
 *
 * "Empty" here means every one of the 12 months came back `sinIngreso`
 * (no data at all this year) — distinct from an individual month being
 * `sinIngreso` (that month renders as a disabled cell instead).
 *
 * `ahora` defaults to `new Date()` but is injectable so tests can pin
 * "today" deterministically instead of mocking global `Date`.
 */
export function ResumenAnual({
  anio,
  onSelectPeriodo,
  ahora = new Date(),
}: {
  readonly anio: number
  readonly onSelectPeriodo: (periodo: string) => void
  readonly ahora?: Date
}) {
  const query = useResumenAnual(anio)
  const tituloId = `resumen-anual-titulo-${anio}`

  return (
    <section
      aria-labelledby={tituloId}
      className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5"
    >
      <h2 id={tituloId} className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
        Resumen Anual {anio}
      </h2>
      {renderEstado(query, onSelectPeriodo, periodoActualUTC(ahora))}
    </section>
  )
}

function renderEstado(
  query: UseQueryResult<ResumenAnualDto, ApiError>,
  onSelectPeriodo: (periodo: string) => void,
  periodoActual: string,
) {
  if (query.isPending) {
    return <Loading message="Cargando resumen anual…" />
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  }
  if (query.data.meses.every((mes) => mes.sinIngreso)) {
    return (
      <Empty title="Todavía no hay datos este año" description="Carga cartolas de algún mes para ver tu resumen anual." />
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {query.data.meses.map((mes) => (
        <MesCelda
          key={mes.periodo}
          mes={mes}
          esActual={mes.periodo === periodoActual}
          onSelectPeriodo={onSelectPeriodo}
        />
      ))}
    </div>
  )
}

function MesCelda({
  mes,
  esActual,
  onSelectPeriodo,
}: {
  readonly mes: ResumenMesDto
  readonly esActual: boolean
  readonly onSelectPeriodo: (periodo: string) => void
}) {
  const tieneDatos = !mes.sinIngreso
  const tajadas = calcularDistribucionGasto(mes.buckets)
  const etiquetaMes = mesAbreviado(mes.periodo)

  const contenido = (
    <>
      <span className="flex items-center gap-1 text-xs font-semibold tracking-wide">
        {etiquetaMes}
        {esActual && (
          <span data-testid="mes-actual-marker" aria-hidden="true">
            ✓
          </span>
        )}
      </span>
      <MiniDistribucionPie tajadas={tajadas} size={56} />
      <SemaforoBadge estadoSemaforo={mes.estadoGlobal} size={20} />
    </>
  )

  if (!tieneDatos) {
    return (
      <div
        role="button"
        aria-disabled="true"
        // FIX 1: a sinIngreso month can still BE the current month ("today"
        // with no data yet) — the marker must survive even on the disabled
        // branch. No tabIndex/onClick: role="button" only announces "this is
        // an unavailable month cell" to AT, it does NOT make the cell
        // activatable by mouse or keyboard (FIX 3).
        aria-current={esActual ? 'date' : undefined}
        className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-slate-400 opacity-60"
      >
        {contenido}
      </div>
    )
  }

  return (
    <button
      type="button"
      aria-label={`Ver ${mesCompletoLabel(mes.periodo)}`}
      aria-current={esActual ? 'date' : undefined}
      onClick={() => onSelectPeriodo(mes.periodo)}
      className={cn(
        'flex flex-col items-center gap-1 rounded-xl border p-3 text-slate-700 transition hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-800',
        esActual ? 'border-2 border-slate-800 bg-slate-50' : 'border-slate-200 bg-white',
      )}
    >
      {contenido}
    </button>
  )
}
