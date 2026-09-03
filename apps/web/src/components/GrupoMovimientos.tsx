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
 * already does the same slice, just one layer up the stack. Success/failure
 * is not announced here; the parent page owns the `role="status"` region
 * (`onEliminado` bubbles up to it, same as `onMovida`).
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
      <h2 id={idTitulo} className="text-sm font-semibold text-secondary">
        {grupo.nombre} · {grupo.subtotalLabel} · {grupo.conteo}{' '}
        {grupo.conteo === 1 ? 'movimiento' : 'movimientos'}
      </h2>
      <ul id={idLista} className="flex flex-col gap-3">
        {visibles.map((tx) => (
          <li
            key={tx.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>{tx.fecha}</span>
              <span className="font-medium text-foreground">
                {tx.descripcion}
              </span>
              <span className="font-medium text-foreground">
                {tx.montoLabel}
              </span>
            </div>
            <div className="flex items-center justify-end gap-2">
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
