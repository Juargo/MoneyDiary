# Archive Report — US-063: Web Configuración, mobile viewport variants (M2/M3)

- **Change**: `us-063-web-mobile-configuracion` · **Issue**: [#332](https://github.com/Juargo/MoneyDiary/issues/332)
- **Archived**: 2026-08-15
- **Status**: **SHIPPED to production** — merged to `main` as `82b3273` (PR [#344](https://github.com/Juargo/MoneyDiary/pull/344), #348, #346, #347, #349); `app.moneydiary.cl/version.json` confirmed serving `commit: 82b3273, builtAt: 2026-08-15T04:02:07Z`.
- **Verification verdict**: `sdd-verify` → **PASS, zero CRITICAL** — zero executable `test.fail()` anywhere in the suite.
- **Tasks**: 29 of 29 done.

## What shipped

The **mobile restructure of `/configuracion` (Categorías section)**: horizontal tabs, single row action icon, back-icon header replacing the h1/breadcrumb, stacked identity fields, inverted footer, and shortened labels at 360–767px, built entirely with Playwright harness acceptance coverage and zero files in `apps/api/**` or `apps/mobile/**`.

Delivered as 5 chained PRs (`feature-branch-chain`; only the tracker merged to `main`):

| PR | Slice |
|---|---|
| [#344](https://github.com/Juargo/MoneyDiary/pull/344) | Playwright harness: `@playwright/test`, `playwright.config.ts`, CI job, `test.fail()`-committed `WCTG-14` defect |
| [#348](https://github.com/Juargo/MoneyDiary/pull/348) | Tier + shared chrome: `md` grid repair, tabs, back control, `estilos.ts` move |
| [#346](https://github.com/Juargo/MoneyDiary/pull/346) | Labels + list surface: `EtiquetaResponsiva` helper, five call sites, responsive text |
| [#347](https://github.com/Juargo/MoneyDiary/pull/347) | Edit surface: footer reorder, `WCTM-05` gap fix (640–767px), SC 2.5.8 repair |
| [#349](https://github.com/Juargo/MoneyDiary/pull/349) | Tracker PR (feature-branch-chain strategy): merges to `main` |

> **Why #348 and not #345.** PR #2 was originally [#345](https://github.com/Juargo/MoneyDiary/pull/345).
> Merging #344 with `--delete-branch` removed `feat/us-063-pr1-harness`, and GitHub **auto-closed
> #345** because that was its base. A closed PR whose base branch no longer exists **cannot be
> reopened**. No code was lost — the head branch survived with all seven commits — so the work
> continued as #348 from the identical head. The review that happened on #345 stands.
>
> **Operational lesson for the next chain**: retarget every downstream PR to the tracker **before**
> deleting any merged branch, or simply merge without `--delete-branch` and delete at the end.
> Deletion is the only irreversible half of the operation. (Related, from US-043: a `git worktree`
> holding a branch makes `--delete-branch` fail, leaving the remote branch alive and the next PR
> un-retargeted — remove worktrees before merging.)

## Specs merged into the live capabilities

- `openspec/specs/web-app/spec.md` — **6 ADDED** (`WCTM-01..06`) and **3 MODIFIED** (`WCTG-13`, `WCTG-14`, `WCFG-11`).
  - WCTM-01: the `md` (768px) tier scoped to Configuración
  - WCTM-02: mobile list chrome (horizontal tabs, full-width Nueva categoría)
  - WCTM-03: single action control per row, mobile footer note
  - WCTM-04: back control + section title on list and edit screens
  - WCTM-05: stacked fields full mobile range + inverted footer
  - WCTM-06: five strings resolve per tier, non-monotonic Nueva categoría
  - WCTG-13 (scope clause repaired): "this change IS US-063" — the three floors survive as **minimums** every viewport below `md` must clear, and M2/M3 is now defined in `WCTM-*`
  - WCTG-14 (repaired): boundary moved from `lg` (1024) to `md` (768); 880 ≥ 768 now holds
  - WCFG-11 (boundary moved + pixel claim demoted to kind-level): reword to kind-level layout claim

## The load-bearing guarantees

**Acceptance layer verified end-to-end.** `WCTG-14` shipped false because jsdom cannot compute layout. This change's **harness lands first** (PR #344) with the assertion committed as `test.fail()` before the repair (PR #348), closing the epistemic gap. Five criteria, five `E-*` assertions (`E-01..09`, plus `E-10`/`E-11` closing US-043 debt 1), all **rendered-geometry assertions**, never class-literal presence.

**No horizontal overflow at 360px + stacked fields + ≥24×24 targets** — the three `WCTG-13` floors — **still guaranteed**; they are now a MINIMUM every viewport below `md` must clear.

**Desktop tab order differs from footer visual order — deliberately.** D-10's choice: the mobile stack gets the natural reading order (`Guardar` first, `Cancelar`, `Eliminar` last); the desktop row reverses `Guardar`/`Cancelar` to preserve the shipped visual appearance. The alternative was a vertical reversal on mobile — which SC 1.4.10 puts in front of keyboard users at 400% zoom. All three controls remain visible in one row with visible focus rings and disambiguated accessible names.

**Zero files under `apps/api/**` or `apps/mobile/**`** — verified on every one of the five slices (non-negotiable).

## Final gate state

- `pnpm web typecheck` clean (tsconfig.e2e.json now covers e2e/ and playwright.config.ts)
- `pnpm web test` **100 files / 1005 tests** — all green
- `pnpm web lint` 0 errors (2 pre-existing warnings on untouched lines)
- `pnpm web test:e2e` **45 passed / 21 skipped** — all Playwright assertions (`E-01..12`) passing, no `test.fail()` remaining

## Open debts from US-043, now resolved

**Closed by this change:**

1. **`WCTG-13`/`WCTG-14` manual 360px/880px pass** — **now executable and passing**. `E-07`/`E-10`/`E-11` cover geometry that jsdom cannot assert.
2. **`WCTG-14` false as shipped** — **repaired and asserted**. The 880px grid now renders two tracks, verified with `E-02`.
3. **A WCAG 2.2 AA SC 2.5.8 violation US-043 shipped, that nobody knew existed.** `EditarCategoria`'s error and not-found states rendered `Volver a Categorías` as a standalone `<Link>`, sibling of a `<p>`, alone on its line — measured in a real browser at `{ width: 147.8, height: 20 }` against the 24×24 floor. SC 2.5.8's *Inline* exception does not apply: there is no surrounding non-target text constraining it. **Found by the harness during judgment-day on #344**, i.e. by the very instrument this change existed to build — it was invisible before because `WCTG-13`'s manual pass was skipped and jsdom cannot measure geometry.

   Fixed in #347 by giving both links the `Cancelar` footer pattern so the control clears the floor **on its own geometry**. A round-1 fix had instead exempted it from the harness by exact text match; **that was reverted**, because exempting it would have made the change's only acceptance layer assert a compliance that does not exist. `mobile-floor.e2e.ts` exempts the breadcrumb only, structurally via `closest()`, never by text — the breadcrumb genuinely qualifies for the *Inline* exception (links separated by literal "/" within a path).

**Still open (not touched here):**

4. Production smoke of the bucket-change confirmation on a category with transactions — **unchanged status**, left open from US-043.
5. Focus loss on `BucketDetailList`'s catalog `Reintentar` — **unchanged status**, left open from US-043.

US-063 itself leaves no new debt.

## What this change cost, and what it taught

Every PR went through two blind adversarial judges. **Zero CRITICAL across the whole chain.**

**The finding that matters most is what KIND of finding they all were.** Not one was a product bug. Every single real finding was **false coverage** — a test that was green while proving less than its name claimed:

| Where | The defect | Why it survived |
|---|---|---|
| #344 | `mobile-floor.e2e.ts`'s control sweep waited for any control to be *visible*, and `BotonVolver` (`md:hidden`) is legitimately never visible at tablet/desktop | the wait resolved on layout chrome before the panel's rows mounted; injecting 30–50ms of stub latency collapsed the captured set from 8 controls to 3, making `toBeGreaterThan(0)` pass **vacuously** |
| #346 | Task 21 was checked off `[x] RED, GREEN` naming `PatronesSection.tsx (+ test)` — the test file had a **zero-line diff** | proven by mutation: removing the `<h2>`'s `aria-label`, the exact mechanism D-04 protects, left all 10 existing tests green |
| #346 | Index-based assertions reused for `Patrones`/`Agregar`, which are genuinely distinct strings | the technique is only forced for `Nueva categoría` (identical mobile/desktop text); elsewhere it proved DOM position, never content — those two strings had no test in any layer verifying what they rendered |
| #346 | `toHaveTextContent` matches by **substring** when given a string literal | collapsing the non-monotonic band (`tablet="Nueva"` → `"Nueva categoría"`, the mapping `WCTM-06` forbids) left **all 24 tests green**, because the superstring contains the expected string. A repo sweep found the same trap in `EtiquetaResponsiva`'s own contract test, for both `Nueva` and `Agregar` — each band compared against a **prefix of its own long variant** |
| #347 | `E-08`'s docblock claimed it proved the desktop footer order "byte-for-byte"; it asserted only relationships **inside the inner wrapper** and never queried `Eliminar categoría` | removing `md:flex-row-reverse` from the **outer** `<footer>` makes it stack vertically at desktop, dropping `Eliminar` out of the row — and `E-08` still passed. Both judges reached this independently, one by mutating the container, the other while examining `self-start` on the button |

Every fix was verified by mutation: revert the source, confirm red, restore, confirm green. The `E-08` repair, for instance, turns the outer-container regression into `Expected: <= 2, Received: 49`.

**This is the durable lesson.** D-08 chose CSS-only, which makes Playwright the change's *only* acceptance layer — so a Playwright assertion that proves less than it claims is indistinguishable, from the outside, from having no coverage at all. `WCTG-14` shipped false through six layers of review for exactly this reason. The risk in a change like this is not code that fails loudly; it is **green that does not mean what it says**.

**Methodology note, recorded because it nearly corrupted a review round.** Both judges were initially pointed at the *same* worktree and both told to mutation-test. One noticed diffs in files it had never touched, inferred a concurrent writer, restored the tree and moved to an isolated checkout. Later, `tasks.md` was edited mid-review while a judge was reading it as authority. Both failures are **silent** — nothing errors, the reports simply describe a state that never existed. **Rule for next time: freeze everything a reviewer reads as authority — the tree and the contract documents — for the duration of the review, and give each mutating agent its own checkout.**

## Acceptance criteria versus shipped behaviour (deliberate extension)

`NuevaCategoriaForm.tsx:69` carried the same `sm:grid-cols-[1fr_220px]` as `EditarCategoria` but task 25 moved only the edit screen's grid to `md:`. Between 640–767px, this would have shipped the edit screen stacking while the create form did not — **a divergence this change itself introduced by fixing one of two identical grids**. `WCTM-05` names only `EditarCategoria`; spec wins over design (D-08), so this is **not** "the spec required it". **Maintainer decision (2026-08-14) to not ship a self-inflicted inconsistency.** Recorded so a future reader who checks `WCTM-05` and finds no mention knows the code is deliberate.

Also corrected while implementing: `design.md` §1.5's claim that moving the grid to `md:` "would break `WCTG-14`'s second scenario (side-by-side at 880)" is arithmetically false — `880 ≥ 768` holds regardless of boundary. Re-derived independently and confirmed during implementation, per this change's post-US-043 lesson: never trust the arithmetic in a layer that has already failed it once.

## Acceptance test harness: Playwright CI job wiring

**D-B resolved.** Task 9 of PR #344 records: ⚠️ **"Adding a required status check is a repository-admin action (branch protection on `main`, ADR-030 C.7). It cannot be done from a PR."**

**Resolution verified 2026-08-14**: `web-e2e` is **already enforced, transitively**. The job is in `ci-success`'s `needs` list, and `CI success` is already a required check on `main` with `enforce_admins: true`. A Playwright failure makes `ci-success` exit 1, blocking the merge.

**Do NOT add `E2E (Playwright, web)` as a direct required check.** The job is path-filtered (`if: web == 'true' || packages || shared`), so on an api/mobile/landing-only PR it never runs. GitHub leaves a directly-required check that never reports permanently *pending*, blocking every non-web PR with no way out. The `ci-success` aggregator exists precisely to absorb skips — its `case` treats `skipped` as success. This is already verified and working end-to-end.

## How this fix moves the state

Before US-063, the Configuración section at 360px shipped the desktop structure squeezed into a narrow phone: vertical tabs, two icons per row, breadcrumb navigation. The `WCTG-13` defensive floor guaranteed no horizontal overflow and a 24×24 tap target, but left the whole M2/M3 redesign to future work (US-063, this change).

The spec itself reflected this: `WCTG-13` carved M2/M3 out of scope and assigned it to US-063. `WCTG-14` and `WCFG-11` claimed the tablet layout worked at 880px, but that was false — the grid activated at `lg` (1024), so 880 fell back to the stacked mobile layout. Nobody ran the arithmetic.

US-063 closes it: the new `md` tier (768px) makes 880 ≥ 768 true, the grid now renders side-by-side correctly, and all three requirements are no longer self-contradictory. The harness proves all five criteria end-to-end. The change ships with zero outstanding defects, pending only the two inherited debts from US-043 (bucket-confirmation smoke test, focus loss on retry) that remain outside scope.

## Final verdict

**Change is complete, verified, and deployed.** Six new requirements added, three existing requirements repaired for internal consistency. Zero CRITICAL findings. All 29 tasks complete, all gates green, all Playwright assertions passing.

**"Deployed" here does mean verified** — unlike US-043's archive, which had to open by warning that it was not. `app.moneydiary.cl/version.json` serves `commit: 82b3273`, matching `main`, built `2026-08-15T04:02:07Z`. The two debts listed above are inherited from US-043 and were never in this change's scope; US-063 adds none of its own.

One correction was made to the frozen spec before archiving, recorded rather than applied silently: `WCTM-06`'s heading claimed **six** strings over a **five**-row table. The sixth responsive string on that surface is CA-02's list footer note, which `WCTM-03` governs. The table was right and the count was wrong; it was corrected so the miscount would not reach the canonical spec, where nobody could later tell whether a row was missing or a word was wrong.
