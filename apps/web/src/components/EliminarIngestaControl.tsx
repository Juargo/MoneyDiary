import { useRef, useState } from 'react';
import { useEliminarIngesta } from '@/api/use-eliminar-ingesta';
import type { EstadoIngestaResumen } from '@/api/types';
import { Button } from '@/components/ui/button';
import { InlineConfirm } from '@/components/ui/inline-confirm';

/**
 * EliminarIngestaControl (`us-018-eliminar-ingesta` Slice 2, design.md §7.3,
 * ING-05/ING-06) — the per-row delete trigger + accessible confirmation for
 * `ListaIngestas`. The confirmation itself is the shared `InlineConfirm`
 * shell (a11y round, part 1) — this component only supplies its own copy,
 * mutation, and focus-restore-on-cancel, with two deliberate divergences
 * from `ReclasificarCategoriaControl`'s use of the same shell:
 *
 * - The trigger `<button>` carries an `aria-label` that includes the banco +
 *   fecha ("Eliminar cartola {banco} ({fechaLabel})") instead of the plain
 *   visible "Eliminar" text — `ListaIngestas` renders one of these per row,
 *   and a screen reader user tabbing through a list of otherwise-identical
 *   "Eliminar" buttons has no way to tell them apart (a11y fix, review
 *   finding). The visible label stays "Eliminar" (short, scannable); only
 *   the ACCESSIBLE name is disambiguated.
 * - The success announcement + focus target are NOT owned by this
 *   component. On success this component just closes its own dialog and
 *   calls the caller-supplied `onEliminado()` — `ListaIngestas` is
 *   responsible for announcing "Cartola eliminada." and moving focus,
 *   because THIS component's own DOM (including its previous per-row
 *   `aria-live` span) unmounts along with the `<li>` once the row disappears
 *   from the list, which both drops focus to `<body>` and races the
 *   announcement against its own removal (review finding). A single
 *   list-level live region + focus target survives the unmount.
 *
 * Everything else matches the reclasificar control:
 * - `InlineConfirm` renders `role="alertdialog"` with a hidden title
 *   ("Confirmar eliminación", the shell's default `aria-label` shape) and
 *   moves focus to "Confirmar" on mount (WCAT-05-style: a keyboard user
 *   needs to know a dialog appeared, not stay orphaned on the trigger).
 * - Escape and "Cancelar" both call `cancelar()`, which returns focus to the
 *   trigger button — this component's own responsibility, unchanged by the
 *   shell extraction.
 * - The dialog body states the impact + irreversibility. The impact clause is
 *   estado-aware (US-004): a successful ingesta reports the movement count
 *   ("Se eliminarán {n} movimientos de {banco} ({fechaLabel})"), while a
 *   fallida/pendiente one — which imported no transactions (count is 0) —
 *   drops the misleading "0 movimientos" and reads "Se eliminará esta cartola
 *   {fallida|pendiente} de {banco} ({fechaLabel})". Both close with "Esta
 *   acción no se puede deshacer."
 * - Confirm button `pending={mutacion.isPending}`; on click fires
 *   `useEliminarIngesta().mutate(id)`.
 * - `role="alert"` error message on failure. Unlike
 *   `ReclasificarCategoriaControl` (which closes/resets on error), THIS
 *   control deliberately KEEPS THE DIALOG OPEN on a failed delete — the
 *   error is shown inline and "Confirmar" stays available so the user can
 *   retry without reopening the dialog and re-reading the impact statement.
 *   This divergence is intentional, not an oversight of the "structural
 *   clone" claim above.
 *
 * `fechaLabel` arrives PRE-FORMATTED (mirrors `montoLabel` on
 * `ReclasificarCategoriaControl` — the caller, `ListaIngestas`, already knows
 * how to format an ISO date for display; this control doesn't duplicate that
 * one-line slice itself).
 *
 * No full focus-trap (`InlineConfirm` is non-modal by design — same scoping
 * decision as before, unnecessary for this per-row widget).
 */
export function EliminarIngestaControl({
  id,
  banco,
  fechaLabel,
  estado,
  totalTransacciones,
  onEliminado,
}: {
  readonly id: string;
  readonly banco: string;
  readonly fechaLabel: string;
  readonly estado: EstadoIngestaResumen;
  readonly totalTransacciones: number;
  readonly onEliminado?: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState(false);
  const mutacion = useEliminarIngesta();

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

  // Impacto estado-aware (US-004): las fallidas/pendientes no importaron
  // movimientos (count 0), así que evitamos el engañoso "0 movimientos".
  const impacto =
    estado === 'exitoso'
      ? `Se eliminarán ${totalTransacciones} movimientos de ${banco} (${fechaLabel}).`
      : `Se eliminará esta cartola ${estado === 'fallido' ? 'fallida' : 'pendiente'} de ${banco} (${fechaLabel}).`;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="xs"
        onClick={abrir}
        aria-label={`Eliminar cartola ${banco} (${fechaLabel})`}
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
          <p>{impacto} Esta acción no se puede deshacer.</p>
        </InlineConfirm>
      )}
    </div>
  );
}
