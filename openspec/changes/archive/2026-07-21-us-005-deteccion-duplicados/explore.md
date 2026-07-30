# Exploration — US-005 Detección de datos duplicados

> SDD change: `us-005-deteccion-duplicados` · Phase: explore · Store: hybrid
> Engram topic: `sdd/us-005-deteccion-duplicados/explore` (obs #337)

## Source of truth (Obsidian ficha)

`03 Product Backlog/01 Epic - Ingesta de datos/US-005 Detección de datos duplicados.md`

- MoSCoW: **Must Have**. Estado: 🔵 Por Hacer.
- **Duplicate key ALREADY DECIDED by stakeholder (2026-05-14, Opción A)**: `cuenta + fecha + descripcion + cargo + abono` — exact match on all 5 fields. NOT a whole-file hash (Opción C, explicitly deferred).
- **CA-01**: on confirm-upload, if 1+ records already exist per the duplicate criterion, show a warning with the COUNT of duplicates BEFORE persisting.
- **CA-02**: user must be able to choose: (a) ignore duplicates and import only new records, or (b) cancel the entire import.
- **CA-03**: if user chooses "ignore", only non-existing records persist; ingesta history reflects imported vs omitted counts.
- **CA-04**: no duplicates → no warning, normal flow continues.
- Non-goals: no merge/update of existing records; no cleanup of pre-existing duplicates; no full-file hash detection (future).
- NFR: detection completes in **<3s for files up to 10,000 rows**. Read-only, must not mutate existing data.
- Accepted limitation (stakeholder-documented): two genuinely identical transactions same day/account/desc/amount collide; one is treated as duplicate/dropped. Accepted for MVP.
- **Dependencies (from the ficha)**: "Bloqueada por: US-003 (Vista previa)" + US-002 (done). **US-003 is Should Have, 🔵 Por Hacer, NOT implemented.**

## Current state (codebase)

The pipeline today is **single-shot, not preview/confirm**. `apps/api/src/application/use-cases/process-ingesta.use-case.ts` (`ProcessIngestaUseCase.runPipeline`) runs, in one `POST /api/ingestas` request:

```
IngestFile → DetectBank(+PDF) → AccountRepository.ensure → ValidateStructure
  → NormalizeTransactions → PersistTransactionsUseCase.execute (createPending → commit atomic insert)
  → runCategorizacion (best-effort island)
```

There is no confirm round-trip and no server-side preview step — the file is validated, normalized AND persisted in the same call. Web `SubirCartola.tsx` posts directly via `useIngesta()` and only previews the **already-persisted** response (first 5 rows). This conflicts with CA-01/02's "before proceeding / user chooses" because US-003 (the gate this US is blocked by) does not exist yet.

- **Canonical transaction shape** (`apps/api/src/domain/value-objects/transaccion.ts`): `{ fecha: Date, descripcion: string, cargo: number, abono: number }` — emitted by `NormalizeTransactionsUseCase`, BEFORE accountId is attached and BEFORE persistence mapping.
- `PersistTransactionsUseCase.execute` receives `{ accountId, banco, nombreArchivo, transacciones }` → `IIngestaRepository.commit(...)` → `PrismaIngestaRepository.commit` does one `prisma.$transaction([createMany, ingesta.update→PROCESADA])` — atomic, all-or-nothing today.
- **Prisma schema**: `Transaccion { id, ingestaId, accountId, fecha, descripcion, cargo BigInt, abono BigInt, bucketId?, categoriaId?, creadoEn }`. `Account @@unique([userId, banco, tipoCuenta, numeroCuenta])`. **No unique constraint/index on the duplicate key today** — pure query-time comparison unless an index is added for the NFR.

### Non-obvious gotchas

- **Encryption forward-compat**: `transaccion.mapper.ts` (`aPersistencia`) already routes `descripcion` through `ICryptoService.encrypt()` (currently `NoOpCryptoService` identity, US-011 task 11.6 deferred, ADR-013). Duplicate comparison MUST decrypt-and-compare in the application layer — never query/index ciphertext-adjacent plaintext. A `WHERE descripcion = X` works today (plaintext) but WILL BREAK once real encryption ships.
- **userId isolation (RNF-SEC-006)**: the natural key already includes `accountId`, which is user-scoped by construction via `Account @@unique([userId, ...])`. Scoping duplicate lookups by `accountId` is correct and sufficient — matches `prisma-movimientos-mes.repository.ts`.

## Affected areas

- `application/use-cases/process-ingesta.use-case.ts` — orchestration insertion point (before persist).
- `application/use-cases/persist-transactions.use-case.ts` + `IIngestaRepository.commit` — needs a pre-filtered list or a richer contract reporting what was skipped.
- `infrastructure/persistence/prisma-ingesta.repository.ts` — hosts the duplicate-lookup query.
- `prisma/schema.prisma` — candidate index `(accountId, fecha)`; `descripcion` must NOT be indexed as-is.
- `infrastructure/http/ingesta.controller.ts` + response DTO — needs duplicate/omitted-count field.
- `apps/web/src/components/SubirCartola.tsx` + `api/use-ingesta.ts` — the confirm/choice UI overlaps with unbuilt US-003.
- No mobile ingesta UI in scope (US-033 separate, in flight).

## Approaches

1. **Full CA-faithful two-phase flow (analyze-then-confirm)** — split into dry-run "analyze" (no persist) + "confirm" (persist non-duplicates). Pros: matches CA-01/02/03 literally, effectively absorbs US-003. Cons: highest effort, new pending-batch state, widens scope into "vista previa". **Effort: High.**
2. **Single-request warn+auto-skip (no cancel round-trip)** — keep one call; before persist, filter incoming batch to non-duplicates, persist only new rows, report `{ totalTransacciones, duplicadosOmitidos, transaccionesImportadas }`. Pros: fits current pipeline, delivers CA-01/03/04 fully, small reviewable diff. Cons: does NOT satisfy CA-02 literally (no pre-persist cancel gate). **Effort: Medium.**
3. **Domain-only duplicate detector as isolated port + use case** (orthogonal pattern) — `IDuplicateChecker` port + `DetectarDuplicadosUseCase` returning `Result<{ nuevas, duplicadas }>`, infra does one bounded batched query + in-memory compare on the key. Pros: Clean-Architecture-correct, testable in isolation (TDD), avoids `createMany` aborting on first collision. Cons: must bound the query by incoming date range to hit the NFR. **Effort: Medium.** Combinable with #2.

## Recommendation

**Approach 2 (single-request warn+auto-skip)** implemented via the **Approach 3 pattern** (dedicated port + use case + in-memory compare against a bounded date-range query), with **CA-02's "cancel whole import" explicitly flagged as a scope gap for the proposal phase** — not silently dropped.

Rationale: US-005 is blocked-on-paper by US-003, which does not exist. Building the full two-phase flow (Approach 1) would effectively deliver US-003 first (a Should-Have, out of scope) and roughly doubles effort. Approach 2 delivers the Must-Have value (duplicate count visible, duplicates never silently re-imported, history reflects imported/omitted) with a single-PR-reviewable footprint aligned to the existing pipeline and `Result<T,E>` conventions.

## Duplicate-key implementation notes

- Key: `accountId + fecha + descripcion + cargo + abono`, all 5, exact match. Already decided — do not re-litigate.
- Compare `cargo`/`abono` as exact BigInt (post `aBigIntEntero`) — never float.
- `descripcion` compared in PLAINTEXT before `encrypt()`; read existing rows through `decrypt()` (identity today). No plaintext DB index on `descripcion`.
- Bound the query: fetch existing rows for `accountId` where `fecha ∈ [min, max]` of the incoming batch, then compare in-memory.
- No new unique DB constraint — a unique index would abort the whole `createMany` on first collision (opposite of CA-03).

## Migration impact

- Likely a new **non-unique** index `Transaccion(accountId, fecha)` for the bounded range query — additive, no backfill.
- No changes to `Account`, `Ingesta` (unless CA-03 summary needs a persisted `duplicadosOmitidos` field — open question), `Categoria`, `BucketPresupuesto`.

## Open questions for the proposal phase

1. **CA-02**: literally implement "cancel whole import" (blocks on US-003-like UI), or descope/reinterpret for this MVP slice? Must be explicit.
2. CA-03 summary: new `Ingesta.duplicadosOmitidos` field or derived on read?
3. Where does the warning render on web — inline in `SubirCartola.tsx` success panel, or a distinct non-blocking banner/modal (ficha says "banner o modal no bloqueante")?
4. Is the accepted same-day-identical-transaction limitation still acceptable given Sprint 2–9 usage?

## Risks

- **Scope creep** from the CA-02/US-003 overlap.
- **Encryption forward-compat** if description comparison is done at the DB level.
- **Performance** if the duplicate query isn't bounded by date range.
- **`createMany` atomicity** conflicts with a DB-constraint approach.

## Next recommended

`sdd-propose` — with the CA-02/US-003 scope-boundary question resolved with the user first.
