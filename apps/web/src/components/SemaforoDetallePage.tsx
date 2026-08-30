import { Link } from '@tanstack/react-router';
import type { UseQueryResult } from '@tanstack/react-query';
import { HelpCircle } from 'lucide-react';
import { Loading } from './states/Loading';
import { ErrorState } from './states/Error';
import { Empty } from './states/Empty';
import { SemaforoBadge } from './SemaforoBadge';
import { BucketSemaforoCard } from './BucketSemaforoCard';
import { aSemaforoDetalleViewModel } from '@/domain/semaforo-detalle-view-model';
import { mesCompletoLabel } from '@/domain/periodo-anual';
import type { ApiError } from '@/api/client';
import type { SemaforoDetalleDto } from '@/api/types';

/**
 * SemaforoDetallePage — router-agnostic composition for `/semaforo`
 * (US-049, design §1.7, WSEM-01..08). Owns the {loading|error|data} state
 * switch over a `useSemaforoDetalle` query result (same discipline as
 * `ResumenPage`), and composes: header (month + STATIC `SemaforoBadge` —
 * adopted here, closing issue #382 — + the backend `diagnostico` verbatim),
 * the CA-03 worst-of-3 explainer, three `BucketSemaforoCard`s, the Sin
 * categoría notice (CA-06), and the `sinIngreso` branch (CA-07). The
 * "Volver al resumen" back-link lives HERE (not in the route container) so
 * it is testable without a real router harness carrying the full app tree —
 * `search={{ periodo }}` is the CA-08 fix for the stub's dropped-periodo bug.
 */
export function SemaforoDetallePage({
  query,
  periodo,
}: {
  readonly query: UseQueryResult<SemaforoDetalleDto, ApiError>;
  readonly periodo: string | undefined;
}) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      {renderEstado(query, periodo)}
    </div>
  );
}

function renderEstado(
  query: UseQueryResult<SemaforoDetalleDto, ApiError>,
  periodo: string | undefined,
) {
  if (query.isPending) {
    return <Loading message="Cargando semáforo…" />;
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  const viewModel = aSemaforoDetalleViewModel(query.data);
  const mesLabel = mesCompletoLabel(viewModel.periodo);

  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Semáforo</h1>
          <Link
            to="/"
            search={{ periodo }}
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            Volver al resumen
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <SemaforoBadge estadoSemaforo={viewModel.estadoGlobal} size={40} />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-muted-foreground">
              {mesLabel}
            </span>
            <p className="text-sm text-foreground">{viewModel.diagnostico}</p>
          </div>
        </div>
      </header>

      <p className="text-xs text-muted-foreground">
        Tu semáforo global es el peor de los tres grupos: si un grupo está en
        peligro, todo el mes queda en peligro.
      </p>
      {/* Design critique round-8, P2-B: quiet contextual help next to the
          worst-of-3 explainer — links to the same rule in `/ayuda`'s
          "El semáforo" section (`AyudaPage.tsx` copies this exact sentence
          so the two never drift, per that file's own docblock). */}
      <Link
        to="/ayuda"
        hash="ayuda-semaforo"
        className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <HelpCircle aria-hidden="true" className="size-3.5" />
        Ayuda: cómo se calcula el semáforo
      </Link>

      {viewModel.sinIngreso ? (
        // P1 design-critique fix: same "Subir cartola" CTA as
        // `SemaforoHeroCard`'s own sinDatos state and `ResumenPage`'s
        // first-run empty state — upload IS the true next step here too.
        <Empty
          title="Este mes no tiene ingresos registrados"
          description="Carga una cartola para ver tu semáforo del mes."
          accion={{ label: 'Subir cartola', to: '/subir' }}
        />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {viewModel.buckets.map((bucket) => (
              <BucketSemaforoCard key={bucket.bucket} viewModel={bucket} />
            ))}
          </div>

          {viewModel.sinCategoria.cantidad > 0 && (
            <div className="rounded-lg border border-warning-border bg-warning p-3 text-xs text-warning-foreground">
              <p>
                {viewModel.sinCategoria.cantidad}{' '}
                {viewModel.sinCategoria.cantidad === 1
                  ? 'movimiento'
                  : 'movimientos'}{' '}
                sin categoría por {viewModel.sinCategoria.total}.
              </p>
              <Link
                to="/buckets/$bucket"
                params={{ bucket: 'SinCategoria' }}
                search={{ periodo: viewModel.periodo }}
                className="font-semibold underline underline-offset-4"
              >
                Ver los movimientos sin categoría
              </Link>
            </div>
          )}
        </>
      )}
    </>
  );
}
