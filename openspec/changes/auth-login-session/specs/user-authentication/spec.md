# User Authentication Specification

## Purpose

Defines per-user login, stateful session lifecycle, and logout for `apps/api`, `apps/web`, and (revision) `apps/mobile`. Sessions are the source of `userId` consumed elsewhere (see `user-data-isolation`). One session model, two transports: web uses an HttpOnly cookie; mobile uses `Authorization: Bearer` (see `mobile-session-auth` for mobile-specific client behavior). Login-only: register, password reset, email verification, OAuth, sliding sessions, remember-me, MFA, and lockout beyond basic rate-limiting are explicit non-goals of this change, for both clients.

## Requirements

### Requirement: AUTH-01 — Login success creates a session, sets a cookie, and returns the token for Bearer clients

(Previously: response body MUST NOT contain the raw token, at all — web-only. Revised for dual transport: mobile cannot rely on HttpOnly cookies, so the same login response also carries the token for Bearer storage.)

On valid credentials, the system MUST create a `Session` row and set an HttpOnly, SameSite=Strict, host-only cookie carrying the opaque token (`Secure` MUST be set in production, MAY be omitted on `http://localhost`). The response body MUST ALSO include the same raw token, so non-cookie clients (mobile) can persist it and send it as `Authorization: Bearer <token>`. The web client implementation MUST NOT read, store, or forward the body token — it MUST rely exclusively on the HttpOnly cookie for its own requests. Returning the token in the body is a deliberate, scoped XSS-surface tradeoff to enable mobile Bearer auth; it MUST NOT be treated as a general-purpose token-in-body pattern for web.

#### Scenario: Correct email and password (cookie set for every client)

- GIVEN a seeded user with a known email and password
- WHEN a client sends `POST /api/auth/login` with matching credentials and a valid `x-api-key`
- THEN the response status is 200 or 201
- AND the response sets a `Set-Cookie` header for the session cookie (HttpOnly; SameSite=Strict; no `Domain=`)
- AND the response body includes the raw session token

#### Scenario: Mobile client stores the body token for Bearer auth

- GIVEN a seeded user with a known email and password
- WHEN the mobile app sends `POST /api/auth/login` with matching credentials and a valid `x-api-key`
- THEN the mobile app reads the token from the response body and stores it in Expo SecureStore
- AND subsequent mobile requests carry `Authorization: Bearer <token>` instead of the cookie

#### Scenario: Web client never persists the body token

- GIVEN the web app receives a successful login response containing both `Set-Cookie` and a body token
- WHEN the web client code processes the response
- THEN it MUST NOT read, store in JS-accessible storage, or transmit the body token
- AND it relies solely on the HttpOnly cookie for subsequent authenticated requests

### Requirement: AUTH-02 — Login failure never reveals whether the email exists

Unknown email and wrong password for a known email MUST return the same status code and the same generic error body. The comparison path MUST NOT introduce a timing signal a client can trivially use to distinguish the two cases.

#### Scenario: Unknown email

- GIVEN no user exists with `nobody@example.com`
- WHEN a client sends `POST /api/auth/login` with that email and any password
- THEN the response status is 401
- AND the body contains a generic "invalid credentials" message with no indication the email is unknown

#### Scenario: Known email, wrong password

- GIVEN a seeded user with a known email
- WHEN a client sends `POST /api/auth/login` with that email and an incorrect password
- THEN the response status and body are identical in shape to the unknown-email scenario

### Requirement: AUTH-03 — Passwords are stored only as an argon2id hash

The system MUST hash passwords with argon2id before persistence and MUST NOT store, log, or return the plaintext password anywhere.

#### Scenario: Seeded credential is not plaintext

- GIVEN the seeded user row in the database
- WHEN the `passwordHash` column is inspected
- THEN it is an argon2id hash, not the plaintext password
- AND no application log line contains the plaintext password

### Requirement: AUTH-04 — Session tokens are stored only as a hash

The database MUST store only `SHA-256(token)` for each session, never the raw token.

#### Scenario: Session row does not contain the raw token

- GIVEN a session created by a successful login
- WHEN the `Session` row is inspected in the database
- THEN the stored value is a hash, not the raw cookie token

### Requirement: AUTH-05 — Session validation gates protected requests via cookie or Bearer token

(Previously: cookie-only. Revised for dual transport — mobile authenticates via `Authorization: Bearer`.)

