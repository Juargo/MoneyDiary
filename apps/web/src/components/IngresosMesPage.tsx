import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import type { UseQueryResult } from '@tanstack/react-query';
import { Loading } from './states/Loading';
import { ErrorState } from './states/Error';
import { Empty } from './states/Empty';
import { PeriodoSelector } from './PeriodoSelector';
import { IngresosMesTable } from './IngresosMesTable';
import { Button } from '@/components/ui/button';
import { useVolverAtras } from '@/lib/use-volver-atras';
import { aIngresosMesViewModel } from '@/domain/ingresos-mes-view-model';
import type { ApiError } from '@/api/client';
import type { IngresosMesDto } from '@/api/types';

const MENSAJE_DEMO_ELIMINAR =
  'Estás en una cuenta de demostración. Crea una cuenta real para eliminar movimientos.';

/**
 * IngresosMesPage — US-054 (T-10, D-04/D-10): página de ingresos del mes.
 * Router-agnostic (SemaforoDetallePage + BucketDetalleMesPage precedent): el
 * route (ingresos.tsx, T-11) es dueño del hook y pasa `query` como prop.
 *
 * Header: breadcrumb `nav aria-label="Ruta"` + a back control (`useVolverAtras`,
 * issue #752, `BucketDetalleMesPage` precedent — see that file's own
 * docblock for the full "why `useCanGoBack`" reasoning). **D-10 LOCKED: the
 * fallback is a raw `Link` (NOT `BotonVolver`) — carries `search={{ periodo
 * }}`** — US-053 case law: `BotonVolver` no puede llevar search params sin
 * perder el periodo en back-nav (CA-08 bug class); that constraint is about
 * the FALLBACK link specifically, the real-back branch never carries search
 * at all (browser history restores it). The `Link` itself is unchanged by
 * `ingresos-visual-rediseno`; it sits inside `<Button asChild variant="link"
 * size="sm">` (`BucketDetalleMesPage` precedent) purely for the 24×24 CSS px
 * target floor (SC 2.5.8) — the `link` variant reuses the SAME classes the
 * raw `<Link>` had before (`text-primary underline-offset-4 hover:underline`,
 * look unchanged), `size="sm"` is what actually grows the hit target, and
 * `-mr-3` cancels that size's `px-3` on the flush right edge so the header's
 * alignment does not shift. The real-back button reuses the exact same
 * classes for the exact same reason.
 *
 * Franja de totales (`ingresos-visual-rediseno`, Cambio 3): reemplaza la
 * línea de texto `{conteoLabel} · {totalLabel}` — dos celdas idénticas en
 * clases Y EN COPY a `BucketDetalleMesPage`'s totals strip: "Total del mes" /
 * `totalLabel` a la izquierda, "Movimientos" / `viewModel.conteo` (número, no
 * `conteoLabel` parseado) a la derecha. La etiqueta derecha dice
 * "Movimientos", no "Ingresos": la franja es la misma pieza en las dos
 * pantallas y debe leerse igual, cada fila ES un movimiento, y "Ingresos" ya
 * lo dicen el `<h1>` y el breadcrumb de esta página.
 *
 * Empty state: `<Empty>` con copy "Sin ingresos en {mes}" — sin tabla (WDI-04).
 * NO prefetch de catálogo (WDI-06 — sin reclasificación en esta pantalla).
 * Nota estática: "Sin meta ni semáforo: los ingresos no participan del 50/30/20 como gasto".
 *
 * Delete affordance (SDD `correccion-movimientos-manuales` PR 3, WEB-DEL-01,
 * D-03): `esDemo` arrives from the route's `Route.useRouteContext()` (D-12
 * idiom, `RegistrarMovimientoForm`/`registrar.tsx` precedent) — no extra
 * `fetchMe()` call here. A successful row delete is announced via a stable
 * `role="status"` region OUTSIDE the table (survives the deleted row's own
 * unmount, `EliminarIngestaControl`/`ListaIngestas` precedent) and focus
 * moves to the `<h1>` (the trigger that was focused unmounts with its row).
 */
export function IngresosMesPage({
  query,
  periodo,
  onPeriodoChange,
  esDemo = false,
}: {
  readonly query: UseQueryResult<IngresosMesDto, ApiError>;
  readonly periodo: string | undefined;
  readonly onPeriodoChange: (periodo: string) => void;
  readonly esDemo?: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { puedeVolver, volverAtras } = useVolverAtras();
  const [anuncio, setAnuncio] = useState('');

  function alEliminar() {
    setAnuncio('Movimiento eliminado.');
    headingRef.current?.focus();
  }

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
            <span className="font-medium text-foreground">Ingresos</span>
          </nav>
          {/* issue #752: real back when there is in-app history to return
              to; otherwise the D-10 LOCKED raw Link fallback (NOT
              BotonVolver) — carries search={{ periodo }} so a direct-URL
              arrival still preserves the month on its fixed destination
              (see docblock above). Both wrapped in Button asChild/onClick
              purely for the 24×24 CSS px target floor (BucketDetalleMesPage
              precedent). */}
          {puedeVolver ? (
            <Button
              variant="link"
              size="sm"
              className="-mr-3 font-medium"
              onClick={volverAtras}
            >
              Volver
            </Button>
          ) : (
            <Button
              asChild
              variant="link"
              size="sm"
              className="-mr-3 font-medium"
            >
              <Link to="/" search={{ periodo }}>
                Volver al resumen
              </Link>
            </Button>
          )}
        </div>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Ingresos
        </h1>
        <PeriodoSelector periodo={periodo} onChange={onPeriodoChange} />
        <p className="text-sm text-muted-foreground">
          Sin meta ni semáforo: los ingresos no participan del 50/30/20 como
          gasto
        </p>
        <div className="flex items-end justify-between gap-6 border-t-2 border-b border-foreground border-b-border pt-3 pb-3.5">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              Total del mes
            </span>
            <span className="font-mono text-2xl font-medium tabular-nums text-foreground">
              {viewModel.totalLabel}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            {/* "Movimientos", no "Ingresos": esta celda es byte-idéntica a la
                de `BucketDetalleMesPage`, que es el punto del rediseño, y cada
                fila de la tabla ES un movimiento. Llamarla "Ingresos" repetía
                por tercera vez una palabra que ya dicen el `<h1>` y el
                breadcrumb — y esa ambigüedad se pagaba en los tests, que
                necesitaban recorrer el DOM para distinguir las tres. Un
                selector frágil suele delatar UI ambigua, no un problema de
                testing. */}
            <span className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              Movimientos
            </span>
            <span className="font-mono text-2xl font-medium tabular-nums text-foreground">
              {viewModel.conteo}
            </span>
          </div>
        </div>
      </header>

      <span role="status" aria-live="polite" className="sr-only">
        {anuncio}
      </span>
      {esDemo && (
        <p role="note" className="text-sm text-muted-foreground">
          {MENSAJE_DEMO_ELIMINAR}
        </p>
      )}

      {viewModel.filas.length === 0 ? (
        <Empty
          title={`Sin ingresos en ${viewModel.mesLabel}`}
          description="No hay ingresos registrados para este período."
        />
      ) : (
        <IngresosMesTable
          mes={viewModel.mesLabel}
          periodoLabel={viewModel.periodoLabel}
          filas={viewModel.filas}
          esDemo={esDemo}
          onEliminado={alEliminar}
        />
      )}
    </div>
  );
}
