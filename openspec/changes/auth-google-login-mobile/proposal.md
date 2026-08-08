# Proposal — auth-google-login-mobile: "Ingresar con Google" on Android

Bring the **"Ingresar con Google"** login method — already shipped on web by the `auth-google-login` change — to `apps/mobile`, using the mechanism decided in **ADR-035**: `expo-auth-session` obtains a Google `id_token` **on the device**, and a new `POST /api/auth/google/token` endpoint verifies that token server-side and returns **the same `LoginResponseDto`** (`{ token, userId, expiresAt }`) that password login already returns.

**This change adds a second way to obtain the existing mobile Bearer session. It adds no registration, no new session model, and changes nothing about the web flow.**

The identity policy is reused **unmodified**: `LoginConGoogleUseCase` and `IIdentidadGoogleRepository` are shared with web. Only a second *verifier* implementation is added.

## Quick path (what this change delivers)

1. **New application port method** for verifying a client-supplied `id_token` (`verificarIdToken(idToken) → Result<IdentidadExterna, …>`), because the web port `IVerificadorIdentidadExterna.verificar(ParametrosCallback)` requires `state`/`nonce`/`codeVerifier`/`urlCallback` that mobile does not have.
2. **New infrastructure adapter** on `google-auth-library` (`OAuth2Client.verifyIdToken`) — verifies signature, `iss`, `exp` and `aud` against an **array** of accepted native client IDs.
3. **New endpoint `POST /api/auth/google/token`** on the session-public router (x-api-key required, session not required), mirroring `POST /api/auth/login` in shape, logging and response body, and using the same per-IP rate-limiting pattern.
4. **Independent activation gate**: new env var(s) for the native client ID, all-or-none in `config/env.ts`, wired by an activation-by-presence factory. Absent → the endpoint 404s. **Independent of the web `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` gate.**
5. **Capability discovery for mobile**: `GET /api/auth/capabilities` reports the mobile activation state; the mobile Google button renders only when that flag is true.
6. **Mobile UI**: a Google button on the existing login screen (`LoginScreen.tsx` / `app/login.tsx`), reusing `signIn(token)` + SecureStore exactly as password login does.
7. **Provisioning runbook**: step-by-step Google Cloud Console + Render + EAS instructions, so activation is a documented manual gate rather than tribal knowledge.

## Why now / intent

| Driver | Detail |
|--------|--------|
| **Feature parity is half-delivered** | MOB-05 already specifies mobile Google sign-in as a *committed* requirement, deliberately mechanism-agnostic. Web shipped; mobile is the open half of a product decision already made. |
| **Password friction is worse on a phone** | Typing a password on a mobile keyboard is the highest-friction login path in the product. Google is the credential the user's device already holds. |
| **The hard parts already exist** | Session model, Bearer transport + SecureStore, find-only identity policy, demo exclusion, anti-enumeration copy, rate limiter, activation-by-presence composition, capability endpoint. This change adds one verifier and one route. |
| **The blocking analysis is done** | ADR-035 already rejected M2 (server-terminated redirect + deep link) and embedded WebView on security grounds. There is no mechanism debate left — only implementation. |

## Product decisions — locked (do NOT reopen in `spec` or `design`)

