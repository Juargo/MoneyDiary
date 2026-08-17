import { createFileRoute } from '@tanstack/react-router';
import { useSemaforoDetalle } from '@/api/use-semaforo-detalle';
import { SemaforoDetallePage } from '@/components/SemaforoDetallePage';
import { normalizarPeriodo } from '@/domain/periodo';

/**
 * `/semaforo` — US-049 real page (WSEM-01..08, design §1.7). Thin container
 * (same reasoning as `routes/_authenticated/index.tsx` /
 * `buckets.$bucket.tsx`): a `createFileRoute` component needs a live router
 * context to call `Route.useSearch()`, which a unit test can't provide
 * cheaply — the route-tree integration test
 * (`src/test/semaforo-route.test.tsx`) covers this file directly with the
 * REAL generated route tree instead. `validateSearch` is unchanged from the
 * US-047 stub. Replaces the "en construcción" placeholder (WG5-09, now
 * removed — superseded by `WSEM-01..08`).
 */
export const Route = createFileRoute('/_authenticated/semaforo')({
  validateSearch: (search: Record<string, unknown>): { periodo?: string } => ({
    periodo: normalizarPeriodo(search.periodo),
  }),
  component: SemaforoRoute,
});

function SemaforoRoute() {
  const { periodo } = Route.useSearch();
  const query = useSemaforoDetalle(periodo);

  return <SemaforoDetallePage query={query} periodo={periodo} />;
}
