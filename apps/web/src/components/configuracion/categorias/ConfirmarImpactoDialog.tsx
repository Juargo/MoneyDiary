import { InlineConfirm } from '@/components/ui/inline-confirm';

/**
 * ConfirmarImpactoDialog (US-043 PR #3b, design.md §1/Q6a, task 28) — the
 * `EliminarIngestaControl` shape, reused for BOTH destructive-impact
 * confirmations this feature needs: delete and bucket-change. Built on the
 * shared `InlineConfirm` shell (a11y round, part 1): `role="alertdialog"`,
 * `aria-modal="false"` (inline widget, no focus trap — the shipped scoping
 * decision), focus moves to the confirm button on mount, Escape cancels,
 * `role="alert"` inline error, and the dialog does NOT close on failure so
 * the user can retry in place (`EliminarIngestaControl:44-50`).
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
 * `InlineConfirm`'s `ariaLabel` override implements this exactly: visible
 * title via `titleVisible`, but `aria-label` wins over `aria-labelledby`
 * whenever `ariaLabel` is supplied.
 *
 * Pre-existing bug silently fixed by the shell (a11y round, part 1): the
 * old hand-rolled dialog set `aria-label={ariaLabel}` unconditionally, so an
 * empty-string `titulo`/`ariaLabel` (nothing observed to trigger this in
 * practice, but nothing prevented it either) would have rendered with NO
 * accessible name at all. `InlineConfirm` falls back to `aria-labelledby`
 * pointing at the visible title whenever `ariaLabel` is falsy, so the
 * accessible name always resolves to at least the visible `titulo` text.
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
  // `cancelar` (judgment-day round 3, WCTG-07): the SINGLE place that
  // answers "what can dismiss this dialog while its own mutation is in
  // flight" — nothing, until `pendiente` clears, mirroring the confirm
  // button's own `disabled={pendiente}`. Both Escape and the "Cancelar"
  // button (via `InlineConfirm`'s `onCancel`) route through this guard
  // instead of calling `onCancelar` directly.
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
    <InlineConfirm
      title={titulo}
      titleVisible
      ariaLabel={ariaLabel}
      confirmLabel={textoConfirmar}
      destructive
      onConfirm={onConfirmar}
      onCancel={cancelar}
      pending={pendiente}
      cancelDisabled={pendiente}
      error={error}
      className="gap-3 p-4 text-sm"
    >
      {lineas.map((linea, indice) => (
        <p key={indice}>{linea}</p>
      ))}
    </InlineConfirm>
  );
}
