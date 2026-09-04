import { useId, useState } from 'react';
import { ReclasificarCategoriaControl } from './ReclasificarCategoriaControl';
import { EliminarMovimientoControl } from './EliminarMovimientoControl';
import { aFechaCorta } from '@/domain/fecha';
import { usePendingIds } from '@/lib/undo-manager';
import type { GrupoDetalleMesViewModel } from '@/domain/detalle-bucket-mes-view-model';

/**
 * GrupoMovimientos — one grouped-category section of the bucket detail page
 * (US-053, T-09): the group's heading ("nombre · subtotal · conteo"), its
 * rows, and per-row reclassify controls. Pure presentational — receives the
 * already-mapped view-model group and the page's context
 * (`bucketActual`/`periodo` for `ReclasificarCategoriaControl`).
 *
 * Group subtotal is BigInt-exact by construction (`formatearMontoCLP` in the
 * view-model never touches Number()/parseFloat(), WCAT-02) — this component
 * only renders `subtotalLabel` verbatim.
 *
 * Rows collapse to FILAS_VISIBLES_POR_DEFECTO with a "ver N más…" toggle
 * (WDM-03/1, per group — each instance owns its own `expandido` state; the
 * slice is a render-time decision, the hidden rows are NOT in the DOM at
 * all, not merely CSS-hidden). The toggle wires `aria-expanded` +
 * `aria-controls` to its own list (unique id via `useId`, since groups
 * render in a `map`). Groups with ≤3 rows render no toggle.
 *
 * Delete affordance (SDD `correccion-movimientos-manuales` PR 3, WEB-DEL-01,
 * D-03): `EliminarMovimientoControl` renders only for rows with
 * `origen === 'Manual'`. `tx.fecha` arrives as a RAW ISO string on this
 * view-model (WDM-03 — unlike `IngresosMesViewModel`'s pre-formatted
 * `fechaLabel`), so the ISO-to-label conversion happens HERE, at the call
 * site, via `aFechaCorta` — mirroring how `ingresos-mes-view-model.ts`
 * already does the same slice, just one layer up the stack. BOTH consumers
 * of the date go through that helper now: the visible date column and the
 * delete control's label. The column used to print the raw timestamp while
 * the control beside it printed the short form — the display-consistency
 * follow-up `domain/fecha.ts` predicted for this file, closed 2026-09-03.
 * Success/failure is not announced here; the parent page owns the
 * `role="status"` region (`onEliminado` bubbles up to it, same as
 * `onMovida`).
 *
 * Undo grace window (design-hardening change, resolves critique P1):
 * `EliminarMovimientoControl` schedules a delayed commit and closes its
 * dialog immediately instead of removing anything itself — THIS component
 * hides the row, filtering `grupo.transacciones` by `usePendingIds()`
 * (`lib/undo-manager.ts`) BEFORE the "ver N más…" slice, so the visible
 * count and the collapsed/expanded toggle stay consistent with what's
 * actually on screen. `grupo.subtotalLabel`/`conteo` (the group heading)
 * are untouched — those are computed server-side and recompute only after
 * the real DELETE commits (ADR-024).
 */
export const FILAS_VISIBLES_POR_DEFECTO = 3;

