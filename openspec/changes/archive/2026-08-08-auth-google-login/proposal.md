# Proposal — auth-google-login: "Sign in with Google" as an alternative login (no registration)

Add **"Continuar con Google"** as a second way to *log in* to an **already existing** MoneyDiary account, on **web and mobile**. The mechanism is an **OIDC Authorization Code + PKCE flow terminated in `apps/api`** with `openid-client` v6, exactly as decided in **ADR-034**. Google is used **only as an identity verifier**: the session it produces is the same stateful `Session` row + opaque token the password login already issues (same 7-day absolute TTL, same `md_session` cookie on web, same `Authorization: Bearer` on mobile).

**This change adds a login method. It does not add registration, does not touch the password flow, and does not change the session model.**

## Quick path (what this change delivers)

1. **`User.googleSub String? @unique`** — one additive Prisma migration. The only schema change.
2. **Two new session-public endpoints** in `http-express`: `GET /api/auth/google` (initiate: Sec-Fetch top-level guard → `state` + PKCE + `nonce` → 302 to Google) and `GET /api/auth/google/callback` (validate → resolve identity → issue session → 302 back to the app).
3. **`LoginConGoogleUseCase`** in application, behind an OIDC-verification port; `openid-client` lives in an infrastructure adapter. Domain and application never import Google.
4. **Login-only identity policy**: lookup by `googleSub`; first-time link by `emailBlindIndex` **only if `email_verified === true`**; demo users excluded; **no user is ever created**.
5. **Activation by credential presence**: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are **optional** in the Zod env schema (ADR-029). Absent → the Google endpoints return 404 and both clients hide the button. Dev, test and CI keep working with zero Google configuration.
6. **Web**: a "Continuar con Google" button below the existing form in `/login`, implemented as a top-level `<a href>` (never a `fetch`), mirroring the landing's demo link.
7. **Mobile**: Expo also gains Google sign-in. The native flow shape is an **open design question** (two candidate options recorded below) — it is *in scope*, its mechanism is not yet decided.

## Why now / intent

- **Password friction is the last remaining login cost.** `auth-login-session` shipped real per-user identity, but the only credential is a password the user must remember. Google is the credential most users already carry, and ADR-034 explicitly reopened the OAuth non-goal that `auth-login-session` deferred.
- **The hard parts are already built.** Stateful sessions, dual transport (cookie + Bearer), the anti-enumeration policy, rate limiting, and — critically — the **OAuth-shaped redirect precedent** (`GET /api/auth/demo`: Sec-Fetch top-level guard + 302 + backend-set cookie, working in prod through the same-origin Vercel proxy). This change reuses all of it; it does not invent a second auth stack.
- **Login-only keeps the slice honest.** "Register with Google" is a *product* decision (onboarding, initial data, terms) that ADR-034 deliberately left for its own decision. Find-not-create is a one-line policy today and a documented upgrade path tomorrow.
- **Blast radius is genuinely small.** No existing endpoint changes behavior. No existing use case is modified. Password login, `sessionMiddleware`, and the four data routes are untouched.

## Proposal question round — resolved

These were settled with the user before writing this proposal. **Do not reopen them in `spec` or `design`.**

| # | Product question | Locked answer |
|---|------------------|---------------|
| 1 | Which clients? | **Web + mobile.** Web = button in `/login`. Mobile = Expo also gets Google sign-in (flow shape deferred to design). |
| 2 | Login or also registration? | **Login only.** No match → generic error, **no user created**. |
| 3 | How do existing accounts get linked? | Automatically on first Google login: `googleSub` lookup → fallback to `emailBlindIndex` **only when `email_verified === true`**. Demo users (`esDemo`) are excluded. |
| 4 | How is the feature turned on/off? | **By credential presence.** No boolean feature flag. Missing `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` → endpoints 404, clients hide the button. |
| 5 | What does a user with no account see? | Redirect back to `/login` with a **generic** error — no "this email isn't registered". Same anti-enumeration policy as password login. |
| 6 | Do password and Google coexist? | **Yes, both always valid.** No link-management UI, no unlink, no "primary method" concept (YAGNI). |

### Still needs user review (non-blocking for `spec`/`design`)

