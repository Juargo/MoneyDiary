import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import type { UseQueryResult } from '@tanstack/react-query';
import { HelpCircle } from 'lucide-react';
import { Loading } from './states/Loading';
import { ErrorState } from './states/Error';
import { Empty } from './states/Empty';
import { SemaforoBadge } from './SemaforoBadge';
import { BucketSemaforoCard } from './BucketSemaforoCard';
import { aSemaforoDetalleViewModel } from '@/domain/semaforo-detalle-view-model';
import { mesCompletoLabel } from '@/domain/periodo-anual';
import { useVolverAtras } from '@/lib/use-volver-atras';
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
 * back control lives HERE (not in the route container) so it is testable
 * without a real router harness carrying the full app tree — `search={{
 * periodo }}` is the CA-08 fix for the stub's dropped-periodo bug.
 *
 * "Volver" returns to real origin, not always "/" (issue #752,
 * `useVolverAtras`): `/semaforo` is reachable from more than the dashboard
 * (`/ayuda`'s "El semáforo" section links here too), so a hard-coded
 * `to="/"` silently discarded whichever screen the user actually came
 * from. `useVolverAtras()` is called HERE, in the real component, and its
 * `puedeVolver`/`volverAtras` are threaded into `renderEstado` as
 * parameters — `renderEstado` is a plain helper function, not a component,
 * so calling a hook INSIDE it directly would violate
 * `react-hooks/rules-of-hooks`.
 */
export function SemaforoDetallePage({
  query,
  periodo,
}: {
  readonly query: UseQueryResult<SemaforoDetalleDto, ApiError>;
  readonly periodo: string | undefined;
}) {
  const { puedeVolver, volverAtras } = useVolverAtras();
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      {renderEstado(query, periodo, puedeVolver, volverAtras)}
    </div>
  );
}

function renderEstado(
  query: UseQueryResult<SemaforoDetalleDto, ApiError>,
  periodo: string | undefined,
  puedeVolver: boolean,
  volverAtras: () => void,
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
          <h1 className="text-2xl font-medium text-foreground">Semáforo</h1>
          {/* SC 2.5.8 (WCAG 2.2 AA): un back link suelto es un TARGET, no
              texto dentro de una oración, así que la excepción *Inline* no lo
              alcanza. Medía 20px de alto — el mismo defecto pre-existente que
              el barrido E-11 de `mobile-floor.e2e.ts` ya encontró en
              `BucketDetalleMesPage` y en `IngresosMesPage`. Tercera aparición
              del mismo patrón, tercer arreglo idéntico: la variante `link` ES
              el className que este elemento ya tenía
              (`text-primary underline-offset-4 hover:underline`), así que el
              aspecto no cambia, y `size="sm"` le da un target real de 32px.
              `-mr-3` cancela el `px-3` de ese tamaño en el borde alineado para
              que el header no se corra.

              issue #752: `/semaforo` también se puede alcanzar desde
              `/ayuda`, no solo desde el dashboard — un `to="/"` fijo
              perdía esa procedencia. Con historial in-app, este control
              pasa a ser un botón real que llama a `router.history.back()`
              (etiqueta genérica "Volver": el destino real varía según de
              dónde vino el usuario). Sin historial (URL directa), se
              mantiene el `<Link>` de siempre — destino fijo conocido, así
              que su etiqueta específica sigue siendo honesta. */}
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
      {/* SC 2.5.8 otra vez, y peor que el back link: en `text-xs` esta línea
          medía ~16px de alto. NO se envuelve en `Button` como el de arriba —
          ninguna variante reproduce su aspecto (tinta atenuada, 12px, ícono
          al lado, subrayado sólo en hover), y forzar `link` la pintaría de
          `primary`, o `ghost` le metería un fondo en hover: en las dos el
          arreglo de accesibilidad se llevaría puesto el diseño. Como ya es
          `inline-flex items-center`, alcanza con `min-h-8`: la caja llega a
          32px y el contenido sigue centrado, sin mover un pixel del texto. */}
      <Link
        to="/ayuda"
        hash="ayuda-semaforo"
        className="inline-flex min-h-8 w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
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
              {/* Las dos cifras van en mono tabular aunque vivan dentro de una
                  oración; las palabras se quedan en sans. Mismo reparto que
                  hace el encabezado de grupo del libro mayor de `/buckets`. */}
              <p>
                <span className="font-mono tabular-nums">
                  {viewModel.sinCategoria.cantidad}
                </span>{' '}
                {viewModel.sinCategoria.cantidad === 1
                  ? 'movimiento'
                  : 'movimientos'}{' '}
                sin categoría por{' '}
                <span className="font-mono tabular-nums">
                  {viewModel.sinCategoria.total}
                </span>
                .
              </p>
              {/* Tercer link suelto de esta pantalla, y tercer caso de SC
                  2.5.8: hereda `text-xs` del aviso, o sea ~16px de alto. Mismo
                  remedio mínimo que el de ayuda — `inline-flex min-h-8
                  items-center` levanta la caja a 32px sin tocar la tipografía
                  ni el color, que acá los manda el `warning-foreground` del
                  aviso. */}
              <Link
                to="/buckets/$bucket"
                params={{ bucket: 'SinCategoria' }}
                search={{ periodo: viewModel.periodo }}
                className="inline-flex min-h-8 w-fit items-center font-medium underline underline-offset-4"
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
