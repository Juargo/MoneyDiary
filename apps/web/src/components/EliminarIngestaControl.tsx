import { useEffect, useRef, useState } from 'react'
import { useEliminarIngesta } from '@/api/use-eliminar-ingesta'

/**
 * EliminarIngestaControl (`us-018-eliminar-ingesta` Slice 2, design.md §7.3,
 * ING-05/ING-06) — the per-row delete trigger + accessible confirmation for
 * `ListaIngestas`. Structural clone of `ReclasificarCategoriaControl`'s a11y
 * pattern (KISS: reuse the existing hand-rolled `role="alertdialog"`, NOT a
 * new modal library):
 *
 * - "Eliminar" `<button>` is the trigger.
 * - On open, `role="alertdialog"` with `aria-label="Confirmar eliminación"`;
 *   a `useEffect` moves focus to "Confirmar" (WCAT-05-style: a keyboard user
 *   needs to know a dialog appeared, not stay orphaned on the trigger).
 * - `onKeyDown` Escape cancels; cancel (Escape or "Cancelar") returns focus
 *   to the trigger button.
 * - The dialog body states the impact + irreversibility verbatim (design
 *   §7.3): "Se eliminarán {totalTransacciones} movimientos de {banco}
 *   ({fechaLabel}). Esta acción no se puede deshacer."
 * - Confirm button `disabled={mutacion.isPending}`; on click fires
 *   `useEliminarIngesta().mutate(id)`.
 * - `aria-live="polite"` success announcement + `role="alert"` error
 *   message, same as the reclasificar control. On success the dialog closes
 *   (the row itself disappears because `onSuccess` invalidates `['ingestas']`
 *   — `ListaIngestas` re-renders without this row).
 *
 * `fechaLabel` arrives PRE-FORMATTED (mirrors `montoLabel` on
 * `ReclasificarCategoriaControl` — the caller, `ListaIngestas`, already knows
 * how to format an ISO date for display; this control doesn't duplicate that
 * one-line slice itself).
 *
 * No full focus-trap (same scoping decision as the reclasificar inline
 * widget — unnecessary for this per-row widget).
 */
export function EliminarIngestaControl({
  id,
  banco,
  fechaLabel,
  totalTransacciones,
}: {
  readonly id: string
  readonly banco: string
  readonly fechaLabel: string
  readonly totalTransacciones: number
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const confirmarRef = useRef<HTMLButtonElement>(null)
  const [abierto, setAbierto] = useState(false)
  const mutacion = useEliminarIngesta()

  // Foco al abrir la confirmación: mueve el foco a "Confirmar" en vez de
  // dejarlo huérfano en el botón "Eliminar" que acaba de disparar el click —
  // un usuario de teclado necesita saber que apareció un diálogo antes de
  // seguir tabulando (mismo razonamiento que ReclasificarCategoriaControl).
  useEffect(() => {
    if (abierto) {
      confirmarRef.current?.focus()
    }
  }, [abierto])

  function abrir() {
    mutacion.reset()
    setAbierto(true)
  }

  function cancelar() {
    setAbierto(false)
    triggerRef.current?.focus()
  }

  function confirmar() {
    mutacion.mutate(id, {
      onSuccess: () => {
        setAbierto(false)
      },
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        ref={triggerRef}
        type="button"
        onClick={abrir}
        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Eliminar
      </button>
      <span aria-live="polite" className="sr-only">
        {mutacion.isSuccess ? 'Cartola eliminada.' : ''}
      </span>
      {abierto && (
        <div
          role="alertdialog"
          aria-label="Confirmar eliminación"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              cancelar()
            }
          }}
          className="flex flex-col gap-2 rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-700 shadow-sm"
        >
          <p>
            Se eliminarán {totalTransacciones} movimientos de {banco} ({fechaLabel}). Esta acción no se puede
            deshacer.
          </p>
          {mutacion.isError && (
            <p role="alert" className="text-xs text-red-600">
              {mutacion.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelar}
              className="rounded-full border border-slate-300 px-3 py-1 font-semibold text-slate-600"
            >
              Cancelar
            </button>
            <button
              ref={confirmarRef}
              type="button"
              onClick={confirmar}
              disabled={mutacion.isPending}
              className="rounded-full bg-red-600 px-3 py-1 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
