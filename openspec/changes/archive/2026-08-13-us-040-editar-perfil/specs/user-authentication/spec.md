# Delta for User Authentication (US-040)

## MODIFIED Requirements

### Requirement: AUTH-09 — `GET /api/auth/me` reports the authenticated identity

With a valid session, `GET /api/auth/me` MUST return the authenticated user's minimal identity —
including `nombre` — but no password hash, no session token. Without a valid session, it MUST return
401.

(Previously: the identity payload did not include `nombre`.)

#### Scenario: Authenticated request returns identity including nombre

- GIVEN a valid session cookie
- WHEN a client sends `GET /api/auth/me`
- THEN the response status is 200
- AND the body contains the user's id/email/nombre but no credential or token material

#### Scenario: Unauthenticated request is rejected

- GIVEN no valid session cookie
- WHEN a client sends `GET /api/auth/me`
- THEN the response status is 401

#### Scenario: nombre reflects the most recent profile update

- GIVEN a user who changed their `nombre` via `PATCH /api/perfil` (see `perfil-usuario`)
- WHEN they subsequently send `GET /api/auth/me`
- THEN the returned `nombre` is the updated value
