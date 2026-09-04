# Design — US-004: Historial de archivos cargados

> SDD design phase for change `us-004-historial-ingestas`. Architectural HOW, not
> task steps. The locked big rock (Approach **C-refined**: `Ingesta.accountId`/`banco`
> nullable + a direct non-null `Ingesta.userId`) comes from the proposal
> (`sdd/us-004-historial-ingestas/proposal`); this document realizes it, resolves
> the seven open questions it handed off, and locks the write-path state machine.
> **Issue:** GitHub #156 · **Store:** hybrid · **Scope:** `apps/api` + `apps/web`.

## 1. Scope recap (from proposal)

- Widen `GET /api/ingestas` **in-place** (no new endpoint): drop the `estado: PROCESADA`
  hard-filter, isolate by the new direct `Ingesta.userId`, and widen the read model /
  DTO with `nombreArchivo`, `estado`, `motivoFallo` (keep `banco`, `fecha`,
  `totalTransacciones`).
- **Register every terminal failed attempt**, including the two early failures
  (extension, banco-no-reconocido) that today create **zero** rows.
- Web reuses the existing `/ingestas` screen to render estado (exitoso/fallido),
  `nombreArchivo`, and per-row the count (success) or `motivoFallo` (failure).
- OUT: CANCELADA, revert/reprocess, filters/pagination, mobile, PENDIENTE
  reconciliation.

Verified against the codebase (not assumed):
- `Ingesta.accountId` is **NOT NULL** with a required `account` relation
  (schema.prisma:54-55); `banco` is **NOT NULL** (schema.prisma:56); there is **no**
  direct `userId` column — isolation today rides the `account.userId` join.
- `Transaccion.accountId` is its **own** NOT NULL column (schema.prisma:113). Every
  money view (resumen-mes, movimientos-mes, detalle-bucket, resumen-anual,
  categorización) isolates/aggregates via `Transaccion.account: { userId }`, **never**
  via `Ingesta.accountId` — so relaxing `Ingesta.accountId` has **zero** impact on
  money views.
- The pipeline creates rows through exactly one path today:
  `PersistTransactionsUseCase` → `createPending` (PENDIENTE) → `commit` (PROCESADA) or
  `markFailed` (FALLIDA). The **six** pre-persist failure branches in
  `runPipeline` (extension, detectBank, account.ensure, validateStructure, normalize,
  detectarDuplicados) create **no** row. Only a `commit` failure ever wrote a FALLIDA
  row today — and the US-018 reader filters it out.
- `IFileReader.getOriginalName()` is read **before** extension validation
  (ingest-file.use-case.ts:32) — `input.fileReader.getOriginalName()` yields
  `nombreArchivo` at **every** exit point, including an extension reject.
- Every existing `Ingesta` row (PROCESADA, legacy FALLIDA, any orphan PENDIENTE) has a
  non-null `accountId` (current schema forbids null) → **the `userId` backfill from
  `account.userId` is total; no orphan rows**.
- Both flagged error messages (`PdfSinTextoError`, `EstructuraPdfInvalidaError`) are
  **storage-safe** — they interpolate only filename / bank / expected-anchor text and
  explicitly document NOT interpolating raw cell values or amounts (open question 5
  **resolved**: no new scrub work).
- `prisma-demo.repository.ts:56` creates an `Ingesta` with `accountId` but **no**
  `userId`, and has `user.id` in scope — a required edit once `userId` is non-null.
- **Correction (JD round 1) — `demo-cleanup.service.ts` is NOT a "controlado, siempre
  con cuenta" reader/writer as the proposal's blast-radius table (§4.3) claimed.**
  `borrarExpirados()` deletes `Ingesta` rows with `tx.ingesta.deleteMany({ where: {
  account: { userId: { in: ids } } } })` — a join through `Account`, which **cannot**
  match an account-less `FALLIDA` row (`accountId = null`). Once `Ingesta_userId_fkey`
  is `ON DELETE RESTRICT` (§5.2), a demo user who triggered even one early-failure
  upload (bad extension / unrecognized bank) leaves an orphaned account-less `Ingesta`
  row that the account-join delete skips; the subsequent `tx.user.deleteMany` in the
  same `$transaction` then violates the FK and the **entire cleanup transaction
  throws**. This is reachable, not theoretical: `POST /api/ingestas` has no `esDemo`
  gate, so demo users can upload and hit an early failure like any other user. See §5.3
  for the required fix.

## 2. Architecture approach

Clean Architecture, dependency rule `domain ← application ← infrastructure` (ADR-005),
`Result<T,E>` throughout (never throw in domain/application). Two decisions carry this
change; everything else is mechanical.

