# Tasks: US-037 — Per-user classification catalog (copy-on-signup)

Strict TDD is active. Test runner: `pnpm api test` (unit), `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration` (integration, ephemeral local Postgres per `apps/api/docs/local-test-db.md`). Each code task is RED (failing test) → GREEN (implementation) unless marked otherwise. Ordering follows design §12's 7 natural seams; seams 4-5 cannot land before seam 1.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1200–1800 (≈20 source/test files + migration SQL + ADR doc; largest single contributor is fixture-rollout churn across ~10-15 existing `*.int-spec.ts` files in task 6.7) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 7 slices along design §12 seams, PR1 → PR7 |
| Delivery strategy | ask-on-risk |
| Chain strategy | Feature-Branch-Chain (stacked-to-main unsafe due to auto-deploy) |

**All 39 tasks completed.** 7 chained PRs (#296–#302) merged in sequence (feature-branch-chain strategy). Feature branch `feat/us-037-catalogo-per-user` merged to `main` after seam 7 + task 6.9 (rehearsal) and 6.10 (verification) passed. Deployment: commit 4d4cc4c (2026-08-11), live production, smoke-tested (8+20 catalog copy verified on new demo user).

---

## Phase 1: Schema + migration + FK gate (seam 1) — ✅ COMPLETED

- [x] 1.1 [GATE] Schema validation complete. Prisma schema updated with `userId` on Categoria/PatronClasificacion, `@@unique([userId, nombre])`, composite FK structure.
- [x] 1.2 [GATE] Composite FK CONFIRMED: `prisma migrate diff` generated SQL with `ALTER TABLE "PatronClasificacion" ADD CONSTRAINT "PatronClasificacion_categoriaId_userId_fkey" FOREIGN KEY ("categoriaId","userId") REFERENCES "Categoria"("id","userId")`.
- [x] 1.3a Migration deployed: `apps/api/prisma/migrations/20260811200000_us037_catalogo_per_user/migration.sql` with guard, demo purge, backfill, and constraint tightening.
- [x] 1.4 Migration applied against local ephemeral Postgres — clean, all constraints present.
- [x] 1.5 Migration rehearsal, run 1 (prod-like scenario) — PASSING.
- [x] 1.6 Migration rehearsal, run 2 (multi-user guard) — PASSING. Guard correctly aborts when >1 non-demo user.

## Phase 2: Template module + copy hook (seam 2) — ✅ COMPLETED

- [x] 2.1 Template test suite created.
- [x] 2.2 `catalogo-template.ts` implemented with `CATEGORIA_TEMPLATE` and `PATRON_TEMPLATE` constants.
- [x] 2.3 Copy hook test suite created.
- [x] 2.4 `copiarCatalogoTemplate(tx, userId)` implemented, contract verified.

## Phase 3: Seed + demo creation + cleanup chain (seam 3) — ✅ COMPLETED

- [x] 3.1 Seed catalog test updated.
- [x] 3.2 `prisma/seed.ts` refactored to consume template constants, ids preserved for bootstrap user.
- [x] 3.3 Demo repository test updated with catalog expectations.
- [x] 3.4 `PrismaDemoRepository.crear()` wired to copy catalog in the transaction.
- [x] 3.5 Demo cleanup service test updated for new delete chain order.
- [x] 3.6 `DemoCleanupService.borrarExpirados()` extended to delete PatronClasificacion before Categoria.
- [x] 3.7 `demo-lifecycle.int-spec.ts` created — all-or-nothing demo creation verified, orphan cleanup verified.

## Phase 4: Write paths (seam 4) — ✅ COMPLETED

- [x] 4.1 Categorization tie-break test updated for D-08 (patron text as secondary key).
- [x] 4.2 `CategorizarTransaccionUseCase` sort order updated to `(prioridad asc, patron asc, id asc)`.
- [x] 4.3 Catalog classification port signature updated: `findAll(userId)`.
- [x] 4.4 `PrismaCatalogoClasificacionRepository` implementation with `where: { userId }`.
- [x] 4.5 Bucket writer port signature updated: `asignarCategorizacion(userId, ...)`.
- [x] 4.6 `PrismaTransaccionBucketRepository` implementation with per-user category resolution.
- [x] 4.7 `ProcessIngestaUseCase` threaded with `userId` into `runCategorizacion`.
- [x] 4.8 Reclassification port result updated with `categoriaId`.
- [x] 4.9 `PrismaReclasificarCategoriaRepository` resolves category by `(userId, nombre)`.
- [x] 4.10 `aReclasificarCategoriaDto` updated to consume real persisted id.

## Phase 5: Read paths + fold deletion (seam 5) — ✅ COMPLETED

- [x] 5.1 Fold-by-nombre test suite created.
- [x] 5.2 `fold-categoria.ts` implemented, validates `nombre` against enum values.
- [x] 5.3 `foldCategoriaId` and `CATEGORIA_ID_TO_CATEGORIA` deleted, compiler finds call sites.
- [x] 5.4 Both read repositories (`prisma-movimientos-mes`, `prisma-detalle-bucket`) updated to fold by `nombre`.
- [x] 5.5 Repository tests updated with nested `categoria: { id, nombre }` shape mocks.

## Phase 6: Isolation + regression tests (seam 6) — ✅ COMPLETED

- [x] 6.1 `catalogo-isolation.int-spec.ts` created — users A/B each own disjoint catalog, isolation verified.
- [x] 6.2 Composite FK invariant test — raw cross-tenant insert rejected by the FK.
- [x] 6.3 `seed.int-spec.ts` extended — idempotency, id stability verified.
- [x] 6.4 `categorizacion.int-spec.ts` extended — non-seed user classified with own patterns only.
- [x] 6.5 Read endpoint tests extended — second user sees categories (regression guard for seam 5).
- [x] 6.6 `reclasificar-categoria.int-spec.ts` extended — two users reclassifying to same name get different ids.
- [x] 6.7 Shared fixture `crearCatalogoParaUsuario()` created and applied to all affected specs (5 files needed it, 12 surveyed but not needed).
- [x] 6.8 `backfill-categorias.ts` scoped with `userId: USER_ID_FIJO` filter; backfill invariant test added.
- [x] 6.9 Migration rehearsal, run 3 — PASSED against production pg_dump (1 live demo purged, 430 real txn checksummed identical, constraints verified).
- [x] 6.10 Cross-workspace verification — `pnpm web test` green (zero changes), `pnpm api test` 1429/1429 green, `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration` 84/84 green, `tsc --noEmit` clean.

## Phase 7: ADR-036 + docs (seam 7) — ✅ COMPLETED

- [x] 7.1 `docs/adr/ADR-036-catalogo-clasificacion-por-usuario.md` written, recording all decisions D-01…D-10, demo read-only precondition, D-06 fallback note.
- [x] 7.2 ADR-036 added to `docs/adr/README.md` index.
- [x] 7.3 ADR-036 row added to `CLAUDE.md` ADR table.

---

## Delivery Summary

**Changed lines:** ~1500 across schema, migration SQL, 7 new/modified modules, 15+ test files, ADR, documentation.

**Chaining:** 7 slices delivered as feature-branch-chain (tracker `feat/us-037-catalogo-per-user` with child PRs #296–#302). Only the tracker branch merged to `main` after all seams passed and task 6.9 (production rehearsal) confirmed safety.

**Quality gates:** TDD (RED → GREEN verified for all code tasks), Strict TDD integration tests (84/84 green), cross-workspace verification (web/mobile untouched), production rehearsal (3 scenarios, all passing), migration safety (guard + guard test confirmed).

**Status:** Fully implemented, verified (PASS WITH WARNINGS, no CRITICAL), deployed to production commit 4d4cc4c (2026-08-11), live.
