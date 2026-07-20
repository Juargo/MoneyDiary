# Tasks: period-selector-header

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~180-230 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Domain helpers + component rewrite + wiring | PR 1 | Single PR — small, cohesive, frontend-only |

## Phase 1: Domain Helpers (RED → GREEN)

- [x] 1.1 RED — In `apps/web/src/domain/periodo-anual.test.ts`, add failing tests for `mesAnterior` (incl. `2026-01` → `2025-12` rollover), `mesSiguiente` (incl. `2026-12` → `2027-01` rollover), and `esMesActual(periodo, ahora)` true/false with injected `ahora`.
- [x] 1.2 GREEN — In `apps/web/src/domain/periodo-anual.ts`, implement `mesAnterior`, `mesSiguiente`, `esMesActual` as pure `YYYY-MM` string helpers (parse ints, no `Date` arithmetic, UTC-safe, never throw). Run `pnpm web test` until green.
- [x] 1.3 REFACTOR — Dedupe regex/parsing against existing `PERIODO_REGEX` pattern in the same file; no behavior change.

## Phase 2: PeriodoSelector Component (RED → GREEN)

- [x] 2.1 RED — Rewrite `apps/web/src/components/PeriodoSelector.test.tsx` (replaces the old `<input type="month">` assertions) with failing RTL tests: renders `mesCompletoLabel(periodo)`; prev click calls `onChange` with `mesAnterior(periodo)`; next click calls `onChange` with `mesSiguiente(periodo)`; next control `disabled` when `esMesActual(periodo, ahora)`; Hoy click calls `onChange` with `periodoActualUTC(ahora)`; Hoy `disabled` at current month; prev/next/Hoy each have distinct Spanish `aria-label`s (`Mes anterior`/`Mes siguiente`/`Ir al mes actual`).
- [x] 2.2 GREEN — Rewrite `apps/web/src/components/PeriodoSelector.tsx`: keep `{ periodo, onChange }` props verbatim; compute `efectivo = periodo ?? periodoActualUTC(new Date())`; render `<Button variant="ghost" size="icon-sm">` (ChevronLeft, `aria-label="Mes anterior"`) + centered label (`text-xl font-semibold text-foreground`) + next `<Button variant="ghost" size="icon-sm">` (ChevronRight, `aria-label="Mes siguiente"`, `disabled` when `esMesActual`) + `<Button variant="outline" size="sm">Hoy</Button>` (`aria-label="Ir al mes actual"`, `disabled` when `esMesActual`); chevron icons `aria-hidden`. Only Serene tokens — no `slate-*`/`gray-*`. Run `pnpm web test` until green.
- [x] 2.3 REFACTOR — Extract row layout class (`mx-auto flex w-full max-w-6xl items-center justify-center gap-3`) as a single wrapper; no behavior change.

## Phase 3: Wiring

- [x] 3.1 In `apps/web/src/components/ResumenPage.tsx`, promote the `PeriodoSelector` slot (lines 33-35) from the right-aligned `max-w-xl justify-end` box to the new centered top header row; keep passing `periodo`/`onPeriodoChange` unchanged — do NOT touch the `onPeriodoChange` prop signature or `ResumenScreen`'s bucket-reset effect (`ResumenScreen.tsx:87-89`).
- [x] 3.2 Guardrail check (no code change): confirm `ResumenScreen.tsx` bucket-reset effect and `routes/index.tsx` container navigation still compile untouched after 3.1.

## Phase 4: Verification

- [x] 4.1 Run `pnpm web test` — full suite green, including Phase 1/2 tests and existing `ResumenPage`/`ResumenScreen` tests unaffected. (419/419 passed)
- [x] 4.2 Run `pnpm web typecheck` — no TS errors.
- [x] 4.3 Manual/grep check: no `slate-*`/`gray-*` classes remain in `PeriodoSelector.tsx` (WPER-07).
