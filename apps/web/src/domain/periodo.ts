import { CLAVE_SIN_CATEGORIA } from './agrupar-detalle-por-categoria';

/**
 * `YYYY-MM` only (backend contract). Pure validation — no default/fallback
 * logic here (that's the caller's job: `useResumen(undefined)` calls
 * `/api/resumen` without a query param and the backend resolves the current
 * month, spec W1.8). Extracted from `routes/index.tsx` so the invalid-input
 * contract is independently testable without a router harness.
 */
const PERIODO_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export function normalizarPeriodo(raw: unknown): string | undefined {
  return typeof raw === 'string' && PERIODO_REGEX.test(raw) ? raw : undefined;
}

/**
 * `destacar` search param — US-053 (D-01): strict, fail-closed parser.
 * Exactly the semantic literal `'sin-categoria'` (the named constant
 * `CLAVE_SIN_CATEGORIA`, re-homed here in T-17 — while this chain lives, the
 * constant is imported from `agrupar-detalle-por-categoria.ts`, which is
 * deleted in T-18) else `undefined`. Never coerced (`'1'`/`'true'`/`''` →
 * `undefined`), never defaulted — the highlight is opt-in by literal only.
 */
export function normalizarDestacar(raw: unknown): 'sin-categoria' | undefined {
  return raw === CLAVE_SIN_CATEGORIA ? 'sin-categoria' : undefined;
}