The load-bearing insight (from the proposal, re-verified above): **failure registration
and success persistence must have a single writer of each terminal state**, and the
awkward eager-`PENDIENTE` row is the root of the "orphaned PENDIENTE" and
"double-registration" risks. Once the boundary owns failure registration, `createPending`
loses its only reason to exist (its comment: *"de modo que una FALLIDA posterior
sobreviva"* — now the boundary owns that), so the persist path **naturally collapses** to
a single atomic PROCESADA write. This is a net **simplification** (three repo methods → one,
one fewer pipeline state), not scope creep.

## 3. THE key decision #1 — write-path state machine (open questions 1, 2, 3)

### 3.1 State machine (locked)

The `EstadoIngesta` enum keeps all three values (removing an enum value is a risky
migration — YAGNI), but the **pipeline only ever writes terminal states**:

```
              ┌─────────────────────────────────────────────┐
  upload ─────┤  runPipeline() succeeds                      │
              │    → PrismaIngestaRepository.persistirProcesada  (atomic)
              │        creates Ingesta{ estado: PROCESADA,   │
              │          accountId, banco, totalTransacciones,│
              │          duplicadosOmitidos, procesadoEn } +  │
              │          its Transaccion rows in ONE $transaction
              └─────────────────────────────────────────────┘
              ┌─────────────────────────────────────────────┐
  upload ─────┤  runPipeline() fails at ANY of the 7 branches│
              │    OR execute()'s catch fires                │
              │    → RegistrarIngestaFallidaWriter.registrar │
              │        creates Ingesta{ estado: FALLIDA,     │
              │          userId, nombreArchivo, motivoFallo,  │
              │          accountId = null, banco = null }     │
              └─────────────────────────────────────────────┘
```

- **PROCESADA** is written in exactly **one** place: `persistirProcesada` (atomic
  create). It always has `accountId` + `banco` + `totalTransacciones`. The invariant
  **`PROCESADA ⟹ accountId NOT NULL AND totalTransacciones NOT NULL`** is therefore true
  by construction (open question 2, primary guarantee).
- **FALLIDA** is written in exactly **one** place: the boundary
  `RegistrarIngestaFallidaWriter`. `userId` always present; `accountId`/`banco` null
  (see §3.3).
- **PENDIENTE** is **never written by the pipeline anymore.** Any legacy PENDIENTE row
  (from a past crashed `commit`) is simply not produced going forward.

**Terminal-only, chosen over eager-PENDIENTE (open question 1).** Rationale:
- **No orphaned PENDIENTE possible** — a crash mid-pipeline leaves **zero** rows (same
  observable state as today), never a dangling PENDIENTE. This fully retires the
  "reconciliación de PR3" debt for this path (it becomes structurally impossible), and
  it removes the fragile `markFailed`-might-also-fail defensive block in
  `PersistTransactionsUseCase` (persist-transactions.use-case.ts:60-73).
- **Single writer per state (DRY)** — exactly the DRY argument the proposal used to
  reject the two-table Approach B, now applied internally: one place writes PROCESADA,
  one writes FALLIDA. No runtime flag, no ambiguity about "was this failure already
  recorded."
- **Atomicity strengthened (KISS)** — success is now one `$transaction` (nested
  `createMany` under `ingesta.create`) instead of two separate commits
  (`createPending` commit, then the `commit` tx). Fewer moving parts.

Rejected alternative (surgical): keep `createPending → commit → markFailed` and add
boundary registration only for the six pre-persist branches. Rejected because it needs a
runtime signal to tell the boundary "the persist branch already wrote a FALLIDA row,
don't duplicate," which is exactly the fragile two-writers-of-FALLIDA that DRY warns
against; it also keeps the eager PENDIENTE (orphan risk) and the two-commit success path.

### 3.2 Failure registration is a degradable island (mirrors categorización)

`ProcessIngestaUseCase.execute()` becomes:

```ts
async execute(input): Promise<Result<ProcessIngestaResult, ProcessIngestaError>> {
  try {
    const result = await this.runPipeline(input);
    if (result.isFail()) {
      await this.registrarFallo(input, result.getError().message);
    }
    return result;                       // original error preserved verbatim
  } catch (error) {
    // Fixed generic motivo — a raw thrown message could carry a cell amount.
    const persistErr = new PersistenciaFallidaError(
      'fallo inesperado durante el pipeline de ingesta',
      error instanceof Error ? error : undefined,
    );
    await this.registrarFallo(input, persistErr.message);
    return Result.fail(persistErr);
  }
}

private async registrarFallo(input: ProcessIngestaInput, motivo: string): Promise<void> {
  // Island (mirrors runCategorizacion): the whole body is wrapped so this method is
  // STRUCTURALLY never-throw, not "never-throw by luck" — e.g. if
  // input.fileReader.getOriginalName() itself throws, we still must not escalate.
  try {
    const res = await this.ingestaFallidaWriter.registrar({
      userId: input.userId,
      nombreArchivo: input.fileReader.getOriginalName(),  // available at EVERY exit
      motivo,
    });
    if (res.isFail()) {
      // Island: NEVER escalate. The user's request already failed; failing to log the
      // attempt must not change the error the caller sees (same posture as runCategorizacion).
      console.error('[ProcessIngestaUseCase] no se pudo registrar el intento fallido (degradando):', res.getError().message);
    }
  } catch (error) {
    // Island: NEVER escalate, even if the writer call itself throws unexpectedly.
    console.error(
      '[ProcessIngestaUseCase] registrarFallo lanzó inesperadamente (degradando):',
      error instanceof Error ? error.message : String(error),
    );
  }
}
```

- **`motivo` is storage-safe by construction.** For the known-error path it is a
  `ProcessIngestaError.message` — all nine are controlled domain messages (filename /
  bank / extension / expected-anchor text), verified storage-safe including the two
  flagged PDF errors (§1). For the `catch` path it is the **fixed generic** message the
  orchestrator already uses precisely to avoid leaking raw cell data.
- **`registrarFallo` never throws and never changes the returned Result — structurally,
  not by luck.** The whole method body is wrapped in try/catch (mirroring
  `runCategorizacion`), so even an unexpected throw inside it (e.g.
  `getOriginalName()` itself throwing) is caught and logged, never escalated. If the
  failure-write itself fails (DB down) or throws, we degrade to a log — same observable
  state as today (no row).

### 3.3 Early-failure row shape (open question 3, part a)

Every failure row is `{ userId, nombreArchivo, estado: FALLIDA, motivoFallo, accountId:
null, banco: null }`. Why `accountId`/`banco` null even for **late** failures where the
bank was resolved:

- The boundary handler runs in `execute()`; `banco`/`accountId` are local to
  `runPipeline` and are **not** on the stack at the boundary. Threading them out through
  all ~8 return sites is the exact per-branch plumbing the proposal's DRY argument sought
  to avoid. **KISS/YAGNI: register with what the boundary reliably holds** — `userId`,
  `nombreArchivo`, `motivo`.
- **This is more information than today for early failures** (today: zero row for the
  six pre-persist branches — the boundary row is strictly additive there). **It is less
  information than today for late failures** (structure/normalize/dedupe, and
  `commit`-stage failures): today's existing, hidden `markFailed` rows retain the
  resolved `banco`/`accountId` (they are simply filtered out of the US-018 reader, not
  deleted), while the new boundary-registered row does not carry them. This is an
  **accepted, documented tradeoff** — enrichment deferred (below) — not a strict
  improvement with no regression.
- The high-value cases the US targets (extension, banco-no-reconocido) are **genuinely
  bank-less** — `banco = null` is honest modeling, not data loss.
- **Follow-up (documented, YAGNI-deferred):** enrich late-failure rows with the resolved
  `banco`/`accountId` by returning a small `FailureContext` from `runPipeline`. Not built
  now — no CA requires bank display on failures (CA-02 exitoso/fallido, CA-04 motivo).

`nombreArchivo` display for `banco = null` rows is a web concern (§7): render "—" /
"banco desconocido".

### 3.4 Invariant enforcement (open question 2, part b)

**Both**, layered:
1. **Application/structural (primary, KISS):** PROCESADA is written only by
   `persistirProcesada`, which always has `accountId` + `banco` + `totalTransacciones`.
   The invariant cannot be violated by the pipeline.
2. **DB CHECK (defense-in-depth, precedented):** a raw-SQL partial CHECK, mirroring
   `add_cargo_abono_check` (Prisma cannot model CHECK — CLAUDE.md gotcha; NOT added to
   `schema.prisma`):
   ```sql
   ALTER TABLE "Ingesta" ADD CONSTRAINT "Ingesta_procesada_requires_account"
     CHECK ("estado" <> 'PROCESADA' OR "accountId" IS NOT NULL);
   ```
   Justified because a PROCESADA row with `accountId = null` would be a **money-integrity**
   hazard (it would escape the money-view isolation reasoning). This is exactly the class
   of invariant ADR-015 says to defend at the data layer. The `totalTransacciones`
   companion CHECK is optional/nice-to-have; the `accountId` one is load-bearing and the
   one we ship.

## 4. THE key decision #2 — read path: filter, isolation, DTO (open questions 4-partial, 5)

### 4.1 Reader — `prisma-listar-ingestas.reader.ts` (rewrite of the WHERE + select)

```ts
// Prisma's generated EstadoIngesta is the 3-value union
// 'PENDIENTE' | 'PROCESADA' | 'FALLIDA' — NOT narrowed by the WHERE clause below.
// This helper narrows at the infra boundary: it is sound because the WHERE
// clause guarantees only PROCESADA/FALLIDA rows ever reach it, and it fails
// loud (throws) instead of lying to the type system if that guarantee is
// ever violated. Throwing here is allowed — this is infrastructure, not
// domain/application.
function aIngestaEstado(e: EstadoIngesta): IngestaEstado {
  if (e === 'PROCESADA' || e === 'FALLIDA') return e;
  throw new Error(`reader devolvió estado inesperado: ${e}`);
}

const rows = await this.prisma.ingesta.findMany({
  where: { userId, estado: { in: [EstadoIngesta.PROCESADA, EstadoIngesta.FALLIDA] } },
  orderBy: { creadoEn: 'desc' },
  select: {
    id: true, banco: true, nombreArchivo: true, estado: true,
    motivoFallo: true, creadoEn: true, totalTransacciones: true,
  },
});
return rows.map((r) => ({
  id: r.id,
  banco: r.banco,                              // string | null
  nombreArchivo: r.nombreArchivo,
  estado: aIngestaEstado(r.estado),            // narrowed 'PROCESADA' | 'FALLIDA'
  motivoFallo: r.motivoFallo,                  // string | null
  fecha: r.creadoEn,
  totalTransacciones: r.totalTransacciones ?? 0,
}));
```

(An explicitly-commented `as` cast at this exact boundary — e.g. `r.estado as
IngestaEstado` — is an acceptable alternative, but the helper above is
preferred: it fails loud instead of silently trusting the type system.)

Three deliberate changes from the US-018 reader:
- **Drop `estado: PROCESADA`** → include both terminal states via
  `estado: { in: [PROCESADA, FALLIDA] }`. This **also excludes any legacy PENDIENTE**
  orphan (the historial is terminal outcomes only — clean, and it means the web never
  has to render a third state).
- **Isolation switches from `account: { userId }` to the direct `userId` column.**
  Stronger and simpler than the join, and it is the **only** clause that can isolate an
  `accountId = null` failure row (the whole reason the proposal added the column). Same
  set of PROCESADA rows returned for a user as before (equivalent) plus the new FALLIDA
  rows → no isolation regression.
- **Widen the select** with `nombreArchivo`, `estado`, `motivoFallo`.

`totalTransacciones` stays a `number` via `?? 0` (BigInt-safe: it is a row **count**, not
money). For FALLIDA it is null in the DB → coalesced to 0; the web branches on `estado`
and shows `motivoFallo` instead of a count for failures, so "0" is never displayed for a
failure.

### 4.2 Application read model — `listar-ingestas.port.ts` (widen `IngestaResumen`)

```ts
export type IngestaEstado = 'PROCESADA' | 'FALLIDA'; // local literal union — NOT the Prisma enum

export interface IngestaResumen {
  readonly id: string;
  readonly banco: string | null;        // widened: FALLIDA early rows have no bank
  readonly nombreArchivo: string;       // new
  readonly estado: IngestaEstado;       // new
  readonly motivoFallo: string | null;  // new
  readonly fecha: Date;
  readonly totalTransacciones: number;  // count — unchanged
}
```

`IngestaEstado` is a **local string-literal union declared in this port file**, not
`EstadoIngesta` imported from `@prisma/client`. ADR-005 forbids the application layer
importing `@prisma/client` — that would leak an infrastructure/persistence type across
the `application`/`infrastructure` boundary. This port and this read model stay
entirely cast-free — the literal union is declared and consumed here with zero `as`
anywhere in application code. Only `prisma-listar-ingestas.reader.ts` (infrastructure)
legitimately imports the Prisma `EstadoIngesta` enum; because that 3-value Prisma enum
is **not** narrowed by the WHERE clause at the type level, the reader must explicitly
narrow `EstadoIngesta` → `IngestaEstado` at the infra boundary via the `aIngestaEstado`
helper (§4.1) before returning an `IngestaResumen` — one explicit narrowing step,
confined to infrastructure, is required for the code to type-check. The read model
stays a plain application read-model (no Result — a list is a success; empty is valid;
`userId` is session-guaranteed — same rationale US-018 D4 recorded for
`ListarIngestasUseCase`, which is **unchanged**).

### 4.3 HTTP DTO — `ingesta-list.dto.ts` (additive widen)

```ts
export interface IngestaListItemDto {
  readonly id: string;
  readonly banco: string | null;        // widened
  readonly nombreArchivo: string;       // new
  readonly estado: 'PROCESADA' | 'FALLIDA'; // new (string-literal union, not the Prisma enum)
  readonly motivoFallo: string | null;  // new
  readonly fecha: string;               // ISO-8601
  readonly totalTransacciones: number;  // count — BigInt-safe plain number
}
export function aIngestaListItemDto(r: IngestaResumen): IngestaListItemDto {
  return {
    id: r.id, banco: r.banco, nombreArchivo: r.nombreArchivo,
    estado: r.estado, motivoFallo: r.motivoFallo,
    fecha: r.fecha.toISOString(), totalTransacciones: r.totalTransacciones,
  };
}
```

The DTO estado is a **string-literal union**, not the Prisma enum — the HTTP contract
must not leak a persistence type across the boundary (the web hand-writes its mirror per
ADR-008/DRY exception). Because `IngestaResumen.estado` is already the local
`IngestaEstado` literal union (§4.2) and it is structurally identical to the DTO's
`'PROCESADA' | 'FALLIDA'` union, `aIngestaListItemDto` needs **no `as` cast** — it
satisfies the codebase's "sin `as`" convention by construction, not by suppressing the
type checker. **Scope of the "no cast" claim:** this holds for the port (§4.2) and this
DTO mapper only — both consume the already-narrowed `IngestaEstado` union. The one
required narrowing step in the whole read path lives in infrastructure, at the reader
(§4.1), where the raw 3-value Prisma `EstadoIngesta` enum is converted via the
`aIngestaEstado` helper before it ever reaches the port or the DTO. The change is
**additive** (id, banco, fecha, totalTransacciones preserved); the only widening is
`banco: string` → `string | null`.

## 5. Migration — two-phase, prod-safe (open question 4 write-side; migration shape)

Hand-authored SQL following the exact precedent of the US-005 migration
(`20260721000000_...`) and `add_cargo_abono_check`: this worktree has no `DATABASE_URL`
and the reachable Postgres is a shared Supabase pooler, so we do **not** `prisma migrate
dev` against it. Author the SQL, mirror what Prisma would generate for the
`schema.prisma` diff, and verify with `prisma validate` + `prisma generate` (both succeed
offline). `prisma.config.ts` must not add `earlyAccess` (CLAUDE.md gotcha — unchanged).

### 5.1 `schema.prisma` diff (Ingesta + User)

```prisma
model Ingesta {
  id                 String        @id @default(cuid())
  userId             String                                   // NEW — non-null
  user               User          @relation(fields: [userId], references: [id])
  accountId          String?                                  // was String
  account            Account?      @relation(fields: [accountId], references: [id])
  banco              String?                                  // was String
  nombreArchivo      String
  estado             EstadoIngesta @default(PENDIENTE)
  totalTransacciones Int?
  duplicadosOmitidos Int           @default(0)
  motivoFallo        String?
  creadoEn           DateTime      @default(now())
  procesadoEn        DateTime?
  transacciones      Transaccion[]

  @@index([userId])                                           // NEW
}

model User {
  // ...existing fields...
  ingestas Ingesta[]                                          // NEW back-relation
}
```

### 5.2 Migration SQL (single transactional migration — Postgres DDL is atomic)

```sql
-- 1. Add userId NULLABLE first (so existing rows don't reject on a non-null add).
ALTER TABLE "Ingesta" ADD COLUMN "userId" TEXT;

-- 2. Backfill from the owning account. Every existing row has a non-null accountId
--    (the pre-migration schema forbids null), so this backfill is TOTAL — no orphans.
UPDATE "Ingesta" i
   SET "userId" = a."userId"
  FROM "Account" a
 WHERE i."accountId" = a."id" AND i."userId" IS NULL;

-- 3. Enforce non-null. Fails LOUDLY (fail-closed) if any row is unbackfilled — which
--    cannot happen given the invariant above, but the guard is free.
ALTER TABLE "Ingesta" ALTER COLUMN "userId" SET NOT NULL;

-- 4. FK + index (mirror the Session/Account userId FK).
ALTER TABLE "Ingesta"
  ADD CONSTRAINT "Ingesta_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Ingesta_userId_idx" ON "Ingesta"("userId");

-- 5. Relax accountId / banco to nullable (pure widening — no data change, safe).
ALTER TABLE "Ingesta" ALTER COLUMN "accountId" DROP NOT NULL;
ALTER TABLE "Ingesta" ALTER COLUMN "banco"     DROP NOT NULL;

-- 6. Money-integrity invariant (raw SQL — Prisma can't model CHECK; not in schema.prisma).
ALTER TABLE "Ingesta" ADD CONSTRAINT "Ingesta_procesada_requires_account"
  CHECK ("estado" <> 'PROCESADA' OR "accountId" IS NOT NULL);
```

**Why in-migration (not a separate supervised script like ADR-013's encryption
backfill):** the ADR-013 backfill needed an out-of-band supervised job because it
transforms every row's data with a key (long-running, resumable, key-management). Here the
backfill is a **single deterministic `UPDATE` from a join** that fits inside the
migration's transaction — add-nullable → backfill → set-not-null is the standard safe
three-step, atomic under Postgres transactional DDL. **Supervision** still applies on prod
(Supabase): before/after run `SELECT count(*) FROM "Ingesta" WHERE "userId" IS NULL;`
(expect 0 after step 2, before step 3) — documented in the migration header comment and
the prod runbook, matching the ADR-013 supervised-backfill posture. **Recommended (JD
round 1):** additionally rehearse this exact join-based `UPDATE ... FROM Account`
against a prod snapshot/dump before the real prod apply — not only the before/after
count check — per the ADR-013 supervised-backfill precedent (see §10.3). The db-safety
gate (`ALLOW_DESTRUCTIVE_DB`) governs **test-suite** mutations, not `prisma migrate
deploy`, so it is orthogonal here; the shared-DB caution is why we hand-author + verify
offline.

### 5.3 Demo repository + demo-cleanup edits (required by the non-null column)

`prisma-demo.repository.ts:56` must add `userId: user.id` to the `ingesta.create` data
(the demo seeds a PROCESADA row and already creates the `user`). Its spec
(`prisma-demo.repository.spec.ts:102`, asserts `tx.ingesta.create` args) updates
accordingly. This is the only OTHER `Ingesta` **writer** in production code; no seed
script creates ingestas (verified). (Three pre-existing repository *specs* also write
`Ingesta` rows as test fixtures via `upsert` — see §10.1/§12, mechanical, not a
production-code writer.)

**Required change — `demo-cleanup.service.ts` (`borrarExpirados`).** Per the correction
in §1, the account-join delete must become a direct-`userId` delete so it covers both
account-linked and account-less `Ingesta` rows, and it must still run **before** the
`Account`/`User` deletes in the same `$transaction` (unchanged ordering):

```ts
// before (misses accountId = null rows):
await tx.ingesta.deleteMany({ where: { account: { userId: { in: ids } } } });

// after (covers both account-linked and account-less rows via the direct FK column):
await tx.ingesta.deleteMany({ where: { userId: { in: ids } } });
```

This is a strict simplification (drops a join) as well as a correctness fix — the
direct `userId` column is now the authoritative isolation key for `Ingesta` everywhere
(§4.1 D4), so the cleanup service should use the same key its own reader/writer
counterparts do. `demo-cleanup.service.spec.ts` updates its mock assertion accordingly;
see §12 for the file-summary addition.

## 6. Application ports & use cases — Clean Architecture placement (open question 7)

### 6.1 Domain

**No new domain type required.** The state machine invariant is documented in domain terms
(§3.1) but enforced structurally (application) + DB CHECK (infra). Failure registration is
infra persistence, not a domain rule. `Result<T,E>` unchanged; nothing throws in
domain/application.

### 6.2 Application — new narrow port (SOLID/ISP)

`apps/api/src/application/ports/registrar-ingesta-fallida.port.ts` (new):

```ts
export interface RegistrarIngestaFallidaInput {
  readonly userId: string;
  readonly nombreArchivo: string;
  readonly motivo: string;
}
export interface IRegistrarIngestaFallidaWriter {
  registrar(
    input: RegistrarIngestaFallidaInput,
  ): Promise<Result<void, PersistenciaFallidaError>>;
}
export const REGISTRAR_INGESTA_FALLIDA_WRITER = 'IRegistrarIngestaFallidaWriter';
```

A **separate** narrow port (not bolted onto `IIngestaRepository`): the failure recorder
and the success aggregate have different reasons to change, and the boundary consumer
should not depend on `commit`/`persistirProcesada`. Input carries **only** what the
boundary reliably holds (§3.3) — no always-null `banco`/`accountId` params (YAGNI: no dead
params).

### 6.3 Application — `IIngestaRepository` collapses to one write method

`apps/api/src/application/ports/ingesta-repository.port.ts`: replace `createPending` +
`commit` + `markFailed` with a single atomic method:

```ts
export interface CrearIngestaProcesadaInput {
  userId: string;
  accountId: string;
  banco: string;
  nombreArchivo: string;
  transacciones: ReadonlyArray<Transaccion>;
  duplicadosOmitidos: number;
}
export interface IIngestaRepository {
  persistirProcesada(
    input: CrearIngestaProcesadaInput,
  ): Promise<Result<{ ingestaId: string; total: number }, PersistenciaFallidaError>>;
}
```

`markFailed` is deleted — failure is the boundary's job (single-writer, §3.1).

### 6.4 Application — `PersistTransactionsUseCase` simplifies

Collapses to a single call (no lifecycle orchestration, no `markFailed` defensive block):

```ts
async execute(input: PersistTransactionsInput):
  Promise<Result<PersistTransactionsResult, PersistenciaFallidaError>> {
  const res = await this.ingestaRepository.persistirProcesada({
    userId: input.userId, accountId: input.accountId, banco: input.banco,
    nombreArchivo: input.nombreArchivo, transacciones: input.transacciones,
    duplicadosOmitidos: input.duplicadosOmitidos,
  });
  if (res.isFail()) return Result.fail(res.getError());
  const { ingestaId, total } = res.getValue();
  return Result.ok({ ingestaId, total, duplicadosOmitidos: input.duplicadosOmitidos });
}
```

`PersistTransactionsInput` gains a required `userId: string` field alongside its
existing `accountId`/`banco`/`nombreArchivo`/`transacciones`/`duplicadosOmitidos` — it is
already available in `runPipeline` as `input.userId` (session-guaranteed), so this is a
same-shape pass-through, not a new lookup. `runPipeline`'s call site
(process-ingesta.use-case.ts:214-224) is unchanged in shape otherwise — it still gets `{
ingestaId, total, duplicadosOmitidos }`, and the downstream `runCategorizacion(ingestaId)`
still receives a real, committed `ingestaId`.

### 6.5 Application — `ProcessIngestaUseCase`

Gains one constructor dep: `private readonly ingestaFallidaWriter:
IRegistrarIngestaFallidaWriter`. `execute()` gets the try/if-fail/catch registration of
§3.2. `runPipeline` is **otherwise untouched** (its seven `Result.fail` returns are the
seams the boundary observes) — honoring the DRY "don't touch the seven branches" goal.

## 7. Infrastructure — adapters

### 7.1 `prisma-ingesta.repository.ts` — atomic PROCESADA create

Replaces the three methods with `persistirProcesada`. Atomic via a nested write (one
statement, one implicit transaction):

```ts
async persistirProcesada(input) {
  try {
    const ingesta = await this.prisma.ingesta.create({
      data: {
        userId: input.userId,   // threaded from the session via §6.3/§6.4, not an extra lookup
        accountId: input.accountId,
        banco: input.banco,
        nombreArchivo: input.nombreArchivo,
        estado: EstadoIngesta.PROCESADA,
        totalTransacciones: input.transacciones.length,
        duplicadosOmitidos: input.duplicadosOmitidos,
        procesadoEn: new Date(),
        transacciones: {
          createMany: {
            data: input.transacciones.map((tx) => ({
              ...aPersistencia(tx, this.crypto),
              accountId: input.accountId,   // Transaccion's own FK; ingestaId implicit
            })),
          },
        },
      },
    });
    return Result.ok({ ingestaId: ingesta.id, total: input.transacciones.length });
  } catch (error) {
    return Result.fail(new PersistenciaFallidaError(
      'falló la escritura atómica de la ingesta', error instanceof Error ? error : undefined));
  }
}
```

**`userId` on the success row is locked here, not deferred to apply.** `Ingesta.userId`
is non-null, so `persistirProcesada` must set it. `userId` is threaded through
`CrearIngestaProcesadaInput` and `PersistTransactionsInput` (§6.3/§6.4) from the
already-known `input.userId` in `runPipeline` — no extra `account` lookup, and the value
flows from the session, which is the authority for isolation (RNF-SEC-006). The apply
phase wires this already-specified field through `runPipeline` →
`PersistTransactionsUseCase` → repo; the field and its source are decided here.

Keeps `ICryptoService` (money columns). Wraps infra errors as `PersistenciaFallidaError`
(unchanged posture for the write side).

### 7.2 `prisma-registrar-ingesta-fallida.repository.ts` (new)

Implements `IRegistrarIngestaFallidaWriter`. Constructor `(prisma: PrismaClient)` — no
crypto (failure rows touch no money columns).

```ts
async registrar(input) {
  try {
    await this.prisma.ingesta.create({
      data: {
        userId: input.userId,
        nombreArchivo: input.nombreArchivo,
        estado: EstadoIngesta.FALLIDA,
        motivoFallo: input.motivo,
        // accountId / banco omitted → null (nullable now)
      },
    });
    return Result.ok(undefined);
  } catch (error) {
    return Result.fail(new PersistenciaFallidaError(
      'no se pudo registrar el intento fallido', error instanceof Error ? error : undefined));
  }
}
```

### 7.3 `prisma-listar-ingestas.reader.ts` — per §4.1.

### 7.4 Composition — `crear-process-ingesta.ts` + `container.ts`

`crear-process-ingesta.ts:51-76`: construct `new PrismaRegistrarIngestaFallidaRepository(prisma)`
and pass it as the new last arg to `new ProcessIngestaUseCase(...)`. `PersistTransactionsUseCase`
construction (line 76) is unchanged in wiring (still takes `ingestaRepository`). The
`listarIngestas` use case (US-018, wired in `container.ts`) is unchanged in wiring — only
its reader's internals and read model widen. No HTTP route change: `GET /api/ingestas`
already exists (US-018); the widened DTO flows through `aIngestaListItemDto` unchanged in
shape.

## 8. US-018 regression plan (open questions 3-partc, 6 — merge-blocking)

US-018 (`DELETE /api/ingestas/:id` + the "Gestionar cartolas" screen) shares this exact
endpoint and web list component. Enumerated assumptions and how each is preserved:

| US-018 assumption | Source | Preserved by |
|---|---|---|
| List returns `{ id, banco, fecha, totalTransacciones }` | design §6.2 | DTO change is **additive**; all four fields kept. Only `banco` widens to `string \| null`. |
| `banco` is a non-null `string` in the confirm copy "…de {banco}…" | design §7.3 | The confirm dialog renders **only for PROCESADA rows** (delete affordance gated, below), and PROCESADA ⟹ `banco NOT NULL` (§3.1 invariant). At that call site `banco` is always non-null. |
| `totalTransacciones` is a `number` for the "N movimientos serán eliminadas" copy | design §7.3 | Kept `number` (`?? 0`); the copy renders only for PROCESADA (count is real). |
| Delete isolates via `account: { userId }` and is `estado`-agnostic at the DB | design §3.1 | **Unchanged.** PROCESADA rows always have an `account`, so the account-join delete still works. FALLIDA rows (accountId null) are never targeted (gated). |
| Delete returns 404 on missing/not-owned (anti-enumeration) | design §3.2 | Unchanged. |
| The reader previously returned **only** PROCESADA | design §5.2 (D5) | Intentionally relaxed here; the **web** absorbs the superset (below). |

**The two locked behavioral guards (proposal §6):**
1. **Gate the delete affordance to `estado === 'PROCESADA'`.** FALLIDA rows render
   `nombreArchivo` + `fecha` + `motivoFallo` and **no** delete button. Consequence: the
   US-018 delete path never targets a FALLIDA/account-less row, so the account-join
   isolation in `prisma-eliminar-ingesta.repository.ts` needs **no** change (a null-account
   FALLIDA row would `count === 0` → 404, but we never reach it). This is the KISS answer
   to open question 3: deleting failed attempts is **not** a US-004 requirement (proposal
   OUT: revert/reprocess) → documented follow-up, not built.
2. **`motivoFallo`/`banco` null-tolerance in list display** — a US-004 web concern (§9);
   the confirm dialog is unaffected (PROCESADA-only).

**Type-level note (strict TS):** widening `banco` to `string | null` in the hand-written
web `IngestaListItemDto` forces US-018's `EliminarIngestaControl` (which takes `banco` as
a prop) to handle null. Because the control only mounts for PROCESADA rows, the parent
passes a narrowed non-null value (or the control coalesces `banco ?? ''`). This is a
one-line touch on existing US-018 web code, part of the regression guard — not a
behavioral change.

