# Tasks: US-048 — Web annual table redesign, navigable mini-charts (#282)

Source of truth: `spec.md` (WTA-01..06, referencing WG5-*/WPER-*/WMYP-*/WDS-04) + `design.md` (D-01..D-16,
§6 test ledger — totals 34 existing / 16 touched / 23 new / 57 final). This file sequences that design into a
strict-TDD, chained-PR-ready checklist. **Do not reopen D-01..D-16 or WTA-01..06 — they are APPROVED.**

Scope: `apps/web` only. Runners: `pnpm web test`, `pnpm web typecheck`, `pnpm web exec eslint .` (baseline: 2
pre-existing warnings — a new warning count above 2 is a regression), `pnpm --filter @moneydiary/web exec
playwright test annual-grid`.

Slicing follows design §8 exactly (A / B / C), with slice **C** split further into three PR-sized units
(C1 / C2a / C2b) purely for review-budget reasons — this does **not** change what C contains or its
dependency order, and does not create any visually-incomplete state on `main` (see Review Workload Forecast).

---

## Slice A — 4-wedge minis (CA-01 / WTA-01) — PR1

No DOM change, no router migration. Independently green (design §8).

- [x] **A1.** RED: invert the existing "renders exactly 3 mini-pie slices" pin in `ResumenAnual.test.tsx`
      to `N-00` — reuse the existing `eneroConSinCategoria` fixture (nonzero `SinCategoria: '100000'`)
      **verbatim**; assert `getAllByTestId('mini-pie-slice')` has length **4** AND the four `fill` values are,
      in ring order, `#8FA7D1`, `#B1A7D1`, `#E6D194`, `#AEB4C4` (§4.1). Confirm it fails against current code
      (still 3 slices, `BUCKETS_5030`).
      Verify: `pnpm web test -- ResumenAnual` shows the inverted assertion RED, all other tests unaffected.
- [x] **A2.** GREEN: in `ResumenAnual.tsx`, delete the `BUCKETS_5030` import and the second argument to
      `calcularDistribucionGasto(mes.buckets, BUCKETS_5030)` → `calcularDistribucionGasto(mes.buckets)`;
      delete the "US-047 PR1 interim" comment (§4 diff, exact).
      Verify: `N-00` passes.
- [x] **A3.** Anti-regression check (§4.2 gotcha): confirm no other test in the suite asserts "3 slices" against
      the shared `mesConDatos` fixture (`SinCategoria: '0'` → now 4 slices, 4th is a zero-sweep arc). Grep the
      test file for slice-count assertions; there must be exactly one (`N-00`).
      Verify: `rg "mini-pie-slice" apps/web/src/components/ResumenAnual.test.tsx`
- [x] **A4.** Sweep (design §9, `calcularDistribucionGasto`/`BUCKETS_5030` rows): confirm the signature is
      unchanged and the only call-site diff is `ResumenAnual.tsx:118`; `resumen-view-model.ts:236` and
      `DistribucionPie.tsx`'s `BUCKETS_5030` import (different code path — ideal-inset record) are untouched.
      Verify: `rg "BUCKETS_5030|calcularDistribucionGasto" apps/web/src -n`
- [x] **A5.** `pnpm web test && pnpm web typecheck && pnpm web exec eslint .` all green (baseline warning count
      unchanged).
- [x] **A6.** Commit (work-unit): `feat(web): read the 4-item ring (incl. Sin categoría) in annual minis` —
      includes A1/A2 test+prod together, one deliverable behavior.

**PR1 boundary:** ends here. ~2 files touched (`ResumenAnual.tsx`, `ResumenAnual.test.tsx`), one inverted
assertion, no new tests. Low review load.

---

## Slice B — Selected-month marker, caption, header copy, prop threading (CA-02 / CA-06 / WTA-02 / WTA-06) — PR2

Still no `<Link>` in `MesCelda` → no test-harness migration (design §8). Depends on PR1 merged (same file).

