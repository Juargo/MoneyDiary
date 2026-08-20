import { periodoActualUTC } from './periodo-anual';

/**
 * `YYYY-MM` normalizers for route search params, plus the thin current-month
 * helper `periodoActual()` (D-01, US-054): the file is no longer "pure
 * validation only" — the normalizers keep the invalid-input → `undefined`
 * contract (fallback is the caller's job: `useResumen(undefined)` calls
 * `/api/resumen` without a query param and the backend resolves the current
 * month, spec W1.8), and `periodoActual()` is the production convenience for
 * "current calendar month" that the `/ingresos` page needs (WDI-01: the
 * wire carries no `periodo` echo, MID-01, so the month label derives from
 * `mesCompletoLabel(periodo ?? periodoActual())`). Extracted from
 * `routes/index.tsx` so the invalid-input contract is independently testable
 * without a router harness.
 */
const PERIODO_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export function normalizarPeriodo(raw: unknown): string | undefined {
  return typeof raw === 'string' && PERIODO_REGEX.test(raw) ? raw : undefined;
}

/**
 * Current calendar month as `YYYY-MM` — thin zero-arg convenience over
 * `periodoActualUTC(new Date())` (D-01): the deterministic, injected-`ahora`
 * core stays in `periodo-anual.ts`; this is the production default. Absent
 * `periodo` on `/ingresos` → the current month (WDI-03/MID-04).
 */
export function periodoActual(): string {
  return periodoActualUTC(new Date());
}

/**
 * `destacar` search param — US-053 (D-01): strict, fail-closed parser.
 * Exactly the semantic literal `'sin-categoria'` (the named constant
 * `CLAVE_SIN_CATEGORIA`, defined below — D-08 re-homed it here from the
 * flat chain, which is deleted in T-18) else `undefined`. Never coerced
 * (`'1'`/`'true'`/`''` → `undefined`), never defaulted — the highlight is
 * opt-in by literal only.
 */
export function normalizarDestacar(raw: unknown): 'sin-categoria' | undefined {
  return raw === CLAVE_SIN_CATEGORIA ? 'sin-categoria' : undefined;
}

/**
 * The semantic key of the unassigned group (US-053 D-01/D-08) — travels as
 * a named constant so `'sin-categoria'` never appears raw in route wiring,
 * e2e stubs, or tests (DRY). Re-homed here from
 * `agrupar-detalle-por-categoria.ts` in T-17 (that chain is deleted in
 * T-18; this constant survives).
 */
export const CLAVE_SIN_CATEGORIA = 'sin-categoria';
