# Design — sprint3-mvp-mobile: read-only Expo MVP + Render deploy

This design turns the proposal into concrete architecture: a **single-screen, read-only Expo app** (`apps/mobile`) that consumes `GET /api/resumen` and renders income + 50/30/20 + semáforo, plus the **Render deploy + access-verification plan** for `apps/api`. It stays strictly inside the proposal's scope: one screen, four states, a hand-written HTTP client, a BigInt-string-safe CLP formatter, and an accepted-risk encryption posture. No new crypto, no per-user auth, no formal `@moneydiary/api-client`.

## Quick path (the shape of the change)

1. **Track A (deploy)** — Render Blueprint from existing `render.yaml`, load 3 `sync:false` secrets, run the `curl` matrix (200 public / 401 no-key / 200 with-key), fix the stale docstring. No app code.
2. **Track B scaffold** — remove `!apps/mobile` from the workspace, pin the Expo SDK 57 stack, add `app/_layout.tsx` + `app/index.tsx`, NativeWind (babel/metro/tailwind/global.css), env plumbing (`EXPO_PUBLIC_*`). No feature logic.
3. **Track B feature** — `src/domain/` (formatter + view-model mapper, pure), `src/api/` (fetch client + typed Result), `src/components/` (presentational RN), the one screen with its 4 states, tests (jest-expo + RNTL), Maestro cleanup.

The three tracks map 1:1 to the three chained PRs (see PR-chain section).

---

## Track A — Deploy + access (ops, no app code)

### A.3 — Render Blueprint

Everything is already committed in `render.yaml` (Web Service `moneydiary-api`, `rootDir: .`, pnpm monorepo build, `healthCheckPath: /`, `NODE_VERSION 22.22.3`). The design here is the **operational sequence**, not new code:

| Step | Action |
|------|--------|
| 1 | Render → New → Blueprint → connect `Juargo/MoneyDiary` → it reads `render.yaml`. |
| 2 | Generate the prod API key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (distinct from local). |
| 3 | Load the **3 `sync:false` secrets** in the dashboard: `DATABASE_URL` (Supabase pooler, transaction-mode/IPv4 — runtime), `DIRECT_URL` (pooler session-mode — migrations), `API_KEY` (from step 2). |
| 4 | Deploy. Build: `pnpm install --frozen-lockfile` → `prisma generate` → `nest build`. Start: `start:prod`. |

Reference: `render.yaml` + `docs/mobile-launch-runbook.md` (Track A). No file changes required for A.3 beyond what is already on `main`.

### A.4 — curl verification matrix

| # | Request | Expected | Meaning |
|---|---------|----------|---------|
| 1 | `curl https://<svc>.onrender.com/` | **200** `"Hello World!"` | Health public (`AppController @Public`). |
| 2 | `curl -i https://<svc>.onrender.com/api/resumen` | **401** | `ApiKeyGuard` fail-closed, no key. |
| 3 | `curl -H "x-api-key: <API_KEY>" https://<svc>.onrender.com/api/resumen` | **200** + JSON | Contract reachable with key. |

This matrix is the **exit gate for PR 1** and the precondition for real-device testing. It doubles as the mobile client's contract (base URL + `x-api-key` header).

### A.5 — Encryption posture (documentation only)

No crypto code. Record an **accepted-risk entry** with three mandatory fields:

- **Rationale:** `/api/resumen` — the only mobile-consumed endpoint — returns bucket enum names, BigInt totals, basis-point percentages, semáforo enum states. **Zero PII.** This release adds API exposure (closed by A.1–A.4), not new DB exposure (Supabase in use since Sprint 2).
- **Sign-off:** who approved + date.
- **Hard trigger (verbatim):** *"Task 11.6 (real column encryption) MUST be resolved before any endpoint returning transaction descriptions / titular name / RUT is exposed beyond localhost."*

`NoOpCryptoService` stays as-is. The trigger is what keeps this debt time-bound rather than indefinite.

### Doc fix (stale docstring)

`apps/api/src/infrastructure/http/resumen.controller.ts` line ~28 says *"Intentionally unauthenticated for MVP mono-user phase"*. This is **false**: `ApiKeyGuard` is a global `APP_GUARD`, so the endpoint IS protected. Correct the comment to state it is protected by the global `ApiKeyGuard` (`x-api-key`). Comment-only, no behavior change. Ships in PR 1 so the deploy PR carries the corresponding doc truth.

---

## Track B — Expo app architecture

