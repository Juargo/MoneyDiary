# Tasks — US-005 Detección de datos duplicados

> SDD change: `us-005-deteccion-duplicados` · Phase: tasks · Store: hybrid
> Engram topic: `sdd/us-005-deteccion-duplicados/tasks`
> Reads: spec (obs #342) + design (obs #343)
> Strict TDD is ACTIVE — every implementation task is preceded by its failing test task.
> Legend: **[T]** = test task (write failing test first) · **[I]** = implementation task (make it pass) · **(parallel)** = no dependency on sibling tasks in the same group.

---

## Group 0 — Domain (pure key function)

- [x] **0.1 [T]** Write `apps/api/src/domain/value-objects/clave-duplicado.spec.ts`: identical tuples → identical key; differ by fecha/descripcion/cargo/abono → different key; BigInt exactness (`(5000n).toString()` vs `String(5000)` match; near `Number.MAX_SAFE_INTEGER` matches exactly; ±1 unit differs); delimiter safety (`descripcion` containing `|` does not create a false collision); exact-match semantics (case/whitespace differences are NOT equal — no normalization).
  - Maps to spec scenarios: "Different descripcion is not a duplicate", "All five fields match is a duplicate", "Money comparison is BigInt-exact".
  - Depends on: none.
- [x] **0.2 [I]** Implement `apps/api/src/domain/value-objects/clave-duplicado.ts` — `ClaveDuplicadoInput` (`fecha: Date`, `descripcion: string`, `cargo: string`, `abono: string`) + `construirClaveDuplicado(input): string` = `${fecha.getTime()}|${cargo}|${abono}|${descripcion}`. Pure, no imports of Prisma/NestJS/`Result`, never throws.
  - Depends on: 0.1 (must fail first).

## Group 1 — Application: reader port + detection use case

- [x] **1.1 [I] (parallel with 1.3)** Define `apps/api/src/application/ports/transaccion-existente-reader.port.ts` — `TransaccionExistente` type (`fecha: Date`, `descripcion: string` plaintext, `cargo: bigint`, `abono: bigint`) + `ITransaccionExistenteReader.buscarPorCuentaYRango(accountId, fechaDesde, fechaHasta): Promise<Result<ReadonlyArray<TransaccionExistente>, PersistenciaFallidaError>>` + export const `TRANSACCION_EXISTENTE_READER = 'ITransaccionExistenteReader'`. Pure interface, no test needed (no behavior).
  - Depends on: 0.2 (imports nothing from it directly, but is consumed by 1.2/1.3 which do).
- [x] **1.2 [T]** Write `apps/api/src/application/use-cases/detectar-duplicados.use-case.spec.ts` using a fake `ITransaccionExistenteReader`:
  - empty batch → `ok`, reader NOT called, `duplicadas: 0`.
  - reader returns `[]` → all `nuevas`, `duplicadas: 0` (CA-04 / "Zero duplicates").
  - partial overlap (N of M) → correct partition, `nuevas` preserves input order and excludes matches ("N of M rows are duplicates").
  - full overlap (all M) → `nuevas: []`, `duplicadas: M` ("All rows are duplicates").
  - reader `Result.fail` → use case returns `fail` (conservative — nothing persists later).
  - min/max range passed to the reader equals the true batch min/max fecha (fake asserts call args).
  - two txns differing by 1 unit of money → both `nuevas` ("Money comparison is BigInt-exact").
  - cross-user isolation is NOT this use case's job (it trusts `accountId` scoping) — assert the reader is called with the given `accountId` only, no extra filtering.
  - Depends on: 1.1 (needs the port shape to build the fake).
- [x] **1.3 [I]** Implement `apps/api/src/application/use-cases/detectar-duplicados.use-case.ts` — `DetectarDuplicadosInput` (`accountId`, `transacciones: ReadonlyArray<Transaccion>`), `DetectarDuplicadosResult` (`nuevas`, `duplicadas: number`), `DetectarDuplicadosUseCase.execute()` per design §3.3 algorithm (empty-guard → min/max → reader call → build `Set<clave>` via `construirClaveDuplicado` with `row.cargo.toString()`/`row.abono.toString()` → partition incoming via `String(tx.cargo)`/`String(tx.abono)` preserving order → `Result.ok({nuevas, duplicadas})`).
  - Depends on: 1.2 (must fail first), 0.2.

## Group 2 — Application: commit contract change (persist layer)

- [x] **2.1 [T]** Extend `apps/api/src/application/ports/ingesta-repository.port.ts` test coverage is via `PersistTransactionsUseCase` spec (no dedicated port test — interfaces have no behavior). Update the existing `apps/api/src/application/use-cases/persist-transactions.use-case.spec.ts` (or create if none exists — verify first) to assert: `execute()` threads a new `duplicadosOmitidos: number` input field into `ingestaRepository.commit(ingestaId, accountId, transacciones, duplicadosOmitidos)`, and `PersistTransactionsResult` echoes `duplicadosOmitidos` back unchanged.
  - Maps to: CA-03 ("N of M rows are duplicates", "All rows are duplicates").
  - Depends on: none (can run parallel with Group 1).
- [x] **2.2 [I]** Modify `apps/api/src/application/ports/ingesta-repository.port.ts` — `commit(ingestaId, accountId, transacciones, duplicadosOmitidos: number)`. Modify `apps/api/src/application/use-cases/persist-transactions.use-case.ts` — `PersistTransactionsInput` gains `duplicadosOmitidos: number`; `execute()` passes it to `commit(...)`; `PersistTransactionsResult` gains `duplicadosOmitidos: number` echoed from input (not re-read from `commit`'s return, since `commit` only returns `{ total }`).
  - Depends on: 2.1 (must fail first).

## Group 3 — Application: orchestrator wiring

- [x] **3.1 [T]** Extend `apps/api/src/application/use-cases/process-ingesta.use-case.spec.ts` (verify existing file first) with a fake `DetectarDuplicadosUseCase`:
  - detection runs after normalize, before `persistTransactionsUseCase.execute`; only `nuevas` are passed to persist.
  - `duplicadosOmitidos` is threaded from the detector result into the persist input AND into `ProcessIngestaResult`.
  - `ProcessIngestaResult.total`/`.transacciones` reflect `nuevas` only (imported rows), not the raw incoming batch.
  - detector `Result.fail` short-circuits the pipeline — `persistTransactionsUseCase.execute` is NEVER called, nothing persists (mirrors existing fail-fast tests for earlier steps).
  - zero-duplicate batch → behavior identical to pre-change pipeline except `duplicadosOmitidos: 0` appears in the result (CA-04 regression guard).
  - Depends on: none directly, but conceptually after 1.3/2.2 exist (fake doesn't need real impl).
- [x] **3.2 [I]** Modify `apps/api/src/application/use-cases/process-ingesta.use-case.ts`:
  - Constructor gains `private readonly detectarDuplicadosUseCase: DetectarDuplicadosUseCase` (last collaborator param, per design §3.5).
  - In `runPipeline`, insert the detection step between `normalizeResult` and the existing `persistTransactionsUseCase.execute` call: call `detectarDuplicadosUseCase.execute({ accountId, transacciones })`; on fail, `return Result.fail(...)`; on ok, destructure `{ nuevas, duplicadas }` and pass `transacciones: nuevas, duplicadosOmitidos: duplicadas` into the persist call.
  - `ProcessIngestaResult` interface gains `duplicadosOmitidos: number`; the final `Result.ok({...})` object includes it and uses `nuevas`/`persistResult` values consistently (note: `total`/`transacciones` already come from `persistResult`/local vars — verify they source from `nuevas`, not the pre-dedup `transacciones` array, when wiring this in).
  - Depends on: 3.1 (must fail first), 1.3, 2.2.

## Group 4 — Infrastructure: bounded reader + repository commit write

- [x] **4.1 [T]** Write `apps/api/src/infrastructure/persistence/prisma-transaccion-existente.reader.spec.ts` (unit-level, mocked `PrismaService`/`ICryptoService`, no real DB) — asserts: `findMany` is called with `where: { accountId, fecha: { gte, lte } }` and the expected `select`; returns `Result.ok` mapping rows through `crypto.decrypt(descripcion)`; a thrown Prisma error is caught and returns `Result.fail(PersistenciaFallidaError)`, never throws.
  - Depends on: 1.1 (port shape).
- [x] **4.2 [I]** Implement `apps/api/src/infrastructure/persistence/prisma-transaccion-existente.reader.ts` — `PrismaTransaccionExistenteReader implements ITransaccionExistenteReader`, constructor `(prisma: PrismaService, crypto: ICryptoService)`, `buscarPorCuentaYRango` per design §4 (try/catch, decrypt in infra, bounded `where`).
  - Depends on: 4.1 (must fail first).
- [x] **4.3 [T] (parallel with 4.1)** Extend `apps/api/src/infrastructure/persistence/prisma-ingesta.repository.spec.ts` (verify existing file first — create if none) — asserts `commit(ingestaId, accountId, transacciones, duplicadosOmitidos)` writes `duplicadosOmitidos` inside the SAME `$transaction([...])` array as the existing `ingesta.update` call (no second, non-atomic write).
  - Depends on: 2.2 (signature must exist).
- [x] **4.4 [I]** Modify `apps/api/src/infrastructure/persistence/prisma-ingesta.repository.ts` — `commit` signature gains `duplicadosOmitidos: number` param; add it to the existing `this.prisma.ingesta.update({ data: { ... } })` payload inside the current `$transaction([...])` array. No structural change to the `createMany` call.
  - Depends on: 4.3 (must fail first).

## Group 5 — Migration (additive, no backfill)

- [x] **5.1 [I]** Edit `apps/api/prisma/schema.prisma`: add `duplicadosOmitidos Int @default(0)` to `model Ingesta`; add `@@index([accountId, fecha])` (non-unique) to `model Transaccion`. Run `pnpm api exec prisma migrate dev --name add_duplicados_omitidos_and_transaccion_account_fecha_index`. Verify the generated SQL has no unique constraint and no index on `descripcion`.
  - **Apply note (sdd-apply, Slice 2)**: no `DATABASE_URL`/`.env` in this worktree, so `migrate dev` could NOT be run. Migration hand-authored (`20260721000000_add_duplicados_omitidos_and_transaccion_account_fecha_index/migration.sql`), verified only via `prisma validate` + `prisma generate` (schema-level, no live DB needed). Mirrors the precedent set by `20260719010000_drop_patron_bucketid`. NOT applied to any database — flag before merge/deploy.
  - Depends on: none structurally, but should land before Group 4 integration tests run against a real DB; safe to do any time before Group 8.
  - Not a TDD task (schema/migration, no unit test — verified by Group 8 integration tests).

## Group 6 — Composition root wiring

- [x] **6.1 [I]** Modify `apps/api/src/infrastructure/http/ingesta.module.ts`:
  - Add a `useFactory` provider for `TRANSACCION_EXISTENTE_READER` → `new PrismaTransaccionExistenteReader(prisma, crypto)`, `inject: [PrismaService, CRYPTO_SERVICE]` (mirrors the `INGESTA_REPOSITORY` provider pattern).
  - Add a plain-class provider for `DetectarDuplicadosUseCase` → `useFactory: (reader) => new DetectarDuplicadosUseCase(reader), inject: [TRANSACCION_EXISTENTE_READER]`.
  - Add `detectarDuplicadosUseCase` as a new constructor arg + `inject` entry on the existing `ProcessIngestaUseCase` provider (last position, matching 3.2's constructor order).
  - No dedicated unit test (composition root is exercised end-to-end by Group 8 integration tests + existing e2e `test/ingesta.e2e-spec.ts`, which will fail to boot if wiring is wrong — acts as the safety net).
  - Depends on: 3.2, 4.2.

## Group 7 — DTO + web wiring

- [ ] **7.1 [T] (parallel with 7.3)** Write/extend a DTO-unit test for `apps/api/src/infrastructure/http/dto/ingesta-response.dto.ts` (e.g. `ingesta-response.dto.spec.ts` — create if none exists) — asserts `aIngestaResponseDto` maps `data.duplicadosOmitidos` to `duplicadosOmitidos` in the output, and `totalTransacciones` still equals `data.total` (imported count, meaning unchanged).
  - **Flag:** the spec's literal scenario "Response shape reflects counts" (line 61 of spec.md) names fields `totalTransacciones = M` (total incoming) + `transaccionesImportadas = M - N`. The design (§5.1/§9, a documented flagged refinement) instead keeps `totalTransacciones` = imported count (`data.total`, unchanged meaning from current code) and does NOT add `transaccionesImportadas` (would duplicate `totalTransacciones`). Write this test against the **design's** field semantics, not the spec's literal scenario — see Risks below.
  - Depends on: 3.2 (needs `duplicadosOmitidos` on `ProcessIngestaResult`).
- [ ] **7.2 [I]** Modify `apps/api/src/infrastructure/http/dto/ingesta-response.dto.ts` — `IngestaResponseDto` gains `duplicadosOmitidos: number`; `aIngestaResponseDto` maps `data.duplicadosOmitidos`.
  - Depends on: 7.1 (must fail first).
- [ ] **7.3 [T] (parallel with 7.1)** Write a web-unit test (vitest + RTL) in `apps/web/src/components/SubirCartola.test.tsx` (verify existing test file name first) — banner text ("Se importaron X, se omitieron Y duplicados") is rendered inside the `estado === 'exito'` section when `duplicadosOmitidos > 0`; banner is ABSENT when `duplicadosOmitidos === 0` (CA-04).
  - Depends on: none (can mock the DTO shape directly).
- [ ] **7.4 [I]** Modify `apps/web/src/api/types.ts` — add `readonly duplicadosOmitidos: number` to `IngestaResponseDto`. Modify `apps/web/src/components/SubirCartola.tsx` — inside the existing `estado === 'exito'` `<section>` (after the `<dl>` block, before the transaction preview `<ul>`), add a conditional banner rendered only when `mutation.data.duplicadosOmitidos > 0`, styled with Serene Finance tokens (not raw Tailwind), non-destructive/informational styling, no new focus trap or aria-live region (reuses the section's existing focus management).
  - Depends on: 7.3 (must fail first), 7.2.

## Group 8 — Integration tests (gated `ALLOW_DESTRUCTIVE_DB=1`)

- [x] **8.1 [T+I]** Write `apps/api/test/prisma-transaccion-existente.reader.integration-spec.ts` (or equivalent existing integration-test location — verify convention first) against a real (test) DB:
  - **Apply note**: written as `apps/api/test/prisma-transaccion-existente-reader.int-spec.ts` (matches the repo's actual convention, `test/**/*.int-spec.ts` per `vitest.int.config.ts`, not `integration-spec.ts`). Could NOT be executed in this environment (no `DATABASE_URL`/`.env` in this worktree) — flag for a run against a real dev DB before merge.
  - returns only rows within `(accountId, fecha ∈ [min, max])` — range boundary is respected.
  - `descripcion` comes back decrypted (plaintext round-trips through `NoOpCryptoService`).
  - **Cross-user isolation (RNF-SEC-006 / ISO)**: a second user's account with an identical-looking row is never returned when querying the first user's `accountId` — maps directly to spec scenario "Cross-user isolation".
  - Depends on: 4.2, 5.1 (migration applied).
- [x] **8.2 [T+I]** Write an end-to-end re-upload integration test (extend `apps/api/test/ingesta.e2e-spec.ts` or add a new integration spec — verify convention first): upload the same statement twice via the real pipeline (`ProcessIngestaUseCase` or the HTTP endpoint) →
  - **Apply note**: written as a new `apps/api/test/ingesta-duplicados.int-spec.ts`, driving the full `ProcessIngestaUseCase` pipeline directly (not HTTP) to avoid coupling to the auth-gated e2e flow. Could NOT be executed in this environment (no DB) — flag for a run before merge.
  - 2nd import persists **0** new transaction rows.
  - `Ingesta.duplicadosOmitidos = N` on the 2nd ingesta row.
  - The 1st ingesta and its rows remain **untouched** (read-only NFR — no update/delete on pre-existing rows).
  - Response reports `totalTransacciones = 0`, `duplicadosOmitidos = N` for the 2nd upload.
  - Maps to spec scenarios: "N of M rows are duplicates", "All rows are duplicates", "Bounded lookup performance" (assert completion is fast; full 10k-row timing is a manual/perf follow-up, not asserted in this integration test at MVP scope).
  - Depends on: 6.1, 5.1.
- [x] **8.3 [T+I] (parallel with 8.1/8.2)** Extend the atomic-commit integration test (existing `PrismaIngestaRepository` integration coverage, if any — verify) to assert `commit(...)` writes `duplicadosOmitidos` on the `Ingesta` row in the same transaction as the insert (no partial-write / non-atomic follow-up call).
  - **Apply note**: added to existing `apps/api/test/prisma-persistence.int-spec.ts` (also fixed 5 pre-existing `commit()` call sites for the new 4-arg signature). Could NOT be executed in this environment (no DB) — flag for a run before merge.
  - Depends on: 4.4, 5.1.

## Group 9 — DoD close-out (sequential, last)

- [x] **9.1 [I]** Run `pnpm api test` (all unit tests green, including Groups 0–4/7.1-7.2 above). **Slice 2: 103 files / 822 tests GREEN** (Groups 7.1/7.2 still pending, Slice 3).
- [ ] **9.2 [I]** Run `pnpm web test` (Group 7.3-7.4 green). Pending — Slice 3 (web untouched in Slice 2).
- [x] **9.3 [I]** Run `pnpm api exec tsc --noEmit` — no type errors across the new/modified files. **Slice 2: zero errors.**
- [ ] **9.4 [I]** Run Group 8 integration tests with `ALLOW_DESTRUCTIVE_DB=1` against the test DB (never Supabase real — ADR-021). **Written but NOT executed** — no `DATABASE_URL`/`.env` in the Slice 2 apply worktree. Must run before merge.
- [ ] **9.5 [I]** Manual/CLI verification: re-run `pnpm api cli -- ./test/fixtures/<any real fixture>.xlsx` twice against a real account and confirm the 2nd run reports omitted duplicates (optional cosmetic follow-up per design §11 risk table: CLI output line for `duplicadosOmitidos` — nice-to-have, not required for DoD). CLI output line added in Slice 2 (`ingestar.ts`); actual manual re-run against a real DB not performed (no DB access).
- [x] **9.6 [I]** Conventional Commits across the change; confirm no secrets/raw money values leak into any error message (existing scrub convention, unchanged). **Slice 2: 7 commits on `feat/us-005-duplicados-2-infra`**, no raw amounts in new error paths (reuses existing `PersistenciaFallidaError`/scrub conventions).

---

## Task count summary

- **34 tasks total**: 15 test tasks **[T]** (0.1, 1.2, 2.1, 3.1, 4.1, 4.3, 7.1, 7.3, plus 8.1/8.2/8.3 each counted as combined T+I integration tasks = 3 more, totaling 11 pure-unit test tasks + 3 T+I integration tasks = 14... see exact breakdown below), 14 implementation tasks **[I]**, 1 migration task, 6 DoD close-out tasks.

Exact breakdown by checkbox: **13 [T]** unit/DTO/web test tasks, **3 [T+I]** integration tasks (test-first against real DB), **12 [I]** implementation tasks, **1** migration task (no dedicated unit test), **6** DoD close-out tasks. Total **35 checkboxes**.

## Parallelization

- **Group 1 (1.1) and Group 2 (2.1)** can start in parallel — independent contracts (reader port vs. commit signature).
- **Group 4 (4.1) and Group 4 (4.3)** can run in parallel — independent files (new reader vs. existing repository).
- **Group 7 (7.1) and Group 7.3** can run in parallel — backend DTO vs. web component, independent stacks.
- **Group 8 (8.1, 8.2, 8.3)** can run in parallel once their prerequisites land — independent integration specs.
- Everything else is **sequential** within its group (test before implementation, per Strict TDD), and groups themselves are dependency-ordered: 0 → 1 → {2, 3} → 4 → 5 → 6 → 7 → 8 → 9. Group 5 (migration) must land before any Group 8 test runs against a real DB, and should land before Group 4's integration-flavored tests if run against real Postgres (4.1/4.3 above are unit-level with mocks, so they do NOT block on 5.1; only Group 8 strictly requires 5.1 first).

---

## Review Workload Forecast

- **Estimated total changed lines:** ~550–650 (backend: 1 new domain file ~30 lines + spec ~60 lines; 1 new port ~30 lines; 1 new use case ~50 lines + spec ~90 lines; 1 new infra reader ~40 lines + spec ~40 lines; ~4 modified files — `persist-transactions.use-case.ts`, `process-ingesta.use-case.ts`, `prisma-ingesta.repository.ts`, `ingesta.module.ts` — each +5-15 lines plus their spec deltas ~30-50 lines each; `ingesta-response.dto.ts` +5 lines + spec ~20 lines; `schema.prisma` +2 lines + migration SQL file; web `types.ts` +1 line + `SubirCartola.tsx` +15-20 lines + test +40 lines; integration specs ~150-200 lines across 3 files).
- **Exceeds 400 lines:** Yes.
- **Chained PRs recommended:** Yes.
- **Suggested PR-slice boundary** (natural domain→application→infra→web split, matches design §10's affected-files table):
  - **PR1 — Backend core (domain + application):** Groups 0, 1, 2, 3 (`clave-duplicado.ts`, `transaccion-existente-reader.port.ts`, `detectar-duplicados.use-case.ts`, `persist-transactions.use-case.ts` mod, `process-ingesta.use-case.ts` mod + all their specs). No DB, no wiring yet — pure logic, fully unit-tested, smallest independent review surface.
  - **PR2 — Backend infra + migration + composition root:** Groups 4, 5, 6 (`prisma-transaccion-existente.reader.ts`, `prisma-ingesta.repository.ts` mod, schema migration, `ingesta.module.ts` wiring) + Group 8 integration tests. Depends on PR1 merged/stacked.
  - **PR3 — DTO + web banner:** Group 7 (`ingesta-response.dto.ts`, web `types.ts`, `SubirCartola.tsx` + tests). Depends on PR1 (needs `duplicadosOmitidos` on `ProcessIngestaResult`) — can stack after PR1 or PR2, whichever lands first; does not need PR2's DB changes to compile (DTO reads from application result, not DB directly), only needs a real backend for its own e2e/manual verification.
  - Group 9 (DoD close-out) closes each PR individually plus a final full-suite pass on the last PR.
  - `delivery_strategy: ask-on-risk` — **STOP before implementation and ask the user** whether to proceed as 3 chained PRs (and which chain strategy: `stacked-to-main` vs `feature-branch-chain`) or accept a `size:exception` single PR.

## Risks

- **Spec/design field-shape mismatch (flagged, not a blocker):** spec.md's literal "Response shape reflects counts" scenario names `totalTransacciones = M` (total incoming) + `transaccionesImportadas = M - N`, but design.md (§5.1/§9, an explicitly flagged refinement) keeps `totalTransacciones` = imported count (unchanged from current code) and drops `transaccionesImportadas` as redundant. Tasks 7.1/7.2 follow the **design's** semantics (source of truth per SDD dependency order: design refines locked decisions). Flagging this so the user can confirm the DTO field-naming refinement is acceptable before PR3 ships — if the stakeholder actually wants the literal 3-field shape (incoming/imported/omitted as 3 distinct numbers), that's a small DTO tweak, not a redesign.
- **Reader failure fails the whole ingesta (500):** intentional, conservative design choice (§11) — no partial import ever, small blast radius. Not a bug, but worth confirming ops/UX is fine with a full 500 on a transient DB hiccup during dedup lookup rather than a softer degrade (categorization already has a degrade path; dedup deliberately does not, since dedup failure risks silent duplicate persistence).
- **Constructor-order coupling:** `ProcessIngestaUseCase` now takes 14 constructor args; wiring in `ingesta.module.ts` (task 6.1) must keep `inject` array order in exact sync with the constructor — no dedicated unit test catches an order mismatch (NestJS DI would inject wrong types silently in the worst case, though TypeScript's positional typing should catch most mismatches at compile time). The existing e2e spec is the real safety net here.
- **Group 8 integration-test file locations are unverified** — several tasks say "verify existing convention first" because the exact existing integration/e2e file naming pattern wasn't fully audited in this phase (only `test/ingesta.e2e-spec.ts` was confirmed to exist). `sdd-apply` should locate/confirm exact file names before creating new ones to avoid duplicate coverage.

**Next recommended:** `sdd-apply` (pending the delivery-strategy chained-PR decision above, given the >400-line forecast).
