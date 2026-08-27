import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

/**
 * ConfirmarImpactoDialog (US-043 PR #3b, design.md §1/Q6a, task 28) — the
 * `EliminarIngestaControl` shape, reused for BOTH destructive-impact
 * confirmations this feature needs: delete and bucket-change. `role=
 * "alertdialog"`, `aria-modal="false"` (inline widget, no focus trap — the
 * shipped scoping decision), focus moves to the confirm button on mount,
 * Escape cancels, `role="alert"` inline error, and the dialog does NOT
 * close on failure so the user can retry in place
 * (`EliminarIngestaControl:44-50`).
 *
 * Deliberately takes RENDERED copy (`titulo`/`lineas`/`textoConfirmar`), not
 * a discriminated union describing what it's confirming — US-042's D-02
 * applied verbatim (Q6a): a `modo` prop here would grow a `switch` inside
 * the component. `fraseDeImpacto` (task 27) is the pure translator that
 * produces this shape; this component knows nothing about `ImpactoCatalogo`.
 *
 * "The dialog does not close on failure" is automatic here, not a branch to
 * write: this component owns NO open/closed state of its own — the caller
 * mounts/unmounts it. A failed `onConfirmar` simply means the caller keeps
 * it mounted and passes a non-null `error`.
 *
 * "Restores focus to the trigger" (design.md task 28) is likewise NOT this
 * component's job — it holds no reference to whatever button opened it.
 * `onCancelar` fires on Escape and on the "Cancelar" click; the CALLER
 * decides what to focus next (mirrors `EliminarIngestaControl.cancelar()`'s
 * `triggerRef.current?.focus()`, just inverted: the ref lives one level up).
 *
 * `ariaLabel` (judgment-day, both judges, WCAG 4.1.2): defaults to `titulo`
 * so the single-instance edit-screen call sites are unchanged. `titulo` for
 * a delete is the fixed string `'Eliminar categoría'` — harmless while only
 * one instance of this component could ever exist, but `CategoriasPanel`
 * renders one independent, non-modal instance per row, so two rows' dialogs
 * open at once would otherwise share one identical accessible name. The
 * VISIBLE title stays `titulo` either way — only the accessible name needs
 * disambiguating, so this stays an optional prop on top of rendered copy
 * rather than a `modo`/category-aware branch inside the component.
 */
export function ConfirmarImpactoDialog({
  titulo,
  lineas,
  textoConfirmar,
  pendiente,
  error,
  onConfirmar,
  onCancelar,
  ariaLabel = titulo,
}: {
  readonly titulo: string;
  readonly lineas: readonly string[];
  readonly textoConfirmar: string;
  readonly pendiente: boolean;
  readonly error: string | null;
  readonly onConfirmar: () => void;
  readonly onCancelar: () => void;
  readonly ariaLabel?: string;
}) {
  const confirmarRef = useRef<HTMLButtonElement>(null);

  // Foco al montar: mueve el foco al botón de confirmación en vez de
  // dejarlo huérfano en el trigger que acaba de abrir este diálogo — un
  // usuario de teclado necesita saber que apareció un diálogo antes de
  // seguir tabulando (mismo razonamiento que `EliminarIngestaControl`/
  // `ReclasificarCategoriaControl`). Mount-only: este componente SIEMPRE
  // se monta al abrirse (el caller no lo renderiza condicionalmente por
  // dentro), así que no hace falta un `abierto` prop para disparar esto.
  useEffect(() => {
    confirmarRef.current?.focus();
  }, []);

  // `cancelar` (judgment-day round 3, WCTG-07): the SINGLE place that
  // answers "what can dismiss this dialog while its own mutation is in
  // flight" — nothing, until `pendiente` clears, mirroring the confirm
  // button's own `disabled={pendiente}`. Both Escape and the "Cancelar"
  // button route through this guard instead of calling `onCancelar`
  // directly.
  //
  // Before this guard, Escape called `onCancelar()` unconditionally. The
  // caller's `cerrarDialogo` (`EditarCategoria.tsx`) then synchronously
  // tried to restore focus to whichever trigger opened this dialog — but
  // that SAME trigger is disabled for the SAME pending state (round 2), and
  // a disabled element cannot receive focus, so focus silently fell to
  // `<body>`. Worse, the in-flight mutation was never aborted: it still
  // resolved later and its mutate-level `onSuccess` still fired (navigate/
  // re-stamp) even though the dialog had already visually "closed" on
  // Escape — contradicting Escape's framing as a cancel action (WCTG-07).
  // Locking the dialog while `pendiente` is the fix that closes the WHOLE
  // class: `cerrarDialogo` is simply never invoked mid-flight, so there is
  // no disabled-trigger focus attempt and no premature "closed" state to
  // contradict.
  function cancelar() {
    if (pendiente) {
      return;
    }
    onCancelar();
  }

  return (
    // `role="alertdialog"`'s ARIA superclass chain is `window > dialog`, not
    // `widget` (verified against aria-query, same finding recorded on
    // `ConfirmarPasswordDialog.tsx`), so `isInteractiveRole` never
    // recognises it — this rule cannot distinguish a real dialog's
    // Escape-to-close container from an arbitrary `<div onKeyDown>`. The
    // WAI-ARIA dialog pattern (and `EliminarIngestaControl`'s existing,
    // unscoped instance of the exact same shape) binds Escape at the dialog
    // container, not at a specific control.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="alertdialog"
      aria-modal="false"
      aria-label={ariaLabel}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          cancelar();
        }
      }}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-sm text-foreground shadow-sm"
    >
      <p className="font-semibold">{titulo}</p>
      {lineas.map((linea, indice) => (
        <p key={indice}>{linea}</p>
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={cancelar}
          disabled={pendiente}
          className="text-muted-foreground"
        >
          Cancelar
        </Button>
        <Button
          ref={confirmarRef}
          type="button"
          variant="destructive"
          onClick={onConfirmar}
          disabled={pendiente}
        >
          {textoConfirmar}
        </Button>
      </div>
    </div>
  );
}
