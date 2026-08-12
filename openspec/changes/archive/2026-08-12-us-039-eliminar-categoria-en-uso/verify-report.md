# Verification Report — us-039-eliminar-categoria-en-uso

**Change**: `us-039-eliminar-categoria-en-uso`
**PR**: PR #310 -- branch `feat/us-039-eliminar-categoria-en-uso`, head `77c3881`
**Mode**: Strict TDD (per project config)
**Verified against**: canonical spec `openspec/specs/catalogo-clasificacion-ownership/spec.md` (CAT039-01 ADDED, CAT038-04 MODIFIED), `design.md`, `tasks.md`, `apply-progress`
**Context (not re-litigated)**: judgment-day APPROVED after 2 rounds; fix commit `77c3881` added a DB-level proof (pattern survival) of the pattern-deleteMany `userId` invariant in the CA-05 cross-tenant test.

---

## Verdict

PASS

Zero CRITICAL, zero WARNING, 1 SUGGESTION (informational, non-blocking). All 32/32 tasks landed as described, all six required commands ran green with real DB evidence, and the rewritten CA-04 (the heart of this change) is proven with concrete BigInt totals on both sides of the delete, not a vacuous deep-equal.

---

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 32 |
| Tasks complete | 32 |
| Tasks incomplete | 0 |
| Phases | 4/4 (S1 count, S2 delete semantics, S3 integration proof, S4 spec sync) |
| Commits | 4 apply commits (9c9fc73, 8b28256, f695bdd, 640c41e) + 1 judgment-day fix commit (77c3881) |

---

## Executable Proof -- all commands run individually, none chained

| Command | Result | Evidence |
|---------|--------|----------|
| pnpm api test | PASS -- 203 files / 1618 tests passed | Matches apply-progress's reported numbers exactly |
| pnpm api exec tsc --noEmit | PASS -- zero errors | Clean output |
| pnpm api openapi:check | PASS -- no drift | openapi.json esta al dia |
| pnpm web test | PASS -- 61 files / 560 tests passed | No-regression check; matches apply-progress |
| ALLOW_DESTRUCTIVE_DB=1 vitest run --config ./vitest.int.config.ts (serialized -- fileParallelism:false already set in the config) | PASS -- 21 files / 112 tests passed | Ran against docker moneydiary-test-db / moneydiary_test only; matches apply-progress |
| pnpm --filter @moneydiary/api-client exec tsc --noEmit | PASS -- zero errors | Extra check beyond the mandated list, run for completeness |
| git diff main...HEAD -- apps/web apps/mobile apps/api/prisma | PASS -- empty | Zero production changes outside apps/api (excl. prisma); confirms design's 3.5 "confirmed untouched" claim |

Environment notes for reproduction: fresh worktree needed `prisma generate` (no committed client) with DATABASE_URL/DIRECT_URL exported inline before any test command would resolve `.prisma/client/default`; then NODE_ENV=test, API_KEY (>=16 chars), ENCRYPTION_KEY (openssl rand -base64 32), COOKIE_SECURE=false, ALLOW_DESTRUCTIVE_DB=1 for the integration run. No `.env.test` existed in this isolated worktree -- matches apply-progress's own note. Docker `moneydiary-test-db` was already up and migrated (`prisma migrate status` -> up to date, 15 migrations), so no seed/migrate step was needed for these tests (they use per-run fixtures, not the seeded demo/bootstrap user).

---

## Requirement Coverage -- CAT039-01 (ADDED)

| Scenario | Implementation | Test | Result |
|----------|-----------------|------|--------|
| transaccionesCount reflects all-history transactions | categoriaInclude(userId) -> _count.select.transacciones.where:{account:{userId}}, no period filter (prisma-categoria.repository.ts:21-27) | catalogo-crud.int-spec.ts CA-01 case -- attaches N transactions across periods, asserts transaccionesCount:N | COMPLIANT |
| transaccionesCount never counts another user's transactions | Same include, userId-scoped WHERE on the correlated subquery | catalogo-isolation.int-spec.ts describe('Catalog transaccionesCount + delete isolation (CAT039-01, CA-05)') -- A/B same-named categories, A's GET shows only A's counts | COMPLIANT |
| A brand-new category reports zero | crear() uses the same categoriaInclude(userId), so a fresh row's subquery returns 0 | Unit prisma-categoria.repository.spec.ts crear() -- "returned DTO carries transaccionesCount:0 from the include, not hard-coded"; integration CA-01 also asserts an untouched sibling reports 0 | COMPLIANT |

## Requirement Coverage -- CAT038-04 (MODIFIED)

