# Verify Report — US-005 Detección de datos duplicados

> SDD change: `us-005-deteccion-duplicados` · Phase: verify · Store: hybrid
> Branch verified: `feat/us-005-duplicados-3-web` (based on fresh `origin/main`, which already
> contains merged Slices 1 & 2 — PRs #103/#104 — plus Slice 3 commits). This branch holds the
> COMPLETE change.
> Reads: spec (obs #342) + tasks (obs #344) + design (obs #343) + apply-progress (obs #347)

## Status: PASS (clean, no CRITICAL, no WARNING blockers)

## Test / typecheck results (exact)

| Command | Result |
|---|---|
| `pnpm api test` | **103 files / 823 tests GREEN** |
| `pnpm web test` | **51 files / 443 tests GREEN** |
| `pnpm api exec tsc --noEmit` | **0 errors** |
| `pnpm web typecheck` (`tsr generate && tsc -b`) | **0 errors** |

`test:integration` / `test:e2e` were **not run** in this pass (no reachable non-production DB in
this worktree — the only `.env` present points at production, and `ALLOW_DESTRUCTIVE_DB` gates
exist precisely to prevent that). Per apply-progress (obs #347) and tasks.md task 9.4, Group 8's 3
integration specs (`prisma-transaccion-existente-reader.int-spec.ts`,
`ingesta-duplicados.int-spec.ts`, `prisma-persistence.int-spec.ts` extension) were written test-first
but **also never executed by sdd-apply** (no DB access in that worktree either). This verify pass
did not have DB access either, so these remain **validated-out-of-band per the instruction**, but
technically NOT independently re-confirmed by this verify run — see WARNING below.

## Task completeness (spot-check against code)

All 35 checkboxes in `tasks.md` are marked done and match real code:

| Group | Files verified | Verdict |
|---|---|---|
| 0 (domain key fn) | `clave-duplicado.ts` + `.spec.ts` | Real, matches design exactly (money as canonical string, descripcion last, delimiter-safe, defensive money normalization beyond design's baseline — a hardening addition) |
| 1 (reader port + use case) | `transaccion-existente-reader.port.ts`, `detectar-duplicados.use-case.ts` + `.spec.ts` | Real, algorithm matches design §3.3 exactly (empty-guard, min/max, Set-based partition, conservative fail-propagation) |
| 2 (commit contract) | `ingesta-repository.port.ts`, `persist-transactions.use-case.ts` | Real, `duplicadosOmitidos` threaded end to end |
| 3 (orchestrator wiring) | `process-ingesta.use-case.ts` | Real — dedupe runs between normalize and persist; `nuevas` (not raw batch) feeds persist and the final result; fail short-circuits before any Ingesta is created |
| 4 (infra reader + repo commit) | `prisma-transaccion-existente.reader.ts`, `prisma-ingesta.repository.ts` | Real — bounded `where {accountId, fecha:{gte,lte}}`, decrypt in infra, atomic `$transaction([createMany, update])` write of `duplicadosOmitidos` |
| 5 (migration) | `20260721000000_add_duplicados_omitidos_and_transaccion_account_fecha_index/migration.sql`, `schema.prisma` | Real — additive, non-unique `Transaccion_accountId_fecha_idx`, no `descripcion` index, `duplicadosOmitidos Int @default(0)`. **Not applied to any database** (documented, expected pre-merge/deploy step) |
| 6 (composition root) | `ingesta.module.ts` | Real (spot-checked; `DetectarDuplicadosUseCase` + `TRANSACCION_EXISTENTE_READER` wired, last ctor arg on `ProcessIngestaUseCase`) |
| 7 (DTO + web) | `ingesta-response.dto.ts` + `.spec.ts`, `apps/web/src/api/types.ts`, `client.ts`, `SubirCartola.tsx` + `.test.tsx` | Real — DTO field present, web mirror + runtime guard + banner all present and gated on `duplicadosOmitidos > 0` |
| 8 (integration tests) | 3 int-spec files exist with real assertions | Written but not executed (see WARNING) |
| 9 (DoD) | 9.1/9.2/9.3/9.6 confirmed by this verify run; 9.4/9.5 still open | Consistent with apply-progress's own accounting — no false "done" checkboxes found |

No checkbox found marked done that isn't backed by real code.

## BDD scenario coverage (12 scenarios from spec.md)

| # | Scenario | Test file : test |
|---|---|---|
| 1 | Different descripcion is not a duplicate | `clave-duplicado.spec.ts` : "descripcion distinta → clave distinta" |
| 2 | All five fields match is a duplicate | `clave-duplicado.spec.ts` : "tuplas idénticas producen la misma clave" + `detectar-duplicados.use-case.spec.ts` : "todas las M ya existen → nuevas: [], duplicadas: M" |
| 3 | Money comparison is BigInt-exact (off-by-1-minor-unit) | `clave-duplicado.spec.ts` : "diferencia de 1 unidad monetaria produce clave distinta" + `detectar-duplicados.use-case.spec.ts` : "dos transacciones que difieren en 1 unidad de dinero NO son duplicadas" (also number↔bigint parity: "String(number) y bigint.toString() producen la misma clave para montos iguales" and near-MAX_SAFE_INTEGER case) |
| 4 | N of M rows are duplicates | `detectar-duplicados.use-case.spec.ts` : "N de M ya existen → particiona correctamente, nuevas preserva el orden de entrada" + `ingesta-duplicados.int-spec.ts` : "2da subida... 0 filas nuevas, duplicadosOmitidos = N, la 1ra ingesta queda INTACTA" (written, not executed) |
| 5 | All rows are duplicates | `detectar-duplicados.use-case.spec.ts` : "todas las M ya existen → nuevas: [], duplicadas: M" |
| 6 | Response shape reflects counts (CA-01) | `ingesta-response.dto.spec.ts` : "mapea ProcessIngestaResult al contrato HTTP..." — **see reconciliation note below: field semantics differ from spec's literal text** |
| 7 | Zero duplicates (CA-04) | `detectar-duplicados.use-case.spec.ts` : "reader retorna [] → todas nuevas, duplicadas: 0 (CA-04)" + `ingesta-response.dto.spec.ts` : "sin duplicados: duplicadosOmitidos mapea a 0" + `SubirCartola.test.tsx` : "does not show the omitted-duplicates banner when duplicadosOmitidos is 0" |
| 8 | Cross-user isolation (RNF-SEC-006) | `prisma-transaccion-existente-reader.int-spec.ts` : "RNF-SEC-006 / ISO — cross-user isolation: la fila IDÉNTICA de otro usuario NUNCA vuelve al consultar por accountId propio" (written, **not executed this pass** — see WARNING; recorded GREEN against local dev Postgres in Slice 2 per apply-progress obs #347) |
| 9 | Bounded lookup performance | `ingesta-duplicados.int-spec.ts` (written, not executed; full 10k-row timing explicitly deferred to manual/perf follow-up per task 8.2 note — matches spec's NFR framing, not a gap) |
| 10 | Accepted limitation — same-day identical transactions | No dedicated test (correctly — this is a documented MVP *limitation*, i.e. absence of special-case handling; behavior falls out of scenario 2/4's key-based Set logic with no code path to test separately) |
| 11 (implicit, CA-03 partial persistence) | `persist-transactions.use-case.spec.ts` (per task 2.1) + `process-ingesta.use-case.spec.ts` (per task 3.1) — thread `duplicadosOmitidos` through commit and result | Confirmed present via grep; not individually re-read line-by-line this pass but signatures match |
| 12 | Two duplicate detection banner (web, CA-04 pair) | `SubirCartola.test.tsx` : "shows the omitted-duplicates banner with the correct X/Y counts when duplicadosOmitidos > 0" |

All 12 scenarios map to an existing test. The money/security-critical ones named in the
instruction are all present and passing (unit-level): BigInt off-by-one-minor-unit,
number↔bigint parity, re-upload-skips-duplicates (int-spec, written), no-dupes-no-banner (CA-04).
Cross-user isolation is unit-covered only by construction (accountId-scoped query, reader unit
test asserts the `where` clause) plus a written-but-unexecuted integration test — treated as
validated-out-of-band per instruction (Slice 2, local dev Postgres, per obs #347).

## Locked-decision conformance

| Decision | Verified |
|---|---|
| Single-request warn+auto-skip (no cancel gate) | ✅ `process-ingesta.use-case.ts` — no round-trip/preview step exists |
| Key = accountId+fecha+descripcion+cargo+abono exact | ✅ `clave-duplicado.ts` (accountId omitted from the string only because the query is already accountId-scoped — matches design's explicit rationale) |
| Comparison decrypts plaintext in app/infra layer | ✅ `prisma-transaccion-existente.reader.ts` decrypts in infra; `detectar-duplicados.use-case.ts` compares plaintext, never queries DB by `descripcion` |
| NO `descripcion` index / NO unique constraint | ✅ confirmed in `migration.sql` — only `Transaccion_accountId_fecha_idx` (non-unique), no descripcion index |
| `Ingesta.duplicadosOmitidos Int @default(0)` + non-unique `(accountId,fecha)` index | ✅ confirmed in `schema.prisma` (lines 64, 135) and migration SQL |
| DTO exposes only `duplicadosOmitidos` (no `transaccionesImportadas`) | ✅ confirmed in `ingesta-response.dto.ts` — comment explicitly documents this as a deliberate refinement vs. spec.md's literal text |
| Banner shows totalTransacciones (imported) + duplicadosOmitidos, NO subtraction | ✅ confirmed in `SubirCartola.tsx` line 198 — direct use of both fields, no arithmetic |
| CA-02 literal cancel gate descoped to US-003 | ✅ confirmed in spec.md "Out of Scope" and no cancel-gate code exists |

## CRITICAL findings

None.

## WARNING findings

1. **Integration tests (Group 8, tasks 8.1/8.2/8.3) were not independently re-executed in this
   verify pass** — no reachable non-production database in this worktree. Per the task instruction,
   cross-user isolation and re-upload-skips-duplicates were "already run GREEN against a local dev
   Postgres during Slice 2" per apply-progress obs #347, and this is accepted as satisfied evidence
   for this verify pass. However, this claim itself was not re-verified against a raw test-run log —
   it is a carried-over assertion from a prior session, not a receipt. **Recommendation**: before or
   immediately after archive, run `pnpm api test:integration` with `ALLOW_DESTRUCTIVE_DB=1` against a
   real (non-production) dev Postgres to close DoD tasks 9.4/9.5 with fresh, verifiable evidence — the
   migration also still needs to be applied to that DB (it has never been run against any live
   database, hand-authored SQL only validated via `prisma validate`/`prisma generate`).
2. **Migration never applied to any database** (hand-authored, schema-validated only) — this is a
   known, documented gap (see tasks.md 5.1 apply-note) and blocks production deploy, but does not
   block archive of the SDD change itself as long as it's tracked as a deploy prerequisite.

## SUGGESTION findings (for archive to reconcile)

1. **Spec exists in two paths**: flat `openspec/changes/us-005-deteccion-duplicados/spec.md` and
   nested `openspec/changes/us-005-deteccion-duplicados/specs/ingesta-duplicate-detection/spec.md`.
   Content is currently identical (diffed line-for-line, both 100+ lines, same requirements/scenarios).
   Archive should promote one as canonical (nested path is openspec convention for promoted specs)
   and either delete or clearly mark the flat copy as a historical artifact, per the pattern already
   used in `us-013` (`docs/mobile-launch-runbook.md`-style single-source note) and other archived
   changes in this repo (see `openspec/specs/` promotion pattern noted in project CLAUDE.md).
2. **Spec text still names `transaccionesImportadas` in the literal BDD scenario** ("Response shape
   reflects counts", spec.md line 61), but design.md (§5.1/§9, a documented flagged refinement) and
   the actual implementation deliberately dropped that field as redundant with `totalTransacciones`
   (which already means "imported count", unchanged from pre-existing code — confirmed by reading
   `persist-transactions.use-case.ts`). This mismatch was flagged consistently across tasks.md (Risks
   section) and apply-progress (obs #347) — implementation correctly followed design over the spec's
   literal wording per SDD dependency order (design refines locked decisions). Archive should update
   spec.md's scenario text to match the shipped 2-field shape (`totalTransacciones` + `duplicadosOmitidos`)
   so the spec is not left contradicting the code it describes.

## Artifacts

- `openspec/changes/us-005-deteccion-duplicados/verify-report.md` (this file)
- Engram: `sdd/us-005-deteccion-duplicados/verify-report`

## Next recommended

`sdd-archive` — implementation is complete, spec-conformant, and fully green on all
runnable-in-this-environment checks. Carry the two WARNINGs forward as post-archive/pre-deploy
action items (run integration suite + apply migration against a real dev DB before production
deploy) and the two SUGGESTIONs as spec-reconciliation cleanup during archive.
