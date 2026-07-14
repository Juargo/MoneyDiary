# Tasks — sprint3-mvp-mobile

Implementation checklist for the read-only Expo MVP + Render deploy. Confirms the design's **3 chained PRs** (`delivery_strategy: ask-on-risk`). Each task maps to a spec requirement ID (`AC-0x` from `api-access-control`, `MOB-0x` from `mobile-resumen-screen`). `strict_tdd: true` — mobile domain/screen tasks are ordered test-first.

## Quick path

1. PR 1 — Track A: deploy + curl verification + docstring fix. No app code.
2. PR 2 — Track B scaffold: workspace inclusion + pinned Expo deps + boot placeholder.
3. PR 3 — Track B feature: HTTP client + CLP formatter + screen states + tests + Maestro cleanup.

---

## PR 1 — Track A: Deploy + access verification

**Scope:** Render deploy ops, curl verification matrix, `resumen.controller.ts` docstring fix, accepted-risk encryption doc. No app code, no workspace change.
**Depends on:** nothing (parallelizable with PR 2, sequenced first for clean history).
**Verification:** 3-row curl matrix passes against the live Render URL; docstring no longer claims "intentionally unauthenticated".
**Rollback:** revert the 1-line docstring commit; Render service can be suspended/deleted independently — deploy is idempotent from `render.yaml`.

