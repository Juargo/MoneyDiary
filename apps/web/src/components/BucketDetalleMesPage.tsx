import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import type { UseQueryResult } from '@tanstack/react-query';
import { Loading } from './states/Loading';
import { ErrorState } from './states/Error';
import { Empty } from './states/Empty';
import { PeriodoSelector } from './PeriodoSelector';
import { GrupoMovimientos } from './GrupoMovimientos';
import { ReevaluarPatronesControl } from './ReevaluarPatronesControl';
import { AgregarCategoriaControl } from './AgregarCategoriaControl';
import { Button } from '@/components/ui/button';
import { useCategorias } from '@/api/use-categorias';
import { BUCKETS_ASIGNABLES } from '@/api/catalogo-constantes';
import { aDetalleBucketMesViewModel } from '@/domain/detalle-bucket-mes-view-model';
import { mesAbreviadoConAnio, mesCompletoLabel } from '@/domain/periodo-anual';
import { CLAVE_SIN_CATEGORIA } from '@/domain/periodo';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import type { ApiError } from '@/api/client';
import type {
  CategoriaDto,
  DetalleBucketMesDto,
  ReevaluarCategoriasDto,
} from '@/api/types';

/**
 * BucketDetalleMesPage — US-053 real page for a single bucket/month over the
 * GROUPED endpoint (`useDetalleBucketMes`, `/api/buckets/:bucket/detalle`,
 * MBD-09): WDM-01 header, WDM-03 grouped rows (delegated to
 * `GrupoMovimientos`), WDM-04 `destacar` highlight, WDM-05 empty month,
 * WCAT-04 per-row reclassify (via `GrupoMovimientos`). The header also
 * mounts `ReevaluarPatronesControl` (next to `PeriodoSelector`) — a
 * page-level, ALL-periods bulk reclassify against
 * `POST /api/transacciones/reevaluar`, distinct from the per-row reclassify
 * above.
 *
 * Router-agnostic (SemaforoDetallePage precedent, D-09): the route
 * (buckets.$bucket.tsx, T-10) owns the query hook + search-param parsing and
 * hands this component `query` / `periodo` / `onPeriodoChange` / `destacar`.
 * The back-link `to="/" search={{ periodo }}` lives HERE, not in the route —
 * so the navigation contract is testable without the route tree (D-09).
 *
 * Grouped wire shape → view-model: `aDetalleBucketMesViewModel` (domain,
 * T-06) maps `DetalleBucketMesDto` → `DetalleBucketMesViewModel` —
 * BigInt-exact CLP labels via `formatearMontoCLP`.
 *
 * ⚠️ bucket-detalle-lista-rediseño (Cambio 2): the %/meta TAG and the usage
 * bar (old D-02: `porcentajeLabel`/`metaLabel`/`sinPorcentaje`/`sinMeta`/
 * `marcaPorcentajePct`/`marcaMetaPct`) are RETIRED — the view model no
 * longer maps those fields at all (see `detalle-bucket-mes-view-model.ts`).
 * The header's totals line is replaced by a two-cell totals STRIP ("Total
 * del mes" / `totalLabel`, "Movimientos" / `totalTransacciones`) — the
 * total becomes the page's one large figure. Each `GrupoMovimientos` also
 * receives `periodoLabel={mesAbreviadoConAnio(viewModel.periodo)}` — derived
 * from the VIEW MODEL's periodo (always present), never the route's own
 * `periodo` prop (can be `undefined` on first paint) — so the month/year
 * appears once per group's own column header instead of nowhere.
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
const MENSAJE_DEMO_ELIMINAR =
  'Estás en una cuenta de demostración. Crea una cuenta real para eliminar movimientos.';

export function BucketDetalleMesPage({
  query,
  periodo,
  onPeriodoChange,
  destacar,
  esDemo = false,
}: {
  readonly query: UseQueryResult<DetalleBucketMesDto, ApiError>;
  readonly periodo: string | undefined;
  readonly onPeriodoChange: (periodo: string) => void;
  readonly destacar: boolean;
  readonly esDemo?: boolean;
}) {
  const categoriasQuery = useCategorias();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Page-owned reclassify announcement (D-07; extended to same-bucket by
  // confirmacion-reclasificar, issue #749): persists until replaced by a
  // subsequent reclassify (cross-bucket OR same-bucket), a period change, or
  // page unmount. No timer, no auto-clear on inactivity, no `setTimeout`
  // state machine (KISS). The `role="status"` region re-announces on every
  // content change.
  //
  // Period-change clearing: `periodoAnterior` shadows the previous render's
  // `periodo`. When they differ, `setAnuncio('')` is called during this render
  // (React's "setState during render" path — safe because it immediately
  // triggers a synchronous re-render before the browser paints, documented in
  // the React team's "Adjusting some state when a prop changes" pattern). The
  // `periodoAnterior` state is updated in the same conditional to stay in sync.
  const [periodoAnterior, setPeriodoAnterior] = useState(periodo);
  const [anuncio, setAnuncio] = useState('');
  if (periodoAnterior !== periodo) {
    setPeriodoAnterior(periodo);
    setAnuncio('');
  }

  // Reused for BOTH cross-bucket AND same-bucket reclassify (confirmacion-
  // reclasificar, issue #749): `ReclasificarCategoriaControl` calls this
  // with the destination bucket's label for a cross-bucket move, or the
  // destination categoría's name for a same-bucket move — this handler just
  // interpolates whichever string it receives, so it needed no change to
  // support the second caller.
  const alMovida = (label: string) => setAnuncio(`Movida a ${label}.`);

  // SDD `correccion-movimientos-manuales` PR 3 (WEB-DEL-01, D-03): reuses
  // the SAME page-owned `anuncio` region as `alMovida` above — a delete is a
  // different mutation but the same "one page-level status line" contract.
  // Unlike a reclassify (the row survives, just re-grouped), a delete
  // UNMOUNTS the row that held the focused trigger — focus moves to the
  // `<h1>` (`ListaIngestas`/`EliminarIngestaControl` precedent).
  const alEliminarMovimiento = () => {
    setAnuncio('Movimiento eliminado.');
    headingRef.current?.focus();
  };

  // Reuses the SAME page-owned `anuncio` region (WEB-REEV-01): a
  // reevaluation is announced the same way a reclassify/delete is —
  // ONE page-level status line, not a second one. Unlike
  // `alEliminarMovimiento`, focus is NOT moved here: the control that
  // triggered this (`ReevaluarPatronesControl`) already returns focus to
  // its own trigger button on a successful confirm, and that trigger
  // (unlike a per-row delete trigger) never unmounts, so there is nothing
  // this page needs to redirect focus to.
  const alReevaluarPatrones = (resultado: ReevaluarCategoriasDto) => {
    setAnuncio(
      `Se reevaluaron ${resultado.transaccionesEvaluadas} movimientos: ${resultado.transaccionesActualizadas} actualizados.`,
    );
  };

  // AgregarCategoriaControl (issue #743): reuses the SAME page-owned
  // `anuncio` region as the reclassify/delete/reevaluate handlers above —
  // one page-level status line for every mutation this screen can trigger,
  // not a new one per affordance. `useCrearCategoria`'s own `onSuccess`
  // already seeds the shared `['categorias']` query (see that hook's
  // docblock), so the created categoría is selectable in
  // `ReclasificarCategoriaControl` the instant this handler runs — no
  // extra invalidation needed here.
  const alCategoriaCreada = (categoria: CategoriaDto) => {
    setAnuncio(`Categoría «${categoria.nombre}» creada.`);
  };

  if (query.isPending) {
    return <Loading message="Cargando movimientos…" />;
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  const viewModel = aDetalleBucketMesViewModel(query.data);
  const etiqueta = ETIQUETA_BUCKET[viewModel.bucket] ?? viewModel.bucket;
  const mesLabel = mesCompletoLabel(viewModel.periodo);
  // SinCategoria (and any future non-spend bucket) cannot own a categoría —
  // BUCKETS_ASIGNABLES is the same gate ReclasificarCategoriaControl already
  // applies to its own <optgroup> list (issue #743).
  const bucketEsAsignable = (
    BUCKETS_ASIGNABLES as ReadonlyArray<string>
  ).includes(viewModel.bucket);

  const categoriasCargandoInicial =
    categoriasQuery.data === undefined && categoriasQuery.isFetching;
  const categoriasFallidasSinDatos =
    categoriasQuery.data === undefined && categoriasQuery.error !== null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      {/* Page-owned announcement region for cross-bucket reclassify (D-07).
          Rendered OUTSIDE the groups map — stable page-level sibling that
          survives a moved row's unmount. Visible text, not sr-only, so
          sighted users and screen readers read from the same node.
          data-testid allows e2e to scope to this region when a second
          role=status node (catalog loading) may transiently coexist. */}
      <p role="status" data-testid="anuncio-reclasificar">
        {anuncio}
      </p>
      {categoriasCargandoInicial && (
        <p role="status" className="sr-only">
          Cargando categorías…
        </p>
      )}
      {categoriasFallidasSinDatos && categoriasQuery.error && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-error-foreground">
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
            <span className="font-medium text-foreground">{etiqueta}</span>
          </nav>
          {/* SC 2.5.8 (WCAG 2.2 AA): a standalone back link is a TARGET, not
              inline text constrained by a sentence's line-height — the
              *Inline* exception does not reach it. `mobile-floor.e2e.ts`'s
              E-11 sweep measured this link at 20px tall the moment this route
              joined its `SCREENS` list, the same 20px its sibling
              `Volver a Categorías` (`EditarCategoria.tsx`) was caught at and
              fixed for. Reused here rather than inventing a control style:
              the `link` variant IS this element's previous className
              (`text-primary underline-offset-4 hover:underline`), so the look
              is unchanged, while `size="sm"` gives it a real 32px target.
              `-mr-3` cancels that size's `px-3` on the flush edge so the
              header's right alignment does not shift. */}
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
        </div>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {etiqueta}
        </h1>
        <PeriodoSelector periodo={periodo} onChange={onPeriodoChange} />
        <ReevaluarPatronesControl
          esDemo={esDemo}
          onReevaluado={alReevaluarPatrones}
        />
        {bucketEsAsignable && (
          <AgregarCategoriaControl
            bucket={viewModel.bucket}
            esDemo={esDemo}
            onCreada={alCategoriaCreada}
          />
        )}
        {esDemo && (
          <p role="note" className="text-sm text-muted-foreground">
            {MENSAJE_DEMO_ELIMINAR}
          </p>
        )}
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
            <span className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              Movimientos
            </span>
            <span className="font-mono text-2xl font-medium tabular-nums text-foreground">
              {viewModel.totalTransacciones}
            </span>
          </div>
        </div>
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
              // Keyed by periodo too: `GrupoMovimientos` owns per-group
              // expansion state, and switching months must reset it (the
              // same categoryId across two months would otherwise keep the
              // stale expanded slice).
              key={`${viewModel.periodo}-${grupo.categoriaId ?? CLAVE_SIN_CATEGORIA}`}
              grupo={grupo}
              destacar={destacar && grupo.categoriaId === null}
              bucketActual={viewModel.bucket}
              periodo={periodo}
              periodoLabel={mesAbreviadoConAnio(viewModel.periodo)}
              onMovida={alMovida}
              onEliminado={alEliminarMovimiento}
              esDemo={esDemo}
            />
          ))}
        </div>
      )}
    </div>
  );
}
