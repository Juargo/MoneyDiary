# Exploration — `packages/api-client` (ADR-012)

## Current state

ADR-012 (decided 2026-07-02, amended 2026-08-02) mandates `packages/api-client`
(`@moneydiary/api-client`): a workspace package, platform-agnostic (no DOM,
no React Native), exposing a typed HTTP client built from `openapi-typescript`
+ `openapi-fetch`, with `TokenStorage` injected by DI (async interface:
`getToken/setToken/clearToken`), and errors mapped to a discriminated
`ApiError` union (`kind: validation|unauthorized|not_found|server|network`).
**The package has NOT been built.** It remains tracked technical debt (see
ADR-012 "Nota 2026-08-02" and yagni skill precedent list). This SDD change is
current-state mapping and approach comparison only — the decision is not
being reopened.

ADR-011 (amended 2026-08-02) changed the *origin mechanism* for the contract:
NestJS/`@nestjs/swagger` was replaced by Zod schemas + `zod-openapi@5.4.2`
(OpenAPI 3.1.0) living in `apps/api/src/infrastructure/http-express/schemas/`.
The artifact moved from the ADR-012-assumed `packages/api-client/openapi.json`
to `apps/api/openapi.json` (co-located with the code that emits it). Any
future `packages/api-client` must read from `apps/api/openapi.json`, not the
path shown in the original ADR-012 code samples. Emission:
`pnpm api openapi:emit` (`apps/api/scripts/emit-openapi.ts` → `tsx
scripts/emit-openapi.ts`); CI drift gate: `pnpm api openapi:check` (same
script with `--check`, exits 1 on divergence). Runtime validation is now
present server-side (`.safeParse()` against the same schema that feeds the
document) — a benefit the original NestJS mechanism did not have.

## Constraints (ADR-bound, non-negotiable for the future proposal)

1. Package layout per ADR-012: `packages/api-client/{openapi.json,
   src/types.gen.ts (generated, gitignored), src/client.ts, src/auth.ts,
   src/errors.ts, src/index.ts, package.json, tsconfig.json}`. Build via
   `tsup` (esm+cjs+dts) so both Vite (web) and Metro (mobile) consume it
   without friction.
2. `TokenStorage` port is async-first (mobile's `expo-secure-store` is async);
   web wraps sync `localStorage` in `Promise.resolve`. No implementation
   ships inside the package — apps supply it.
3. openapi-fetch interceptors only define *where* auth hooks in
   (`onRequest`/`onResponse`); token refresh strategy is explicitly out of
   scope (deferred to a future auth ADR). A 401 today only clears the token.
4. No `packages/shared` for domain entities (ADR-008 stands) — only the HTTP
   contract crosses the boundary, never UI, styles, or screen hooks.
5. Versioning: internal only, `workspace:*` protocol, **no independent
   release** — confirmed against `release-please-config.json`, which has no
   entry for a `packages/*` component and does not need one per ADR-012's own
   text ("no se publica a npm... sin release independiente").
6. `pnpm-workspace.yaml` currently declares `packages: ['apps/*']` only — a
   real `packages/api-client` requires adding `packages/*` (or an explicit
   entry) to that list before pnpm will link it as a workspace member.

## Consumers inventory (what the package would replace or sit beside)

### apps/web/src/api/ (10 hand-written DTOs in `types.ts`, `client.ts` ~1026
lines, `auth.ts`, plus 9 TanStack Query hook files + `capabilities.ts`)

- Endpoints covered: `fetchResumen`, `fetchResumenAnual`, `fetchDetalleBucket`,
  `postReclasificarCategoria`, `postIngesta`, `previewIngesta`,
  `fetchIngestas`, `deleteIngesta`, `fetchApiVersion`, plus session
  (`postLogin`, `fetchMe`, `postLogout` in `auth.ts`) and `capabilities.ts`
  (`googleLoginEnabled`).
