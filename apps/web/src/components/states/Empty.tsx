/**
 * Empty state (spec W1-02): shown when `sinIngreso: true`. Invites the user
 * to load a cartola — deliberately distinct from a bucket rendering "$0" or
 * "0%", which describe a zero amount, not an absent income. DOM port of
 * `apps/mobile/src/components/states/Empty.tsx`.
 */
export function Empty() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-8 text-center">
      <p className="text-sm font-medium text-slate-700">
        Todavía no hay movimientos este período
      </p>
      <p className="text-sm text-slate-500">Carga una cartola para ver tu resumen del mes.</p>
    </div>
  )
}
