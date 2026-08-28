import { useEffect, useId, useRef } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode, RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * InlineConfirm — the shared `role="alertdialog"` recipe behind every
 * destructive/impact confirmation in the app (DESIGN.md "Inline
 * Confirmation Dialog"), extracted from four hand-duplicated instances:
 * `EliminarIngestaControl`, `ReclasificarCategoriaControl`,
 * `ConfirmarPasswordDialog`, `ConfirmarImpactoDialog` (a11y round, part 1 —
 * the impeccable critique flagged the scaffolding as "duplicated by
 * discipline — fragile to maintain").
 *
 * NON-MODAL by product decision (approved, not re-litigated here): inline,
 * no overlay, no portal, no focus trap — `aria-modal="false"` explicit. Tab
 * may leave the dialog; that is ARIA-conformant for a non-modal alertdialog
 * and matches the product's calm-over-drama identity.
 *
 * Owns: the shell recipe (border/bg/shadow/radius), Escape-to-cancel,
 * focus-on-open (to the confirm button by default, or to `initialFocusRef`
 * for `ConfirmarPasswordDialog`'s password-first flow), the
 * Cancelar/Confirmar footer at the house default 36px touch target (never
 * the 24px `xs` size — already fixed for all four sites by
 * `b7d01757`; this component simply never opts back into `xs`), and the
 * inline `role="alert"` error slot.
 *
 * Does NOT own:
 * - Open/close state. The caller mounts this exactly while the confirmation
 *   is open — same lifecycle the four hand-rolled dialogs already had — so
 *   mounting IS opening; there is no `open` prop.
 * - Focus restoration on cancel/Escape. Both route through the caller's own
 *   `onCancel`, which may or may not restore focus (two of the four sites
 *   restore it themselves; the other two leave it to THEIR caller) — this
 *   component has no opinion and no trigger ref to restore to.
 * - Any guard on `onCancel`/Escape while `pending` — `cancelDisabled` only
 *   toggles the button's own `disabled` attribute. A site whose Escape must
 *   also no-op while pending (`ConfirmarImpactoDialog`) supplies an
 *   `onCancel` that already guards on its own `pending`-equivalent state,
 *   the same guard it always owned.
 *
 * `title`/`titleVisible`/`titleAsHeading`/`ariaLabel` together cover the
 * four real accessible-name shapes needed today — see each prop's doc
 * comment for which site drives it. Not generalized further (YAGNI): only
 * these four consumers exist.
 */
export interface InlineConfirmProps {
  /** Title text. Always the default accessible name (via `aria-label` when
   * not `titleVisible`, or `aria-labelledby` when it is), unless `ariaLabel`
   * overrides it. */
  readonly title: string;
  /** Render `title` as a visible line above the body — default `false`
   * (`EliminarIngestaControl`/`ReclasificarCategoriaControl` never showed
   * one; `ConfirmarPasswordDialog`/`ConfirmarImpactoDialog` do). */
  readonly titleVisible?: boolean;
  /** Render the visible title as `<h2>` instead of `<p>` —
   * `ConfirmarPasswordDialog`'s only need, for the heading a screen-reader
   * user's heading list picks up. No-op unless `titleVisible` is also set —
   * there is no title element to tag with a heading tag otherwise. */
  readonly titleAsHeading?: boolean;
  /** Overrides the accessible name with `aria-label`, even when the title is
   * visible — `ConfirmarImpactoDialog`'s per-row disambiguation: several
   * simultaneously open rows render the identical visible `title` text, but
   * each needs a distinct accessible name. */
  readonly ariaLabel?: string;
  /** The described body — amounts, counts, warnings. Wired to
   * `aria-describedby`. */
  readonly children: ReactNode;
  /** Interactive content rendered after the described body (inside the
   * `<form>` when `asForm`) without joining the description —
   * `ConfirmarPasswordDialog`'s password field. */
  readonly extra?: ReactNode;
  readonly confirmLabel: string;
  /** @default 'Cancelar' — every real call site uses this literal. */
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /** Disables the confirm control. @default false */
  readonly pending?: boolean;
  /** Disables the cancel control. @default false — only
   * `ConfirmarImpactoDialog` sets this (mirrors its own `pending`, so
   * neither control is operable while its mutation is in flight). */
  readonly cancelDisabled?: boolean;
  /** Renders inline via `role="alert"`; the dialog stays mounted. */
  readonly error?: string | null;
  /** Confirm button variant. @default false (primary) */
  readonly destructive?: boolean;
  /** Wraps the body in a `<form>` and makes Confirmar `type="submit"`, so
   * pressing Enter in `extra`'s field submits — `ConfirmarPasswordDialog`
   * only. */
  readonly asForm?: boolean;
  /** Focus target on open, instead of the confirm button. */
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  /** Extra classes for the outer shell. Density (gap/padding/text size)
   * varies by call site; the border/bg/shadow/radius recipe stays fixed
   * here. */
  readonly className?: string;
}

export function InlineConfirm({
  title,
  titleVisible = false,
  titleAsHeading = false,
  ariaLabel,
  children,
  extra,
  confirmLabel,
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  pending = false,
  cancelDisabled = false,
  error = null,
  destructive = false,
  asForm = false,
  initialFocusRef,
  className,
}: InlineConfirmProps) {
  const titleId = useId();
  const bodyId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Mount-only: every caller conditionally renders `InlineConfirm` exactly
  // while its confirmation is open (same lifecycle as the four hand-rolled
  // dialogs it replaces) — mounting IS opening, so a mount effect is the
  // correct "on open" hook for all four, with no `open` prop needed.
  useEffect(() => {
    (initialFocusRef?.current ?? confirmRef.current)?.focus();
  }, [initialFocusRef]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      onCancel();
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm();
  }

  const nameProps = ariaLabel
    ? { 'aria-label': ariaLabel }
    : titleVisible
      ? { 'aria-labelledby': titleId }
      : { 'aria-label': title };

  const TitleTag = titleAsHeading ? 'h2' : 'p';

  const body = (
    <>
      {/* `display: contents` (`className="contents"`) is load-bearing twice
          over: it gives `children` a real DOM id for `aria-describedby` to
          reference, AND it keeps this `<div>` out of the box tree so
          `children` become direct flex items of the outer `flex flex-col`
          container — preserving that container's `gap` between title/body/
          error/footer exactly as if this wrapper `<div>` were not there. A
          plain (non-`contents`) wrapper would swallow the gap between
          multi-line bodies (e.g. `ConfirmarImpactoDialog`'s `lineas`). Same
          reasoning applies to the `<form className="contents">` below. */}
      <div id={bodyId} className="contents">
        {children}
      </div>
      {extra}
      {error != null && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={cancelDisabled}
          className="text-muted-foreground"
        >
          {cancelLabel}
        </Button>
        <Button
          ref={confirmRef}
          type={asForm ? 'submit' : 'button'}
          variant={destructive ? 'destructive' : 'default'}
          onClick={asForm ? undefined : onConfirm}
          disabled={pending}
        >
          {confirmLabel}
        </Button>
      </div>
    </>
  );

  return (
    // `role="alertdialog"`'s ARIA superclass chain is `window > dialog`, not
    // `widget` (verified against aria-query 5.3.2), so
    // `jsx-a11y/no-noninteractive-element-interactions` cannot distinguish
    // this Escape-to-close container from an arbitrary `<div onKeyDown>` —
    // same disable every one of the four sites this replaces already
    // carried individually. The WAI-ARIA dialog pattern binds Escape at the
    // container, not at a specific control.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="alertdialog"
      aria-modal="false"
      {...nameProps}
      aria-describedby={bodyId}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex flex-col rounded-lg border border-border bg-card text-foreground shadow-sm',
        className,
      )}
    >
      {titleVisible && (
        <TitleTag id={titleId} className="font-semibold text-foreground">
          {title}
        </TitleTag>
      )}
      {asForm ? (
        <form onSubmit={handleFormSubmit} className="contents">
          {body}
        </form>
      ) : (
        body
      )}
    </div>
  );
}
