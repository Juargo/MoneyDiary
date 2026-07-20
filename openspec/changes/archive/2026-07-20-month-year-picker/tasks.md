# Tasks: month-year-picker

Frontend-only (`apps/web`). Strict TDD (RED → GREEN → REFACTOR) — every task with
production code starts with a failing test. Test runner: `pnpm web test`
(vitest, jsdom + Testing Library). Work-unit commits (Conventional Commits),
one per numbered task group below. Do NOT push or open a PR — apply phase only.

Requirement IDs reference `openspec/changes/month-year-picker/specs/web-app/spec.md`.

## Review Workload Forecast

- **Estimated changed lines:** ~350–400 (per design, `apps/web` only: 2 modified
  files + tests, 2 new files + tests).
- **400-line budget risk:** **High / near boundary.** Design explicitly flags
  this as "Medium ~350-400 lines" and pre-defines a slice boundary for this
  reason.
- **Chained PRs recommended:** **Yes, conditionally** — recommend splitting at
  the design's own boundary:
  - **Slice 1** (no user-visible effect, safe to land alone): Task 1 (jsdom
    shim) + Task 2 (pure helpers + tests) + Task 3 (popover primitive) + Task 4
    (`MonthYearPicker` + tests), all unwired.
  - **Slice 2** (turns the feature on): Task 5 (wire into `PeriodoSelector`) +
    Task 6 (final verification).
- **Decision needed before apply:** **Yes.** Per `delivery_strategy:
  ask-on-risk`, the orchestrator must confirm with the user before `sdd-apply`
  whether to run this as a single PR with `size:exception`, or as two chained
  PRs (Slice 1 → Slice 2) per `chain_strategy` (stacked-to-main or
  feature-branch-chain). Tasks below are numbered so either choice maps
  cleanly: Slice 1 = Tasks 1–4, Slice 2 = Tasks 5–6.

---

## Task 1 — Enabling: jsdom/Radix test-setup shim

**Type:** sequential, must run first (enabling task).
**Files:** `apps/web/src/test/setup.ts` (M)
**Satisfies:** enables reliable testing of WMYP-01 (popover open/close) and
all downstream Radix-dependent tests; addresses the design's flagged jsdom gap.

- [x] Add `vi.fn()` shims to `apps/web/src/test/setup.ts` for
      `Element.prototype.hasPointerCapture` and
      `Element.prototype.scrollIntoView` if not already present (jsdom does not
      implement these; Radix Popover calls them on open and will throw
      without a shim).
- [x] Confirm existing test suite still passes after the shim (no regression).
- [x] Commit: `test(web): add jsdom shims for Radix popover test setup`

---

## Task 2 — Pure helpers in `periodo-anual.ts` (TDD first)

**Type:** sequential (blocks Task 4); can start in parallel with Task 3.
**Files:** `apps/web/src/domain/periodo-anual.ts` (M),
`apps/web/src/domain/periodo-anual.test.ts` (M)
**Satisfies:** WMYP-03, WMYP-04, WMYP-05 (pure logic backing period jump and
future-month clamp)

- [x] RED: write failing unit tests for `periodoDesde(anio, mes1a12): string`
      — composes and zero-pads (e.g. `periodoDesde(2026, 3)` → `"2026-03"`),
      covers single-digit month zero-padding and December boundary
      (`mes1a12=12`).
- [x] RED: write failing unit tests for `esPeriodoFuturo(periodo, ahora): boolean`
      — true for a period after the current one, false for past, false for
      equal (current-month edge case), using an injected `ahora: Date` (no
      real-clock dependency).
- [x] GREEN: export `periodoDesde` (reuse/promote existing private
      `formatearPeriodo` logic) and implement `esPeriodoFuturo` as a
      zero-padded `YYYY-MM` string comparison against
      `periodoActualUTC(ahora)` (no `Date` math beyond what already exists).
- [x] REFACTOR: ensure no duplication with existing `anioDePeriodo` /
      `periodoActualUTC` helpers; keep functions pure, no side effects.
- [x] Run `pnpm web test -- periodo-anual` — all green.
- [x] Commit: `feat(web): add periodoDesde and esPeriodoFuturo helpers`

---

## Task 3 — Popover primitive `ui/popover.tsx`

**Type:** parallel with Task 2 (no shared code); blocks Task 4.
**Files:** `apps/web/src/components/ui/popover.tsx` (C)
**Satisfies:** WMYP-01, WMYP-07, WMYP-08 (accessible popover shell, Serene
tokens only, no new dependency)

- [x] Create `popover.tsx` wrapping the already-installed `radix-ui` umbrella
      package: `import { Popover as PopoverPrimitive } from "radix-ui"` —
      confirm this import path matches the pattern already used in
      `apps/web/src/components/ui/button.tsx` (e.g. how it imports `Slot`)
      before writing the rest of the file.
- [x] Export `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverAnchor`
      per `PopoverPrimitive.Root/.Trigger/.Portal/.Content/.Anchor`.
- [x] `PopoverContent` renders inside `Portal`, classes
      `z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none`,
      `align="center"`, `sideOffset={8}` — Serene tokens only, no
      `animate-in`/`animate-out` utilities (no tailwindcss-animate plugin
      installed — those classes would be dead per design).
- [x] No unit test required for this file alone (it is a thin Radix wrapper,
      exercised indirectly by Task 4/5 tests) — confirm this matches the
      pattern for other `ui/*.tsx` primitives in the repo (e.g. is
      `button.tsx` unit-tested directly? if yes, mirror that; if no, skip).
- [x] `pnpm web typecheck` clean for the new file.
- [x] Commit: `feat(web): add popover ui primitive (radix-ui wrapper)`

---

## Task 4 — `MonthYearPicker` component (TDD first)