| Item | Assumption made | Why it may need a call |
|------|-----------------|------------------------|
| **ADR-034 amendment** | Mobile inclusion is an *extension* of ADR-034 §7 (which says web-only), so this change carries a **minor amendment** to ADR-034 rather than a new ADR. | If the user prefers ADR-035 for the mobile flow instead, say so before `design` — the mobile flow choice is substantial enough to justify one. |
| **Post-login landing** | Google login lands on `/` (dashboard), like password login and demo. | If Google login should honor the `?redirect=` param that `/login` already supports, that is an extra hop through `state`. |
| **Error copy** | One generic Spanish message reused for every Google failure (no account, denied consent, invalid state, expired flow). | Distinguishing "you cancelled" from "no account" is *safe* (it leaks nothing) and better UX; it just was not requested. |

## In scope

### Backend — `apps/api` (Clean Architecture; Spanish domain/application, English infrastructure)

**Domain (`src/domain/`)**
- New error(s) for the Google path (e.g. `identidad-google-no-vinculada.error.ts`, `identidad-google-invalida.error.ts`) — `Result`-based, **never thrown**, and generic enough at the HTTP boundary to avoid account enumeration.
- Reuse the existing `Email` VO and the ADR-013 blind-index pipeline for any email arriving from Google. **A Google email is never compared in cleartext against the DB.**

**Application (`src/application/`)**
- **Port `IVerificadorIdentidadExterna`** (name per ADR-034 §6): given the callback parameters, return a verified external identity (`sub`, `email`, `emailVerified`) or a failure. This is the seam that keeps `openid-client` out of application and makes the use case unit-testable with a double.
- **`LoginConGoogleUseCase`**: verify identity via the port → find user by `googleSub` → else, if `emailVerified`, find by `emailBlindIndex` and link (persist `googleSub`) → else fail generically. Demo users are rejected for linking. On success, issue a session through the **same** session-creation path the password login uses (token + SHA-256 hash + 7-day absolute `expiresAt`).
- Repository port extension for `findByGoogleSub` / `vincularGoogleSub` on the existing user-credentials repository.

**Infrastructure (`src/infrastructure/`)**
- **Prisma delta + migration:** `User.googleSub String? @unique`. Additive, nullable, no backfill.
- **`openid-client` v6 adapter** implementing the port: issuer discovery, S256 PKCE, `state`, `nonce`, and cryptographic `id_token` validation (signature, `iss`, `aud`, `exp`, `nonce`) via `authorizationCodeGrant()`. **Google tokens are validated and discarded — never persisted.**
- **Two routes in `http-express/routes/`** (new `auth-google.routes.ts`, mounted on the **session-public** router alongside login/logout/demo — api-key applies, session does not):
  - `GET /api/auth/google` — Sec-Fetch top-level guard (`esNavegacionDeNivelSuperior`, reused as-is), rate limiting per IP (reuse the existing limiter pattern), generate `state`/PKCE/`nonce`, persist them in a **short-lived HttpOnly transient cookie**, 302 to Google.
  - `GET /api/auth/google/callback` — validate the transient cookie against the query params, run the use case, clear the transient cookie, set `md_session`, 302 back into the app.
