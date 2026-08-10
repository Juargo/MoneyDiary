# demo-auth Specification

## Purpose

Allow anonymous visitors to instantly try MoneyDiary without email or password. A `GET /api/auth/demo` endpoint creates a demo user with full data chain, sets a session cookie, and redirects to the dashboard — all in one request.

## Requirements

### Requirement: DEMO-AUTH-01 — Anonymous Demo Creation

The system MUST expose a `GET /api/auth/demo` endpoint, annotated `@PublicSession()`, that creates a demo user, seeds data, sets a session cookie, and returns a `302` redirect to `/`.

#### Scenario: Visitor clicks "Probar demo"

- GIVEN an anonymous visitor at `moneydiary.cl` clicks "Probar demo"
- WHEN the browser navigates to `GET https://app.moneydiary.cl/api/auth/demo`
- THEN the system creates a User with `esDemo=true, email=null, passwordHash=null`
- AND creates one Account, one Ingesta (PROCESADA), and ~30 Transaccion records
- AND creates a Session with 7-day TTL
- AND sets `Set-Cookie: md_session=<token>; Path=/; HttpOnly; SameSite=Strict`
- AND responds with `302 Location: https://app.moneydiary.cl/`

#### Scenario: Rate limit exceeded

- GIVEN the same IP has attempted 3 demo creations in the last hour
- WHEN `GET /api/auth/demo` is called
- THEN the system responds with `429 Too Many Requests`
- AND returns a user-facing error message
- AND does NOT create any User, Account, Ingesta, or Session

### Requirement: DEMO-AUTH-02 — DemoRateLimiter

The system MUST enforce a per-IP rate limit on demo creation: 3 attempts per rolling hour. The limiter MUST use an in-memory Map (same pattern as `LoginRateLimiter`), IP-only (no email dimension).

#### Scenario: 4th attempt within window is blocked

- GIVEN IP `1.2.3.4` has made 3 demo creation requests in the last 60 minutes
- WHEN the 4th request arrives
- THEN `isBlocked('1.2.3.4')` returns `true`
- AND the endpoint returns 429

#### Scenario: Limiter resets after window

- GIVEN IP `1.2.3.4` was blocked 61 minutes ago
- WHEN `GET /api/auth/demo` is called
- THEN `isBlocked('1.2.3.4')` returns `false`
- AND the demo creation proceeds normally

### Requirement: DEMO-AUTH-03 — Reuse Valid Demo Session

The system MUST reuse an existing, non-expired demo session if the visitor already has a valid `md_session` cookie belonging to a demo user.

#### Scenario: Returning visitor with valid cookie

- GIVEN the visitor has a valid `md_session` cookie for a demo user
- WHEN they navigate to `GET /api/auth/demo`
- THEN the system does NOT create a new demo user
- AND the existing session is extended (or left untouched)
- AND responds with `302 Location: https://app.moneydiary.cl/`

### Requirement: DEMO-AUTH-04 — Expired Demo Session Creates New User

The system MUST create a new demo user and session if the existing session is expired or invalid.

#### Scenario: Stale cookie triggers fresh creation

- GIVEN the visitor has an expired `md_session` cookie
- WHEN they navigate to `GET /api/auth/demo`
- THEN the system treats them as anonymous
- AND creates a new demo user with fresh data and session
- AND sets a new `Set-Cookie` header
- AND responds with `302`

### Requirement: DEMO-AUTH-05 — fetchMe Returns Demo Status

The system MUST include `esDemo: boolean` in the `MeDto` response for all users. Demo users MUST have `esDemo: true` and `email: null`.

#### Scenario: Demo user me endpoint

- GIVEN a request to `GET /api/auth/me` with a valid demo session token
- WHEN `ObtenerIdentidadUseCase` executes
- THEN the response MUST be `{ userId: "...", email: null, esDemo: true }`

#### Scenario: Real user unaffected

- GIVEN a request to `GET /api/auth/me` with a valid real-user session token
- WHEN `ObtenerIdentidadUseCase` executes
- THEN the response MUST be `{ userId: "...", email: "user@example.com", esDemo: false }`

### Requirement: DEMO-AUTH-06 — Demo User Display Name

The system MUST assign demo users a generated display name in the format `Demo-{cuid-prefix}` so they are identifiable as demo users in the UI.

#### Scenario: Name generation

- GIVEN a demo user is being created
- WHEN `CrearDemoUseCase` executes
- THEN the User's `nombre` MUST match the pattern `Demo-{short-cuid}`
- AND this name MUST NOT collide with existing user names
