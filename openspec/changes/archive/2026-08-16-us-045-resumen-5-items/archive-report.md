# SDD Archive Report: US-045 — resumen mensual, 3 → 5 items

**Change**: US-045  
**Specification**: Resumen Mensual (GET `/api/resumen` — 5-item contract expansion)  
**Issue**: [#279](https://github.com/Juargo/MoneyDiary/issues/279) — As a user, I want to see Ingresos and unclategorized count in the monthly resumen, so that I can understand the full financial picture (RES-01, RES-02, RES-03, RES-04, RES-05, RES-06)  
**Implementation**: [PR #363](https://github.com/Juargo/MoneyDiary/pull/363) (domain + application + persistence) merged 2026-08-16, [PR #365](https://github.com/Juargo/MoneyDiary/pull/365) (HTTP + contract + e2e + isolation) merged 2026-08-16  
**Verification**: PASS (0 CRITICAL, 0 WARNING, 2 SUGGESTION) — all spec scenarios compliant, all design decisions implemented, all CA satisfied, 45/46 tasks checked (1 accepted carry-over)

---

## Artifact Traceability

| Artifact | ID | Observation | Notes |
|----------|----|-----------|----|
| **Exploration** | — | (none — no exploration phase) | Proposal formed directly from issue #279 framing |
| **Proposal** | 710 | [sdd/us-045-resumen-5-items/proposal](engram:710) | Intent, scope, approach (additive DTO), affected areas, risks, rollback plan, success criteria |
| **Specification** | 711 | [sdd/us-045-resumen-5-items/spec](engram:711) | RES-01..06 requirements and 15 scenarios covering Ingresos, Sin categoría count/total/%, semáforo scope, basis-points arithmetic |
| **Design** | 712 | [sdd/us-045-resumen-5-items/design](engram:712) | 9 design decisions (D-01..D-09): port signature, shared assembly, $transaction const-binding, $ref annual reuse, ISP boundary, fixture sites, degenerate cases, R-1/R-2 mitigations |
| **Judgment Day 1** | 713 | [US-045 Judgment Day: APPROVED en Ronda 2](engram:713) | Spec+design blind dual review. Round 1: 1 CRITICAL (impossible "non-Ingreso abono" scenario) + 4 minor. Fixed + re-reviewed APPROVED |
| **Judgment Day 2** | 718 | [US-045 PR-A Judgment Day código: APPROVED](engram:718) | Blind code review (domain+app). Round 1: 2 WARNINGs (vacuous ISP guard, fifth fixture missed). Fixed, re-checked, APPROVED |
| **Judgment Day 3** | 719 | [US-045 PR-B Judgment Day: APPROVED](engram:719) | Blind code review (HTTP+e2e). Judge B: CLEAN. Judge A: 2 WARNINGs fixed (fifth fixture, type equality assertion) |
| **Tasks** | — | [openspec/changes/archive/2026-08-16-us-045-resumen-5-items/tasks.md](file) | 46 tasks across 13 phases (Phases 0-13: pre-flight, domain, application, persistence ×2, HTTP, schema, contract regen, isolation, e2e, backend gate, client fixtures, cross-workspace gate). Delivery: 4-PR stacked-to-main chain (Phases 1-4, Phases 5-9, Phases 5-9 extended, Phases 11-12) |
| **Apply Progress** | 716 | [sdd/us-045-resumen-5-items/apply-progress](engram:716) | Full apply complete across 2 stacked-to-main PRs. PR-A (#363) merged Phases 1-4 (8 commits). PR-B (#365) merged Phases 5-13 (19 commits). Tasks.md reconciliation: T0.1 deliberately unchecked (pre-existing ADR-028/029 DB constraint); 45 implementation tasks checked during apply. |
| **Verification Report** | 720 | [sdd/us-045-resumen-5-items/verify-report](engram:720) | Full spec compliance matrix (15/15 scenarios), build+test execution (225+1871 backend unit, 25+150 integration, 11+52 e2e, 100+1005 web, 27+236 mobile), correctness proof (all 9 design decisions implemented), CA-01..06 satisfied, TDD compliance 6/6, accepted deviations (const-binding resolution, 4 fixture sites, 3 deliberately deferred items), zero CRITICAL issues |

---

## Change Summary

### Proposal (observation #710)

**Intent**: The dashboard chart only tells the spending story (Necesidades/Deseos/Ahorro). Users cannot see in the same view how much came in (Ingresos) nor how much of their money the app failed to classify (Sin categoría) — so an unclassified month silently looks like a smaller month. `GET /api/resumen` must expose both values so US-047 (web) and US-046 (annual) can render 5 items without new backend rules.

**Scope**:
- IN: Expose Ingresos as amount only (no percentage). Expose Sin categoría with transaction count + total + % (cargos only). All 5 values always present (0 when empty). `userId` isolation in WHERE + integration test. Contract regen (openapi.json + api-client).
- OUT: Web/mobile UI (US-047). Annual aggregation (US-046). Semáforo rules for Ingresos/Sin categoría. Bucket restructure.

**Approach**: Additive DTO extension (not a restructure). Reuse existing `totalIngreso` field. Add new top-level `cantidadSinCategoria` field (not inside `buckets[]` — ISP boundary).

**Affected areas**: 7 files modified (domain VO, application ports, shared assembly, repository ×2, DTO, schema). Regenerated: openapi.json, api-client. Specs modified: 2 (resumen-mensual NEW, user-data-isolation ISO-02 extended).

**Risks**: Shared assembly breaks annual use case (Med, mitigated by additive-only); count double-counting the null-bucket fold (Med, SC-03 extended test); contract drift (Med, CI gates); count leaks across users (Low, replicate SC-09 isolation).

**Success criteria**: CA-01..06 all achieved (see verification report #720).

### Specification (observation #711)

6 requirements (RES-01..06), 15 scenarios:
- **RES-01**: Ingresos is amount-only, never a percentage, always present.
- **RES-02**: Sin categoría exposes cargo-only count (excluding Ingreso-shaped rows, including null-bucket rows via the count query's `cargo > 0` filter).
- **RES-03**: Sin categoría total + % (basis as Ingresos, same as spend buckets).
- **RES-04**: All 5 items always present with stable defaults (0 for amounts/counts, null for %/semáforo).
- **RES-05**: `estadoGlobal` (semáforo) considers only the 3 spend buckets; Ingresos/Sin categoría are neutral.
- **RES-06**: All % via basis-points round-half-up on BigInt; no float; large amounts as strings.

### Design (observation #712)

9 design decisions (D-01..D-09):
- **D-01**: `totalIngreso` lifted top-level (already exists, no new field).
- **D-02**: `cantidadSinCategoria` is top-level (ISP: `BucketResumenDto` stays uniform 4 fields, no count inside).
- **D-03**: Annual endpoint reuses `ResumenMesDto` via `$ref` (no separate annual aggregation).
- **D-04**: New field is `number` (required, not optional) — forces `tsc` at call sites (D-04 mitigation for completeness).
- **D-05**: `resolverBucket` extracted helper, shared by both sums and count fold (R-1 mitigation for SC-03).
- **D-06**: Fixture sites enumerated (8 web, 2 mobile); two spread-derived sites auto-fix once sources carry the field.
- **D-07**: Annual field parity (no aggregation, just wire-through).
- **D-08**: Degenerate case test (0 income, count > 0 → % null but count present).
- **D-09**: Count never perturbs `estadoGlobal` (regression guard).

**High-risk mitigations**:
- **R-1**: Count fold must ADD, never overwrite (SC-03 extended test with both null-bucket + explicit SinCategoria rows).
- **R-2**: Count query filter `cargo > 0` must NOT leak into sums query's WHERE (SC-10 test: abono in uncat bucket returns `cantidadCargos===1` AND `totalAbono===50_000n`).

### Judgment Day Reviews

- **Spec+Design** (#713): 1 CRITICAL found (impossible scenario), 4 minor findings, all fixed, re-reviewed APPROVED.
- **PR-A Code** (#718): 2 WARNINGs (vacuous ISP guard, missing fixture), fixed, re-checked APPROVED.
- **PR-B Code** (#719): Judge B CLEAN, Judge A 2 WARNINGs (same fixtures, type equality), fixed, APPROVED.

### Verification Report (observation #720)

**Completeness**: 46 tasks total, 45 checked (T0.1 deliberately unchecked — pre-recorded ADR-028/029 pre-condition carry-over, not a gap).

**Build & Tests**:
- Backend unit: 225 files / 1871 tests PASS
- Backend type-check: 0 errors
- Backend OpenAPI drift gate: PASS
- Backend integration: 25 files / 150 tests PASS
- Backend e2e: 11 files / 52 tests PASS
- Web: 100 files / 1005 tests PASS
- Mobile: 27 suites / 236 tests PASS

**Spec Compliance**: 15/15 scenarios compliant with runtime evidence (RES-01..06, ISO-02 delta covered).

**Correctness**: All 9 design decisions (D-01..D-09) implemented as specified. No deviations.

**Issue #279 Acceptance Criteria**: All 6 CA satisfied (CA-01 Ingresos, CA-02 count, CA-03 semáforo scope, CA-04 arithmetic, CA-05 isolation, CA-06 contract regen).

**TDD Compliance**: 6/6 checks passed (RED/GREEN/REFACTOR evidence, good triangulation, no trivial assertions).

**Verdict**: **PASS** — 0 CRITICAL, 0 WARNING. 2 SUGGESTIONS (T0.1 literal pre-flight step never re-run; RES-01 "no %" is structural/type-only, not wire-level assertion).

---

## Key Decisions Locked in This Cycle

1. **Ingresos**: Amount only, **no percentage** (product decision from proposal).
2. **Sin categoría total/count**: **Cargos only** — excludes Ingreso-shaped rows (abono>0, cargo===0) via the `cargo > 0` WHERE filter.
3. **All 5 items always present**: Stable 0 / null defaults, clients decide rendering (no omitted fields).
4. **Additive DTO extension**: New top-level field `cantidadSinCategoria`, not a bucket restructure (design decision D-02, ISP).
5. **Shared assembly**: `construirResumenMesDesdeFilas` is additive-only (no backward-compat risk for annual use case).
6. **$transaction array form**: Prisma 7 with `@prisma/adapter-pg` types cleanly (const-binding resolved, no Promise.all fallback needed).
7. **$ref annual reuse**: `ResumenAnualResponse.meses[]` picks up the new field via existing `$ref` to `ResumenMesResponse` (no breaking change).
8. **Fixture sites**: 8 web + 2 mobile; two spread-derived sites auto-compile once sources carry the field (verified in apply).
9. **SQL-level isolation**: `userId` in the same WHERE for counts (SC-09 + T8.1 + T9.3 verify no cross-user leakage).

---

## Specs Synced to Main Specs Directory

### New Capability: resumen-mensual

**File**: `openspec/specs/resumen-mensual/spec.md`  
**Action**: Created (no pre-existing main spec)  
**Content**: Full resumen-mensual spec with RES-01..06 requirements, 15 scenarios, Purpose section  
**Status**: Ready for upstream consumption by US-046 (annual aggregation) and US-047 (web UI)

### Modified Capability: user-data-isolation

**File**: `openspec/specs/user-data-isolation/spec.md`  
**Action**: Merged delta (modified requirement ISO-02)  
**Changes**:
- Updated ISO-02 requirement description: added note about Sin categoría count coverage and WHERE clause guarantee (no application-memory aggregation)
- Added new scenario: "User A cannot read user B's Sin categoría count" (proves isolation at the HTTP boundary for the new field)
- Preserved all other scenarios and ISO-01 requirement unchanged

**Status**: Ready for `apps/mobile` consumption (no keyless fallback for `/api/resumen`, session required)

---

## Open Follow-Ups (Deliberately Deferred)

Per the verify report, three items were explicitly deferred (not silently dropped — tickets being created separately):

1. **Mobile tsconfig `test/` gap**: Mobile jest runner does not have path mappings for `test/` suites (web has these). Follow-up issue to be created for consistency.
2. **CI colocated-int-spec gap**: Integration specs live flat in `apps/api/test/` (not nested `test/integration/persistence/`). Documentation and CI tooling gap. Follow-up issue to be created.
3. **USER_ID_FIJO_FIXED pollution in e2e**: Some e2e tests seed hard-coded `USER_ID_FIJO` directly in DB. Post-MVP cleanup for isolation hardening. Follow-up issue to be created.
4. **resolverBucket duplication in movimientos repo**: `PrismaMovimientosRepository` has an inline bucket-resolution pattern similar to D-05's extracted helper. Post-MVP refactor for consistency. Follow-up issue to be created.

---

## SDD Cycle Completion

✅ **Proposal** (exploration → approval)  
✅ **Specification** (requirements + scenarios → RES-01..06, ISO-02 delta)  
✅ **Design** (architecture → D-01..D-09 decisions, R-1/R-2 mitigations)  
✅ **Tasks** (work breakdown → 46 tasks across 13 phases, 4-PR stacked-to-main delivery)  
✅ **Judgment Day** (blind dual review → 3 rounds, all APPROVED)  
✅ **Apply** (implementation → 2 PRs merged, 45/46 tasks checked)  
✅ **Verify** (validation → 15/15 spec scenarios, CA-01..06, zero CRITICAL)  
✅ **Archive** (closure → specs synced, change archived, this report)

**The change has been fully planned, designed, implemented, reviewed, verified, and archived.**

---

## Change Metadata

| Field | Value |
|-------|-------|
| **Change name** | `us-045-resumen-5-items` |
| **Archive date** | 2026-08-16 |
| **Archive path** | `openspec/changes/archive/2026-08-16-us-045-resumen-5-items/` |
| **Related issue** | #279 |
| **PRs** | #363 (domain+app+persistence), #365 (HTTP+contract+e2e+isolation) |
| **Artifact store** | hybrid (openspec + engram) |
| **Branch** | `docs/us-045-archive` (change folder already moved by orchestrator) |
| **Task completion** | 45/46 (T0.1 deliberately unchecked, pre-recorded acceptable deviation) |
| **Verification verdict** | PASS (0C/0W/2S) |
| **Specs created** | 1 (resumen-mensual) |
| **Specs modified** | 1 (user-data-isolation, ISO-02 delta) |

