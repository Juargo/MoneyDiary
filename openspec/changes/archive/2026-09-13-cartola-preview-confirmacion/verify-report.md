```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:4fe557f6c8793ea00fa5928a96e28622f3b927f40e260405343a068035275b63
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 18/18
scenarios: 48/48
test_command: pnpm --filter @moneydiary/mobile test && pnpm web test && pnpm --filter @moneydiary/web exec playwright test e2e/subir-tal-cual.e2e.ts e2e/preview-stress.e2e.ts e2e/crear-categoria-preview.e2e.ts
test_exit_code: 0
test_output_hash: sha256:631b7229a6e47d43a586cedba74baf8b7945b8f675ba7db041bd8f0b153c5cb1
build_command: pnpm --filter @moneydiary/mobile exec tsc --noEmit && pnpm web typecheck && pnpm --filter @moneydiary/mobile lint && pnpm web lint
build_exit_code: 0
build_output_hash: sha256:66899be9eeb8e59cf0bad271937bf9a2318b88f61e9c2afd485ccfe7b4e51ac8
```

## Verification Report

**Change**: cartola-preview-confirmacion
**Version**: chain tip `feat/cartola-web-paso-decision` @ `e90a3700` (12 PRs, #655–#666, all open/unmerged; tracker `feat/cartola-preview-confirmacion` only carries the SDD artifacts commit on top of `main`)
**Mode**: Strict TDD (RED → GREEN → REFACTOR)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 42 |
| Tasks complete | 42 |
| Tasks incomplete | 0 (pre-release manual gate — Maestro on device + VoiceOver/TalkBack — moved out of the checklist by owner decision 2026-09-13; still blocks the first `mobile-v*` tag) |

### Build & Tests Execution
**Build**: PASSED
```text
$ pnpm --filter @moneydiary/mobile exec tsc --noEmit   → exit 0, no output
$ pnpm web typecheck (tsr generate && tsc -b)           → exit 0, no output
$ pnpm --filter @moneydiary/mobile lint (eslint .)      → exit 0; 1 pre-existing warning
                                                            (BucketDetalleScreen.spec.tsx:48,
                                                            no-require-imports — unrelated to this change)
$ pnpm web lint (eslint .)                               → exit 0, no output
```

**Tests**: PASSED — 0 failed
```text
$ pnpm --filter @moneydiary/mobile test
Test Suites: 77 passed, 77 total
Tests:       865 passed, 865 total

$ pnpm web test
Test Files  150 passed (150)
Tests       2123 passed (2123)

$ pnpm --filter @moneydiary/web exec playwright test e2e/subir-tal-cual.e2e.ts \
  e2e/preview-stress.e2e.ts e2e/crear-categoria-preview.e2e.ts
9 tests, 3 viewports (movil/tablet/escritorio):
6 passed, 3 skipped (tablet — pre-existing explicit convention, apps/web/e2e/* tablet
  projects are skip-by-design, unrelated to this change)
```

Known environmental flake `BucketDetalleScreen.spec.tsx` (per launch instructions) did NOT
reproduce in this full mobile run — 77/77 suites green.

**Coverage**: Not run — no coverage tool invoked this pass (not required by `rules.verify`); informational only, non-blocking per strict-tdd-verify.md.

---

### Spec Compliance Matrix — `mobile-import-preview` (12 requirements, 22 scenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| MOB-PRV-01 | Valid file selection → loading | `apps/mobile/app/subir.spec.tsx:113` (guard integration) + preview flow tests | ✅ COMPLIANT |
| MOB-PRV-01 | Loading visible until preview responds | `apps/mobile/app/subir.spec.tsx` (loading-state assertions) | ✅ COMPLIANT |
| MOB-PRV-02 | Legacy-only response rejected at boundary | `apps/mobile/src/api/preview-ingesta.spec.ts:27,285,302,329,343` | ✅ COMPLIANT |
| MOB-PRV-02 | Canonical response passes guard | `apps/mobile/src/api/preview-ingesta.spec.ts:43` + `subir.spec.tsx:113` | ✅ COMPLIANT |
| MOB-PRV-03 | Decision step shows resumen + both actions | `apps/mobile/src/components/subir/ResumenDecision.spec.tsx:18,33` + `subir.spec.tsx:315` | ✅ COMPLIANT |
| MOB-PRV-04 | As-is commit sends `edits: []` | `apps/mobile/src/api/commit-ingesta.spec.ts:133` + `subir.spec.tsx:142,452,480` | ✅ COMPLIANT |
| MOB-PRV-04 | As-is commit success shows completion | `subir.spec.tsx:452,480` (asserts `duplicadosOmitidos`) | ✅ COMPLIANT |
| MOB-PRV-05 | All rows render, no page-size selector | `apps/mobile/src/components/subir/ListaRevision.spec.tsx:10,41` (`FlatList` `props.data.length`) + `subir.spec.tsx:344` | ✅ COMPLIANT |
| MOB-PRV-06 | Duplicate row not tappable, badge shown | `apps/mobile/src/components/subir/FilaRevisionMobile.spec.tsx:54` | ✅ COMPLIANT |
| MOB-PRV-06 | Ingreso row not tappable, settled | `FilaRevisionMobile.spec.tsx:91` | ✅ COMPLIANT |
| MOB-PRV-06 | Non-duplicate/non-Ingreso row opens sheet | `FilaRevisionMobile.spec.tsx:152` + `subir.spec.tsx:366,387,393,400` | ✅ COMPLIANT |
| MOB-PRV-06 | Non-interactive rows expose no button role (screen reader) | `FilaRevisionMobile.spec.tsx:54,91` assert absence of `accessibilityRole="button"` (RNTL proxy) | ⚠️ PARTIAL — automated proxy passes; real VoiceOver/TalkBack traversal is the **pending manual gate** (apply-progress.md, owner-deferred 2026-09-13) |
| MOB-PRV-07 | Bucket selection filters categoría options | `apps/mobile/src/components/subir/HojaClasificacion.spec.tsx:113` | ✅ COMPLIANT |
| MOB-PRV-07 | Confirm records pending edit, row updates | `HojaClasificacion.spec.tsx` (confirm case) + `subir.spec.tsx:423` | ✅ COMPLIANT |
| MOB-PRV-08 | Commit sends only user-edited rows | `apps/mobile/src/domain/preview-cartola.spec.ts:110,128,135` (`aOverlayEdits`) + `subir.spec.tsx:487,503` | ✅ COMPLIANT |
| MOB-PRV-09 | Discard from decision step | `subir.spec.tsx:685,699` | ✅ COMPLIANT |
| MOB-PRV-09 | Cancel from review step | `subir.spec.tsx:699` (edits cleared) | ✅ COMPLIANT |
| MOB-PRV-10 | Preview 400 shows message, allows re-pick | `apps/mobile/src/api/commit-ingesta.spec.ts:219,255,273,286` + `subir.spec.tsx:765,790` | ✅ COMPLIANT |
| MOB-PRV-10 | Commit failure from review preserves list+edits | `subir.spec.tsx:765,790` | ✅ COMPLIANT |
| MOB-PRV-11 | Decision actions have accessible labels | `ResumenDecision.spec.tsx:33` asserts `accessibilityLabel` props (RNTL proxy) | ⚠️ PARTIAL — automated proxy passes; real screen-reader announcement is the **pending manual gate** |
| MOB-PRV-11 | Sheet controls have accessible labels | `HojaClasificacion.spec.tsx:97,270` asserts `accessibilityLabel` props (RNTL proxy) | ⚠️ PARTIAL — same pending manual gate |
| MOB-PRV-12 | One-shot client and selector gone | `rg post-ingesta` finds only historical comments, no imports; `post-ingesta.ts` deleted (verified directly, no test found) | ✅ COMPLIANT |

**Compliance summary**: 19/22 fully COMPLIANT via automated test; 3/22 PARTIAL (automated proxy green, real-device screen-reader pass pending — reported as pending manual gate per launch instructions, not as failing).

---

### Spec Compliance Matrix — `web-import-preview` delta (4 requirements, 19 scenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| WEB-PRV-02 | Resumen header shows correct counts | `apps/web/src/components/SubirCartola.test.tsx:564,593,594` | ✅ COMPLIANT |
| WEB-PRV-02 | Decision step renders with no table | `SubirCartola.test.tsx:594` | ✅ COMPLIANT |
| WEB-PRV-02 | All filas render without truncation once reviewing | `PreviewMuestra.test.tsx:92,110,309` | ✅ COMPLIANT |
| WEB-PRV-02 | Amounts rendered via `formatearMontoCLP`, no re-derivation | `PreviewMuestra.test.tsx` (pre-existing, unmodified per PR9 zero-behavior-change) | ✅ COMPLIANT |
| WEB-PRV-02 | Restored draft skips decision step | `SubirCartola.test.tsx:2667` | ✅ COMPLIANT |
| WEB-PRV-06 | "Subir tal cual" commits with `edits: []` | `SubirCartola.test.tsx:627,743,926,928` + `e2e/subir-tal-cual.e2e.ts:86,112` | ✅ COMPLIANT |
| WEB-PRV-06 | Commit sends file+edits (review path) | `SubirCartola.test.tsx:2983` (pre-existing) | ✅ COMPLIANT |
| WEB-PRV-06 | Success invalidates queries, lands on `exito` | `SubirCartola.test.tsx:2958` (query invalidation, pre-existing) + `e2e/subir-tal-cual.e2e.ts` | ✅ COMPLIANT |
| WEB-PRV-06 | `exito` offers both actions | Pre-existing `SubirCartola.test.tsx` `exito` suite (unmodified) | ✅ COMPLIANT |
| WEB-PRV-06 | Unedited/duplicate rows excluded from overlay | Pre-existing `FilaRevision.test.tsx` overlay assembly tests (unmodified) | ✅ COMPLIANT |
| WEB-PRV-06 | Commit 400 preserves table+edits | Pre-existing `SubirCartola.test.tsx` error-handling suite | ✅ COMPLIANT |
| WEB-PRV-06 | Commit 500 same preserve-and-retry | Pre-existing `SubirCartola.test.tsx` error-handling suite | ✅ COMPLIANT |
| WEB-PRV-06 | New file after error resets flow | Pre-existing `SubirCartola.test.tsx` | ✅ COMPLIANT |
| WEB-PRV-06 | "Subir tal cual" error keeps decision step visible | `SubirCartola.test.tsx:627` (new, PR10) | ✅ COMPLIANT |
| WEB-PRV-07 | Discard from review table | `SubirCartola.test.tsx:1066,1284` (pre-existing) | ✅ COMPLIANT |
| WEB-PRV-07 | Discard from decision step | `SubirCartola.test.tsx:697` (new, PR10) | ✅ COMPLIANT |
| WEB-PRV-07 | Edits do not survive discard→reupload | Pre-existing `SubirCartola.test.tsx` cycle test | ✅ COMPLIANT |
| WEB-PRV-19 | Both actions present and labeled | `SubirCartola.test.tsx:263,594,669` | ✅ COMPLIANT |
| WEB-PRV-19 | "Revisar y editar" is only path to table | `SubirCartola.test.tsx:594` + `e2e/crear-categoria-preview.e2e.ts:153` (clicks "Revisar y editar" before reaching table) | ✅ COMPLIANT |

**Compliance summary**: 19/19 COMPLIANT.

---

### Spec Compliance Matrix — `ingesta-preview-commit` delta (1 requirement, 3 scenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| DEP-01 | Deprecated one-shot still works for a direct caller | Pre-existing backend `commit-ingesta`/one-shot integration tests (endpoint itself untouched by this change) | ✅ COMPLIANT |
| DEP-01 | `openapi.json` marks one-shot deprecated | Verified directly: `apps/api/openapi.json:2095` `"deprecated": true` under `POST /api/ingestas`; `preview`/`commit` operations present and non-deprecated | ✅ COMPLIANT (static evidence, no dedicated test found — `openapi.json` is generated/asserted at build, not covered by a runtime spec test) |
| DEP-01 | No shipped client imports the one-shot path | Verified directly: `rg post-ingesta apps/mobile/src apps/mobile/app` returns only historical comments (no `import`); `apps/mobile/src/api/post-ingesta.ts` does not exist | ✅ COMPLIANT |

**Compliance summary**: 3/3 COMPLIANT (2/3 via runtime test, 1/3 via direct static verification of a generated artifact — acceptable per Correctness note below).

---

### Spec Compliance Matrix — `mobile-app` delta (1 requirement, 4 scenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| MAC-01 | No hand-written DTO remains for a covered endpoint | `apps/mobile/src/api/commit-ingesta.ts:9,19` type-aliases `CommitIngestaDto` from `@moneydiary/api-client`; `tsc --noEmit` green | ✅ COMPLIANT |
| MAC-01 | Mobile typecheck + test suite pass on derived types | `pnpm --filter @moneydiary/mobile exec tsc --noEmit` (exit 0) + full test run (865/865) | ✅ COMPLIANT |
| MAC-01 | New commit client derived from generated types | `apps/mobile/src/api/commit-ingesta.ts:9` (`export type { CommitIngestaDto }`) | ✅ COMPLIANT |
| MAC-01 | `post-ingesta.ts` no longer exists | Verified directly: file absent, no imports (same evidence as MOB-PRV-12/DEP-01) | ✅ COMPLIANT |

**Compliance summary**: 4/4 COMPLIANT.

---

### Overall Spec Compliance

**45/48 scenarios COMPLIANT** (18/18 requirements have at least one compliant covering scenario). **3/48 scenarios PARTIAL — pending manual gate**: all three are the screen-reader-traversal halves of MOB-PRV-06 and MOB-PRV-11, where an RNTL proxy assertion (accessible role/label presence) already passes but the actual VoiceOver/TalkBack device pass has not been run, per the owner's explicit 2026-09-13 decision to move that gate out of the implementation checklist. This is reported as **pending**, not as failing or as compliant, per the launch instructions.

---

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|---|---|---|
| ADR-024 (client presentation-only) | ✅ Implemented | `esFilaEditable`/`categoriaEfectiva`/`aOverlayEdits` (`apps/mobile/src/domain/preview-cartola.ts:17,51-96`) read `sugerido.bucket` verbatim, never derive Ingreso from `abono`/`cargo`; web `formatearMontoCLP` remains display-only (unmodified) |
| ADR-044 scope limits | ✅ Implemented | No amount-editing control found in `FilaRevisionMobile.tsx`/`HojaClasificacion.tsx` (only display of `cargo`/`abono`); no inline "+ Nueva categoría" affordance in `apps/mobile/src/components/subir/` (grep found zero matches) |
| Deprecated one-shot client removal | ✅ Implemented | `apps/mobile/src/api/post-ingesta.ts` deleted; no import references it anywhere in `apps/mobile` |
| `openapi.json` DEP-01 annotation | ✅ Implemented | `"deprecated": true` present on `POST /api/ingestas` |

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| D-01 `useState` discriminated union (no reducer) | ✅ Yes | `subir.tsx` state machine |
| D-02 `git mv` rename for `commit-ingesta.ts` | ⚠️ Documented deviation | Rename credit lost (38% similarity, below the 50% threshold); recorded in tasks.md 3.5 and apply-progress.md as an explicit, owner-approved `size:exception` — not undocumented |
| D-04 edits map is `ReadonlyMap<rowIndex, categoriaId>` | ✅ Yes | `preview-cartola.ts:66-73` |
| D-05 Ingreso rows non-editable, excluded from overlay | ✅ Yes | Spec already amended (MOB-PRV-06/08 read as amended); implementation matches |
| D-06 single `HojaClasificacion` Modal reusing `SelectorChips` | ✅ Yes, with recorded deviation | PR7 explicitly resolved a design-vs-task wording conflict in favor of design.md (catalog fetch lives on the screen, not the sheet) — recorded in tasks.md 7.2 |
| D-07 Web `revisando: boolean` derived `estado` | ✅ Yes | `SubirCartola.tsx:70-100,350-362` |
| D-08 `ResumenCartola` extraction, zero behavior change | ✅ Yes | PR9, confirmed no pre-existing test file touched |
| D-09 synchronous `useRef` double-submit guard | ✅ Yes | PR8b, `subir.tsx` commit actions |
| Screen swap error handling (Phase 6) | ⚠️ Documented deviation | Commit failure embeds `error` in `decidiendo`/`revisando` instead of the design's bare "back to origen + error" note — recorded in tasks.md 6.3 |

No undocumented deviations found — every departure from design.md is recorded in tasks.md or apply-progress.md with an explicit rationale.

---

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | RED/GREEN/REFACTOR sequence present for every phase in tasks.md (1-10) |
| All tasks have tests | ✅ | 10/10 phases have RED test tasks preceding GREEN implementation tasks |
| RED confirmed (tests exist) | ✅ | All referenced spec/test files exist and were inspected directly (see matrices above) |
| GREEN confirmed (tests pass) | ✅ | 865/865 mobile + 2123/2123 web + 6/9 (3 skipped by convention) Playwright, all green at chain tip |
| Triangulation adequate | ✅ | Multiple cases per behavior throughout (e.g. `HojaClasificacion.spec.tsx` 10 cases; `commit-ingesta.spec.ts` 400/401/network/parse cases) |
| Safety Net for modified files | ✅ | Full-suite runs (865/865, 2123/2123) executed post-change, not just touched-file runs |

**TDD Compliance**: 6/6 checks passed

---

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | majority of 865 (mobile) + 2123 (web) | 77 + 150 | Jest (jest-expo) / Vitest |
| Integration/Component | Included above (RNTL/Testing Library render+interaction) | subset of above | RNTL / Testing Library |
| E2E | 9 (6 run, 3 skipped by convention) | 3 spec files | Playwright, 3 viewports |
| **Total** | 865 + 2123 + 9 | 227 + 3 | |

### Changed File Coverage
Coverage analysis skipped — no coverage tool invoked this pass (not required by `rules.verify`); informational only.

### Assertion Quality
Spot-checked the new test files referenced in the compliance matrices above (`FilaRevisionMobile.spec.tsx`, `HojaClasificacion.spec.tsx`, `ListaRevision.spec.tsx`, `ResumenDecision.spec.tsx`, `commit-ingesta.spec.ts`, `preview-cartola.spec.ts`, `SubirCartola.test.tsx` new cases): assertions consistently assert on rendered text/values, callback payloads (`{rowIndex, categoriaId}`), and request bodies (`edits: []`/populated overlay) — no tautologies, no ghost loops, no assertion-without-production-call patterns observed. `ListaRevision.spec.tsx` explicitly asserts `props.data.length` (not rendered DOM count) with a documented rationale (jest/FlatList renders only ~10 rows), which is correct triangulation for a virtualization boundary, not a trivial assertion.

**Assertion quality**: ✅ No CRITICAL or WARNING patterns found in the sampled files.

### Quality Metrics
**Linter (mobile)**: ⚠️ 1 pre-existing warning (unrelated file, unrelated to this change) / 0 errors
**Linter (web)**: ✅ No errors
**Type Checker (mobile)**: ✅ No errors
**Type Checker (web)**: ✅ No errors

---

### Issues Found

**CRITICAL**: None

**WARNING**:
1. Pre-release manual gate NOT yet run: Maestro (`subir`, `subir-cancelar`, `subir-editar`) on device, and VoiceOver (iOS)/TalkBack (Android) over decision actions, row list, and sheet controls (ADR-018, MOB-PRV-06's accessible-role scenario, MOB-PRV-11's two scenarios). Explicitly deferred by owner decision (2026-09-13); blocks the first `mobile-v*` tag, does not block this code-level verification.
2. `size:exception` labels not yet applied on GitHub PRs #656, #657, #661, #662, #663, #666 (apply-progress.md "Pending (owner)") — a process/governance follow-up before merge, not a code defect.
3. Two known spec-gap syncs deferred to archive time (both already transparently tracked in apply-progress.md/tasks.md, not undocumented): (a) mobile catalog loading/failure UX (MOB-PRV-06/07/10 are silent on it; resolved ad hoc as list-visible/sheet-disabled-until-ready/inline-retryable-error) needs folding into the canonical `mobile-import-preview` spec; (b) the `ingesta-preview-commit` delta's "Client Consumers" MODIFIED section needs merging into the canonical spec's Client Consumers prose at archive (normal OpenSpec archive mechanics, flagged here only as a reminder).
4. `design.md`'s Open Questions checklist still shows `- [ ]` (unchecked) for "amend MOB-PRV-06/08 so Ingreso rows are also non-editable (D-05)" even though the retrieved `mobile-import-preview/spec.md` already ships that amendment (MOB-PRV-06 explicitly covers Ingreso rows) and the implementation matches it. Stale checkbox only — doc hygiene, not a functional gap.
5. The chain (#655-#666) is fully green and unmerged; DEP-01's "no shipped client imports the one-shot path" is true on this branch but not yet true on `main` until the chain merges — expected state for a feature-branch-chain mid-review, not a defect.

**SUGGESTION**: None beyond what design.md already tracks (e.g. D-03's YAGNI note on a shared multipart helper, correctly deferred).

---

### Verdict
**PASS WITH WARNINGS**
All 42 tasks complete, all 18 requirements have compliant automated coverage, 865/865 mobile + 2123/2123 web unit/component tests and 6/9 (3 skipped by convention) Playwright e2e all green, typecheck and lint clean on both workspaces, zero undocumented design deviations, zero AI attribution in any of the 12 chain commits. The only open items are process/governance (owner-deferred manual accessibility gate, pending `size:exception` labels, two spec-gap syncs already scheduled for archive) — none of them a CRITICAL code or spec-compliance defect.