### B.1 — App structure (Expo Router + Clean-ish split)

The app has **two layers with a hard rule**: `src/domain/` is pure TypeScript (no React, no React Native, no fetch) and is where money + view-model logic lives; everything RN/IO-facing sits outside it. This mirrors the backend's `domain ← application ← infrastructure` discipline (ADR-005) at the modest scale this one screen warrants.

```
apps/mobile/
  app/
    _layout.tsx        # Root Stack wrapper (Expo Router requires it). Wraps in
                       #   SafeAreaProvider; imports ./global.css (NativeWind).
                       #   headerShown:false — no chrome for a single screen.
    index.tsx          # The one route. Thin: calls the query/fetch, owns the
                       #   {loading|error|empty|data} state switch, renders
                       #   presentational components. No money math here.
  src/
    domain/            # PURE. No RN import. Jest-testable in isolation.
      formatear-monto.ts        # BigInt-string-safe CLP formatter (rewritten)
      resumen-view-model.ts     # ResumenMesDto -> ResumenViewModel mapping
      resumen.types.ts          # DTO types (hand-written mirror of backend DTO)
    api/               # HTTP boundary. Only place that touches fetch + env.
      client.ts                 # fetch wrapper -> Result<ResumenMesDto, ApiError>
      config.ts                 # reads EXPO_PUBLIC_* once, validates presence
    components/        # Presentational RN. Props in, JSX out. No fetch, no env.
      SemaforoBadge.tsx
      BucketRow.tsx
      ResumenScreen.tsx         # composes the data-state layout
      states/{Loading,Error,Empty}.tsx
  app.json            # static config (see B.4)
  babel.config.js     # babel-preset-expo (+ nativewind/babel)
  metro.config.js     # withNativeWind(...)
  tailwind.config.js  # content globs + preset
  global.css          # @tailwind directives
  tsconfig.json       # extends expo/tsconfig.base (already present)
```

**Where the view-model mapping lives:** in `src/domain/resumen-view-model.ts`, NOT in the component and NOT in the API client. The client returns the raw typed DTO; the mapper turns it into a render-ready `ResumenViewModel` (formatted CLP strings, resolved percentage-or-null labels, per-bucket + global semáforo colors). This keeps the money/formatting/`sinIngreso` logic **pure and unit-testable without RNTL** — the single most important testability decision in this design.

**Rationale / tradeoff:** a one-screen app could collapse everything into `index.tsx`. It is deliberately NOT collapsed because the money and `sinIngreso`/`null%` rules (ADR-015) are exactly the logic that must be provable by fast domain unit tests, and the backend convention is domain-first. The cost is a few extra files; the benefit is that the risky logic never requires a rendered component to test.

### B.2 — Version pinning

**Verification note:** the Context7 MCP tools were **not reachable in this session** (the `resolve-library-id` / `query-docs` tools were not exposed), so I could not pull live version docs. The skeleton already pins a **coherent Expo SDK 57 set** (`expo ~57.0.4`, `react 19.2.0`, `react-test-renderer 19.2.0`, `jest-expo ^57.0.1`, `@testing-library/react-native ^14.0.1`, `jest ^30`). Design decision: **keep SDK 57 as the target and resolve the remaining loose pins (`"*"`) at scaffold time with `npx expo install`**, which is the authoritative way to get SDK-correct versions — it is more reliable than hardcoding a number from memory. `tasks`/`apply` must confirm each pin against `expo install` output (and Context7 if reachable then) before committing `package.json`.

| Package | Current (skeleton) | Design decision |
|---------|--------------------|-----------------|
| `expo` | `~57.0.4` | Keep. SDK 57 is the target. |
| `react` | `19.2.0` | Keep (SDK 57 pairs with React 19.2). |
| `react-native` | `"*"` ❌ | Pin via `npx expo install react-native` (SDK 57 → RN 0.82.x). Replace `"*"` with the exact resolved version. |
| `expo-router` | `"*"` ❌ | Pin via `npx expo install expo-router` (SDK-57-matched). |
| `nativewind` | (absent) | Add `nativewind` + `tailwindcss` + `react-native-reanimated` + `react-native-safe-area-context` via `npx expo install`. NativeWind v4 is the target (v4 is the current line; confirm at scaffold). |
| `babel-preset-expo` | `"*"` ❌ | Pin to the SDK-57 version (comes with `expo`; `expo install` aligns it). |
| `react-test-renderer` | `19.2.0` | Keep — must match `react` exactly. |
| `jest-expo` | `^57.0.1` | Keep — versioned with the SDK. |
| `@testing-library/react-native` | `^14.0.1` | Keep. v12.4+ ships built-in matchers. |