| Scenario | Implementation | Test | Result |
|----------|-----------------|------|--------|
| Deleting an in-use category succeeds and detaches transactions | eliminar() array-$transaction (prisma-categoria.repository.ts:207-224); FK onDelete:SetNull nulls categoriaId, bucketId untouched | catalogo-crud.int-spec.ts:192 (flipped) -- 204; category+pattern gone; transaction survives, categoriaId:null, original bucketId unchanged | COMPLIANT |
| Deleting an unused category still cascades its patterns | Same eliminar() -- children-first, unconditional | Unit prisma-categoria.repository.spec.ts eliminar() "runs an array-form $transaction: patterns deleted FIRST, then the category -- NO in-use predicate" | COMPLIANT |
| Deleting a category never moves money between buckets (CA-04, rewritten) | No statement touches bucketId; only categoriaId is nulled by the FK | catalogo-delete-en-uso.int-spec.ts -- see dedicated section below | COMPLIANT |
| A failed delete leaves category, patterns and transactions untouched | Single $transaction (array form) -- both statements commit or neither does; FK Restrict on PatronClasificacion.categoria forces rollback on a concurrent-insert race | Design 4 "Failure modes" table enumerates this; not independently DB-fault-injected (design explicitly rejects that as not worth building) | COMPLIANT (structural proof, per design's own stated verification strategy) |
| Deleting another user's category id is a 404, and their data is untouched | deleteMany (not delete) on both statements, both gated on the same userId -- zero parent implies zero children by composite FK (categoriaId,userId)->Categoria(id,userId) | catalogo-isolation.int-spec.ts -- A DELETEs B's real id => 404; B's category, pattern (added by fix commit 77c3881), and transaction all confirmed still present | COMPLIANT |
| A demo session cannot delete a category | EliminarCategoriaUseCase.execute() -- demo gate short-circuits before the repository is reached | catalogo-demo-gate.int-spec.ts -- confirmed unmodified (git diff on this path is empty) and passed in the integration run | COMPLIANT |

Compliance summary: 9/9 scenarios (3 CAT039-01 + 6 CAT038-04) compliant, all traced to a real passing test.

---

## The Rewritten CA-04 -- anti-vacuity check (the heart of this change)

apps/api/test/catalogo-delete-en-uso.int-spec.ts, read in full:

- Income row present: the fixture seeds a third transaction with abono:100000n (Ingreso bucket) alongside the two Deseos-bucket rows (cargo:15000n/8000n). Without it, sinIngreso:true would null every porcentajeBp/estadoGlobal and degenerate the comparison -- the spec's own docblock states this explicitly and the fixture honors it.
- Concrete assertions on the "before" side: expect(deseosAntes.total).toBe('23000') (string, BigInt-safe), typeof deseosAntes.porcentajeBp === 'number', antes.estadoGlobal asserted non-null and a string.
- DB-level detach assertions between delete and re-fetch: both transaction rows re-queried directly, categoriaId===null and bucketId===BUCKET_IDS[Bucket.Deseos] (unchanged) -- not inferred from the HTTP response alone.
- Concrete assertions on the "after" side, not just toEqual: expect(despues.body).toEqual(antes) is present, but the test then re-asserts the same concrete values independently (deseosDespues.total==='23000', porcentajeBp and estadoGlobal equality checks) -- exactly the anti-vacuity pattern design 6.4 and tasks 3.3 GUARD mandated. A bare deep-equal alone would be satisfiable by two identically-broken/empty payloads; this test is not exposed to that failure mode.

Verdict on CA-04: proven, not vacuous. This was the explicit risk flagged in the verification brief and it holds up on direct file inspection plus a green run of catalogo-delete-en-uso.int-spec.ts in the integration suite.

---

## Design Conformance Spot-Checks

| Claim | Check | Result |
|-------|-------|--------|
| Both deleteMany gate on the same userId | patronClasificacion.deleteMany({where:{categoriaId:id,userId}}) and categoria.deleteMany({where:{id,userId}}) -- same userId parameter, no rename in between (prisma-categoria.repository.ts:213-217) | Confirmed by source read + pinned by unit test "the child deleteMany WHERE deep-equals {categoriaId, userId} EXACTLY -- pins the Q4 invariant" |
| Mandated docblock present, three claims true | Docblock at prisma-categoria.repository.ts:174-206 is the verbatim text from design.md section 1 Q4 "Mandated docblock" -- claim (1) children-first/FK Restrict, claim (2) zero-parent implies zero-children plus the same-userId invariant sentence, claim (3) FK SetNull nulls categoriaId, bucketId untouched. All three verified against schema.prisma: PatronClasificacion.categoria has no onDelete (default Restrict) at line 176; Transaccion.categoria has onDelete:SetNull at line 199 | Confirmed, verbatim, all three claims schema-true |
| CategoriaEnUsoError deleted with the never guard intact | rg for categoria-en-uso/CategoriaEnUsoError across apps/api/src returns zero hits (class + spec files gone); catalogo-http-error.ts:100 still ends with const _exhaustive: never = error | Confirmed |
| transaccionesCount a required field via categoriaInclude(userId), caller-scoped | CategoriaConPatrones.transaccionesCount:number (non-optional) in the port; categoriaInclude(userId) is a function (not a module const), used identically by all 4 read paths (listarConPatrones, buscarPorId, crear, actualizar) | Confirmed by source read |
| FK onDelete:SetNull does the nulling (no redundant explicit updateMany) | rg for updateMany matching categoriaId:null inside eliminar() returns nothing; the only transaccion.updateMany in the repository is actualizar()'s pre-existing bucketId re-stamp (unrelated, unchanged mechanism) | Confirmed -- no duplicated mechanism added |
| OpenAPI registration append-only | openapi-document.ts diff: categoriasListOperation description extended (additive), categoriasDeleteOperation description rewritten and its '409' response entry removed (a documented, intentional narrowing per design 5.4, verified harmless -- no web/mobile/api-client consumer calls this endpoint) | Confirmed -- the only non-additive change is the deliberate, design-recorded 409 removal |

---

## Non-Goals Respected

- No bulk reassignment to another category anywhere in the diff.
- No prisma/schema.prisma or migration file touched -- confirmed by git diff main...HEAD -- apps/api/prisma (empty) and prisma migrate status reporting "up to date" with the same 15 migrations as main.
- No apps/web or apps/mobile file changed -- confirmed by git diff main...HEAD -- apps/web apps/mobile (empty). US-043 territory untouched.

---

## Tasks Ledger Honesty -- spot-checked

32/32 checkboxes flipped in openspec/changes/us-039-eliminar-categoria-en-uso/tasks.md (main-repo copy, since this artifact lives outside the isolated worktree's git history per apply-progress's own note). Spot-checked against actual code, not taken on faith:

- 1.1-1.11 (count, Phase 1): categoriaInclude(userId) helper, required transaccionesCount field, DTO/Zod/OpenAPI threading, and CA-01 integration case -- all present and passing.
- 2.1-2.13 (delete semantics, Phase 2): port narrowed to Promise<Result<void, CategoriaNoEncontradaError>>, categoria-en-uso.error.ts (+spec) deleted, array-$transaction rewrite with the mandated docblock, never-guard cleanup in catalogo-http-error.ts, categorias.routes.spec.ts:211 now asserts 404 (not a duplicate 204) -- all present and passing.
- 3.1-3.5 (integration proof, Phase 3): flipped CRUD case, extended isolation spec (further hardened post-hoc by the judgment-day fix commit), new catalogo-delete-en-uso.int-spec.ts, demo-gate spec confirmed untouched -- all present and passing.
- 4.1-4.3 (spec sync, Phase 4): canonical spec at openspec/specs/catalogo-clasificacion-ownership/spec.md carries CAT039-01 and the replaced CAT038-04 verbatim identical to the change's delta spec; issue #273 confirmed updated with the corrected CA-04 wording and an explanatory note (verified live via gh issue view 273).

No discrepancy found between the ledger and the code state.

---

## Deploy-Readiness Checklist

| Item | Status |
|------|--------|
| Database migration required | No. prisma/schema.prisma is untouched; categoriaId String? + onDelete:SetNull + bucketId String? were already in place before this change. |
| Schema/migration diff present | None -- confirmed empty. |
| CI-equivalent checks reproduced locally | pnpm api test, pnpm api exec tsc --noEmit, pnpm api openapi:check, pnpm web test, integration suite -- all green, matching the numbers apply-progress already reported. |
| Contract drift | None -- openapi.json and api-client types regenerated and committed with the code (task 1.10/2.12), both drift gates green. |
| Demo-gate regression | Verified green and file untouched. |
| Web/mobile blast radius | Zero -- no client reads this endpoint yet (US-043 builds the UI against this contract later). |
| Irreversibility warning | This is the one item that matters most before merge. Deleting a category is NOT recoverable by git revert. A git revert of this PR only restores the 409 refusal for future deletes -- any category actually deleted while this code was live is gone, and every transaction that referenced it has permanently lost its categoriaId label (rows, amounts, dates, and bucketId all survive intact; only the label is gone). The only recovery path for past deletes is a Supabase point-in-time restore, a database operation, not a deploy action. This is called out explicitly in the proposal's own Rollback plan and is not mitigated by anything in the code -- it is a property of the feature, and CA-01's transaccionesCount warning is the intended (client-side, not yet built) safeguard. |
| Ready to merge from a verification standpoint | Yes -- no CRITICAL or WARNING blocking issues found. |

---

## Issues Found

CRITICAL: None

WARNING: None

SUGGESTION:
1. The "failed delete leaves everything untouched" scenario (CAT038-04) is verified structurally (Postgres transaction atomicity + the design's own documented failure-mode table) rather than by an integration test that actually injects a mid-transaction failure. The design explicitly weighed this and rejected fault injection as "not worth building" given the unit-level pinning of statement order and shape -- a reasonable call, but worth naming as the one CA-04-adjacent scenario without a dedicated runtime reproduction, should a future regression in transaction semantics ever need debugging.

---

## Assertion Quality (Strict TDD)

No trivial/tautological assertions found in the reviewed test files (prisma-categoria.repository.spec.ts eliminar()/listarConPatrones() blocks, catalogo-delete-en-uso.int-spec.ts, catalogo-isolation.int-spec.ts, catalogo-crud.int-spec.ts). All eliminar() unit assertions call the production method and assert on real mock call arguments (toHaveBeenCalledWith with concrete WHERE shapes), not toBeDefined()/toBeTruthy() placeholders. The CA-04 integration spec asserts concrete BigInt-safe string totals rather than shape-only checks, as detailed above.

Assertion quality: All assertions verify real behavior.
