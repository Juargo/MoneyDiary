# Tasks: API Client Package (api-client-package)

> Reads: `specs/api-client/spec.md` (AC-01..AC-06), `specs/web-app/spec.md` (WAC-01/WAC-02),
> `specs/mobile-app/spec.md` (MAC-01..MAC-03), `design.md` ("Slice sketch for `sdd-tasks`").
> **Note for verify/archive:** the mobile delta spec was ratified to live at `specs/mobile-app/spec.md`
> (cross-cutting; it belongs to neither the `mobile-resumen-screen` nor `mobile-session-auth` capability).
> Strict TDD Mode is active for this project. The package itself has **no test runner by design** — its
> verification is type-level (`money-contract.assert.ts`, compiled by `tsc` in slice 1) plus the CI drift
> gate; there is no RED/GREEN cycle to apply inside `packages/api-client`. Web and mobile slices DO have
> runnable test suites (`pnpm web test`, `pnpm --filter @moneydiary/mobile test`) — those phases still order
> "confirm existing tests are the RED-equivalent baseline, then GREEN after the alias swap" per WAC-02/MAC-03
# (a guard test passing unmodified is the acceptance criterion, not a new failing test).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | Slice 1: ~170 hand-written + ~700-1000 generated (`types.gen.ts`, reviewed by regenerating, not reading) · Slice 2: ~340 hand-written · Slice 3: ~140 hand-written |
| 400-line budget risk | Slice 1: Low (hand-written) / N/A (generated, build artifact) · Slice 2: Medium-High (closest to budget, ~340) · Slice 3: Low |
| Chained PRs recommended | Yes — fixed by design's slice sketch, not re-litigated here |
| Suggested split | PR 1 (Slice 1: package + CI foundation) → PR 2 (Slice 2: web adoption) → PR 3 (Slice 3: mobile adoption) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (each PR → `main`, per ADR-031) |

Decision needed before apply: **No** — chain strategy and slicing already fixed by design + orchestrator session decisions.
Chained PRs recommended: **Yes**
Chain strategy: **stacked-to-main**
400-line budget risk: **Medium-High on Slice 2** (closest to the 400-line hand-written budget; almost entirely mechanical interface-to-alias deletion, low review-complexity-per-line). Slices 1 and 3 are Low.

### Suggested Work Units (map to PRs)

| Unit | Goal | PR | Depends on |
|------|------|-----|------------|
| 1 | Package + CI foundation | PR 1 (stacked → main) | none |
| 2 | Web adoption (`types.ts` alias barrel) | PR 2 (stacked → main) | PR 1 merged |
| 3 | Mobile adoption (spike-gated) | PR 3 (stacked → main) | PR 1 merged (independent of PR 2) |

PR 2 and PR 3 are independent of each other — either can be dropped without touching the other (design
"Dependency order is strict: 1 → 2, 1 → 3").

## Phase 1: Slice 1 — Resolve generator version + confirm flags (PR 1)

- [ ] 1.1 Run `npm view openapi-typescript time --json` (or `pnpm view`). Pick the newest `7.x` release whose
      publish date is ≥ 8 days before today. Record the exact version (no caret) for task 1.4.
- [ ] 1.2 Run `npx openapi-typescript@<resolved-version> --help` (or check the package's README at that
      version via Context7/npm) and confirm the `--immutable` flag exists under that exact name.
      - If absent/renamed: switch scripts.generate to omit `--immutable`, and note in `src/index.ts`'s
        top-of-file comment that generated types are mutable (widening — no consumer mutates a DTO).
- [ ] 1.3 Add `packages/*` to `pnpm-workspace.yaml`'s `packages:` list (alongside `apps/*`).

## Phase 2: Slice 1 — Package skeleton (PR 1)

