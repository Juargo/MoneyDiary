# Proposal: US-052 — Backend detalle MES-INGRESOS con columna Origen (banco/Manual)

## Why

Issue #286: monthly income list by origin (bank/Manual). Sprint-14 Detalle MES: US-051 rejected `Ingresos` as a bucket (MBD-07 → 400); this is its dedicated endpoint. Consumed by US-054.

## What Changes

- `GET /api/ingresos/mes?periodo=` — US-051 sibling; US-017 untouched. Response `{total: string, conteo: number, transacciones: [{id, fecha, descripcion, origen, monto}]}`.
- `periodo` optional → current month; invalid → 400 scrub (`PeriodoInvalidoError`). Empty month → 200 `"0"`/0/`[]`.

## Requirements Map (capability `ingresos-detalle-mes` — MID-*)

| Req | CA | Requirement |
|-----|----|-------------|
| MID-01 | CA-01 | Shape above; `fecha asc, id asc`; empty month → 200 zeros |
| MID-02 | CA-02 | `origen` = `account.banco` or `"Manual"`, at app boundary |
| MID-03 | CA-03 | No meta/%/estado; Zod `.strict()` wire guarantee |
| MID-04 | CA-04 | Absent → current month; invalid → 400 scrub |
| MID-05 | CA-05 | BigInt→string, positive (`esIngreso`⇒abono>0) |
| MID-06 | CA-06 | userId WHERE + isolation test (RNF-SEC-006); isolation 6→7 |

## Capabilities

- **New** `ingresos-detalle-mes` → `openspec/specs/ingresos-detalle-mes/spec.md`.
- **Modified** `user-data-isolation`: ISO-01/02 endpoint set grows 6→7.

## Proposed approach

Reuse `IDetalleBucketReader.findByPeriodoYBucket(userId, periodo, Bucket.Ingreso)` — zero new SQL/ports (US-051 D-02; verified in domain). New `ObtenerIngresosMesUseCase` (`Result<T,E>`, total = Σ abono). New DTO + Zod `.strict()`, route, wiring, OpenAPI appended at END, `openapi:emit` + `contract:sync`. TDD (ADR-016), application → infrastructure. No new reader; `PrismaMovimientosMesRepository` untouched.

## Decisions

**Pinned:** ① `origen = fila.banco || 'Manual'`; Manual branch unit-proven dead (`ingestaId`/`accountId` NOT NULL) — no model invented. ② Bank name verbatim (US-017 precedent), no normalization. ③ Ordering + empty month per MID-01. ④ total = Σ abono (no sign rule).
**PII flag:** MBD-08 bans `banco` on US-051's route; US-052 EXPOSES the bank name (CA-02, US-017 precedent) but never `tipoCuenta`/`numeroCuenta` — `.strict()` enforces it. Don't inherit MBD-08.

## User flows

CA-01..06 (issue #286) → MID-01..06.

## Non-goals

UI (US-054); manual-transaction creation; bank normalization; category grouping/% for ingresos.

## Rollback / Compatibility

Additive — revert PR; regen OpenAPI.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Collides with MBD-08 "no banco" gate | Med | PII narrative pinned here (name ok, cuenta never) |
| Manual branch reads as dead weight | Low | Unit-proven dead; e2e covers bank branch |
| Isolation leak | Low | Hermetic 401 + two-user test; ISO 6→7 delta |
| Origen drifts from account join | Low | Reader decrypts (ADR-013); mirror tests pin `banco` |

## Success Criteria

- [ ] MID-01..06 scenarios green.
- [ ] Hermetic: 401; userId reaches use case; 400 scrub; `origen` bank on wire.
- [ ] `tsc --noEmit`, lint, openapi drift green; no migration.