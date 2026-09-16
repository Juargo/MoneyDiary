```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:76a8aa7a6c83408691f97a5c0fc32e970d891703df99b5e9dd8b4dc8549ec3a1
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 19/19
scenarios: 56/56
test_command: pnpm api test; pnpm web test; pnpm --filter @moneydiary/mobile test
test_exit_code: 0
test_output_hash: sha256:8cb1125f7033434ab18f20f373ebf22ad8455846b3f2a80fcdda07ff54ad5d9a
build_command: pnpm api exec tsc --noEmit; pnpm web typecheck; (cd apps/mobile && pnpm exec tsc --noEmit); pnpm api openapi:check; pnpm api-client typecheck
build_exit_code: 0
build_output_hash: sha256:836127300a0c3706a679a15eec8ff150c95478d68b19eb22ecf47611326acb65
```

## Verification Report

**Change**: categoria-iconografia (issue #679, US-067)
**Version**: N/A (feature-branch chain, tip = `feat/categoria-iconografia-pr8`, all 8 PRs stacked)
**Mode**: Strict TDD

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 52 |
| Tasks complete | 51 |
| Tasks incomplete | 1 (task 1.10 — apply prod migration; human-gated by design, correctly unticked) |

### Build & Tests Execution

**Build**: ✅ Passed
```text
pnpm api exec tsc --noEmit          → exit 0, no errors
pnpm web typecheck (tsr + tsc -b)   → exit 0, no errors
apps/mobile: pnpm exec tsc --noEmit → exit 0, no errors
pnpm api openapi:check              → exit 0, "openapi.json está al día"
pnpm api-client typecheck           → exit 0, no errors
```

**Tests**: ✅ 5837 passed / ❌ 0 failed / ⚠️ 0 skipped
```text
pnpm api test                             → 277 files, 2734 tests passed
pnpm web test                             → 154 files, 2173 tests passed
pnpm --filter @moneydiary/mobile test     → 84 files, 930 tests passed
```
Additional evidence recorded in `apply-progress.md` per PR batch and spot-verified here:
- `pnpm exec playwright test` (web e2e, all 3 viewports: movil/tablet/escritorio) — 107 passed, 70 skipped (pre-existing viewport scoping), 0 failed (PR5 batch).
- `catalogo-isolation.int-spec.ts` (ephemeral local Postgres, `ALLOW_DESTRUCTIVE_DB=1`) — 14/14 passed including the CATICO-05 ownership case (PR2b batch). Not re-run in this verify pass per the launch instructions (local DB has accumulated state that fails unrelated `seed.int-spec.ts`; CI is the fresh-DB authority and CI is green on #680–#693).

**Coverage**: Not configured as a gate in this repo → ➖ Not available (informational only per Strict TDD rules; not blocking)

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Every one of the 8 phases (PR1…PR8) has a full "TDD Cycle Evidence" table in `apply-progress.md` (RED/GREEN/TRIANGULATE/REFACTOR columns) |
| All tasks have tests | ✅ | 51/51 completed tasks have an associated spec file and RED→GREEN entry; task 1.10 is non-code (human gate) |
| RED confirmed (tests exist) | ✅ | Spot-checked test files exist for the sampled surface: `icono-categoria.spec.ts`, `categorias.schema.spec.ts`, `IconoCategoriaBadge.test.tsx`/`.spec.tsx` (web+mobile), `SelectorIcono.test.tsx`/`.spec.tsx`, `detalle-bucket-mes-view-model.spec.ts`, `GrupoMovimientosMobile.spec.tsx` — all present |
| GREEN confirmed (tests pass) | ✅ | Full suites re-run in this verify pass: api 2734/2734, web 2173/2173, mobile 930/930, all green |
| Triangulation adequate | ✅ | Every RED/GREEN row in `apply-progress.md` lists 2+ triangulated cases per behavior (valid value, null/clear, omitted, invalid, ownership) except a handful of intentional single-scenario rows (e.g. CATICO-05 has exactly one spec scenario) |
| Safety Net for modified files | ✅ | Every modified-file row shows a pre-edit passing baseline (e.g. "27/27 pre-existing"); new files correctly show "N/A (new)" |

**TDD Compliance**: 6/6 checks passed

---

### Assertion Quality
Scanned the 51 icono-related test files (`rg -l "icono|Icono"` across `apps/{api,web,mobile}/src`) for banned patterns (tautologies, ghost loops over possibly-empty collections, assertion-free tests). Found only pre-existing, standard empty-array edge-case assertions (`toEqual([])` for "zero patrones"/"zero transacciones" cases), each with sibling non-empty-case tests in the same file — not orphan or trivial. No tautologies, no ghost loops, no assertion-free tests found on the sampled surface.

**Assertion quality**: ✅ All sampled assertions verify real behavior

---

### Test Layer Distribution (icono-specific surface, approximate)
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | ~140 | ~40 | Vitest (api/web), Jest/jest-expo (mobile) |
| Integration | 1 new case | 1 | Vitest + ephemeral Postgres (`catalogo-isolation.int-spec.ts`) |
| E2E | 2 | 2 | Playwright (3 viewport projects) |
| **Total** | **~143** | **~43** | |

### Quality Metrics
**Linter**: ✅ No errors (api/web/mobile all report 0 errors in the apply-progress verification logs; mobile carries 1 pre-existing baseline warning in `BucketDetalleScreen.spec.tsx`, not introduced by this change)
**Type Checker**: ✅ No errors (api, web, mobile, `@moneydiary/api-client` all clean, re-verified in this pass)

---

### Spec Compliance Matrix

| Requirement | Scenarios | Test/Evidence | Result |
|---|---|---|---|
| CATICO-01 — curated allowlist sole authority | 1 | `apps/api/src/domain/value-objects/icono-categoria.spec.ts`; `icono-categoria.ts` — 24 kebab-case names, `esIconoCategoria` rejects real-but-unlisted names | ✅ COMPLIANT |
| CATICO-02 — create validates icono | 3 | `crear-categoria.use-case.spec.ts` (valid persists, invalid→400 no write, omitted→null) | ✅ COMPLIANT |
| CATICO-03 — update tri-state icono | 4 | `actualizar-categoria.use-case.spec.ts` (set/clear/leave-unchanged/invalid-unchanged, validation order) | ✅ COMPLIANT |
| CATICO-04 — seed defaults, no backfill | 2 | `catalogo-template.spec.ts`, `seed-catalog.spec.ts` (8 defaults, create-only, no backfill) | ✅ COMPLIANT |
| CATICO-05 — owner-scoped icon writes | 1 | `catalogo-isolation.int-spec.ts` new case: user B PATCHing A's icono → `CategoriaNoEncontradaError`, A's row (`icono='bus'`) unchanged | ✅ COMPLIANT |
| CATICO-06 — null renders generic fallback | 1 | `iconos-categoria.test.ts`/`.spec.ts` (web+mobile): `iconoCategoria(null/undefined/unknown) → Tag` fallback, never throws | ✅ COMPLIANT |
| CATICO-07 — allowlist parity across clients | 1 | `catalogo-constantes.mirror.spec.ts` (web + mobile) — both mirror `ICONOS_CATEGORIA` verbatim from the backend source | ✅ COMPLIANT |
| CATICO-08 — accessible names + decorative semantics | 2 | Web: `aria-label={etiqueta}` on picker options (`SelectorIcono.tsx:69`), `aria-hidden="true"` on badge glyph (`IconoCategoriaBadge.tsx:45`). Mobile: `accessibilityLabel={etiqueta}` on picker options, `accessibilityElementsHidden`+`importantForAccessibility="no-hide-descendants"` on badge | ✅ COMPLIANT |
| catalogo-clasificacion-ownership: DTO/endpoints carry icono | 3 | `categorias.schema.spec.ts`, `catalogo.dto.spec.ts`, `openapi:check` clean, `api-client typecheck` clean, `types.gen.ts` shows `icono?: string \| null` | ✅ COMPLIANT |
| MBD-02 — detalle groups carry icono, Sin categoría always null | 4 | `agrupar-detalle-por-categoria.spec.ts`, `prisma-detalle-bucket.repository.spec.ts` (icono present/null/synthetic-always-null); flat `/api/buckets/:bucket` contract confirmed NOT leaking icono (`detalle-bucket.dto.spec.ts`, post-validation fix `c2c6cdcf`) | ✅ COMPLIANT |
| WCTG-02 — config list badge | 4 | `CategoriaFila.test.tsx` (valid icono + null fallback, bucket-colored badge) | ✅ COMPLIANT |
| WDM-03 — detalle accordion heading badge | 5 | `GrupoMovimientos.test.tsx` (valid icono, null fallback, Sin-categoría-always-fallback), `bucket-detalle-mes.e2e.ts` | ✅ COMPLIANT |
| WCTG-12 (REMOVED, 11-code form) | 0 | Superseded by the 12-code form below; rename tracked, no independent scenario obligation | ➖ N/A (removal) |
| WCTG-12 (ADDED, 12-code form) | 4 | `mensajes-catalogo.test.ts` — 13-row `Record<CodigoCatalogo,string>` incl. `ICONO_INVALIDO`, `tag:'parse'`→`BODY_INVALIDO`, compile-fail-on-unmapped-code by construction (`Record` totality, verified via `tsc`) | ✅ COMPLIANT |
| Web icon picker (ADDED) | 3 | `SelectorIcono.test.tsx` (25 options, accessible names), `NuevaCategoriaForm.test.tsx` (POST carries icono), `EditarCategoria.test.tsx` (PATCH `Guardar` carries icono, both save paths) | ✅ COMPLIANT |
| MCTG-01 — mobile list badge | 4 | `CategoriaFila.spec.tsx` (mobile) — valid icono + null fallback wired into `IconoCategoriaBadge` | ✅ COMPLIANT |
| MCTG-06 — mobile error copy closed table | 3 | `mensajes-catalogo.spec.ts` (mobile) — 13-code table incl. `ICONO_INVALIDO`, `403 DEMO_SOLO_LECTURA` defensive mapping | ✅ COMPLIANT |
| Mobile icon picker (ADDED) | 3 | `SelectorIcono.spec.tsx` (mobile) — 25-option radiogroup, `accessibilityLabel`; `NuevaCategoriaForm.spec.tsx`/`EditarCategoria.spec.tsx` — POST/PATCH carry icono, tri-state via `patchIcono` | ✅ COMPLIANT |
| MDET-03 — mobile detalle header badge | 5 | `GrupoMovimientosMobile.spec.tsx` (valid icono, SinCategoria always-null fallback); `detalle-bucket-mes-view-model.spec.ts` | ⚠️ COMPLIANT (behavior) / naming drift noted below |

**Compliance summary**: 56/56 scenarios compliant by observable behavior; 1 requirement (MDET-03) carries a documented data-path naming drift (see Issues, WARNING).

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|---|---|---|
| CATICO-01 allowlist | ✅ Implemented | Exactly 24 entries, `apps/api/src/domain/value-objects/icono-categoria.ts:20-45` |
| CATICO-02/03 error semantics | ✅ Implemented | `IconoCategoriaInvalidoError` never echoes `rawValue` in `message` (`icono-categoria-invalido.error.ts`) |
| Schema transport shape (D-11) | ✅ Implemented | `categorias.schema.ts:43,62,111` and `bucket-detalle-mes.schema.ts:67` all `z.string().nullable().optional()`; route/DTO mappers always emit the key at runtime (route tests assert presence even when `null`) |
| ADR-045 + migration | ✅ Implemented | `docs/adr/ADR-045-categoria-icono-persistencia.md` exists, indexed in `docs/adr/README.md:66` and `CLAUDE.md:126`; `apps/api/prisma/migrations/20260915000000_categoria_icono/migration.sql` — additive nullable column, no CHECK, no backfill |
| Cross-client mirror | ✅ Implemented | `apps/web/src/api/catalogo-constantes.ts` + `apps/mobile/src/domain/catalogo-constantes.ts`, each with a drift-guard mirror spec |
| Dead code removal | ✅ Implemented | `apps/web/src/lib/category-icons.ts` and its test deleted in PR5 (`e298bf4f`); confirmed no surviving imports |
| Label fix (PR8) | ✅ Implemented | `ETIQUETA_ICONO['piggy-bank']` = `'Alcancía'` in both `apps/web/src/lib/iconos-categoria.ts:104` and `apps/mobile/src/components/iconos-categoria.ts:104` |
| 44pt touch target (mobile picker) | ✅ Implemented | `SelectorIcono.tsx` (mobile) uses numeric `TAMANO_OPCION_PT = 44` style, not a NativeWind class (post-validation CRITICAL fix in PR6, verified fixed) |

### Coherence (Design)
| Decision | Followed? | Notes |
|---|---|---|
| D-11 (optional wire field, server always emits) | ✅ Yes | Confirmed at both schema and route-test level; zero fixture churn across ~33 pre-existing web/mobile fixtures, as designed |
| D-08 (badge reuses bucket color tokens) | ✅ Yes | `claseGlifoBucket` (web) / `COLOR_GLIFO_BUCKET` (mobile) reuse existing `--color-pie-etiqueta-*` / measured contrast pairs, no new token family |
| Allowlist as domain constant (ADR-024 pattern) | ✅ Yes | Lives in `domain/value-objects`, consumed by application + infra, never duplicated |
| No DB CHECK constraint (D-03) | ✅ Yes | Migration comment confirms: domain allowlist is sole authority, so an allowlist edit never needs a schema migration |
| Feature-branch-chain delivery (400-line budget) | ✅ Yes | Every PR/PR-split (PR2/PR2b, PR3b/PR3b2, PR4/PR4b, PR6/PR6b) stayed at or under 400 changed lines except the maintainer-approved `size:exception` on #690 (412 lines) |

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. **MDET-03 named-source drift (mobile detalle badge data path).** `BucketDetalleScreen.tsx:263` passes `estado.dto.grupos[idx]!` (the raw DTO group) into `GrupoMovimientosMobile`, while the requirement names `aDetalleBucketMesViewModel` as the source and `GrupoDetalleMesViewModel.icono` (added in PR7) has no production reader. Verified directly: `viewModel.grupos` is used only for length (`:200`) and iteration index (`:260`); the actual per-group prop comes from the DTO. Observable behavior is correct — both objects carry the identical `icono` value with the same `?? null` normalization — so every MDET-03 scenario passes at runtime. This is a naming/traceability defect, not a functional one, and it is already recorded with an owed follow-up in `apply-progress.md`. **Assessment: acceptable to archive with.** It does not block merge or archive — it should be tracked as a small follow-up change (either rewire the prop to the view model, a one-line change per the orchestrator's own note, or amend MDET-03's wording to name the DTO path) rather than reopening this already-shipped, CI-green, fully-tested chain.
2. **Local integration/e2e/on-device evidence not independently re-run in this verify pass.** Per the launch instructions, the persistent local `moneydiary-test-db` has unrelated accumulated state that fails `seed.int-spec.ts` regardless of this change, and CI (fresh DB) is the authority — CI is green on #680–#693. The Playwright e2e suite and the manual on-device Maestro gate (ADR-017) for #690/#691/#692 were likewise not re-run here (explicitly out of scope for this verify environment). These are recorded as **outstanding**, not as failures.

**SUGGESTION**:
1. Consider adding a mirror-spec-style guard for `BUCKETS_ASIGNABLES`/`MATCH_TYPES` parity on mobile (PR3c intentionally scoped its new mirror spec to `ICONOS_CATEGORIA` only, per CATICO-07's literal text) — noted as a pre-existing gap unrelated to this change's own scope, not a defect introduced here.
2. The "Ahorro"/"Alcancía" label-collision class of bug (two `accessibilityRole="radio"`/native-radio groups sharing an accessible name) is now documented in `apply-progress.md` for future picker/selector pairings — worth promoting to a lint rule or shared test helper if a third such pairing appears.

### Task Verification
- 51/52 tasks ticked in `tasks.md`; cross-checked against `apply-progress.md`'s cumulative status blocks (PR1 → PR8) — every ticked task has a corresponding commit, TDD Cycle Evidence row, and (where applicable) file:line evidence confirmed independently in this pass (see Correctness table above).
- Task 1.10 ("Apply the migration to prod") is correctly **unticked** — verified `tasks.md` line 55 still reads `- [ ] 1.10 ...`. This is the intended human gate; it does not block `sdd-verify` per the launch instructions, but it DOES block safe archival of the tracker to `main` until run.
- Manual on-device Maestro gates (ADR-017) for #690 (mobile config+picker), #691 (mobile create/edit wiring), #692 (mobile detalle badges) are outstanding, maintainer-owned, and out of scope for this verification.

### Verdict
**PASS WITH WARNINGS**

Every one of the 19 frozen requirements (56 scenarios) across all six spec deltas is implemented and covered by a passing test, re-verified in this pass with fresh full-suite runs (api 2734, web 2173, mobile 930 — all green) plus clean typechecks and zero contract drift. The chain is internally consistent: TDD evidence is complete and auditable across all 8 delivery slices (PR1–PR8), the 400-line review budget was respected everywhere except one maintainer-approved exception, and every post-validation correction the orchestrator recorded (PR2b, PR5, PR6, PR7) has been independently re-confirmed as fixed. The sole WARNING (MDET-03's DTO-vs-view-model naming drift) is behavior-neutral and already tracked; it is a follow-up, not a blocker. This change is ready to merge bottom-up and archive **once** the two remaining human gates close: task 1.10 (prod migration) and the on-device Maestro passes for the mobile slices — neither of which this or any automated phase can perform.