The US-018 two-user isolation integration test stays valid: it exercises PROCESADA
rows, which return the equivalent set under the new direct-`userId` isolation.

## 9. Web layer (Slice 2)

Reuses the existing `/ingestas` screen (`ListaIngestas.tsx`) — no new route/nav.

- `apps/web/src/api/types.ts`: mirror the widened `IngestaListItemDto` (banco
  `string | null`, add `nombreArchivo`, `estado: 'PROCESADA' | 'FALLIDA'`, `motivoFallo:
  string | null`). Hand-written per ADR-008 (DRY exception).
- `apps/web/src/api/client.ts` `fetchIngestas` type-guard widens: `banco` accepts
  `string | null`, `estado` ∈ the union, `nombreArchivo` string, `motivoFallo`
  `string | null`. `totalTransacciones` still `typeof === 'number'` (count, not money).
- `ListaIngestas.tsx` / `IngestaItem`: branch on `estado` —
  - PROCESADA → badge "Exitoso", show `nombreArchivo`, "N movimientos", and the
    (existing US-018) delete control.
  - FALLIDA → badge "Fallido", show `nombreArchivo`, render `motivoFallo`, render
    `banco ?? '—'`, **no** delete control.
  - Same Loading / Error / Empty state discipline as the existing screen.
- Cache invalidation and the delete mutation (US-018) are unchanged.