**No `"*"` may survive into a committed `package.json`.** That is a hard acceptance criterion for PR 2.

**ADR-017 matcher note (baked in):** use RNTL built-in matchers via `import '@testing-library/react-native/extend-expect'` in `jest.setup.ts` (already present). Do **NOT** add the deprecated `@testing-library/jest-native`. Flag an ADR-017 doc fix in `tasks`.

### B.3 — HTTP client

A minimal fetch wrapper. It does exactly one thing: `GET {base}/api/resumen[?periodo=YYYY-MM]` with the `x-api-key` header, and maps every outcome into a typed discriminated Result that mirrors the backend's `Result<T,E>` philosophy (no thrown exceptions crossing the boundary — the screen switches on a tag, never a try/catch).

```ts
// src/api/config.ts
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL; // non-secret
export const API_KEY = process.env.EXPO_PUBLIC_API_KEY;           // deterrent, see note

// src/api/client.ts
export type ApiError =
  | { tag: 'unauthorized' }            // HTTP 401 (bad/missing key)
  | { tag: 'network' }                 // fetch rejected (offline, DNS, TLS)
  | { tag: 'parse' }                   // 2xx but body not the expected JSON shape
  | { tag: 'http'; status: number };   // any other non-2xx (500, 400, 404…)

export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApiError };

export async function fetchResumen(periodo?: string): Promise<ApiResult<ResumenMesDto>>;
```

**Mapping rules:**
- `fetch` throws → `{ tag: 'network' }`.
- `res.status === 401` → `{ tag: 'unauthorized' }`.
- `!res.ok` (other) → `{ tag: 'http', status }`.
- `res.ok` but `res.json()` throws or fails a light shape guard (`typeof totalIngreso === 'string'`, `Array.isArray(buckets)`) → `{ tag: 'parse' }`.
- else → `{ ok: true, value }`.

**Env handling:** `EXPO_PUBLIC_*` are read at build time and inlined by Metro. `config.ts` reads them once; if `API_BASE_URL` is missing the client returns `{ tag: 'network' }` rather than fetching `undefined/...` (fail-visible, not a crash). Committed `.env.example` documents both vars; real `.env` is git-ignored.

**Security honesty (baked in):** `EXPO_PUBLIC_API_KEY` is inlined into the compiled binary and is trivially extractable from a downloaded build. It is a **casual-scraping deterrent, not authentication**. The design must not model it as access control. There is no safer option under a single-static-key scheme; per-install token exchange is the real fix and is out of scope (tracked debt).

**Data fetching:** use a plain `useEffect` + `useState` fetch in `index.tsx` for this one screen (no TanStack Query dependency added — the web app uses it, mobile does not need it for one read). This is a deliberate minimalism tradeoff: adding a query library for a single endpoint is unjustified scope. If a second screen appears, revisit.

### B.4 — App config + NativeWind

- **`app.json`** (static, not `app.config.ts`): no dynamic/computed config is needed, so the simpler static file wins. Set `name`, `slug`, `scheme`, iOS `bundleIdentifier` and Android `package` to the runbook value (`com.jorgeretamal.moneydiary`), `plugins: ["expo-router"]`, and `newArchEnabled: true` (SDK 57 default). The Maestro `appId` (`cl.moneydiary.app`) must be reconciled to whatever bundle id is chosen — pick one and make `app.json` + `.maestro/*.yaml` agree.
- **NativeWind v4 wiring** (four touch points, all in PR 2):
  1. `babel.config.js` → add `"nativewind/babel"` to presets (alongside `babel-preset-expo`).
  2. `metro.config.js` → `withNativeWind(config, { input: './global.css' })`.
  3. `tailwind.config.js` → `content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}']`, `presets: [require('nativewind/preset')]`.
  4. `global.css` → `@tailwind base; @tailwind components; @tailwind utilities;`, imported once in `app/_layout.tsx`.

### B.5 — Screen + states + Maestro contract

`app/index.tsx` owns a 4-way state switch. Each state is a distinct component so tests can assert them in isolation:

| State | Trigger | Renders |
|-------|---------|---------|
| **loading** | request in flight | `<Loading>` spinner + label. |
| **error** | `ApiResult.ok === false` (any `ApiError` tag) | `<ErrorState>` with a retry affordance; copy differs subtly by tag (unauthorized vs network) but all are the error branch. |
| **empty** | `ok && value.sinIngreso === true` | `<Empty>` — explicit "no income this period" copy, distinct from `$0`. |
| **data** | `ok && !sinIngreso` | `<ResumenScreen>` — income + 4 bucket rows + global semáforo. |

