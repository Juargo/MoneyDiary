import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { BucketDetalleMesPage } from '@/components/BucketDetalleMesPage';
import { useDetalleBucketMes } from '@/api/use-detalle-bucket-mes';
import { normalizarDestacar, normalizarPeriodo } from '@/domain/periodo';

export const Route = createFileRoute('/_authenticated/buckets/$bucket')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { periodo?: string; destacar?: string } => ({
    periodo: normalizarPeriodo(search.periodo),
    // D-01: strict, fail-closed — the highlight is opt-in by the exact
    // literal 'sin-categoria' only; everything else (incl. absent) → absent
    // (`undefined`), so a falsy default never serializes into the URL
    // (`/buckets/Necesidades`, not `/buckets/Necesidades?destacar=false` —
    // pinned by the real-tree redirect test in redirect-after-login.test.tsx).
    //
    // `destacar` stays a STRING in the search type on purpose: TanStack
    // Router serializes the VALIDATED output of `validateSearch`, so the
    // raw literal must round-trip through this return type for the URL to
    // carry `?destacar=sin-categoria` (the component below derives the
    // boolean for the page prop; the e2e case 4 pins the serialized URL).
    destacar: normalizarDestacar(search.destacar),
  }),
  component: BucketDetalleRoute,
});

/**
 * Thin container (same reasoning as `routes/index.tsx` and the us-049/`buckets`
 * predecessor): a `createFileRoute` component needs a live router context to
 * call `Route.useParams()`/`Route.useSearch()`/`useNavigate()`, which a unit
 * test can't provide cheaply — so this file stays untested (us-049 precedent,
 * D-04), and `BucketDetalleMesPage` (which owns the actual query + rendering)
 * carries the component tests. US-053 replaces the US-047 `BucketDetailList`
 * panel here.
 */
function BucketDetalleRoute() {
  const { bucket } = Route.useParams();
  const { periodo, destacar } = Route.useSearch();
  const navigate = useNavigate();
  const query = useDetalleBucketMes(bucket, periodo);

  return (
    <BucketDetalleMesPage
      query={query}
      periodo={periodo}
      onPeriodoChange={(nuevoPeriodo) =>
        navigate({
          to: '/buckets/$bucket',
          params: { bucket },
          // D-04: `destacar` is a transient drill-down affordance — month
          // changes reset it (search carries only the new periodo).
          search: { periodo: nuevoPeriodo },
        })
      }
      destacar={destacar !== undefined}
    />
  );
}
