# Archive Report — US-039: Delete a category that is in use, after a warning

**Change**: `us-039-eliminar-categoria-en-uso`
**Issue**: [#273](https://github.com/Juargo/MoneyDiary/issues/273)
**Archived**: 2026-08-12
**Status**: COMPLETE — merged to main (PR #310, commit `d899642`), production deployment rolling out

---

## Executive Summary

US-039 has been fully planned, designed, implemented, verified, and is now archived. The feature allows users to delete a category even if transactions reference it, atomically nulling the category labels while preserving transactions and their budget buckets. The change includes a pre-delete impact preview (`transaccionesCount` in the catalog listing) and comprehensive test coverage proving the money-safety invariant (the 50/30/20 resumen is byte-identical before and after). Zero CRITICAL or WARNING issues in verification. All 32 implementation tasks completed. Production readiness confirmed.

---

## Delivery Summary

**Single PR**: PR #310, branch `feat/us-039-eliminar-categoria-en-uso`, head commit `d899642`

**Size exception accepted**: 906 lines added, 246 lines removed across 26 files (net +660). Four work-unit commits (S1–S4) plus one post-merge judgment-day fix commit.

**No chain**: Splitting this into multiple PRs was explicitly rejected in the design phase. The count-only PR and delete-semantics PR would each be independently non-valuable. The safest approach is a single PR with test churn (the bulk of the diff) and a sentinel removal protected by mandatory docblocks.

**Delivery strategy**: `size-exception` — the 400-line budget was forecast to trip, and the exception was accepted up front because the alternative (chained PRs) would add no value and double the contract regeneration.

---

## Quality Gates

| Gate | Status | Evidence |
|------|--------|----------|
| All 32 implementation tasks complete | PASS | All checkboxes flipped; spot-checked against code |
| Verification: zero CRITICAL | PASS | `verify-report.md` line 13 |
| Verification: zero WARNING | PASS | `verify-report.md` line 13 |
| Verification: SUGGESTION (non-blocking) | PASS | 1 SUGGESTION; documented and understood |
| Test suite green: unit | PASS | 1618 tests across 203 files, `pnpm api test` |
| Test suite green: integration | PASS | 112 tests across 21 files, `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration` |
| Type check green | PASS | `pnpm api exec tsc --noEmit`, `pnpm --filter @moneydiary/api-client exec tsc --noEmit` |
| Contract drift | PASS | `pnpm api openapi:check` green; `openapi.json` and api-client types regenerated and committed |
| Design conformance | PASS | All design decisions (D-01 through D-06) implemented; Q1–Q5 resolutions verified |
| Judgment-day review | PASS | Approved after 2 rounds; one DB-level fix commit (`77c3881`) hardened the CA-05 cross-tenant isolation test |
| Demo-gate regression | PASS | `catalogo-demo-gate.int-spec.ts` confirmed unmodified and green |
| Production readiness | PASS | No migration required; database schema already supports the change; no data transformation needed |

---

## Key Decisions & Trade-offs

### 1. The CA-04 Rewrite — Why Money Safety Is Structural, Not Behavioral

**Original criterion** (issue #273): "the month summary reflects the change"

**Problem**: Under the chosen design (nulling only `categoriaId`, keeping `bucketId`), this criterion would be *vacuously* true — the resumen "reflects the change" by not changing. Any test comparing before/after payloads that are identical would pass, even if both were broken or empty.

**Rewritten criterion**: "Deleting a category does not move money between buckets. `/api/resumen`, bucket subtotals, percentages, and semáforo are identical before and after."

**Production evidence** justifying this choice:
- 434 of 508 transaction rows (85%) are already `categoriaId IS NULL` with a real `bucketId` and already count toward the 50/30/20
- `bucketId` is the documented source of truth; no money math reads `categoriaId`
- Nulling the bucket too would create two indistinguishable "Sin categoría" states with different budget behavior

**Test proof**: `catalogo-delete-en-uso.int-spec.ts` asserts concrete BigInt-safe string totals (`Deseos.total === '23000'`) on BOTH sides of the delete (before and after), making CA-04 falsifiable rather than vacuous. The income row is mandatory; without it, `sinIngreso:true` would null every percentage and degenerate the comparison.

### 2. The Sentinel Removal — Why It's Safe (And Why the Docblock Must Carry the Reasoning)

**Removed** (was architecture complexity):
- `RollbackCategoriaEnUso` sentinel
- `transacciones: { none: {} }` predicate
- Interactive `$transaction` with a follow-up `findFirst`
- `CategoriaEnUsoError` class and its HTTP mapping

**Why safe**: With the predicate gone, `parent.count === 0` can only mean "absent" or "not owned". In both cases the child `deleteMany` also matched zero rows, because:
- `PatronClasificacion` carries a composite FK `(categoriaId, userId) → Categoria(id, userId)`
- Both `deleteMany` statements gate on the same `userId`
- Therefore zero parent ⇒ zero children, by database constraint

**Critical docblock**: The repository's `eliminar()` method carries a verbatim docblock stating all three load-bearing claims (children-first is mandatory, zero-parent ⇒ zero-children requires same `userId` in both WHEREs, and the FK does the nulling). Dropping `userId` from the child WHERE without updating this docblock would reintroduce the cross-tenant pattern-deletion hazard `PrismaEliminarIngestaRepository` guards against. This is enforced by unit test assertion (2.5) that checks the child `WHERE` deep-equals `{ categoriaId: id, userId }` exactly.

### 3. One Shape, One Mapper, One Schema — Why `transaccionesCount` Everywhere

`CategoriaDto` is documented as "ÚNICA forma HTTP de una categoría", used by GET, POST, and PATCH responses. Rather than fork the shape ("list has the count, writes don't"), the field is threaded through all three responses and all four repository read paths (listar, buscarPorId, crear, actualizar). Cost:
- `POST` always returns `transaccionesCount: 0` (true, not special-cased)
- `buscarPorId` (used by write operations as an existence check) pays one single-row subquery it doesn't read

Benefit:
- One DTO, one schema, one OpenAPI ref
- Compile-enforced `transaccionesCount` is a required field on `CategoriaConPatrones`
- Any producer forgetting the count is a compile error, not an `undefined` on the wire

### 4. No Migration, No Explicit Nulling

**Prisma schema unchanged**:
- `categoriaId String?` with `onDelete: SetNull` was already in place
- `bucketId String?` was already in place

**FK does the work**: When a `Categoria` row is deleted, Postgres's `onDelete: SetNull` automatically nulls `categoriaId` on all referencing `Transaccion` rows. No explicit `updateMany({ categoriaId: null })` is added.

**Why not duplicate the mechanism**: The `actualizar()` repository does explicitly re-stamp `bucketId` in the same transaction because `bucketId` has no relation to `Categoria` and no database mechanism maintains it. Here the database mechanism is stronger than an application mechanism could be, and adding both would be worse (two mechanisms, one a subset of the other, with no way to test the difference). The integration test (CA-02) pins the **behavior** (`categoriaId IS NULL` after delete), not the mechanism, so the guarantee holds regardless of future implementation.

---

## Spec Merge Summary

**Delta spec applied to** `openspec/specs/catalogo-clasificacion-ownership/spec.md`:

| Action | Lines | Details |
|--------|-------|---------|
| ADDED: CAT039-01 | 319–353 | Category listing reports per-category transaction count, caller-scoped, all-history |
| MODIFIED: CAT038-04 | 355–444 | Delete now succeeds on in-use categories; `409` and `CategoriaEnUsoError` removed; transactions survive with `categoriaId: null`, `bucketId` unchanged; money invariant rewritten and proven |
| REMOVED: Non-Goal | 554 | "delete in use is US-038's non-goal" removed; replaced by reference to CAT039-01 |

**No conflict in canonical spec**: The delta was applied cleanly. The canonical spec now reflects the final contract.

**Issue #273 updated** (production evidence per proposal action item): Updated with the corrected CA-04 wording and an explanatory note clarifying why the original criterion was vacuous.

---

## Integration Proof Highlights

### CA-01: Impact Preview

```
GET /api/categorias
→ 200 { categorias: [{ id, nombre, bucket, patrones[], transaccionesCount: 12 }] }
```

- Count produced in SQL: `_count: { select: { transacciones: { where: { account: { userId } } } } }`
- Scoped in SQL, never in memory (RNF-SEC-006)
- Integration: `catalogo-crud.int-spec.ts` attaches N transactions across periods, asserts count = N
- Isolation: `catalogo-isolation.int-spec.ts` proves A sees only A's counts, never B's

### CA-02 / CA-03: Delete Succeeds, Patterns Cascade Atomically

```
DELETE /api/categorias/:id (in-use)
→ 204
→ category row gone, pattern rows gone (same $transaction)
→ transaction rows survive, categoriaId: null, bucketId: unchanged
```

- `catalogo-crud.int-spec.ts:192` flipped: was `409`, now `204`
- Unit assertion: `$transaction` called with array (children first), parent `WHERE` lacks `transacciones` key
- Integration: DB-level verification of `categoriaId IS NULL` AND `bucketId === original`

### CA-04: Money Invariant (The Heart of This Change)

```
Before delete: GET /api/resumen → { Deseos: { total: '23000', porcentajeBp: 22, estadoGlobal: 'NORMAL' } }
Delete the category
After delete: GET /api/resumen → { Deseos: { total: '23000', porcentajeBp: 22, estadoGlobal: 'NORMAL' } }
```

**The test** (`catalogo-delete-en-uso.int-spec.ts`):
1. Fixture includes income row (else `sinIngreso: true` nulls all percentages)
2. Fixture includes two spend transactions in the Deseos category
3. **Before**: Assert concrete values — `total === '23000'` (string, BigInt-safe), `porcentajeBp` is a number, `estadoGlobal` non-null
4. **Delete**: Category removed; DB confirms both transactions survive with `categoriaId: null`, `bucketId: BUCKET_IDS[Deseos]`
5. **After**: Assert `expect(despues).toEqual(antes)` AND re-assert same concrete values independently

Without the concrete assertions on both sides, the test would pass if both payloads were identically broken (both empty, both `sinIngreso`). The anti-vacuity pattern is load-bearing.

### CA-05: Cross-Tenant Isolation

```
User A DELETE → /api/categorias/B_CATEGORY_ID
→ 404 (deleteMany on parent with WHERE {..., userId: A} matches 0)
→ User B's category, patterns, transactions untouched
```

- Both `deleteMany` statements gate on the same `userId`
- Unit test (2.5) pins the child `WHERE` deep-equals `{ categoriaId, userId }` exactly
- Integration (`catalogo-isolation.int-spec.ts`) proves B's data survives after A's delete attempt
- Bonus: post-merge fix commit `77c3881` added a pattern to B's category so the test actually exercises the child `deleteMany` (previously vacuous — no patterns to delete)

---

## Production Verification

Performed 2026-08-12 against `https://api.moneydiary.cl` after the deploy landed (`GET /version` → commit `d899642`).

**Verified live:**

| Check | Result |
|---|---|
| CAT039-01 — `transaccionesCount` in the listing | `GET /api/categorias` returned all 8 categories, **all 8 carrying `transaccionesCount`** |
| Demo gate still covers DELETE | `DELETE /api/categorias/:id` from a demo session → **403** `DEMO_SOLO_LECTURA` with the register-account message |
| Real user's data untouched by the smoke test | Bucket totals identical before and after: `deseos` 72 tx / 923752 · `ingreso` 56 tx · `necesidades` 2 tx / 24900 · `sincategoria` 300 tx / 11806784; 74 transactions with a category; 8 categories |

**Deliberately NOT executed in production: the destructive delete path.**

Exercising a real delete would have required the owner's session (the demo path is blocked by design) and would have **permanently destroyed one of the real user's categories** — this change's own rollback plan states a delete is not recoverable by `git revert`; only a Supabase point-in-time restore recovers the lost `categoriaId` labels. Destroying real labelled data to demonstrate a feature is not a trade the deploy verification should make unilaterally.

That path's coverage rests on:
- `catalogo-delete-en-uso.int-spec.ts` — runs against a real Postgres, asserts concrete BigInt totals on both sides of the delete with an income row in the fixture (so `sinIngreso: true` cannot degenerate the comparison), and asserts each transaction keeps its original `bucketId`.
- `catalogo-isolation.int-spec.ts` — cross-tenant delete attempt returns 404 with the other user's category, transaction and **pattern** surviving; that pattern assertion was **proven to discriminate** (dropping `userId` from the child `deleteMany` makes it fail), reproduced independently by both judgment-day judges.

If an end-to-end production confirmation is wanted later, the safe procedure is for the account owner to create a throwaway category, attach a movement to it, and delete it from their own session — never one of the catalog's real categories.

---

## Known Follow-ups

| Item | Issue | Reason |
|------|-------|--------|
| **US-043** | Build the web UI (delete button, confirm dialog, `transaccionesCount` display) | API contract is now stable; UI was deferred from this change intentionally |
| **Cross-tenant `Transaccion.categoriaId` FK** | Consider adding composite `(categoriaId, userId)` FK if any cross-tenant reference is ever observed in production | Unproducible today (every writer is `userId`-scoped); documented as an explicit trigger for future work |
| **`transaccionesCount` precision** | Schema uses `z.number()` not `z.number().int().nonnegative()` | Documented trade-off: layer-honesty rule says domain rules don't duplicate in transport schemas. `prioridad` is also `z.number()`. Consistency wins. |
| **Delete recovery** | Supabase PITR is the only recovery for accidentally deleted categories | By design: deletion is irreversible by `git revert`; the `transaccionesCount` warning is the UX safeguard. Database-level recovery only. |

---

## Artifacts in Archive

All five artifacts from the change have been archived under `openspec/changes/archive/2026-08-12-us-039-eliminar-categoria-en-uso/`:

| Artifact | Lines | Purpose |
|----------|-------|---------|
| `proposal.md` | 419 | Business case, binding decisions, acceptance criteria, rollback plan, proposal question round |
| `design.md` | 659 | Five open questions resolved, six architecture decisions (D-01–D-06), module/layer map, transactional guarantees, contracts |
| `tasks.md` | 98 | Four work units (S1–S4), 32 implementation tasks, non-negotiables |
| `verify-report.md` | 147 | Verification verdict (PASS), completeness metrics, all executable proofs, requirement coverage, deploy-readiness checklist |
| `specs/catalogo-clasificacion-ownership/spec.md` | 164 | Delta spec: CAT039-01 ADDED, CAT038-04 MODIFIED, non-goals unchanged |

**Canonical spec updated**: The delta was applied to `openspec/specs/catalogo-clasificacion-ownership/spec.md` as part of S4 (commit `640c41e`). The canonical spec now contains the final requirements and is the source of truth going forward.

---

## Traceability

For future reference, if this change needs to be re-examined or rolled back:

1. **Proposal phase** — Issue #273, binding decisions documented in `proposal.md`
2. **Design phase** — All load-bearing reasoning in `design.md` (especially Q4 docblock, D-01 through D-06)
3. **Implementation** — Four work-unit commits (S1–S4) plus fix commit `77c3881`
4. **Verification** — `verify-report.md` with line-by-line spot-checks and anti-vacuity proof
5. **Integration with canon** — Spec delta applied cleanly; no conflicts

The mandate docblock in `prisma-categoria.repository.ts:174-206` carries the invariant that must be maintained: both `deleteMany` WHEREs must gate on the same `userId`, or the composite FK's safety guarantee fails.

---

## Closing Note

This change demonstrates the power of refusing to split work that would produce two non-valuable PRs. The 906 added lines (mostly tests and the new CA-04 spec) and 246 deleted lines (sentinel, predicate, HTTP error mapping) are safest reviewed together, with a clear story: "here's why the sentinel is dead, here's the proof the hazard won't return, here's the test that makes CA-04 falsifiable instead of vacuous." A split into two PRs would obscure that narrative and double the contract regeneration risk.

The feature is production-ready. Pending deploy smoke test verification.
