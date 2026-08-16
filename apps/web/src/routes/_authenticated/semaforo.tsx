import { createFileRoute, Link } from '@tanstack/react-router';
import { normalizarPeriodo } from '@/domain/periodo';

/**
 * `/semaforo` — US-047 stub route (WG5-09, design D-07). Thin container
 * (same reasoning as `buckets.$bucket.tsx`/`routes/index.tsx`): a
 * `createFileRoute` component needs a live router context to call
 * `Route.useSearch()`, which a unit test can't provide cheaply — the
 * route-tree integration test (`src/test/semaforo-route.test.tsx`, T12)
 * covers this file directly with the REAL generated route tree instead.
 *
 * This is a US-049 stub: `SemaforoTag` (design D-06/WG5-07) already links
 * here from the dashboard, carrying `periodo` as a search param, so this
 * route MUST exist and MUST render an explicit non-blank "en construcción"
 * state before US-049 fills in its real content — never a blank page, never
 * a 404. Trigger to replace this file's body: US-049 landing. Do NOT delete
 * this route file while `SemaforoTag` still points at it.
 */
export const Route = createFileRoute('/_authenticated/semaforo')({
  validateSearch: (search: Record<string, unknown>): { periodo?: string } => ({
    periodo: normalizarPeriodo(search.periodo),
  }),
  component: SemaforoStub,
});

function SemaforoStub() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold text-foreground">Semáforo</h1>
      <p className="text-sm text-muted-foreground">
        Esta sección está en construcción. Vuelve pronto para ver el detalle
        completo de tu semáforo financiero.
      </p>
      <Link
        to="/"
        className="text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-800"
      >
        Volver al resumen
      </Link>
    </div>
  );
}
