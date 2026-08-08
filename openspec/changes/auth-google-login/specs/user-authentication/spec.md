# Delta for User Authentication

Adds **"Sign in with Google"** as a second, alternative way to authenticate into an **existing** MoneyDiary account. It reuses the exact session model defined by AUTH-01/AUTH-05/AUTH-06 (opaque token, SHA-256 hash, 7-day absolute TTL, cookie or Bearer transport) — Google only verifies identity, it never creates a session by a different mechanism.

**Baseline caveat:** `AUTH-01/02/05/06` are genuine baseline anchors, defined in the **unarchived** change `openspec/changes/auth-login-session/specs/user-authentication/spec.md` (no `user-authentication` spec exists yet in the archived `openspec/specs/`) and verified against live code this session — see design.md's "Baseline caveat" note. `AUTH-11..18` are new requirement IDs minted by this change (below) that continue the same numbering; they describe a feature that does not exist in live code yet, so there is nothing to verify against — see the ADDED Requirements section.

**Purpose amendment:** the base Purpose statement lists OAuth as a non-goal of `auth-login-session`. This delta narrows that: **Google login for an existing user is now in scope**; registration via Google (or any other OAuth provider) remains out of scope (see Out of Scope below).

## ADDED Requirements

### Requirement: AUTH-11 — Google login initiation requires top-level navigation

`GET /api/auth/google` MUST enforce the same Sec-Fetch top-level-navigation guard used by `GET /api/auth/demo` (`esNavegacionDeNivelSuperior`), reused verbatim. A request that fails the guard MUST be rejected with 403 and MUST NOT redirect to Google. The endpoint MUST apply per-IP rate limiting on initiation, mirroring the existing login/demo rate limiters. On success, the system MUST generate `state`, a PKCE `code_verifier`/`code_challenge` (S256), and a `nonce`; persist them in a short-lived transient cookie; and respond with a 302 to Google's authorization endpoint.

#### Scenario: Top-level navigation redirects to Google

- GIVEN Google login is active (AUTH-16)
- WHEN a browser performs a top-level navigation to `GET /api/auth/google`
- THEN the response is a 302 redirect to Google's authorization endpoint
- AND a transient cookie carrying `state`/PKCE/`nonce` is set

#### Scenario: Non-top-level request is rejected

- GIVEN Google login is active
- WHEN a request to `GET /api/auth/google` is made in a context that is not a top-level navigation (e.g. embedded as an `<img>`/`<iframe>` sub-resource)
- THEN the response status is 403
- AND no redirect to Google occurs and no transient cookie is set

#### Scenario: Excessive initiate attempts are throttled

- GIVEN a configured per-IP threshold for `GET /api/auth/google` has been exceeded within the configured window
- WHEN another top-level navigation to `GET /api/auth/google` is made from that IP
- THEN the response is a throttling response distinct from the normal redirect (e.g. 429)

### Requirement: AUTH-12 — Google callback validates state, PKCE, and id_token before resolving identity

`GET /api/auth/google/callback` MUST validate the returned `state` against the transient cookie (single-use — the transient cookie MUST be invalidated once read, regardless of outcome), MUST validate the PKCE `code_verifier`, and MUST cryptographically validate the `id_token` (signature, `iss`, `aud`, `exp`, `nonce`) before any identity resolution is attempted. Any validation failure at this stage MUST redirect to `/login?error=...` using the same generic message defined by AUTH-15 — no failure copy or status code may distinguish "bad state" from "bad token" from "no matching account."

#### Scenario: Valid state, PKCE, and id_token proceed to identity resolution

- GIVEN a transient cookie set by a prior call to `GET /api/auth/google`
- WHEN `GET /api/auth/google/callback` is called with the matching `state` and a `code` that yields a validly-signed `id_token` for the registered `aud`
- THEN the request proceeds to identity resolution (AUTH-14)

#### Scenario: Missing or mismatched state is rejected before identity resolution

- GIVEN no transient cookie, or a transient cookie whose `state` does not match the callback's `state` query parameter
- WHEN `GET /api/auth/google/callback` is called
- THEN the request is rejected without calling the token endpoint and without creating a session
- AND the response redirects to `/login?error=...` with the generic message (AUTH-15)

#### Scenario: Tampered or expired id_token is rejected

- GIVEN a `state`/PKCE pair that validates correctly
- WHEN the resulting `id_token` fails signature, `iss`, `aud`, `exp`, or `nonce` validation
- THEN no session is created
- AND the response redirects to `/login?error=...` with the generic message (AUTH-15)

### Requirement: AUTH-13 — Google login issues the same session as password login

On successful identity resolution (AUTH-14), the system MUST issue a session through the identical session-creation path used by password login (AUTH-01): an opaque token, its SHA-256 hash persisted in the `Session` row, and the 7-day absolute TTL defined by AUTH-06. On the web transport, the callback MUST set the `md_session` cookie with attributes equivalent to the password-login cookie (HttpOnly, host-only, `Secure` in production) and MUST redirect (302) into the app. A session created via Google login MUST be indistinguishable, in the `Session` table and under `SessionGuard` (AUTH-05), from one created via password login.