**Type:** sequential, depends on Task 2 (helpers) and Task 3 (popover
primitive is NOT a direct dependency of this component itself, since
`MonthYearPicker` is presentational and popover-agnostic per design D3 — but
keep after Task 3 for review-order clarity).
**Files:** `apps/web/src/components/MonthYearPicker.tsx` (C),
`apps/web/src/components/MonthYearPicker.test.tsx` (C)
**Satisfies:** WMYP-02, WMYP-03, WMYP-04, WMYP-05, WMYP-07, WMYP-08

- [x] RED: write failing RTL tests (props-only, no fake timers per design —
      inject `periodo`, `periodoActual` as plain strings):
  - [x] renders 12 cells with Spanish `mesAbreviado` (Ene..Dic) for the
        displayed year
  - [x] cell matching `periodo` is marked active (`aria-pressed="true"`) and
        no other cell is
  - [x] clicking an enabled past/current month calls `onSelect` with the
        correctly composed `YYYY-MM`
  - [x] months after the current month (when displayed year === current year)
        are natively `disabled`; clicking/activating them does not call
        `onSelect`
  - [x] year-nav prev button re-renders the grid for `anioMostrado - 1`
        (always enabled)
  - [x] year-nav next button is disabled when `anioMostrado >= currentYear`;
        enabled and advances the grid otherwise
  - [x] each cell exposes `aria-label={mesCompletoLabel(...)}` (full month
        name) for accessibility
  - [x] keyboard: Tab reaches cells, Enter/Space activates an enabled cell
- [x] GREEN: implement `MonthYearPicker` per design D3 — props
      `{ periodo: string; periodoActual: string; onSelect: (periodo: string) => void }`,
      internal `anioMostrado` state initialized from the viewed period's year,
      grid `grid grid-cols-3 gap-2` of `<Button variant="ghost" size="sm">`
      cells (active → `variant="default"`), year-nav row
      `flex items-center justify-between` with `Button variant="ghost"
      size="icon-sm"` + lucide chevrons and Spanish `aria-label`s ("Año
      anterior" / "Año siguiente"), year shown in `<span aria-live="polite">`.
- [x] REFACTOR: ensure no raw `slate-*`/`gray-*` Tailwind classes anywhere in
      this file (WMYP-08).
- [x] Run `pnpm web test -- MonthYearPicker` — all green.
- [x] Commit: `feat(web): add MonthYearPicker component`

---

## Task 5 — Wire into `PeriodoSelector.tsx`

**Type:** sequential, depends on Tasks 2, 3, 4. This is the task that turns
the feature on for users — candidate Slice 2 boundary if chaining.
**Files:** `apps/web/src/components/PeriodoSelector.tsx` (M),
`apps/web/src/components/PeriodoSelector.test.tsx` (M)
**Satisfies:** WPER-01, WMYP-01, WMYP-03, WMYP-06

- [x] RED: extend `PeriodoSelector.test.tsx` (fake timers + `fireEvent` per
      existing convention in this file — do NOT switch to `userEvent`, it
      hangs under fake timers here) with failing tests:
  - [x] clicking the period label opens the popover and shows the month grid
  - [x] selecting an enabled month fires `onChange` with the composed
        `YYYY-MM` value and closes the popover
  - [x] Escape closes the popover and returns focus to the trigger
      (WMYP-01)
  - [x] prev/next arrows and "Hoy" still work exactly as before, unaffected
        by the popover's presence (WMYP-06 guardrail — do not remove or
        alter existing arrow/"Hoy" assertions)
- [x] GREEN: implement per design D4 — compute `ahora = new Date()` once
      (single Date injection point), derive `efectivo`/`periodoActual` as
      before, add `const [abierto, setAbierto] = useState(false)`. Replace
      the static label `<span>` with
      `<Popover open={abierto} onOpenChange={setAbierto}><PopoverTrigger
      asChild><Button variant="ghost" aria-label="Cambiar mes y año,
      actualmente {label}" className="text-xl font-semibold
      text-foreground">{label}</Button></PopoverTrigger><PopoverContent>
      <MonthYearPicker periodo={efectivo} periodoActual={periodoActual}
      onSelect={(p) => { onChange(p); setAbierto(false); }} /></PopoverContent>
      </Popover>`.
- [x] Guardrail check: `{ periodo, onChange }` external contract untouched,
      no changes to `ResumenScreen` or bucket-reset logic, arrows/"Hoy"
      clamp logic (`esMesActual`) untouched.
- [x] Run `pnpm web test -- PeriodoSelector` — all green.
- [x] Commit: `feat(web): wire MonthYearPicker into PeriodoSelector via popover`

---

## Task 6 — Final verification

**Type:** sequential, last.
**Files:** none (verification only)

- [x] Full `pnpm web test` — all green (no regressions in any other web
      suite).
- [x] `pnpm web typecheck` — clean.
- [x] Grep the diff for raw Tailwind palette classes (`slate-`, `gray-`) in
      the new/modified files — none present (WMYP-08).
- [x] Manual smoke read: confirm no `apps/api` domain import was introduced
      anywhere in `apps/web`.
- [x] If following the Slice 1/Slice 2 split, confirm Slice 1 alone (Tasks
      1–4) compiles, typechecks, and passes tests with zero user-visible
      change before Slice 2 lands.

---

## Parallelization Summary

- **Sequential spine:** Task 1 → Task 2 → Task 4 → Task 5 → Task 6.
- **Parallel opportunity:** Task 3 (popover primitive) has no dependency on
  Task 2 and can be built concurrently with it; both must land before Task 4.
- **Hard sequencing constraint:** Task 5 (wiring) must not start until Tasks
  2, 3, and 4 are GREEN — it is the only task that changes user-visible
  behavior and the natural Slice 2 boundary.
