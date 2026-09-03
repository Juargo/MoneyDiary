import type { ApiError } from '@/api/client';
import { Button } from '@/components/ui/button';

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
 *
 * Design-system hardening round 2 (P1): the message now carries
 * `text-destructive` (it IS an error, semantically) and the hand-rolled
 * `rounded-full bg-slate-800` retry pill is retired in favor of the shared
 * `<Button>` (default variant — the only action on this screen, same
 * weight as a primary "Confirmar"). Contrast (index.css hexes):
 * `--destructive` (#e11d48) on `--background` (#090a0f) ≈ 4.21:1 (AA) — was
 * 5.62:1 as #ba1a1a on the retired light palette's #e8f0fa. The token value
 * changed with the Tecno-Analítico restyle (2026-09-03) and is CONSTRAINED:
 * shadcn's stock `button.tsx`/`badge.tsx` hardcode `text-white` on
 * `bg-destructive`, so it must also keep white text above 4.5:1 (it is
 * 4.70:1). See the note on `--destructive` in `index.css` before retinting.
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
      <p role="alert" className="text-sm text-destructive">
        {mensaje ?? error.message}
      </p>
      <Button type="button" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