- **Env schema (`config/env.ts`, ADR-029):** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` as **optional** strings, with a `superRefine` rule making them **all-or-nothing** (both or neither). `.env.example` is regenerated from the schema (`pnpm api env:example`, already checked in CI).
- **Composition root (`composition/container.ts`):** the Google adapter + use case are wired **only when the credentials are present**; `app.ts` registers the two routes only when the container exposes them. This is what makes the endpoints 404 instead of 500 when unconfigured.

### Web — `apps/web`

- **"Continuar con Google" button** in `/login`, visually below the existing form, rendered as a **top-level `<a href="/api/auth/google">`** — not a `fetch`, not `window.location` inside a handler. Same pattern as the landing's demo link, which already proved the proxy path in prod.
- **Conditional rendering**: the button is hidden when Google login is not configured. *How the client learns that* is a design question (capability endpoint vs build-time env) — see risks.
- **Error surfacing**: `/login` reads the `?error=` search param the callback sets and renders the same generic alert style `LoginForm` already uses.
- The password form, `postLogin`, the `_authenticated` guard, and the **AUTH-01 invariant** (web JS never reads the session token) are **unchanged**.

### Mobile — `apps/mobile` (Expo)

Google sign-in is **in scope**; the native flow is **deferred to `sdd-design`**. Both candidates are recorded below with their tradeoffs, plus a hard constraint discovered while writing this proposal.

> **Hard constraint (verified):** `app.use('/api', createApiKeyMiddleware(env.API_KEY))` guards **all** of `/api`. The web survives a browser-initiated hit to `/api/auth/google` only because the same-origin Vercel proxy injects `x-api-key` server-side. **A mobile system-browser hitting `api.moneydiary.cl` directly has no `x-api-key` and would get a 401.** Any option that sends the *system browser* to our API must first solve this.

| Option | Shape | Pros | Cons |
|--------|-------|------|------|
| **M1 — native token exchange** | `expo-auth-session` runs the PKCE flow against Google with a native client ID and obtains an `id_token`/code; the app then calls a new `POST /api/auth/google/*` **with `x-api-key`**, which verifies via the same port and returns the session token for SecureStore. | No api-key problem (the app makes the API call). Standard, well-documented Expo pattern. No deep-link plumbing. Client secret never needed on device (public client + PKCE). | Adds a **second trust boundary**: a client-supplied `id_token` must be validated against the *mobile* `aud`. Needs extra Google client IDs (Android/iOS). Two entrypoints into the same identity resolution. |
| **M2 — server-terminated + deep link** | `expo-web-browser` opens `GET /api/auth/google?client=mobile`; the API runs the exact same server-side flow; the callback redirects to `moneydiary://auth/callback?code=<one-time>`; the app exchanges that one-time code (with `x-api-key`) for the session token. | **Single OIDC termination point** — one adapter, one `aud`, one code path for both clients. Client secret stays server-side. | **Blocked by the api-key constraint above** until the browser-facing hops are made api-key-exempt. Needs a deep-link scheme + EAS config + a short-lived one-time-code store (new state). More moving parts. |

Regardless of the option chosen, mobile reuses the existing `session-store.ts` (SecureStore) + `session-context.tsx` (`signIn(token)`) — the gate flips synchronously exactly as the password login already does.

### Tests (Strict TDD is active — tests first)

| Layer | Coverage |
|-------|----------|
| **Unit (`pnpm api test`)** | `LoginConGoogleUseCase` with a port double: existing `googleSub` → session; first-time link with `email_verified: true` → link + session; `email_verified: false` → generic failure, **no link**; unknown identity → generic failure, **no user created**; demo user → rejected. |
| **Unit** | Env schema: both credentials → enabled; neither → disabled; **exactly one → boot fails** (all-or-nothing). |
| **Unit** | Transient state/PKCE cookie: serialization, attributes, expiry, mismatch rejection. |
| **Integration (`pnpm api test:integration`)** | Endpoints 404 when unconfigured; initiate rejects non-top-level navigation (403); callback with bad/missing `state` rejected; happy path issues a real `Session` row with the standard TTL — all with a **double of the verification port** (no live Google, per ADR-034 consequences). |
| **Web (`pnpm web test`)** | Button renders as an anchor to `/api/auth/google` (not a button with a handler); hidden when disabled; `?error=` renders the generic alert. |
| **Mobile (`pnpm --filter @moneydiary/mobile test`)** | Per the option chosen at design time: sign-in entry point, token persisted to SecureStore, `signIn()` flips the gate, failure path stays on `/login`. |

## Non-goals (explicit)

- **Registration / signup via Google.** No user is ever created by this flow.
- **Any other provider** (Apple, GitHub, Microsoft).
- **Link-management UI, unlink, "primary method" selection.**
- **Persisting Google `access_token`/`refresh_token`**, or calling any Google API beyond OIDC identity.
- **Deprecating, weakening, or changing email + password login.**
- **Changing the session model**: no sliding refresh, no TTL change, no JWT.
- **Password reset, email verification, MFA, remember-me** — still deferred from `auth-login-session`.
- **Google login for demo accounts.**

## Approach (high level — full design is the next phase)

- **Initiate (`GET /api/auth/google`):** api-key already applied globally → Sec-Fetch guard rejects anything that is not a top-level navigation (403, same as demo) → per-IP rate limit → `openid-client` generates `code_verifier`/`code_challenge` (S256), `state`, `nonce` → all three are stored in one **transient HttpOnly cookie** (short TTL; there is no session yet to hang them on) → 302 to `accounts.google.com`.
- **Callback (`GET /api/auth/google/callback`):** read + immediately invalidate the transient cookie → `openid-client.authorizationCodeGrant()` validates the code, PKCE, and the `id_token` (signature/`iss`/`aud`/`exp`/`nonce`) → the adapter returns `{ sub, email, emailVerified }` through the port → `LoginConGoogleUseCase` resolves the user → on success set `md_session` and 302 into the app; on any failure 302 to `/login?error=...` with a generic message.
- **`redirect_uri` targets the app origin, not the API origin** (ADR-034 §2): `https://app.moneydiary.cl/api/auth/google/callback` traverses the same-origin proxy, so the **host-only** `md_session` cookie is set for the right host. Registered per environment in Google Cloud Console.
- **Identity resolution is find-only:** `googleSub` → else `emailBlindIndex` (gated on `email_verified`) → else fail. Linking writes `googleSub` once; from then on it is the primary key of the flow, so a later email change on either side does not break login.
- **Activation is structural, not conditional logic:** the routes are only registered when the container has the adapter. There is no `if (featureEnabled)` scattered through handlers, and no dead code path in dev/test.
- **Kill switch without a code deploy:** removing the two env vars in Render disables the feature (endpoints 404, clients hide the button) on the next restart.

## Data model & rollback plan (required by `openspec/config.yaml`)

| Aspect | Detail |
|--------|--------|
| **Migration** | Single additive `ALTER TABLE "User" ADD COLUMN "googleSub" TEXT` + unique index. Nullable, no backfill, no data rewrite, no lock of consequence at this table size. |
| **Forward risk** | None to existing rows: every current user gets `NULL`, which is exactly "not linked". `passwordHash` was already nullable, so nothing becomes inconsistent. |
| **Rollback — code** | Revert the PRs. The column becomes inert; nothing reads it. Password login is unaffected because it was never modified. |
| **Rollback — data** | `googleSub` is **derived, not authoritative**: it is re-obtainable from Google on the next login. Dropping the column loses no user-owned data. A follow-up drop migration is optional, not urgent. |
| **Rollback — instant** | Before touching code: unset `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in Render → endpoints 404, button hidden, password login untouched. |
| **ADR-013 interaction** | `googleSub` is an opaque IdP identifier, **not readable PII** → not encrypted, but **unique**. Any email from Google goes through the existing encrypt + HMAC blind-index pipeline; it is never logged and never compared in cleartext. |

## Security posture (what `spec` must pin down)

| Control | Requirement |
|---------|-------------|
| **CSRF on the OIDC flow** | `state` generated server-side, bound to the transient cookie, single-use, verified before anything else. |
| **Code interception** | PKCE S256 mandatory (public + confidential client alike). |
| **Token substitution** | `nonce` bound to the transient cookie and checked inside `id_token` validation. |
| **Forced flows** | Sec-Fetch top-level-navigation guard on the initiate endpoint (reused verbatim from demo). |
| **Account enumeration** | One generic error for "no account", "unverified email", and "demo user". No timing or copy difference. |
| **Brute force / abuse** | Per-IP rate limit on initiate, mirroring `LoginRateLimiter`/`DemoRateLimiter`. |
| **Unverified email takeover** | Linking **requires** `email_verified === true`. Without it, an attacker with a Google account claiming a victim's email could hijack the account — this is the single highest-severity control in the change. |
| **Logging (ADR-033/013)** | Never log `id_token`, `code`, `state`, `code_verifier`, the email, or `googleSub`. Path + outcome only, matching the existing auth handlers. |

## Review Workload Forecast

| Metric | Estimate |
|--------|----------|
| **Estimated changed lines (incl. tests)** | **~1,200–1,700** |
| **Hot paths touched** | **`**/auth/**` — yes** (new externally-reachable endpoints handling attacker-controlled input), plus `**/security/**`-adjacent env/secrets handling |
| **400-line budget risk** | **High** |
| **Chained PRs recommended** | **Yes** |
| **Decision needed before apply** | **Yes** (delivery strategy is `ask-on-risk`) |
| **Review lens** | Full **4R fan-out** (risk / resilience / readability / reliability) is triggered by the auth hot path. Recommend `judgment-day` after `design` and after the backend `apply` slices. |

## First slice / delivery boundary

Suggested split — `sdd-tasks` confirms or adjusts:

| Slice | Content | ~Lines | Independently shippable? |
|-------|---------|--------|--------------------------|
| **A — model + application core** | Prisma `googleSub` migration, domain errors, `IVerificadorIdentidadExterna` port, `LoginConGoogleUseCase`, repository extension, unit tests with a port double. **No HTTP surface, no new dependency.** | ~350 | Yes — inert until wired. |
| **B — OIDC adapter + endpoints + activation** | `openid-client` dependency, adapter, transient state cookie, the two routes, env schema + `.env.example`, conditional container wiring, integration tests. | ~500 | Yes — web still shows no button. |
| **C — web UI** | Button, capability-driven visibility, `?error=` handling, component tests. | ~150 | Yes — completes the web feature. |
| **D — mobile** | Per the option chosen in `design`: native flow, session persistence, gate integration, RNTL tests. | ~350 | Yes — completes the mobile feature. |

Slice A→B→C is a clean chain. **Slice D depends on the mobile design decision and may reasonably become its own change** if the chosen option requires new API surface (M1's token-exchange endpoint) or api-key exemptions (M2). Flag that at `tasks` time.

> **`.npmrc` gotcha:** `minimum-release-age=10080` (7-day quarantine). Confirm the target `openid-client` v6 release is older than 7 days before Slice B, or the install is refused.

## Risks & open design questions (hand-off to `sdd-design`)

| # | Item | Question for design |
|---|------|---------------------|
| 1 | **`SameSite=Strict` + cross-site redirect landing** | `md_session` is `SameSite=Strict`. The callback arrives via a **cross-site** redirect from Google, and browsers treat the whole redirect chain as cross-site — the freshly set Strict cookie may **not be sent on the immediate 302 to `/`**, landing the user on a logged-out screen that works after a refresh. The demo flow never hit this (it starts same-site). Design must decide: same-site intermediate hop, a `Lax` variant scoped to this flow, or an interstitial page. **Highest-risk item; must be resolved before `apply`.** |
| 2 | **Transient state cookie must be `SameSite=Lax`, not `Strict`** | For the same reason, the state/PKCE cookie set on initiate **will not be sent back** on the cross-site callback if it is `Strict`. `Lax` sends it on top-level GET navigations. Confirm attributes: `HttpOnly`, `Lax`, `Secure` (env-conditional, mirroring `cookieSecure`), host-only, short `Max-Age`, path-scoped. |
| 3 | **Mobile flow: M1 vs M2** | Decide, given the api-key constraint documented above. Includes: which Google client IDs are needed, `aud` validation strategy, deep-link scheme + EAS config (M2 only), and whether the one-time-code store is in-memory or persisted. |
| 4 | **Capability discovery for the clients** | How does the UI know Google login is enabled? A tiny public capability field (extend `GET /version` or a new `GET /api/auth/capabilities`) vs a build-time `VITE_*`/`EXPO_PUBLIC_*` flag. Build-time flags **drift** from server config; a capability endpoint costs a round trip. Mobile needs the same answer. |
| 5 | **Transient state storage: cookie vs server-side** | Cookie is stateless and matches the existing style; a server-side store gives true single-use `state` (a cookie can be replayed within its TTL if the response is captured). Pick one and justify. |
| 6 | **Proxy behavior on an external 302** | The Vercel proxy already relays Sec-Fetch and does not follow redirects (per the demo fix). Confirm it passes a 302 whose `Location` is **off-origin** (`accounts.google.com`) and relays the transient `Set-Cookie` on that same response. |
| 7 | **Rate limiting the callback** | Initiate is rate-limited by IP. Should the callback be too? It is reachable directly with forged params; `state` validation already rejects those cheaply, so this may be YAGNI — decide explicitly. |
| 8 | **Where `googleSub` linking lives** | Persisting `googleSub` during login is a write inside an authentication path. Confirm it belongs in `LoginConGoogleUseCase` (one use case, one transaction) rather than a separate `VincularIdentidadGoogleUseCase`, and define behavior under a concurrent-link race (unique-constraint violation). |
| 9 | **ADR-034 amendment** | Amend §7 (UI) and Consequences to cover mobile, or write ADR-035 for the mobile flow. Recommendation: amend for scope, and let `design` decide whether the mobile mechanism itself deserves its own ADR. |
| 10 | **Integration-test reachability** | Integration/e2e need a local Postgres (`apps/api/docs/local-test-db.md`) that still must be provisioned, and they are **not in CI**. Confirm which Google-flow guarantees can be proven by unit tests with a port double vs which genuinely require the DB. |

## Next step

Run **`sdd-spec`** and **`sdd-design`** (in parallel) against this proposal. `design` owns risks 1–8; `spec` owns the security-posture table and the identity-resolution scenarios in Given/When/Then with RFC 2119 keywords.
