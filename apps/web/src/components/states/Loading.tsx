/**
 * Loading state (spec W1-02): shown while the resumen request is in flight.
 * Centered spinner + label — no bucket data, no error copy. DOM port of
 * `apps/mobile/src/components/states/Loading.tsx`.
 *
 * A11y (ADR-018): `role="status"` wraps the spinner AND the label so
 * mounting this component announces the message to assistive technology — a
 * `role="status"` region with no accessible content announces nothing.
 *
 * Reused verbatim by the bucket detail screen (`BucketDetalleMesPage`,
 * US-053):
 * the default `message` is resumen-specific, so a screen reader announcing
 * "Cargando resumen…" while on `/buckets/:bucket` would be misleading. The
 * optional `message` prop lets other screens supply context-appropriate
 * copy without duplicating this component (DRY) — the resumen screen keeps
 * the default, unchanged.
 *
 * Design-system hardening round 2 (P1): reskinned off raw `slate-*` onto
 * the Serene Finance semantic tokens (`--border`/`--foreground`) — this
 * renders on every fetch lifecycle, so it must look native, not like a
 * leftover from the shadcn `slate` base color. Contrast (index.css hexes):
 * `--muted-foreground` (#44474e) on `--background` (#e8f0fa) ≈ 8.13:1 (AA).
 *
 * `compact` (peak-end landing, `SubirCartola` exito state): the default
 * `min-h-[60vh]` wrapper centers this for a WHOLE PAGE — correct for
 * `ResumenPage`/`BucketDetalleMesPage`, but a small inline slot inside an
 * already-laid-out success card would flash to 60% of the viewport height
 * and then collapse once the data arrives. `compact` renders the SAME
 * accessible contract (a `role="status"` region wrapping spinner + label)
 * as a lean inline row instead — no new component, no duplicated markup
 * fork of the a11y wiring.
 */
export function Loading({
  message = 'Cargando resumen…',
  compact = false,
}: { readonly message?: string; readonly compact?: boolean } = {}) {
  if (compact) {
    return (
      <div role="status" className="flex items-center gap-2">
        <div
          data-testid="loading-spinner"
          aria-hidden="true"
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-foreground"
        />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <div role="status" className="flex flex-col items-center gap-3">
        <div
          data-testid="loading-spinner"
          aria-hidden="true"
          className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-foreground"
        />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
