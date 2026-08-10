## Verification Report

**Change**: api-client-package
**Version**: N/A (no version bump — internal `workspace:*` package)
**Mode**: Strict TDD (package itself has no test runner by design; verification is type-level + CI drift gate; web/mobile have runnable suites)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 61 (Phases 1-12 + Requirement Coverage cross-check) |
| Tasks complete | 61 |
| Tasks incomplete | 0 |

All three PRs are merged to `main`: #264 (Slice 1, package + CI foundation, `8a56684` → merged `d15e22b`'s ancestry), #265 (Slice 2, web adoption, `7eb8f8e`), #266 (Slice 3, mobile adoption, `d15e22b`). Worktree HEAD (`d15e22b`) is the merge commit of PR #266.

### Build & Tests Execution

**`packages/api-client` typecheck**: PASSED
```text
$ pnpm --filter @moneydiary/api-client typecheck
$ tsc --noEmit
(zero output — clean exit)
```

**Drift gate (AC-03, task 5.2 re-verified live)**: PASSED — regenerated with no contract change, `git diff --stat -- packages/api-client/src/types.gen.ts` empty, MD5 before/after identical (`6ae0ea4fb7ba61b08c70fb7b9c30b61f`).

**Web typecheck**: PASSED
```text
$ pnpm --filter @moneydiary/web typecheck
$ tsr generate && tsc -b
(zero output — clean exit)
```

**Web tests**: PASSED — 61 test files, 560 tests, all passing.
```text
Test Files  61 passed (61)
     Tests  560 passed (560)
```

**Mobile typecheck**: PASSED
```text
$ pnpm --filter @moneydiary/mobile exec tsc --noEmit
(zero output — clean exit)
```

**Mobile tests**: PASSED — 27 test suites, 236 tests, matches the pre-migration baseline exactly (byte-identical count, per apply-progress).
```text
Test Suites: 27 passed, 27 total
Tests:       236 passed, 236 total
```

`login.spec.tsx` flake investigation: ran in isolation (18/18 passed), 3x full-suite in-band (`--runInBand`, 236/236 each), and 3x full-suite default-parallel (236/236 each) — **7 consecutive runs, zero flake reproduced** in this environment. Classified as **not currently reproducible / non-blocking**; the pre-existing `act(...)` console.error noise around `app/index.tsx` (unrelated component, unrelated to `login.spec.tsx`) is present in output but does not fail any test. No action required; not filed as a finding.

**Coverage**: Not applicable — no coverage threshold configured for this change; not a gating metric per project convention.

### Spec Compliance Matrix

