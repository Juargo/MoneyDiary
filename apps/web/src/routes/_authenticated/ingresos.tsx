import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { IngresosMesPage } from '@/components/IngresosMesPage';
import { useIngresosMes } from '@/api/use-ingresos-mes';
import { normalizarPeriodo } from '@/domain/periodo';

export const Route = createFileRoute('/_authenticated/ingresos')({
  validateSearch: (search: Record<string, unknown>): { periodo?: string } => ({
    periodo: normalizarPeriodo(search.periodo),
  }),
  component: IngresosRoute,
});

/**
 * Thin container (buckets.$bucket.tsx precedent): a `createFileRoute`
 * component needs a live router context to call `Route.useSearch()` /
 * `useNavigate()`, which a unit test can't provide cheaply — so this file
 * stays untested (us-049/053 precedent). `IngresosMesPage` (which owns the
 * actual query + rendering) carries the component tests (T-10).
 *
 * `onPeriodoChange` functional updater keeps any future search params alive
 * across month navigation (WDI-03, US-053 D-04 mirror).
 */
function IngresosRoute() {
  const { periodo } = Route.useSearch();
  const navigate = useNavigate();
  const query = useIngresosMes(periodo);

  return (
    <IngresosMesPage
      query={query}
      periodo={periodo}
      onPeriodoChange={(nuevoPeriodo) =>
        navigate({
          to: '/ingresos',
          // D-04 / WDI-03: functional update preserves future search params
          // across month navigation (no params today beyond `periodo`).
          search: (prev) => ({ ...prev, periodo: nuevoPeriodo }),
        })
      }
    />
  );
}
