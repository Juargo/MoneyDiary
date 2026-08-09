# Tasks — auth-google-login-mobile

**Scope:** brings "Ingresar con Google" (ADR-035, M1 native `id_token` verification) to `apps/mobile` (Android only). Follows design §13's slice breakdown EXACTLY — 8 slices, 7 chained (A1, A2, B1, B2, B3, C1, C2) + D (docs-only, order-independent after A2). Chain: **A1 → A2 → B1 → C1 → C2 (C2 also requires B3)**; B2 and B3 branch off B1 in parallel; B2 is independent (CI-only, blocks nothing).

**Strict TDD is active.** Test runners: `pnpm api test` (Vitest, unit) / `pnpm api test:integration` (Vitest, real Postgres — **runs in CI**, `postgres:16-alpine` service container per design header correction 1) / `pnpm --filter @moneydiary/mobile test` (jest-expo + RNTL). Every implementation task is preceded by a failing-test task for the same behavior — write the test, watch it fail, then implement. `pnpm api exec tsc --noEmit` must be green before closing each backend slice; `pnpm --filter @moneydiary/mobile test` green before closing each mobile slice.

**Clean Architecture order inside each backend slice:** domain (zero changes here) → application → infrastructure → composition (ADR-005). Spanish naming in domain/application, English naming in infrastructure. `Result<T,E>` everywhere in application/infrastructure adapters — the `GoogleIdTokenVerifier` never lets a `google-auth-library` throw cross the port boundary.

**Canonical literals (do not deviate):** capabilities field `googleLoginMobileEnabled`; env var `GOOGLE_CLIENT_ID_ANDROID`; rate limiter `IpRateLimiter('google-token:ip:', 30, 15 * 60_000)`; JWKS failure ⇒ generic 401, never 503.

**Chain strategy:** 7 chained PRs (A1, A2, B1, C1, C2 sequential; B2/B3 branch off B1 in parallel) + 1 docs PR (D). One work unit per PR, Conventional Commit work-unit commits inside each PR (work-unit-commits skill). `delivery_strategy: ask-on-risk` — chain strategy (stacked-to-main vs feature-branch-chain) is not yet cached; the orchestrator must confirm before `sdd-apply` starts Slice A1. Every backend slice touches `**/auth/**` → full 4R fan-out review; `judgment-day` after B1 (the new externally-reachable trust boundary) in addition to after design.

---

## Prerequisites / out-of-band (block hardening and rollout, not A1/A2/B1/C1)

- [ ] **P1.** Confirm `google-auth-library`'s target release is older than 7 days (`.npmrc` `minimum-release-age=10080`): `npm view google-auth-library time`. Blocks A1's install step.
- [ ] **P2.** Confirm mobile deps (`expo-auth-session`, `expo-crypto`, `expo-web-browser`) via `npx expo install` (SDK-pinned, normally well past the 7-day quarantine). Blocks C1's install step.
- [ ] **P3.** ADR-035 amendment: append a one-line deviation note to `docs/adr/ADR-035-login-google-mobile-token-exchange.md` §Decision point 4, recording that this change uses an independent `googleLoginMobileEnabled` flag instead of the single shared `googleLoginEnabled` ADR-035 prescribed (design §8, "Deviation from ADR-035 point 4"). Placed in Slice D (see D-ADR below) — user-approved, rides the implementation PR.
- [ ] **P4.** Manual device gate (design §11.4) — physical Android device, EAS build, real Google account — is a hard pre-merge gate for Slice C2 (see C2 manual-gate tasks below). Not automatable in CI. Owner: human operator.
- [ ] **P5.** Post-merge activation runbook (design §12) is a manual, documented gate — actual Google Cloud Console client creation + Render/EAS env configuration is explicitly out of scope of `sdd-apply` (proposal non-goal). Slice D delivers the runbook only.

---

## Slice A1 — Port + verifier (PR #1, targets `main` or tracker)

**Spec coverage:** AUTH-19 (id_token authenticity + audience verification before identity resolution). **Design refs:** §4 (D3 — third role interface), §5 (D4 — library choice, adapter, JWKS failure posture).
**Independently shippable:** yes — inert, nothing in the composition root constructs it yet.
**~Lines:** ~300.

### Application — port

