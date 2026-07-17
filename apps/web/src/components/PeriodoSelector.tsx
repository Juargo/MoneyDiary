/**
 * Period picker for the resumen screen. Backed by the route's `periodo`
 * search param (design.md D2 — TanStack Router search params, not zustand).
 * Pure presentational: the container owns `navigate({ search: (prev) => ({
 * ...prev, periodo }) })` (W1.12) — this component only reports the raw
 * `YYYY-MM` value via `onChange`. `periodo` undefined (invalid/absent search
 * param) shows an empty picker; the backend resolves the current month.
 */
export function PeriodoSelector({
  periodo,
  onChange,
}: {
  readonly periodo: string | undefined
  readonly onChange: (periodo: string) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      Período
      <input
        type="month"
        aria-label="Período"
        value={periodo ?? ''}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value)
        }}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
      />
    </label>
  )
}