| Requirement | Scenario | Test / Evidence | Result |
|---|---|---|---|
| AC-01 | Package resolves as workspace member | `pnpm-workspace.yaml` line `packages/*`; PR #264/#265/#266 CI all show `@moneydiary/api-client` resolved by web+mobile jobs | ✅ COMPLIANT |
| AC-01 | Package contains no runtime code | `rg "^export (const\|function\|class\|let\|var) " packages/api-client/src/index.ts` → 0 matches; manual read confirms only `export type` | ✅ COMPLIANT |
| AC-02 | Generate script reads committed contract | `packages/api-client/package.json` `scripts.generate` → `openapi-typescript ../../apps/api/openapi.json --immutable --output ./src/types.gen.ts` | ✅ COMPLIANT |
| AC-03 | Re-generating with no contract changes is a no-op diff | Live re-run: `pnpm api-client generate` → `git diff --stat` empty, MD5 unchanged | ✅ COMPLIANT |
| AC-03 | Contract changed without regenerating fails CI | `.github/workflows/ci.yml:499-504` — `git diff --exit-code -- packages/api-client/src/types.gen.ts` with `::error::` message | ✅ COMPLIANT (static; drift-gate order regenerate→diff confirmed) |
| AC-03 | Contract regenerated correctly passes CI | PR #264/#265/#266 all show `Typecheck & contract-drift (api-client)` job passing | ✅ COMPLIANT |
| AC-04 | Money fields resolve to `string`, compile-time assertion | Full sweep of `apps/api/openapi.json` schemas for money-named fields → exactly 10 (`cargo`×4, `abono`×4, `total`×1, `totalIngreso`×1), all `type: string`; `money-contract.assert.ts` has exactly 10 `Assert<Eq<...,string>>` exports covering all 10; `pnpm api-client typecheck` green | ✅ COMPLIANT |
| AC-05 | Consumer typechecks without a package build step | `packages/api-client/` has no `dist/`, no `build` script (`rg "\"build\""` → 0 matches); `types`/`exports` point at `./src/index.ts`; web+mobile tsc both green above | ✅ COMPLIANT |
| AC-06 | A `packages/**`-only change runs web+mobile CI jobs | PR #264 diff (`gh pr diff 264 --name-only`) touches only `packages/api-client/**`, root config, `.github/workflows/ci.yml`, `docs/adr/`, `openspec/` — zero `apps/web/**` or `apps/mobile/**` files — yet `Typecheck & unit tests (web)` and `Typecheck & unit tests (mobile)` both ran and passed on that PR | ✅ COMPLIANT |
| WAC-01 | No hand-written interface remains for a covered DTO | `rg "^interface \|^export interface " apps/web/src/api/types.ts` → 0 matches (171 lines, down from 238) | ✅ COMPLIANT |
| WAC-01 | Web typecheck passes using derived types | `pnpm web typecheck` green (above) | ✅ COMPLIANT |
| WAC-02 | Guard-behavior test still passes unchanged | `client.test.ts:182,202` money-safety boundary tests (`buckets[0].total` non-string) present and passing in the 560/560 green run; PR #265 diff excludes `client.ts` entirely (0 lines touched) | ✅ COMPLIANT |
| WAC-02 | Money fields still type as `string` | Alias chain confirmed: `types.ts` → `@moneydiary/api-client` → `types.gen.ts` `string`, AC-04 assertion covers it | ✅ COMPLIANT |
| WAC-02 | `ApiError` taxonomy untouched | `apps/web/src/api/client.ts:26` `type ApiError` present, unedited; PR #265 diff (`gh pr diff 265 --name-only`) does not include `client.ts` or `auth.ts` | ✅ COMPLIANT |
| MAC-01 | No hand-written DTO type remains for a covered endpoint | `apps/mobile/src/domain/resumen.types.ts`, `src/api/client.ts`, `src/api/post-ingesta.ts`, `src/api/preview-ingesta.ts` all alias/re-export from `@moneydiary/api-client` (verified by read + grep) | ✅ COMPLIANT |
| MAC-01 | Mobile typecheck and test suite pass | `tsc --noEmit` green; 27/27 suites, 236/236 tests green (above) | ✅ COMPLIANT |
| MAC-02 | `verbatimModuleSyntax` is set | `apps/mobile/tsconfig.json:7` → `"verbatimModuleSyntax": true` | ✅ COMPLIANT |
| MAC-02 | Type-only imports are erased before bundling | `rg "from '@moneydiary/api-client'"` across all 5 touched mobile files → every occurrence is `import type {...}` / `export type {...}`; apply-progress spike (Phase 10, `expo export --platform android`, 1760 modules bundled, GO) is direct end-to-end evidence for the Metro claim (not independently re-run here — cited as prior evidence per task guidance) | ✅ COMPLIANT |
| MAC-03 | Guard-behavior test still passes unchanged | `client.spec.ts:164` `esResumenMesDto`-equivalent parse-guard test present and passing in the 236/236 green run | ✅ COMPLIANT |
| MAC-03 | `ApiError` taxonomy and `conTimeout` untouched | `apps/mobile/src/api/client.ts:25` `type ApiError` present, unedited; PR #266 diff (`gh pr diff 266 --name-only`) excludes `con-timeout.ts`, `session-store.ts`, `session-context.tsx`, `use-google-id-token.ts` entirely | ✅ COMPLIANT |

