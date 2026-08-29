import { useRef, useState } from 'react';
import { useEliminarMovimiento } from '@/api/use-eliminar-movimiento';
import { Button } from '@/components/ui/button';
import { InlineConfirm } from '@/components/ui/inline-confirm';

/**
 * EliminarMovimientoControl — SDD `correccion-movimientos-manuales` PR 3
 * (design.md D-03, spec WEB-DEL-01) — the per-row delete trigger + accessible
 * confirmation for a manually-registered movement (`origen === 'Manual'`).
 * Structural clone of `EliminarIngestaControl` over the shared `InlineConfirm`
 * shell, adapted to a row shape with no "impact count" (deleting one manual
 * movement is always exactly one row, unlike an ingesta's N transactions):
 *
 * - The trigger `<button>` carries an `aria-label` including `descripcion` +
 *   `fechaLabel` ("Eliminar movimiento {descripcion} ({fechaLabel})") for the
 *   same per-row disambiguation reason as `EliminarIngestaControl` — both
 *   `IngresosMesTable` and `GrupoMovimientos` render one of these per manual
 *   row, and a screen reader user needs to tell them apart. The visible label
 *   stays "Eliminar" (short, scannable).
 * - The confirm dialog discloses `fechaLabel`, `descripcion`, and
 *   `montoLabel` (WEB-DEL-01) — all THREE arrive PRE-FORMATTED (mirrors
 *   `EliminarIngestaControl`'s `fechaLabel`/`ReclasificarCategoriaControl`'s
 *   `montoLabel`): the caller already knows how to format an ISO date/CLP
 *   amount for display (`IngresosMesTable` passes its view-model's labels
 *   verbatim; `GrupoMovimientos` formats `tx.fecha` via `aFechaCorta` at the
 *   call site, since the gasto view-model keeps `fecha` as a raw ISO string
 *   per WDM-03).
 * - On error the dialog STAYS OPEN for retry (same divergence from
 *   `ReclasificarCategoriaControl` as `EliminarIngestaControl` — a failed
 *   delete has exactly one sensible next action).
 * - Success is NOT announced here: this component just closes its own
 *   dialog and calls the caller-supplied `onEliminado()`. The parent list
 *   (`IngresosMesPage`/`BucketDetalleMesPage`) owns a stable page-level
 *   `role="status"` region that survives this control's own unmount (same
 *   reasoning as `EliminarIngestaControl`/`ListaIngestas`).
 * - `esDemo` proactively disables the trigger (UI honesty — the server
 *   already rejects a demo DELETE with `MovimientoDemoSoloLecturaError`
 *   regardless). The explanatory `role="note"` lives at the page level, one
 *   per screen (WCTG-11 convention), not duplicated per row here.
 */
export function EliminarMovimientoControl({
  id,
  fechaLabel,
  descripcion,
  montoLabel,
  esDemo = false,
  onEliminado,
}: {
  readonly id: string;
  readonly fechaLabel: string;
  readonly descripcion: string;
  readonly montoLabel: string;
  readonly esDemo?: boolean;
  readonly onEliminado?: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState(false);
  const mutacion = useEliminarMovimiento();

  function abrir() {
    mutacion.reset();
    setAbierto(true);
  }

  function cancelar() {
    setAbierto(false);
    triggerRef.current?.focus();
  }

  function confirmar() {
    mutacion.mutate(id, {
      onSuccess: () => {
        setAbierto(false);
        onEliminado?.();
      },
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="xs"
        disabled={esDemo}
        onClick={abrir}
        aria-label={`Eliminar movimiento ${descripcion} (${fechaLabel})`}
        className="text-destructive"
      >
        Eliminar
      </Button>
      {abierto && (
        <InlineConfirm
          title="Confirmar eliminación"
          confirmLabel="Confirmar"
          destructive
          onConfirm={confirmar}
          onCancel={cancelar}
          pending={mutacion.isPending}
          error={mutacion.isError ? mutacion.error.message : null}
          className="gap-2 p-3 text-xs"
        >
          <p>
            Se eliminará el movimiento {descripcion} ({fechaLabel}) por{' '}
            {montoLabel}. Esta acción no se puede deshacer.
          </p>
        </InlineConfirm>
      )}
    </div>
  );
}