**Maestro contract satisfaction** (`resumen-semaforo.yaml`) — the **data** state must render exactly these anchors:
- Literal text `"Distribución 50/30/20"` (section heading).
- Bucket labels `"Necesidades"`, `"Deseos"`, `"Ahorro"` (from `buckets[].bucket`; `SinCategoria` also renders but is not asserted).
- A view with `testID="semaforo-global"` carrying `estadoGlobal` color/label.

**Maestro flow fix:** `resumen-semaforo.yaml` currently starts with `- runFlow: login.yaml` and `- tapOn: "Resumen"`. Both are dead: there is no login and no navigation (one screen renders on launch). PR 3 rewrites the flow to `launchApp` → `assertVisible` the anchors above, and **deletes `login.yaml`**. `ver-movimientos.yaml` is out of this change's scope (no movimientos screen) — leave it untouched or note it as unrelated dead flow for a later cleanup; do not let this change depend on it.

### B.6 — CLP money formatter (BigInt-string-safe)

The seeded `formatearMontoCLP(pesos: number)` is **incompatible** with the DTO contract (`total`/`totalIngreso` are BigInt-serialized **strings**, potentially larger than `Number.MAX_SAFE_INTEGER`). It must be **reimplemented** to operate on the string via `BigInt(...)` and string-digit grouping — **never** `parseFloat`/`Number()` (ADR-015 money discipline).

```ts
// src/domain/formatear-monto.ts  (rewritten signature)
export function formatearMontoCLP(montoStr: string): string;
```

**Algorithm:** `BigInt(montoStr)` (throws on non-integer / decimal / garbage → the function throws, matching the seeded "exact integer" contract), derive sign, take the absolute value's digit string via `.toString()`, group thousands with `.` using a string regex (`\B(?=(\d{3})+(?!\d))`), prefix `$`.

| Edge case | Expected |
|-----------|----------|
| `"1500000"` | `"$1.500.000"` |
| `"999"` | `"$999"` |
| `"-2500"` | `"-$2.500"` |
| `"0"` | `"$0"` (note: **`$0` ≠ empty** — the `sinIngreso` *empty state* is decided upstream in the view-model, not here) |
| `"9007199254740993"` (> 2^53) | `"$9.007.199.254.740.993"` (exact — the whole point of BigInt) |
| `"10.5"` / `"abc"` / `""` | throws (BigInt rejects non-integer strings) |

**`null` percentage / `sinIngreso`:** handled in `resumen-view-model.ts`, not the formatter. A `null` `porcentajeBp` renders as a distinct label (e.g. `"—"` or `"sin datos"`), explicitly **not** `"0%"`. `sinIngreso` selects the empty state. The formatter only ever sees a valid amount string. `porcentajeBp` (basis points, ≤ 10000, safe as `number`) formats as `bp/100` with two decimals — this one is number-safe by contract and does not need BigInt.

**Test migration:** the existing `formatear-monto.spec.ts` uses the old `number` signature and will break — it must be rewritten to the string signature as part of PR 3 (this is expected TDD churn, not a regression).

---

## Testing architecture (ADR-017)