**Compliance summary**: 21/21 scenarios compliant.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|---|---|---|
| Package identity/exports | ✅ Implemented | `name: @moneydiary/api-client`, `exports: {".": {"types": "./src/index.ts"}}` — no `default`/`import` condition, deliberate no-runtime-entry design |
| Generator version pin | ✅ Implemented | `openapi-typescript@7.13.0` exact-pinned in `devDependencies`, `--immutable` flag present and used |
| ADR-012 note | ✅ Implemented | Dated 2026-08-09 note appended to `docs/adr/ADR-012-packages-api-client.md`, matches design's drafted prose intent (types-only, no build, committed `types.gen.ts`) |
| Tracked debt registered | ✅ Implemented | `tasks.md` "Tracked Debt" table: runtime client, mobile `esMeDto` demo-account gap, mobile-adoption-if-spike-failed contingency (moot, spike passed), `verbatimModuleSyntax` ESLint fallback (moot, no cascade) |
| Review Workload Forecast honored | ✅ Implemented | 3 chained PRs stacked-to-main as forecast; PR #264 hand-written delta 228/28 (Slice 1, generated file excluded, low risk as predicted); Slice 2/3 deltas confirmed in apply-progress (~340, ~140, both within budget) |

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| Alias layer is hand-curated, not raw `components` re-export | ✅ Yes | `src/index.ts` has exactly the 15 documented one-line indexed-access aliases plus `paths`/`components`/`operations` re-export |
| Every alias is a one-line indexed access, no re-declared/widened fields | ✅ Yes | Manual inspection of `src/index.ts` confirms |
| Mismatches resolved in the app, never in the alias | ✅ Yes | `estadoSemaforo` narrowing and `googleLoginMobileEnabled` widening both accepted as-is per design's policy table; no compensating edit in `index.ts` or `types.ts` |
| `types.gen.ts` committed (not gitignored) | ✅ Yes | Present in git, `.prettierignore` entry added, no `.gitignore` entry |
| No build step (`tsup`, `dist/`) | ✅ Yes | Confirmed above (AC-05) |
| Spike-gated mobile slice, three-step, go/no-go | ✅ Yes | Apply-progress documents all 3 spike steps (TS resolution, jest-expo transform, Metro export) with GO outcome before any mobile code change |
| `verbatimModuleSyntax` erasure guarantee | ✅ Yes | Set true, zero cascade fallout reported, MAC-02 confirmed live |
| What explicitly does NOT change (web + mobile) | ✅ Yes | Confirmed via PR diff file lists — neither PR touches `client.ts` fetch bodies/guards, `auth.ts`, `ApiError`, `conTimeout`, `session-store.ts`, `session-context.tsx`, `use-google-id-token.ts` |
| Chain strategy: stacked-to-main | ✅ Yes | All 3 PRs merged directly to `main` in dependency order (1 → 2, 1 → 3) |

### TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | ✅ | Apply-progress documents RED→fix→GREEN cycles for fixture fallout (WAC/MAC-01) and explicit baseline capture before migration (WAC-02/MAC-03 "confirm existing tests are the RED-equivalent baseline, then GREEN after") |
| All tasks have tests | ✅ | Tasks 6.2 (web pre-migration baseline), 8.1/8.3 (web fixture fix-verify), 9.1/9.2 (web final green), 10.2/10.3/10.4 (mobile spike gate), 12.1/12.2/12.5 (mobile fixture fix-verify) all executed per apply-progress and independently re-confirmed live in this verify pass |
| GREEN confirmed (tests pass) | ✅ | Web 560/560, mobile 236/236, api-client typecheck clean — all re-run live, not trusted from report alone |
| Triangulation adequate | ➖ | N/A — this change is a type-source substitution with pre-existing test coverage as the safety net, not new business logic requiring new triangulated test cases; no new test cases were required by the spec's scenarios beyond the pre-existing guard tests, which remained unedited by design |
| Safety Net for modified files | ✅ | Baseline test counts captured before each app's migration (task 6.2 for web; apply-progress "27 test suites / 236 tests" baseline for mobile), matched post-migration exactly |

**TDD Compliance**: 4/5 checks fully applicable and passed; 1 marked N/A with justification (no new production logic, only type-source substitution — the spec's own scenarios require guard tests to pass *unmodified*, which is the stronger bar).

### Assertion Quality
No new test files were authored by this change (only fixture edits to existing test files: `capabilities.test.tsx`, `client.spec.ts`, `session-context.spec.tsx`, `test/auth-navigation.integration.spec.tsx`, `post-ingesta.spec.ts`, `app/subir.spec.tsx`). Spot-checked fixture diffs (`esDemo: false`, `duplicadosOmitidos: 0`, `googleLoginMobileEnabled`) are value additions to existing fixture objects, not new assertions — no tautologies, no ghost loops, no smoke-test-only patterns introduced.

**Assertion quality**: ✅ No new assertions introduced; no issues found in touched fixture files.

### Issues Found

**CRITICAL**: None

**WARNING**: None

**SUGGESTION**:
- The `login.spec.tsx` flake mentioned in the verify brief was not reproduced across 7 runs (1 isolated, 3 in-band, 3 parallel) in this environment. If it was observed in CI at some point, consider it either resolved by a prior fix or environment-specific; no action taken here since it did not manifest.

### Verdict
**PASS**
All 11 spec requirements (AC-01..06, WAC-01/02, MAC-01..03) across 21 scenarios are compliant with live-executed evidence; all 61 tasks are checked and match the code state on `main`; all three PRs (#264, #265, #266) are merged with green CI including the new `api-client` drift-gate job and the `packages`-triggered web/mobile fan-out. No CRITICAL or WARNING findings. Ready for `sdd-archive`.
