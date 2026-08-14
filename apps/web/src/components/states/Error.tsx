import type { ApiError } from '@/api/client';

/**
 * Error state (spec W1-02): renders the typed `ApiError.message` verbatim —
 * `client.ts` already produces a human-readable Spanish message per tag, so
 * this component doesn't duplicate a copy-per-tag switch (DRY). Always
 * renders a retry affordance so the user isn't stuck on a dead screen.
 *
 * `mensaje` overrides that default for a feature that owns a RICHER error
 * table than the per-tag default — today only the catalog (US-043), whose
 * `mensajeDeErrorCatalogo` maps the server's `code` to specific copy. The
 * override exists so the catalog's list and edit screens say the same thing
 * for the same `ApiError` (WCTG-12) without forking this component; `error`
 * stays required, so the a11y contract and the retry affordance are
 * identical either way, and every other caller keeps the default by omitting
 * the prop.
 *
 * A11y (ADR-018): `role="alert"` carries an implicit `aria-live="assertive"`,
 * so a Data→Error refetch failure interrupts and announces the message to
 * assistive technology instead of failing silently.
 */
export function ErrorState({
  error,
  mensaje,
  onRetry,
}: {
  readonly error: ApiError;
  readonly mensaje?: string;
  readonly onRetry: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-8 text-center">
      <p role="alert" className="text-sm text-slate-700">
        {mensaje ?? error.message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full bg-slate-800 px-6 py-2 text-sm font-semibold text-white"
      >
        Reintentar
      </button>
    </div>
  );
}
