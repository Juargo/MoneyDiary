import { Link } from '@tanstack/react-router';
import type { UseQueryResult } from '@tanstack/react-query';
import { Loading } from './states/Loading';
import { ErrorState } from './states/Error';
import { Empty } from './states/Empty';
import { PeriodoSelector } from './PeriodoSelector';
import { GrupoMovimientos } from './GrupoMovimientos';
import { useCategorias } from '@/api/use-categorias';
import { aDetalleBucketMesViewModel } from '@/domain/detalle-bucket-mes-view-model';
import { mesCompletoLabel } from '@/domain/periodo-anual';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import type { ApiError } from '@/api/client';
import type { DetalleBucketMesDto } from '@/api/types';

/**
 * BucketDetalleMesPage — US-053 real page for a single bucket/month over the
 * GROUPED endpoint (`useDetalleBucketMes`, `/api/buckets/:bucket/detalle`,
 * MBD-09): WDM-01 header, WDM-03 grouped rows (delegated to
 * `GrupoMovimientos`), WDM-04 `destacar` highlight, WDM-05 empty month,
 * WCAT-04 per-row reclassify (via `GrupoMovimientos`).
 *
 * Router-agnostic (SemaforoDetallePage precedent, D-09): the route
 * (buckets.$bucket.tsx, T-10) owns the query hook + search-param parsing and
 * hands this component `query` / `periodo` / `onPeriodoChange` / `destacar`.
 * The back-link `to="/" search={{ periodo }}` lives HERE, not in the route —
 * so the navigation contract is testable without the route tree (D-09).
 *
 * Grouped wire shape → view-model: `aDetalleBucketMesViewModel` (domain,
 * T-06) maps `DetalleBucketMesDto` → `DetalleBucketMesViewModel` —
 * BigInt-exact CLP labels via `formatearMontoCLP`, `porcentajeBp`/`metaBp`
 * null → `SIN_PORCENTAJE_LABEL` ('—') + `sinPorcentaje`/`sinMeta` flags
 * (D-02: the usage bar renders only when `porcentajeBp !== null`; the %/meta
 * tag only when `metaBp !== null`). `clampBp` keeps marker positions within
 * the track (T-06).
 *
 * **Catálogo — fetch-lifecycle surface owned HERE, once per page** (WCAT-04
 * delta): this page is
 * `ReclasificarCategoriaControl`'s ONLY render site for the new screen, and
 * every mounted instance plus this component share the exact same
 * `['categorias']` query (`use-categorias.ts`). Calling `useCategorias()`
 * here adds one more *observer* on that shared query, not a second network
 * request — TanStack Query dedupes by `queryKey` (per-key guarantee). The
 * page's own call fires `GET /api/categorias` unconditionally (above the
 * early returns — prefetch by design:
 * gating it behind resolved non-empty transactions would slow the common
 * path to save one GET on a deduped key in two infrequent states). The
 * `role="status"` / `role="alert"` + "Reintentar" surface renders ONCE per
 * page (not N per row) and lives above the transactions header — but BELOW
 * the transactions' own loading/error early returns, so a failed
 * transactions fetch never double-renders an alert for the catalog.
 */
export function BucketDetalleMesPage({
  query,
  periodo,
  onPeriodoChange,
  destacar,
}: {
  readonly query: UseQueryResult<DetalleBucketMesDto, ApiError>;
  readonly periodo: string | undefined;
  readonly onPeriodoChange: (periodo: string) => void;
  readonly destacar: boolean;
}) {
  const categoriasQuery = useCategorias();

  if (query.isPending) {
    return <Loading message="Cargando movimientos…" />;
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  const viewModel = aDetalleBucketMesViewModel(query.data);
  const etiqueta = ETIQUETA_BUCKET[viewModel.bucket] ?? viewModel.bucket;
  const mesLabel = mesCompletoLabel(viewModel.periodo);

  const categoriasCargandoInicial =
    categoriasQuery.data === undefined && categoriasQuery.isFetching;
  const categoriasFallidasSinDatos =
    categoriasQuery.data === undefined && categoriasQuery.error !== null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      {categoriasCargandoInicial && (
        <p role="status" className="sr-only">
          Cargando categorías…
        </p>
      )}
      {categoriasFallidasSinDatos && categoriasQuery.error && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-red-600">
          <p role="alert">{categoriasQuery.error.message}</p>
          {/* No `disabled` binding on retry — same dead-code reasoning as
              the retired flat chain's retry (judgment-day finding): TanStack
              Query resets a
              still-dataless query's `error` to `null` at the START of every
              fetch attempt, so this block unmounts the instant a retry
              begins (replaced by the `role="status"` block above). */}
          <button
            type="button"
            onClick={() => void categoriasQuery.refetch()}
            className="underline"
          >
            Reintentar
          </button>
        </div>
      )}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav aria-label="Ruta" className="text-sm text-muted-foreground">
            Dashboard <span aria-hidden="true">/</span>{' '}
            <span className="font-semibold text-foreground">{etiqueta}</span>
          </nav>
          <Link
            to="/"
            search={{ periodo }}
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            Volver al resumen
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-foreground">{etiqueta}</h1>
        <PeriodoSelector periodo={periodo} onChange={onPeriodoChange} />
        {!viewModel.sinMeta && (
          <p className="text-sm font-semibold text-foreground">
            {viewModel.porcentajeLabel} · Meta: {viewModel.metaLabel}
          </p>
        )}
        {!viewModel.sinPorcentaje && (
          <div
            aria-hidden="true"
            data-testid="usage-bar"
            className="relative h-1.5 w-full rounded-full bg-muted"
          >
            <span
              className="absolute top-0 h-1.5 w-0.5 rounded-full bg-foreground"
              style={{ left: `${viewModel.marcaPorcentajePct}%` }}
            />
            {viewModel.marcaMetaPct !== null && (
              <span
                className="absolute top-0 h-1.5 w-0.5 rounded-full bg-primary"
                style={{ left: `${viewModel.marcaMetaPct}%` }}
              />
            )}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Total {viewModel.totalLabel} · {viewModel.totalTransacciones}{' '}
          {viewModel.totalTransacciones === 1 ? 'movimiento' : 'movimientos'}
        </p>
      </header>

      {viewModel.grupos.length === 0 ? (
        <Empty
          title={`Sin movimientos en ${mesLabel}`}
          description="No hay movimientos en este bucket para el período."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {viewModel.grupos.map((grupo) => (
            <GrupoMovimientos
              key={grupo.categoriaId ?? 'sin-categoria'}
              grupo={grupo}
              destacar={destacar && grupo.categoriaId === null}
              bucketActual={viewModel.bucket}
              periodo={periodo}
            />
          ))}
        </div>
      )}
    </div>
  );
}
