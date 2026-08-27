import { Link } from '@tanstack/react-router';
import type { UseQueryResult } from '@tanstack/react-query';
import { Loading } from './states/Loading';
import { ErrorState } from './states/Error';
import { Empty } from './states/Empty';
import { PeriodoSelector } from './PeriodoSelector';
import { IngresosMesTable } from './IngresosMesTable';
import { aIngresosMesViewModel } from '@/domain/ingresos-mes-view-model';
import type { ApiError } from '@/api/client';
import type { IngresosMesDto } from '@/api/types';

/**
 * IngresosMesPage — US-054 (T-10, D-04/D-10): página de ingresos del mes.
 * Router-agnostic (SemaforoDetallePage + BucketDetalleMesPage precedent): el
 * route (ingresos.tsx, T-11) es dueño del hook y pasa `query` como prop.
 *
 * Header: breadcrumb `nav aria-label="Ruta"` + back `Link to="/" search={{ periodo }}`
 * "Volver al resumen" con clases D-10 LOCKED (24×24 CSS px floor + accname visible).
 * NO BotonVolver — US-053 case law: BotonVolver no puede llevar search params
 * sin perder el periodo en back-nav (CA-08 bug class).
 *
 * Empty state: `<Empty>` con copy "Sin ingresos en {mes}" — sin tabla (WDI-04).
 * NO prefetch de catálogo (WDI-06 — sin reclasificación en esta pantalla).
 * Nota estática: "Sin meta ni semáforo: los ingresos no participan del 50/30/20 como gasto".
 */
export function IngresosMesPage({
  query,
  periodo,
  onPeriodoChange,
}: {
  readonly query: UseQueryResult<IngresosMesDto, ApiError>;
  readonly periodo: string | undefined;
  readonly onPeriodoChange: (periodo: string) => void;
}) {
  if (query.isPending) {
    return <Loading message="Cargando ingresos…" />;
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  const viewModel = aIngresosMesViewModel(query.data, periodo);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav aria-label="Ruta" className="text-sm text-muted-foreground">
            Dashboard <span aria-hidden="true">/</span>{' '}
            <span className="font-semibold text-foreground">Ingresos</span>
          </nav>
          {/* D-10 LOCKED: raw Link (NOT BotonVolver) — carries search={{ periodo }}
              so back-nav preserves the month. py-1 + text-sm line-height ≥24 CSS px
              (WDI-01 target floor). The visible text is the accname (WCTM-04). */}
          <Link
            to="/"
            search={{ periodo }}
            className="px-2 py-1 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            Volver al resumen
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Ingresos</h1>
        <PeriodoSelector periodo={periodo} onChange={onPeriodoChange} />
        <p className="text-sm text-muted-foreground">
          {viewModel.conteoLabel} · {viewModel.totalLabel}
        </p>
        <p className="text-sm text-muted-foreground">
          Sin meta ni semáforo: los ingresos no participan del 50/30/20 como
          gasto
        </p>
      </header>

      {viewModel.filas.length === 0 ? (
        <Empty
          title={`Sin ingresos en ${viewModel.mesLabel}`}
          description="No hay ingresos registrados para este período."
        />
      ) : (
        <IngresosMesTable mes={viewModel.mesLabel} filas={viewModel.filas} />
      )}
    </div>
  );
}