No mobile (proposal OUT).

## 10. Testing design (strict TDD — test-first, runner `pnpm api test`)

Ports/adapters/use-cases give clean seams; the apply phase writes tests first.

### 10.1 Backend unit

- `prisma-ingesta.repository.spec.ts` (**rewrite**): mock `ingesta.create`; assert the
  nested `createMany` payload maps via `aPersistencia`, sets `estado: PROCESADA`,
  `userId`, `accountId`, `totalTransacciones = length`, `duplicadosOmitidos`,
  `procesadoEn`; a create rejection → `Result.fail(PersistenciaFallidaError)`. Drop the
  old `createPending`/`markFailed` cases.
- `prisma-registrar-ingesta-fallida.repository.spec.ts` (**new**): assert
  `ingesta.create` called with `estado: FALLIDA`, `userId`, `nombreArchivo`, `motivoFallo`,
  and **no** `accountId`/`banco` (→ null); create rejection → `Result.fail`.
- `prisma-listar-ingestas.reader.spec.ts` (**edit**): assert WHERE `{ userId, estado: {
  in: ['PROCESADA','FALLIDA'] } }` (no `account:` join, no bare PROCESADA), `orderBy
  creadoEn desc`, and the widened row→`IngestaResumen` mapping incl. `banco: null`,
  `motivoFallo`, `estado`, `totalTransacciones ?? 0`.