- [ ] **T1.1 — Fix stale docstring in `resumen.controller.ts`** (AC-04)
  Correct the comment at `apps/api/src/infrastructure/http/resumen.controller.ts:~28` — remove the "intentionally unauthenticated for MVP mono-user phase" claim; state the route is protected by the global `ApiKeyGuard` (`x-api-key`). Comment-only, no behavior change. No test needed (doc review is the verification per spec's test-type mapping).

- [ ] **T1.2 — Deploy `apps/api` to Render via Blueprint** (AC-01, AC-02, AC-03, AC-05)
  Connect `Juargo/MoneyDiary` in Render → New → Blueprint (reads existing `render.yaml`). Generate prod `API_KEY` (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, distinct from local). Load the 3 `sync:false` secrets in the dashboard: `DATABASE_URL` (Supabase pooler, transaction-mode/IPv4), `DIRECT_URL` (pooler session-mode), `API_KEY`. Trigger deploy. No repo changes — ops task.

- [ ] **T1.3 — Run the curl verification matrix against the live Render URL** (AC-01, AC-02, AC-03, AC-05)
  Execute the 3 checks from `docs/mobile-launch-runbook.md` against the deployed URL:
  1. `curl https://<svc>.onrender.com/` → expect 200 `"Hello World!"`.
  2. `curl -i https://<svc>.onrender.com/api/resumen` → expect 401 (no key).
  3. `curl -H "x-api-key: <API_KEY>" https://<svc>.onrender.com/api/resumen` → expect 200 + JSON matching `ResumenMesDto`.
  Record the three results as PR 1's acceptance evidence (paste output in the PR description). This is the PR 1 exit gate and the mobile client's contract precondition.

- [ ] **T1.4 — Record the A.5 accepted-risk encryption entry**
  Add/update an accepted-risk doc entry (in `docs/mobile-launch-runbook.md` or an ADR addendum) with the three mandatory fields: rationale (`/api/resumen` returns zero PII — bucket enums, BigInt totals, basis-point percentages, semáforo states; this release adds API exposure, not new DB exposure), sign-off (who + date), and the verbatim hard trigger: *"Task 11.6 (real column encryption) MUST be resolved before any endpoint returning transaction descriptions / titular name / RUT is exposed beyond localhost."* No code change — `NoOpCryptoService` stays as-is.

**PR 1 review budget:** docstring (~5 lines) + accepted-risk doc entry (~15-20 lines). No app/infra code diff — ops steps (T1.2, T1.3) happen outside the repo.

---

## PR 2 — Track B: Expo scaffold (no feature logic)

**Scope:** workspace inclusion, pinned Expo SDK 57 deps (no `"*"` survives), boot-only `app/_layout.tsx` + `app/index.tsx` (placeholder render), NativeWind wiring, `app.json`, `.env.example`, env plumbing.
**Depends on:** nothing functionally (parallelizable with PR 1), sequenced after it in the chain for clean history.
**Verification:** `pnpm install --frozen-lockfile` green at repo root; no `"*"` in `apps/mobile/package.json`; `pnpm --filter @moneydiary/mobile test` runs the seed tests; app boots and renders a placeholder on a simulator.
**Rollback:** restore `!apps/mobile` in `pnpm-workspace.yaml` — mobile falls back out of the workspace; the whole `apps/mobile` diff is isolated.

- [ ] **T2.1 — Remove `!apps/mobile` from `pnpm-workspace.yaml`**
  Delete the exclusion line so `apps/mobile` joins the pnpm workspace. Run `pnpm install --frozen-lockfile` at the repo root; resolve any `allowBuilds` additions needed for native build scripts via `pnpm approve-builds` and record them in `pnpm-workspace.yaml` (same discipline as `@nestjs/core`/`prisma`). Run `pnpm audit` and confirm no new HIGH advisories violate `.npmrc` (`audit-level=high`); if advisories surface, record them as accepted or resolve per `.npmrc` policy. Confirm `apps/api`'s `@types/node` pin (`^22`) is not dragged to `^24` by the RN tree.

- [ ] **T2.2 — Resolve all loose version pins via `npx expo install`** (hard acceptance criterion for this PR)
  Run `npx expo install react-native expo-router` inside `apps/mobile` to replace the `"*"` pins with SDK-57-correct exact/range versions. Run `npx expo install nativewind tailwindcss react-native-reanimated react-native-safe-area-context` to add the NativeWind v4 dependency set. Confirm `babel-preset-expo`'s version is aligned by `expo install` (comes bundled with `expo`). **Acceptance check: `rg '"\*"' apps/mobile/package.json` MUST return no matches before this task is considered done.** If Context7 is reachable at this point, cross-check the resolved NativeWind v4 version against current docs; otherwise trust `expo install`'s SDK-authoritative resolution.

- [ ] **T2.3 — Pick and reconcile the canonical bundle id (decision required)**
  **User decision needed:** the runbook uses `com.jorgeretamal.moneydiary`, the Maestro `resumen-semaforo.yaml` `appId` uses `cl.moneydiary.app`, and no `app.json` exists yet. Pick ONE canonical bundle id before writing `app.json`. Flag this explicitly to the user before PR 2 is opened — it also affects future store registration (Track C, out of scope here) so getting it right now avoids a rename later. Once decided, use it consistently in T2.4 and in PR 3's Maestro rewrite (T3.10).

- [ ] **T2.4 — Add `app.json` (static config)**
  Create `apps/mobile/app.json` with `name`, `slug`, `scheme`, iOS `bundleIdentifier` and Android `package` set to the id chosen in T2.3, `plugins: ["expo-router"]`, `newArchEnabled: true` (SDK 57 default). Static file, not `app.config.ts` (no computed config needed — D3).

- [ ] **T2.5 — Add `app/_layout.tsx` and `app/index.tsx` (placeholder, no feature logic)**
  `app/_layout.tsx`: root Stack wrapper required by Expo Router, wraps in `SafeAreaProvider`, imports `./global.css`, `headerShown: false`. `app/index.tsx`: placeholder render only (e.g. a static "MoneyDiary" text) — the 4-state switch and data fetching are PR 3 scope. This task only proves the app boots.

- [ ] **T2.6 — Wire NativeWind v4 (4 touch points)**
  1. `babel.config.js` → add `"nativewind/babel"` to presets alongside `babel-preset-expo`.
  2. `metro.config.js` → `withNativeWind(config, { input: './global.css' })`.
  3. `tailwind.config.js` → `content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}']`, `presets: [require('nativewind/preset')]`.
  4. `global.css` → `@tailwind base; @tailwind components; @tailwind utilities;`, imported once in `app/_layout.tsx` (done in T2.5).

- [ ] **T2.7 — Add env plumbing (`.env.example` + `src/api/config.ts` stub)**
  Commit `apps/mobile/.env.example` documenting `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_API_KEY` (real `.env` stays git-ignored — confirm `.gitignore` already covers it). A minimal `src/api/config.ts` reading both vars can be stubbed here since env plumbing has no feature logic risk; full `client.ts` usage lands in PR 3.

- [ ] **T2.8 — Resolve jest-expo transform friction under the newly-hoisted install (empirical)**
  Run `pnpm --filter @moneydiary/mobile test` after T2.1–T2.2. If `transformIgnorePatterns` in `jest.config.js` needs extending for the pnpm no-hoisted RN/Expo ESM tree, extend it and document the pattern added. Confirm the seed tests (`Saludo.spec.tsx`, `formatear-monto.spec.ts` — old signature, will be rewritten in PR 3) still pass under the real installed tree.

- [ ] **T2.9 — Confirm CI stays green with mobile in the workspace (no CI logic change)**
  Verify `.github/workflows/ci.yml` is unaffected in behavior: it does not run `jest-expo` (D5 — mobile jest stays local-only this sprint), but `pnpm install --frozen-lockfile` in CI now resolves the mobile tree and will fail if `apps/mobile/package.json`/lockfile is broken. Confirm this passes as the minimum safety net. Add a one-line comment/note in the PR description recording D5 and that wiring mobile jest into CI is tracked follow-up debt (no code change to the workflow file itself).

**PR 2 review budget estimate:** `pnpm-workspace.yaml` (1 line) + `package.json` version bumps (~10-15 lines) + `pnpm-lock.yaml` (large, mechanical — auto-generated, does not count against reviewer attention the same way) + `app.json` (~15 lines) + `app/_layout.tsx` + `app/index.tsx` placeholder (~40 lines) + babel/metro/tailwind/global.css (~30 lines) + `.env.example` + `config.ts` stub (~15 lines) ≈ **110-130 hand-written lines** (excluding lockfile).

---

## PR 3 — Track B: Feature (screen, client, formatter, tests, Maestro)

**Scope:** CLP formatter rewrite, view-model mapper, HTTP client, presentational components, 4-state screen wiring, Maestro flow rewrite + `login.yaml` deletion.
**Depends on:** PR 2 (stacks on the scaffold).
**Verification:** domain + RNTL suites green locally; Maestro anchors present in data state; formatter passes the > 2^53 case; manual Maestro run on a device (device-gated, not CI).
**Rollback:** revert to PR 2's placeholder screen; deploy (PR 1) and scaffold (PR 2) remain intact.

### Domain layer (test-first — pure, jest-expo, no RN import)

- [ ] **T3.1 — Rewrite `formatear-monto.spec.ts` for the string signature, RED first** (MOB-05)
  Replace the seeded `number`-signature spec with the string-signature contract. Cover all 5 scenarios from spec: `"1234567"` → `"$1.234.567"`; `"9007199254740993"` (> 2^53) → every digit preserved exactly; `"0"` → `"$0"`; `"-5000"` → `"-$5.000"`; and a throw case for non-integer input (`"10.5"`, `"abc"`, `""`). This is expected TDD churn from the design (D-flagged), not a regression — confirm the old `number`-based tests are fully replaced, not left alongside.

- [ ] **T3.2 — Reimplement `formatearMontoCLP(montoStr: string): string`, GREEN** (MOB-05)
  `BigInt(montoStr)` (throws on non-integer/decimal/garbage), derive sign, take absolute value's digit string via `.toString()`, group thousands with `.` via regex (`\B(?=(\d{3})+(?!\d))`), prefix `$`. Never `parseFloat`/`Number()` on the amount (ADR-015). Run T3.1 to green.

- [ ] **T3.3 — Write `resumen-view-model.spec.ts`, RED first** (MOB-06, spec scenarios for null vs 0% and `sinIngreso`)
  Cover: `porcentajeBp: null` maps to a distinct non-percentage label (not `"0%"`); `porcentajeBp: 0` maps to `"0%"`; `sinIngreso: true` maps to an empty-state flag distinct from a `$0` data render; `estadoSemaforo` (`'verde'|'amarillo'|'rojo'|null`) maps to a per-bucket visual indicator value; `estadoGlobal` maps through to the global semáforo value.

- [ ] **T3.4 — Implement `resumen-view-model.ts` (`ResumenMesDto -> ResumenViewModel`), GREEN**
  Pure mapping function. Formats CLP via T3.2's formatter, resolves percentage-or-null labels, resolves per-bucket + global semáforo colors/labels. No RN import, no fetch. Run T3.3 to green. Also define `resumen.types.ts` (hand-written mirror of the backend DTO: `periodo, totalIngreso(string), sinIngreso(bool), buckets[{bucket,total(string),porcentajeBp(number|null),estadoSemaforo(string|null)}], targets{Necesidades,Deseos,Ahorro}, estadoGlobal(string|null)`).

### API boundary (test-first)

- [ ] **T3.5 — Write `client.spec.ts` for the 4 mapped outcomes, RED first** (MOB-01, MOB-02)
  Cover: request includes `GET {base}/api/resumen?periodo=YYYY-MM` with `x-api-key` header equal to `EXPO_PUBLIC_API_KEY` (MOB-01); `fetch` throws → `{tag:'network'}`; `res.status===401` → `{tag:'unauthorized'}`; other `!res.ok` → `{tag:'http', status}`; `res.ok` but body fails a shape guard → `{tag:'parse'}`; happy path → `{ok:true, value}`. Mock `fetch` and `EXPO_PUBLIC_*` env vars in the test.

- [ ] **T3.6 — Implement `src/api/client.ts` (`fetchResumen`) and finalize `src/api/config.ts`, GREEN** (MOB-01, MOB-02)
  `fetchResumen(periodo?: string): Promise<ApiResult<ResumenMesDto>>` per the mapping rules in design B.3. `config.ts` reads `EXPO_PUBLIC_API_BASE_URL`/`EXPO_PUBLIC_API_KEY` once; missing base URL → `{tag:'network'}` (fail-visible, not a crash — no fetch to `undefined/...`). Run T3.5 to green.

### Presentational components + screen (test-first, RNTL)

- [ ] **T3.7 — Write RNTL specs for `SemaforoBadge`, `BucketRow`, and the 3 state components, RED first** (MOB-03, MOB-06)
  `SemaforoBadge.spec.tsx`: renders the right color/label per `estadoSemaforo` value including `null`. `BucketRow.spec.tsx`: renders CLP amount + percentage-or-null per MOB-06 (null !== "0%"). `states/{Loading,Error,Empty}.spec.tsx`: each renders its distinct copy; `Error` differs subtly by `ApiError` tag. Use RNTL built-in matchers via `@testing-library/react-native/extend-expect` — do NOT add `@testing-library/jest-native` (deprecated, ADR-017).

- [ ] **T3.8 — Implement `SemaforoBadge.tsx`, `BucketRow.tsx`, `states/{Loading,Error,Empty}.tsx`, GREEN** (MOB-03, MOB-06)
  Props-in/JSX-out, no fetch, no env. Run T3.7 to green.

- [ ] **T3.9 — Write `ResumenScreen.spec.tsx` + `app/index.spec.tsx` for the 4-way state switch, RED first** (MOB-03, MOB-04)
  Assert: loading state shows spinner, no bucket/error copy; empty state (`sinIngreso:true`) shows distinct empty copy, not `$0`; error state shows retry affordance and copy varies by tag; data state renders `totalIngreso` as CLP, all 4 buckets (Necesidades, Deseos, Ahorro, SinCategoria) with total/percentage/semáforo, and the Maestro anchors: literal text `"Distribución 50/30/20"`, bucket labels `"Necesidades"/"Deseos"/"Ahorro"`, and a view with `testID="semaforo-global"`.

- [ ] **T3.10 — Implement `ResumenScreen.tsx` composition + wire the 4-state switch in `app/index.tsx`, GREEN** (MOB-03, MOB-04)
  `index.tsx` stays thin: calls `fetchResumen`, owns the `{loading|error|empty|data}` switch via `useEffect`/`useState` (no TanStack Query — D2), renders the right presentational component. No money math in the screen. Run T3.9 to green.

### Maestro cleanup (device-gated, not CI — manual verification)

- [ ] **T3.11 — Delete `apps/mobile/.maestro/login.yaml`** (MOB-07)
  Remove the file entirely — asserts a login/nav flow that doesn't exist in single-screen scope.

- [ ] **T3.12 — Rewrite `resumen-semaforo.yaml` to be self-contained** (MOB-04, MOB-07)
  Remove `- runFlow: login.yaml` and `- tapOn: "Resumen"` (both dead — no login, no nav, one screen renders on launch). Replace with `launchApp` → `assertVisible` for each Maestro anchor: `"Distribución 50/30/20"`, `"Necesidades"`, `"Deseos"`, `"Ahorro"`, and the `semaforo-global` testID. Confirm the `appId` in this file matches the bundle id chosen in T2.3. Leave `ver-movimientos.yaml` untouched (unrelated, out of scope — do not let this change depend on it).

- [ ] **T3.13 — Manual Maestro run on a device/emulator (not CI, exit-gate for PR 3)**
  Build a dev client (`npx expo run:ios` or `run:android`) pointed at the deployed Render API (PR 1) with real `EXPO_PUBLIC_*` env values, run `maestro test .maestro/resumen-semaforo.yaml`, confirm all assertions pass. Record the result as PR 3's manual acceptance evidence.

**PR 3 review budget estimate:** formatter rewrite + spec (~60 lines) + view-model + types + spec (~90 lines) + client + config + spec (~90 lines) + 5 components + specs (~150 lines) + screen wiring + spec (~80 lines) + Maestro yaml rewrite + deletion (~20 lines net) ≈ **~490 lines**. This is the largest slice and the reason chaining is recommended (see forecast below).

---

## Review Workload Forecast

| Slice | Estimated changed lines | Chained PRs recommended | 400-line budget risk | Decision needed before apply |
|-------|--------------------------|--------------------------|------------------------|-------------------------------|
| PR 1 — Track A (deploy + curl + docstring) | ~20-30 (docstring + accepted-risk doc; ops steps are outside the repo diff) | — | Low | No |
| PR 2 — Track B scaffold | ~110-130 hand-written (excludes auto-generated `pnpm-lock.yaml`) | — | Low-Medium | **Yes — bundle id (T2.3)** must be confirmed by the user before `app.json` is written |
| PR 3 — Track B feature | ~490 (formatter, view-model, client, 5 components, screen, tests, Maestro) | — | **High** | No (scope is fixed by spec/design; no further split needed if kept to read-only single screen) |

- **Chained PRs recommended overall: Yes** — 3 PRs as designed. PR 3 alone exceeds the 400-line budget; splitting it further would break the test-first pairing (domain → API → components → screen) that keeps each work unit reviewable and revertible, so the recommendation is to accept PR 3 as one chained slice within the 3-PR chain rather than fragment it into 4+ PRs. If the orchestrator wants PR 3 under 400 lines strictly, the next natural split point is **domain+API (T3.1-T3.6) as PR 3a** and **components+screen+Maestro (T3.7-T3.13) as PR 3b**, stacked sequentially — flagging this as an option, not a requirement, since design.md's PR chain already treats Track B feature as one unit.
- **400-line budget risk: High** for PR 3 specifically; Low-Medium overall across the 3-PR chain.
- **Decision needed before apply: Yes** — two decisions: (1) the canonical bundle id (T2.3) must be picked before PR 2 writes `app.json`/reconciles Maestro `appId`; (2) confirm whether PR 3 stays as one ~490-line PR or splits into 3a/3b per the note above.

---

## Tracked debt (explicitly logged, not blocking this change)

- Wiring `jest-expo` into CI (D5) — deferred; mobile tests run locally only this sprint.
- Formal `@moneydiary/api-client` for mobile (ADR-011/012) — deferred; hand-written types/client for this one screen only.
- Per-install token exchange to replace the static `EXPO_PUBLIC_API_KEY` deterrent (D4) — deferred.
- Task 11.6 real column encryption — accepted risk with hard trigger (A.5), not resolved by this change.

## Next step

Run `sdd-apply` starting with PR 1 (Track A). Confirm the bundle id decision (T2.3) with the user before starting PR 2.
