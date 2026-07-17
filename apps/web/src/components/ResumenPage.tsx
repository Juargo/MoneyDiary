import type { UseQueryResult } from '@tanstack/react-query'
import { Loading } from './states/Loading'
import { ErrorState } from './states/Error'
import { Empty } from './states/Empty'
import { ResumenScreen } from './ResumenScreen'
import { PeriodoSelector } from './PeriodoSelector'
import { aResumenViewModel } from '@/domain/resumen-view-model'
import type { ApiError } from '@/api/client'
import type { ResumenMesDto } from '@/api/types'

/**
 * Router-agnostic composition (spec W1-02): owns the 4-way
 * {loading|error|empty|data} state switch over a `useResumen` query result,
 * plus the period selector. Thin by design (mirrors
 * `apps/mobile/app/index.tsx`'s `renderEstado` switch) — the actual
 * TanStack Router wiring (`Route.useSearch()`/`Route.useNavigate()`) lives
 * in the container (`routes/index.tsx`) so this component stays testable
 * with a plain mocked query result, no router harness needed. `sinIngreso`
 * is a DATA outcome (200 with no income), not a fetch failure — checked
 * only after a successful query, same discipline as mobile.
 */
export function ResumenPage({
  query,
  periodo,
  onPeriodoChange,
}: {
  readonly query: UseQueryResult<ResumenMesDto, ApiError>
  readonly periodo: string | undefined
  readonly onPeriodoChange: (periodo: string) => void
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="mx-auto flex w-full max-w-xl justify-end">
        <PeriodoSelector periodo={periodo} onChange={onPeriodoChange} />
      </div>
      {renderEstado(query)}
    </div>
  )
}

function renderEstado(query: UseQueryResult<ResumenMesDto, ApiError>) {
  if (query.isPending) {
    return <Loading />
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  }
  if (query.data.sinIngreso) {
    return <Empty />
  }
  return <ResumenScreen viewModel={aResumenViewModel(query.data)} />
}