- Every function is same-origin `fetch` through `apps/web/api/proxy.ts`
  (Vercel function `[...path].ts`, or Vite `configure` in dev) — the proxy
  injects `x-api-key` server-side; the browser never sees it. Session auth for
  web is a `md_session` HttpOnly cookie (`credentials: 'same-origin'`
  explicit), NOT a Bearer token — `postLogin`'s response body carries a
  `token` field for mobile parity but web's `postLogin` deliberately returns
  `ApiResult<void>` and **never reads it**, so it can never leak into
  localStorage/Zustand/memory. This is a hard behavioral asymmetry vs. mobile
  that ADR-012's `TokenStorage` port (built for a Bearer-token world) does not
  natively express — web's "TokenStorage" would effectively be a no-op/null
  object, since the cookie is the actual credential.
- Every response is validated at runtime with hand-written type guards
  (`esResumenMesDto`, `esDetalleBucketDto`, etc.) that call
  `esMontoStringValido` (money) and `esFechaValida` (dates) on every
  money/date leaf before it reaches `formatearMontoCLP`/`aFechaLabel`. These
  guards are the actual money-safety mechanism — **not** replaceable by
  generated TypeScript types, which only provide compile-time shape and do
  nothing at runtime. A generated `openapi-typescript` client with no
  additional runtime validation is a **regression** on this axis for web,
  which today has 2xx-body validation on every single fetch.
- `ApiError` tags on web: `invalid | unauthorized | network | parse | server`
  — richer than mobile's set (adds `invalid` distinct from generic `server`),
  and 400 bodies on `postIngesta`/`previewIngesta` pass through
  `body.message` verbatim (backend-owned Spanish scrubbed message) instead of
  a client-side generic string.
- `fetchApiVersion` is the one cross-origin call (public `/version`, absolute
  `VITE_API_BASE_URL`, CORS allowlist) — everything else is same-origin
  through the proxy.

### apps/mobile/src/api/ (fetchResumen, postLogin, postGoogleIdToken,
fetchAuthCapabilities, fetchMe, postLogout in `client.ts`; plus
`post-ingesta.ts`, `preview-ingesta.ts`, `resumen-refresh.ts`,
`session-store.ts`/`session-context.tsx`, `config.ts`, `con-timeout.ts`,
`use-google-id-token.ts`)

- Every authenticated call sends `x-api-key` (from `EXPO_PUBLIC_API_KEY`,
  inlined at build time — a scraping deterrent, not real auth per the code's
  own comment) **and**, when a token exists, `Authorization: Bearer <token>`
  built by `construirHeadersSesion()` reading from `session-store.ts`
  (SecureStore-backed). This is the literal shape ADR-012's `TokenStorage`
  port was designed for — mobile is the natural first/best-fit adopter of a
  generated client with injected `TokenStorage`.
- `ApiError` tags on mobile: `unauthorized | network | parse | http` (flatter
  than web's — no `invalid`, uses `http` with a numeric `status` for the
  catch-all non-2xx case). Reconciling this taxonomy with web's under one
  package's `errors.ts` union is a real design question for later phases —
  not blocking for explore, but worth flagging.
- Client-side network-leg timeouts (`conTimeout`, `NETWORK_LEG_TIMEOUT_MS =
  20_000`) wrap `fetch`/`exchangeCodeAsync` for the Google flow only — a
  behavior with no equivalent in ADR-012's sketched interceptors
  (`onRequest`/`onResponse` don't mention timeouts). A generated client
  adopting mobile would need to preserve this wrapping, likely by keeping
  `conTimeout` as an app-level wrapper around calls made through the
  generated client rather than baking it into the package.
- `GOOGLE_CLIENT_ID_ANDROID` / Google sign-in (`use-google-id-token.ts`) is
  entirely orthogonal to `packages/api-client` — it talks to Google's OIDC
  endpoints directly via `expo-auth-session`, not the MoneyDiary API, except
  for the final `postGoogleIdToken` call to `/api/auth/google/token`.
- Light runtime guards exist (`esResumenMesDto`, `esLoginResponseDto`,
  `esAuthCapabilitiesDto`, `esMeDto`) but are shallower than web's (e.g.
  `esResumenMesDto` only checks `totalIngreso` is a string and `buckets` is
  an array — no `esMontoStringValido` per-leaf check, no bucket-shape
  validation). Money-safety enforcement is asymmetric between platforms today.

## Contract source: `apps/api/openapi.json`

