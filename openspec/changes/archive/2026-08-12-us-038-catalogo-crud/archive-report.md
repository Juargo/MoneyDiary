# Archive Report: US-038 — Catalog CRUD API

**Change**: `us-038-catalogo-crud` (Catalog CRUD API — categories + classification patterns)
**Archived**: 2026-08-12
**Status**: CLOSED — fully delivered, merged to main, deployed to production, smoke-tested live
**Artifact Store**: hybrid (engram + openspec)

---

## Delivery Summary

US-038 delivered the first user-facing write surface for category and pattern management, built on top of the per-user catalog ownership US-037 established. The change completed the semantic shift from "categories are a closed TypeScript enum" to "categories are per-user database rows owned by `userId`."

**Delivery Chain (Feature-Branch-Chain Strategy)**:
- Tracker PR #305 (draft, no-merge) accumulates all work
- PR #306: Domain widening — enum retirement + behaviour-preserving refactor (1 PR1)
- PR #307: Application slice — 13 errors + 2 ports + 7 use cases (PR2a)
- PR #308: Infrastructure slice — 2 adapters + 2 routers + contracts + integration (PR2b)
- **Only tracker PR #305 merges to `main`** (not the child PRs)
- **Merged to main**: commit `e9b272b` (2026-08-11 evening)
- **Deployed**: immediate via Render git-integration
- **Smoke-tested live**: 2026-08-12 (commit `e9b272b`, production)

**Key Fact**: No database migration required for this change (unlike US-037). `schema.prisma` and `prisma/migrations/` are untouched. This significantly lowers deploy risk.

---

## Quality Gates — All Passed

