import { useRef, useState } from 'react';
import { Loading } from './states/Loading';
import { ErrorState } from './states/Error';
import { Empty } from './states/Empty';
import { EliminarIngestaControl } from './EliminarIngestaControl';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { InlineConfirm } from './ui/inline-confirm';
import { useIngestas } from '@/api/use-ingestas';
import { useMe } from '@/api/use-me';
import {
  useSeleccionMasivaIngestas,
  type ResultadoEliminacionMasiva,
} from '@/api/use-seleccion-masiva-ingestas';
import { pluralizar } from '@/lib/pluralizar';
import type { IngestaListItemDto } from '@/api/types';

const MENSAJE_DEMO_SOLO_LECTURA =
  'Estás en una cuenta de demostración. Crea una cuenta real para eliminar cartolas.';

/**
 * ListaIngestas (`us-018-eliminar-ingesta` Slice 2, design.md §7.3; widened
 * by `us-004-historial-ingestas` Slice 3, design.md §9) — owns `useIngestas`
 * directly (single query, no interactive selector to decouple from the
 * router — same reasoning as `BucketDetalleMesPage`: one component covers
 * fetch + {loading|error|empty|data} + rendering).
 *
 * Reuses the shared Loading/ErrorState/Empty states (W1), passing
 * list-appropriate copy — do not reimplement the components themselves
 * (DRY).
 *
 * Each row's rendering is delegated to `IngestaItem` (below), which branches
 * on `estado` (US-004, ING-03/ING-05): a `PROCESADA` row keeps the original
 * US-018 shape (banco, count, `EliminarIngestaControl`); a `FALLIDA` row
 * renders `motivoFallo` instead and offers **no** delete control — deleting
 * a failed attempt is out of scope this sprint (design §8/D8, ING-05
 * regression guard). `nombreArchivo` and a visible "Exitoso"/"Fallido" badge
 * (never color alone, ADR-018) render for every row regardless of estado.
 *
 * Success announcement + focus (review finding, a11y): a successful delete
 * unmounts the `<li>` that held BOTH the focused trigger button AND
 * `EliminarIngestaControl`'s own `aria-live` span — that drops focus to
 * `document.body` and races the announcement against its own removal. This
 * component owns a SINGLE, STABLE `role="status"` live region + the `<h1>`
 * as an explicit focus target (`tabIndex={-1}`), both OUTSIDE the row
 * `<ul>`, so they survive any individual row unmounting.
 * `EliminarIngestaControl` calls the `onEliminado` callback it receives
 * instead of announcing/closing anything itself.
 *
 * Bulk delete (power-user efficiency round, critique round-7 P2; hardened
 * by a 4R review): a year-two user with dozens of ingestas shouldn't have to
 * delete them one at a time. Mirrors `PreviewMuestra`'s bulk idiom (master
 * checkbox + sticky toolbar) rather than inventing a new one, but reuses the
 * SAME per-ingesta DELETE mutation family sequentially — no new write
 * surface. The whole selection/confirm/sequential-delete state machine lives
 * in `useSeleccionMasivaIngestas` (`bulk` below) — see that hook's docstring
 * for the structural fixes (frozen selection while the dialog is open,
 * Escape guarded during a run, batched cache invalidation). This component
 * only composes it: it owns the stable `anuncio` live region + heading
 * focus, and decides (via `alResultadoMasivo`) that focus moves to the
 * heading ONLY on full success — the dialog stays open on partial failure,
 * so ripping focus away from it would be wrong.
 *
 * Demo (mirrors `CategoriaFila`/`CategoriasPanel`'s `esDemo` idiom — the
 * closest existing "list with per-row destructive action + demo gating"
 * precedent in this codebase): `useMe()` reads `esDemo` directly (this
 * component is mounted bare as the route's component, with no route context
 * threaded in, unlike `SubirCartola`), proactively disables every checkbox
 * AND the per-row `EliminarIngestaControl` (issue #500 — it had no `esDemo`
 * gating; only the bulk selection did, PR #499), and a single `role="note"`
 * banner explains why (WCTG-11: one note per screen covers both reasons the
 * delete affordances are disabled).
 */