- `persist-transactions.use-case.spec.ts` (**rewrite**): pass-through to a stub
  `persistirProcesada` — ok echoes `{ ingestaId, total, duplicadosOmitidos }`, fail
  propagates. Remove the lifecycle/`markFailed` cases.
- `process-ingesta.use-case.spec.ts` (**edit**): (a) on **every** failure branch, assert
  `ingestaFallidaWriter.registrar` is called once with `{ userId, nombreArchivo:
  getOriginalName(), motivo: <error.message> }`; (b) on the `catch` path, assert `motivo`
  is the **fixed generic** message (no leak); (c) a failing `registrar` does NOT change
  the returned Result and does NOT throw (island); (d) success path does **not** call
  `registrar`. Update the in-file `IIngestaRepository` stub (spec lines 217/245) to the
  new single-method port.

**Pre-existing tests that break under the persistence-path collapse (JD round 1 —
omitted from the first draft, restored here):**

- `apps/api/test/prisma-persistence.int-spec.ts` (**rewrite**): currently calls
  `createPending` / `commit` / `markFailed` directly (all three deleted, §6.3). Rewrite
  every case against the collapsed `persistirProcesada` API. Its **W3 — real
  `$transaction` atomicity** case (a partial write that violates the `cargo >= 0` CHECK
  mid-`createMany` rolls the **whole** transaction back to zero rows, no orphan) is the
  one existing proof that atomicity actually holds against Postgres — it MUST be
  re-expressed for the new single nested-write path, not dropped. See §10.2 for the
  equivalent proof.