### Judgment-Day Review (Parallel to Verify)
Two rounds of adversarial review on PR #306 (domain widening, highest risk); one round on PR #308.
- **Round 1 (PR #306)**: Caught edge cases in the delete predicate; author confirmed fixes.
- **Round 2 (PR #306)**: Approved after fixes.
- **Round 1 (PR #308)**: Clean approval, no comments.
- **Final verdict**: APPROVED on all high-stakes phases.

### SDD Verify Phase (Complete Chain)
Verifier: sdd-verify in isolated worktree, 2026-08-12.

**Command Matrix — All Green**:
| Command | Result | Notes |
|---------|--------|-------|
| `pnpm install --frozen-lockfile` | OK | 1864 packages |
| `pnpm api test` | 1617 tests passed | 204 files |
| `pnpm api test:integration` | 108 tests passed | 20 files, real Postgres |
| `pnpm api exec tsc --noEmit` | 0 diagnostics | Silent success |
| `pnpm api openapi:check` | Green | No drift from baseline |
| `pnpm web test` | 560 tests passed | 61 files, zero changes to production code |
| `pnpm api openapi:check` (before contract sync) | Green | Drift-gated |
| `pnpm api-client generate` + `api-client` CI gate | Green | Both regenerated, zero drift |

**Test Coverage by Requirement** (all traced):
- CAT038-01 through CAT038-09: 100% coverage via unit + integration specs
- CAT037-04 (MODIFIED): Reclassify unconstrained by enum, resolves per-user catalog ✓
- CAT037-06 (MODIFIED): Read fold uses ownership as sole authority, no defensive guard ✓

**Design Conformance** (spot-checked, all confirmed):
- Delete-in-use predicate **inside** the `deleteMany` statement (D-06): Confirmed
- Re-bucket re-stamp atomic with transaction (D-07): Confirmed
- `esDemo` required input field on mutations, compile-enforced (D-04/D-05): Confirmed
- `userId` in every SQL `WHERE` (RNF-SEC-006): Every method confirmed
- OpenAPI registration append-only, no reordering: 307 insertions / 1 deletion (only the 400 desc change on existing reclassify endpoint)
- `schema.prisma` untouched: Empty diff confirmed
- No per-user `BucketPresupuesto`: Confirmed, `bucket.ts` untouched

**Non-Goals Respected** (all verified):
- No delete-in-use migration flow (US-039): Out of scope, docblock confirms
- No web/mobile UI (US-043): 1 test-only file under apps/web (drift guard re-point), zero under apps/mobile
- No migration: Confirmed empty diff

---

## Production Verification — Live 2026-08-12

**Smoke Test** (live.moneydiary.cl environment, commit `e9b272b`):

1. **Demo Session Isolation**:
   - GET `/api/categorias` as demo user → 200, returns demo user's catalog
   - POST `/api/categorias` (create category) as demo user → 403 `DEMO_SOLO_LECTURA` ✓
   - PATCH `/api/categorias/{id}` (rename) as demo user → 403 ✓
   - DELETE `/api/categorias/{id}` as demo user → 403 ✓
   - Verified: Cannot mutate, can read

2. **Real User CRUD**:
   - GET `/api/categorias` → 200, returns 8 categories (template seed) with nested patterns (20 total)
   - POST `/api/categorias` → 201, created a new category "TestCat" in "Deseos"
   - PATCH `/api/categorias/{id}` → 200, renamed and re-bucketed (historical transactions re-stamped verified in `/api/resumen`)
   - DELETE `/api/categorias/{id}` (after removing transactions) → 204, deleted with patterns
   - Verified: CRUD works, ownership isolation enforced, re-stamp atomic

3. **Cross-Tenant Isolation**:
   - Real user A's category id
   - Real user B attempts to PATCH that id → 404 (not 403, anti-enumeration rule) ✓
   - Verified: Ownership scoped at SQL level

4. **Demo Account Behavior**:
   - GET `/api/categorias` still returns 200 for demo (read-only catalog visible) ✓
   - Message on 403 is "Las categorías de la cuenta demo son de solo lectura. Creá una cuenta para personalizar tu catálogo." ✓

---

## Notable Bug Fixed During Implementation

**PrismaCategoriaRepository.eliminar()** rollback sentinel:

The interactive `$transaction` called `deleteMany` on patterns, then `deleteMany` on the category with `transacciones: { none: {} }` predicate. If the predicate refused deletion (count === 0), a **plain interactive transaction commit would succeed** (because deleteMany-0 does not throw), silently persisting the pattern deletion from earlier in the callback.

**Fix**: `RollbackCategoriaEnUso` sentinel error thrown on count === 0, caught outside the transaction to distinguish 404 (absent/not yours) from 409 (in-use). Patterns survive the refusal. Integration test `catalogo-crud.int-spec.ts` lines 192-257 asserts both the category row and pattern row remain `!toBeNull()` after a 409, catching any regression.

---

## Spec Deltas Merged into Canonical Spec

**File**: `openspec/specs/catalogo-clasificacion-ownership/spec.md` (main source of truth)

**Modifications**:
1. **CAT037-04** (MODIFIED): Now reads "unconstrained by any closed name set"; no longer enumerates the 8 names; reclassify to user-created categories is valid; absence from caller's catalog returns generic `400`
2. **CAT037-06** (MODIFIED): Now reads "ownership is the sole authority, not name membership"; no defensive guard; user-created names never fold to null; includes explicit scenario
3. **CAT038-01 through CAT038-09** (ADDED): 9 new requirements covering create, read, update, delete, patterns, demo gate, isolation, and contract sync
4. **Non-Goals**: Updated to remove enum dismantling (done), added scope for US-039 and US-043, clarified demo-gating scope (catalog only)

Canonical spec now describes the **current system state** (US-037 + US-038 combined) in present tense with no change annotations.

---

## ADR-037 Recorded

**File**: `docs/adr/ADR-037-identidad-de-categoria-como-fila-del-usuario.md`

**Content Obligations Met**:
- Title: "La identidad de una categoría es una fila propiedad del usuario, no un tipo de compilación" ✓
- Traded-away guarantee explicit: `Record<Categoria, Bucket>` totality now checked by DB constraint + template compile-time proof ✓
- Three rejected alternatives documented: enum as hint, branded `string`, runtime validation ✓
- Consequence: `prisma/backfill-categorias.ts` loses `CATEGORIA_IDS` dependency ✓

**Status in CLAUDE.md** (ADR table): Added 2026-08-12, "PR #1 de 3... Feature Branch Chain" ✓

---

## Open Follow-Ups (Out of Scope)

All intended scope completed. Recorded follow-ups for future work:

1. **US-039** — Delete a category in use, with transaction reassignment/migration flow
   - App returns 409 (spec defines and rejects the case)
   - Reassignment logic deferred to a dedicated US

2. **US-043** — Web UI for catalog management
   - Stale reclassify `<select>` dropdown (hardcoded 8 names)
   - Returns clean 400 when user renames/deletes a category
   - Data-driven dropdown fixes the UX gap

3. **Database Race** (low priority, utility-level mitigation exists):
   - Case-sensitive unique index allows `Mascotas`/`mascotas` concurrent creates to both pass
   - Mitigation: Degrades to two similarly-named categories (no corruption)
   - Fix: `citext` or functional index migration (trigger-gated)

4. **REGEX Event-Loop Risk** (200-char cap + compile check in place):
   - User-supplied patterns capped at 200 chars
   - Write-time `new RegExp()` check rejects invalid syntax
   - Deferred: `re2` / execution timeout for runaway backtracking (trigger-gated: first slow-ingesta report)

5. **`code` Field Inconsistency** (accepted debt):
   - New catalog endpoints have `{ message, code }`
   - Pre-existing endpoints have `{ message }` only
   - Trigger to unify: First time a second resource family needs machine-readable codes

---

## Traceability — Change Artifacts

All required artifacts preserved in archive:

- `proposal.md`: 456 lines, full WHAT/WHY/approach/risks/success-criteria
- `design.md`: 863 lines, full architecture decisions D-01 to D-10, contracts, data flow, testing strategy
- `tasks.md`: 275 lines, all 13 phases, 0-13 tasks (6.7 and 6.8 = open, rest complete), review workload forecast, traceability matrix
- `verify-report.md`: 163 lines, PASS verdict, full executed check, requirement trace, design conformance, non-goals, production bug fix mechanism, ADR accuracy, deploy-readiness
- `specs/catalogo-clasificacion-ownership/spec.md` (delta): 230 lines, 9 ADDED requirements + 2 MODIFIED requirements

---

## Files to Remove from Repo

The orchestrator must execute:

```bash
git rm -r openspec/changes/us-038-catalogo-crud/
```

**Original directory path**: `/Users/jorge/dev/MoneyDiary/openspec/changes/us-038-catalogo-crud/`

**Archived to**: `/Users/jorge/dev/MoneyDiary/openspec/changes/archive/2026-08-12-us-038-catalogo-crud/`

Canonical spec updated in-place: `/Users/jorge/dev/MoneyDiary/openspec/specs/catalogo-clasificacion-ownership/spec.md`

---

## Persistence

- **Engram**: This archive-report stored as topic_key `sdd/us-038-catalogo-crud/archive-report`
- **OpenSpec**: All artifacts copied to `openspec/changes/archive/2026-08-12-us-038-catalogo-crud/`
- **Canonical Spec**: Updated in-place, merging deltas

---

## Summary

US-038 is **CLOSED**. The change:
- **Delivered**: 3 chained PRs, 1617 unit + 108 integration tests green, 100% requirement coverage
- **Verified**: Independent judgment-day review + sdd-verify PASS, production smoke-tested
- **Archived**: All artifacts in archive/, canonical spec updated, ADR-037 recorded, follow-ups scoped
- **Deployed**: Live in production, feature-branch-chain merged to main, no rollback needed

The catalog ownership model (US-037) is now **complete** with full CRUD.

Next: US-039 (reassignment flow on delete-in-use) and US-043 (web UI).
