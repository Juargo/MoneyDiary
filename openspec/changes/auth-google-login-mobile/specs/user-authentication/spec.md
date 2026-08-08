# Delta for User Authentication

Adds the mobile Google sign-in mechanism (ADR-035, M1 native `id_token` verification) as a second, independent way to reach the same session-issuance path web Google login already uses. `LoginConGoogleUseCase` and `IIdentidadGoogleRepository` (AUTH-14) are reused unmodified.

## Security posture (this change)

| Control | Requirement | Note |
|---|---|---|
| Token authenticity | AUTH-19 | signature, `iss`, `exp`, `aud` ∈ configured array |
| Audience confusion | AUTH-19 | highest-severity control — rejects tokens minted for another client |
| Unverified email takeover | AUTH-20 | delegates to AUTH-14's `email_verified` gate, unmodified |
| Anti-enumeration | AUTH-21 | one generic 401 for every failure cause |
| Independent activation | AUTH-22 | mobile gate never coupled to the web pair |
| Replay (accepted gap) | AUTH-23 | no server-side `nonce`; bounded by `exp` (~1h), ADR-035 §5 |
| Abuse | AUTH-24 | per-IP rate limit, same pattern as AUTH-08/AUTH-11 |
| Logging / persistence | inherited AUTH-18 | `id_token` never persisted or logged — no new requirement needed |

## MODIFIED Requirements

### Requirement: AUTH-16 — Google login is active only when both Google credentials are configured

`GET /api/auth/google` and `GET /api/auth/google/callback` MUST exist and be reachable only when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured. When one or both are absent, both endpoints MUST return 404 (not registered) rather than 500 or a feature-disabled error body. The web client MUST NOT render its "Continue with Google" entry point when this gate is not active. The mobile token endpoint has its own, independent activation gate, defined by AUTH-22: this web gate MUST NOT influence mobile activation, and the mobile gate MUST NOT influence this one.
(Previously: implied a single activation gate shared by web and mobile clients.)

#### Scenario: Missing credentials disable both web endpoints

- GIVEN neither `GOOGLE_CLIENT_ID` nor `GOOGLE_CLIENT_SECRET` is configured
- WHEN a client requests `GET /api/auth/google` or `GET /api/auth/google/callback`
- THEN the response status is 404 for both

#### Scenario: Configured credentials enable both web endpoints

- GIVEN both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured
- WHEN a client requests `GET /api/auth/google` as a top-level navigation
- THEN the endpoint behaves per AUTH-11 (redirect to Google), not 404

#### Scenario: Web hides the entry point when inactive

- GIVEN Google login is not active on web (missing credentials)
- WHEN a user loads `/login`
- THEN no "Continue with Google" entry point is rendered

## ADDED Requirements

### Requirement: AUTH-19 — Mobile token endpoint verifies id_token authenticity and audience before identity resolution

`POST /api/auth/google/token` MUST verify a client-supplied `id_token` against Google's JWKS before any identity resolution: signature, `iss`, `exp`, and `aud` MUST match one entry in the configured array of accepted native client IDs. A token failing any check MUST NOT reach identity resolution (AUTH-14) and MUST yield the generic failure defined by AUTH-21.

#### Scenario: Valid token from a registered client proceeds

- GIVEN a validly-signed, unexpired id_token whose `aud` matches a configured client ID
- WHEN `POST /api/auth/google/token` is called with that token
- THEN the request proceeds to identity resolution (AUTH-14) and session issuance (AUTH-20)

#### Scenario: Token issued for a different OAuth client is rejected

- GIVEN a validly-signed id_token whose `aud` matches no configured client ID
- WHEN `POST /api/auth/google/token` is called with that token
- THEN no identity resolution is attempted
- AND the response is the generic failure defined by AUTH-21

#### Scenario: Expired or tampered token is rejected

- GIVEN an id_token that is expired, or whose signature does not verify
- WHEN `POST /api/auth/google/token` is called with that token
- THEN no identity resolution is attempted and the response is the generic failure defined by AUTH-21

### Requirement: AUTH-20 — Mobile token endpoint issues a Bearer session through the unmodified find-only identity resolution

