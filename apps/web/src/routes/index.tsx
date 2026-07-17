import { createFileRoute } from '@tanstack/react-router'
import { useResumen } from '@/api/use-resumen'
import { ResumenPage } from '@/components/ResumenPage'

/**
 * `YYYY-MM` only (backend contract). A malformed/absent search param falls
 * back to `undefined` — `useResumen(undefined)` calls `/api/resumen` without
 * a query param, and the backend resolves the current month (spec: invalid
 * `periodo` never throws client-side, W1.8).
 */
const PERIODO_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

function normalizarPeriodo(raw: unknown): string | undefined {
  return typeof raw === 'string' && PERIODO_REGEX.test(raw) ? raw : undefined
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { periodo?: string } => ({
    periodo: normalizarPeriodo(search.periodo),
  }),
  component: HomePage,
})

/**
 * Thin container (CLAUDE.md container/presentational pattern): owns the
 * TanStack Router period search param + the `useResumen` query, delegates
 * the {loading|error|empty|data} state switch to the router-agnostic
 * `ResumenPage`. No money math, no JSX composition beyond wiring — that's
 * why `ResumenPage`/`ResumenScreen` carry the component tests instead of
 * this file (a `createFileRoute` component needs a live router context to
 * call `Route.useSearch()`, which a unit test can't provide cheaply).
 */
function HomePage() {
  const { periodo } = Route.useSearch()
  const navigate = Route.useNavigate()
  const query = useResumen(periodo)

  return (
    <ResumenPage
      query={query}
      periodo={periodo}
      onPeriodoChange={(nuevoPeriodo) =>
        navigate({ search: (prev) => ({ ...prev, periodo: nuevoPeriodo }) })
      }
    />
  )
}