| # | Question | Locked answer |
|---|----------|---------------|
| 1 | **Which platforms?** | **Android only.** Real distribution today is an EAS Android APK (ADR-022). The backend verifies `aud` against an **array** of accepted client IDs, so adding the iOS client ID later is configuration, not redesign. **iOS is an explicit non-goal of this change.** |
| 2 | **How does the button appear/disappear?** | Rendered **only** when `GET /api/auth/capabilities` reports the **mobile** flag active. The mobile gate (native client ID present) is **independent** of the web gate (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`); either can be on without the other. **Deviation from ADR-035 point 4:** ADR-035 prescribes a single shared `googleLoginEnabled` flag as "one source of truth of activation for both clients." This change instead adds a second, independent boolean (`googleLoginMobileEnabled`, design §8/D7) because the two gates are genuinely independent env configurations — a shared flag would be dishonest when only one of the two is configured, and AC-10 requires the reported state to match the actual activation state. A one-line amendment to ADR-035 should ride the implementation PR. |
| 3 | **Login or also registration?** | **Sign-in only** (ADR-034, unchanged). A Google email with no matching user ⇒ the **same generic credentials error** as password login. Never create a user. Never reveal account existence. **No re-linking** of a different `googleSub` (rule ★). Demo accounts excluded (AUTH-14). |
| 4 | **Who provisions Google Cloud?** | A **step-by-step runbook is in scope of this change** (same shape as the web activation runbook). **Actual activation** — creating the Android OAuth client, setting env on Render and EAS — is a **manual post-merge gate**, not a code task. |
| 5 | **Accepted security tradeoff** | **No server-side `nonce`** (ADR-035 §5): replay is bounded only by `exp` (~1h). Strictly weaker than the web flow; accepted, documented, not diluted. Mechanism is **M1 native `id_token` verification** via `POST /api/auth/google/token` (x-api-key protected), responding the same `LoginResponseDto` as `/auth/login`. |

### Still needs user review (non-blocking for `spec`/`design`)

| Item | Assumption made | Status |
|------|-----------------|--------|
| **Capabilities field name** | The capabilities response gains a **second, mobile-specific boolean**; `googleLoginEnabled` keeps its current web-only meaning so the shipped web client is unaffected. | **Resolved.** User approved the assumption; design locked the field name `googleLoginMobileEnabled` (design §8/D7) and specs pin the four activation states. |
| **Error copy on mobile** | One generic Spanish message reused for every Google failure (no account, unverified email, cancelled consent, invalid token), matching `MENSAJE_ERROR_GENERICO` in `LoginScreen.tsx`. | Carried forward as an accepted, non-blocking assumption (design §14 item 3): distinguishing "you cancelled" is a one-branch change if wanted later, not requested for this change. |
| **Button placement** | Below the password submit button, visually secondary. | **Resolved.** User approved the assumption; design locked the placement in §9.2 and it is encoded as MUST in AC-10 and MOB-06. |

## In scope

### Backend — `apps/api` (Spanish domain/application, English infrastructure)

**Application (`src/application/`)**
- New verification port for a client-supplied `id_token`. `IdentidadExterna` (`{ sub, email, emailVerificado }`) is already verifier-agnostic and needs **zero** changes.
- **`LoginConGoogleUseCase` is reused verbatim — no edits.** Find-only policy, `email_verified` gate, demo exclusion and rule ★ are inherited *by construction*, not re-implemented.

**Infrastructure (`src/infrastructure/`)**
- **New dependency `google-auth-library`**, isolated in a single adapter (`OAuth2Client.verifyIdToken({ idToken, audience: [...] })` — handles JWKS fetch/cache, `iss`, signature, `exp`). Google tokens are **verified and discarded** — never persisted, never logged (AUTH-18).
- **New route `POST /api/auth/google/token`** in `http-express/routes/`, mounted on the same session-public router as `/auth/login` (x-api-key applies globally under `/api`; the session middleware does not). Same 200 body, same 401 generic message, same per-IP rate limiter pattern (`IpRateLimiter`), same scrubbed logging (path + outcome only).
- **`GET /api/auth/capabilities`** gains the mobile activation flag. Note: `authCapabilitiesResponseSchema` is **not** `.strict()` — the coupling that must move together is the route handler's return-type annotation plus the `openapi:check` CI gate, not schema strictness.
- **Env (`config/env.ts`, ADR-029):** new optional native client ID var(s) with their own all-or-none `superRefine`, independent of the web pair. `.env.example` is regenerated from the schema (`pnpm api env:example`, checked in CI).
- **Composition (`composition/`):** a `crear-*` factory mirroring `crear-auth-google.ts` (returns `undefined` when the native client ID is absent), plus an **activation-consistency assertion** mirroring `assert-google-auth-activation-consistency.ts` — so capabilities can never report `true` while the route 404s.

**No Prisma migration.** `User.googleSub` already exists from the web change. **This change has zero schema delta.**

### Mobile — `apps/mobile` (Expo)

- **New dependency `expo-auth-session`** (OS browser via Custom Tabs — never an embedded WebView, per ADR-035).
- **Native Android client ID** read from an `EXPO_PUBLIC_*` var, following the `src/api/config.ts` pattern. `app.json` already declares `scheme: "moneydiary"`.
- **New client function** in `src/api/client.ts` mirroring `postLogin` exactly (same headers, same `LoginResponseDto` parsing, same typed failure tags).
- **Google button** in `LoginScreen.tsx` (presentational) + orchestration in `app/login.tsx`, gated on the capabilities flag. On success: `signIn(token)` → SecureStore → resumen, identical to password login. On any failure: the existing generic error, **no token written**.

### Documentation

- **Provisioning runbook** (`apps/api/docs/` or `docs/`): create the Android OAuth client in Google Cloud Console (package name + SHA-1 fingerprint per EAS profile), set the API env var on Render, set the EAS build env var, verify via capabilities + a real device sign-in, and the kill-switch procedure.

### Tests (Strict TDD is active — tests first)

| Layer | Coverage |
|-------|----------|
| **Unit — `pnpm api test`** | Adapter with a stubbed verifier: valid token → `IdentidadExterna`; wrong `aud` / wrong `iss` / expired / bad signature → generic failure. Audience array with one and with several entries. |
| **Unit** | Env schema: native client ID present → enabled; absent → disabled; partial config → boot fails. Independence from the web pair (each of the four on/off combinations). |
| **Unit** | Composition factory returns `undefined` when unconfigured; activation-consistency assertion throws on drift. |
| **Unit** | Capabilities schema: mobile flag parsed; unknown-key strictness N/A (schema is not `.strict()` — see design §8). |
| **Integration — `pnpm api test:integration`** | Endpoint 404s when unconfigured; happy path issues a real `Session` row with the standard 7-day TTL; unknown identity → 401 generic, **no user created**; unverified email → 401, **no link**; demo account → 401; rate limiting. All with a **double of the verification port** — no live Google (ADR-034 consequence). |
| **Mobile — `pnpm --filter @moneydiary/mobile test`** | Button hidden when the capability flag is false; success persists the token and flips the gate; cancelled/failed sign-in shows the generic error and writes nothing. |
| **Manual (post-merge gate)** | Real sign-in on a physical Android device from an EAS build. **Not automatable in CI.** |

## Non-goals (explicit)

- **iOS.** No iOS client ID, no iOS-specific code, no iOS testing in this change.
- **Registration / signup via Google.** No user is ever created.
- **Changing the web flow** — cookie, `redirect_uri`, `/login` button, `openid-client` adapter: all untouched.
- **Any other provider** (Apple, GitHub, Microsoft).
- **Link-management UI, unlink, "primary method" selection.**
- **Persisting Google `access_token`/`refresh_token`**, or calling any Google API beyond OIDC identity.
- **Deprecating or changing email + password login on mobile.**
- **Changing the session model**: no sliding refresh, no TTL change, no JWT.
- **Server-side `nonce`** or any other hardening beyond ADR-035's accepted posture.
- **Actually activating the feature in production** (Google Cloud client creation, Render/EAS env). Documented, deliberately manual.

## Approach (high level — full design is the next phase)

- **On device:** `expo-auth-session` runs PKCE against Google in the OS browser with the native Android client ID, and returns a signed `id_token`. No client secret is ever embedded.
- **On the wire:** the app `POST`s the `id_token` to `/api/auth/google/token` with `x-api-key` — the same header it already sends on every call, which is precisely why M1 works and M2 does not.
- **On the server:** the adapter verifies signature/`iss`/`exp`/`aud`-in-array against Google's JWKS → returns `IdentidadExterna` through the port → **the untouched `LoginConGoogleUseCase`** resolves the user (find-only) → the standard session issuance path returns `{ token, userId, expiresAt }`.
- **Activation is structural, not conditional logic:** the route is registered only when the container exposes the mobile verifier. No `if (enabled)` inside handlers, no dead path in dev/test/CI, which all keep working with zero Google configuration.
- **Audience as an array from day one** — extensibility at literally zero cost (today: one Android entry). This is the sanctioned YAGNI exception: a list instead of a scalar, not an iOS feature built on speculation.
- **Kill switch without a deploy:** unset the native client ID in Render → the endpoint 404s and the mobile button disappears on the next capabilities fetch. Password login and the entire web flow are unaffected.

## Data model & rollback plan (required by `openspec/config.yaml`)

| Aspect | Detail |
|--------|--------|
| **Migration** | **None.** `User.googleSub` already exists (web change). Zero schema delta, zero backfill, zero data rewrite. |
| **Forward risk** | Confined to one new endpoint. No existing endpoint changes behavior. No existing use case is modified. The only shared artifact touched is the capabilities response, which is **additive**. |
| **Rollback — instant** | Unset the native client ID env var in Render → endpoint 404s, button hides. No deploy, no data change. |
| **Rollback — code** | Revert the PRs. Mobile falls back to password-only; web is untouched because no web file is modified. |
| **Rollback — data** | Nothing to roll back. Sessions created via Google are indistinguishable from password sessions and remain valid or expire normally. |
| **ADR-013 interaction** | Any email from Google goes through the existing encrypt + HMAC blind-index pipeline; never compared in cleartext, never logged. `id_token` is never persisted or logged. |

## Security posture (what `spec` must pin down)

| Control | Requirement |
|---------|-------------|
| **Token authenticity** | `id_token` MUST be verified against Google's JWKS: signature, `iss`, `exp`, and `aud` ∈ the configured client-ID array. A token failing any check yields the generic 401. |
| **Audience confusion** | An `id_token` minted for a **different** OAuth client MUST be rejected. This is the single highest-severity control of the change — it is what stops any third-party app's Google token from becoming a MoneyDiary session. |
| **Unverified email takeover** | First-time linking MUST require `email_verified === true` (inherited from AUTH-14). |
| **Account enumeration** | One generic error for "no account", "unverified email", "demo user", "invalid token". No copy or status-code difference. |
| **Abuse** | Per-IP rate limit on the new endpoint, mirroring the existing limiter pattern. |
| **Replay** | **Accepted gap** (ADR-035 §5): no server-issued `nonce`; the window is bounded by `exp` (~1h). MUST be recorded in the spec as an accepted limitation, not silently omitted. |
| **Logging (ADR-033/013)** | Never log the `id_token`, the email, `googleSub`, or the session token. Path + outcome only, matching existing auth handlers. |
| **Fail-closed** | The endpoint stays under `/api`, so `x-api-key` applies. No exemption is introduced anywhere. |

## Review Workload Forecast

| Metric | Estimate |
|--------|----------|
| **Estimated changed lines (incl. tests)** | ~~~900–1,300~~ **Superseded — revised to ~1,700–1,950 across 7 slices (see design §13).** The gap is spec verbosity and docstring density, established conventions in this repo, not scope creep. |
| **Hot paths touched** | **`**/auth/**` — yes** (new externally reachable endpoint that trusts a client-supplied JWT), plus `**/security/**`-adjacent env handling |
| **400-line budget risk** | **High** |
| **Chained PRs recommended** | **Yes** |
| **Decision needed before apply** | **Yes** (delivery strategy is `ask-on-risk`) |
| **Review lens** | Full **4R fan-out** (risk / resilience / readability / reliability). Recommend `judgment-day` after `design` and after the backend slices. |

## First slice / delivery boundary

Suggested split — `sdd-tasks` confirms or adjusts. **Superseded by design §13**, which splits this into 8 slices — 7 chained (A1, A2, B1, B2, B3, C1, C2) plus D, order-independent — after finding A and B each exceeded the 400-line review budget; see design §13 for the authoritative slice boundaries and line estimates.

| Slice | Content | ~Lines | Independently shippable? |
|-------|---------|--------|--------------------------|
| **A — verifier + activation** | Port method, `google-auth-library` adapter, env schema + `.env.example`, composition factory + activation-consistency assertion, unit tests. **No HTTP surface.** | ~400 | Yes — inert until routed. |
| **B — endpoint + capabilities** | `POST /api/auth/google/token`, rate limiting, capabilities mobile flag, OpenAPI document, integration tests. | ~350 | Yes — mobile still shows no button. |
| **C — mobile UI** | `expo-auth-session`, native client ID config, client function, gated Google button, RNTL tests. | ~350 | Yes — completes the feature. |
| **D — provisioning runbook** | Google Cloud Console + Render + EAS steps, verification checklist, kill switch. Docs only. | ~150 | Yes — cheap review, can ship any time after A. |

(Superseded — old 4-slice model; see design §13 for the current chain A1 → A2 → B1 → C1 → C2 (C2 also requires B3), with B2/B3 branching off B1 in parallel and D order-independent after A2 but landing before the manual activation gate.)

> **`.npmrc` gotcha:** `minimum-release-age=10080` (7-day quarantine). Confirm the target releases of **`google-auth-library`** (Slice A1) and **`expo-auth-session`** (Slice C1) are older than 7 days, or the install is refused.

## Risks & open design questions (hand-off to `sdd-design`)

| # | Item | Question for design |
|---|------|---------------------|
| 1 | **Which client ID actually lands in `aud`** | With `expo-auth-session` on Android, the `id_token`'s `aud` is **not always** the Android client ID — several documented flows return a token audienced to the **Web** client ID. Design MUST pin the exact `expo-auth-session` configuration and the resulting `aud`, and the runbook MUST say which client ID to register where. The audience array absorbs the answer, but the answer must be known, not guessed. **Highest-risk item.** |
| 2 | **`expo-auth-session` API surface** | Generic `useAuthRequest` against Google's discovery document vs the `expo-auth-session/providers/google` helper. Which one reliably yields an `id_token` on Android with a native client ID, on Expo SDK 57? |
| 3 | **Android client registration is fingerprint-bound** | An Android OAuth client is keyed by package name **+ SHA-1 signing fingerprint**. Debug builds, EAS `development`, and EAS `production` may sign with different keystores. Design must state how many client IDs the runbook creates and how the audience array reflects that. |
| 4 | **Capabilities contract shape** | `authCapabilitiesResponseSchema` is consumed by a live web client and the OpenAPI document (it is not `.strict()` — see design §8's correction; the real coupling is the route's type annotation plus `openapi:check`). Confirm the additive-field approach and the exact field name; verify the web client tolerates the new key. |
| 5 | **Port shape** | New method on `IVerificadorIdentidadExterna` vs a separate interface. Two implementations exist (web callback, mobile token) with genuinely different inputs — decide which keeps `LoginConGoogleUseCase` untouched with the least ceremony. |
| 6 | **Rate limiting the new endpoint** | Reuse `IpRateLimiter` with which window/threshold? Verification is a JWKS-cached signature check, so the cost profile differs from password login. Decide explicitly rather than copying the login limiter by reflex. |
| 7 | **Testability without a device** | Real Google sign-in is unreachable from Expo Go, jest-expo, and CI. Define exactly which guarantees are proven by unit/integration tests with a port double, and which are deferred to the documented manual device check. |
| 8 | **Integration-test reachability** | `test:integration` needs the local disposable Postgres (`apps/api/docs/local-test-db.md`) and is **not in CI**. Confirm which of the security scenarios above genuinely need the DB. |
| 9 | **JWKS network dependency at request time** | `verifyIdToken` fetches and caches Google's JWKS. Define the behavior on a JWKS fetch failure (generic 401 vs 503) and confirm it never leaks a Google-side error to the client. |
| 10 | **Capabilities fetch timing on mobile** | The login screen needs the flag before rendering. Decide the fetch point and the fallback when the call fails — defaulting to **hidden** (fail-closed) is the recommendation. |

## Next step

Run **`sdd-spec`** and **`sdd-design`** in parallel against this proposal.
`spec` owns the security-posture table plus the new requirement IDs (next free: `AUTH-19+`, `MOB-06+`, `AC-11`) in Given/When/Then with RFC 2119 keywords.
`design` owns risks 1–10, with risk 1 blocking `apply`.
