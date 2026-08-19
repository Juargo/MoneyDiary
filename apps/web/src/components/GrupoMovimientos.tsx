import { useId, useState } from 'react';
import { ReclasificarCategoriaControl } from './ReclasificarCategoriaControl';
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
 */
export const FILAS_VISIBLES_POR_DEFECTO = 3;

export function GrupoMovimientos({
  grupo,
  destacar,
  bucketActual,
  periodo,
}: {
  readonly grupo: GrupoDetalleMesViewModel;
  readonly destacar: boolean;
  readonly bucketActual: string;
  readonly periodo: string | undefined;
}) {
  const [expandido, setExpandido] = useState(false);
  const idLista = useId();
  const idTitulo = useId();

  const visibles = expandido
    ? grupo.transacciones
    : grupo.transacciones.slice(0, FILAS_VISIBLES_POR_DEFECTO);
  const ocultas = grupo.transacciones.length - FILAS_VISIBLES_POR_DEFECTO;
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
                  grupo.categoriaId === null ? null : grupo.nombre
                }
                periodo={periodo}
              />
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
