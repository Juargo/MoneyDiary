/**
 * Loading state (spec W1-02): shown while the resumen request is in flight.
 * Centered spinner + label — no bucket data, no error copy. DOM port of
 * `apps/mobile/src/components/states/Loading.tsx`.
 */
export function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <div
        data-testid="loading-spinner"
        role="status"
        className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
      />
      <p className="text-sm text-slate-500">Cargando resumen…</p>
    </div>
  )
}
