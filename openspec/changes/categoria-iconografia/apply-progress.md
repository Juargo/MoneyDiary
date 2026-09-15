# Apply Progress: categoria-iconografia

## Scope of this batch

Phase 1 (PR1) — tasks 1.1 through 1.9. Task 1.10 (apply migration to prod) is a human-gated step,
out of scope for automated apply, and remains unchecked.

## Completed Tasks

- [x] 1.1 RED: `apps/api/src/domain/value-objects/icono-categoria.spec.ts`
- [x] 1.2 GREEN: `apps/api/src/domain/value-objects/icono-categoria.ts`
- [x] 1.3 RED: `apps/api/src/domain/errors/icono-categoria-invalido.error.spec.ts`
- [x] 1.4 GREEN: `apps/api/src/domain/errors/icono-categoria-invalido.error.ts`
- [x] 1.5 `apps/api/prisma/schema.prisma` — `icono String?` on `Categoria`
- [x] 1.6 `apps/api/prisma/migrations/20260915000000_categoria_icono/migration.sql`
- [x] 1.7 `apps/api/src/infrastructure/persistence/catalogo-template.ts` — 8 seed defaults
- [x] 1.8 `apps/api/prisma/seed.ts` — `icono` on `create` only, never `update`
- [x] 1.9 `docs/adr/ADR-045-categoria-icono-persistencia.md` + README/CLAUDE.md index rows

### Remaining (not in this batch's scope)

- [ ] 1.10 Apply migration to prod (human-gated, out of scope for this apply batch)
- [ ] Phase 2 (PR2): use cases, ports, repos, detalle grouping, isolation int-spec
- [ ] Phase 3a–3c (PR3): HTTP contract + regen, web/mobile contract foundation
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

## Status

9/10 Phase 1 tasks complete (1.10 is a human-gated prod step, intentionally not attempted).
Ready for `sdd-verify`, then PR2 (`sdd-apply` again) for Phase 2.
