# Proposal: US-057 — Split preview/commit for cartola import

- **Change**: `us-057-import-preview-commit`
- **Issue**: [#291](https://github.com/Juargo/MoneyDiary/issues/291) · Milestone `Sprint-15` · `must` · `epic:ingesta`
- **Status**: Proposed (2026-08-20)
- **Requires new ADR**: No (this change stays within ADR-005/011/024/026; it refines the ingesta flow, it does not add a cross-cutting decision). If the design phase concludes the commit contract deserves an architectural record, it adds one — not assumed here.

## Intent

Split the cartola import into two explicit steps so **uploading a file never persists anything**.

Today `POST /api/ingestas` runs one shot: it parses, deduplicates, persists, and categorizes in a
single request. The user has no chance to review totals, see which rows are duplicates, or correct a
mis-classified row before committing. US-057 makes the flow **preview → review/edit → commit**:

1. **Preview** (`POST /api/ingestas/preview`) returns the *full* parsed result — every row, its
   totals, its dedup status against the user's history, and a suggested `bucket`+`categoría` per row
   drawn from that user's own catalog (ADR-036/037) — and **writes nothing**.
2. **Commit** (`POST /api/ingestas/commit`) receives the user's per-row classification edits and is
   the **only** step that persists, re-running dedup at commit time and registering historial
   (US-004).

After this change the backend exposes a review-before-persist contract; the old one-shot
`POST /api/ingestas` is marked deprecated (not removed) so mobile keeps working until US-061.

This change is **backend only**. The web UI (US-059) and mobile UI (US-061) consume it later.

## Why now

1. **Import is irreversible today and the user flies blind.** A wrong bank detection, an unexpected
   duplicate batch, or a mis-classified row all land in the database before the user sees anything.
   The only remedy is `DELETE /api/ingestas/:id` (US-018) after the damage — a reactive undo, not a
   review. Preview turns import into an informed, correctable decision.
2. **The seam already exists but is half-built.** `PreviewIngestaUseCase` and
   `POST /api/ingestas/preview` already exist and are wired in both web and mobile clients — but
   preview only returns a 50-row sample with no dedup and no suggested classification, so it cannot
   drive a real review screen. US-057 completes the seam the codebase already committed to.
3. **It unblocks the client stories in this epic.** US-059 (web review UI) and US-061 (mobile) both
   need a preview that shows duplicates and editable classifications, and a commit that accepts the
   edits. Neither can be built on the current sample-only preview.
4. **The per-user catalog just shipped.** ADR-036/037 made classification per-user and editable.
   Preview is the natural place to surface "here is how *your* catalog classified this import, fix it
   before it lands" — the value of the per-user catalog is only realized at the point of import.

## Scope

### In scope

- **Preview returns ALL rows (decision 1).** Lift the `PREVIEW_SAMPLE_MAX = 50` cap for this flow so
  the full normalized set is reviewable and editable end to end. The row index the user edits must
  address the full set, not a 50-row window.
- **Preview gains dedup status (CA-01, CA-03).** Preview reports, per row and in aggregate, which
  rows already exist in the user's history, reusing the existing natural-key dedup
  (`fecha+descripcion+cargo+abono`). Preview must acquire `userId` to scope this query.
- **Preview gains suggested classification (CA-01).** Each row carries a suggested
  `bucket`+`categoríaId` computed from the caller's own catalog (ADR-036/037), reusing the existing
  categorization logic. `null` when no pattern matches (same semantics as the current pipeline:
  non-Ingreso rows may stay unclassified).
- **Preview keeps its no-write guarantee (CA-04).** Preview must not create or mutate any row —
  including no `Account` row. This requires a **read-only account lookup** instead of the write-
  capable `IAccountRepository.ensure()`. The `crearPreviewIngesta(...)` composition helper must keep
  taking no write-capable dependency, so the guarantee stays enforced by construction, not only at
  runtime.
- **New commit endpoint (`POST /api/ingestas/commit`, CA-02).** Accepts the file plus a per-row edits
  overlay `[{ rowIndex, categoriaId }]`, re-parses server-side (server stays authoritative), applies
  the overlay over auto-classification, re-runs dedup, and persists.
- **Dedup runs at commit too (CA-03).** Commit re-runs the same dedup against the current DB state
  (history may have changed between preview and commit). Newly-detected duplicates are **omitted and
  reported by count** — commit never aborts because of duplicates (decision 3, matches today's
  conservative behaviour).
- **Commit registers historial + is isolated (CA-06).** Commit writes the `Ingesta` + `Transacciones`
  atomically via the existing `IIngestaRepository.persistirProcesada()` (US-004), scoped by `userId`
  in every WHERE (RNF-SEC-006), with an integration test proving user B cannot commit into user A's
  data.
- **Descriptive errors, amounts scrubbed (CA-04).** Invalid bank/structure at preview *and* commit
  return the existing descriptive error with amounts scrubbed from the message.
- **`POST /api/ingestas` marked `deprecated` in openapi.json (CA-05, decision 4).** The one-shot
  endpoint stays live and functional; only its contract is annotated deprecated. Physical removal is
  US-061.
- **openapi.json updated (CA-06, ADR-011).** Extend `PreviewIngestaResponse` (per-row dedup +
  suggested classification, full rows), add `CommitIngestaRequest`/`CommitIngestaResponse`, mark
  `POST /api/ingestas` deprecated.

### Non-goals (out of scope)

- **Web UI (US-059) and mobile UI (US-061).** This change ships the contract, not the screens.
- **Bank parsing strategies.** No change to detection, structure validation, or normalization for any
  bank. Preview and commit reuse the existing pipeline verbatim.
- **Excluding rows from the import (decision 2).** Per-row editing is **only** `bucket`/`categoría`.
  A "skip this row" capability is a possible future US, explicitly not built here.
- **Editing amounts, dates, or descriptions.** The server-parsed row is authoritative for money and
  identity fields; the overlay can only reassign classification.
- **Physical removal of `POST /api/ingestas`.** Deprecation only; removal is US-061 once mobile
  migrates. No permanent dual write path (CA-05).
- **Server-side staging / a `PREVIEW` ingesta state.** No new `EstadoIngesta` value, no staged rows,
  no TTL cleanup job (see Approach §1). Preview stays stateless.
- **Any schema migration.** The commit mechanism is stateless (re-upload + overlay); nothing new is
  persisted at preview, so `schema.prisma` is untouched.

## Approach

### 1. Commit mechanism — stateless re-upload + edits overlay (decision 5, recommended)

Commit is **stateless**: the client re-sends the file plus an edits overlay; the server re-parses and
stays the single source of truth for parsing, money, and dedup. No server-side preview state, no new
`EstadoIngesta`, no migration, no TTL cleanup job.

`POST /api/ingestas/commit` (multipart):

1. `file` — the same cartola the user previewed (multipart file field, reuses the existing
   `subirArchivo()` multer middleware).
2. `edits` — a JSON string field carrying `[{ rowIndex: number, categoriaId: string | null }]`
   (the overlay). Sending structured JSON alongside a file means one multipart text field holding
   JSON, parsed and validated server-side. This is the one shape that deviates from the existing
   route pattern and the design phase pins it (field name, size cap, validation).

Server pipeline at commit (reuses `ProcessIngestaUseCase`'s pipeline, adds one overlay step):

```
IngestFile → detect → account lookup/ensure → validate → normalize
           → detectarDuplicados (against current DB)         [CA-03]
           → apply edits overlay over auto-classification     [new step, CA-02]
           → persistTransactions (omit new duplicates, count) [decision 3]
           → runCategorizacion for rows without an overlay    [degradable island, unchanged]
           → persistirProcesada (Ingesta + Transacciones, historial US-004, atomic) [CA-06]
```

The overlay overrides the auto-classification result for the named rows only; rows with no overlay
entry keep the existing degradable-island behaviour (catalog failure ⇒ only `Ingreso` written, rest
`null`, retry-safe).

**Why stateless over server-side staging (Approach B rejected):** staging needs a new
`EstadoIngesta.PREVIEW` (schema migration), orphaned-preview cleanup (a new background job for a
solo-dev app — YAGNI anti-pattern), and it forces `PreviewIngestaUseCase` to gain persistence ports,
destroying the cleanest architectural seam in the codebase (preview is no-write **by construction**).
Stateless commit adds no schema, no job, no persistence in preview. Tradeoff accepted: the file is
parsed twice (once at preview, once at commit) and bandwidth is ~2x. Files are ≤10MB and imports are
low-frequency; acceptable for the current scale. **Trigger to revisit:** a measured latency problem
on large files, or a real need to let the user leave and resume a review — at which point staging
behind a cleanup job becomes a deliberate, isolated change.

**Why re-upload (A1) over sending client rows as JSON (A2):** A2 lets the client dictate which rows
and what amounts get persisted — a row-injection attack surface on financial data, and it loses the
server's ability to re-verify bank/structure. A1 keeps the server authoritative on every money field
by re-parsing; the client can only *reassign classification*, never invent a transaction.

### 2. Preview no-write guarantee — read-only account lookup (CA-04)

Dedup needs to know the user's `Account` to scope the "already imported?" query, but the existing
`IAccountRepository.ensure()` is a read-*upsert* — it writes a new `Account` row when none exists,
which would break the no-write guarantee at preview.

Resolution (design pins the exact port shape): add a **read-only** account lookup —
`findByBanco(userId, banco, ...) → accountId | null`. When it returns `null` (user never imported
from this bank) the dedup count is simply 0 — no account, no prior transactions, no write. This
preserves the invariant that `crearPreviewIngesta(...)` takes no write-capable dependency, so the
no-write guarantee remains enforced by construction (a reviewer sees preview cannot write because it
was never handed anything that can).

Commit continues to use the write-capable `ensure()` — creating the account at commit is correct and
expected.

### 3. Preview response extension (CA-01)

`PreviewIngestaResponse` grows from "sample of normalized rows" to "full reviewable import":

```
PreviewIngestaResponse
  banco, tipoCuenta, numeroCuenta          (unchanged)
  estructura: { totalFilasDatos }          (unchanged; pre-dedupe count)
  resumen: {                               (new, aggregate for CA-01)
    totalFilas, duplicadosDetectados, nuevas
  }
  filas: PreviewFilaDto[]                   (was `muestra`, now ALL rows — decision 1)

PreviewFilaDto
  rowIndex: number                         (new; addresses the full set, drives the commit overlay)
  fecha, descripcion
  cargo: string, abono: string             (BigInt-safe strings, unchanged)
  esDuplicado: boolean                     (new, CA-01/CA-03)
  sugerido: { bucket, categoriaId | null } (new, CA-01; from the caller's own catalog)
```

`rowIndex` is the contract that ties preview to commit: the overlay's `rowIndex` refers to a
`PreviewFilaDto.rowIndex`, so the two endpoints agree on row identity without the client re-deriving
it. Money stays string-typed end to end (BigInt-safe DTO rule).

### 4. Commit contract (CA-02, CA-03, CA-06)

```
POST /api/ingestas/commit   (multipart/form-data, authenticated + x-api-key)
  file:  <cartola .xlsx|.pdf>                       (same file previewed)
  edits: "[{ \"rowIndex\": 3, \"categoriaId\": \"cat_x\" }]"   (JSON string field)

CommitIngestaResponse  (reuses today's IngestaResponseDto shape)
  ingestaId
  totalTransacciones
  duplicadosOmitidos        (decision 3 — new duplicates omitted at commit, reported not aborted)
  transacciones[]           (persisted rows with final bucket/categoría)
```

Validation at commit: each overlay `categoriaId` must belong to the caller's own catalog (RNF-SEC-006
— reject cross-tenant category ids); each `rowIndex` must be in range of the re-parsed set; malformed
`edits` JSON is a descriptive 400 with amounts scrubbed. Design pins the `edits` size cap and the
exact validation errors.

### 5. Transition plan for CA-05 — soft deprecate (decision 4)

- `POST /api/ingestas` (one-shot) stays **live and unchanged** in behaviour; it is annotated
  `deprecated: true` in `openapi.json` now. Mobile (ADR-026) keeps calling it until US-061.
- No feature flag, no env toggle, no dual-writing logic branch — the two endpoints coexist as plain
  routes until US-061 physically removes the deprecated one. CA-05's "once clients migrate" qualifier
  explicitly permits mobile to stay on the old contract this sprint.
- A short transition note (in the ADR table row for ADR-026 or the ingesta runbook, design decides
  where) records: deprecated at US-057, removal tracked by US-061. This is the "documented transition,
  no permanent dual flow" CA-05 asks for.

### 6. Clean Architecture placement (ADR-005, ADR-024)

- **New `CommitIngestaUseCase`** in `application/use-cases/` — Spanish-named, orchestrates the
  pipeline + overlay + persist, returns `Result<CommitIngestaResult, IngestaError>` (never throws).
  It is the write twin of the existing preview; `ProcessIngestaUseCase` is refactored so both share
  the parse→dedup→persist pipeline rather than duplicating it (DRY, with the overlay step as the one
  difference). Design decides whether commit *is* the refactored `ProcessIngestaUseCase` with an
  overlay parameter or a sibling that reuses its steps — both are acceptable; the constraint is one
  source of truth for the pipeline.
- **New read-only account port** (`IAccountReader.findByBanco` or equivalent) in
  `application/ports/`, Prisma adapter in `infrastructure/persistence/`, scoped by `userId`.
- **`PreviewIngestaUseCase`** gains `userId`, the read-only account lookup, the dedup reader, and the
  categorization logic — but **no** write-capable port. The composition helper signature is the
  guardrail.
- HTTP wiring (`ingesta.routes.ts`, DTOs, `container.ts`) in `infrastructure/`, English-named.
- The overlay is applied in application logic; the server never trusts client money — SOLID/ISP: the
  new account reader is a small read-only port, not a widening of `IAccountRepository`.

## Affected areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/application/use-cases/preview-ingesta.use-case.ts` | Modified | Gains `userId`, read-only account lookup, dedup, suggested classification; returns full rows (no 50 cap) |
| `apps/api/src/application/use-cases/commit-ingesta.use-case.ts` (or refactored process) | New/Modified | Pipeline + edits overlay + dedup-at-commit + persist |
| `apps/api/src/application/use-cases/process-ingesta.use-case.ts` | Modified | Pipeline extracted/shared with commit; overlay step added |
| `apps/api/src/application/ports/account-reader.port.ts` | New | Read-only `findByBanco(userId, banco)` → `accountId \| null` |
| `apps/api/src/infrastructure/persistence/prisma-account-reader.repository.ts` | New | `where: { userId, banco }`, no upsert |
| `apps/api/src/application/use-cases/detectar-duplicados.use-case.ts` | Reused/Modified | Reused at preview (via accountId-or-0) and at commit |
| `apps/api/src/infrastructure/http-express/routes/ingesta.routes.ts` | Modified | New `POST /api/ingestas/commit`; preview thread `userId`; reuse `subirArchivo()` |
| `apps/api/src/infrastructure/http/dto/preview-ingesta.dto.ts` | Modified | `resumen`, per-row `rowIndex`/`esDuplicado`/`sugerido`, all rows |
| `apps/api/src/infrastructure/http/dto/ingesta-response.dto.ts` | Reused | Commit response reuses this shape |
| `apps/api/src/infrastructure/http/dto/commit-ingesta.dto.ts` | New | `edits` JSON field parse + validation (in-catalog `categoriaId`, `rowIndex` range) |
| `apps/api/src/composition/crear-preview-ingesta.ts` | Modified | Add read-only reader + dedup + catalog; **no** write-capable dependency |
| `apps/api/src/composition/container.ts` | Modified | Wire commit use case + new port |
| `apps/api/openapi.json` + `infrastructure/http-express/schemas/openapi-json.ts` | Modified | Extend preview schema, add commit schemas, mark `POST /api/ingestas` deprecated |
| `apps/api/test/**` | New/Modified | Unit tests (preview no-write, overlay, dedup-at-commit) + `userId` isolation integration test for commit |
| `docs/adr/README.md` or ingesta runbook | Modified | CA-05 transition note (deprecated at US-057, removed at US-061) |
| `apps/web/**`, `apps/mobile/**` | **Unchanged** | Client consumption is US-059 / US-061 |
| `apps/api/prisma/schema.prisma` | **Unchanged** | Stateless commit needs no migration |

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Preview silently regains write capability** (e.g. commit code reuse pulls `ensure()` into preview) | Medium | High (CA-04 violation, no-write guarantee is the whole point) | Read-only account port; `crearPreviewIngesta` takes no write-capable dependency; unit test asserts preview touches no writer; reviewer signal preserved by construction |
| **`edits` overlay lets a client persist a cross-tenant category** | Medium | High (RNF-SEC-006) | Validate every `categoriaId` belongs to the caller's own catalog before persist; integration test for user-B-into-user-A |
| **`rowIndex` mismatch between preview and commit** (file changed, or re-parse yields different order) | Medium | Medium (wrong row reclassified) | Server re-parses deterministically; `rowIndex` addresses the re-parsed set; out-of-range index ⇒ descriptive 400; overlay is advisory (a stale index reclassifies nothing rather than the wrong row) — design pins the exact semantics |
| **Dedup state differs preview→commit** (history changed between the two calls) | Medium | Low | CA-03 re-runs dedup at commit; new duplicates omitted + counted (decision 3), never aborts |
| **Double parse cost on large files** | Low | Low | Files ≤10MB, low frequency; measured, not assumed; staging deferred with a documented trigger |
| **Multipart file + JSON `edits` field is an unusual shape** | Medium | Medium | Design pins field name, JSON size cap, and validation; reuse `subirArchivo()`; document in openapi.json |
| **Pipeline sharing between preview/commit/process drifts** | Medium | Medium | One source of truth for parse→dedup→persist (DRY); tests pin the shared pipeline; overlay is the only commit-specific step |
| **Deprecation breaks mobile** | Low | High | `deprecated: true` is annotation only; endpoint behaviour unchanged; removal deferred to US-061 (CA-05) |
| **openapi.json drifts from real schema** (ADR-011) | Medium | Medium | Regenerate from the TS schema source; CI contract check; verify preview/commit/deprecated all reflected |
| **Strict TDD friction on new ports/use cases** | Low | Low | Each new use case/port lands test-first with fakes; `dedup-at-commit` and isolation need the local ephemeral DB (`local-test-db.md`) |

## Success criteria

| AC | Criterion |
|----|-----------|
| CA-01 | `POST /api/ingestas/preview` returns the full row set with per-row `esDuplicado` + suggested `bucket`/`categoríaId` (from the caller's catalog) and aggregate totals, and persists **nothing** (verified: no `Account`/`Ingesta`/`Transaccion` row created) |
| CA-02 | `POST /api/ingestas/commit` accepts the file + `[{rowIndex, categoriaId}]` overlay, applies the overlay over auto-classification, and only then persists |
| CA-03 | Dedup runs at preview (reported) **and** at commit (re-run against current DB); new duplicates at commit are omitted and reported by count, never aborting the commit |
| CA-04 | Invalid bank/structure at preview and commit returns the existing descriptive error with amounts scrubbed; preview's no-write guarantee holds by construction |
| CA-05 | `POST /api/ingestas` is `deprecated: true` in openapi.json, still functional; a transition note records removal is tracked by US-061; no permanent dual write path |
| CA-06 | Commit registers historial (US-004) atomically; an integration test proves user B cannot commit into or read user A's data (RNF-SEC-006); openapi.json reflects the new/extended/deprecated contracts (ADR-011) |
| — | Regression guard: `POST /api/ingestas` (one-shot) still behaves identically for existing mobile callers |
| — | `pnpm api test`, `pnpm api test:integration` (local ephemeral DB), `pnpm api exec tsc --noEmit`, and the openapi.json contract check all green |

## Rollback plan

1. No schema migration — rollback is code-only and clean.
2. Reverting removes `POST /api/ingestas/commit` and the preview extension; the one-shot
   `POST /api/ingestas` was never removed, so existing clients (mobile, un-migrated web) keep working
   with zero data risk.
3. openapi.json is regenerated from source, so reverting the code reverts the contract.

## Open questions (non-blocking — resolve in design)

1. **`edits` field encoding and size cap.** JSON string in a multipart field is the working
   assumption; design pins the exact field name, max size, and the malformed-JSON error shape. Not a
   product question — a contract detail.
2. **Stale `rowIndex` semantics.** If a re-parse yields a different row count than the previewed set
   (file edited between preview and commit), does an out-of-range overlay entry 400 the whole commit
   or get ignored per-entry? Proposed: out-of-range ⇒ descriptive 400 (fail closed, the file changed
   under the user); design confirms. Not a product decision — a robustness detail.
3. **Whether commit is `ProcessIngestaUseCase` + overlay param or a sibling use case.** Both satisfy
   the constraints; design picks based on how cleanly the shared pipeline extracts. Pure structure.

None blocks the spec or design phase.
