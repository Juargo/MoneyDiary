/**
 * Empty state (spec W1-02): shown when `sinIngreso: true`. Invites the user
 * to load a cartola — deliberately distinct from a bucket rendering "$0" or
 * "0%", which describe a zero amount, not an absent income. DOM port of
 * `apps/mobile/src/components/states/Empty.tsx`.
 *
 * Reused verbatim by the bucket detail screen (`BucketDetailList`, US-017):
 * the default copy ("Carga una cartola…") is resumen-specific and
 * misleading when a bucket simply has no transactions this period. The
 * optional `title`/`description` props let other screens supply
 * context-appropriate copy without duplicating this component (DRY) — the
 * resumen screen keeps the defaults, unchanged.
 */
export function Empty({
  title = 'Todavía no hay movimientos este período',
  description = 'Carga una cartola para ver tu resumen del mes.',
}: { readonly title?: string; readonly description?: string } = {}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-8 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  )
}