17 paths covered as of this exploration: `/api/auth/capabilities`,
`/api/auth/demo`, `/api/auth/google`, `/api/auth/google/callback`,
`/api/auth/google/token`, `/api/auth/login`, `/api/auth/logout`,
`/api/auth/me`, `/api/buckets/{bucket}`, `/api/ingestas`,
`/api/ingestas/{id}`, `/api/ingestas/preview`, `/api/movimientos`,
`/api/resumen`, `/api/resumen/anual`, `/api/transacciones/{id}/categoria` —
i.e. essentially full parity with the hand-written DTOs in both apps' `api/`
folders today (post PRs #211-#218 + auth-google additions). Money fields
(`cargo`/`abono`) are declared `type: string` with an explicit "BigInt-safe
decimal string amount (never a JSON number)" description in the schema —
codegen would be faithful to the string-money contract (verified directly in
`apps/api/openapi.json`, e.g. `DetalleBucketResponse.transacciones[].cargo`).
Emission is `pnpm api openapi:emit` → `tsx scripts/emit-openapi.ts`; CI check
is `pnpm api openapi:check` (same script, `--check` flag exits 1 on drift).
Both scripts are `apps/api/package.json` entries (lines 30-31).

## Workspace mechanics

- pnpm isolated (non-hoisted) resolution — CLAUDE.md's own gotcha section
  already documents "if X works in tests but 'Cannot find module X' appears
  elsewhere, X is transitive and must be declared as a direct dep." A new
  `packages/api-client` consumed by both apps must be declared as an explicit
  `workspace:*` dependency in **both** `apps/web/package.json` and
  `apps/mobile/package.json` — pnpm will not auto-hoist it.
- `pnpm-workspace.yaml` needs `packages/*` added to the `packages:` list
  (currently `['apps/*']` only) before the new package is even recognized as
  a workspace member.
- Metro (Expo SDK 57, `apps/mobile/metro.config.js`): uses
  `getDefaultConfig(__dirname)` with no explicit `unstable_enableSymlinks` /
  `nodeModulesPaths` / `watchFolders` override visible in the repo today.
  Modern Expo/Metro versions have monorepo-aware defaults, but this repo has
  **zero prior evidence** of Metro successfully resolving a pnpm-symlinked
  workspace package — apps/mobile has never depended on anything outside its
  own `node_modules` besides Expo/RN deps. This is an unverified assumption,
  not a known-good path, and should be spiked before committing to timeline.
- Vite (web): resolves workspace `workspace:*` deps through pnpm's symlinks
  natively — lower risk, same mechanism web already uses for nothing today
  (no existing workspace-package consumption to point to as precedent, since
  ADR-008 explicitly avoided `packages/shared`).
- Toolchain versions: Node 22 pinned (`apps/api`'s `@types/node` at `^22`,
  do-not-bump note in CLAUDE.md); TS strict; Vitest for web/api (ADR-016);
  jest-expo (jest@29 pinned) for mobile (ADR-017) — a new package would need
  its own test runner choice (likely Vitest, consistent with web/api, since
  the package itself has no RN/DOM dependency).
- New devDependencies (`openapi-typescript`, `openapi-fetch`, `tsup`) are
  subject to `.npmrc`'s `minimum-release-age=10080` (7-day quarantine) and
  `pnpm audit --audit-level=high` gate (ADR-021) — no `minimumReleaseAgeExclude`
  precedent exists for tooling deps today (only nanoid/js-yaml security
  patches), so a first `pnpm install` after adding these deps could fail or
  stall if a version lands inside the quarantine window; plan the timeline
  accordingly.
- CI path filters (`.github/workflows/ci.yml` lines ~45-47) are exactly
  `api: ['apps/api/**']`, `web: ['apps/web/**']`, `mobile:
  ['apps/mobile/**']` — **no filter exists for a `packages/**` path**. A new
  `packages/api-client` would need a new filter (and likely needs to trigger
  both the web and mobile jobs on package-only changes, or its own job) or
  changes to it would silently not run any CI job. This is a real gap to
  close in a future design, not just a workspace-config nit.

## Approach options (YAGNI-first — 2-3 options, not exhaustive)

### Option A — Full ADR-012 layout as written, adopted by both apps at once

Build `packages/api-client` exactly per the ADR (types.gen + openapi-fetch +
TokenStorage + errors.ts), wire both `apps/web` and `apps/mobile` onto it in
one slice, deleting the hand-written `types.ts`/`client.ts` and
mobile `client.ts` guards.

- Pros: matches the ADR exactly; single migration event; no dual-maintenance
  window.
- Cons: highest risk single slice — touches CI (new path filter), pnpm
  workspace config, Metro symlink behavior (unverified), AND two apps'
  fetch/error-handling call sites simultaneously. If Metro can't resolve the
  workspace package, the whole slice blocks on an unrelated app (web). Loses
  web's per-leaf money-safety runtime guards unless explicitly re-added
  (openapi-fetch/openapi-typescript give compile-time types only — see ADR-011
  "Sin validación runtime" and its Zod amendment note, which is
  server-side only, not client-side). Violates the "resolve the problem in
  front of you" YAGNI rule by bundling three risky changes (CI, Metro,
  dual-app migration) into one unreviewable unit.