- [ ] 2.1 Create `packages/api-client/package.json`: `name: "@moneydiary/api-client"`, `private: true`,
      `version: "0.1.0"`, `type: "module"`, `types: "./src/index.ts"`,
      `exports: { ".": { "types": "./src/index.ts" } }` (no `default`/`import` condition — deliberate, see
      design "missing runtime entry is a feature"), `scripts.generate`
      (`openapi-typescript ../../apps/api/openapi.json --immutable --output ./src/types.gen.ts`, or without
      `--immutable` per 1.2's contingency), `scripts.typecheck` (`tsc --noEmit`),
      `devDependencies: { openapi-typescript: "<exact pin from 1.1>", typescript }`.
- [ ] 2.2 Create `packages/api-client/tsconfig.json` per design's standalone config: `strict: true`,
      `noEmit: true`, `target: "es2023"`, `module: "esnext"`, `moduleResolution: "bundler"`,
      `skipLibCheck: true`, `types: []`, `include: ["src"]`.
- [ ] 2.3 Add root convenience scripts to the repo-root `package.json`: `"contract:sync": "pnpm api
      openapi:emit && pnpm api-client generate"` and `"api-client": "pnpm --filter @moneydiary/api-client"`.
- [ ] 2.4 Add `packages/api-client/src/types.gen.ts` to root `.prettierignore` (same rationale/entry style as
      the existing `apps/api/openapi.json` line — determinism, prevents drift-gate false positives). Do NOT
      add a `packages/**` route to `.lintstagedrc.json`.
- [ ] 2.5 Run `pnpm install` at the repo root (adds `openapi-typescript`/`typescript` devDeps, links the new
      workspace member). Confirm `pnpm-lock.yaml` updates.
- [ ] 2.6 Run `pnpm api-client generate`. Confirm `packages/api-client/src/types.gen.ts` is created,
      committable, `readonly` properties present (or absent per 1.2 contingency). Do not hand-edit.

## Phase 3: Slice 1 — Alias layer + money-contract assertion (AC-01, AC-04) (PR 1)

- [ ] 3.1 Create `packages/api-client/src/index.ts`: `export type { paths, components, operations } from
      './types.gen'`, plus one type alias per line for the 15 DTOs/sub-shapes listed in design's adoption
      mapping tables (`ResumenMesDto`, `BucketResumenDto`, `ResumenAnualDto`, `DetalleBucketDto`,
      `DetalleBucketTransaccionDto`, `MeDto`, `ReclasificarCategoriaDto`, `IngestaResponseDto`,
      `TransaccionResponseDto`, `IngestaListItemDto`, `ApiVersionDto`, `AuthCapabilitiesDto`,
      `PreviewIngestaDto`, `PreviewTransaccionDto`, `LoginResponseDto` for mobile) — each a one-line indexed
      access into `components['schemas'][...]`, carrying forward the existing "why" doc comments from
      `apps/web/src/api/types.ts` (money-as-string discipline, `esDemo`/`email` invariant,
      `totalFilasDatos` pre-dedupe note, US-004 widening history). No re-declared fields, no widening beyond
      what the wire schema states.
- [ ] 3.2 Create `packages/api-client/src/money-contract.assert.ts` with the compile-time `Assert<Eq<A,B>>`
      pin for `ResumenMesDto['totalIngreso']`, `BucketResumenDto['total']`,
      `DetalleBucketTransaccionDto['cargo']`, `DetalleBucketTransaccionDto['abono']` — each asserted `string`
      (AC-04). Export all four (not local consts) so `noUnusedLocals` does not flag them.
- [ ] 3.3 Run `pnpm api-client typecheck`. Green confirms both the alias layer resolves and the money
      assertions compile (this is AC-04's "type-level test" scenario — no separate test runner needed).
- [ ] 3.4 [verify] Manually inspect `src/index.ts`: confirm zero runtime exports (functions, classes, values)
      per AC-01's "package contains no runtime code" scenario.

## Phase 4: Slice 1 — CI wiring (AC-03, AC-06) (PR 1)

- [ ] 4.1 In `.github/workflows/ci.yml`'s `changes` job: add `packages: ['packages/**']` to `filters:` and
      expose it as a job output (mirror the existing `api`/`web`/`mobile`/`shared` outputs at lines 33-37).
- [ ] 4.2 Add a new `api-client` job: `needs: changes`, `if:
      ${{ needs.changes.outputs.api == 'true' || needs.changes.outputs.packages == 'true' ||
      needs.changes.outputs.shared == 'true' }}`. Steps: checkout, pnpm/setup-node,
      `pnpm install --frozen-lockfile`, `pnpm api-client generate`, then
      `git diff --exit-code -- packages/api-client/src/types.gen.ts` (fail with the
      `::error::types.gen.ts is out of date...` message on non-zero diff — AC-03), then
      `pnpm api-client typecheck`.
- [ ] 4.3 Add `|| needs.changes.outputs.packages == 'true'` to the `web` job's existing `if:` condition
      (AC-06).
- [ ] 4.4 Add `|| needs.changes.outputs.packages == 'true'` to the `mobile` job's existing `if:` condition
      (AC-06).
- [ ] 4.5 Add `api-client` to `ci-success`'s `needs:` list.
- [ ] 4.6 [verify] Push the branch and confirm in GitHub Actions: a commit touching only
      `packages/api-client/**` runs `web` and `mobile` jobs (not skipped) plus the new `api-client` job
      (AC-06 scenario).

## Phase 5: Slice 1 — ADR-012 note + verification (PR 1)

- [ ] 5.1 Append the dated note to `docs/adr/ADR-012-packages-api-client.md` per design's draft prose
      (Spanish, matching the ADR's existing style, appended next to the 2026-08-02 note): types-only first
      slice, no `client.ts`/`auth.ts`/`errors.ts`, no `tsup`, `types.gen.ts` committed (correcting the
      original `.gitignore` prescription), source stays `apps/api/openapi.json`, `tsup`/`.gitignore` deferred
      to the runtime-client slice with mobile as first adopter.
- [ ] 5.2 [verify] Run `pnpm api-client generate` twice with no changes in between; confirm byte-identical
      `types.gen.ts` (AC-03 "no-op diff" scenario / design's determinism guarantee).
- [ ] 5.3 [verify] Run `pnpm install --frozen-lockfile` from clean, `pnpm api-client typecheck`, `pnpm api
      test`, `pnpm api exec tsc --noEmit` — all green. Confirm no `apps/web`/`apps/mobile` file was touched
      in this slice (PR 1 is inert — adds a package nothing imports yet).
- [ ] 5.4 Open PR 1 targeting `main` (stacked-to-main). Include the dependency diagram (📍 PR 1, PR 2/PR 3
      pending), chain context, and note `packages/api-client/src/types.gen.ts` is a regenerated build
      artifact reviewed by re-running `pnpm api-client generate` + clean `git diff`, not by reading.

## Phase 6: Slice 2 — Web dependency + fixture baseline (WAC-01/WAC-02) (PR 2)

- [ ] 6.1 Add `"@moneydiary/api-client": "workspace:*"` to `apps/web/package.json` dependencies. Run `pnpm
      install`.
- [ ] 6.2 [TEST] Run the current web suite (`pnpm web test`) and typecheck (`pnpm web typecheck`) before any
      `types.ts` edit — record as the pre-migration green baseline that WAC-01/WAC-02's "passes unmodified"
      scenarios are measured against.

## Phase 7: Slice 2 — `types.ts` alias barrel rewrite (WAC-01) (PR 2)

- [ ] 7.1 Rewrite `apps/web/src/api/types.ts` (238 lines, 14 interfaces + 1 type alias) into an alias/re-export
      barrel: for each of the 13 direct-alias DTOs in design's adoption table (`ResumenMesDto`,
      `ResumenAnualDto`, `DetalleBucketTransaccionDto`, `DetalleBucketDto`, `MeDto`,
      `ReclasificarCategoriaDto`, `TransaccionResponseDto`, `IngestaResponseDto`, `IngestaListItemDto`,
      `ApiVersionDto`, `PreviewTransaccionDto`, `PreviewIngestaDto`), replace the hand-written `interface`
      body with `export type X = <import from @moneydiary/api-client>` (or a local re-export from an
      `import type { ... } from '@moneydiary/api-client'` block), preserving each block's existing "why"
      doc comment verbatim.
- [ ] 7.2 `BucketResumenDto`: alias to `ResumenMesDto['buckets'][number]` from the package (accept the
      `estadoSemaforo` narrowing `string | null` → `'verde'|'amarillo'|'rojo'|null` per design's policy —
      do not widen the alias to compensate).
- [ ] 7.3 `AuthCapabilitiesDto`: alias to the package's `AuthCapabilitiesResponse` (accept the wider type —
      gains required `googleLoginMobileEnabled`; do not narrow the alias). Leave `esAuthCapabilitiesDto`'s
      runtime guard checking only `googleLoginEnabled` (WAC-02 — guard behavior unchanged).
- [ ] 7.4 `EstadoIngestaResumen` stays hand-written exactly as-is (not on the wire — a UI-level projection,
      per design). Do not attempt to alias or generate it.
- [ ] 7.5 [verify] Confirm zero hand-written `interface` bodies remain in `apps/web/src/api/types.ts` for the
      13 covered DTOs (WAC-01 "no hand-written interface remains" scenario) — grep for `interface ` in the
      file.

## Phase 8: Slice 2 — Fixture + fallout fixes (WAC-01/WAC-02) (PR 2)

- [ ] 8.1 [TEST → fix] Run `pnpm web typecheck`. Fix each compile error surfaced by the narrowing/widening
      changes (enum literal unions, the new required `googleLoginMobileEnabled` field) strictly at the
      call/fixture site — never by editing the alias layer in `types.ts` or in the package.
- [ ] 8.2 Update `capabilities.test.tsx` fixtures to include `googleLoginMobileEnabled` (per design's
      adoption table note).
- [ ] 8.3 [TEST → fix] Run `pnpm web test`. Fix any remaining fixture typed as bare `string` where the
      generated type now demands the narrower `estadoSemaforo`/`estadoGlobal` literal union — fix the
      fixture's literal, not the guard or the alias.
- [ ] 8.4 [verify] Confirm the WAC-02 guard-behavior scenario: run the existing test asserting
      `esMontoStringValido` rejects a non-numeric string and `esResumenMesDto` rejects a payload missing
      `totalIngreso`, with zero edits to that test file itself.
- [ ] 8.5 [verify] `git diff` inspection: confirm no edit touches `apps/web/src/api/client.ts` guard bodies,
      `ApiError` type/tag set, `apps/web/src/api/auth.ts`, any TanStack Query hook, or any component (design
      "What explicitly does NOT change").

## Phase 9: Slice 2 — Verification + PR (PR 2)

- [ ] 9.1 [verify] Run `pnpm web typecheck` — zero errors attributable to the migration (WAC-01 scenario).
- [ ] 9.2 [verify] Run `pnpm web test` — full suite green.
- [ ] 9.3 [verify] Run `pnpm api-client typecheck` (unaffected, sanity check package still compiles alone).
- [ ] 9.4 Confirm hand-written line delta is within the ~340-line estimate (`git diff --stat`); if it
      materially exceeds 400, stop and re-consult delivery strategy (`ask-on-risk`) before opening the PR.
- [ ] 9.5 Open PR 2 targeting `main` (stacked-to-main, depends on PR 1 merged). Include dependency diagram
      (PR 1 ✅, 📍 PR 2, PR 3 pending), chain context, rollback scope (revert restores the 14 hand-written
      interfaces, zero consumer-file impact since imports are unchanged).

## Phase 10: Slice 3 — Spike gate (must run before any mobile code change) (PR 3)

- [ ] 10.1 Add `"@moneydiary/api-client": "workspace:*"` to `apps/mobile/package.json` dependencies (needed
      so the spike imports the real merged package, per design's re-ordering rationale). Run `pnpm install`.
- [ ] 10.2 [spike 1/3 — TS resolution] Write a scratch file doing
      `import type { ResumenMesDto } from '@moneydiary/api-client'` and building a fixture value typed
      against it. Run `pnpm --filter @moneydiary/mobile exec tsc --noEmit`. Must pass before proceeding.
- [ ] 10.3 [spike 2/3 — jest-expo transform] Add the same import to a throwaway `.spec.ts` file. Run `pnpm
      --filter @moneydiary/mobile test`. Must pass before proceeding.
- [ ] 10.4 [spike 3/3 — Metro bundle, the real unknown] Run `npx expo export --platform android` inside
      `apps/mobile` with the scratch import present. This is the go/no-go checkpoint.
- [ ] 10.5 **Go/no-go decision:**
      - If 10.4 is green: delete the scratch files from 10.2/10.3, proceed to Phase 11.
      - If 10.4 fails: try exactly one bounded remedy — `metro.config.js` monorepo defaults
        (`watchFolders` = workspace root, `nodeModulesPaths`, `unstable_enableSymlinks`), time-boxed. Re-run
        10.4 once.
      - If it still fails: **STOP.** Do not proceed to Phase 11+. Revert the `apps/mobile/package.json` dep
        change from 10.1. Ship web-only (PR 1 + PR 2 already merged and stand alone). Register mobile
        adoption as debt with trigger "Metro/Expo gains verified pnpm-symlink support (SDK bump)" — record
        this in the ADR-012 note (amend PR 1's note, small follow-up) or a new dated note. Do not open PR 3.
        Report this outcome explicitly at the end of `sdd-apply`.

## Phase 11: Slice 3 — `verbatimModuleSyntax` + aliasing (MAC-01/MAC-02) (PR 3)

- [ ] 11.1 Add `verbatimModuleSyntax: true` to `apps/mobile/tsconfig.json`'s `compilerOptions`.
- [ ] 11.2 [TEST → fix] Run `pnpm --filter @moneydiary/mobile exec tsc --noEmit`. Fix any pre-existing
      value-position type import surfaced by the flag (expected: few, mobile already uses `import type`
      broadly per design). **Contingency if it cascades:** revert 11.1, instead add
      `@typescript-eslint/consistent-type-imports` to mobile's ESLint config; record the flag as debt with
      trigger "next time mobile's tsconfig is touched" (do not spend further budget chasing the cascade).
- [ ] 11.3 In `apps/mobile/src/domain/resumen.types.ts`: alias `BucketResumenDto`/`ResumenMesDto` to the
      package's `ResumenMesResponse[...]` (same enum-narrowing acceptance as web 7.2); keep file location
      and existing comments (do not rename/move — pre-existing `domain/` naming wart is out of scope, per
      design).
- [ ] 11.4 In `apps/mobile/src/domain/resumen.types.ts`: alias `MeDto` to the package's `AuthMeResponse`
      (adopt the full type — gains required `esDemo`, `email` widens to `string | null`). Do not "fix"
      `esMeDto`'s existing `email`-must-be-`string` guard behavior for demo accounts — that is pre-existing
      runtime behavior, unchanged by this slice (record as already-known debt per design, no new note
      needed beyond this task's own trace).
- [ ] 11.5 In `apps/mobile/src/api/client.ts`: alias `LoginResponseDto` to `AuthLoginResponse` and
      `AuthCapabilitiesDto` to `AuthCapabilitiesResponse` (direct aliases, no mismatch — mobile already has
      both flags).
- [ ] 11.6 In `apps/mobile/src/api/post-ingesta.ts`: alias `TransaccionResponseDto`/`IngestaResponseDto` to
      `IngestaUploadResponse[...]` (adopt the gained required `duplicadosOmitidos`; mobile never renders it).
- [ ] 11.7 In `apps/mobile/src/api/preview-ingesta.ts`: alias `PreviewTransaccionDto`/`PreviewIngestaDto` to
      `PreviewIngestaResponse[...]` (direct aliases, no mismatch).
- [ ] 11.8 [verify] Confirm every `import type { ... } from '@moneydiary/api-client'` in the four touched
      mobile files uses the `import type` form exactly (MAC-02 — required by `verbatimModuleSyntax`).

## Phase 12: Slice 3 — Fixture fallout + verification (MAC-01/MAC-03) (PR 3)

- [ ] 12.1 [TEST → fix] Run `pnpm --filter @moneydiary/mobile test`. Update fixtures in `client.spec.ts`,
      `session-context.spec.tsx`, `test/auth-navigation.integration.spec.tsx` to add `esDemo: false` where
      `MeDto`-shaped fixtures are built.
- [ ] 12.2 [TEST → fix] Update fixtures in `post-ingesta.spec.ts` to add `duplicadosOmitidos` where
      `IngestaResponseDto`-shaped fixtures are built.
- [ ] 12.3 [verify] Confirm the MAC-03 guard-behavior scenario: run the existing test asserting
      `esResumenMesDto` rejects a payload where `totalIngreso` is not a string, with zero edits to that test
      file itself.
- [ ] 12.4 [verify] `git diff` inspection: confirm no edit touches mobile's `ApiError` type/tag set
      (`unauthorized | network | parse | http`), `copiaPorApiError`, `construirHeadersSesion`, `conTimeout`
      / `NETWORK_LEG_TIMEOUT_MS`, `session-store.ts`, `session-context.tsx`, or `use-google-id-token.ts`
      (design "What explicitly does NOT change" / MAC-03).
- [ ] 12.5 [verify] Run `pnpm --filter @moneydiary/mobile exec tsc --noEmit` and `pnpm --filter
      @moneydiary/mobile test` — both fully green (MAC-01 "typecheck and test suite pass" scenario).
- [ ] 12.6 Confirm hand-written line delta is within the ~140-line estimate.
- [ ] 12.7 Open PR 3 targeting `main` (stacked-to-main, depends on PR 1 merged; independent of PR 2).
      Include dependency diagram (PR 1 ✅, PR 2 ✅ or pending — note either is fine since 2⊥3, 📍 PR 3),
      the spike results (Phase 10) in the PR description, chain context, and rollback scope (revert restores
      the 5 hand-written mobile files, zero session/fetch-logic impact).

## Requirement Coverage

| Requirement | Task IDs |
|---|---|
| AC-01 (identity + workspace membership + no runtime code) | 1.3, 2.1, 2.5, 3.1, 3.4 |
| AC-02 (generated from committed contract) | 2.1, 2.6 |
| AC-03 (deterministic, committed, CI drift gate) | 2.4, 4.1, 4.2, 5.2, 5.3 |
| AC-04 (money fields string-typed, compile-time assertion) | 3.2, 3.3 |
| AC-05 (build-less package surface) | 2.1, 2.2, 5.3 |
| AC-06 (packages-only change triggers web/mobile CI) | 4.1, 4.3, 4.4, 4.6 |
| WAC-01 (web DTOs derived, not hand-written) | 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 9.1 |
| WAC-02 (web guards/errors unchanged) | 7.3, 8.4, 8.5, 9.2 |
| MAC-01 (mobile DTOs derived, not hand-written) | 11.3, 11.4, 11.5, 11.6, 11.7, 12.1, 12.2, 12.5 |
| MAC-02 (verbatimModuleSyntax erasure guarantee) | 11.1, 11.2, 11.8, 10.2, 10.3, 10.4 |
| MAC-03 (mobile guards/errors/conTimeout unchanged) | 12.3, 12.4, 12.5 |

## Tracked Debt (registered here, not implemented)

| Debt | Trigger |
|---|---|
| Runtime client (`client.ts`, `TokenStorage`, `errors.ts`) | Next ADR-012 slice; mobile is the natural first adopter |
| Mobile `esMeDto` rejects demo accounts (`email: null`) as `{tag:'parse'}` | Pre-existing, unaffected by this change; no new trigger — already known |
| Mobile adoption entirely (if Phase 10 spike fails) | "Metro/Expo gains verified pnpm-symlink support (SDK bump)" |
| `verbatimModuleSyntax` reverted to ESLint-only enforcement (if 11.2 cascades) | "next time mobile's tsconfig is touched" |
