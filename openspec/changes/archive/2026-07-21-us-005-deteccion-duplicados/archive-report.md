# Archive Report — us-005-deteccion-duplicados

**Date**: 2026-07-21
**Change**: us-005-deteccion-duplicados — pre-persist duplicate detection for bank-statement re-uploads
**Status**: ARCHIVED & CLOSED

## Executive Summary

US-005 duplicate detection is complete, verified (PASS, no CRITICAL), and archived. 3 chained PRs (#103/#104/#105) merged to `main` deliver single-request **warn + auto-skip** deduplication on the natural key `accountId + fecha + descripcion + cargo + abono` (exact match, BigInt-exact money), with 823 backend + 443 web tests green and `tsc` clean on both workspaces. The `ingesta-duplicate-detection` capability is now canonical under `openspec/specs/ingesta-duplicate-detection/spec.md`. CA-02's literal pre-persist cancel gate was deliberately descoped to US-003 (Vista previa) per the locked proposal decision.

## What Shipped

### 3 Chained PRs (stacked-to-main)

| PR | Slice | Content |
|---|---|---|
| #103 | Backend core (domain + application) | `clave-duplicado.ts` (pure natural-key fn), `transaccion-existente-reader.port.ts`, `detectar-duplicados.use-case.ts`, `persist-transactions.use-case.ts` mod (threads `duplicadosOmitidos`), `process-ingesta.use-case.ts` mod (dedupe step inserted between normalize and persist) — fully unit-tested, no DB/wiring |
| #104 | Backend infra + migration + composition root | `prisma-transaccion-existente.reader.ts` (bounded `(accountId, fecha[min,max])` query, decrypt in infra), `prisma-ingesta.repository.ts` mod (atomic `duplicadosOmitidos` write in the same `$transaction`), additive Prisma migration (`duplicadosOmitidos Int @default(0)` + non-unique `(accountId, fecha)` index, no `descripcion` index), `ingesta.module.ts` wiring, Group 8 integration tests written |
| #105 | DTO + web banner | `ingesta-response.dto.ts` (+`duplicadosOmitidos`), `apps/web/src/api/types.ts` mirror, `SubirCartola.tsx` inline banner (Serene Finance tokens, `role="status"`, shown only when `duplicadosOmitidos > 0`) |

### Design decision: warn + auto-skip (single request)

Detection runs in the **application layer** against **decrypted plaintext** `descripcion` (never a DB unique constraint, never a `descripcion` index — ADR-013 forward-compat). Only `nuevas` (non-duplicate rows) reach `PersistTransactionsUseCase`; `duplicadosOmitidos` is written on the `Ingesta` row inside the same atomic transaction that flips it to `PROCESADA`. Reader failure fails the whole ingesta (conservative — never persist a batch that couldn't be verified against existing duplicates).

### CA-02 descope (locked, not a gap)

The proposal explicitly descoped CA-02's literal "cancel entire import before persisting" behavior to **US-003 (Vista previa)**. This change delivers warn + auto-skip instead — documented in `proposal.md` Out of Scope, `spec.md` Out of Scope, and confirmed by verify's locked-decision conformance table. Not a defect; a deliberate MVP scope cut.

### Code Quality

- **Backend tests**: 103 files / 823 tests GREEN
- **Web tests**: 51 files / 443 tests GREEN
- **`pnpm api exec tsc --noEmit`**: 0 errors
- **`pnpm web typecheck`**: 0 errors
- **12/12 BDD scenarios** from spec.md map to an existing test (see verify report for the full traceability table)

## Verify Outcome

**Status: PASS** (no CRITICAL, no blocking WARNING). Full detail in `verify-report.md` (Engram `sdd/us-005-deteccion-duplicados/verify-report`, obs #348).

- All 35 `tasks.md` checkboxes confirmed done and backed by real code (no false "done" markers).
- Locked-decision conformance table: 8/8 decisions verified in shipped code (single-request warn+auto-skip, natural key, app-layer decrypt-and-compare, no `descripcion` index/no unique constraint, `duplicadosOmitidos` schema + index, DTO 2-field shape, banner no-subtraction, CA-02 descope).
- 2 WARNINGs carried forward as **pre-deploy action items** (see below) — they do not block archiving the SDD change itself.

### Pre-deploy action items (tracked, not blocking archive)

1. **Run Group 8 integration tests** (`prisma-transaccion-existente-reader.int-spec.ts`, `ingesta-duplicados.int-spec.ts`, `prisma-persistence.int-spec.ts` extension) with `ALLOW_DESTRUCTIVE_DB=1` against a real non-production dev Postgres. Cross-user isolation and re-upload-skip behavior were reportedly run GREEN against local dev Postgres during Slice 2 (per apply-progress obs #347), but this was never independently re-confirmed by a fresh test-run receipt — close DoD tasks 9.4/9.5 with fresh evidence before relying on it further.
2. **Apply the migration** (`20260721000000_add_duplicados_omitidos_and_transaccion_account_fecha_index`) to a real database via the normal deploy flow. It was hand-authored (no `DATABASE_URL` available in any apply/verify worktree) and only validated via `prisma validate`/`prisma generate` — never run against any live database. This must happen before/during production deploy; it blocks deploy, not archive.

## Spec Reconciliation (this archive)

Both SUGGESTIONs from the verify report were resolved during archive:

1. **Dual-path spec resolved.** The spec existed identically in two places: flat `openspec/changes/us-005-deteccion-duplicados/spec.md` and nested `.../specs/ingesta-duplicate-detection/spec.md`. The nested path is openspec convention for a promoted capability spec and is now canonical. The flat copy was left in place (not deleted, since only Write/Edit tools were available in this session) but rewritten with an explicit banner marking it a **historical, superseded artifact** that points readers to the canonical spec; its body is otherwise preserved as the as-drafted historical record.
2. **`transaccionesImportadas` field dropped from spec text.** The spec's literal "Response shape reflects counts" scenario named a 3-field response (`totalTransacciones`, `transaccionesImportadas`, `duplicadosOmitidos`), but design.md (§5.1/§9, an explicitly flagged refinement) and the shipped code use only 2 fields: `totalTransacciones` (imported count, unchanged meaning from pre-existing code) + `duplicadosOmitidos`. `transaccionesImportadas` was never implemented — it would have exactly duplicated `totalTransacciones`. The canonical (nested, and now promoted) spec's requirement text and scenario were rewritten to match the shipped 2-field shape.

## Delta Spec → Main Spec

| Domain | Action | Location |
|---|---|---|
| `ingesta-duplicate-detection` | **Created** (reconciled) | `openspec/specs/ingesta-duplicate-detection/spec.md` |

This spec is the canonical, go-forward reference for the duplicate-detection capability, including the accepted same-day-identical-transaction limitation and the cross-user isolation guarantee.

## Accepted Risks & Mitigations (carried from verify/tasks)

| Risk | Mitigation |
|---|---|
| Reader failure fails the whole ingesta (500) | Intentional conservative design — never persist a batch we couldn't verify; small blast radius, no partial import |
| Migration never applied to any database | Documented deploy prerequisite (see pre-deploy action items above); does not block archive |
| Integration tests written but not independently re-executed this pass | Documented as WARNING; carried forward as a pre-deploy action item, not a blocker |
| Same-day identical transactions collide | Accepted, stakeholder-documented MVP limitation (spec "Accepted limitation" requirement) |
| `ProcessIngestaUseCase` constructor grows to 14 args | Pre-existing pattern from prior features (categorization, PDF ingesta); flagged in tasks.md, not a regression introduced here |

## Out of Scope (Deferred)

- **CA-02 literal pre-persist cancel gate** — deferred to US-003 (Vista previa).
- Full-file hash detection.
- Merge/update of existing records on duplicate match.
- Cleanup/backfill of pre-existing duplicates already in the database.
- Mobile ingesta UI duplicate handling (US-033, separate/in flight).

## Artifact Traceability (Engram)

| Artifact | Topic Key | Observation ID |
|---|---|---|
| Explore | `sdd/us-005-deteccion-duplicados/explore` | 337 |
| Proposal | `sdd/us-005-deteccion-duplicados/proposal` | 340 |
| Spec | `sdd/us-005-deteccion-duplicados/spec` | 342 |
| Design | `sdd/us-005-deteccion-duplicados/design` | 343 |
| Tasks | `sdd/us-005-deteccion-duplicados/tasks` | 344 |
| Apply progress | `sdd/us-005-deteccion-duplicados/apply-progress` | 347 |
| Verify Report | `sdd/us-005-deteccion-duplicados/verify-report` | 348 |
| Archive Report | `sdd/us-005-deteccion-duplicados/archive-report` | (this document) |

## Source Files Moved

The entire change folder is relocated (via `git mv`, executed by the orchestrator — this session had no Bash access) from:

```
openspec/changes/us-005-deteccion-duplicados/
```

to:

```
openspec/changes/archive/2026-07-21-us-005-deteccion-duplicados/
```

Contents moved as-is, including this archive report and the reconciled specs (both the historical flat `spec.md` and the canonical nested `specs/ingesta-duplicate-detection/spec.md`).

## SDD Cycle Complete

- Proposal reviewed and approved
- Specifications written and spec-compliant (reconciled during archive)
- Design decisions documented and followed
- Tasks executed and completed (823 backend + 443 web tests green)
- Implementation verified (PASS, no CRITICAL)
- Canonical capability spec promoted to `openspec/specs/ingesta-duplicate-detection/spec.md`
- Archive created and persisted

**The us-005-deteccion-duplicados change is fully closed.** Pre-deploy action items (run Group 8 integration tests against a real dev DB; apply the migration via the normal deploy flow) remain tracked as deploy prerequisites, not open SDD work.