### Option B — Minimal first slice: generated types only, apps keep their fetch code

Build only `packages/api-client/src/types.gen.ts` (+ minimal `package.json`/
`tsup` build), no `client.ts`/`auth.ts`/`errors.ts`/factory yet. Both apps
import `paths`/`components` types from the package to replace their
hand-written `types.ts` interfaces, but keep their existing `fetch` wrapper
functions, error taxonomies, and (critically) all money-safety runtime
guards untouched.

- Pros: smallest surface — proves the workspace-package mechanics (pnpm
  linking, Metro symlink resolution, CI filter) in isolation from the
  higher-risk interceptor/TokenStorage/error-mapping work. Zero regression
  risk on money-safety (guards stay where they are, now checked against
  generated types instead of hand-written ones — arguably *safer*, since a
  backend contract change would now fail typecheck in both apps
  automatically). Matches the yagni skill's own precedent framing ("mínimo
  hoy + deuda registrada con gatillo explícito").
- Cons: does not fully realize ADR-012's stated goal (shared interceptor/error
  logic, `TokenStorage` DI) — the "written once" client/error benefit is
  deferred. Two more migration slices needed later (client+interceptors,
  TokenStorage wiring) to finish the ADR.

### Option C — Full client, but adopted by one app first (mobile)

Build the full ADR-012 package (types+client+TokenStorage+errors) but wire
only `apps/mobile` onto it first, leaving `apps/web` on its current
hand-rolled `client.ts`/`auth.ts` until a follow-up slice.

- Pros: mobile is the better-fit first adopter — it already uses a real
  Bearer-token + `TokenStorage`-shaped pattern (`SecureStore` +
  `Authorization` header), unlike web's cookie-based session where
  `TokenStorage` is nearly a no-op. Isolates the Metro-symlink risk to the
  one app where it's unproven, without simultaneously touching web. Mobile's
  runtime guards are shallower than web's today, so there's less
  money-safety regression risk to manage on this app first.
- Cons: leaves the contract represented by two different client shapes across
  apps for a window (mobile on the package, web still hand-rolled) — some
  temporary asymmetry/DRY violation, though this is explicitly a *bridge*
  state, not a permanent one. Web's proxy-injected `x-api-key` + HttpOnly
  cookie model still needs its own `TokenStorage` design (near-no-op) before
  it can adopt, which is real design work not yet done.