#### Scenario: Successful Google login sets an equivalent session cookie

- GIVEN a Google identity that resolves to an existing user (AUTH-14)
- WHEN `GET /api/auth/google/callback` completes successfully
- THEN a `Session` row is created with a SHA-256 token hash and `expiresAt` at creation time + 7 days
- AND the response sets `md_session` with the same HttpOnly/host-only/`Secure` attributes as a password-login session
- AND the response is a 302 redirect into the app

#### Scenario: A Google-issued session validates identically to a password-issued session

- GIVEN a session created via Google login, not yet expired or revoked
- WHEN a client sends a protected request carrying that session's cookie
- THEN `SessionGuard` authorizes the request and resolves `userId` from that session, per AUTH-05, with no code path distinguishing how the session was created

### Requirement: AUTH-14 — Google identity resolution is find-only; no user is ever created

The system MUST resolve a validated Google identity (`sub`, `email`, `email_verified`) to an existing MoneyDiary user using the following order, and MUST NOT create a user at any point in this flow:

1. Look up a user by `googleSub === sub`. If found (and not a demo user), that user is the match.
2. Else, if `email_verified === true`, derive the blind index for `email` using the same pipeline password login and ADR-013 already use, and look up a user by `emailBlindIndex`. A Google email MUST NOT be compared in cleartext against the database at any point. If a match is found and it is not a demo user:
   - If that user's `googleSub` is already set to a value different from the incoming `sub`, the system MUST NOT overwrite it and MUST fail with the generic error defined by AUTH-15 (this is not the same case as step 1 — step 1 already failed to match, so a non-null `googleSub` found here belongs to a different, already-linked Google identity).
   - Otherwise (the user's `googleSub` is unset), the system MUST persist `googleSub` on that user (link) before issuing the session.
3. Else, if `email_verified` is not `true`, the system MUST NOT attempt an email-based lookup at all.
4. If no match is found by step 1 or step 2, the system MUST NOT create a user and MUST fail with the generic error defined by AUTH-15.

Users with `esDemo === true` MUST be excluded from both lookup and linking: a Google identity that would otherwise match a demo user's `googleSub` or linked email MUST be treated as no-match.

#### Scenario: Existing `googleSub` match logs in directly

- GIVEN a non-demo user with `googleSub` already set from a prior login
- WHEN that same Google identity (`sub`) completes the callback
- THEN the user is resolved by `googleSub` alone (no email lookup is performed)
- AND a session is issued for that user (AUTH-13)

#### Scenario: First-time login links by verified email

- GIVEN a non-demo user with `googleSub` unset and a known email
- WHEN a Google identity with `email_verified: true` and a matching email (via blind index) completes the callback
- THEN the system persists `googleSub` on that user
- AND a session is issued for that user (AUTH-13)

#### Scenario: Unverified email never triggers a lookup

- GIVEN a Google identity with `email_verified: false` and an email that matches an existing user
- WHEN that identity completes the callback
- THEN the system does not perform an email-based lookup
- AND the request fails with the generic error (AUTH-15) — no `googleSub` is persisted and no session is issued

#### Scenario: No match anywhere creates nothing

- GIVEN a Google identity whose `sub` matches no user and whose email (when `email_verified: true`) matches no user
- WHEN that identity completes the callback
- THEN no user row is created
- AND the request fails with the generic error (AUTH-15), indistinguishable in response shape from AUTH-02's unknown-email case

#### Scenario: Demo users are excluded from linking

- GIVEN a demo user (`esDemo === true`) whose email would otherwise match a Google identity with `email_verified: true`
- WHEN that identity completes the callback
- THEN the system treats it as no-match — the demo user is not looked up, linked, or authenticated
- AND the request fails with the generic error (AUTH-15)

#### Scenario: Email match already linked to a different Google identity is rejected, not re-linked

- GIVEN a non-demo user whose `googleSub` is already set, from a prior login, to a value belonging to a different Google identity
- WHEN a different Google identity (a different `sub`) with `email_verified: true` and a matching email (via blind index) completes the callback
- THEN the system does not overwrite the existing `googleSub`
- AND the request fails with the generic error (AUTH-15) — no re-link occurs and no session is issued

### Requirement: AUTH-15 — Google login failure never reveals the cause (anti-enumeration parity with AUTH-02)

Every failure path in the Google login flow — invalid or missing `state`, invalid PKCE, invalid `id_token`, unverified email, no matching user, a demo-user match, an email match already linked to a different Google identity, losing the linking race on a concurrent first-time link, or a user-cancelled/denied consent screen — MUST produce the same externally observable outcome: a redirect to `/login?error=...` carrying the identical generic message, with no query-parameter value, HTTP status, or timing signature that lets a client distinguish which of these causes occurred. This message MUST NOT reveal whether a given email is registered, consistent with AUTH-02.

#### Scenario: Different failure causes are indistinguishable

- GIVEN three separate Google login attempts that fail for different reasons — (a) invalid `state`, (b) unverified email matching a real account, (c) no account exists for the identity
- WHEN each attempt reaches its respective failure point
- THEN all three responses redirect to `/login` with the same `error` value and the same rendered message
- AND no response timing or status code differs in a way that discloses which case occurred

### Requirement: AUTH-16 — Google login is active only when both Google credentials are configured

`GET /api/auth/google` and `GET /api/auth/google/callback` MUST exist and be reachable only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured. When one or both are absent, both endpoints MUST return 404 (not registered) rather than 500 or a feature-disabled error body. Web and mobile clients MUST NOT render their "Continue with Google" entry point when the feature is not active.

#### Scenario: Missing credentials disable both endpoints

- GIVEN neither `GOOGLE_CLIENT_ID` nor `GOOGLE_CLIENT_SECRET` is configured
- WHEN a client requests `GET /api/auth/google` or `GET /api/auth/google/callback`
- THEN the response status is 404 for both

#### Scenario: Configured credentials enable both endpoints

- GIVEN both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured
- WHEN a client requests `GET /api/auth/google` as a top-level navigation
- THEN the endpoint behaves per AUTH-11 (redirect to Google), not 404

#### Scenario: Web hides the entry point when inactive

- GIVEN Google login is not active (missing credentials)
- WHEN a user loads `/login`
- THEN no "Continue with Google" entry point is rendered

### Requirement: AUTH-17 — Web presents Google sign-in as a top-level navigation link

The web login screen MUST render the "Continue with Google" entry point as a top-level `<a href="/api/auth/google">` element — never as a click handler that issues a `fetch`/`XMLHttpRequest` or programmatic `window.location` assignment. This preserves the true-browser-navigation requirement AUTH-11 depends on (Sec-Fetch header relay through the same-origin proxy). The web login screen MUST render the `?error=` query parameter, when present, using the same generic alert presentation already used for password-login failures (AUTH-02), without exposing which stage of the Google flow failed.

#### Scenario: Entry point is a real anchor, not a handler

- GIVEN Google login is active
- WHEN `/login` renders
- THEN the "Continue with Google" element is an anchor tag whose `href` is `/api/auth/google`
- AND activating it performs a normal browser navigation, not a script-issued request

#### Scenario: `?error=` renders the generic failure alert

- GIVEN the Google callback redirected to `/login?error=...` after any failure (AUTH-15)
- WHEN `/login` renders
- THEN the same generic alert component/style used for password-login failures is shown

### Requirement: AUTH-18 — Google tokens and flow secrets are never persisted or logged

The system MUST NOT persist Google's `access_token` or `refresh_token` anywhere (database, logs, cache) — no API call to Google beyond OIDC identity verification is made. The `id_token` MUST be validated and then discarded; only the resolved `sub`, the derived email blind index, and the `email_verified` boolean flow past identity resolution. None of the raw `id_token`, authorization `code`, `state`, `code_verifier`, plaintext email, or `googleSub` value MUST appear in application log output for the Google flow. Log entries MUST be limited to request path and outcome (success/failure), matching the logging discipline already applied to the password and demo login handlers (ADR-033).

#### Scenario: Google flow logs contain no token or secret material

- GIVEN a Google login attempt, successful or failed
- WHEN the resulting log lines are inspected
- THEN they contain only the request path and a success/failure outcome
- AND none contain the `id_token`, authorization `code`, `state`, `code_verifier`, plaintext email, or `googleSub` value

#### Scenario: No Google access or refresh token is ever stored

- GIVEN a completed Google login (successful or failed)
- WHEN the database is inspected
- THEN no row contains a Google `access_token` or `refresh_token`

## Out of Scope (restated from the proposal — not covered by this delta)

- **Registration/signup via Google or any other provider.** This delta never creates a user.
- **Any provider other than Google** (Apple, GitHub, Microsoft, etc.).
- **Link-management UI, unlink, or a "primary method" concept.** Password and Google remain independently always-valid; there is no UI to manage the link created by AUTH-14.
- **Persisting Google `access_token`/`refresh_token`, or calling any Google API beyond OIDC identity** (see AUTH-18).
- **Any change to password login, `SessionGuard`, or the session model itself** — no sliding refresh, no TTL change, no JWT.
- **Password reset, email verification, MFA, remember-me** — still deferred from `auth-login-session`.
- **Google login for demo accounts** (see AUTH-14's demo-exclusion scenario).
- **The exact mobile native-flow mechanism** (M1 vs M2) — pinned only at the observable-contract level by `mobile-session-auth` MOB-05; the mechanism itself is a design decision.