On successful verification (AUTH-19), `POST /api/auth/google/token` MUST resolve identity through the exact find-only path defined by AUTH-14 — zero modification to demo exclusion, rule ★ (no re-linking), or the `email_verified` gate. On a match, it MUST issue a session via the same path as password login (AUTH-01/AUTH-06) and respond with the same `LoginResponseDto` body as `POST /api/auth/login`.

#### Scenario: Existing user receives a session identical in shape to password login

- GIVEN a verified id_token whose identity resolves to an existing, non-demo user per AUTH-14
- WHEN `POST /api/auth/google/token` completes
- THEN a `Session` row is created with the standard 7-day TTL
- AND the response body matches `LoginResponseDto`, identical in shape to `POST /api/auth/login`

#### Scenario: No user is ever created by this endpoint

- GIVEN a verified id_token whose identity matches no existing user
- WHEN `POST /api/auth/google/token` completes
- THEN no user row is created and the response is the generic failure defined by AUTH-21

### Requirement: AUTH-21 — Mobile token endpoint failures are indistinguishable (anti-enumeration parity)

Every failure path of `POST /api/auth/google/token` — invalid/expired/wrong-audience token (AUTH-19), unverified email, no matching account, a demo-user match, an email already linked to a different `googleSub` (AUTH-14 rule ★) — MUST produce the same externally observable outcome: HTTP 401 with the identical generic body already used by `POST /api/auth/login` (AUTH-02).

#### Scenario: Different failure causes are indistinguishable

- GIVEN three calls that fail for different reasons — wrong audience, unverified email matching a real account, no matching account
- WHEN each reaches its failure point
- THEN all three responses are 401 with the same generic body

#### Scenario: JWKS fetch or network failure during verification is indistinguishable from an invalid token

- GIVEN the JWKS fetch, or any other network call required by id_token verification, fails or times out
- WHEN `POST /api/auth/google/token` is called
- THEN the response is 401 with the identical generic body used for an invalid/expired/wrong-audience token
- AND the response MUST NOT be 503 or any other status or body that lets a caller distinguish an infrastructure failure from an invalid token (anti-enumeration / no oracle, design §5.3)

### Requirement: AUTH-22 — Mobile token endpoint activation is independent from the web Google login gate

`POST /api/auth/google/token` MUST exist and be reachable only when its own configured native client ID(s) are present, following the same activation-by-presence pattern as AUTH-16, evaluated independently: it MUST NOT depend on `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, and the web endpoints MUST NOT depend on the mobile configuration. Absent mobile configuration MUST yield 404.

#### Scenario: Mobile gate absent, web gate present

- GIVEN the web pair is configured and the mobile native client ID is absent
- WHEN a client requests `POST /api/auth/google/token`
- THEN the response status is 404, and `GET /api/auth/google` remains reachable per AUTH-16

#### Scenario: Mobile gate present, web gate absent

- GIVEN the mobile native client ID is configured and the web pair is absent
- WHEN a client requests `POST /api/auth/google/token`
- THEN the request reaches the handler (subject to AUTH-19), and `GET /api/auth/google` returns 404

### Requirement: AUTH-23 — Mobile token endpoint accepts a documented replay window instead of a server-side nonce

Unlike the web callback (AUTH-12), `POST /api/auth/google/token` MUST NOT require or validate a server-issued nonce. This is an accepted, documented tradeoff (ADR-035 §5): a captured, still-valid id_token could be replayed until its `exp` elapses (~1 hour). This gap MUST NOT be widened by relaxing any other AUTH-19 check.

#### Scenario: A verified token within its exp window is accepted without a nonce

- GIVEN a validly-signed, non-expired id_token with a correct audience
- WHEN `POST /api/auth/google/token` is called
- THEN the request proceeds to identity resolution without any nonce check

### Requirement: AUTH-24 — Mobile token endpoint attempts are rate-limited per IP

`POST /api/auth/google/token` MUST throttle repeated attempts per IP, mirroring the per-IP pattern and distinct-429 behavior already applied to `POST /api/auth/login` (AUTH-08) and `GET /api/auth/google` (AUTH-11). The threshold and window are fixed constants (30 attempts / 15 min) per design §6.4 — no environment variable controls them.

#### Scenario: Excessive attempts are throttled

- GIVEN the fixed per-IP threshold for `POST /api/auth/google/token` (30 attempts / 15 min, design §6.4) has been exceeded within the window
- WHEN another request is made from that IP
- THEN the response is a throttling response distinct from the generic 401 (e.g. 429)
