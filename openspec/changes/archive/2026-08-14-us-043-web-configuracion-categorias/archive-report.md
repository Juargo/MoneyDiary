# Archive Report — US-043: Web Configuración, Categorías section

- **Change**: `us-043-web-configuracion-categorias` · **Issue**: [#277](https://github.com/Juargo/MoneyDiary/issues/277)
- **Archived**: 2026-08-14
- **Status**: **SHIPPED to production** — merged to `main` as `dade5b7` (PR [#342](https://github.com/Juargo/MoneyDiary/pull/342)); `app.moneydiary.cl/version.json` confirmed serving `dade5b7`.
- **Verification verdict**: `sdd-verify` → **PASS WITH WARNINGS** — 0 CRITICAL, 3 WARNING, 2 SUGGESTION.
- **Tasks**: 52 of 53 done. Task 46 deliberately open (see Debts).

> ⚠️ **This change shipped with three open items.** "Deployed" is not "fully verified" — see [Open debts](#open-debts). Do not read this report as a clean close.

## What shipped

The **Categorías section of `/configuracion`**: a per-user catalog CRUD (categories + classification patterns) built entirely against the already-deployed catalog API, plus the repair of the dashboard's reclassify control.

**Zero files under `apps/api/**` or `apps/mobile/**`** — verified on every one of the nine slices (non-negotiable #8). 83 files, +11 395 / −761.

Delivered as 9 chained PRs (`feature-branch-chain`; only the tracker merged to `main`):

| PR | Slice |
|---|---|
| [#333](https://github.com/Juargo/MoneyDiary/pull/333) | Shell: routes, layout, directory split |
| [#334](https://github.com/Juargo/MoneyDiary/pull/334) | Data layer — the wire: DTOs, constants, drift guard, 7 calls |
| [#335](https://github.com/Juargo/MoneyDiary/pull/335) | Data layer — cache + copy: query hook, both invalidation profiles, 12-code message table |
| [#336](https://github.com/Juargo/MoneyDiary/pull/336) | CA-01 read-only list |
| [#337](https://github.com/Juargo/MoneyDiary/pull/337) | Create flow |
| [#338](https://github.com/Juargo/MoneyDiary/pull/338) | Identity edit + bucket-change confirmation + delete from edit |
| [#339](https://github.com/Juargo/MoneyDiary/pull/339) | Patterns CRUD (profile A) |
| [#340](https://github.com/Juargo/MoneyDiary/pull/340) | Second delete entry point + tablet grid |
| [#341](https://github.com/Juargo/MoneyDiary/pull/341) | Reclassify repair (`WCAT-02`/`WCAT-04` deltas) |

## Specs merged into the live capabilities

- `openspec/specs/web-app/spec.md` — **14 ADDED** (`WCTG-01..14`) and **6 MODIFIED** (`WCFG-01`, `WCFG-02`, `WCFG-11`, `WCFG-12`, `WCAT-02`, `WCAT-04`). Every MODIFIED requirement carries its scenarios verbatim — scenario counts verified to match the delta exactly (3/5/3/3/4/7).
- `openspec/specs/catalogo-clasificacion-ownership/spec.md` — Non-Goals housekeeping (mobile catalog UI stays deferred).

## The load-bearing guarantees

**Non-negotiable #3 — the money guarantee.** `PATCH /api/categorias/:id` with a changed bucket makes the backend re-stamp `bucketId` on **every** transaction referencing that category, across **all** periods: moving `Supermercado` from Necesidades to Gustos retroactively rewrites the 50/30/20 split of every closed month. The bucket-change confirmation and the `PATCH` that triggers it ship in the same task and the same PR (#338), never split. This is why #338 was deliberately allowed to run oversized.

**Non-negotiable #4 — the invalidation matrix.** Category mutations use profile B (`['categorias']`, `['resumen']`, `['resumen-anual']`, `['detalle-bucket']`); pattern mutations use profile A (`['categorias']` only). The **exclusion** is pinned by its own dedicated, independently-failing assertions at both function and hook level, with exact array equality — a third key fails them.

**Non-negotiable #8** — zero API/mobile diff, re-verified as the last task of every slice.

## Final gate state

`pnpm web typecheck` clean · `pnpm web test` **980 tests / 98 files** green · `pnpm web lint` 0 errors (2 warnings on pre-existing untouched lines).

The file count is **98** because this change deletes two test files (`categoria.test.ts`, `categoria.mirror.spec.ts`, retiring `domain/categoria.ts` per ADR-036/037).

## Open debts

**These are open. Do not close them by omission.**

### 1. `WCTG-13` is NOT satisfied · `WCTG-14` is partial

Task 46 — the recorded manual 360px/880px browser verification pass — was **skipped by maintainer decision on 2026-08-14**. It is left unchecked in `tasks.md` with its full checklist intact.

jsdom performs no layout, so neither the ≥24×24 tap target (WCAG 2.2 AA SC 2.5.8) nor "no horizontal overflow at 360px" is machine-assertable. The automated layers prove only that the *code* was not shrunk — never the *rendered geometry*. `sdd-verify` independently confirmed none of `WCTG-13`'s three scenarios has runtime coverage.

Two checklist items came out of review and can only be checked on real hardware:
- A long category name must truncate with an ellipsis on the **same line** as its tag and both icon buttons. `CategoriaFila`'s row is `flex flex-wrap` and the name is `min-w-0 flex-1 truncate`; `truncate` implies `white-space: nowrap`, so per CSS Flexbox §9.3 the line-breaking pass sizes that item from its **max-content** width *before* shrinking resolves — a long enough name can wrap the row instead of ellipsing.
- On a **touch device**, tapping `PatronFila`'s delete button: browsers commonly dispatch the synthetic `mousedown`/`click` pair *after* the touch-driven focus change, which could defeat the pointer-intent mechanism built in #339.

**To close**: run the checklist and record the result (pass/fail per line, dated, browser named), or adopt Playwright for real-geometry assertions.

### 2. Functional smoke test in production — PENDING

The maintainer could not use a browser at archive time. Specifically unverified against production data: **the bucket-change impact confirmation on a category that has transactions** — the one operation in this change that rewrites already-closed months.

### 3. Focus loss on catalog retry

Activating `BucketDetailList`'s catalog `Reintentar` unmounts the focused button — TanStack resets `error` to `null` in the same dispatch that starts the fetch, and the alert block is gated on that error — so focus drops to `<body>` with nothing restoring it. Same pattern already fixed for `CategoriasPanel` in #340; group with the remaining a11y follow-up.

### Accepted deviation (not a debt)

`useCategorias()` in `BucketDetailList` sits above the transactions early returns, so the catalog is prefetched even while transactions load, fail, or are empty. **Deliberate**: gating it would delay the catalog until transactions resolve, slowing the common path to save one GET on a shared key. Documented in the component and pinned by a test.

## What this change cost, and what it taught

Judgment-day ran **13 rounds** across the chain (#338: 4, #339: 5, #340: 3, #341: 4).

**Thirteen assertions were caught pinning broken behaviour or passing for the wrong reason** — several of them introduced *by* the fix rounds, not by the original implementation. Two were proven vacuous empirically: a judge reverted the component and the tests still passed.

**Two CRITICALs traced back to `tasks.md`/`design.md` — the layers derived from the frozen spec — not to the code.**

1. Task 28 required "the dialog does not close on failure" while task 31 prescribed a guard that unmounts it. Mutually exclusive; each impeccable read alone. The apply agent implemented the plan faithfully and shipped a delete whose failure the user never saw.
2. `blur-or-Enter` as the pattern-row commit trigger was invented in the derived layer. The frozen spec only ever said "the moment each row action is **confirmed**". Reading that sentence turned an assumed spec amendment into a two-line documentation correction — after three fix rounds had been spent patching a trigger that cannot express intent.

Both corrected in the archived `tasks.md` and `design.md`.

**The transferable rules**, all persisted to Engram:
- When a task prescribes a concrete mechanism, check the frozen spec's own wording before treating it as binding.
- Cross-check the task list against itself; two tasks requiring incompatible things is a real failure mode no per-task review catches.
- `vi.fn().mockResolvedValue(...)` is already-resolved and hides every mid-flight render; a failure mock's *shape* decides which branch runs.
- Fix rounds need the same scrutiny as the code they fix.
- Focus management is required wherever activating a control can remove it from the DOM.
- Catalog-scoped fetch-lifecycle UI must not live in a row-scoped component; the tell is a shared query key.

## Follow-up work (separate changes, not blockers)

- **US-063 (#332)** — the M2/M3 mobile-viewport redesign. US-043 shipped only the 360px defensive floor.
- The three debts above.
