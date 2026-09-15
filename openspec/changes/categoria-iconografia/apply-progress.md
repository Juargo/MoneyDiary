# Apply Progress: categoria-iconografia

## Scope of PR1 batch (complete)

Phase 1 (PR1) — tasks 1.1 through 1.9. Task 1.10 (apply migration to prod) is a human-gated step,
out of scope for automated apply, and remains unchecked.

## Scope of PR2 batch (this update) — PARTIAL, stopped on budget

Assigned: Phase 2 (PR2) tasks 2.1–2.11. Completed: 2.1–2.6 (use cases + port + repo icono
validation/persistence on create/update). NOT started: 2.7–2.11 (detalle grouping port/service/repo,
catalogo-isolation int-spec extension) — stopped per the batch's explicit budget instruction
("if it would exceed 400, stop and report rather than trimming tests") BEFORE starting them, because
`git diff --shortstat feat/categoria-iconografia-pr1...HEAD` was already 396 insertions(+) 9
deletions(-) = **405 changed lines** after only 2.1–2.6 — already over the 400-line ceiling, with
2.7–2.11 (a new port field, a service change, a repo change, and a full int-spec extension) still
unimplemented. Continuing would only add to the overage.

Root cause of the overage vs the 300–350 forecast: `CategoriaConPatrones` gaining a REQUIRED `icono`
field (per design.md's own File Changes table) forced tsc fixes across files outside PR2's originally
assigned surface — most notably `catalogo-http-error.ts`'s exhaustive `const _exhaustive: never =
error` guard, which does not compile once `IconoCategoriaInvalidoError` joins the `CrearCategoriaError
| ActualizarCategoriaError` union. That guard forced task 3a.5 (originally scoped to PR3a) forward
into this batch (~20 lines incl. its spec), plus ~10 lines of one-line `icono: null` fixture fixes
across `commit-ingesta.use-case.spec.ts`, `registrar-movimiento-manual.use-case.spec.ts`,
`categorias.schema.spec.ts`, `catalogo.dto.spec.ts`, `catalogo.dto.spec.ts`, and `categoria.dto.spec.ts`
— none of which thread `icono` through the HTTP contract (that stays PR3a's job); they only keep the
type-checker's exhaustiveness/structural checks green given PR2's domain/application change. Task
3a.5 is now marked `[x]` in `tasks.md` with a note — PR3a's apply batch should verify-only there, not
re-implement.

### Completed Tasks (PR2, this batch)

- [x] 2.1 RED: `crear-categoria.use-case.spec.ts` — invalid icono → `ICONO_INVALIDO`, no write;
  omitted/explicit-null → `null` (CATICO-02)
- [x] 2.2 GREEN: `crear-categoria.use-case.ts` + `categoria-repository.port.ts`
  (`crearConPatrones.data.icono: string | null`, required)
- [x] 2.3 RED: `actualizar-categoria.use-case.spec.ts` — set/clear/leave-unchanged/invalid-unchanged,
  validation order icono BEFORE uniqueness (CATICO-03)
- [x] 2.4 GREEN: `actualizar-categoria.use-case.ts` (`patch.icono?: string | null`, tri-state)
- [x] 2.5 RED: `prisma-categoria.repository.spec.ts` — maps icono on read, writes it on
  create/update (SET/CLEAR/omit-leaves-key-absent)
- [x] 2.6 GREEN: `prisma-categoria.repository.ts` — `CategoriaRow.icono`, `aCategoriaConPatrones`,
  `crearConPatrones` writes `icono`, `actualizar` writes `icono` iff `patch.icono !== undefined`
- [x] 3a.5 (pulled forward, unplanned) — `catalogo-http-error.ts` maps
  `IconoCategoriaInvalidoError` → 400 `ICONO_INVALIDO`, plus its `catalogo-http-error.spec.ts` case

### Remaining (NOT started — next PR2 batch)

- [ ] 2.7 RED: `agrupar-detalle-por-categoria.spec.ts` — group `icono`, always `null` for Sin categoría
- [ ] 2.8 GREEN: `detalle-bucket.port.ts`, `agrupar-detalle-por-categoria.ts`
- [ ] 2.9 RED: `prisma-detalle-bucket.repository.spec.ts` — selects `icono`, maps inline next to
  `foldCategoria` (fold stays `{id,nombre}` for movimientos-mes)
- [ ] 2.10 GREEN: `prisma-detalle-bucket.repository.ts`
- [ ] 2.11 RED+GREEN: extend `apps/api/test/catalogo-isolation.int-spec.ts` — user B PATCHing A's
  `icono` → 404, A's row unchanged (CATICO-05, RNF-SEC-006). NOTE for the next batch: the actual file
  is `apps/api/test/catalogo-isolation.int-spec.ts`, NOT `test/integration/catalogo-isolation.int-spec.ts`
  as tasks.md 2.11 names it — there is no `test/integration/` directory in this repo (confirmed via
  `fd`); extend the existing describe blocks in the real path.
- [ ] 1.10 Apply migration to prod (human-gated, out of scope for automated apply)
- [ ] Phase 3a–3c (PR3): HTTP contract + regen, web/mobile contract foundation (3a.5 already done, see
  above)
- [ ] Phase 4–7 (PR4–PR7): web/mobile config + detalle UI

## Mode

Strict TDD (RED → GREEN → REFACTOR), verified per task via `pnpm exec vitest run <file>` before
moving to the next task.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1/1.2 | `domain/value-objects/icono-categoria.spec.ts` | Unit | N/A (new) | ✅ Written (`Cannot find module`) | ✅ 6/6 passed | ✅ 6 cases (size/format/allowlist-hit/lucide-real-but-excluded/arbitrary-string/non-string) | ➖ None needed (already minimal) |
| 1.3/1.4 | `domain/errors/icono-categoria-invalido.error.spec.ts` | Unit | N/A (new) | ✅ Written (`Cannot find module`) | ✅ 4/4 passed | ✅ 4 cases (name, rawValue-not-echoed x2, rawValue field for string/null/undefined) | ➖ None needed |
| 1.7 | `infrastructure/persistence/catalogo-template.spec.ts` | Unit | ✅ 12/12 (pre-existing, before edit) | ✅ Written (2 assertions failed: missing `icono` in template, `esIconoCategoria` false) | ✅ 14/14 passed | ✅ 3 new assertions (pinned template shape, allowlist membership, `copiarCatalogoTemplate` write-through) | ✅ Prettier reformat (multi-line object literal), re-verified green |
| 1.8 | `infrastructure/persistence/seed-catalog.spec.ts` | Unit | ✅ 8/8 (pre-existing, before edit) | ✅ Written (1 failed: `row.icono` undefined) | ✅ 10/10 passed | ✅ 2 new tests (create-only defaults + re-seed does not clobber a hand-edited icono) | ✅ Removed unnecessary non-null assertion (ESLint `no-unnecessary-type-assertion`), re-verified green |
| 1.5/1.6/1.9 | N/A — schema/migration/ADR are not TDD-cycle tasks | N/A | N/A | N/A | N/A (validated via full suite + `tsc --noEmit` + `prisma generate` against dummy CI env) | N/A | N/A |

### Test Summary

- **Total tests written**: 16 new test cases across 4 spec files (6 + 4 + 3 + 2 net-new; the
  remaining assertions in `catalogo-template.spec.ts`/`seed-catalog.spec.ts` were pre-existing
  and extended in place).
- **Total tests passing**: 2687/2687 (full `apps/api` suite, `pnpm exec vitest run`), 277/277
  files.
- **Layers used**: Unit only (domain VO, domain error, infra template/seed).
- **Approval tests** (refactoring): None — no refactoring tasks in this batch, only additive.
- **Pure functions created**: `esIconoCategoria` (pure predicate). `copiarCatalogoTemplate` and
  `runSeed` are existing impure I/O functions extended with one more field, not new pure logic.

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run` (apps/api): 277 test files passed, 2687 tests passed |
| Runtime harness command/scenario and exact result | `DATABASE_URL=postgresql://ci:ci@localhost:5432/ci DIRECT_URL=postgresql://ci:ci@localhost:5432/ci pnpm exec prisma generate` — regenerated Prisma Client v7.8.0 successfully with the new `icono` column, confirming the schema+migration pair is structurally consistent. No real DB was touched (task 1.10 explicitly out of scope). |
| Rollback boundary | Each of the 4 commits below is independently revertable: (1) domain VO+error — no consumers yet; (2) schema+migration — additive column, inert until read; (3) template+seed defaults — depends on (1); (4) ADR+docs — pure documentation. Reverting all 4 leaves the column present but unused, matching design.md's stated rollback ("API revert leaves the column inert"). |

## Verification (full commands run)

- `pnpm api test` → 277 test files passed, 2687 tests passed
- `pnpm api exec tsc --noEmit` → no errors
- `pnpm api lint:ci` → 0 errors, 3 pre-existing warnings in untouched files (`excel-bank-detector.service.ts`, `excel-structure-validator.service.ts`, `excel-transaction-normalizer.service.ts` — `no-unsafe-argument`, not introduced by this batch)

## Commits (feature-branch-chain, PR1 targets `feat/categoria-iconografia`)

1. `feat(api): add curated icon allowlist value object and domain error` (59ba2812)
2. `feat(api): add nullable Categoria.icono column` (9fc2174c)
3. `feat(api): seed default category icons on catalog materialization` (b0c38c92)
4. `docs(adr): add ADR-045 for category icon persistence` (e30d092e)

## Diff size

`git diff --stat feat/categoria-iconografia...HEAD`: **13 files changed, 378 insertions(+), 22
deletions(-)** → 400 changed lines total, at the 400-line budget (forecast was 200–250; actual
came in higher mainly due to ADR-045's required decision coverage — D-01 through D-06, D-09,
D-10, plus the D-11 contract note — trimmed twice during this batch to fit the budget without
cutting any required decision content).

## Deviations from design

None — implementation matches design.md. One documentation-scope clarification: design.md/tasks.md
named this "D-01…D-06, D-10"; the seed create-only rule is D-09 in design.md's own table, so
ADR-045 cites D-09 by its actual design.md label instead of folding it into D-06.

## Issues found

None blocking. Note for the next apply batch (PR2): `crear-categoria.use-case.ts` and
`actualizar-categoria.use-case.ts` still use a local `n = ['Necesidades','Deseos','Ahorro']`
allowlist pattern (unrelated to icono) — no action needed here, just confirming PR2 has a clean
starting point for wiring `esIconoCategoria` into those same files.

## PR2 batch — TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1/2.2 | `application/use-cases/crear-categoria.use-case.spec.ts` | Unit | ✅ 15/15 (pre-existing, before edit) | ✅ Written (7 failed: 3 exact `toHaveBeenCalledWith` missing `icono: null`, 4 new icono-specific assertions) | ✅ 22/22 passed | ✅ 5 cases (invalid→400+no-existeNombre-call, valid-persists, omitted→null, explicit-null→null, 3 pre-existing shape assertions updated) | ➖ None needed |
| 2.3/2.4 | `application/use-cases/actualizar-categoria.use-case.spec.ts` | Unit | ✅ 18/18 (pre-existing, before edit) | ✅ Written (4 failed: set/clear/omit/invalid-order new assertions) | ✅ 22/22 passed | ✅ 5 cases (set, clear, omit-leaves-key-absent, invalid→400, invalid-wins-over-409-order) | ➖ None needed |
| 2.5/2.6 | `infrastructure/persistence/prisma-categoria.repository.spec.ts` | Unit | ✅ 27/27 (pre-existing, before edit) | ✅ Written (6 failed: read-mapping + create-write + 3 update SET/CLEAR/omit cases) | ✅ 33/33 passed | ✅ 6 cases across listarConPatrones/crearConPatrones/actualizar | ➖ None needed |
| 3a.5 (pulled forward) | `infrastructure/http-express/routes/catalogo-http-error.spec.ts` | Unit | ✅ 14/14 (pre-existing, before edit) — this file was ALREADY red at the `tsc` level (not vitest) before this fix, because `CategoriaConPatrones.icono` widened the error union past the file's exhaustive `never` guard | ✅ Written (`it.each` row for `IconoCategoriaInvalidoError`) | ✅ 15/15 passed | ➖ Single case (mirrors the existing one-row-per-error-class pattern) | ➖ None needed |
| tsc fixture fixes | `commit-ingesta.use-case.spec.ts`, `registrar-movimiento-manual.use-case.spec.ts`, `categorias.schema.spec.ts`, `catalogo.dto.spec.ts`, `categoria.dto.spec.ts` | N/A | N/A | N/A — these are type-only literal fixes (`icono: null` added to existing `CategoriaConPatrones`-typed fixtures), not new behavior | ✅ `tsc --noEmit` clean after all 5 files fixed | N/A | N/A |

### PR2 batch Test Summary

- **Total tests written**: 20 new/modified test cases across 4 behavioral spec files (5 + 5 + 6 + 1
  net-new-or-changed assertions), plus 5 files with mechanical `icono: null` literal additions
  (type-compat only, no new assertions).
- **Total tests passing**: 2702/2702 (full `apps/api` suite, `pnpm exec vitest run`), 277/277 files.
- **Layers used**: Unit only (2 use cases, 1 repository, 1 HTTP-error mapper).
- **Approval tests** (refactoring): None — no refactoring tasks in this sub-batch, only additive.
- **Pure functions created**: None new — `esIconoCategoria`/`IconoCategoriaInvalidoError` (PR1) were
  consumed, not created.

## PR2 batch — Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run src/application/use-cases/crear-categoria.use-case.spec.ts src/application/use-cases/actualizar-categoria.use-case.spec.ts src/infrastructure/persistence/prisma-categoria.repository.spec.ts` → 3 files passed, 77 tests passed |
| Runtime harness command/scenario and exact result | N/A — no new HTTP route or DB boundary in this sub-batch (routes/schemas stay PR3a's scope); the icono validation/persistence path is exercised end-to-end by the unit specs above against the real `PrismaCategoriaRepository` mapping logic (fake `PrismaClient`), not a live route |
| Rollback boundary | The single commit `feat(api): validate and persist categoria icono on create/update` (09a6595f) is independently revertable: it only touches application-layer use cases, the `ICategoriaRepository` port, `PrismaCategoriaRepository`, the HTTP error mapper, and test fixtures — no schema/migration change (already landed in PR1), no route/schema change (PR3a). Reverting it leaves the `Categoria.icono` column present but write-inaccessible from any use case, matching PR1's stated rollback story. |

## PR2 batch — Verification (full commands run)

- `pnpm api test` → 277 test files passed, 2702 tests passed
- `pnpm api exec tsc --noEmit` → no errors
- `pnpm api lint:ci` → 0 errors, 3 pre-existing warnings in untouched files (same 3 as PR1's
  baseline — `excel-bank-detector.service.ts`, `excel-structure-validator.service.ts`,
  `excel-transaction-normalizer.service.ts`, `no-unsafe-argument`)
- Integration spec (task 2.11): NOT attempted — task not started this sub-batch (budget stop)

## PR2 batch — Commits (feature-branch-chain, PR2 targets `feat/categoria-iconografia-pr1`)

1. `feat(api): validate and persist categoria icono on create/update` (09a6595f) — 14 files changed,
   396 insertions(+), 9 deletions(-)

## PR2 batch — Diff size

`git diff --shortstat feat/categoria-iconografia-pr1...HEAD`: **396 insertions(+), 9 deletions(-)**
= **405 changed lines** — 5 lines OVER the 400-line budget, after only 6 of the 11 assigned tasks
(2.1–2.6). Per the batch's explicit instruction ("if it would exceed 400, stop and report rather
than trimming tests"), work stopped here without starting 2.7–2.11. See "Scope of PR2 batch" above
for the full root-cause breakdown and a `size:exception` vs. re-slice recommendation for the
orchestrator.

## PR2 batch — Deviations from design

- `IconoCategoriaInvalidoError` mapping in `catalogo-http-error.ts` (task 3a.5) was implemented in
  this PR2 batch instead of PR3a, because it was not optional: the file's exhaustive `never` guard
  does not compile once the error union changes, regardless of which PR "owns" the HTTP contract
  work. No HTTP schema, DTO, route body, or `openapi.json` was touched — only the error→status/code
  mapping function and its unit spec.
- No other deviations — the implemented tasks (2.1–2.6) match design.md's Data Flow and File Changes
  tables exactly (validation order demo→nombre→bucket→icono→uniqueness on create,
  demo→404→nombre→bucket→icono→uniqueness on update; tri-state PATCH semantics).

## PR2 batch — Issues found

- **Budget overage (see Diff size above).** The orchestrator needs to decide: (a) accept
  `size:exception` for this already-landed commit and continue 2.7–2.11 as a SEPARATE PR2b
  commit/PR (recommended — 2.7–2.10 are small additive changes to a 2-file detalle-grouping slice,
  and 2.11 is a self-contained int-spec extension; splitting keeps each PR reviewable), or
  (b) treat 3a.5's forced pull-forward as chargeable to PR3a's budget instead and re-forecast.
- **tasks.md path correction**: task 2.11 names `test/integration/catalogo-isolation.int-spec.ts`,
  which does not exist in this repo — the real file is `apps/api/test/catalogo-isolation.int-spec.ts`
  (confirmed via `fd`). The next batch should extend that file's existing describe blocks, not create
  a new path.

## Status

**PR1**: 9/10 Phase 1 tasks complete (1.10 is a human-gated prod step, intentionally not attempted).
**PR2 (this batch)**: 6/11 Phase 2 tasks complete (2.1–2.6), plus 1 unplanned Phase 3a task (3a.5)
pulled forward by a compile-time necessity. Stopped on the 400-line budget guard before starting
2.7–2.11. Recommend `sdd-apply` again for a PR2b covering 2.7–2.11 (or a re-forecast/`size:exception`
decision first) — NOT `sdd-verify` yet, since Phase 2 is incomplete.