Three layers, `strict_tdd: true` — tests lead. Test runner for mobile is **jest-expo** (NOT Vitest; Vitest is apps/api + apps/web only, PR #24).

| Layer | Tool | Location | Scope | CI this sprint |
|-------|------|----------|-------|----------------|
| Domain unit | Jest + `jest-expo` preset | `src/domain/*.spec.ts` | CLP formatter edge cases (incl. > 2^53), `resumen-view-model` mapping, `null%`/`sinIngreso` distinctions. Pure — no render. | **Local only** (see below) |
| Screen states | RNTL (`render` + `screen`) | `src/components/*.spec.tsx`, `app/index.spec.tsx` | loading/error/empty/data render; Maestro anchors present in data state; retry in error state. Built-in matchers via `extend-expect`. | Local only |
| E2E | Maestro | `.maestro/resumen-semaforo.yaml` | Device-gated (needs a dev build on device/emulator). | **NOT CI** — manual/local, per proposal |

**Where tests live:** co-located next to source (`*.spec.ts` / `*.spec.tsx`), matching the existing skeleton convention. `jest.config.js` already sets `preset: 'jest-expo'` + `setupFilesAfterEach: jest.setup.ts`; the `transformIgnorePatterns` note in that file must be revisited once the real RN/Expo ESM tree is installed (pnpm no-hoisted layout may need it extended — resolve empirically on first suite run in PR 2/3).

---

## Workspace integration + CI

**Removing `!apps/mobile`:** deleting that line from `pnpm-workspace.yaml` pulls the full React Native / Expo tree into `pnpm install`. Consequences to design for:

- **`pnpm install`** at repo root now resolves RN/Expo. `allowBuilds` may need new entries (e.g. native build scripts) — resolve at scaffold via `pnpm approve-builds` and record them in `pnpm-workspace.yaml`, same discipline as `@nestjs/core`/`prisma`.
- **`pnpm audit`** now scans the RN/Expo tree; new advisories may surface. `.npmrc` (`minimum-release-age`, `audit-level=high`, `block-exotic-subdeps`) applies. This is a known, accepted cost of activating mobile — it is *why* the skeleton was excluded until now.
- **`@types/node`** stays `^22` across the monorepo (do not let the RN tree drag in v24).

**CI decision — mobile jest stays OUT of CI this sprint.** Rationale:
- The current CI (`.github/workflows/ci.yml`) runs typecheck + Vitest for api/web only. Adding `jest-expo` to CI means installing the full RN toolchain on every PR — slow, and the `transformIgnorePatterns`/native-build friction under pnpm's no-hoisted layout is exactly the kind of flakiness that shouldn't gate unrelated backend PRs mid-sprint.
- Mobile tests run **locally** via `pnpm --filter @moneydiary/mobile test`. Maestro is device-gated and never CI.
- **Tradeoff / debt:** mobile has no CI safety net this sprint. Acceptable because the risky logic (money) is covered by fast local domain tests and the slice is tiny. **Wiring mobile jest into CI is tracked follow-up debt** — do it once the install/transform story is stable. `tasks` should log this explicitly.
- **Guard against install breakage:** even without running mobile tests in CI, `pnpm install --frozen-lockfile` in CI will now resolve the mobile tree, so a broken mobile `package.json`/lockfile WILL fail existing CI. That is the desired minimum safety net for PR 2.

---

## PR chain design

Confirms the proposal's 3-PR split. Delivery strategy `ask-on-risk`; this change touches deploy/auth and exceeds ~400 lines, so chaining is recommended over one PR.

| PR | Scope | Boundary | Verification | Rollback |
|----|-------|----------|--------------|----------|
| **PR 1 — Track A** | Deploy ops + `curl` matrix + `resumen.controller.ts` docstring fix + A.5 accepted-risk doc. | No app code, no workspace change. Smallest, unblocks device testing. | The 3-row curl matrix passes against the live Render URL; docstring reflects reality. | Revert the 1-line doc commit; Render service can be suspended/deleted independently. Deploy is idempotent from `render.yaml`. |
| **PR 2 — Track B scaffold** | Remove `!apps/mobile`; pinned Expo SDK-57 deps (no `"*"`); `app/_layout.tsx` + `app/index.tsx` (placeholder render); NativeWind (babel/metro/tailwind/global.css); `app.json`; `.env.example`; env plumbing. **No feature logic.** | App boots and renders a placeholder; `pnpm install --frozen-lockfile` green; no `"*"` in `package.json`. | `pnpm install` at root succeeds; `pnpm --filter @moneydiary/mobile test` runs the seed tests; app launches on a simulator. | Restore `!apps/mobile` line → mobile falls back out of the workspace; the whole `apps/mobile` real-app diff is isolated. |
| **PR 3 — Track B feature** | `formatear-monto.ts` (BigInt-string rewrite) + spec; `resumen-view-model.ts` + spec; `src/api/client.ts` + `config.ts`; `SemaforoBadge`/`BucketRow`/`ResumenScreen`/state components + RNTL specs; wire the 4-state switch in `index.tsx`; rewrite `resumen-semaforo.yaml`; delete `login.yaml`. | All feature + tests. | Domain + RNTL suites green locally; Maestro anchors present; formatter passes > 2^53 case; manual Maestro run on device (out of CI). | Revert to PR 2's placeholder screen; deploy (PR 1) and scaffold (PR 2) remain intact. |

**Chain rule:** PR 1 → main. PR 2 depends on nothing in PR 1 (parallelizable) but is sequenced after it for a clean history. PR 3 stacks on PR 2. If the orchestrator's chain strategy is `feature-branch-chain`, PR 2 targets the tracker branch and PR 3 targets PR 2's branch; if `stacked-to-main`, each merges to main in order. `tasks` confirms the final split or flags `size:exception` if collapsed.

---

## ADR-style decisions

### D1 — Domain-first split for a one-screen app
- **Decision:** keep pure money/view-model logic in `src/domain/`, isolated from RN and fetch.
- **Rationale:** the money + `null%`/`sinIngreso` rules (ADR-015) are the only risky logic; they must be provable by fast unit tests without rendering. Matches backend ADR-005 discipline.
- **Rejected:** collapse into `index.tsx` — faster to write, but forces every money assertion through RNTL and buries the ADR-015-critical logic in a component. Rejected: testability > line count.

### D2 — Hand-written fetch client, no query library
- **Decision:** plain fetch wrapper returning a tagged `ApiResult`; `useEffect`/`useState` in the screen. No TanStack Query, no `@moneydiary/api-client`.
- **Rationale:** one read-only endpoint. A query library or a generated client is unjustified for a single GET; the formal client needs `openapi.json` (doesn't exist) — scope creep.
- **Rejected:** TanStack Query (web uses it) — real value only with caching/invalidation across screens, which don't exist here. Tracked as debt if a second screen lands.

### D3 — `app.json` (static) over `app.config.ts`
- **Decision:** static `app.json`.
- **Rationale:** no computed/dynamic config needed; static is simpler and less error-prone. Env vars come through `EXPO_PUBLIC_*`, not the config file.
- **Rejected:** `app.config.ts` — justified only when config must be computed (e.g. per-environment app names); not the case here.

### D4 — `EXPO_PUBLIC_API_KEY` as a documented deterrent (baked-in, recorded)
- **Decision:** static key via `EXPO_PUBLIC_API_KEY`, honestly documented as a scraping deterrent, not auth.
- **Rationale:** any per-request client value is inlined in the binary and extractable. No safer option under single-static-key. Pretending an EAS-secret hides it would be false.
- **Rejected:** EAS "secret"-visibility var reaching client fetch code — technically impossible to both reach the client and stay out of the binary. Per-install token exchange is the real fix (out of scope).

### D5 — Mobile jest out of CI this sprint
- **Decision:** run mobile tests locally only; keep CI as typecheck + Vitest (api/web). `pnpm install` in CI still validates the mobile lockfile.
- **Rationale:** full RN toolchain + pnpm no-hoisted transform friction shouldn't gate unrelated PRs mid-sprint; risky logic is covered by local domain tests.
- **Rejected:** wire jest-expo into CI now — correct eventually, premature while the install/transform story is unproven. Tracked debt.

### D6 — Encryption 11.6 accepted risk with hard trigger (baked-in)
- **Decision:** no crypto code; document accepted risk + sign-off + the localhost/PII trigger.
- **Rationale:** `/api/resumen` has zero PII; advancing 11.6 wouldn't reduce this release's exposure. The trigger time-bounds the debt.
- **Rejected:** advance 11.6 now — cost with no exposure reduction for this endpoint.

---

## Risks / open items for `tasks`

| Risk | Mitigation |
|------|------------|
| **Version pins unverified live** — Context7 MCP was not reachable this session. | `apply` MUST resolve every loose pin via `npx expo install` (SDK-57-correct) and re-check Context7 if reachable; no `"*"` may survive PR 2. |
| **pnpm no-hoisted transform friction** for RN/Expo ESM under `jest-expo`. | Resolve `transformIgnorePatterns` empirically on first suite run (PR 2); may need `allowBuilds` additions via `pnpm approve-builds`. |
| **Bundle id mismatch** — `app.json` vs Maestro `appId` (`cl.moneydiary.app`) vs runbook (`com.jorgeretamal.moneydiary`). | Pick one canonical id in PR 2; make `app.json` + `.maestro/*.yaml` agree. |
| **Formatter test churn** — seeded `number`-signature spec breaks on the string rewrite. | Expected; rewrite the spec in PR 3 (TDD), not a regression. |
| **NativeWind v4 config drift** across babel/metro/tailwind/global.css. | Four touch points enumerated (B.4); verify against NativeWind v4 docs at scaffold. |
| **No mobile CI net this sprint** | Accepted; local domain tests cover money; wiring CI is tracked debt (D5). |

## Next step

Run `sdd-tasks` against this design + the spec to produce the ordered task list and the final PR-split confirmation.
