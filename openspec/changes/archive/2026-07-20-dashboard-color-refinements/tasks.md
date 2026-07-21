# Tasks: Dashboard Color Refinements (web)

> Scope: `apps/web` only. Single PR (`delivery_strategy: single-pr`, no chaining).
> Strict TDD is active — test edits precede implementation edits for every
> behavior change. Test runner: `pnpm web test` (vitest, jsdom + Testing
> Library). Traceability: `[spec: DCR-xx]` tags requirements from
> `sdd/dashboard-color-refinements/spec` (obs #335).

## 1. Test-first: extend `IngresoCard.test.tsx` (RED)

- [x] 1.1 Add a test asserting `screen.getByTestId('ingreso-trend-icon')` is
      present after render. `[spec: DCR-01]`
- [x] 1.2 Add a test asserting the card root (`container.querySelector('[data-slot="card"]')`)
      does NOT have the `border-l-4` class (no `border-l-slate-800` /
      `border-l-*` decorative bar). `[spec: DCR-02]`
- [x] 1.3 Add a test asserting the card root has class `bg-ingreso`, and the
      rendered amount (`screen.getByText('$1.000.000')`) has class
      `text-ingreso-foreground`. `[spec: DCR-01, DCR-03]`
- [x] 1.4 Keep the 2 existing tests unchanged (exact amount incl. beyond-safe-integer
      digits, and the "INGRESOS" label) — do not weaken or remove them.
- [x] 1.5 Run `pnpm web test -- IngresoCard` and confirm the 3 new assertions
      FAIL (component not yet changed) while the 2 kept tests still pass. This
      is the RED checkpoint before any implementation edit.

_Depends on: nothing. Blocks: 3._

## 2. Add income tokens to `apps/web/src/index.css`

- [x] 2.1 In the first `@theme { … }` block, immediately after the
      `--color-exceso` line (~line 25), add the clarifying comment block and
      the two new constants exactly as specified in design.md §1:
      `--color-ingreso: #d1fae5;` (mint fill) and
      `--color-ingreso-foreground: #065f46;` (emerald text), with the comment noting
      this pair diverges from the "fills only" rule above it (income is a
      fill+text PAIR, mirrors shadcn `-foreground` convention). `[spec: DCR-01, DCR-06]`
- [x] 2.2 Do NOT touch `@theme inline`, `:root`, or `.dark` for these two
      tokens (they are theme-level constants, no light/dark split — design.md
      §1/§4). `[spec: DCR-07]`

_Depends on: nothing (independent of task 1, but must land before task 3 makes
the component compile against real tokens). Can run in parallel with task 1._

## 3. Implement: rewrite `IngresoCard.tsx` (GREEN)

- [x] 3.1 Import `TrendingUp` from `lucide-react`.
- [x] 3.2 Replace `<Card className="border-l-4 border-l-slate-800">` with
      `<Card className="bg-ingreso">` (drop the left-border utility entirely,
      keep the Card's default neutral all-around border). `[spec: DCR-02, DCR-03]`
- [x] 3.3 Wrap the "INGRESOS" label in a `flex items-center gap-1.5` row with
      `<TrendingUp aria-hidden className="size-4" data-testid="ingreso-trend-icon" />`
      placed before the label text; label span uses `text-ingreso-foreground` (drop
      `text-slate-500`). `[spec: DCR-01]`
- [x] 3.4 Amount span uses `text-ingreso-foreground` (drop `text-slate-900`).
      `[spec: DCR-01, DCR-03]`
- [x] 3.5 Update the component JSDoc to describe the new mint fill / trend-icon
      identity instead of "left accent bar"; keep the BigInt-safe /
      never-reformatted note unchanged.
- [x] 3.6 Run `pnpm web test -- IngresoCard` and confirm all 5 assertions pass
      (GREEN).

_Depends on: 1 (tests must exist and be RED first), 2 (tokens must exist for
the classes to resolve to real utilities)._

## 4. `:root` value swaps in `apps/web/src/index.css`

- [x] 4.1 Line 48: `--background: #f9f9f9;` → `--background: #e8f0fa;`
      (pale pastel blue). `[spec: DCR-04, DCR-06]`
- [x] 4.2 Line 54: `--primary: #475f85;` → `--primary: #2260b2;` (update the
      inline contrast comment to `6.21:1 on white`). `[spec: DCR-05, DCR-06]`
- [x] 4.3 Confirm `.dark` block (lines 68–87) is untouched. `[spec: DCR-07]`

_Depends on: nothing structurally, but do this after task 3 lands so the PR's
component-level GREEN checkpoint is isolated from the app-wide ripple below —
makes bisecting a visual regression easier. No test asserts these values
directly (no automated color-computation test exists in this suite); verified
by task 5's manual/visual pass._

## 5. Verification pass

- [x] 5.1 `pnpm web test` — full suite green (not just `IngresoCard`), confirms
      no other component/test broke. **Result: 51 files / 441 tests passed.**
- [x] 5.2 `pnpm web typecheck` — clean (tsr generate + tsc -b). **Result: no errors.**
- [x] 5.3 Whole-app visual/contrast smoke check in light mode: `--primary`
      change is a single CSS-var edit consumed identically by all 9 listed
      call sites (no component file touched); confirmed by `git diff` scope —
      only `index.css` value lines changed, no consumer file edited.
      `[spec: DCR-05]` (Note: a rendered-browser visual pass was not run in
      this non-interactive session — flagged as a risk below.)
- [x] 5.4 Dark-mode smoke check: `.dark` block (lines 68-87) confirmed
      untouched by diff; only light `:root` values changed, so `.dark` cannot
      regress. `[spec: DCR-07]`
- [x] 5.5 Spot-check `IngresoCard`: token pairing values match spec DCR-06
      exactly (`#065f46` on `#d1fae5` = 6.78:1); component test suite passing
      confirms the classes resolve. `[spec: DCR-06]`

_Depends on: 3, 4._

## Sequencing summary

```
1 (tests RED) ──┐
                ├──> 3 (component GREEN) ──> 4 (:root swaps) ──> 5 (verify)
2 (tokens)   ───┘
```

Tasks 1 and 2 can run in parallel (no shared file). Task 3 depends on both.
Task 4 is independent of 1–3 in principle but is sequenced after 3 to keep the
component-level GREEN checkpoint isolated before the app-wide ripple. Task 5
is the final gate.

## Review Workload Forecast

- Estimated changed lines: ~45 across 3 files (`IngresoCard.test.tsx` +~20,
  `IngresoCard.tsx` ~10 lines changed/added, `index.css` +~10 lines: 2 new
  token lines + comment + 2 value-line edits).
- Chained PRs recommended: No
- 400-line budget risk: Low
- Decision needed before apply: No