- `apps/api/src/infrastructure/persistence/prisma-resumen-mes.repository.spec.ts`,
  `prisma-resumen-anual.repository.spec.ts`, `prisma-detalle-bucket.repository.spec.ts`
  (**edit, mechanical**): each seeds a fixture via `prisma.ingesta.upsert({ create: {
  ...} })` that now needs `userId` added to the `create` payload (same non-null-column
  edit as §5.3, applied to test fixtures rather than production writers).

(Correction to the earlier claim in §5.3: `prisma-demo.repository.ts` is the only
OTHER **production** `Ingesta` writer — the three specs above are test-fixture writers,
not production code, but they still need the mechanical `userId` edit to keep
compiling/passing against the non-null column.)

### 10.2 Backend integration — the isolation proof (mirror `eliminar-ingesta.int-spec.ts`)

`apps/api/test/historial-ingestas.int-spec.ts`, two users A/B, `RUN_ID` isolation +
`afterAll` cleanup, gated by `assertDestructiveDbAllowed` (`ALLOW_DESTRUCTIVE_DB=1` +
non-prod URL) on a disposable local Postgres (`apps/api/docs/local-test-db.md`). Same
ADR-028 debt posture: written now, **green run gated on provisioning local Postgres — not
silently skipped**.

- **RNF-SEC-006 (the trap):** register a FALLIDA row for user B (via the writer or a real
  early failure), then `reader.listarPorUsuario(A)` returns **none** of B's rows and
  `listarPorUsuario(B)` returns B's FALLIDA row. A reader that still used `account: {
  userId }` would **crash or drop** the account-less FALLIDA row — this test is the trap
  that catches a botched isolation switch.
- **Early failure end-to-end:** drive `ProcessIngestaUseCase.execute` with a bad-extension
  / unrecognized-bank file for user A → `Result.fail` AND exactly one FALLIDA row exists
  for A with `accountId = null`, `banco = null`, non-null `nombreArchivo` + `motivoFallo`.
- **Success invariant:** a real successful ingesta → one PROCESADA row with non-null
  `accountId`/`banco`/`totalTransacciones`; assert the DB CHECK by attempting a raw
  PROCESADA insert with null `accountId` and expecting a constraint violation.
- **Superset ordering (CA-01):** A has one PROCESADA + one FALLIDA → `listarPorUsuario(A)`
  returns both, `creadoEn` desc.
- **Atomicity proof, restored (equivalent to the deleted `prisma-persistence.int-spec.ts`
  W3 case, JD round 1):** drive a real `persistirProcesada` call whose
  `transacciones.createMany` payload contains one row that violates the `cargo >= 0`
  CHECK. Assert (a) the call returns `Result.fail(PersistenciaFallidaError)`, (b) **zero**
  `Ingesta` rows and **zero** `Transaccion` rows exist afterward for that attempt — the
  nested `ingesta.create` + `transacciones.createMany` is one implicit Postgres
  transaction, so a mid-`createMany` constraint violation rolls back the parent
  `Ingesta` row too, not just the failed `Transaccion` rows. This is the single-writer
  design's equivalent guarantee to the old two-commit path's W3 proof — it must exist
  in the suite, not just be asserted in prose.

**Pre-existing e2e test that inverts under ING-07 (JD round 1):**
`apps/api/test/ingesta.e2e-spec.ts`'s case `'rechaza un archivo .xls con 400 (falla en
IngestFile, antes de crear ninguna Ingesta)'` asserts today that an extension rejection
creates **no** `Ingesta` row. Under ING-07 this inverts: an extension rejection now
**must** create exactly one `FALLIDA` row (boundary `registrarFallo`, §3.2). The test
name and its DB assertion both need rewriting to assert the new (correct) behavior —
one `FALLIDA` row with `nombreArchivo` set and `motivoFallo` matching the extension
error, HTTP response unchanged (still 400).

