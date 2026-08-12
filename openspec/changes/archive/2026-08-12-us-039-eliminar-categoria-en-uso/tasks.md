# Tasks: US-039 — Delete a category that is in use, after a warning

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 550–700 (source ~120 net-negative; unit specs ~180; integration ~260 incl. new ~200-line spec; generated ~40) |
| 400-line budget risk | High |
| Chained PRs recommended | No — splitting yields two non-independently-valuable PRs (count-only PR no client reads; delete-semantics PR with no warning data); bulk is test churn, the safest kind of diff |
| Suggested split | Single PR, 4 internal work-unit commits (S1–S4 below), each ending on a green bar |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| S1 | `transaccionesCount` threaded port→repo→DTO→schema→OpenAPI, purely additive | Single PR, commit 1 | Nothing breaks; CA-01 |
| S2 | Delete semantics: narrow port, remove sentinel/predicate, docblock | Single PR, commit 2 | CAT038-04 |
| S3 | Integration proof (flip + isolation + new CA-04 spec) | Single PR, commit 3 | CA-02/03/04/05 |
| S4 | Spec sync (openspec delta) | Single PR, commit 4 | Docs only |

---

## Phase 1: Impact count (S1 — additive, CAT039-01)

- [x] 1.1 [RED] `prisma-categoria.repository.spec.ts` — `listarConPatrones()`: `_count` filter is `{account:{userId}}`; mapper maps `_count.transacciones` 12→`transaccionesCount:12` and 0→`0` (never `undefined`). Verify: `pnpm api test`
- [x] 1.2 [GREEN] `prisma-categoria.repository.ts` — replace module-level `CATEGORIA_INCLUDE` const with `categoriaInclude(userId)` helper; `CategoriaRow` gains `_count:{transacciones:number}`; `aCategoriaConPatrones` maps it. Design §3.3/Q2.
- [x] 1.3 `categoria-repository.port.ts` — add **required** `readonly transaccionesCount: number` to `CategoriaConPatrones` (compile-enforced). Design D-06.
- [x] 1.4 Flip 4 `include` assertions (listar/buscarPorId/crear/actualizar) to expect `_count:{select:{transacciones:{where:{account:{userId}}}}}` — design 6.1 item #6. Verify: `pnpm api test`
- [x] 1.5 Unit: `crear()` returned DTO carries `transaccionesCount:0` sourced from the include, not hard-coded.
- [x] 1.6 `http/dto/categoria.dto.ts` — add `transaccionesCount` to `CategoriaDto`/`aCategoriaDto`; update `categoria.dto.spec.ts` (non-zero count passes through unchanged).
- [x] 1.7 `categorias.schema.ts` — add `transaccionesCount: z.number()` to `categoriaResponseSchema`; update `categorias.schema.spec.ts` to parse the **real** mapper output with a non-zero count (sync guarantee).
- [x] 1.8 Add `transaccionesCount` to fixtures in `listar-catalogo`/`crear-categoria`/`actualizar-categoria`/`crear-patron` `*.use-case.spec.ts` (compile-only, required field). Verify: `pnpm api exec tsc --noEmit`
- [x] 1.9 `openapi-document.ts` — `categoriasListOperation` description mentions `transaccionesCount` (CAT039-01). No `409` change yet.
- [x] 1.10 Regenerate contract: `pnpm api openapi:emit && pnpm --filter @moneydiary/api-client generate`; verify `pnpm api openapi:check` + api-client typecheck green.
- [x] 1.11 Integration CA-01: extend `catalogo-crud.int-spec.ts` — category with N attached transactions reports `transaccionesCount:N`; untouched sibling reports `0`. Verify: `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration`

**Commit**: `feat(api): add transaccionesCount to category listing (CAT039-01)`

## Phase 2: Delete semantics — sentinel removal (S2 — CAT038-04)

- [x] 2.1 [RED] Narrow `eliminar()` return to `Promise<Result<void, CategoriaNoEncontradaError>>` in the port; narrow `EliminarCategoriaError` union in the use case. This intentionally breaks the build.
- [x] 2.2 Run `pnpm api exec tsc --noEmit` and record every failing site — this is the forced cleanup list (D-04). Do not grep for references.
- [x] 2.3 Delete `domain/errors/categoria-en-uso.error.ts` + its spec.
- [x] 2.4 Rewrite `prisma-categoria.repository.ts` `eliminar()`: array-form `$transaction` — `patronClasificacion.deleteMany({categoriaId:id,userId})` THEN `categoria.deleteMany({id,userId})`; delete `RollbackCategoriaEnUso`, the `transacciones:{none:{}}` predicate, and the follow-up `findFirst`.
  - **GUARD (design Q4, mandatory — same commit as 2.4, not a follow-up)**: ship the verbatim docblock replacing the sentinel's, carrying all three claims: (1) children-first is mandatory because `PatronClasificacion.categoria` has no `onDelete` ⇒ default `Restrict`; (2) sentinel/predicate removal is safe because zero-parent ⇒ zero-children is a DB guarantee via the composite FK `(categoriaId,userId)→Categoria(id,userId)` **only if both `deleteMany` WHEREs share the same `userId`** — state this invariant explicitly, dropping `userId` from the child WHERE reopens the cross-tenant delete `PrismaEliminarIngestaRepository` guards against; (3) FK `onDelete:SetNull` nulls `categoriaId`, `bucketId` is never touched. Do not paraphrase away the invariant sentence.