`SessionGuard` MUST accept the session token from either the `md_session` cookie or an `Authorization: Bearer <token>` header, applying identical hashing, lookup, expiry, and revocation rules regardless of transport. A request carrying a valid, unexpired, non-revoked token via either transport MUST be authorized and MUST resolve `userId` from that session. A request with a missing, expired, revoked, or tampered (non-matching-hash) token — from either transport — MUST be rejected with 401. When both a cookie and a Bearer header are present on the same request, the cookie MUST take precedence (validated first); the Bearer header MUST be ignored in that case.

#### Scenario: Valid cookie session authorizes the request

- GIVEN a session created by a successful login, not yet expired or revoked
- WHEN a client sends a protected request with that session's cookie
- THEN the request is authorized and the resolved `userId` matches the session's owner

#### Scenario: Valid Bearer session authorizes the request

- GIVEN a session created by a successful login, not yet expired or revoked
- WHEN a client sends a protected request with `Authorization: Bearer <token>` and no session cookie
- THEN the request is authorized and the resolved `userId` matches the session's owner

#### Scenario: Missing token on both transports is rejected

- GIVEN no session cookie and no `Authorization: Bearer` header are sent
- WHEN a client sends a protected request (with a valid `x-api-key`)
- THEN the response status is 401

#### Scenario: Tampered token is rejected regardless of transport

- GIVEN a token value (cookie or Bearer) that does not match any stored session-token hash
- WHEN a client sends a protected request with that token
- THEN the response status is 401

#### Scenario: Cookie takes precedence when both are present

- GIVEN a request carries a valid session cookie AND a different/invalid `Authorization: Bearer` header
- WHEN the request is processed
- THEN `SessionGuard` validates using the cookie's token and authorizes the request
- AND the Bearer header is not consulted

### Requirement: AUTH-06 — Sessions expire after an absolute 7-day TTL

Each session MUST carry an `expiresAt` set to creation time + 7 days (absolute, no sliding renewal). A session past `expiresAt` MUST be treated as absent.

#### Scenario: Expired session is rejected

- GIVEN a session whose `expiresAt` is in the past
- WHEN a client sends a protected request with that session's cookie
- THEN the response status is 401
- AND the resolved identity is treated as if no session existed

### Requirement: AUTH-07 — Logout revokes only the current session

`POST /api/auth/logout` MUST revoke the session row identified by the request's cookie and MUST clear that cookie. Other active sessions belonging to the same user MUST remain valid (multi-session is allowed).

#### Scenario: Logout revokes the current session only

- GIVEN a user with two active sessions (session X and session Y) from two different logins
- WHEN the client holding session X calls `POST /api/auth/logout`
- THEN session X is revoked and its cookie is cleared
- AND session Y still authorizes protected requests

### Requirement: AUTH-08 — Login attempts are rate-limited

*(Pending design: exact thresholds, window, and storage mechanism are a design-phase decision — see proposal open questions.)* The system MUST throttle repeated failed login attempts per IP and per email within a configurable window, returning a distinct response once the threshold is exceeded. Successful authentication MUST NOT be throttled by this mechanism.

#### Scenario: Excessive failed attempts are throttled

- GIVEN a configured failure threshold for a given email or IP has been exceeded within the configured window
- WHEN another login attempt is made for that email or IP
- THEN the response is a throttling response distinct from the generic invalid-credentials response (e.g. 429)

#### Scenario: Legitimate login is unaffected

- GIVEN no threshold has been exceeded
- WHEN a client logs in with correct credentials
- THEN the login succeeds as in AUTH-01

### Requirement: AUTH-09 — `GET /api/auth/me` reports the authenticated identity

With a valid session, `GET /api/auth/me` MUST return the authenticated user's minimal identity (no password hash, no session token). Without a valid session, it MUST return 401.

#### Scenario: Authenticated request returns identity

- GIVEN a valid session cookie
- WHEN a client sends `GET /api/auth/me`
- THEN the response status is 200
- AND the body contains the user's id/email but no credential or token material

#### Scenario: Unauthenticated request is rejected

- GIVEN no valid session cookie
- WHEN a client sends `GET /api/auth/me`
- THEN the response status is 401

### Requirement: AUTH-10 — Web redirects unauthenticated visits to `/login`

The web app MUST redirect an unauthenticated visit to any protected route to `/login`, and MUST allow the user to reach the app after a successful login. The landing page's "Ingresar" button behavior is unchanged.

#### Scenario: Unauthenticated visit redirects

- GIVEN no valid session in the browser
- WHEN the user navigates to a protected route (e.g. the resumen screen)
- THEN the browser is redirected to `/login`

#### Scenario: Successful login reaches the app

- GIVEN the user is on `/login`
- WHEN they submit valid credentials
- THEN they are able to reach the previously protected route