### 10.3 Migration verification (offline, precedented)

`prisma validate` + `prisma generate` succeed against the `schema.prisma` diff without a
live DB; the hand-authored SQL mirrors the generated diff for the nullable/relation parts
and adds the raw CHECK. Backfill correctness is exercised by the integration suite on
local Postgres (seed pre-migration-shaped rows is not applicable — the disposable DB is
created at the current schema; the backfill logic is asserted by the SQL review +
supervised prod count check). **Recommended:** rehearse the same backfill `UPDATE`
against a prod snapshot/dump before the real prod apply, per the ADR-013 precedent
(§5.2) — the disposable-DB integration suite proves the SQL is correct in shape, not
that it behaves identically against prod's actual row population.

### 10.4 Web tests (vitest + Testing Library, jsdom)

- `client` test: `fetchIngestas` type-guard accepts a FALLIDA item (`banco: null`,
  `estado: 'FALLIDA'`, `motivoFallo` string, `totalTransacciones: 0`) and a PROCESADA
  item; rejects malformed.
- `ListaIngestas` component test: renders a FALLIDA row with its `motivoFallo`, `banco`
  as "—", and **no** delete control; renders a PROCESADA row with count + delete control.

### 10.5 Test fixture blast-radius (`Ingesta.userId` NOT NULL) — JD round 2

The new non-null `Ingesta.userId` column (§5.1/§5.2) breaks **every** existing test that
creates an `Ingesta` row (via `prisma.ingesta.create(...)` or `.upsert(...)`) without a
`userId`. §10.1/§12's earlier enumeration (`prisma-persistence.int-spec.ts`,
`ingesta.e2e-spec.ts`, and the three `prisma-resumen-*`/`prisma-detalle-bucket.repository.spec.ts`
upsert specs) is **incomplete**. This subsection is the authoritative, exhaustive list —
`sdd-tasks` must plan every file below, or it surfaces as a CI/compile break mid-apply,
not at planning time.

**A — mechanical fixes (add `userId:` to the existing fixture call, nothing else).**
Verified present in the repo via direct inspection, each creates/upserts an `Ingesta`
row without `userId`:

- `apps/api/test/backfill-categorias.int-spec.ts`
- `apps/api/test/auth-isolation.int-spec.ts`
- `apps/api/test/eliminar-ingesta.int-spec.ts`
- `apps/api/test/movimientos.e2e-spec.ts`
- `apps/api/test/categorizacion.int-spec.ts`
- `apps/api/test/movimientos-mes.int-spec.ts`
- `apps/api/test/resumen-anual.e2e-spec.ts`
- `apps/api/test/detalle-bucket.int-spec.ts`
- `apps/api/test/detalle-bucket.e2e-spec.ts`
- `apps/api/test/resumen.e2e-spec.ts`
- `apps/api/test/reclasificar-categoria.int-spec.ts`
- `apps/api/test/prisma-transaccion-existente-reader.int-spec.ts`

plus the three already-listed `prisma-resumen-mes.repository.spec.ts` /
`prisma-resumen-anual.repository.spec.ts` / `prisma-detalle-bucket.repository.spec.ts`
upsert specs (§10.1) — kept as previously documented, listed here again only for
completeness of the blast-radius view.

Each of these needs a plain `userId: <existing-or-new-test-user-id>` added to its
`Ingesta` fixture literal. No assertion logic changes. This is bulk mechanical work,
but it must be **enumerated** so `sdd-tasks` allocates it explicitly rather than
discovering it as a wall of red CI failures partway through `sdd-apply`.

**B — semantic trap, NOT mechanical: `apps/api/test/listar-ingestas.int-spec.ts`.**
This file needs more than a `userId` fixture add. Its test `'filters out non-PROCESADA
ingestas (PENDIENTE/FALLIDA) for the same user'` (~line 157) currently asserts:

```ts
expect(returnedIds).not.toContain(ingFallida.id);
```

Under the new ING-03/ING-07 requirement (§4.1, D7), FALLIDA rows are now **included**
in the historial list — so this assertion is the **semantic opposite** of the new,
correct behavior. Applying only the mechanical `userId` fix here would leave a test
that compiles, runs, and asserts precisely the wrong thing, silently.

**Required rewrite** — the new expected behavior for this test:
- The `ingFallida` fixture (FALLIDA) **IS** returned by `listarPorUsuario` for its
  owning user — replace `not.toContain` with `toContain` (or equivalent) for that row.
- A **manually-inserted PENDIENTE** fixture is still **excluded** — the reader's WHERE
  clause selects `estado IN [PROCESADA, FALLIDA]` only (§4.1), so PENDIENTE remains
  filtered out. Add or keep a PENDIENTE fixture in this test specifically to assert
  that continued exclusion, so the "PROCESADA/FALLIDA in, PENDIENTE out" boundary stays
  covered.

**Warning to `sdd-apply`:** do not treat this file as "fix the compile error by adding
`userId`" and move on — the pre-existing assertion is now asserting the wrong outcome
and must be rewritten, not merely made to compile.

## 11. Edge cases

| Case | Behavior | Mechanism |
|---|---|---|
| Extension reject (pre-everything) | one FALLIDA row, `nombreArchivo` from `getOriginalName()`, banco/accountId null | boundary `registrarFallo` (§3.2) |
| Bank not recognized (pre-account) | same as above | boundary |
| Late failure (structure/normalize/dedupe) | one FALLIDA row, banco/accountId **null** (not enriched) | boundary; enrichment is a follow-up (§3.3) |
| Crash mid-pipeline (unexpected throw) | one FALLIDA row with the **fixed generic** motivo (no leak) | `execute` catch (§3.2) |
| Failure-write itself fails (DB down) | zero row, degraded log, original error returned | island posture (§3.2) — same observable state as today |
| Legacy orphan PENDIENTE in prod | hidden from historial | reader `estado: { in: [PROCESADA, FALLIDA] }` (§4.1) |
| PROCESADA with null accountId | impossible | single-writer invariant + DB CHECK (§3.1/§3.4) |
| FALLIDA row + US-018 delete | not offered; delete affordance gated to PROCESADA | web guard (§8) |
| Money views over failure rows | invisible | failure rows have zero `Transaccion`; money views isolate via `Transaccion.account` |

## 12. Files summary

