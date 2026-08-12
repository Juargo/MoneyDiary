# Archive Report — US-037 Catalog Ownership

**Date**: 2026-08-11
**Change**: us-037-catalogo-per-user — Per-user classification catalog (copy-on-signup)
**Status**: ARCHIVED & CLOSED

## Executive Summary

US-037 catalog ownership is complete, verified (PASS WITH WARNINGS, no CRITICAL), and archived. 7 chained PRs (#296–#302) merged to main deliver complete migration from a shared global catalog to per-user owned `Categoria` + `PatronClasificacion` rows, with 1500+ lines across schema migration, 8 new/modified infrastructure modules, 15+ integration test updates, and ADR-036 documentation. All 7 requirements (CAT037-01..07) trace to passing tests: 1429 unit + 84 integration green, migration rehearsal PASSED against production data, cross-workspace verification PASSED (frontend untouched), and change deployed live to production (commit 4d4cc4c, 2026-08-11, smoke-tested on new demo user). The system now guarantees per-user catalog isolation (RNF-SEC-006) and lays the foundation for future per-user catalog editing (US-038).

## What Shipped

### 7 Chained PRs (Feature-Branch-Chain strategy)

| PR | Slice | Content | Status |
|---|---|---|---|
| #296 | Schema + migration + FK gate | `schema.prisma` userId columns, `@@unique([userId, nombre])`, composite FK to `Categoria(id, userId)`; migration with guard, demo purge, backfill, constraints | Merged |
| #297 | Template module + copy hook | `catalogo-template.ts` with `CATEGORIA_TEMPLATE` / `PATRON_TEMPLATE` constants; `copiarCatalogoTemplate(tx, userId)` transactional function | Merged |
| #298 | Seed + demo creation + cleanup chain | `prisma/seed.ts` refactored to consume template; `PrismaDemoRepository.crear()` wired to copy catalog; `DemoCleanupService.borrarExpirados()` extended for ordered pattern delete | Merged |
| #299 | Write paths (catalog port, bucket writer, reclasificar, DTO, D-08) | `ICatalogoClasificacion.findAll(userId)`, `ITransaccionBucketWriter.asignarCategorizacion(userId,...)`, `ReclasificarCategoriaRepository` resolves by `(userId, nombre)`, DTO drops `CATEGORIA_IDS` lookup, tie-break moved to pattern text | Merged |
| #300 | Read paths + fold deletion | `fold-categoria.ts` new module (folds by `nombre`), `foldCategoriaId` + `CATEGORIA_ID_TO_CATEGORIA` deleted from `categoria-ids.ts`, both read repositories updated to select `categoria: { id, nombre }` | Merged |
| #301 | Isolation + regression tests + fixture rollout | 2 new integration specs (`catalogo-isolation.int-spec.ts`, `demo-lifecycle.int-spec.ts`), 7 existing specs extended with per-user catalog scenarios, shared fixture `crearCatalogoParaUsuario()`, `backfill-categorias.ts` scoped with both-sides `userId` guard (hardened beyond design) | Merged |
| #302 | ADR-036 + docs | `docs/adr/ADR-036-catalogo-clasificacion-por-usuario.md` recording all decisions, `docs/adr/README.md` index row, `CLAUDE.md` table row | Merged |

### Design Decisions (10 total, documented in ADR-036)

**D-01** Template as code (not DB rows) — consumed by both seed (upsert, fixed ids) and copy hook (createMany, generated cuids).
**D-02** Copy hook is a plain function, not a port — one implementation, already inside persistence layer.
**D-03** No composition-root change — userId travels as method parameter, repositories remain stateless per tenant.
**D-04** `PatronClasificacion.userId` direct column — authoritative isolation at row level (mirrors `Ingesta` precedent).
**D-05** Backfill without repointing — existing global catalog rows keep their ids, gain `userId = bootstrap user`, no `Transaccion.categoriaId` touched.
**D-06** Composite FK with multi-field relation — `PatronClasificacion(categoriaId, userId) → Categoria(id, userId)`, validated by `prisma migrate diff` before code.
**D-07** Two write strategies — `copiarCatalogoTemplate` (new users, generated cuids) vs seed upsert (bootstrap, fixed ids), single-sourced template content.
**D-08** Tie-break `(prioridad, patron, id)` — required for deterministic classification with per-user generated pattern ids (new, not speculative).
**D-09** `foldCategoriaId` deleted, new `foldCategoria(row)` folds by `nombre` — compiler-enforced migration stops runtime use of legacy global id map.
**D-10** Backfill script scoped with `userId: USER_ID_FIJO` on both patron read and transaction query — prevents cross-tenant priority hijack (judgment-day hardening).

### Code Quality

- **Schema**: `Categoria.userId` (NOT NULL), `Categoria @@unique([userId, nombre])`, `PatronClasificacion.userId` (NOT NULL), composite FK.
- **Migration**: guarded (aborts if >1 non-demo user), fresh-DB branch (clears owner-less rows on empty DB), demo purge (7 user with cascade), backfill (pattern inherits from category), constraint tightening (FK, indexes).
- **Tests**: 1429 unit tests (Vitest), 84 integration tests (ephemeral Postgres), 60+ new unit test cases, 15+ extended integration specs.
- **Type safety**: `pnpm api exec tsc --noEmit` — zero errors.
- **TDD compliance**: All code tasks RED → GREEN verified, all test files confirmed to exist.

### Verification Outcome

**Status: PASS WITH WARNINGS** (full detail in `verify-report.md`, obs Engram topic key `sdd/us-037-catalogo-per-user/verify-report`)

- All 39 tasks completed (38 code, 1 production rehearsal gate).
- All 7 requirements + 19 scenarios traced to passing tests (18 code-based, 2 rehearsal-verified).
- No CRITICAL issues; 2 WARNINGs (no direct `/api/resumen` e2e test, task 6.7 survey not independently re-verified) — both pre-existing gates, correctly recorded.
- 1 SUGGESTION (future hardening: add `/api/resumen` e2e assertion for second user) — not blocking.

### Production Deployment

- **Commit**: 4d4cc4c (2026-08-11)
- **Branch**: Feature-branch-chain tracker `feat/us-037-catalogo-per-user` merged to `main` after all 7 PRs and task 6.9 (production rehearsal) passed.
- **Rehearsal**: 3 runs against local+prod data — all PASSING. Run 3 (vs Supabase pg_dump): 1 live demo purged cleanly, 430 real user's transactions checksum-identical (D-05 verified), all constraints present, composite FK confirmed live.
- **Live verification**: New demo user created on prod (post-merge) owns exactly 8 Categoria + 20 PatronClasificacion rows (smoke-tested).
- **Auto-deploy**: Render + Vercel triggered on push to `main` (ADR-030); change deployed transparently.

## Spec Reconciliation (this archive)

### Delta Spec → Main Spec

The change's delta spec (`openspec/changes/us-037-catalogo-per-user/specs/catalogo-clasificacion-ownership/spec.md`) is promoted to the canonical main spec:

| Location | Action |
|---|---|
| `openspec/specs/catalogo-clasificacion-ownership/spec.md` | **CREATED** (new canonical spec for catalog ownership system) |

The spec is reframed from "will change" (delta) to "is" (system state) — the 7 requirements (CAT037-01..07) remain verbatim as they describe the live deployed system. The spec is now the authoritative reference for how the catalog operates: per-user owned, isolated by `userId`, with fixed 8-category template copied at user creation.

## Quality Gates (from verify report)

| Check | Result |
|---|---|
| Spec compliance (19 scenarios) | 19/19 PASS (18 code, 2 rehearsal) |
| Build (`tsc --noEmit`) | PASS (0 errors) |
| Unit tests (`pnpm api test`) | PASS (1429/1429) |
| Integration tests (Postgres ephemeral) | PASS (84/84) |
| Frontend cross-workspace (`pnpm web test`) | PASS (561/561, zero changes) |
| Migration rehearsal (3 scenarios) | PASS (prod-like, multi-user-guard, prod-data) |
| TDD compliance (RED→GREEN) | PASS (all tasks verified) |
| ADR-036 accuracy | PASS (all decisions verified in code) |

## Accepted Risks & Mitigations (carried from verify/tasks)

| Risk | Likelihood | Impact | Mitigation | Status |
|---|---|---|---|---|
| Silent fold-to-null on read paths | High if missed | Critical | Fold by `nombre`, integration test for second user | ✅ Mitigated (test: `movimientos-mes.int-spec.ts:420`, `detalle-bucket.int-spec.ts:237`) |
| `CATEGORIA_IDS` breakage surface wide | High | High | Deleted `foldCategoriaId`, compiler finds sites | ✅ Mitigated (2 sites fixed, none remain) |
| `Patron.userId` drifting from `categoria.userId` | Low | High | Composite FK enforced by DB | ✅ Mitigated (FK confirmed live, invariant test covers fallback) |
| Demo user FK violation on first expiry | High if missed | Medium | Extended delete chain, regression test | ✅ Mitigated (test: `demo-lifecycle.int-spec.ts:156`) |
| Migration mis-assigns catalog >1 user | Low | Critical | Guard exception, guard test | ✅ Mitigated (rehearsal run 2 confirmed guard works) |

## Out of Scope (Deferred)

- **Catalog CRUD** (create, rename, delete category/pattern) — deferred to US-038.
- **Per-user `BucketPresupuesto`** — buckets stay a global fixed taxonomy of 5.
- **Template versioning** — existing users' copies do not receive template edits (point-in-time snapshots, revisit trigger on US-038).
- **"Import suggested categories"** — deferred, YAGNI.

## Artifact Traceability (Engram)

| Artifact | Topic Key | Observation ID | Retrieved |
|---|---|---|---|
| Proposal | `sdd/us-037-catalogo-per-user/proposal` | — | ✅ Read from change dir |
| Spec (delta) | `sdd/us-037-catalogo-per-user/spec` | — | ✅ Read from change dir |
| Design | `sdd/us-037-catalogo-per-user/design` | — | ✅ Read from change dir |
| Tasks | `sdd/us-037-catalogo-per-user/tasks` | — | ✅ Read from change dir |
| Verify Report | `sdd/us-037-catalogo-per-user/verify-report` | — | ✅ Read from change dir |
| Archive Report | `sdd/us-037-catalogo-per-user/archive-report` | (this document) | ✅ Written this session |

## Source Files Moved

The entire change folder is relocated (via git operations by the orchestrator) from:

```
openspec/changes/us-037-catalogo-per-user/
```

to:

```
openspec/changes/archive/2026-08-11-us-037-catalogo-per-user/
```

Contents archived with full structure:
- `proposal.md`
- `design.md`
- `tasks.md`
- `verify-report.md`
- `specs/catalogo-clasificacion-ownership/spec.md`
- `archive-report.md` (this document)

## Canonical Specification Created

A new canonical main spec exists at:

```
openspec/specs/catalogo-clasificacion-ownership/spec.md
```

This spec describes the live system state: per-user catalog ownership, copy-on-creation, userId-scoped isolation, and the 8-category + 20-pattern template. This is the go-forward reference for catalog isolation and a binding input to US-038 (catalog CRUD).

## Preconditions for US-038 (Catalog CRUD)

When US-038 is initiated, it MUST respect:

1. **Demo catalog is read-only** — any mutation endpoint MUST gate on `esDemo` sessions, rejecting with guidance to register an account (CAT037-02 amendment).
2. **Classification tie-break is `(prioridad, patron, id)`** — pattern tie-break is by text order, not by surrogate id (D-08 invariant, ensures determinism across users).
3. **Composite FK may need adjustment** — if D-06 fallback is ever taken (plain FK + invariant test), US-038's write paths MUST not rely on DB-enforced integrity and MUST maintain the invariant application-side.

## SDD Cycle Complete

- ✅ Proposal reviewed and approved
- ✅ Specifications written and promoted to main specs
- ✅ Design decisions documented and followed (ADR-036)
- ✅ Tasks executed in 7 chained PRs
- ✅ Implementation verified (PASS WITH WARNINGS, no CRITICAL)
- ✅ Production rehearsal passed (commit 4d4cc4c, live deployment confirmed)
- ✅ Canonical capability spec lives at `openspec/specs/catalogo-clasificacion-ownership/spec.md`
- ✅ Archive created and persisted

**The us-037-catalogo-per-user change is fully closed.**

All code is live in production. The system now enforces per-user catalog ownership and isolation (RNF-SEC-006), and the technical foundation for US-038 (catalog CRUD) is established.