- [x] 2.5 [RED→GREEN] Unit `eliminar()`: `$transaction` called with an **array**; child `deleteMany` WHERE deep-equals `{categoriaId:'cat-1',userId}` **exactly** (pins the Q4 invariant — dropping `userId` must fail this test); parent WHERE deep-equals `{id:'cat-1',userId}` (no `transacciones` key); count 1 ⇒ `Result.ok`; count 0 ⇒ `Result.fail(CategoriaNoEncontradaError)`; `categoria.findFirst` never called. CAT038-04/Q4. Verify: `pnpm api test`
- [x] 2.6 `makePrismaMock` — collapse dual-mode `$transaction` fake to array-only; update its docblock (design 6.1 #7).
- [x] 2.7 `catalogo-http-error.ts` — remove `CategoriaEnUsoError` import + the `409 CATEGORIA_EN_USO` branch; the `never` exhaustiveness guard forces completeness (D-04). Update `catalogo-http-error.spec.ts`.
- [x] 2.8 `categorias.routes.spec.ts:211` — replace the `409` case with **`404 CATEGORIA_NO_ENCONTRADA`** on `DELETE` (NOT `204` — that case already exists at :196; this covers the error path, not a duplicate happy path). Design 6.1 #9.
- [x] 2.9 `eliminar-categoria.use-case.spec.ts` — delete the 409-propagation case; keep demo-gate (repository never called), 404-propagation, delegation cases. Rewrite the use case's stale "US-039 non-goal" docblock (D-05).
- [x] 2.10 Rewrite port `eliminar()` docblock: replace "el rechazo por 'en uso' es atómico" with the children-first + composite-FK contract.
- [x] 2.11 `openapi-document.ts` — `categoriasDeleteOperation`: drop the `'409'` response entry; rewrite description (no rejection wording; state survive-with-null-`categoriaId`, no money moves).
- [x] 2.12 Regenerate contract: `pnpm api openapi:emit && pnpm --filter @moneydiary/api-client generate`; `pnpm api openapi:check` + api-client typecheck green.
- [x] 2.13 `pnpm api test && pnpm api exec tsc --noEmit` green.

**Commit**: `feat(api): delete succeeds on in-use categories, remove sentinel (CAT038-04)`

## Phase 3: Integration proof (S3)

- [x] 3.1 Flip `catalogo-crud.int-spec.ts:192` — delete-in-use ⇒ `204`; category + pattern gone; transaction row survives, `categoriaId:null`, `bucketId` unchanged (its original value). CA-02/CA-03.
- [x] 3.2 Extend `catalogo-isolation.int-spec.ts`: (a) A/B same-named categories, A's `GET` shows only A's counts; (b) A `DELETE`s B's real id ⇒ `404`, B's category/patterns/transactions untouched. CA-05.
- [x] 3.3 Create `test/catalogo-delete-en-uso.int-spec.ts`, scaffolded from `catalogo-rebucket.int-spec.ts` (per-run `USER_ID`, seeded catalog, `AesGcmCryptoService`, mid-month UTC dates, full `afterAll` teardown).
  - **GUARD (design §6.4, mandatory — CA-04 anti-vacuity)**: fixture MUST include one income row — omitting it makes `sinIngreso:true`, nulling every `porcentajeBp`/`estadoGlobal` and degenerating the comparison to two empty payloads. Two transaction rows (`cargo:15000n`/`8000n`) on the seed's Delivery/Deseos category.
    1. **before**: `GET /api/resumen`, assert **concrete BigInt-safe values** — `Deseos.total === '23000'` (string), `porcentajeBp` is a number, `estadoGlobal` non-null; snapshot into `antes`.
    2. **delete**: `DELETE` the category ⇒ `204`; assert directly in DB both rows survive with `categoriaId:null`, `bucketId` unchanged.
    3. **after**: `GET /api/resumen` again, `expect(despues.body).toEqual(antes)` **AND** re-assert the same concrete values from step 1 — a bare deep-equal alone is satisfiable by two identically-broken/empty payloads.
- [x] 3.4 Confirm `catalogo-demo-gate.int-spec.ts` is untouched and green (D-05) — a diff there fails review.
- [x] 3.5 `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration` green.

**Commit**: `test(api): integration proof for in-use delete + resumen stability (CAT038-04)`

## Phase 4: Spec sync + full green bar (S4)

- [x] 4.1 Apply delta to `openspec/specs/catalogo-clasificacion-ownership/spec.md`: add CAT039-01, replace CAT038-04, remove "delete in use is US-038's non-goal" from Non-Goals.
- [x] 4.2 Update issue #273's CA-04 wording to CAT038-04's corrected criterion (proposal action item).
- [x] 4.3 Full green bar: `pnpm api test && pnpm api exec tsc --noEmit && ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration && pnpm api openapi:check && pnpm --filter @moneydiary/api-client typecheck && pnpm web test` (web run as no-regression check only).

**Commit**: `docs: sync catalogo-clasificacion-ownership spec for CAT039-01/CAT038-04`

---

## Non-negotiables (hand to sdd-apply)

- Both `WHERE`s in `eliminar()` keep `userId` — never drop it, in code or in the 2.5 assertion.
- Q4 docblock ships in the **same commit** as the sentinel removal (2.4), not after.
- `catalogo-demo-gate.int-spec.ts` stays unmodified — verify path still 403 DEMO_SOLO_LECTURA.
- No `transaccion.updateMany({categoriaId:null})` anywhere — rely on the FK (Q5).
- No `prisma/schema.prisma` or migration change. If one appears, STOP and escalate — the design confirms none is needed.
- `openapi.json` + `types.gen.ts` committed with the code that changes them, never as a follow-up.
- Anti-stall: commit after each phase checkpoint (work-unit-commits skill); run test suites **file-scoped** while iterating (e.g. `pnpm api test -- prisma-categoria.repository.spec.ts`), full suites only at phase-end gates.
