# Proposal: US-005 Detección de datos duplicados

## Intent

Re-uploading a bank statement silently re-imports transactions that already exist, corrupting monthly totals and the 50/30/20 view. **Must-Have.** After this change the import warns with a duplicate count, never silently re-imports, and the ingesta history durably records imported vs omitted counts.

## Scope

### In Scope
- **CA-01**: response reports the count of detected duplicates.
- **CA-03**: persist ONLY new rows; record omitted count in history.
- **CA-04**: no duplicates → normal single-request flow, no warning.
- Backend detection: `IDuplicateChecker` port + `DetectarDuplicadosUseCase` + bounded repo lookup query, wired into `ProcessIngestaUseCase.runPipeline` before persist.
- Prisma migration: non-unique index `Transaccion(accountId, fecha)` + new field `Ingesta.duplicadosOmitidos` (Int, defaulted).
- Response DTO extension (`totalTransacciones`, `transaccionesImportadas`, `duplicadosOmitidos`).
- Web: inline banner in the existing success panel of `SubirCartola.tsx` ("Se importaron X, se omitieron Y duplicados").

### Out of Scope (non-goals)
- **CA-02 literal "cancel entire import" pre-persist gate** — reinterpreted as warn + auto-skip in a single request; the cancel/preview gate is deferred to **US-003 (Vista previa)**. Post-import deletion is US-018.
- Full-file hash detection; merge/update of existing records; cleanup of pre-existing duplicates; data backfill.
- Mobile ingesta UI (US-033, separate/in flight).
- Same-day identical-transaction collision (documented MVP limitation).

## Capabilities

### New Capabilities
- `ingesta-duplicate-detection`: pre-persist detection of already-imported transactions by natural key, warn + auto-skip, and persisted import/omitted counts.

### Modified Capabilities
- None.

## Approach

Single-request **warn + auto-skip**. Natural key: `accountId + fecha + descripcion + cargo + abono`, exact match on all 5; `cargo`/`abono` compared as exact `BigInt`. `DetectarDuplicadosUseCase` fetches existing rows for the resolved `accountId` bounded to the batch `fecha` range `[min,max]`, decrypts `descripcion` via `ICryptoService.decrypt()` (identity today) and compares **in-memory** in the application layer — never a DB unique constraint, never an index on `descripcion` (ADR-013 forward-compat). Returns `Result<{ nuevas, duplicadas }>`. Only `nuevas` reach `PersistTransactionsUseCase`; `duplicadosOmitidos` is written on the `Ingesta`. userId isolation (RNF-SEC-006) holds via `accountId` (user-scoped by `Account @@unique`).

### CA mapping
- CA-01 → duplicate count in response. **Satisfied.**
- CA-02 → warn + auto-skip single request; literal cancel gate **descoped → US-003**.
- CA-03 → only `nuevas` persisted + `Ingesta.duplicadosOmitidos`. **Satisfied.**
- CA-04 → empty `duplicadas` → normal flow. **Satisfied.**

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/application/ports/duplicate-checker.port.ts` | New | `IDuplicateChecker` |
| `apps/api/src/application/use-cases/detectar-duplicados.use-case.ts` | New | Detection use case |
| `apps/api/src/application/use-cases/process-ingesta.use-case.ts` | Modified | Insert step before persist |
| `apps/api/src/infrastructure/persistence/prisma-ingesta.repository.ts` | Modified | Bounded lookup query |
| `apps/api/prisma/schema.prisma` | Modified | Index + `duplicadosOmitidos` |
| `apps/api/src/infrastructure/http/ingesta.controller.ts` | Modified | Response DTO |
| `apps/web/src/components/SubirCartola.tsx` | Modified | Inline banner |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Encryption breaks DB-level compare (ADR-013) | Med | Compare in app layer on decrypted plaintext; no `descripcion` index |
| Slow lookup on large history (NFR <3s/10k) | Med | Bound query by `(accountId, fecha[min,max])` + non-unique index |
| Atomicity vs `createMany` | Low | Filter in memory pre-persist; keep single atomic insert of `nuevas` |

## Rollback Plan

Revert the branch; roll back the additive migration (drop index + `duplicadosOmitidos`). No backfill, so no data reversal needed.

## Dependencies

- None blocking. US-003 (Vista previa) remains open and absorbs the descoped CA-02 gate.

## Success Criteria

- [ ] Re-uploading the same statement imports 0 new rows and reports the omitted count.
- [ ] `Ingesta.duplicadosOmitidos` reflects skipped rows; only `nuevas` persisted.
- [ ] Web success panel shows imported/omitted banner.
- [ ] Detection <3s for 10k-row files; no `descripcion` DB index.