**Recommendation for the future proposal phase:** Option B first (types-only
slice, proves workspace/CI/Metro mechanics cheaply), then Option C direction
for the full client (mobile first — better architectural fit for
`TokenStorage`), web last (needs a `TokenStorage`-for-cookies design
resolved, and has more runtime-guard logic to reconcile against
compile-time-only generated types). Do not attempt Option A's single-slice
full-both-apps migration — it stacks three independently risky unknowns
(Metro symlinks, CI wiring, dual-app call-site migration) into one
unreviewable change, which both KISS ("one function, one job" applied at
slice granularity) and YAGNI ("three strikes, then abstract" — the pattern
hasn't been proven once yet) argue against.

## Risks & open questions

1. **Metro/Expo SDK 57 symlink resolution for pnpm workspace packages is
   unverified in this repo.** No existing precedent of `apps/mobile`
   consuming any workspace-local package. Must be spiked (a trivial "hello
   world" workspace package consumed by mobile) before committing to a
   apply-phase timeline that assumes it works.
2. **Web's session model (HttpOnly cookie, `x-api-key` proxy-injected)
   doesn't map cleanly onto ADR-012's Bearer-token-shaped `TokenStorage`
   port.** A `TokenStorage` for web would be close to a no-op (`getToken`
   always returns `null`, or the interface itself becomes irrelevant since
   auth is cookie-based). This needs an explicit design decision, not an
   assumption that ADR-012's example code transfers unchanged to web.
3. **Generated types alone do NOT replace the runtime money-safety guards**
   (`esMontoStringValido`, `esFechaValida`, and the per-DTO shape guards in
   `apps/web/src/api/client.ts`). `openapi-typescript` gives compile-time
   shape only (ADR-011 explicitly documents "Sin validación runtime" as a
   known limit of the client side, distinct from the new server-side Zod
   `.safeParse()`). Any migration slice must explicitly decide whether these
   guards move into the package (extra scope, arguably the "written once"
   ADR-012 promise), stay in each app, or are dropped (money-domain risk,
   unacceptable per this repo's ADR-015 emphasis on money correctness).
4. **CI has no path filter for `packages/**`.** Changes to
   `packages/api-client` alone would trigger no job today
   (`.github/workflows/ci.yml` filters are `apps/api|web|mobile/**` only).
   Must be added as part of the same change that creates the package, or
   commits to it ship unverified.
5. **`pnpm-workspace.yaml` packages list and first-package-ever bootstrapping.**
   This is literally the first shared package in the monorepo (ADR-008's
   "no `packages/shared`" stood until now) — `pnpm-workspace.yaml`'s
   `packages: ['apps/*']` needs `packages/*` added, and build-order
   (`api emit → api-client generate/build → web/mobile typecheck`) has no
   orchestrator yet (Turborepo explicitly deferred by ADR-012 itself, "no
   antes" until manual script-chaining gets painful) — plan for hand-chained
   pnpm scripts, not a task-graph tool, for the first slice.
6. **Error-taxonomy reconciliation between web's `ApiError` (`invalid |
   unauthorized | network | parse | server`) and mobile's (`unauthorized |
   network | parse | http`)** is unresolved — ADR-012's `errors.ts` sketch
   (`validation | unauthorized | not_found | server | network`) matches
   neither exactly. A future design phase needs to pick the canonical shape
   the shared package uses and map both apps onto it, potentially changing
   UI-facing error copy in ways that need product sign-off, not just an
   engineering decision.
7. **`minimum-release-age=10080` (7-day quarantine) applies to the three new
   devDependencies** (`openapi-typescript`, `openapi-fetch`, `tsup`) — no
   existing `minimumReleaseAgeExclude` precedent for build tooling (only
   security-patch nanoid/js-yaml entries exist). First `pnpm install` after
   adding these could stall if pinned to a very recent release; pin to a
   version already outside the quarantine window when writing tasks.

## Recommendation

Do not re-litigate the ADR-012 decision. For the proposal phase, scope the
**first slice narrowly** (Option B: generated types only, both apps import
types but keep their own fetch/validation/error code), explicitly deferring
the full interceptor/TokenStorage/errors.ts package to a follow-up change
once the workspace-package mechanics (pnpm config, Metro symlinks, CI filter)
are proven working end-to-end. This keeps money-safety runtime guards fully
intact (zero regression risk) while retiring the actual duplication risk
ADR-011 originally worried about (hand-typed DTOs drifting from the real
contract) with the least total risk surface. Track the full client
(interceptors + `TokenStorage` + unified `errors.ts`) as registered debt with
mobile as the first full adopter, per the yagni skill's "mínimo hoy + deuda
registrada con gatillo explícito" pattern already used elsewhere in this
repo (`NoOpCryptoService`, `ApiKeyGuard`, mobile cliente mínimo).
