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

## Scope of PR2b batch (this update) — COMPLETE

Assigned: Phase 2 (PR2) tasks 2.7–2.11 (the remainder PR2 stopped on for budget). All 5 completed.

### Completed Tasks (PR2b, this batch)

- [x] 2.7 RED: `agrupar-detalle-por-categoria.spec.ts` — 3 new cases: group exposes the category's
  icono; a category with no icono of its own exposes `null`; the synthetic "Sin categoría" group
  ALWAYS exposes `null` regardless of other categories' icons (MBD-02)
- [x] 2.8 GREEN: `detalle-bucket.port.ts` (`DetalleBucketRow.categoria.icono: string | null`),
  `agrupar-detalle-por-categoria.ts` (`GrupoDetalleCategoria.icono`, derived from
  `fila.categoria?.icono ?? null` — the same nullish-coalesce already used for `categoriaId`/`nombre`,
  so the synthetic-group-always-null rule falls out for free, no special-case branch needed)
- [x] 2.9 RED: `prisma-detalle-bucket.repository.spec.ts` — 2 new cases (icono present, icono null)
  plus updated the existing 3 fold tests and the select-shape assertion to include `icono`
- [x] 2.10 GREEN: `prisma-detalle-bucket.repository.ts` — select adds `icono: true` to the nested
  `categoria` relation; mapping stays `foldCategoria(row.categoria)!` (non-null assertion, since the
  ternary already guards `row.categoria` truthy) spread with `icono: row.categoria.icono` — `icono`
  travels INLINE next to the shared fold, which still returns bare `{id, nombre}` for
  `PrismaMovimientosMesRepository` (unaffected, confirmed by full suite + tsc)
- [x] 2.11 RED+GREEN: extended `apps/api/test/catalogo-isolation.int-spec.ts` (the file tasks.md
  should have named — there is no `test/integration/` directory in this repo, confirmed by PR2's
  batch and re-confirmed here) with one new `it` inside the first `describe` block: instantiates the
  REAL `PrismaCategoriaRepository` + `ActualizarCategoriaUseCase` (not a fake), resolves user A's
  seeded `Transporte` categoria id (seed default icono `'bus'`, `catalogo-template.ts`), then calls
  `execute({userId: USER_ID_B, ..., id: transporteIdA, icono: 'house'})` — asserts
  `CategoriaNoEncontradaError` and that A's `icono` column is untouched (`'bus'` before and after)

