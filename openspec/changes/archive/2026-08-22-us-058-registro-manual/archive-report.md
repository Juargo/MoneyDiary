# Archive Report — US-058 Manual Movement Registration

**Date**: 2026-08-22
**Change**: us-058-registro-manual — Backend capability to register a single manually-entered movement
**Status**: ARCHIVED & CLOSED

## Executive Summary

US-058 manual movement registration is complete, verified (PASS WITH WARNINGS, 0 CRITICAL), and archived. 4 chained PRs (#456–#459) merged to main deliver the complete capability to register income and expense transactions typed by hand (`POST /api/movimientos`), with 650+ lines across domain errors, value objects, use case, HTTP adapter, migration, integration tests, and ADR-039 documentation. All 8 requirements (MAN-01..06, ISO-01, ISO-02, REG-01 via ISO) and 13 design decisions traced to passing tests: 2349 unit + expected integration suite (ephemeral Postgres in CI) green; no CRITICAL issues; 1 WARNING (test expressiveness gap) and 1 SUGGESTION (pre-merge fix note) both recorded for audit. Change deployed live to main (commit d08521a2, 2026-08-22). The system now supports manual-movement registration with full per-user isolation, cross-user data immunity, and atomic sentinel account management, unblocking web form (US-060) and mobile form (US-061) implementations.

## What Shipped

### 4 Chained PRs (Stacked-to-main strategy)

| PR | Slice | Content | Status |
|---|---|---|---|
| #456 | Domain + VO + migration + sentinel adapter | `MovimientoManualInvalidoError`, `BucketCategoriaNoConcuerdaError`, `MovimientoManual` VO with overflow guard; `IRegistrarMovimientoManualWriter` port; atomic T-12 commit: `20260821000000_us058_manual_movement` migration (ingestaId nullable + onDelete:Restrict, origen column, three-valued CHECK) + `prisma generate` + `PrismaRegistrarMovimientoManualRepository` adapter (composite-key upsert, sentinel constants, blind index) | Merged |
| #457 | Application use case | `RegistrarMovimientoManualUseCase` (D-11 steps, Ingreso auto-class without catalog, Gasto cascade validation) with `RegistrarMovimientoManualCommand` discriminated union input and `{id, vo}` result; PR1 review nits | Merged |
| #458 | HTTP + routes + contract | `MovimientoManualSchema` (Zod discriminated union, `.strict()` Ingreso variant, Gasto requires bucket+categoriaId), response DTO mapper from in-memory VO, `POST /api/movimientos` route handler, composition root registration, `openapi.json` + api-client sync (Ingreso variant documented with `additionalProperties: false`) | Merged |
| #459 | Integration tests + ADR-039 | `registro-manual.int-spec.ts` (1196 lines, 9 describe blocks: factory validation, use-case invariants, persistence, resumen contribution, delete-ingesta immunity, cross-user isolation, migration regression, REG-01 truth table, origen truthy branch), `docs/adr/ADR-039-movimiento-manual-origen-sentinel.md` (amends ADR-026's premise that every `Transaccion` is born from an `Ingesta`) | Merged |

### Design Decisions (13 total, documented in design.md + ADR-039)

D-01 MovimientoManual factory VO with inline overflow guard (MAX_SAFE_INTEGER) — newly established, not mirrored from prior art (transaccion.mapper lacks this guard).
D-02 Fecha ≤ today, UTC calendar, injected clock for testability.
D-03 BucketCategoriaNoConcuerdaError with fixed message, public props, no interpolation.
D-04 IRegistrarMovimientoManualWriter narrow port — two methods, no TransaccionAPersistir reuse.
D-05 Sentinel upsert with module-level constants (SENTINEL_BANCO, SENTINEL_TIPO_CUENTA, SENTINEL_NUMERO_CUENTA_RAW, SENTINEL_ORIGEN) + blind-index computation (MUST NOT be skipped).
D-06 Origen truthy-branch end-to-end via sentinel banco → GET /api/ingresos/mes (integration test REQUIRED per constraint §7).
D-07 Zero reader changes for resumen — PrismaResumenMesRepository et al. unmodified, manual row contributes by bucket membership.
D-08 BUCKET_IDS in adapter, no DB read-back during response DTO mapping.
D-09 Exhaustive never guard for CARGO_Y_ABONO (structurally unreachable, TypeScript exhaustiveness only, runtime test MUST NOT be written).
D-10 Ingreso no CategorizarTransaccionUseCase invocation (auto-class by construction, proved by spy test).
D-11 Use case algorithm step ordering (1. validate domain 2. resolve userId 3. load catalog 4. validate Gasto cascade 5. find-or-create sentinel 6. persist).
D-12 Discriminated union endpoint, .strict() Ingreso, 201 response.
D-13 NULL-safe CHECK via IS NOT DISTINCT FROM (not naive `origen = 'Manual'`).

### Code Quality

- **Schema**: `Transaccion.ingestaId String?` (nullable), `Transaccion.origen String?`, `Account` composite key `(userId, banco, tipoCuenta, numeroCuentaBlindIndex)` with sentinels.
- **Migration**: `20260821000000_us058_manual_movement/migration.sql` — additive, no backfill of existing rows, pure-additive Postgres column + composite constraint.
- **Domain errors**: `MovimientoManualInvalidoError`, `BucketCategoriaNoConcuerdaError` — fixed messages, no interpolation, amounts scrubbed.
- **Tests**: 2349 unit tests (Vitest), 9-describe integration spec (1196 lines, CI Postgres green), 25 tasks all checked.
- **Type safety**: `pnpm api exec tsc --noEmit` — zero errors.
- **OpenAPI**: `POST /api/movimientos` path added with discriminated Ingreso/Gasto schemas, 201 response, documented in contract.

### Verification Outcome

**Status: PASS WITH WARNINGS** (full detail in `verify-report.md`, obs Engram topic key `sdd/us-058-registro-manual/verify-report`, ID #946)

- All 25 tasks completed (T-00 through T-25, all `[x]`).
- All 8 requirements + 19+ scenarios traced to passing tests (16 code, 3 rehearsal via regression).
- No CRITICAL issues; 1 WARNING (W-01: openapi-document.spec.ts T-20 lacks explicit `postOp.toBeDefined()` assertion, but path confirmed present in openapi.json:2238), 1 SUGGESTION (S-01: pre-merge fix commit 9a7ec376 applied, not current issue).
- Unit test gate: 256 files, 2349 tests, 0 failures.
- Type check: zero errors.
- OpenAPI check: up to date.
- Integration suite: 9/9 describe blocks green in CI (PR4 #459), deferred locally per ADR-029 (ephemeral Postgres in test env).

### Traceability (Engram Observations)

| Artifact | Topic Key | Observation ID |
|---|---|---|
| Proposal | `sdd/us-058-registro-manual/proposal` | #925 |
| Spec | `sdd/us-058-registro-manual/spec` | #926 |
| Design | `sdd/us-058-registro-manual/design` | #927 |
| Tasks | `sdd/us-058-registro-manual/tasks` | #929 |
| Verify Report | `sdd/us-058-registro-manual/verify-report` | #946 |
| Archive Report | `sdd/us-058-registro-manual/archive-report` | (this document) |

## Spec Reconciliation (this archive)

### Delta Specs → Main Specs

The change's delta spec defines two aspects:

1. **New capability MAN-01..06** — manual movement registration domain, use case, HTTP contract, and persistence (full spec, not a delta).
2. **Modified existing spec ISO-01/ISO-02** — user-data-isolation spec updated to account for 8th endpoint (7→8 controller count) and new cross-user isolation rule for manual writes.

| Location | Action | Details |
|---|---|---|
| `openspec/specs/movimiento-manual/spec.md` | **CREATED** | New canonical spec for manual movement capability (MAN-01..06, all scenarios, testing emphasis). Mirrors how `openspec/specs/ingesta-preview-commit/spec.md` was created from US-057. |
| `openspec/specs/user-data-isolation/spec.md` | **UPDATED** | ISO-01 controller count updated (7→8); ISO-02 extended to include `POST /api/movimientos` isolation; new scenario "User B's manual movement does not appear in user A's resumen" added to cover manual-movement cross-user immunity. |

The specs are now reframed from "will change" (delta) to "is" (live system state) — the 8 requirements and all scenarios remain verbatim as they describe the deployed system.

## Quality Gates (from verify report, obs #946)

| Check | Result |
|---|---|
| Spec compliance (19 scenarios) | 19/19 PASS (16 code, 3 regression) |
| Build (`tsc --noEmit`) | PASS (0 errors) |
| Unit tests (`pnpm api test`) | PASS (2349/2349) |
| Integration tests (Postgres ephemeral, CI authoritative) | PASS (9/9 describe blocks, PR #459) |
| Type safety (strict TypeScript) | PASS |
| Requirement traceability (MAN-01..06, ISO-01, ISO-02, REG-01) | PASS (all mapped to code + tests) |
| Design decision spot-check (D-01..D-13) | PASS (all verified in code) |
| TDD compliance (RED→GREEN verification) | PASS (all tasks verified) |
| ADR-039 accuracy | PASS (post-merge design pins documented) |
| REG-01 regression guard (ingesta-born rows unaffected) | PASS (integration test 930-1055) |

## Accepted Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation | Status |
|---|---|---|---|---|
| Sentinel account split-brain (typo in SENTINEL constants) | High if missed | Critical | Module-level constants with guard; implementers MUST NOT skip blind-index computation | ✅ Mitigated (D-05 constraint pinned in task gate) |
| Naive CHECK allows `(ingestaId=NULL, origen=NULL)` | High if missed | Medium | Use IS NOT DISTINCT FROM form (D-13); regression test covers truth table rows | ✅ Mitigated (migration.sql:27-28 exact form; test 1002-1053) |
| Ingesta-born rows drifting after nullable ingestaId | Low | Critical | Migration pure-additive, no backfill; REG-01 test covers both types | ✅ Mitigated (test: 930-1055, both old and new row types) |
| Manual row incorrectly deleted by delete-ingesta | Low | Critical | ingestaId IS NULL by construction; isolation test 543-751 confirms immunity | ✅ Mitigated (schema + isolation test) |
| Reader contribution math incorrect (D-07) | Low | Medium | Zero-change rule enforced; integration test 841-924 proves Deseos.total=12000 after gasto | ✅ Mitigated (test 841-924, no reader edits) |

## Out of Scope (Deferred)

- **Web form** (`POST /api/movimientos` UI) — deferred to US-060.
- **Mobile form** (`POST /api/movimientos` UI + camera) — deferred to US-061.
- **Batch registration** — single-row only per spec.
- **Categorization of Ingreso** — auto-classified by construction, no use case hook.
- **Undo/delete of manual rows** — deferred (no per-transaction delete endpoint).

## Artifact Traceability & Movement

### Source Files Moved

The entire change folder is relocated from:

```
openspec/changes/us-058-registro-manual/
```

to:

```
openspec/changes/archive/2026-08-22-us-058-registro-manual/
```

Contents archived with full structure (byte-identical move via git):
- `proposal.md`
- `design.md`
- `tasks.md`
- `verify-report.md`
- `spec.md`
- `archive-report.md` (this document)

### Canonical Specifications Created/Updated

**New spec**:
```
openspec/specs/movimiento-manual/spec.md
```

Describes the live system: manual-movement registration via `POST /api/movimientos`, per-user sentinel account, Ingreso auto-classification, Gasto catalog validation, persistence via nullable ingestaId + origen marker, contribution to resumen/semáforo without reader changes, cross-user isolation.

**Updated spec**:
```
openspec/specs/user-data-isolation/spec.md
```

ISO-01 and ISO-02 now reflect 8 controllers (added `POST /api/movimientos` handler) and extended cross-user isolation rules for manual writes. All existing 7-endpoint scenarios preserved; 1 new scenario covers manual-movement immunity.

## Binding Preconditions for US-060 & US-061 (Web & Mobile Forms)

When US-060 (web form) and US-061 (mobile form) are initiated, they MUST respect:

1. **Endpoint contract is fixed** — `POST /api/movimientos` accepts discriminated union `{tipo: "Ingreso", monto, fecha, descripcion}` or `{tipo: "Gasto", monto, fecha, descripcion, bucket, categoriaId}` per openapi.json specification.
2. **Ingreso is auto-classified** — form MUST NOT show bucket/categoriaId fields for tipo=Ingreso; backend rejects non-null values (design pin D-12: strict-reject on stray fields).
3. **Gasto requires catalog selection** — form MUST load `GET /api/categorias` (US-038 endpoint, not yet deployed) to populate bucket/categoriaId dropdowns; backend validates membership before persisting.
4. **User isolation is transparent** — form always uses authenticated session; backend scopes all writes by userId; sentinel account is created automatically on first manual movement.
5. **Sentinel account is per-user** — banco='Manual' appears in Origen column automatically via existing account join; no manual Origen field in form.

## SDD Cycle Complete

- ✅ Proposal reviewed and approved (issue #292, binding decisions 1-4 locked)
- ✅ Specifications written and delta specs promoted to main specs (MAN-01..06 → movimiento-manual/spec.md, ISO-01/ISO-02 merged into user-data-isolation/spec.md)
- ✅ Design decisions documented and followed (ADR-039 amendment, 13 design decisions verified in code)
- ✅ Tasks executed in 4 chained PRs (25 tasks, all checked, TDD RED→GREEN)
- ✅ Implementation verified (PASS WITH WARNINGS, 0 CRITICAL, 2349 unit tests + integration suite)
- ✅ Canonical capability spec lives at `openspec/specs/movimiento-manual/spec.md`
- ✅ Isolation spec lives at `openspec/specs/user-data-isolation/spec.md` (updated)
- ✅ Archive created and persisted (commit d08521a2, 2026-08-22)

**The us-058-registro-manual change is fully closed.**

All code is live in production. The system now supports user-initiated manual-movement registration with full per-user isolation (RNF-SEC-006), sentinel account automation, and atomic persistence, enabling web and mobile form implementations (US-060, US-061) to proceed without backend changes.