export function ListaIngestas() {
  const query = useIngestas();
  const { data: me } = useMe();
  const esDemo = me?.esDemo ?? false;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [anuncio, setAnuncio] = useState('');

  function alEliminar() {
    setAnuncio('Cartola eliminada.');
    headingRef.current?.focus();
  }

  function alResultadoMasivo(resultado: ResultadoEliminacionMasiva) {
    setAnuncio(resultado.mensaje);
    if (resultado.ok) {
      headingRef.current?.focus();
    }
  }

  // Called unconditionally (Rules of Hooks) — `query.data ?? []` is a safe
  // placeholder while the query is pending/errored; the JSX below that
  // actually reads `bulk` is only reached once `query.data` is guaranteed
  // (past the early returns right below).
  const bulk = useSeleccionMasivaIngestas(query.data ?? [], alResultadoMasivo);

  if (query.isPending) {
    return <Loading message="Cargando cartolas…" />;
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  if (query.data.length === 0) {
    return (
      <Empty
        title="No hay cartolas cargadas"
        description="Sube una cartola para poder gestionarla aquí."
      />
    );
  }

  const ingestas = query.data;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        Gestionar cartolas
      </h1>
      <span role="status" aria-live="polite" className="sr-only">
        {anuncio}
      </span>
      {esDemo && (
        <p role="note" className="text-sm text-muted-foreground">
          {MENSAJE_DEMO_SOLO_LECTURA}
        </p>
      )}
      {bulk.idsSeleccionables.length > 0 && (
        // Round-9 critique P1 fix 2 (WCAG 2.2 AA SC 2.5.8): this `<label>`
        // already wraps the checkbox AND its visible text, so clicking the
        // text already toggles it — `min-h-6` only raises the label's own
        // box to the 24 CSS px floor (mirrors PreviewMuestra's master
        // checkbox fix); the checkbox's size-4 visual glyph is untouched.
        <label className="flex min-h-6 items-center gap-2 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            aria-label={bulk.etiquetaSeleccionarTodas}
            checked={bulk.todasSeleccionadas}
            disabled={esDemo || bulk.interaccionBloqueada}
            ref={(el) => {
              if (el) {
                el.indeterminate =
                  bulk.algunaSeleccionada && !bulk.todasSeleccionadas;
              }
            }}
            onChange={bulk.alternarTodas}
            className="size-4 shrink-0 rounded border-border accent-primary"
          />
          {bulk.etiquetaSeleccionarTodas}
        </label>
      )}
      <ul className="flex flex-col gap-3">
        {ingestas.map((ingesta) => (
          <IngestaItem
            key={ingesta.id}
            ingesta={ingesta}
            onEliminado={alEliminar}
            selected={bulk.seleccionados.has(ingesta.id)}
            onToggleSelect={bulk.alternarFila}
            checkboxDeshabilitado={esDemo || bulk.interaccionBloqueada}
            esDemo={esDemo}
          />
        ))}
      </ul>
      {bulk.seleccionados.size > 0 && (
        // `bottom-16 lg:bottom-0` mirrors `PreviewMuestra`'s toolbar clearance
        // for the fixed `BottomTabs` bar on mobile (`h-16`) — see that
        // component's docstring for the full stacking-order reasoning.
        <div className="sticky bottom-16 z-10 flex flex-col gap-2 lg:bottom-0">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
            <span className="text-sm font-medium text-foreground">
              {bulk.etiquetaSeleccionadas}
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={bulk.abrirConfirmacion}
              // 4R review fix (R1-CRITICAL stale dialog / R4-CRITICAL
              // re-entrancy): disabled while a confirmation is already open
              // or running — a second click could otherwise re-open (and
              // reset) the dialog against a `seleccionados` set that no
              // longer matches what's already disclosed/in flight.
              disabled={bulk.interaccionBloqueada}
              className="text-destructive"
            >
              Eliminar seleccionadas ({bulk.seleccionados.size})
            </Button>
          </div>
          {bulk.confirmando && bulk.resumenMasivo && (
            <InlineConfirm
              title="Confirmar eliminación masiva"
              confirmLabel={
                bulk.eliminando
                  ? `Eliminando… (${bulk.progreso}/${bulk.resumenMasivo.cantidad})`
                  : 'Confirmar'
              }
              destructive
              onConfirm={bulk.confirmar}
              onCancel={bulk.cancelarConfirmacion}
              pending={bulk.eliminando}
              cancelDisabled={bulk.eliminando}
              error={bulk.mensajeFallidas}
              className="gap-2 p-3 text-sm"
            >
              <p>
                Se eliminarán{' '}
                {pluralizar(bulk.resumenMasivo.cantidad, 'cartola', 'cartolas')}{' '}
                y{' '}
                {pluralizar(
                  bulk.resumenMasivo.movimientos,
                  'movimiento',
                  'movimientos',
                )}{' '}
                en total. Esta acción no se puede deshacer.
              </p>
            </InlineConfirm>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * IngestaItem — a single historial row (US-004, design.md §9). Branches on
 * `estado`:
 * - `PROCESADA`: banco, movement count, and the (unchanged, US-018) delete
 *   control. `banco` is coalesced to `''` only for the prop hand-off to
 *   `EliminarIngestaControl` (design §8 type-level note) — the invariant
 *   `PROCESADA ⟹ accountId/banco NOT NULL` (design §3.1) makes it always a
 *   real value at runtime; TS can't see that invariant across the `estado`
 *   field, so the coalesce is required to satisfy strict null-checking, not
 *   a behavioral fallback.
 * - `FALLIDA`: `motivoFallo` instead of a count, and **no** delete control
 *   (ING-05 — the delete affordance is gated to PROCESADA rows only).
 *   `banco` renders as "—" when null (early failures have no resolved bank,
 *   design §3.3).
 *
 * `nombreArchivo` is rendered as plain JSX text (React auto-escapes) — it is
 * a client-controlled, uploaded file name, never trusted as markup.
 *
 * `selected`/`onToggleSelect` (bulk delete): the checkbox only renders for a
 * PROCESADA row — same gate as `EliminarIngestaControl` below, since a
 * FALLIDA row is not deletable at all (ING-05). `checkboxDeshabilitado`
 * covers BOTH reasons the caller might freeze it: `esDemo` (mirrors
 * `CategoriaFila`'s pattern) and `interaccionBloqueada` (4R review fix — the
 * confirmation dialog is open or a run is in flight). `esDemo` is threaded
 * separately into `EliminarIngestaControl` (issue #500) — that control has
 * no `interaccionBloqueada` concept of its own, only its own mutation's
 * pending state.
 */
function IngestaItem({
  ingesta,
  onEliminado,
  selected,
  onToggleSelect,
  checkboxDeshabilitado,
  esDemo,
}: {
  readonly ingesta: IngestaListItemDto;
  readonly onEliminado: () => void;
  readonly selected: boolean;
  readonly onToggleSelect: (id: string) => void;
  readonly checkboxDeshabilitado: boolean;
  readonly esDemo: boolean;
}) {
  const fechaLabel = ingesta.fecha.slice(0, 10);
  const esFallida = ingesta.estado === 'FALLIDA';

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        {!esFallida && (
          // Round-9 critique P1 fix 2 (WCAG 2.2 AA SC 2.5.8): bare checkbox,
          // no sibling text to piggyback a click on — a wrapping `<label>`
          // grows the hit target to size-6 (24×24 CSS px) while the
          // checkbox's own visual glyph stays size-4 (same mechanism as
          // `FilaRevision`'s per-row checkbox).
          <label className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              aria-label={`Seleccionar cartola ${ingesta.banco ?? ''} (${fechaLabel})`}
              checked={selected}
              disabled={checkboxDeshabilitado}
              onChange={() => onToggleSelect(ingesta.id)}
              className="size-4 shrink-0 rounded border-border accent-primary"
            />
          </label>
        )}
        <div className="flex flex-1 items-center justify-between text-sm text-muted-foreground">
          <span>{fechaLabel}</span>
          <Badge variant={esFallida ? 'destructive' : 'secondary'}>
            {esFallida ? 'Fallido' : 'Exitoso'}
          </Badge>
        </div>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">
          {ingesta.nombreArchivo}
        </span>
        <span className="text-muted-foreground">{ingesta.banco ?? '—'}</span>
      </div>
      {esFallida ? (
        <p className="text-sm text-destructive">{ingesta.motivoFallo}</p>
      ) : (
        <div className="flex items-center justify-between text-sm text-foreground">
          <span>
            {pluralizar(
              ingesta.totalTransacciones,
              'movimiento',
              'movimientos',
            )}
          </span>
          {/* `estado="exitoso"` is hardcoded (not derived from `ingesta.estado`):
              this branch only renders for PROCESADA rows (US-004 gating
              above), which is always the "exitoso" case in
              `EliminarIngestaControl`'s own (pre-US-004) `EstadoIngestaResumen`
              vocabulary — the two components intentionally speak different
              estado vocabularies at this boundary. */}
          <EliminarIngestaControl
            id={ingesta.id}
            banco={ingesta.banco ?? ''}
            fechaLabel={fechaLabel}
            estado="exitoso"
            totalTransacciones={ingesta.totalTransacciones}
            esDemo={esDemo}
            onEliminado={onEliminado}
          />
        </div>
      )}
    </li>
  );
}