export function GrupoMovimientos({
  grupo,
  destacar,
  bucketActual,
  periodo,
  onMovida,
  onEliminado,
  esDemo = false,
}: {
  readonly grupo: GrupoDetalleMesViewModel;
  readonly destacar: boolean;
  readonly bucketActual: string;
  readonly periodo: string | undefined;
  readonly onMovida: (bucketLabel: string) => void;
  readonly onEliminado?: () => void;
  readonly esDemo?: boolean;
}) {
  const [expandido, setExpandido] = useState(false);
  const idLista = useId();
  const idTitulo = useId();
  const pendientes = usePendingIds();

  const transaccionesVisibles = grupo.transacciones.filter(
    (tx) => !pendientes.has(tx.id),
  );
  const visibles = expandido
    ? transaccionesVisibles
    : transaccionesVisibles.slice(0, FILAS_VISIBLES_POR_DEFECTO);
  const ocultas = transaccionesVisibles.length - FILAS_VISIBLES_POR_DEFECTO;
  const hayMas = ocultas > 0;

  return (
    <section
      data-testid="grupo-movimientos"
      data-destacado={destacar ? 'true' : undefined}
      aria-labelledby={idTitulo}
      aria-current={destacar ? 'true' : undefined}
      className={
        destacar
          ? 'flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3'
          : 'flex flex-col gap-3'
      }
    >
      {/* The subtotal and the count are figures, so they take mono while the
          category name stays in the sans face. The heading's ACCESSIBLE NAME
          is unchanged (the wrapping spans add no text), but its `getNodeText`
          is NOT: Testing Library joins only an element's direct text-node
          children, so a `getByText('Ñoquis · $… · 1 movimiento')` stops
          matching once the figures move into child spans. Query this heading
          by role/name, not by text. */}
      <h2 id={idTitulo} className="text-sm font-semibold text-secondary">
        {grupo.nombre} ·{' '}
        <span className="font-mono tabular-nums">{grupo.subtotalLabel}</span> ·{' '}
        <span className="font-mono tabular-nums">{grupo.conteo}</span>{' '}
        {grupo.conteo === 1 ? 'movimiento' : 'movimientos'}
      </h2>
      {/* Tecno-Analítico (2026-09-02): the rows stop being individual cards
          (`rounded-lg border bg-card p-3 shadow-sm` each, separated by
          `gap-3`) and become a flat ledger — one `divide-y divide-border`
          stack of grid rows. Fifty movements used to render as fifty
          floating boxes, each with its own frame competing with the group's
          own frame; now the only horizontal lines on screen are the ones
          that actually separate two records.

          `grid-cols-[auto_1fr_auto]` is what makes it a ledger rather than
          three spans in a `justify-between` flex: fecha and monto are
          content-width columns that align down the whole list, and the
          description takes the slack. Under the old flex the three fields
          landed at a different x on every row — it read like a table with
          no columns. `items-baseline` sits the mono figures on the same
          baseline as the description's sans text. */}
      <ul id={idLista} className="divide-y divide-border">
        {visibles.map((tx) => (
          <li
            key={tx.id}
            className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3 gap-y-2 py-2.5 text-sm"
          >
            {/* Mono + tabular-nums so dates form a rigid column (DESIGN.md:
                mono is mandatory for every figure, date and amount).

                `aFechaCorta`, not `tx.fecha` verbatim: this view-model carries
                a RAW ISO timestamp (see the docstring above), so the column
                used to print "2026-07-05T00:00:00.000Z" while the delete
                control on the same row — already routed through the same
                helper — said "2026-07-05". This is the display-consistency
                follow-up that `domain/fecha.ts`'s own `aFechaCorta` docblock
                names for this exact line. */}
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {aFechaCorta(tx.fecha)}
            </span>
            <span className="min-w-0 break-words text-foreground">
              {tx.descripcion}
            </span>
            {/* `text-right` + `tabular-nums` on a content-width column: the
                digits line up across rows, so magnitudes are comparable by
                eye without reading a single number. */}
            <span className="text-right font-mono font-medium tabular-nums text-foreground">
              {tx.montoLabel}
            </span>
            <div className="col-span-3 flex items-center justify-end gap-2">
              <ReclasificarCategoriaControl
                transaccionId={tx.id}
                descripcion={tx.descripcion}
                montoLabel={tx.montoLabel}
                bucketActual={bucketActual}
                categoriaActual={
                  grupo.categoriaId === null
                    ? null
                    : { id: grupo.categoriaId, nombre: grupo.nombre }
                }
                periodo={periodo}
                onMovida={onMovida}
              />
              {tx.origen === 'Manual' && (
                <EliminarMovimientoControl
                  id={tx.id}
                  fechaLabel={aFechaCorta(tx.fecha)}
                  descripcion={tx.descripcion}
                  montoLabel={tx.montoLabel}
                  esDemo={esDemo}
                  onEliminado={onEliminado}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
      {hayMas && (
        <button
          type="button"
          aria-expanded={expandido}
          aria-controls={idLista}
          onClick={() => setExpandido((v) => !v)}
          className="self-start text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          {expandido ? 'Ver menos' : `ver ${ocultas} más…`}
        </button>
      )}
    </section>
  );
}
