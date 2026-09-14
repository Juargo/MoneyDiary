import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
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
 * Collapsed-by-default accordion (bucket-detalle-acordeon, WDM-03): the
 * heading itself IS the trigger — same idiom `PreviewMuestra`'s per-date
 * accordion and `MuestraAgrupada`'s per-category accordion already use
 * (heading wraps a `button` with `aria-expanded`/`aria-controls`, a
 * `ChevronDown` that rotates, the panel kept `hidden` — not unmounted —
 * while collapsed; each instance owns its own `expandido` state, since
 * groups render in a `map`). Activating the trigger shows ALL rows of the
 * group — the old FILAS_VISIBLES_POR_DEFECTO 10-row slice with its
 * "ver N más…" toggle is retired: an always-open accordion body has nothing
 * left to truncate, and the heading itself now carries the only
 * expand/collapse affordance. The `destacar` group (deep-link highlight)
 * starts EXPANDED — everyone else starts collapsed.
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
 * (`lib/undo-manager.ts`) before rendering the row list, so what's visible
 * behind the accordion stays consistent with what's actually pending.
 * `grupo.subtotalLabel`/`conteo` (the group heading) are untouched — those
 * are computed server-side and recompute only after the real DELETE
 * commits (ADR-024).
 */
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
  // Initial state comes from `destacar`, not a hardcoded `false`: the
  // highlighted deep-link target starts open, every other group starts
  // closed (WDM-03/WDM-04). `useState` only reads this once — a LATER
  // `destacar` flip (there isn't one on this page today) would not reopen
  // an already-mounted group, same as any other lazy-init state.
  const [expandido, setExpandido] = useState(destacar);
  const idLista = useId();
  const idTitulo = useId();
  const pendientes = usePendingIds();

  const transaccionesVisibles = grupo.transacciones.filter(
    (tx) => !pendientes.has(tx.id),
  );

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
          by role/name, not by text.

          The heading now wraps the accordion trigger button (whole-row hit
          target, WCAG 2.2 SC 2.5.8 — `min-h-8` clears the 24px floor), same
          idiom as `PreviewMuestra`'s date groups / `MuestraAgrupada`'s
          category groups: `aria-expanded`/`aria-controls`, a rotating
          `ChevronDown` (`aria-hidden`, `motion-reduce:transition-none`). */}
      <h2 id={idTitulo} className="text-sm font-semibold text-secondary">
        <button
          type="button"
          aria-expanded={expandido}
          aria-controls={idLista}
          onClick={() => setExpandido((v) => !v)}
          className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-1 text-left hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="min-w-0">
            {grupo.nombre} ·{' '}
            <span className="font-mono tabular-nums">
              {grupo.subtotalLabel}
            </span>{' '}
            · <span className="font-mono tabular-nums">{grupo.conteo}</span>{' '}
            {grupo.conteo === 1 ? 'movimiento' : 'movimientos'}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${
              expandido ? '' : '-rotate-90'
            }`}
          />
        </button>
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
      {/* Collapsed = `hidden`, NOT unmounted: a row's mid-cascade control
          state (`ReclasificarCategoriaControl`'s open confirm dialog,
          `EliminarMovimientoControl`'s pending state) would be lost on
          remount. Tailwind v4's preflight makes `[hidden]` win over the
          `flex`/`divide-y` utilities (`!important`), and the class swap
          below is belt-and-braces for it (PreviewMuestra precedent). */}
      <ul
        id={idLista}
        hidden={!expandido}
        className={expandido ? 'divide-y divide-border' : 'hidden'}
      >
        {transaccionesVisibles.map((tx) => (
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
    </section>
  );
}
