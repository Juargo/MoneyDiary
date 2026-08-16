import { Info } from 'lucide-react';
import { useResumenAnual } from '@/api/use-resumen-anual';
import type { ApiError } from '@/api/client';
import type { ResumenAnualDto, ResumenMesDto } from '@/api/types';
import type { UseQueryResult } from '@tanstack/react-query';
import { Loading } from './states/Loading';
import { ErrorState } from './states/Error';
import { Empty } from './states/Empty';
import { MiniDistribucionPie } from './MiniDistribucionPie';
import { SemaforoBadge } from './SemaforoBadge';
import { calcularDistribucionGasto } from '@/domain/distribucion-gasto';
import {
  mesAbreviado,
  mesCompletoLabel,
  periodoActualUTC,
} from '@/domain/periodo-anual';
import { cn } from '@/lib/utils';
import { DASHBOARD_CARD_CLASS } from '@/lib/dashboard-card';

/**
 * ResumenAnual — the annual 50/30/20 grid below the 2-column dashboard
 * section (US-030 Slice C). Self-contained: owns its own `useResumenAnual`
 * query and its own Loading/Error/Empty states, mirroring `BucketDetailList`
 * (its own `useDetalleBucket`) — the annual load stays independent of the
 * main `/api/resumen` query that feeds the rest of the dashboard.
 *
 * `anio` is derived by the caller (`ResumenScreen`) from the currently
 * selected `periodo`'s year, so navigating months never jumps years.
 * `onSelectPeriodo` reuses the SAME period-setting path the `PeriodoSelector`
 * already uses (`ResumenPage`'s `onPeriodoChange`, threaded down through
 * `ResumenScreen`) — clicking a month with data just sets that periodo, no
 * new navigation mechanism.
 *
 * "Empty" here means every one of the 12 months came back `sinIngreso`
 * (no data at all this year) — distinct from an individual month being
 * `sinIngreso` (that month renders as a disabled cell instead).
 *
 * `ahora` defaults to `new Date()` but is injectable so tests can pin
 * "today" deterministically instead of mocking global `Date`.
 *
 * `periodoSeleccionado` (required, no default — US-048 D-11) is the period
 * the main chart is currently showing (`viewModel.periodo`); it drives the
 * selected-cell marker and the caption's dynamic month, and is kept strictly
 * separate from the `esActual`/today channel (`✓` + `aria-current`, D-04) —
 * both markers coexist on the same cell when the viewed month IS today.
 */
export function ResumenAnual({
  anio,
  periodoSeleccionado,
  onSelectPeriodo,
  ahora = new Date(),
}: {
  readonly anio: number;
  readonly periodoSeleccionado: string;
  readonly onSelectPeriodo: (periodo: string) => void;
  readonly ahora?: Date;
}) {
  const query = useResumenAnual(anio);
  const tituloId = `resumen-anual-titulo-${anio}`;

  return (
    <section
      aria-labelledby={tituloId}
      className={cn(DASHBOARD_CARD_CLASS, 'flex flex-col gap-4')}
    >
      <h2
        id={tituloId}
        className="text-xs font-semibold tracking-widest text-secondary uppercase"
      >
        Año {anio} — vista macro por mes
      </h2>
      {renderEstado({
        query,
        onSelectPeriodo,
        periodoActual: periodoActualUTC(ahora),
        periodoSeleccionado,
      })}
    </section>
  );
}

// D-12: named-argument object instead of four positional params —
// `periodoActual`/`periodoSeleccionado` are both `string`, adjacent, and
// semantically opposite; a positional swap would type-check and silently
// exchange "today" and "selected".
function renderEstado({
  query,
  onSelectPeriodo,
  periodoActual,
  periodoSeleccionado,
}: {
  query: UseQueryResult<ResumenAnualDto, ApiError>;
  onSelectPeriodo: (periodo: string) => void;
  periodoActual: string;
  periodoSeleccionado: string;
}) {
  if (query.isPending) {
    return <Loading message="Cargando resumen anual…" />;
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  if (query.data.meses.every((mes) => mes.sinIngreso)) {
    return (
      <Empty
        title="Todavía no hay datos este año"
        description="Carga cartolas de algún mes para ver tu resumen anual."
      />
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {query.data.meses.map((mes) => (
          <MesCelda
            key={mes.periodo}
            mes={mes}
            esActual={mes.periodo === periodoActual}
            esSeleccionado={mes.periodo === periodoSeleccionado}
            onSelectPeriodo={onSelectPeriodo}
          />
        ))}
      </div>
      {/* D-09: caption, data branch only, flex sibling of the grid. */}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info aria-hidden="true" size={14} className="shrink-0" />
        {`Toca un mes: el gráfico principal cambia a ese mes, con el mismo drill-down de siempre. Estás viendo ${mesCompletoLabel(periodoSeleccionado)}.`}
      </p>
    </>
  );
}

function MesCelda({
  mes,
  esActual,
  esSeleccionado,
  onSelectPeriodo,
}: {
  readonly mes: ResumenMesDto;
  readonly esActual: boolean;
  readonly esSeleccionado: boolean;
  readonly onSelectPeriodo: (periodo: string) => void;
}) {
  const tieneDatos = !mes.sinIngreso;
  const tajadas = calcularDistribucionGasto(mes.buckets);
  const etiquetaMes = mesAbreviado(mes.periodo);

  const contenido = (
    <>
      <span className="flex items-center gap-1 text-xs font-semibold tracking-wide">
        {etiquetaMes}
        {esActual && (
          <span data-testid="mes-actual-marker" aria-hidden="true">
            ✓
          </span>
        )}
      </span>
      {/* D-05: fixed h-16 w-16 reserved space, zero layout shift — the mint
          fill/border/testid only appear on the selected cell; the pie's own
          size (56) never changes. */}
      <span
        data-testid={esSeleccionado ? 'mes-seleccionado-marker' : undefined}
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-full',
          esSeleccionado && 'border-2 border-ingreso-foreground bg-ingreso',
        )}
      >
        <MiniDistribucionPie tajadas={tajadas} size={56} />
      </span>
      <SemaforoBadge estadoSemaforo={mes.estadoGlobal} size={20} />
    </>
  );

  if (!tieneDatos) {
    return (
      <div
        role="button"
        aria-disabled="true"
        // FIX 1: a sinIngreso month can still BE the current month ("today"
        // with no data yet) — the marker must survive even on the disabled
        // branch. No tabIndex/onClick: role="button" only announces "this is
        // an unavailable month cell" to AT, it does NOT make the cell
        // activatable by mouse or keyboard (FIX 3).
        aria-current={esActual ? 'date' : undefined}
        className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border bg-muted p-3 text-muted-foreground opacity-60"
      >
        {contenido}
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Ver ${mesCompletoLabel(mes.periodo)}`}
      aria-current={esActual ? 'date' : undefined}
      onClick={() => onSelectPeriodo(mes.periodo)}
      className={cn(
        // LOCKED (WCAG 1.4.11): focus ring stays outline-slate-800, matching
        // the pie slices/legend — do NOT re-tint.
        'flex flex-col items-center gap-1 rounded-lg border p-3 text-foreground transition hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-800',
        // D-04: `esActual` no longer drives any className — cell chrome is
        // exclusively the "selected" channel now.
        esSeleccionado
          ? 'border-2 border-ingreso-foreground bg-card'
          : 'border-border bg-card',
      )}
    >
      {contenido}
    </button>
  );
}
