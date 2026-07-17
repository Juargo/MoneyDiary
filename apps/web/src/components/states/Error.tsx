import type { ApiError } from '@/api/client'

/**
 * Error state (spec W1-02): renders the typed `ApiError.message` verbatim —
 * `client.ts` already produces a human-readable Spanish message per tag, so
 * this component doesn't duplicate a copy-per-tag switch (DRY). Always
 * renders a retry affordance so the user isn't stuck on a dead screen.
 */
export function ErrorState({
  error,
  onRetry,
}: {
  readonly error: ApiError
  readonly onRetry: () => void
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="text-sm text-slate-700">{error.message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full bg-slate-800 px-6 py-2 text-sm font-semibold text-white"
      >
        Reintentar
      </button>
    </div>
  )
}