**Layer note (per the batch's explicit instruction):** `PATCH /api/categorias/:id`'s HTTP schema
(`categoriaUpdateRequestSchema`) is still `.strict()` with only `nombre`/`bucket` — PR3a (not yet
applied) adds `icono` to that transport schema. This test therefore exercises the use case +
`PrismaCategoriaRepository` layer directly against the ephemeral DB, NOT the HTTP route — it proves
the exact ownership gate (`buscarPorId(userId, id)` scoped by `userId` in the SQL WHERE) the HTTP
route will delegate to once PR3a threads `icono` through. PR3a's own route-test suite (task 3a.4)
covers the transport-layer 400/404 shape once the schema accepts `icono`.

### Type-ripple fixture fixes (mechanical, no new behavior)

Widening `GrupoDetalleCategoria`/`DetalleBucketRow.categoria` with a new REQUIRED `icono` field (per
design.md's own contract) forced `icono` literals into pre-existing fixtures across 6 files that build
these types directly (not through a builder function): `obtener-detalle-bucket-mes.use-case.spec.ts`
(4 occurrences), `app.bucket-detalle-mes.spec.ts` (2), `bucket-detalle-mes.schema.spec.ts` (1),
`buckets.schema.spec.ts` (1), `detalle-bucket-mes.dto.spec.ts` (2). None of these thread `icono`
through any HTTP contract — they only keep tsc's structural/excess-property checks green given this
batch's port/service change. Same pattern PR2 already established for `CategoriaConPatrones`.

## Mode (PR2b)

Strict TDD (RED → GREEN → REFACTOR), verified per task via `pnpm exec vitest run <file>` before
moving to the next task.

## PR2b batch — TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.7/2.8 | `application/services/agrupar-detalle-por-categoria.spec.ts` | Unit | ✅ 15/15 (pre-existing, before edit) | ✅ Written (3 failed: icono-present, icono-null, synthetic-always-null) | ✅ 18/18 passed | ✅ 3 cases (real icono, null icono, synthetic group) | ➖ None needed — the existing `?? null` pattern already generalized |
| 2.9/2.10 | `infrastructure/persistence/prisma-detalle-bucket.repository.spec.ts` | Unit | ✅ 13/13 (pre-existing, before edit) | ✅ Written (5 failed: 3 existing fold assertions + select-shape assertion + 2 new icono cases) | ✅ 13/13 passed (net: 2 new tests, 3 existing extended) | ✅ 2 cases (icono present 'bus', icono null) | ➖ None needed |
| 2.11 | `test/catalogo-isolation.int-spec.ts` | Integration | ✅ 13/13 (pre-existing, before edit, run against local ephemeral Postgres) | ✅ Written (new `it`, references `PrismaCategoriaRepository`/`ActualizarCategoriaUseCase`/`CategoriaNoEncontradaError`, all pre-existing production code — RED confirmed via `tsc`, since the test body itself was correct on first write and the assertions describe already-implemented PR2 behavior) | ✅ 14/14 passed (`ALLOW_DESTRUCTIVE_DB=1` against local Postgres, migration `20260915000000_categoria_icono` applied via `test:db:migrate`) | ➖ Single case (owner-scoped icono write — CATICO-05 has one scenario) | ➖ None needed |
| Type-ripple fixture fixes | 6 files listed above | N/A | N/A | N/A — type-only literal additions (`icono: 'utensils'` or `icono: null`), not new behavior | ✅ `tsc --noEmit` clean after all 6 files fixed | N/A | N/A |

### PR2b batch Test Summary

- **Total tests written**: 6 new test cases (3 in `agrupar-detalle-por-categoria.spec.ts`, 2 in
  `prisma-detalle-bucket.repository.spec.ts`, 1 integration in `catalogo-isolation.int-spec.ts`), plus
  3 existing unit tests extended in place (icono added to their fixtures/assertions) and 6 files with
  mechanical `icono` literal additions (type-compat only).
- **Total tests passing**: 2707/2707 (full `apps/api` unit suite, `pnpm exec vitest run`), 277/277
  files; 14/14 in `catalogo-isolation.int-spec.ts` (integration, local ephemeral DB).
- **Layers used**: Unit (service, repository) + Integration (real Postgres, use case + repository).
- **Approval tests** (refactoring): None — no refactoring tasks in this batch, only additive.
- **Pure functions created**: None new — `agruparDetallePorCategoria` (pre-existing pure function)
  was extended, not created.

## PR2b batch — Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run src/application/services/agrupar-detalle-por-categoria.spec.ts src/infrastructure/persistence/prisma-detalle-bucket.repository.spec.ts` → 2 files passed, 31 tests passed |
| Runtime harness command/scenario and exact result | `DOTENV_CONFIG_PATH=.env.test ALLOW_DESTRUCTIVE_DB=1 pnpm exec vitest run --config ./vitest.int.config.ts test/catalogo-isolation.int-spec.ts` against a local ephemeral Postgres (`moneydiary-test-db` docker container, already running; migration applied via `pnpm run test:db:migrate`) → 1 file passed, 14 tests passed, including the new CATICO-05 case by name |
| Rollback boundary | Two independent commits: (1) `feat(api): expose categoria icono in bucket detalle groups` (10 files: port, service+spec, repository+spec, and the 6 type-ripple fixture fixes) — revertable on its own, leaves the detalle endpoint's `icono` field absent from the group shape; (2) `test(api): extend catalogo isolation coverage for categoria icono ownership` (1 file, the int-spec) — revertable independently, removes only the new CATICO-05 assertion, no production code depends on it |

## PR2b batch — Verification (full commands run)

- `pnpm api test` → 277 test files passed, 2707 tests passed
- `pnpm api exec tsc --noEmit` → no errors (confirmed it covers `apps/api/test/**` — the int-spec
  typechecks under the same root `tsconfig.json`, no separate config needed)
- `pnpm api lint:ci` → 0 errors, 3 pre-existing warnings in untouched files (same 3 as PR1/PR2's
  baseline — `excel-bank-detector.service.ts`, `excel-structure-validator.service.ts`,
  `excel-transaction-normalizer.service.ts`, `no-unsafe-argument`); 2 new prettier errors were
  auto-fixed via `eslint --fix` before the final clean run
- Integration spec (task 2.11): **RUN LOCALLY** — a local ephemeral Postgres was already available
  (`moneydiary-test-db` docker container); `pnpm run test:db:migrate` applied the pending
  `20260915000000_categoria_icono` migration, then
  `DOTENV_CONFIG_PATH=.env.test ALLOW_DESTRUCTIVE_DB=1 pnpm exec vitest run --config ./vitest.int.config.ts test/catalogo-isolation.int-spec.ts`
  → 14/14 passed, including the new CATICO-05 test by name (verified via `--reporter=verbose`)

## PR2b batch — Commits (feature-branch-chain, this branch `feat/categoria-iconografia-pr2b` is a
child of `feat/categoria-iconografia-pr2`, itself PR #681 targeting the tracker `feat/categoria-iconografia`)

1. `feat(api): expose categoria icono in bucket detalle groups` (ad4fd559) — 10 files changed, 144
   insertions(+), 15 deletions(-)
2. `test(api): extend catalogo isolation coverage for categoria icono ownership` (fda87268) — 1 file
   changed, 52 insertions(+)

## PR2b batch — Diff size

`git diff --shortstat feat/categoria-iconografia-pr2...HEAD`: **11 files changed, 196
insertions(+), 15 deletions(-)** = **211 changed lines** — well within the 400-line budget (forecast
was ~150 for the remainder of PR2; actual landed at 211, the difference being the 6 mechanical
type-ripple fixture fixes plus the fuller MBD-02 triangulation set).

## PR2b batch — Deviations from design

None — implementation matches design.md exactly: `icono` travels inline next to `foldCategoria`
without widening that shared function (File Changes table); the synthetic Sin categoría group's
`icono` is always `null` via the same `?? null` pattern already used for `categoriaId`/`nombre`, with
no special-case branch (Data Flow section). One documentation-scope correction: task 2.11 as written
in tasks.md named a nonexistent path (`test/integration/catalogo-isolation.int-spec.ts`) — this batch
extended the real file and corrected the task's own text in `tasks.md` to match, per PR2's note.

## PR2b batch — Issues found

None blocking. Task 1.10 (apply migration to prod) remains the sole unchecked item outside Phase
2 — human-gated, intentionally out of scope for every automated apply batch so far.

## Status

**PR1**: 9/10 Phase 1 tasks complete (1.10 is a human-gated prod step, intentionally not attempted).
**PR2**: 6/11 Phase 2 tasks complete in the PR2 batch (2.1–2.6), plus 1 unplanned Phase 3a task
(3a.5) pulled forward by a compile-time necessity.
**PR2b (this batch)**: 5/5 remaining Phase 2 tasks complete (2.7–2.11). **Phase 2 is now 11/11
complete** (all of 2.1–2.11, plus the pulled-forward 3a.5).
Recommend `sdd-verify` for Phase 2 (PR1+PR2+PR2b), then `sdd-apply` again for Phase 3a onward.

### PR2b post-validation fix (orchestrator)

- Validator CRITICAL: `DetalleBucketRow.categoria` is shared with the flat `GET /api/buckets/:bucket` endpoint (US-017); `aDetalleBucketDto` passed `tx.categoria` by reference and the route does not strip through zod, so `icono` leaked into a contract that does not declare it.
- Fixed test-first in `c2c6cdcf` (`fix(api): keep categoria icono out of the flat bucket detalle contract`): explicit `{ id, nombre }` projection + `toStrictEqual` test in `detalle-bucket.dto.spec.ts` (RED observed, then GREEN).
- Verification after fix: `pnpm api test` 2708 passed; `tsc --noEmit` clean; `lint:ci` 0 errors. PR2b diff vs PR2: 13 files, 224+/16-.
- Attempt settled `complete`.

### PR2b CI remediation (orchestrator)

- **Primary failure:** CI job "Integration & e2e (api, ephemeral DB)" failed on `test/detalle-bucket.int-spec.ts` CAT037-06 (expected `categoria` `{ id, nombre }`; repository row now also carries `icono`). The PR2b batch had run only `catalogo-isolation.int-spec.ts` locally, not the full integration suite.
- **Verification consequence:** PR2b was not green until fixed.
- **Fix:** `173830b6` (`test(api): expect categoria icono in detalle bucket repository rows`) — expectation now includes the template default `icono: tv`. Spec passes locally 4/4.
- **Local environment note:** a full local `pnpm api test:integration` run also showed failures in `seed.int-spec.ts` (260 vs 20 PatronClasificacion rows) and order-dependent auth/demo specs caused by accumulated state in the persistent `moneydiary-test-db` container; those files pass in CI on a fresh DB with the same code.
- **Attempt settlement:** remediation attempt settled `complete`.
- **Next batches:** run the FULL integration suite (CI is the fresh-DB authority) whenever a shared repository row shape changes.