- [x] **B1.** RED: add `N-01` to `ResumenAnual.test.tsx` — with `periodoSeleccionado="2026-03"`,
      `mes-seleccionado-marker` is inside MAR's control and absent from every other cell. Add the required
      `periodoSeleccionado` prop (D-11) to this one new test's render call. Confirm it fails to compile/render
      (prop doesn't exist yet).
- [x] **B2.** RED: add `N-02` — with `periodoSeleccionado="2026-03"` and `ahora` pinned to a July date: MAR has
      the selected marker and **no** `✓`/`aria-current`; JUL has `✓`+`aria-current="date"` and **no** selected
      marker (D-04's channel split, R-3's closure).
- [x] **B3.** RED: add `N-10` — with `periodoSeleccionado` targeting the `sinIngreso` December fixture,
      `mes-seleccionado-marker` renders inside December's disabled cell without crashing (§2.2 — the marker
      lives in the shared `contenido` fragment already used by `esActual`/FIX 1, so it does not require the
      tag/wrapper restructure that ships in Slice C).
- [x] **B4.** RED: add `N-07` — the caption renders the exact sentence
      `Toca un mes: el gráfico principal cambia a ese mes, con el mismo drill-down de siempre. Estás viendo
      {mes año}.` naming the selected month, and updates when `periodoSeleccionado` changes (WTA-06, D-09/D-10
      APPROVED literal — one template literal, one text node per §6.1's `getByText` note).
- [x] **B5.** GREEN (production, one commit-worthy unit):
      - `ResumenAnual.tsx`: make `periodoSeleccionado: string` a **required** prop (D-11, no default);
        compute `esSeleccionado = mes.periodo === periodoSeleccionado` alongside the existing `esActual`,
        strictly separate (D-04) — `esActual` stops driving any `className`, retire `border-2 border-primary
        bg-muted` from the month button;
      - wrap `MiniDistribucionPie` in the fixed `h-16 w-16` box (D-05); on `esSeleccionado` only, add
        `border-2 border-ingreso-foreground bg-ingreso` + `data-testid="mes-seleccionado-marker"`; add
        `border-2 border-ingreso-foreground` to the selected month control itself (border only);
      - refactor `renderEstado` from four positional params to one named-argument object
        `{ query, onSelectPeriodo, periodoActual, periodoSeleccionado }` (D-12 — prevents the
        `periodoActual`/`periodoSeleccionado` string-swap hazard);
      - add the caption `<p>` (D-09 exact JSX, Info icon, `aria-hidden`) in the data branch only, below the
        grid, as a flex sibling (§2.3);
      - change the `<h2>` text to the APPROVED literal `Año {anio} — vista macro por mes` (D-10).
      - `ResumenScreen.tsx`: pass `periodoSeleccionado={viewModel.periodo}` into `ResumenAnual` (§2.4 data
        flow — `viewModel.periodo` is the single source of truth, never a locally tracked click).
      Verify: `N-01`, `N-02`, `N-10`, `N-07` all pass.
- [x] **B6.** Sweep — `periodoSeleccionado` required prop (D-11, tsc-enforced, 15 sites total): add the prop to
      the remaining **13** existing `ResumenAnual.test.tsx` render calls (the 14th is `N-01`, already added in
      B1) so the whole file compiles. This is mechanical — `tsc` names every miss.
      Verify: `pnpm web exec tsc --noEmit -p apps/web` (or `pnpm web typecheck`) — zero "missing property
      periodoSeleccionado" errors.
- [x] **B7.** Copy edits — the 5-assertion blast radius (D-10 override procedure, exact locations):
      1. `ResumenAnual.test.tsx` title-with-year test (~:315): `'Resumen Anual 2026'` →
         `'Año 2026 — vista macro por mes'`.
      2. `ResumenAnual.test.tsx` region-name-via-`aria-labelledby` test (~:379 **and** :382 — **one test,
         two occurrences**, easy to miss per design's own callout): same string swap, both occurrences.
      3. `ResumenScreen.test.tsx:557`: same string swap (1 assertion).
      4. `ResumenPage.test.tsx:237`: `screen.getByRole('heading', { level: 2, name: 'Resumen Anual 2026' })` →
         `name: 'Año 2026 — vista macro por mes'` (§6.6 — the missed-then-recovered third pin site).
      Verify: `rg "Resumen Anual 2026" apps/web/src` returns **zero** matches when done.
- [x] **B8.** RED→GREEN: add `S-01` to `ResumenScreen.test.tsx` — rendering with `viewModel.periodo =
      '2026-01'` puts `mes-seleccionado-marker` inside ENE's control and nowhere else, proving `ResumenScreen`
      threads `viewModel.periodo` end-to-end (not today, not a local guess). `mockFetchPorBucket`'s annual
      fixture is **not** modified (January already has data).
- [x] **B9.** Anti-blind-re-record check (§4.1 principle applied here): confirm the 15 pre-existing,
      non-copy `ResumenAnual.test.tsx`/`ResumenScreen.test.tsx`/`ResumenPage.test.tsx` assertions are
      byte-identical except for the 5 copy-string edits in B7 — no other assertion text changed.
- [x] **B10.** `pnpm web test && pnpm web typecheck && pnpm web exec eslint .` all green.
- [x] **B11.** Commit(s) (work-unit, may split into 2 if reviewable): `feat(web): selected-month marker,
      caption and header copy in the annual grid` (+ optionally a separate `test:` commit if the RED tests
      were staged first — keep tests with the behavior they verify per skill guidance, so prefer one commit).

**PR2 boundary:** ends here. Files: `ResumenAnual.tsx`, `ResumenScreen.tsx`, `ResumenAnual.test.tsx`,
`ResumenScreen.test.tsx`, `ResumenPage.test.tsx`. No new files, no router migration yet.

---

## Slice C1 — `MiniSemaforoTag` new component, unwired (D-04/D-06/D-07/D-08) — PR3

Self-contained new file, imported nowhere yet — cannot produce a half-rendered page state (nothing changes
visually until C2a wires it in). Independently green.

- [x] **C1-1.** RED: create `apps/web/src/components/MiniSemaforoTag.test.tsx` (harness: `renderConRouter` —
      the `/semaforo` sentinel route already exists in it) with all 8 tests from design §6.2, empty
      component stub or no component yet:
      - `M-01` accessible name `Semáforo de enero 2026: Verde`
      - `M-02` `href="/semaforo?periodo=2026-01"`
      - `M-03` `estadoGlobal: null` → name contains `Sin datos`, still an `<a>`
      - `M-04` `estadoGlobal: 'azul'` (unknown) → falls back to `Sin datos`
      - `M-05` glyph `aria-hidden`, name comes from `sr-only` text
      - `M-06` focusable via `.focus()` → `toHaveFocus()`
      - `M-07` Space fires `preventDefault` and navigates to the sentinel
      - `M-08` click navigates to the sentinel
      Explicitly do **not** add any assertion on `h-7`/`w-7` or any size class (D-06 — target size is
      rendered-geometry-only, proven in `E-01`).
- [x] **C1-2.** GREEN: implement `apps/web/src/components/MiniSemaforoTag.tsx` per the component contract
      (design §3): `<Link to="/semaforo" search={{ periodo }}>`, `h-7 w-7` box, `resolverEstiloSemaforo` as the
      **only** estado source, `sr-only` accessible-name span (`Semáforo de {mesCompletoLabel(periodo)}:
      {estilo.label}`), `aria-hidden` glyph, duplicated `onKeyDown` Space handler (D-08 — do **not** extract
      to a shared helper; this is the sanctioned two-occurrence duplication, extraction trigger is a *third*
      semáforo link), LOCKED `focus-visible:outline-2 focus-visible:outline-slate-800` ring, **no** layout
      props, **no** `className` prop, no state/data access.
      Verify: all 8 `M-*` tests pass.
- [x] **C1-3.** Sweep: confirm `SemaforoTag.tsx`, `SemaforoBadge.tsx`, `MiniDistribucionPie.tsx`,
      `DistribucionPie.tsx`, `distribucion-gasto.ts`, `bucket-colors.ts`, `semaforo-estilos.ts`,
      `periodo-anual.ts` are untouched by construction (design §3 "untouched by construction" list).
      Verify: `git diff --stat` shows only the 2 new files in this slice.
- [x] **C1-4.** `pnpm web test -- MiniSemaforoTag && pnpm web typecheck && pnpm web exec eslint .` green.
- [x] **C1-5.** Commit: `feat(web): add MiniSemaforoTag, a compact navigable semáforo link`.

**PR3 boundary:** ends here. 2 new files only, zero diff to any existing file. Low risk, self-contained.

---

## Slice C2a — `MesCelda` sibling restructure, wiring `MiniSemaforoTag` in (CA-03/CA-04 regression, CA-05,
WTA-03/04/05) — PR4

**R-1 mitigation order is mandatory and sequenced below: audit the pins first, write the new restructure-era
tests RED, restructure, then re-verify every pin unchanged (design §6.1).** Depends on PR2 (selected marker)
and PR3 (`MiniSemaforoTag`) both merged.

- [x] **C2a-1.** **Audit, no code change.** Run the suite and confirm the existing CA-03/CA-04 regression pins
      are green against the **current** (pre-restructure) DOM: the clickable-month test (CA-03 pin), the
      disabled-month test (CA-04 pin), and the FIX-5 test. Record their current query shapes for the
      structure-independence check in C2a-6 (`within(botonActual)`, `closest('[aria-disabled="true"]')`,
      `findByRole('button', { name: 'Ver enero 2026' })`, `queryByRole('button', { name: /diciembre/i })`).
      Verify: `pnpm web test -- ResumenAnual` — these specific tests pass, noted as the baseline.
- [x] **C2a-2.** RED: migrate every `render(<ResumenAnual …/>, { wrapper: crearWrapper() })` call in
      `ResumenAnual.test.tsx` to `renderConRouter(<ResumenAnual …/>)` (D-14, mechanical, all 14 renders —
      Loading/Error/Empty included, per design's "uniformity over technically-still-works" rule). Delete the
      local `crearWrapper` helper. Change the Loading test's fetch mock to a never-resolving `new Promise(()
      => {})` and its assertion to `await findByText('Cargando resumen anual…')` (D-14 — deterministic
      pending state). This step alone should fail to compile/render against the **current** `MesCelda` (no
      `<Link>` yet, so this specific migration doesn't need the restructure — but leaves the file in the
      target harness shape ready for the new tests below).
- [x] **C2a-3.** RED: add the new restructure-era tests to `ResumenAnual.test.tsx` (design §6.3), all
      expected to fail against the current single-button `MesCelda`:
      - `N-03` all 12 months render a semáforo link, each `href="/semaforo?periodo={that month}"`
      - `N-04` December (`sinIngreso`): cell `aria-disabled`, no `tabindex`, click/Enter do not call
        `onSelectPeriodo`, **while** its semáforo link is present and is an `<a>` (D-2's asymmetry, one
        indivisible assertion)
      - `N-05` for every cell: the link is not a descendant of the month control
        (`link.closest('button,[role="button"]')` is `null`) and `within(control).queryByRole('link')` is
        `null` (CA-05's no-nesting rule, in the rendered tree)
      - `N-06` clicking a semáforo link does **not** call `onSelectPeriodo` (D-03's sibling-hit-testing
        closure — the new hazard the restructure introduces)
      - `N-08` the month control precedes its semáforo link in document order
        (`compareDocumentPosition`) (D-02's tab order as a structural fact)
      - `N-09` December's disabled cell has accessible name exactly `DIC` (D-13 — pins the name so a future
        `aria-label` cannot silently invalidate the CA-04 `/diciembre/i` pin)
- [x] **C2a-4.** GREEN: restructure `MesCelda` in `ResumenAnual.tsx` per design §2.1/§2.2/D-01..D-03:
      - wrapper becomes `<div className="relative h-full">` — no role, no handler, no visual styling;
      - month control (button or disabled div) keeps every existing visual class byte-identical, gains
        `h-full w-full`;
      - `<span className="absolute top-1 right-1">` wraps the new `MiniSemaforoTag`, **outside** the disabled
        branch's `opacity-60` element (D-2/D-3);
      - DOM order: month control, then tag — no `tabIndex` anywhere, disabled branch keeps none (D-02, FIX 3
        intact — do **not** add `tabIndex` to satisfy any lint finding here, see C2a-7 contingency);
      - `MesCelda` gains the module-private `esSeleccionado` prop plumbing already computed in Slice B.
      Verify: `N-03`..`N-09` all pass; `crearWrapper` migration (C2a-2) compiles and passes.
- [x] **C2a-5.** Sweep — module-private signature changes (design §9): confirm `renderEstado` and `MesCelda`'s
      `esSeleccionado` prop each have exactly 1 caller (contained, no external impact); confirm `crearWrapper`
      has zero remaining references outside this file.
      Verify: `rg "crearWrapper" apps/web/src`
- [x] **C2a-6.** **Re-run, unchanged.** Re-run the full `ResumenAnual.test.tsx` suite and confirm every
      pre-restructure assertion recorded in C2a-1 is still green, byte-identical, against the new DOM — this
      is R-1's actual closure, not aspirational. Any of them going red is the exact regression R-1 predicted;
      stop and fix the restructure, do not adjust the assertion.
      Verify: `pnpm web test -- ResumenAnual` full file green, 25/25 tests (§6.8 ledger 24 + the WTA-02 same-cell coexistence test added post-judgment in PR2, un-ledgered).
- [x] **C2a-7.** `eslint.config.js` — add the scoped `error` block from design §7 exactly as specified
      (`ResumenAnual.tsx`, `MiniSemaforoTag.tsx` — listed before/after authoring is irrelevant now, both
      exist), `extends: [jsxA11y.flatConfigs.recommended]`. Run lint. **Pre-decided contingency (do not
      improvise):** if `jsx-a11y/interactive-supports-focus` fires on the disabled `<div role="button"
      aria-disabled="true">` (no handlers, no `tabIndex`), do **not** add `tabIndex` (would re-break CA-04).
      Add a line-scoped `// eslint-disable-next-line jsx-a11y/interactive-supports-focus` with a comment
      citing FIX 3, and record it in the PR description. Any other new `error` in these two files is a real
      finding — fix it, do not disable it.
      Verify: `pnpm web exec eslint . ` — baseline warning count (2) unchanged, zero new errors (or exactly
      the one documented, justified disable).
- [x] **C2a-8.** `pnpm web test && pnpm web typecheck && pnpm web exec eslint .` all green.
- [x] **C2a-9.** Commit(s) (work-unit — may be 2: harness migration, then restructure+tests, if that reads
      better as a story): `test(web): migrate ResumenAnual.test.tsx to renderConRouter` +
      `feat(web): restructure MesCelda into sibling month/semáforo controls (CA-05)`.

**PR4 boundary:** ends here. Files: `ResumenAnual.tsx`, `ResumenAnual.test.tsx`, `eslint.config.js`. No e2e
yet — the restructured DOM ships fully wired (button + tag both render), so `main` is never in a
half-rendered state.

---

## Slice C2b — e2e coverage (WTA-05 Playwright scenario, CA-02/CA-03/CA-05 at real viewport) — PR5

Depends on PR4 merged (asserts the real, already-shipped restructured DOM at real viewports). Design §8
counts this inside Slice C but it is sequenced last here because Playwright specs are the one piece that
requires the restructure already live to be meaningful — splitting it out does not change what ships, only
review order.

- [ ] **C2b-1.** Edit `apps/web/e2e/fixtures/api-stubs.ts` (2 edits, design §6.4 — both pre-verified safe for
      `dashboard-donut.e2e.ts`, which asserts nothing about the annual grid):
      1. `**/api/resumen*` echoes the requested `?periodo=` into the returned DTO's `periodo` field, falling
         back to `2026-07` when absent.
      2. `RESUMEN_ANUAL_FIXTURE`: months `2026-08`…`2026-12` become `sinIngreso: true`, zeroed buckets,
         `estadoGlobal: null`.
      Verify: `pnpm --filter @moneydiary/web exec playwright test dashboard-donut` still fully green (zero
      diff to that spec's own assertions, per D-15).
- [ ] **C2b-2.** Create `apps/web/e2e/annual-grid.e2e.ts` (new file, design §6.4) with the 4 tests, real
      viewport/rendered-geometry only, never className:
      - `E-01` (`movil`, 360px): all 12 `getByRole('link', {name: /^Semáforo de /})` have `boundingBox()`
        width ≥24 **and** height ≥24 (D-3's WCAG 2.5.8 floor, in effect, for all 12 — the `WCTG-14`
        anti-pattern this design names explicitly)
      - `E-02` (`escritorio`): window sentinel set, click `Ver enero 2026` → URL matches `periodo=2026-01`,
        sentinel survives (no reload), `mes-seleccionado-marker` now inside ENE's control (CA-03 end-to-end)
      - `E-03` (`escritorio`): click link named `/^Semáforo de marzo 2026:/` → URL matches
        `/semaforo?periodo=2026-03`, stub's `Semáforo` heading renders (CA-05 end-to-end)
      - `E-04` (`movil`): exactly one `mes-seleccionado-marker` exists, `boundingBox()` ≥64×64 (CA-02's
        "larger mint circle" as a real box, at the tightest tier)
      Deliberately absent: any assertion on the `✓`/today marker (calendar-date-dependent — covered in jsdom
      by `N-02` instead, per design's explicit note).
- [ ] **C2b-3.** Confirm `dashboard-donut.e2e.ts` and `tablet-grid.e2e.ts` remain **zero diff** (D-15) —
      `git diff` on both files must be empty.
      Verify: `git diff --stat apps/web/e2e/dashboard-donut.e2e.ts apps/web/e2e/tablet-grid.e2e.ts` → empty.
- [ ] **C2b-4.** `pnpm --filter @moneydiary/web exec playwright test annual-grid` green (4/4), plus a full
      `pnpm --filter @moneydiary/web exec playwright test` run to confirm no collateral regression elsewhere.
- [ ] **C2b-5.** Commit: `test(web): add annual-grid e2e coverage for CA-02/CA-03/CA-05 at real viewports`.

**PR5 boundary:** ends here. Files: `e2e/annual-grid.e2e.ts` (new), `e2e/fixtures/api-stubs.ts`.

---

## Cross-cutting — run once, after PR4 merges (D-16 registered debt + final sweep)

- [ ] **X1.** File 2 GitHub issues for the registered debt created by this change (design D-16, YAGNI rule 3
      — "deuda consciente" pattern), each with its stated trigger:
      1. **`SemaforoBadge.tsx` is now a dead component** (zero production call sites after C2a merges,
         verified by `rg` — only `ResumenAnual.tsx:132` used it, now removed). Trigger: US-049 either adopts
         it on `/semaforo`, or a cleanup change removes component + test together.
      2. **`calcularDistribucionGasto`'s `bucketsIncluidos` param is now default-only in production**
         (`resumen-view-model.ts:236` never overrides it; `DistribucionPie.tsx`'s `BUCKETS_5030` import is a
         different code path). Trigger: a cleanup change that retires the param **and**
         `distribucion-gasto.test.ts:184`'s judgment-day-locked renormalization pin together — explicitly
         **not** this change's job, that test is locked.
      Link both issues from the PR description of whichever PR lands last (C2a or C2b).
- [ ] **X2.** Full impact-sweep confirmation (design §9 table, re-verified against the real diff once all 5
      PRs have merged): `apps/api`, `packages/api-client`, `apps/mobile` show **zero** diff; `SemaforoTag.tsx`,
      `SemaforoBadge.tsx`, `MiniDistribucionPie.tsx`, `DistribucionPie.tsx`, `distribucion-gasto.ts`,
      `bucket-colors.ts` show **zero** diff.
      Verify: `git diff --stat main -- apps/api packages/api-client apps/mobile` → empty; `git diff --stat
      main -- apps/web/src/components/SemaforoTag.tsx apps/web/src/components/SemaforoBadge.tsx
      apps/web/src/components/MiniDistribucionPie.tsx apps/web/src/components/DistribucionPie.tsx
      apps/web/src/domain/distribucion-gasto.ts apps/web/src/lib/bucket-colors.ts` → empty.
- [ ] **X3.** Success-criteria checklist from `proposal.md` — walk CA-01..CA-06 one by one against the merged
      state and check each box in the proposal's own Success Criteria list (not re-copied here — it is the
      source of record).
- [ ] **X4.** Ledger reconciliation: confirm final test counts match design §6.8 exactly — `34` existing baseline,
      `16` touched, `23` new, `57` final, split as `MiniSemaforoTag.test.tsx` 8, `ResumenAnual.test.tsx` 24,
      `ResumenScreen.test.tsx` 16, `ResumenPage.test.tsx` 5, `annual-grid.e2e.ts` 4.
      Verify: `pnpm web test -- --reporter=verbose 2>&1 | rg -c "✓|passed"` sanity count, or count `it(`/`test(`
      occurrences per file.

---

## Review Workload Forecast

**Estimated changed lines by PR** (additions + deletions, rough order-of-magnitude from the design's own
diffs and test-ledger sizing):

| PR | Slice | Content | Est. lines | 400-line risk |
|---|---|---|---|---|
| PR1 | A | 4-wedge minis (1-arg deletion + inverted pin) | ~40–60 | None |
| PR2 | B | Selected marker + caption + header copy + prop threading, 4 new tests + 5 copy edits + 14-site prop sweep | ~280–360 | Low-Medium |
| PR3 | C1 | `MiniSemaforoTag` + 8 new tests, unwired | ~230–280 | Low |
| PR4 | C2a | `MesCelda` restructure + router migration + 6 new tests + eslint block | ~320–400 | **Medium-High** |
| PR5 | C2b | New e2e file (4 tests) + 2 fixture edits | ~150–190 | Low |
| **Total** | | | **~1020–1290** | |

**Chained PRs recommended: Yes.** A single PR would be ~1000–1300 lines against a 400-line budget — not
close.

**400-line budget risk: High** for the change as a whole; **PR4 individually carries the highest per-PR risk**
(restructure + full-file router migration + 6 new behavioral tests land together by design necessity — R-1's
mitigation requires the restructure and its regression re-verification to be one atomic unit, so it cannot be
split further without reintroducing the exact silent-regression risk R-1 names). If PR4 measures over 400
lines once diffed for real, treat it as a `size:exception` candidate rather than force a split that would
separate the restructure from its own regression proof.

**Decision needed before apply: Yes** — confirm the PR1→PR2→PR3→PR4→PR5 stacked-to-main order below before
`sdd-apply` starts, per `delivery_strategy: ask-on-risk` and `chain_strategy: stacked-to-main` already
selected for this session.

**Why this boundary avoids "half-rendered on main" (the stacked-tip lesson, explicitly asked for):**

- PR1 changes only ring composition (4 vs 3 wedges) — a self-contained visual change, nothing structural.
- PR2 adds the selected-marker + caption + copy to the **existing, unrestructured** `MesCelda` — the page is
  fully coherent after PR2 merges: a user sees the new marker and caption, the semáforo is still the old
  static badge. No nesting/AX issue is introduced or removed mid-way.
- PR3 adds `MiniSemaforoTag` as a **file nobody imports** — zero visual or behavioral change to any rendered
  page. This is the safe way to shrink PR4 without creating a half-wired state: the component exists and is
  fully tested, but the page is byte-identical to pre-PR3 until PR4 wires it in.
- PR4 performs the restructure **and** wires `MiniSemaforoTag` in **and** re-verifies every CA-03/CA-04
  regression pin **in the same PR** — this is the one unit that must land atomically, because a restructure
  without its tag (or a tag without the sibling restructure) is precisely the invalid-HTML/broken-AX-tree
  state CA-05 exists to prevent. This mirrors the user's own "restructure+marker+tag land together" framing:
  here it is "restructure+tag land together" (marker landed safely earlier in PR2, since it never touched
  `MesCelda`'s interactive-element shape).
- PR5 (e2e) only *observes* the state PR4 already shipped at real viewports — it cannot itself create a
  half-rendered state because it changes no production code.

**Dependency order (stacked-to-main):** PR1 → PR2 → PR3 → PR4 → PR5, each merges to `main` before the next
opens (PR3 could in principle open in parallel with PR2 since both depend only on PR1, but is sequenced after
PR2 here to keep review order matching the design's own §8 A→B→C narrative — no technical dependency forces
this, call it out to the reviewer if parallelizing is preferred).