**Backend — new:** `application/ports/registrar-ingesta-fallida.port.ts` ·
`infrastructure/persistence/prisma-registrar-ingesta-fallida.repository.ts` (+ spec) ·
`prisma/migrations/<ts>_ingesta_userId_nullable_account_banco/migration.sql` ·
`test/historial-ingestas.int-spec.ts`.

**Backend — edit:** `prisma/schema.prisma` (Ingesta.userId + relations, accountId/banco
nullable, User back-relation) · `application/ports/ingesta-repository.port.ts` (collapse to
`persistirProcesada`) · `application/use-cases/persist-transactions.use-case.ts` (+ spec) ·
`application/use-cases/process-ingesta.use-case.ts` (boundary registration; + spec) ·
`infrastructure/persistence/prisma-ingesta.repository.ts` (+ spec) ·
`infrastructure/persistence/prisma-listar-ingestas.reader.ts` (+ spec) ·
`application/ports/listar-ingestas.port.ts` (widen `IngestaResumen`) ·
`infrastructure/http/dto/ingesta-list.dto.ts` (widen) ·
`infrastructure/persistence/prisma-demo.repository.ts` (add `userId`; + spec) ·
`infrastructure/http/auth/demo-cleanup.service.ts` (direct-`userId` `Ingesta` delete,
§5.3; + spec) ·
`composition/crear-process-ingesta.ts` (wire failure writer + thread `userId`).

**Backend — pre-existing tests that break under this change (JD round 1, §10.1/§10.2):**
`test/prisma-persistence.int-spec.ts` (rewrite for the collapsed `persistirProcesada`
API; restore the W3 atomicity proof) · `test/ingesta.e2e-spec.ts` (rewrite the
`.xls`-rejection case — it now creates a `FALLIDA` row instead of none) ·
`infrastructure/persistence/prisma-resumen-mes.repository.spec.ts`,
`prisma-resumen-anual.repository.spec.ts`, `prisma-detalle-bucket.repository.spec.ts`
(mechanical: add `userId` to each fixture's `ingesta.upsert({ create: {...} })`).

**Backend — additional pre-existing tests broken by `Ingesta.userId` NOT NULL (JD round
2, full enumeration in §10.5):** twelve further mechanical fixture edits —
`test/backfill-categorias.int-spec.ts`, `test/auth-isolation.int-spec.ts`,
`test/eliminar-ingesta.int-spec.ts`, `test/movimientos.e2e-spec.ts`,
`test/categorizacion.int-spec.ts`, `test/movimientos-mes.int-spec.ts`,
`test/resumen-anual.e2e-spec.ts`, `test/detalle-bucket.int-spec.ts`,
`test/detalle-bucket.e2e-spec.ts`, `test/resumen.e2e-spec.ts`,
`test/reclasificar-categoria.int-spec.ts`,
`test/prisma-transaccion-existente-reader.int-spec.ts` — plus **one non-mechanical
semantic rewrite**, `test/listar-ingestas.int-spec.ts`, whose `'filters out
non-PROCESADA ingestas'` assertion inverts under ING-03/ING-07 (FALLIDA now included,
PENDIENTE still excluded) and must be rewritten, not just given a `userId` fixture. See
§10.5 for the exact required expectations.

**Web — edit:** `api/types.ts` · `api/client.ts` · `components/ListaIngestas.tsx`
(+ `IngestaItem`) · `components/EliminarIngestaControl.tsx` (banco null-tolerance) (+ tests).

**Schema/migration:** one migration (nullable add + backfill + set-not-null + FK + index +
relax accountId/banco + raw CHECK).

## 13. Slicing (informs sdd-tasks; combined > 400 LOC → likely chained PRs)

- **Slice 1 — backend:** migration + `schema.prisma` + failure port/adapter + boundary
  registration in `ProcessIngestaUseCase` + persist-path collapse + reader/DTO/read-model
  widen + demo-repo fix + unit specs + integration spec (green run gated on local
  Postgres). This is the RNF-SEC-006-touching, money-adjacent slice.
- **Slice 2 — web:** types/client/list/badge/null-tolerance + tests. Consumes Slice 1's
  contract.

PR strategy (stacked-to-main vs feature-branch-chain) is decided by `sdd-tasks` per
`delivery_strategy`/`chain_strategy`. **No tasks planned here.**

## 14. ADR-style decision log

- **D1 — Terminal-only registration; boundary is the sole FALLIDA writer; persist
  collapses to an atomic PROCESADA create (drop eager PENDIENTE + `markFailed`).**
  Single-writer-per-state (DRY), no orphaned PENDIENTE (retires the PR3 debt for this
  path), stronger atomicity (KISS). Rejected: surgical keep-`createPending`+add-boundary
  (needs a fragile "already recorded" signal — two FALLIDA writers).
- **D2 — Failure rows carry `userId` + `nombreArchivo` + `motivoFallo` only; `banco`/
  `accountId` null even for late failures.** Boundary holds only these reliably; threading
  resolved bank through 8 return sites is the per-branch plumbing DRY sought to avoid, and
  no CA needs bank-on-failure (YAGNI). More info than today for early failures, **less**
  than today for late failures (the existing hidden `markFailed` rows retain `banco`/
  `accountId`) — an accepted, documented tradeoff (§3.3), not a strict improvement.
  Enrichment is a documented follow-up.
- **D3 — New narrow `IRegistrarIngestaFallidaWriter` port + adapter (ISP/SRP), not an
  extension of `IIngestaRepository`.** The failure recorder and the success aggregate have
  different reasons to change; mirrors the US-018 narrow-port precedent.
- **D4 — Direct non-null `Ingesta.userId`; isolate the reader by `userId`, not the
  `account` join.** The only mechanism that can isolate an account-less failure row
  (RNF-SEC-006 stronger, not weaker). Locked by the proposal; realized here.
- **D5 — `Ingesta.accountId`/`banco` relaxed to nullable.** Honest modeling of a
  bank-less early failure; zero money-view impact (`Transaccion.accountId` is separate).
- **D6 — Invariant `PROCESADA ⟹ accountId NOT NULL` enforced BOTH in application
  (single-writer) AND a raw-SQL partial CHECK** (defense-in-depth, money-integrity;
  precedent `add_cargo_abono_check`; Prisma can't model CHECK).
- **D7 — Reader filter `estado ∈ {PROCESADA, FALLIDA}`, not "all" and not bare
  PROCESADA.** Shows successes + failures, hides legacy/transient PENDIENTE so the web
  handles exactly two states (CA-02 exitoso/fallido; CANCELADA out).
- **D8 — US-018 preserved by gating the web delete affordance to `estado === PROCESADA`.**
  No change to the delete backend/isolation; deleting failed attempts is a follow-up
  (open question 3), not built. Load-bearing merge guard.
- **D9 — `userId` backfill runs inside the migration transaction (deterministic join),
  not a separate ADR-013-style supervised script**, because it is a single atomic UPDATE;
  prod supervision is a before/after null-count check (documented), **plus a rehearsal
  of the join-based `UPDATE ... FROM Account` against a prod snapshot/dump before the
  real prod apply** (§5.2/§10.3), matching the ADR-013 supervised-backfill precedent
  rather than relying on the count check alone.
```
