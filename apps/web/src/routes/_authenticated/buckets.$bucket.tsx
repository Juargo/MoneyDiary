import { createFileRoute } from '@tanstack/react-router'
import { BucketDetailList } from '@/components/BucketDetailList'
import { normalizarPeriodo } from '@/domain/periodo'

export const Route = createFileRoute('/_authenticated/buckets/$bucket')({
  validateSearch: (search: Record<string, unknown>): { periodo?: string } => ({
    periodo: normalizarPeriodo(search.periodo),
  }),
  component: BucketDetailRoute,
})

/**
 * Thin container (same reasoning as `routes/index.tsx`): a `createFileRoute`
 * component needs a live router context to call `Route.useParams()`/
 * `Route.useSearch()`, which a unit test can't provide cheaply — so this
 * file stays untested, and `BucketDetailList` (which owns the actual query
 * + rendering) carries the component tests.
 */
function BucketDetailRoute() {
  const { bucket } = Route.useParams()
  const { periodo } = Route.useSearch()

  return <BucketDetailList bucket={bucket} periodo={periodo} />
}
