import { createFileRoute } from '@tanstack/react-router';
import { useResumen } from '@/api/use-resumen';
import { ResumenPage } from '@/components/ResumenPage';
import { CLAVE_SIN_CATEGORIA, normalizarPeriodo } from '@/domain/periodo';

export const Route = createFileRoute('/_authenticated/')({
  validateSearch: (search: Record<string, unknown>): { periodo?: string } => ({
    periodo: normalizarPeriodo(search.periodo),
  }),
  component: HomePage,
});

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
  const { periodo } = Route.useSearch();
  const navigate = Route.useNavigate();
  const query = useResumen(periodo);

  // issue #747 PR2: an absent `periodo` no longer means "current month" —
  // the backend now resolves it to the user's last month WITH DATA
  // (fallback: current month when the user has none) and echoes the
  // resolved value back on `ResumenMesDto.periodo`. Everything that LABELS
  // or NAVIGATES by month must read that echo, not the raw (possibly
  // `undefined`) route search param — otherwise the header/drill-downs
  // would show/target the wrong month the instant the resolved month
  // differs from "now" (e.g. the user's last cartola was uploaded in July,
  // it is September). An explicit `?periodo=` in the URL keeps working as
  // the override: the backend always respects it and echoes it back
  // unchanged, so `periodoResuelto` degrades to it verbatim in that case.
  // While the query has no data yet (pending/error), this falls back to the
  // raw search param — same brief-loading-flash behavior as before.
  const periodoResuelto = query.data?.periodo ?? periodo;

  return (
    <ResumenPage
      query={query}
      periodo={periodoResuelto}
      onPeriodoChange={(nuevoPeriodo) =>
        navigate({ search: (prev) => ({ ...prev, periodo: nuevoPeriodo }) })
      }
      // US-053 (D-06): the chart controls' drill-down — navigate to the
      // month-scoped bucket page carrying the RESOLVED `periodo` and, for
      // the Sin categoría drill-down only, `destacar` (WDM-04, e2e case 4).
      // The `destacar` literal comes from the named constant (DRY,
      // D-01/D-08). The search type of `/buckets/$bucket` carries
      // `destacar` as a STRING on purpose (see that route's
      // `validateSearch`): the router serializes the validated output, so
      // the raw literal reaches the URL verbatim (`?destacar=sin-categoria`,
      // pinned by e2e case 4).
      onSelectBucket={(bucket, destacar) =>
        navigate({
          to: '/buckets/$bucket',
          params: { bucket },
          search: {
            periodo: periodoResuelto,
            ...(destacar && { destacar: CLAVE_SIN_CATEGORIA }),
          },
        })
      }
      // US-054 T-17 (D-05): Ingresos legend row drill-down — navigate to
      // the month-scoped /ingresos page carrying the RESOLVED `periodo`
      // (issue #747 PR2 — see the comment on `periodoResuelto` above).
      onSelectIngresos={() =>
        navigate({ to: '/ingresos', search: { periodo: periodoResuelto } })
      }
    />
  );
}
