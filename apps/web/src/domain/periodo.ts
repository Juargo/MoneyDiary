/**
 * `YYYY-MM` only (backend contract). Pure validation — no default/fallback
 * logic here (that's the caller's job: `useResumen(undefined)` calls
 * `/api/resumen` without a query param and the backend resolves the current
 * month, spec W1.8). Extracted from `routes/index.tsx` so the invalid-input
 * contract is independently testable without a router harness.
 */
const PERIODO_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

export function normalizarPeriodo(raw: unknown): string | undefined {
  return typeof raw === 'string' && PERIODO_REGEX.test(raw) ? raw : undefined
}
