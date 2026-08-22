# Proposal: US-058 — Register a manual movement (type first)

- **Change**: `us-058-registro-manual`
- **Issue**: [#292](https://github.com/Juargo/MoneyDiary/issues/292) · Milestone `Sprint-15` · `must` · `epic:gestion-datos`
- **Status**: Proposed (2026-08-21)
- **Requires new ADR**: No under ADR-005/011/024/026/036/037. **But** approach C introduces a durable persistence semantics (nullable `ingestaId` + explicit `origen` column + per-user sentinel `Account`) that reshapes what a `Transaccion` row *is* (no longer always ingesta-born). Design phase decides whether that deserves an ADR row (amending ADR-026's "ingesta is the only write path" framing). Not assumed here.

## Intent

Let the backend **register a single movement typed by hand**, with no cartola, so a user can record income or an expense the bank file never captured (cash, a transfer outside the imported accounts, a correction).

The interaction is **type first**:

1. **Ingreso** → the backend auto-classifies it: `abono > 0`, `cargo = 0`, `bucket = Ingreso`, `categoriaId = null`. The client is **never asked** for a bucket or a categoría (CA-02).
2. **Gasto** → a cascade: the client picks a **bucket** (Necesidades / Deseos / Ahorro), then a **categoría that belongs to that bucket** from the user's **own** catalog (ADR-036/037). An inconsistent combination — a categoría that exists but lives in another bucket, or one outside the user's catalog — is a **400** (CA-03).

A manual movement lands as a real `Transaccion` that **feeds the month resumen, the 50/30/20 percentages and the semáforo automatically** (CA-05, ADR-024 — the backend owns the money math, the client only renders), and is **identifiable as origin "Manual"** so US-052's Origen column can show where it came from (CA-04).

This change is **backend only**: `POST /api/movimientos`. The web form (US-060) and the mobile form (US-061) consume it later.

## Why now

1. **Import is the only way money enters the system today.** Everything in the DB came from a cartola (`Ingesta` → `Transaccion`). Cash, a Redcompra the file missed, a manual correction — none of it can be recorded. The 50/30/20 picture is only as complete as the bank files, which is a real gap for a personal-finance tool.
2. **The per-user catalog just made this safe and meaningful.** ADR-036/037 gave every user their own `Categoria`/`PatronClasificacion` set with a fixed `(categoria, bucket)` binding. Manual gasto classification can now validate against *that user's* catalog with the exact `listarConPatrones` + `Map<categoriaId, Bucket>` pattern US-057 established — no new validation machinery.
3. **US-052 already reserved the seam.** US-052's Origen column derives origin from the account join and **already anticipates a `'Manual'` value** — today it is dead code because every account has a real bank name. US-058 makes that value real and turns a latent design affordance into a shipped capability.
4. **It unblocks the client stories in this epic.** US-060 (web manual form) and US-061 (mobile manual form) both need this endpoint. Neither can be built without it.

## Apply precondition (sequencing — binding decision 1)

**This change is planned now (propose → spec → design → tasks) but APPLY starts from post-merge `main`, only after the US-057 chain (PRs #449–#454) merges.** US-058 reuses artifacts that live **only on the US-057 chain branches today**, not on `main`:

- `CategoriaFueraDeCatalogoError` (domain error, gasto validation).
- The `ICategoriaRepository.listarConPatrones(userId)` + `Map<categoriaId, Bucket>` validation pattern (from `CommitIngestaUseCase`).
- `TransaccionAPersistir` (evaluated in Approach §1 — the manual write likely does **not** need it).

> **Correction to the exploration (`sdd/us-058-registro-manual/explore`):** its dependency claim "US-057 already merged to main / `TransaccionAPersistir` is live on main" is **wrong** — the explorer read the pr6 working tree. Reality: the US-057 chain is **open**; those symbols exist only on chain branches. Everything else the exploration reports (schema NOT NULL facts, the `account:{userId}` isolation chain, encryption at the mapper, US-052 Origen derivation) is valid — those files are identical on `main` and the chain.

Planning does not touch code, so it is safe now. Tasks/apply must branch from `main` after the chain lands and re-validate that the three reused symbols are present.

## Scope

### In scope

- **Domain validation of a manual movement (CA-01).** A value object / entity path that enforces: money via `BigInt` (exact, never `float`), overflow guards on the `number → BigInt` boundary (reuse `transaccion.mapper.ts` guards), Ingreso invariant (`abono > 0 && cargo === 0`), Gasto invariant (`cargo > 0 && abono === 0`), and **fecha ≤ today** (past or today only, unlimited backfill — binding decision 4; future ⇒ 400). All failures via `Result<T,E>`, never a throw.
- **Ingreso auto-classification (CA-02).** The use case sets `bucket = Ingreso`, `categoriaId = null` **by construction** from the fact that the caller said "Ingreso" and supplied `abono`. `CategorizarTransaccionUseCase` is **not** invoked (YAGNI — there is nothing to infer).
- **Gasto cascade validation (CA-03).** Load the caller's catalog via `listarConPatrones(userId)`, build the `Map<categoriaId, Bucket>`, then reject: (a) a `categoriaId` outside the map → `CategoriaFueraDeCatalogoError` (reused); (b) a `categoriaId` in the map whose bucket ≠ the requested bucket → **new** `BucketCategoriaNoConcuerdaError` (fixed, scrub-safe message). Both surface as **400**.
- **Persistence — approach C (binding decision 2).** A migration that (a) relaxes `Transaccion.ingestaId` to **nullable** (US-004 pattern for relaxing NOT NULL), (b) adds an explicit **`origen` column** on `Transaccion`, and (c) ensures a **per-user sentinel `Account(banco='Manual')`** on first manual movement. `accountId` **stays NOT NULL** — the sentinel account carries it, so the `account:{userId}` isolation chain in all 5 readers is **untouched**. See Approach §2 for column semantics and backfill.
- **New narrow persistence port (SOLID/ISP).** `IRegistrarMovimientoManualWriter.registrar(input) → Result<{ id }, PersistenciaFallidaError>` — a single-row writer that ensures the sentinel account and inserts one `Transaccion` with `ingestaId = null`. Reusing `IIngestaRepository.persistirProcesada` is rejected: it would fabricate a fake `Ingesta`, corrupting the "ingesta = file import" semantics.
- **Origin identifiable as "Manual" (CA-04).** The sentinel account's `banco = 'Manual'` is the **single source of truth** that feeds US-052's Origen column with **zero reader changes** (US-052 already derives `fila.banco || 'Manual'` from the account join). The new `origen` column is written for durable provenance / immunity semantics but is **not** the mechanism the UI column reads. See Approach §3 — one source of truth, pinned.
- **Resumen / percentages / semáforo update automatically (CA-05).** No extra work: `PrismaResumenMesRepository`, `PrismaDetalleBucketRepository`, `PrismaMovimientosMesRepository` all filter by `account:{userId}` with **no ingesta filter**. A correctly-persisted row with the right `bucketId` contributes to the month math by construction (ADR-024 — backend computes, client renders).
- **Sentinel account VISIBLE as 'Manual' (binding decision 3).** Wherever the app lists accounts/bancos, the `Manual` sentinel appears like any other — **no filtering**. Consistent with the Origen column.
- **Delete-ingesta immunity (CA-04 durability).** Manual rows have `ingestaId = null`, so `PrismaEliminarIngestaRepository.eliminarConTransacciones` (deletes `Transaccion WHERE ingestaId = :id`) can never reach them. Immune by construction.
- **User isolation + integration test (CA-06, RNF-SEC-006).** Every WHERE scoped by `userId`; the sentinel account is per-user; an integration test proves user B cannot register into, nor read, user A's manual movement. Amounts scrubbed from all error messages (domain + HTTP 400 boundary).
- **Endpoint + contract (CA-06, ADR-011).** `POST /api/movimientos` (authenticated + `x-api-key`; `GET /api/movimientos` already exists — natural REST extension). `openapi.json` gains the request/response schemas.
- **Descripcion encrypted at rest (ADR-013).** The adapter encrypts `descripcion` via the same `ICryptoService.encrypt()` used in `transaccion.mapper.ts:aPersistencia()`, wired from the composition root — no new crypto logic.

### Non-goals (out of scope)

- **Web UI (US-060) and mobile UI (US-061).** This change ships the endpoint, not the forms.
- **Edit / delete of a manual movement.** Out of scope for US-058 (future US). Only *create*.
- **Reclassifying an already-persisted transaction, editing amounts, or deleting ingestas from this path.** Unchanged; ADR-038 keeps those off mobile too.
- **Multi-row manual entry / batch.** One movement per request. `IRegistrarMovimientoManualWriter` is single-row on purpose (YAGNI — no batch requirement exists).
- **Running the categorization engine on Ingreso or Gasto.** Ingreso is trivial by construction; Gasto arrives with an explicit `(bucket, categoriaId)` the caller chose. No inference.
- **A user-facing "account" concept for manual entries.** The sentinel account is an isolation/provenance vehicle, not a feature. Users do not create or name it; it is ensured lazily on first manual movement.
- **Currency / multi-currency, recurring movements, attachments.** None required by US-058.

## Approach

### 1. Does the manual write need `TransaccionAPersistir`? (evaluate — likely no)

`TransaccionAPersistir` (US-057 chain) is the shape `persistirProcesada` consumes for a **batch** of ingesta-born rows. The manual writer inserts **one** row directly and does not go through the ingesta pipeline. Working assumption: the manual writer takes a **small dedicated input** (`{ userId, fecha, descripcion, cargo, abono, bucketId, categoriaId }`) and maps straight to a Prisma `create` — no dependency on `TransaccionAPersistir`. Design confirms; if a field-for-field reuse turns out cleaner without dragging batch semantics, design may adopt it. This is a structure detail, not a product one.

### 2. Persistence — approach C migration (binding decision 2)

Three schema moves, one migration:

```
Transaccion.ingestaId : String  NOT NULL  →  String?  (nullable, US-004 relax pattern; keep onDelete pinned)
Transaccion.origen    : (new)   String?             (provenance column — semantics below)
Account               : ensure one row per user with banco='Manual' on first manual write
                        (accountId on Transaccion stays NOT NULL — sentinel carries it)
```

**`origen` column semantics (design pins the final choice; recommendation below).** Two clean options:

- **(C-a, recommended) `origen String?`, `null = ingesta-born, 'Manual' = manual`.** Additive, no backfill of existing rows required (existing rows stay `null` and *mean* ingesta-born). Cheapest migration; the meaning of `null` is documented in the schema comment.
- **(C-b) `origen String NOT NULL` backfilled to `'Ingesta'` for all existing rows, `'Manual'` for new manual rows.** More explicit (no null-means-something), but forces a **data backfill of every existing `Transaccion`** in the migration and a non-null default. Higher migration cost for marginal clarity.

Recommendation: **C-a** — YAGNI on the backfill; `null` already unambiguously means "came from an ingesta" because `ingestaId` is non-null exactly for those rows. The pairing invariant `(ingestaId IS NULL) ⇔ (origen = 'Manual')` is enforced in application (single writer) and **may** be pinned by a raw-SQL `CHECK` in the migration (Prisma doesn't model CHECK — same technique as the `cargo/abono ≥ 0` check). Design decides whether the CHECK is worth it or the single-writer guarantee suffices.

**Sentinel account.** `IRegistrarMovimientoManualWriter` ensures `Account(userId, banco='Manual', tipoCuenta=<fixed>, numeroCuenta=<fixed sentinel>)` before the insert, idempotently (find-or-create, keyed on the existing `@@unique([userId, banco, tipoCuenta, numeroCuentaBlindIndex])`). It carries `accountId` so the isolation chain is intact and the Origen column reads `banco='Manual'` for free. `numeroCuenta` is a fixed non-sensitive sentinel string; the blind-index/encryption path is reused as-is (no special-casing).

**Why not approach A (virtual account + virtual ingesta) or B (nullable accountId):** A fabricates an `Ingesta` per manual entry (semantic corruption + delete-cascade hazard); B makes `accountId` nullable and breaks the structural `account:{userId}` isolation in 5+ readers, each needing a second isolation path — high blast radius. C keeps `accountId` NOT NULL, adds one column, relaxes one column, and touches **zero** readers for isolation.

### 3. Origin mechanism — one source of truth (CA-04)

US-052's Origen column derives `fila.banco || 'Manual'` from the **account join** (`DetalleBucketRow` / `MovimientoMesRow` paths). Because the manual row's account **is** the sentinel with `banco = 'Manual'`, the column shows "Manual" **without any reader change**. That is the mechanism that **feeds the UI**.

The new `origen` column exists for **durable provenance and the delete-immunity invariant** (and future queries like "show me my manual entries"), **not** as a second thing the Origen column reads. Pinning this to one source avoids the classic drift where the account says one thing and the column says another. Design confirms the Origen column reads only the account-join derivation this sprint.

### 4. Endpoint contract sketch (CA-01/02/03/06)

```
POST /api/movimientos   (authenticated + x-api-key)

Request (JSON):
  # Ingreso
  { "tipo": "Ingreso", "fecha": "2026-08-10", "descripcion": "Reembolso caja chica", "monto": "45000" }
  # Gasto
  { "tipo": "Gasto", "fecha": "2026-08-10", "descripcion": "Feria",
    "monto": "12990", "bucket": "Deseos", "categoriaId": "cat_x" }

  Notes:
  - `monto` is a BigInt-safe STRING (money DTO rule); the use case maps it to abono (Ingreso) or cargo (Gasto).
  - `fecha` is an ISO date; must be ≤ today (future ⇒ 400).
  - Ingreso: bucket/categoriaId MUST be absent (or ignored — design pins strict-reject vs ignore).
  - Gasto: bucket + categoriaId REQUIRED; categoriaId must belong to the caller's catalog AND to `bucket`.

Response 201 (JSON):
  { "id": "txn_...", "fecha": "2026-08-10", "descripcion": "Feria",
    "cargo": "12990", "abono": "0", "bucket": "Deseos", "categoriaId": "cat_x",
    "origen": "Manual" }

Errors (400, amounts scrubbed):
  - future fecha
  - Ingreso with abono ≤ 0 / any cargo; Gasto with cargo ≤ 0 / any abono
  - Gasto categoriaId outside caller's catalog        → CategoriaFueraDeCatalogoError
  - Gasto categoriaId whose bucket ≠ requested bucket  → BucketCategoriaNoConcuerdaError
  - malformed body / overflow on monto
```

The exact request shape (whether `tipo` is discriminated, whether Ingreso strict-rejects stray bucket fields, the 201-vs-200 choice, and the response DTO) is pinned in design; the product rules above are fixed.

### 5. Clean Architecture placement (ADR-005, ADR-024)

- **Domain** (Spanish): `MovimientoManual` value object / factory that enforces the type/money/fecha invariants and returns `Result`; new error `BucketCategoriaNoConcuerdaError`; reuse `CategoriaFueraDeCatalogoError` (chain). No infra imports.
- **Application** (Spanish): `RegistrarMovimientoManualUseCase` orchestrates: build the VO → for Gasto, load `listarConPatrones(userId)` and validate the cascade → hand a single-row input to `IRegistrarMovimientoManualWriter`. New port `IRegistrarMovimientoManualWriter` in `application/ports/`. Returns `Result<…, DomainError | PersistenciaError>` — never throws.
- **Infrastructure** (English): `PrismaRegistrarMovimientoManualRepository` (ensures sentinel account + inserts row + encrypts `descripcion` via `ICryptoService`); `movimientos.routes.ts` gains the `POST` handler + request/response DTOs; `openapi.json` + the TS schema source updated.
- **Composition**: `crear-registrar-movimiento-manual.ts` helper + `container.ts` wiring (new use case + port + crypto + catalog repo).
- SOLID/ISP: the manual writer is a **narrow, single-purpose** port, not a widening of `IIngestaRepository`.

## Migration & backfill plan

| Step | Action | Rollback |
|------|--------|----------|
| M1 | `prisma migrate dev` — `Transaccion.ingestaId` → nullable (relax NOT NULL, US-004 pattern; keep `onDelete` pinned to avoid drift) | Down migration restores NOT NULL **only if** no manual rows exist yet; after manual rows land, rollback must first null-guard or delete them (documented in the migration) |
| M2 | Same migration — add `Transaccion.origen String?` (C-a; no backfill of existing rows — `null` = ingesta-born) | Drop column; additive, clean revert |
| M3 | *(optional, design decides)* raw-SQL `CHECK ((ingestaId IS NULL) = (origen = 'Manual'))` — Prisma doesn't model CHECK | Drop constraint |
| M4 | No schema step — sentinel `Account(banco='Manual')` is **data**, created lazily at runtime by the writer (find-or-create), not by the migration | N/A (per-user rows; harmless if left) |

**Backfill implications.** With C-a there is **no backfill of existing `Transaccion` rows** — they keep `origen = null`, which the schema comment defines as "ingesta-born". If design chooses C-b instead, the migration must backfill every existing row to `'Ingesta'` (single `UPDATE`), which is heavier and is the reason C-a is recommended. The sentinel account is **not** backfilled — it is created on demand per user.

**Rollback posture.** Code-level rollback (removing the endpoint/use case/port) is clean. The **schema** rollback is the only non-trivial part: once a manual row exists, `ingestaId` can't be re-tightened to NOT NULL without handling those rows. Documented in the migration's down step; the change is low-risk because manual rows are additive and isolated.

## Affected areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/prisma/schema.prisma` + new migration | **New/Modified** | `ingestaId` → nullable; add `origen String?`; optional CHECK via raw SQL |
| `apps/api/src/domain/value-objects/movimiento-manual.ts` (or entity path) | New | Type/money/fecha invariants, `Result`, BigInt exact, overflow guards |
| `apps/api/src/domain/errors/bucket-categoria-no-concuerda.error.ts` | New | Gasto cascade mismatch (categoría exists, wrong bucket); scrub-safe fixed message |
| `apps/api/src/domain/errors/categoria-fuera-de-catalogo.error.ts` | **Reused (from US-057 chain)** | Gasto categoría outside caller's catalog |
| `apps/api/src/application/ports/registrar-movimiento-manual.port.ts` | New | `IRegistrarMovimientoManualWriter.registrar(input) → Result<{id}, PersistenciaFallidaError>` |
| `apps/api/src/application/use-cases/registrar-movimiento-manual.use-case.ts` | New | Orchestrates VO + gasto cascade (`listarConPatrones` + `Map<categoriaId,Bucket>`) + single-row write |
| `apps/api/src/infrastructure/persistence/prisma-registrar-movimiento-manual.repository.ts` | New | Ensure sentinel `Account(banco='Manual')` + insert row (`ingestaId=null`, `origen='Manual'`) + encrypt `descripcion` |
| `apps/api/src/infrastructure/http-express/routes/movimientos.routes.ts` | Modified | Add `POST /api/movimientos` handler (GET already exists) |
| `apps/api/src/infrastructure/http/dto/*movimiento-manual*.dto.ts` | New | Request/response DTOs (money as string) |
| `apps/api/src/composition/crear-registrar-movimiento-manual.ts` | New | Wire use case + writer + crypto + catalog repo |
| `apps/api/src/composition/container.ts` | Modified | Add `registrarMovimientoManual` to Container + wiring; mount route in `app.ts` |
| `apps/api/openapi.json` + `infrastructure/http-express/schemas/openapi-json.ts` | Modified | Add `POST /api/movimientos` request/response schemas (ADR-011) |
| `apps/api/test/**` | New | Unit (VO invariants, ingreso auto-class, gasto cascade both error paths, fecha future) + integration (`userId` isolation, persisted row feeds resumen, Origen='Manual', delete-ingesta immunity) |
| `apps/api/src/infrastructure/persistence/prisma-resumen-mes.repository.ts` and the 2 sibling readers | **Unchanged** | `account:{userId}` filter already picks up manual rows (CA-05 free) |
| US-052 Origen derivation (`DetalleBucketRow` / `MovimientoMesRow`) | **Unchanged** | Sentinel `banco='Manual'` feeds the column with zero reader changes |
| `apps/web/**`, `apps/mobile/**` | **Unchanged** | Forms are US-060 / US-061 |
| `docs/adr/` | **Maybe** | Design may add/annotate an ADR row for approach C's persistence semantics |

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Apply starts before the US-057 chain merges** → `CategoriaFueraDeCatalogoError` / `listarConPatrones` missing | Medium | High (build breaks) | Binding decision 1 — apply-precondition stated; tasks re-verify the three symbols exist on `main` (`git show origin/main:<file>`) before writing code |
| **`ingestaId` nullable relaxation regresses delete/dedup logic** that assumed NOT NULL | Medium | High | Follow the exact US-004 relax pattern; keep `onDelete` pinned; integration test that delete-ingesta leaves manual rows untouched; audit `WHERE ingestaId` call sites |
| **Isolation regression** if the sentinel account is mis-scoped | Low | High (RNF-SEC-006) | Sentinel is per-user via `@@unique([userId, banco, tipoCuenta, numeroCuentaBlindIndex])`; every WHERE scoped by `userId`; user-B-into-user-A integration test |
| **Two origin sources drift** (account `banco` vs `origen` column disagree) | Medium | Medium | One source of truth pinned (Approach §3): the Origen column reads the account join only; `origen` column is provenance/immunity, not the UI source; optional CHECK ties the pair |
| **Sentinel account leaks into flows that assume real banks** (e.g. re-import, dedup, strategy detection) | Medium | Medium | Sentinel is only ever produced by the manual writer, never by ingesta; decision 3 makes it visible on purpose; verify dedup/detection never key off `banco='Manual'` |
| **Money precision / overflow on `monto` string → BigInt** | Low | High (money) | Reuse `transaccion.mapper.ts` overflow guards; unit tests for round/sign/`MAX_SAFE_INTEGER`; never `float` |
| **Amounts leak in error messages** | Low | Medium | Scrub amounts at domain and HTTP-400 boundary (existing doctrine); fixed scrub-safe message on `BucketCategoriaNoConcuerdaError` |
| **Ingreso path accidentally asks/accepts a categoría** | Low | Medium (CA-02) | Ingreso classification is by construction `{Ingreso, null}`; design pins strict-reject vs ignore for stray bucket/categoría fields; unit test |
| **Schema rollback after manual rows exist** | Low | Medium | Migration down step documents the null-guard/delete requirement; additive/isolated change keeps risk low |
| **openapi.json drifts from real schema (ADR-011)** | Medium | Medium | Regenerate from the TS schema source; CI contract check |
| **Strict-TDD friction on new port/use case/adapter** | Low | Low | Each lands test-first with fakes; isolation + resumen-contribution tests need the local ephemeral DB (`local-test-db.md`) |

## Success criteria

| AC | Criterion |
|----|-----------|
| CA-01 | Domain validation of a manual movement passes/fails via `Result`: money is exact `BigInt` (never float), overflow guarded, type invariants enforced, `fecha ≤ today` (future ⇒ 400) |
| CA-02 | `tipo=Ingreso` is auto-classified `{abono>0, cargo=0, bucket=Ingreso, categoriaId=null}`; the client is never asked for bucket/categoría; `CategorizarTransaccionUseCase` is not invoked |
| CA-03 | `tipo=Gasto` cascade validates against the caller's own catalog: categoría outside catalog ⇒ 400 (`CategoriaFueraDeCatalogoError`); categoría in another bucket ⇒ 400 (`BucketCategoriaNoConcuerdaError`) |
| CA-04 | The persisted row is identifiable as origin **"Manual"** (sentinel `Account(banco='Manual')` feeds US-052's Origen column, zero reader changes); manual rows are immune to delete-ingesta (`ingestaId=null`) |
| CA-05 | The manual row impacts the month resumen, the 50/30/20 percentages and the semáforo automatically, with **no reader change** (backend computes, client renders — ADR-024) |
| CA-06 | Every WHERE scoped by `userId`; an integration test proves user B cannot register into or read user A's manual movement (RNF-SEC-006); amounts scrubbed from all errors; `openapi.json` reflects `POST /api/movimientos` (ADR-011) |
| — | `pnpm api test`, `pnpm api test:integration` (local ephemeral DB), `pnpm api exec tsc --noEmit`, and the openapi.json contract check all green |

## Rollback plan

1. **Code**: reverting removes `POST /api/movimientos`, the use case, the port and the adapter — clean, no consumer depends on it yet (forms are US-060/061).
2. **Schema**: `origen` (C-a additive) drops cleanly. `ingestaId` nullable can be re-tightened to NOT NULL **only** after handling any manual rows (null `ingestaId`) — the migration's down step documents deleting/guarding them first. Because manual rows are additive and isolated, the practical rollback is "leave the nullable column, remove the code path".
3. **openapi.json** regenerates from source, so reverting the code reverts the contract.
4. Sentinel accounts are inert data if the feature is rolled back (harmless orphan rows); no cleanup required.

## Open questions (non-blocking — resolve in design)

1. **`origen` column: C-a (`String?`, null=ingesta) vs C-b (`String NOT NULL` backfilled `'Ingesta'`).** Recommendation C-a (no backfill). Pure schema-cost tradeoff, no product impact.
2. **Whether to add the raw-SQL CHECK** `(ingestaId IS NULL) ⇔ (origen = 'Manual')` or rely on the single-writer guarantee. Robustness detail.
3. **Ingreso with stray bucket/categoría fields: strict-reject (400) or silently ignore.** Contract detail; leaning strict-reject for a clean API.
4. **Whether the manual writer reuses `TransaccionAPersistir` or takes a dedicated small input.** Pure structure (Approach §1); design picks based on which maps more cleanly without dragging batch semantics.

None blocks the spec or design phase.