- [x] **A1.1.** Blocking check: confirm P1 (`google-auth-library` release age > 7 days) before running the install in A1.2.
- [x] **A1.2.** Add `google-auth-library` as a direct dependency of `apps/api` (`pnpm --filter @moneydiary/api add google-auth-library`). Confirm `pnpm-lock.yaml` updates cleanly and `pnpm audit --audit-level=high` stays green.
- [x] **A1.3.** Write failing type-level/contract test (or a minimal double + compile check) for the new `IVerificadorIdTokenExterno` role interface in `apps/api/src/application/ports/verificador-identidad-externa.port.ts` — third role interface in the existing file (design §4), NOT a method added to `IVerificadorIdentidadExterna`. Confirm `IdentidadExterna` / `VerificacionIdentidadFallidaError` are reused verbatim (assert no shape change).
- [x] **A1.4.** Implement the `IVerificadorIdTokenExterno` addition to `verificador-identidad-externa.port.ts` per design §4: `verificarIdToken(idToken: string): Promise<Result<IdentidadExterna, VerificacionIdentidadFallidaError>>`. Run A1.3 green. Grep-confirm `LoginConGoogleUseCase` is untouched (design's zero-change guarantee).

### Infrastructure — verifier adapter

- [x] **A1.5.** Write failing unit tests for `apps/api/src/infrastructure/oidc/google-id-token.adapter.spec.ts` against a hand-written `ClienteVerificadorIdToken` double (design §5.2), covering:
  - empty/blank `idToken` → `Result.fail` **without** calling the double (assert not invoked)
  - valid payload → correct `IdentidadExterna` mapping (`email` null when absent, `emailVerificado` only when strictly `true`)
  - payload `undefined` → fail
  - `sub` missing from payload → fail
  - double's `verifyIdToken` throws (bad signature / wrong `aud` / wrong `iss` / expired / network failure) → `Result.fail`, **the adapter never throws** across the port
  - audience array passed through correctly with one entry and with several entries
- [x] **A1.6.** Implement `apps/api/src/infrastructure/oidc/google-id-token.adapter.ts` — `GoogleIdTokenVerifier implements IVerificadorIdTokenExterno`, constructor `(audiencias: readonly string[], cliente: ClienteVerificadorIdToken = new OAuth2Client())` per design §5.2. This is the **only** file in the repo importing `google-auth-library`. Every throw from `cliente.verifyIdToken` is caught and mapped to `Result.fail(new VerificacionIdentidadFallidaError(motivo))` — nothing from `google-auth-library` crosses the port. Run A1.5 green.

### Slice close-out

- [x] **A1.7.** `pnpm api test` green. `pnpm api exec tsc --noEmit` green.
- [x] **A1.8.** Confirm `application/` still imports nothing from `google-auth-library`, Express, or Prisma directly (grep check, ADR-005 invariant — the adapter is the sole importer).
- [x] **A1.9.** Open PR #1 (chained-pr skill: state start/finish/rollback in the PR body; dependency diagram with 📍 on this PR). **Not opened by sdd-apply per delivery instructions** — branch pushed; a fresh-context 4R review runs first, orchestrator opens the PR.

**Verified by:** `pnpm api test` (unit specs).
**Rollback:** revert PR; nothing imports the adapter or the new port method.

---

## Slice A2 — Env + activation seam (PR #2, targets Slice A1's branch/PR)

**Spec coverage:** AUTH-22 (independent activation gate). **Design refs:** §7 (D6 — env schema + composition), §13 boundary table.
**Depends on:** Slice A1 merged (constructs `GoogleIdTokenVerifier` in the graph).
**Independently shippable:** yes — graph builds, nothing routes to it yet.
**~Lines:** ~270.

### Config — env schema (ADR-029)

- [x] **A2.1.** Write failing unit tests for `apps/api/src/config/env.spec.ts` additions:
  - `GOOGLE_CLIENT_ID_ANDROID` absent → schema accepts, feature off, no error in any environment
  - present, ends with `.apps.googleusercontent.com` → schema accepts
  - present, wrong suffix (e.g. truncated value or a pasted client secret) → boot fails
  - present, equal to `GOOGLE_CLIENT_ID` → boot fails (copy-paste-of-web-client-id guard, design §7 point 3)
  - **all four** web × mobile on/off combinations are valid and independently computed (design §7 point 4)
  - no production-specific rule exists (a production deploy with the mobile feature off is valid)
- [x] **A2.2.** Implement the `GOOGLE_CLIENT_ID_ANDROID` addition to `apps/api/src/config/env.ts`: optional string, `min(1)`, `.describe(...)`d. Add `refineGoogleAuthMobileEnv` as a sibling of `refineGoogleAuthEnv`, wired from `refineByEnvironment` — a separate function per design §7's readability rationale, not merged into the web refine. Run A2.1 green.
- [x] **A2.3.** Regenerate `.env.example` (`pnpm api env:example`) and confirm the CI check that diffs it against the schema stays green.

### Composition — activation seam

- [x] **A2.4.** Write failing unit tests for `apps/api/src/composition/crear-auth-google-mobile.spec.ts`: returns `undefined` when `GOOGLE_CLIENT_ID_ANDROID` is absent; returns a `GoogleAuthMobileGraph` (`verificadorIdToken`, `loginConGoogle`, `googleTokenRateLimiter`) when present; receives (never re-derives) the existing `blindIndex` instance (assert reference equality, not a fresh HKDF derivation); constructs a **second, independent** `LoginConGoogleUseCase` instance (not shared with `crearAuthGoogle`'s).
- [x] **A2.5.** Implement `apps/api/src/composition/crear-auth-google-mobile.ts` — `crearAuthGoogleMobile(prisma, env, blindIndex): GoogleAuthMobileGraph | undefined` per design §7, mirroring `crear-auth-google.ts`'s pattern. Run A2.4 green.
- [x] **A2.6.** Wire `container.ts`'s `Container.googleAuthMobile?: GoogleAuthMobileGraph`, constructed by `crearAuthGoogleMobile(prisma, env, blindIndex)` reusing the container's already-derived `blindIndex` instance. Add/adjust `container.spec.ts` coverage for the new field.

### Composition — boot assertion

- [x] **A2.7.** Write failing unit test for `assertGoogleAuthMobileActivationConsistency` (sibling in `apps/api/src/composition/assert-google-auth-activation-consistency.ts`): throws when `GOOGLE_CLIENT_ID_ANDROID` is present but `googleAuthMobile` is `undefined` (composition-bug guard); silent otherwise. Document the deliberate near-identical duplication with the web sibling per the `yagni` skill's three-strikes rule (design §7 — do not extract, two occurrences is not the threshold).
- [x] **A2.8.** Implement `assertGoogleAuthMobileActivationConsistency(env, googleAuthMobile)`. Run A2.7 green. Wire the call in `apps/api/src/infrastructure/http-express/server.ts` right after `createContainer`, next to the existing web assertion, before `app.listen()`.

### Slice close-out

- [x] **A2.9.** `pnpm api test` green, `env:example:check` green. `pnpm api exec tsc --noEmit` green.
- [x] **A2.10.** Open PR #2 targeting Slice A1's branch/PR per the chosen chain strategy — dependency diagram with 📍 on this PR, prior dependency = PR #1.

**Verified by:** `pnpm api test` (unit specs) + `env:example:check` in CI.
**Rollback:** revert PR; the `googleAuthMobile` graph field disappears, nothing else references it.

---

## Slice B1 — The endpoint (PR #3, targets Slice A2's branch/PR)

**Spec coverage:** AUTH-19 (full route wiring), AUTH-20 (session issuance parity), AUTH-21 (anti-enumeration, generic 401 incl. missing/non-string `idToken`), AUTH-23 (no-nonce regression pin), AUTH-24 (rate limiting), AC-11 (session-public, api-key required). **Design refs:** §6 (D5 — route shape/activation/errors/logging/rate limit), §6.5 (log redaction — already covered by existing `id_token` query-param redaction; body is not serialized by `pino-http`).
**Depends on:** Slice A2 merged (needs the activation seam + graph to route into).
**Independently shippable:** yes — backend feature complete, no client shows a button yet.
**~Lines:** ~380.

### Infrastructure — the route

- [x] **B1.1.** Write failing supertest specs (fake-container pattern) for `apps/api/src/infrastructure/http-express/routes/auth-google-token.routes.ts` per design §6:
  - `POST /api/auth/google/token` → **404** when `container.googleAuthMobile === undefined` (registrarAuthGoogleTokenDeshabilitado, the same 404-vs-401 trap AUTH-16/§6.1 documents for the disabled web stub — the router's own branch, not a fallthrough into `sessionMiddleware`)
  - happy path (verifier double) → `200 { token, userId, expiresAt }`, exact body shape (reuses `authLoginResponseSchema`)
  - missing/non-string `idToken` → **401** generic (not 400) — mirrors `/auth/login`'s body-handling exactly
  - every failure branch (invalid token, wrong `aud`, expired, unverified email, no matching user, demo user, already linked to a different `googleSub`, JWKS failure, unexpected throw) → identical `401 { message: <generic> }`
  - `429` after the 30-attempts/15-min budget is exceeded (own `IpRateLimiter` instance, prefix `google-token:ip:`)
  - `Set-Cookie` **absent** on every response (mobile is Bearer-only, MOB-02)
  - log capture regression: the `idToken` value never appears in the captured NDJSON stream (body isn't serialized by `pino-http`, but assert it explicitly rather than trusting the omission)
  - no Sec-Fetch guard mounted (design §6.3 — decided explicitly, not copied; a POST with no `Sec-Fetch-*` headers from a native client would fail-open anyway)
- [x] **B1.2.** Write failing unit test pinning AUTH-23 (no-nonce regression): the request schema/handler requires and validates **no** `nonce` field — a request carrying an unexpected `nonce` key is accepted and ignored (not rejected), so the accepted no-nonce tradeoff cannot silently regress into a required-nonce contract.
- [x] **B1.3.** Implement `apps/api/src/infrastructure/http-express/schemas/auth-google-token.schema.ts` (request contract — `{ idToken: string }`, no `nonce`).
- [x] **B1.4.** Implement `apps/api/src/infrastructure/http-express/routes/auth-google-token.routes.ts` — `registrarAuthGoogleToken(router, deps)` + `registrarAuthGoogleTokenDeshabilitado(router)` per design §6.1–6.4: body handling mirrors `/auth/login` (`typeof body?.idToken === 'string' ? body.idToken : ''`, no 400); dedicated `IpRateLimiter('google-token:ip:', 30, 15 * 60_000)`; `appLogger.warn` + `motivo` on modeled failures, `.error` + `errorName` on unexpected throws (ADR-033/AUTH-18, never the token/email/`googleSub`/session token). Run B1.1 and B1.2 green.
- [x] **B1.5.** Wire `app.ts`: a **separate** router (not a branch inside `authGoogleApi`) — `authGoogleTokenApi`, mounted immediately after `authGoogleApi`, branching on `container.googleAuthMobile !== undefined` per design §6.1's exact snippet.

### OpenAPI

- [x] **B1.6.** Register `POST /api/auth/google/token` in `apps/api/src/infrastructure/http-express/schemas/openapi-document.ts`, appended at the end of `paths` (never reordering existing entries). The operation reuses `authLoginResponseSchema` verbatim for the 200 response, so the document proves body identity rather than asserting it in prose. Run `pnpm api openapi:emit` and `openapi:check`.

### Slice close-out

- [x] **B1.7.** `pnpm api test` green. `pnpm api exec tsc --noEmit` green.
- [x] **B1.8.** Manual smoke: confirm `POST /api/auth/google/token` 404s and `GET /api/auth/google` (web) is unaffected, with zero `GOOGLE_CLIENT_ID_ANDROID` configured locally.
- [x] **B1.9.** Open PR #3 targeting Slice A2's branch/PR — dependency diagram with 📍 on this PR, prior dependency = PR #2. Recommend `judgment-day` on this PR (new externally-reachable trust boundary, design §13 cross-cutting note).

**Verified by:** supertest specs + `openapi:check` in CI.
**Rollback:** revert PR **or** unset `GOOGLE_CLIENT_ID_ANDROID` (instant, no deploy).

---

## Slice B2 — DB-backed guarantees (independent, branches off B1; CI-only, blocks nothing)

**Spec coverage:** AUTH-20 (session issuance parity, DB-verified), AUTH-14 rule ★ (no re-linking, DB-verified). **Design refs:** §11.2.
**Depends on:** Slice B1 merged (the endpoint must exist to integration-test it).
**Independently shippable:** yes — tests only.
**~Lines:** ~230.

- [x] **B2.1.** Write failing integration tests (`pnpm api test:integration`, real Postgres, **runs in CI**) for `POST /api/auth/google/token`, all using a **double** of `IVerificadorIdTokenExterno` — never live Google:
  - happy path writes a real `Session` row: SHA-256 hash, `expiresAt` = creation + 7 days, indistinguishable from a password-login row
  - unknown identity → 401 and the `user` row count is unchanged
  - `email_verified: false` → 401 and no `googleSub` written
  - demo account (via both the `googleSub` path and the email path) → 401
  - email matches a user already linked to a *different* `googleSub` (★) → 401, stored value **not** overwritten
  - endpoint 404s when the container has no mobile graph
- [x] **B2.2.** Confirm rate limiting stays out of this suite — it is in-process state with no DB involvement (already covered in B1.1). Confirmed: each test's `IpRateLimiter` gets a fresh instance with a generous budget (1000/15min), never exercised as a failure path.
- [x] **B2.3.** `pnpm api test:integration` green — verified LOCALLY against a real disposable Postgres (`docker compose up`, apps/api/docs/local-test-db.md), 7/7 new tests + 67/67 full integration suite (no regressions). CI's `integration` job (`postgres:16-alpine`) will re-confirm on push.
- [ ] **B2.4.** Open PR (branches off Slice B1's branch/PR per chain strategy) — dependency diagram with 📍 on this PR, prior dependency = PR #3 (B1). Independent of B3; does not block C1. **Not opened by sdd-apply per delivery instructions** — branch pushed; a fresh-context review runs first, orchestrator opens the PR.

**Verified by:** CI integration job (`postgres:16-alpine` service container).
**Rollback:** revert PR; tests only, no runtime behavior change.

---

## Slice B3 — Capability discovery (branches off B1 in parallel with B2)

**Spec coverage:** AC-10 (modified — second independent boolean), MOB-06 (partial — the flag this requirement gates on). **Design refs:** §8 (D7 — capabilities contract), the "what must move together" list.
**Depends on:** Slice B1 merged (`googleLoginMobileEnabled` must equal `POST /api/auth/google/token` reachability).
**Independently shippable:** yes — additive, live web client unaffected (verified structural guard, design §8).
**~Lines:** ~160.

- [x] **B3.1.** Write failing unit/supertest tests for `auth-capabilities.schema.ts` + `auth-capabilities.routes.ts` covering all **four** activation states of `(googleLoginEnabled, googleLoginMobileEnabled)`, independently computed; response type/schema stay in sync (compile-time coupling via the route's `const body: AuthCapabilitiesResponse` annotation, design header correction 2).
- [x] **B3.2.** Implement the `googleLoginMobileEnabled` addition to `apps/api/src/infrastructure/http-express/schemas/auth-capabilities.schema.ts` (additive field, schema is NOT `.strict()` — no unknown-key-rejection test needed, per design header correction 2).
- [x] **B3.3.** Implement the `auth-capabilities.routes.ts` signature change: `registrarAuthCapabilities(router, { googleAuth, googleAuthMobile })` — an **object**, not two positional nullable params (avoids trivial-swap risk). Still receives the graph fields, not pre-computed booleans ("the type is the flag"). Run B3.1 green.
- [x] **B3.4.** Update the `app.ts` call site for the new `registrarAuthCapabilities` signature.
- [x] **B3.5.** Register the field's description text in `openapi-document.ts` (the schema component updates itself since it's referenced, not duplicated). Run `pnpm api openapi:emit` — CI's `openapi:check` fails otherwise.
- [x] **B3.6.** Manual/structural verification that the live `apps/web` client tolerates the new key: confirm `apps/web/src/api/capabilities.ts`'s `esAuthCapabilitiesDto` guard checks only `typeof candidato.googleLoginEnabled === 'boolean'` and ignores unknown keys (read-only check — **no `apps/web` file changes in this change**, per design §8).

### Slice close-out

- [x] **B3.7.** `pnpm api test` green, `openapi:check` green. `pnpm api exec tsc --noEmit` green.
- [ ] **B3.8.** Open PR (branches off Slice B1's branch/PR per chain strategy) — dependency diagram with 📍 on this PR, prior dependency = PR #3 (B1). Independent of B2; **C2 requires this slice merged.**

**Verified by:** route spec (all four states) + web-client-untouched structural check.
**Rollback:** revert PR; web reads only the old key, mobile capability flag reverts to unreported (fails closed on the mobile client per B_06/§9.3).

---

## Slice C1 — Mobile transport (PR #4, targets Slice B1's branch/PR)

**Spec coverage:** MOB-06 (partial — transport layer the button orchestration depends on). **Design refs:** §2 (D1 — `expo-auth-session` configuration, highest-risk decision), §9.1 (transport).
**Depends on:** Slice B1 merged (the endpoint must exist for `postGoogleIdToken` to call).
**Independently shippable:** yes — no UI reaches it yet.
**~Lines:** ~320.

### Dependencies + config

- [ ] **C1.1.** Blocking check: confirm P2 (`expo-auth-session`/`expo-crypto`/`expo-web-browser` via `npx expo install`, SDK-pinned).
- [ ] **C1.2.** Add the three deps to `apps/mobile/package.json` explicitly (pnpm's isolated resolution does not hoist transitive deps).
- [ ] **C1.3.** Update `apps/mobile/app.json`: `"scheme": ["moneydiary", "cl.moneydiary.app"]` — keep the existing `moneydiary` scheme (deep links/expo-router depend on it), add the package-name scheme for OAuth only (design §2.4). Document the reversed-client-id-scheme (`com.googleusercontent.apps.<id>`) contingency as a code comment or in the PR body, not implemented speculatively.

### API — transport functions

- [ ] **C1.4.** Write failing unit test for `apps/mobile/src/api/config.ts`'s new export `GOOGLE_CLIENT_ID_ANDROID` (reads `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID`, `undefined` when absent — same "absent means not configured" discipline as `API_BASE_URL`).
- [ ] **C1.5.** Implement the `GOOGLE_CLIENT_ID_ANDROID` export in `apps/mobile/src/api/config.ts`. Run C1.4 green.
- [ ] **C1.6.** Write failing unit tests (stubbed `fetch`) for `apps/mobile/src/api/client.ts`'s two new functions:
  - `postGoogleIdToken(idToken)` — mirrors `postLogin` exactly (same `x-api-key`-only headers, reuses the *existing* `esLoginResponseDto` guard, same `LoginResponseDto`, same typed failure tags), never throws
  - `fetchAuthCapabilities()` — `GET /api/auth/capabilities` with `x-api-key` only, explicit headers (**not** `construirHeadersSesion` — no session exists at this point), never throws
- [ ] **C1.7.** Implement `postGoogleIdToken` and `fetchAuthCapabilities` in `apps/mobile/src/api/client.ts` per design §9.1. Run C1.6 green.
- [ ] **C1.8.** Write failing unit tests (`jest.mock('expo-auth-session')`, mocking `useAutoDiscovery`, `useAuthRequest`, `exchangeCodeAsync`, `makeRedirectUri`) for `apps/mobile/src/api/use-google-id-token.ts`:
  - exposes `{ listo: boolean; obtenerIdToken: () => Promise<string | null> }`
  - absent client ID → `useAuthRequest` called with `''`, `listo: false` (hooks can't be called conditionally)
  - `promptAsync` → `dismiss`/`cancel`/`error` → `null`, never throws
  - throwing `exchangeCodeAsync` → `null`, never throws
  - token response with no `idToken` → `null`
- [ ] **C1.9.** Implement `apps/mobile/src/api/use-google-id-token.ts` per design §2.1/§9.1 — the only file importing `expo-auth-session`: `useAutoDiscovery('https://accounts.google.com')`, `makeRedirectUri({ scheme: 'cl.moneydiary.app', path: 'oauthredirect' })`, `useAuthRequest({ clientId: GOOGLE_CLIENT_ID_ANDROID ?? '', scopes: ['openid','email','profile'], redirectUri, responseType: 'code', usePKCE: true }, discovery)`, `exchangeCodeAsync` with `code_verifier` from `request.codeVerifier`. Run C1.8 green.

### Slice close-out

- [ ] **C1.10.** `pnpm --filter @moneydiary/mobile test` green.
- [ ] **C1.11.** Open PR #4 targeting Slice B1's branch/PR — dependency diagram with 📍 on this PR, prior dependency = PR #3 (B1).

**Verified by:** jest-expo specs.
**Rollback:** revert PR; no UI path exists yet, nothing references the transport functions.

---

## Slice C2 — Mobile UI (PR #5, targets Slices B3 + C1's branches/PRs)

**Spec coverage:** MOB-06 (full). **Design refs:** §9.2 (UI), §9.3 (capability timing, fail-closed), §11.4 (manual device gate — hard pre-merge requirement), §2.3 (residual `aud` risk retirement), §2.4 (redirect scheme contingency).
**Depends on:** Slice B3 merged (capabilities flag) **and** Slice C1 merged (transport).
**Independently shippable:** yes — completes the feature.
**~Lines:** ~290.

### UI — button component

- [ ] **C2.1.** Write failing RNTL test for `apps/mobile/src/components/GoogleLoginButton.tsx`: pure presentational `Pressable`, `testID="login-google"`, `accessibilityRole="button"`, label "Ingresar con Google", visually secondary (outlined/neutral, not `COLORS.ingreso` primary).
- [ ] **C2.2.** Implement `apps/mobile/src/components/GoogleLoginButton.tsx` per design §9.2. Run C2.1 green.

### UI — LoginScreen wiring

- [ ] **C2.3.** Write failing RNTL tests for `apps/mobile/src/components/LoginScreen.tsx`'s new optional props `mostrarGoogle?: boolean` and `onGoogleSubmit?: () => void`:
  - button renders below the submit `Pressable` only when `mostrarGoogle` is true
  - `submitting` disables both affordances (existing `LoginEstado` reused, not extended)
  - `error` state shows the existing `MENSAJE_ERROR_GENERICO` regardless of which flow failed
- [ ] **C2.4.** Implement the `mostrarGoogle`/`onGoogleSubmit` props in `LoginScreen.tsx`. Run C2.3 green. Confirm `LoginEstado` is NOT extended (one state machine, one message, per the locked assumption).

### UI — orchestration

- [ ] **C2.5.** Write failing RNTL tests for `apps/mobile/app/login.tsx`:
  - button hidden when the capabilities call fails, when the flag is `false`, when `GOOGLE_CLIENT_ID_ANDROID` is undefined, and when the auth request isn't ready — all three fail-closed conditions independently tested
  - button visible only when all three conditions hold
  - success path: `promptAsync` → `exchangeCodeAsync` → `postGoogleIdToken` → `guardarToken` called with the returned token → `signIn` called
  - cancel / error / no `idToken` in the exchange response / 401 from the API → generic error shown and **`guardarToken` never called**
  - double-tap guard: a second press while `submitting` is a no-op (reuses the existing `enviar` guard pattern)
- [ ] **C2.6.** Implement `app/login.tsx` orchestration per design §9.2/§9.3: capability `useState<boolean>(false)`, default `false`, mount-time `useEffect` calling `fetchAuthCapabilities` (not in `SessionProvider` — SRP, avoids firing on every cold start), no retry on failure, `ingresarConGoogle` with the same double-tap guard as `enviar`. On success: `guardarToken(token)` → `signIn(token)`. On any failure: `setEstado({ fase: 'error' })`, no token written. Run C2.5 green.

### Manual device gate (hard pre-merge requirement, NOT executed by `sdd-apply`)

- [ ] **C2.7. — MANUAL GATE, BLOCKS MERGE.** `aud` verification (design §2.3, residual risk retirement): build an EAS `development`/`preview` APK with `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID` set, run the flow against a local API, temporarily log the decoded `aud`/`azp` of the received `id_token` in a dev-only path (never committed, never production per AUTH-18), assert `aud === GOOGLE_CLIENT_ID_ANDROID`, then delete the temporary log before the PR. If `aud` is something else: (a) fix the client/redirect configuration first — the expected outcome; (b) only if provably impossible, escalate to the user before adding a second audience (product/security decision, not an implementation detail, design §2.3).
- [ ] **C2.8. — MANUAL GATE, BLOCKS MERGE.** Redirect-scheme contingency check (design §2.4): on device, confirm Google accepts the package-name-derived scheme (`cl.moneydiary.app`) for the redirect. If rejected, apply the pre-approved contingency — add the reversed-client-id scheme (`com.googleusercontent.apps.<id>`) as a second `app.json` scheme array entry — rather than improvising.
- [ ] **C2.9. — MANUAL GATE, BLOCKS MERGE.** Run the remaining design §11.4 checklist on a physical Android device with an EAS build and paste the result into the PR:
  1. Sign in with a Google account matching an existing MoneyDiary user → lands on resumen, token in SecureStore.
  2. Sign in with a Google account matching **no** user → generic error; confirm in the DB no user row was created.
  3. Cancel at the consent screen → generic error, no token written.
  4. Kill-switch drill: unset `GOOGLE_CLIENT_ID_ANDROID` in Render → restart → endpoint 404s and the button disappears on the next app launch; password login unaffected.

### Slice close-out

- [ ] **C2.10.** `pnpm --filter @moneydiary/mobile test` green.
- [ ] **C2.11.** Open PR #5 targeting Slices B3 and C1's branches/PRs — dependency diagram with 📍 on this PR, prior dependencies = PR #3 (B3, capabilities) and PR #4 (C1, transport). PR description MUST include the pasted §11.4 checklist results (C2.7–C2.9) before requesting merge.

**Verified by:** RNTL specs + the mandatory manual device gate (C2.7–C2.9).
**Rollback:** revert PR; backend stays live and harmless (no button, endpoint reachable by direct call only).

---

## Slice D — Provisioning runbook + ADR-035 amendment (docs-only, order-independent after A2; MUST land before the manual activation gate)

**Spec coverage:** none directly (docs), supports rollout of AUTH-19–24/MOB-06/AC-10/AC-11. **Design refs:** §12 (migration/rollout runbook).
**Depends on:** Slice A2 merged (env var must exist to document).
**Independently shippable:** yes — docs only, cheap review.
**~Lines:** ~180 (excluded from the code-review budget per design §13).

- [ ] **D1.** Write `apps/api/docs/google-login-mobile-runbook.md` covering, in order (design §12):
  1. Read the EAS keystore SHA-1 (`eas credentials -p android` → Keystore → SHA-1 Fingerprint).
  2. Google Cloud Console → same OAuth project as the web client → Credentials → Create OAuth client ID → Android → package name `cl.moneydiary.app` → the SHA-1 from step 1.
  3. (Optional, local dev only) repeat for the debug keystore (`keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`).
  4. Confirm the OAuth consent screen (already configured by the web change) grants `openid`, `email`, `profile`.
  5. Render → Environment → `GOOGLE_CLIENT_ID_ANDROID=<client id>` → restart.
  6. `eas.json` → target build profile's `env` → `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=<same client id>` (not a secret — no EAS Secret).
  7. Verify via `curl -H "x-api-key: …" https://api.moneydiary.cl/api/auth/capabilities` → `googleLoginMobileEnabled: true`.
  8. Build and install the internal APK; run the §11.4 checklist (cross-reference C2.7–C2.9).
  9. Kill switch: unset `GOOGLE_CLIENT_ID_ANDROID` in Render → restart. Endpoint 404s, button disappears on next capabilities fetch. No deploy, no data change, web/password login untouched.
- [ ] **D-ADR.** Append the one-line ADR-035 amendment (P3 above) to `docs/adr/ADR-035-login-google-mobile-token-exchange.md` §Decision point 4: record the deviation to an independent `googleLoginMobileEnabled` flag instead of the shared `googleLoginEnabled` ADR-035 originally prescribed, referencing design §8's rationale (the two gates are genuinely independent env configurations).
- [ ] **D2.** Review the runbook against design §12 line by line — no code changes, no test run required.
- [ ] **D3.** Open the docs PR — dependency diagram with 📍 on this PR, prior dependency = PR #2 (A2). Order-independent relative to B1/B2/B3/C1, but MUST merge before anyone runs the production activation runbook (i.e. before the manual activation gate in C2 is executed against production).

**Verified by:** reading it against design §12.
**Rollback:** revert PR; runbook removed, no runtime effect.

---

## Review Workload Forecast

| Slice | ~Changed lines (incl. tests) | Hot path? |
|---|---|---|
| A1 — Port + verifier | ~300 | Yes (`**/auth/**`) |
| A2 — Env + activation seam | ~270 | Yes (`**/auth/**`, `**/security/**`-adjacent env handling) |
| B1 — The endpoint | ~380 | Yes (`**/auth/**`) — new externally-reachable, attacker-controlled-input endpoint |
| B2 — DB-backed guarantees | ~230 | Yes (`**/auth/**`, tests only) |
| B3 — Capability discovery | ~160 | Yes (`**/auth/**`) |
| C1 — Mobile transport | ~320 | No (client-side, no new server trust boundary) |
| C2 — Mobile UI | ~290 | No (client-side rendering + orchestration) |
| D — Provisioning runbook (excluded from code-review budget) | ~180 | No (docs only) |
| **Total (code, excl. D)** | **~1,950 max / ~1,700 min** | — |

- **Estimated changed lines:** ~1,700–1,950 across the 7 chained code slices (per design §13's revised forecast; the gap from the proposal's original 900–1,300 is spec verbosity and docstring density, established repo conventions, not scope creep). Slice D (~180 lines, docs-only) is excluded from the code-review budget.
- **Chained PRs recommended:** **Yes.**
- **400-line budget risk:** **High** for any coarser split than the 7-slice design §13 breakdown; B1 (~380) is the tightest individual slice against the 400-line ceiling.
- **Decision needed before apply:** **Yes** — `delivery_strategy` is `ask-on-risk`, and `chain_strategy` (stacked-to-main vs feature-branch-chain) is not yet cached for this session. The orchestrator must ask before Slice A1's PR is opened. Every backend slice (A1/A2/B1/B2/B3) touches `**/auth/**` → full 4R fan-out review recommended per PR; `judgment-day` recommended after B1 specifically (new live, network-reachable, attacker-controlled-JWT-accepting endpoint) in addition to after design.

---

## Dependencies between slices & what each PR targets

```
A1 ──▶ A2 ──▶ B1 ──┬──▶ B2  (independent, CI-only, blocks nothing)
                    ├──▶ B3 ──▶ C2
                    │
A2 ─────────────────────────▶ D  (order-independent after A2, must land before the manual activation gate)

B1 ──▶ C1 ──▶ C2

📍 marks the current PR in each PR's own description (chained-pr skill requirement).
```

- **A1** has no dependency on this change's other slices; it is inert on its own (nothing constructs the adapter).
- **A2** depends on A1's port/adapter to build the composition graph around.
- **B1** depends on A2's activation seam (`container.googleAuthMobile`) to route into.
- **B2** depends on B1's endpoint existing; independent of B3; blocks nothing downstream.
- **B3** depends on B1's endpoint (the flag must equal actual reachability); independent of B2; **C2 requires B3 merged.**
- **C1** depends on B1's endpoint (the transport calls it); independent of B2/B3.
- **C2** depends on **both** B3 (capabilities flag) and C1 (transport) merged; also carries the hard manual device gate (C2.7–C2.9) before merge.
- **D** depends only on A2 (the env var must exist to document); order-independent relative to B1/B2/B3/C1, but must land before anyone runs the production activation runbook.

**Stacked-to-main implications:** each PR merges to `main` independently and in order (A1→A2→B1→{B2,B3}→C1→C2, D any time after A2); fastest iteration. B1 briefly exists on `main` as a live, reachable endpoint before B3/C2 ship any client-visible affordance — harmless, since it 404s until `GOOGLE_CLIENT_ID_ANDROID` is set in the target environment (never set until the runbook, Slice D, is executed).

**Feature-branch-chain implications:** a draft/no-merge tracker PR accumulates A1→C2 (+D); only the tracker merges to `main`. Review latency compounds (later PRs wait on earlier ones against the tracker, not `main`), and mid-chain rollback of a single slice requires retargeting children. Given the auth hot-path sensitivity and that B1 introduces a genuinely live, externally-reachable, attacker-controlled-JWT-accepting endpoint, feature-branch-chain is the safer default recommendation — presented to the user per `ask-on-risk`, not decided here.

---

## Prerequisites / out-of-band items (recap)

1. `google-auth-library` release-age check against `.npmrc` quarantine (P1) — blocks A1's install step.
2. Mobile deps release-age / SDK-pin check via `npx expo install` (P2) — blocks C1's install step.
3. ADR-035 §Decision point 4 amendment (P3) — one-line deviation note, delivered in Slice D (D-ADR), user-approved.
4. Manual device gate (P4) — hard pre-merge requirement for Slice C2 (C2.7–C2.9); not automatable in CI/Expo Go/jest-expo/Maestro (Google actively blocks automated consent).
5. Actual production activation (P5) — Google Cloud Console client creation, Render/EAS env configuration — is explicitly out of scope of `sdd-apply`; Slice D delivers the runbook only, execution is a manual post-merge gate (design §12).
