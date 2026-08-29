import { useRef, useState } from 'react';
import { deleteMovimiento } from '@/api/movimientos';
import { useEliminarMovimiento } from '@/api/use-eliminar-movimiento';
import { Button } from '@/components/ui/button';
import { InlineConfirm } from '@/components/ui/inline-confirm';
import {
  programarEliminacion,
  reportarErrorEliminacion,
} from '@/lib/undo-manager';

/**
 * EliminarMovimientoControl — SDD `correccion-movimientos-manuales` PR 3
 * (design.md D-03, spec WEB-DEL-01); rewired for the design-hardening
 * change (undo grace window, resolves critique P1 "No undo/grace period on
 * any destructive action"). Structural clone of `EliminarIngestaControl`
 * over the shared `InlineConfirm` shell, adapted to a row shape with no
 * "impact count" (deleting one manual movement is always exactly one row,
 * unlike an ingesta's N transactions):
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
 *   `montoLabel`), plus the TRUTHFUL grace-window copy (design-hardening
 *   change) — the old "Esta acción no se puede deshacer." is now false
 *   during the undo window, so the dialog states the real behavior instead.
 * - Confirmar does NOT fire the DELETE. It closes the dialog and hands off
 *   to `programarEliminacion` (`lib/undo-manager.ts`, the ONE delayed-commit
 *   manager shared by all three destructive flows): the caller's list
 *   (`IngresosMesTable`/`GrupoMovimientos`) hides the row for the grace
 *   window by filtering on `usePendingIds()`, `UndoToast` (mounted once at
 *   the router root) shows "Deshacer", and the real
 *   `useEliminarMovimiento` mutation only fires once the window expires
 *   (`onCommit`) — or never, if the user undoes. `onCommit` is `async` and
 *   AWAITS `mutateAsync` (adversarial-review fix, not a fire-and-forget
 *   `.mutate`) so `undo-manager.ts` keeps the row hidden for the DELETE's
 *   full round-trip, not just until grace expires. A failure at that point
 *   reports through `reportarErrorEliminacion` instead of this (long since
 *   closed) dialog's own `role="alert"` slot.
 * - `onPageHide` fires the SAME DELETE with `{ keepalive: true }` — the
 *   `pagehide` escape hatch `undo-manager.ts` needs for a hard
 *   navigation/tab-close.
 * - Success/failure of the SCHEDULE step (as opposed to the eventual
 *   commit) is NOT announced here: this component closes its own dialog and
 *   calls the caller-supplied `onEliminado()` right away, since the row is
 *   already gone from the caller's render at that point (optimistic hide).
 *   The parent page still owns its stable `role="status"` region for that
 *   announcement (unchanged from before this change).
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
    setAbierto(true);
  }

  function cancelar() {
    setAbierto(false);
    triggerRef.current?.focus();
  }

  function confirmar() {
    setAbierto(false);
    programarEliminacion({
      ids: [id],
      mensaje: 'Movimiento eliminado.',
      // Returns the mutation's promise (adversarial-review fix, applied
      // uniformly across all three flows): `undo-manager.ts` keeps `id` in
      // its "committing" set — still reported by `usePendingIds()`, so the
      // row stays hidden — until this promise settles, not just until the
      // grace window expires.
      onCommit: async () => {
        try {
          await mutacion.mutateAsync(id);
        } catch {
          reportarErrorEliminacion(
            'No se pudo eliminar el movimiento. Intenta nuevamente.',
          );
        }
      },
      onPageHide: () => {
        void deleteMovimiento(id, { keepalive: true });
      },
    });
    onEliminado?.();
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
          className="gap-2 p-3 text-xs"
        >
          <p>
            Se eliminará el movimiento {descripcion} ({fechaLabel}) por{' '}
            {montoLabel}. Podrás deshacer durante unos segundos después de
            confirmar.
          </p>
        </InlineConfirm>
      )}
    </div>
  );
}
