# Delta for API Access Control

Extends the session-public marker pattern (AC-07) to the two new Google login endpoints and the new capability-discovery endpoint: they require the `x-api-key` layer like every other endpoint, but — like `login` and `demo` — they run before any session exists, so they MUST be exempt from `SessionGuard`.

**Baseline caveat:** this delta references baseline requirement IDs `AC-07` (login) and `AC-09` (this change's own Google endpoints requirement, below) as canonical anchors. `AC-07` currently lives in the **unarchived** change `openspec/changes/auth-login-session/specs/api-access-control/spec.md` — `openspec/specs/api-access-control/spec.md` (the archived baseline) only contains `AC-01`..`AC-05`. `AC-07` was verified against live code this session (see design.md's "Baseline caveat" note). Archiving `auth-login-session` (or reconstructing the base spec) is a prerequisite flagged for `sdd-verify`; if archival renumbers requirements, `AC-07` and the `AC-09`/`AC-10` numbering here may need to shift accordingly.

## ADDED Requirements

### Requirement: AC-09 — Google login endpoints are session-public, api-key required

`GET /api/auth/google` and `GET /api/auth/google/callback` MUST remain subject to `ApiKeyGuard` (require a valid `x-api-key`) but MUST be exempt from `SessionGuard` (no prior session required), using the same session-public marker as `login` and `demo` (AC-07). This holds regardless of whether the request arrives directly at the API or through the web's same-origin proxy (which injects `x-api-key` server-side, per the existing demo-flow precedent).

#### Scenario: Initiate is reachable with a valid api-key and no session

- GIVEN a top-level navigation with a valid `x-api-key` and no session cookie or Bearer token
- WHEN it requests `GET /api/auth/google`
- THEN the request reaches the Google-login handler and is not rejected by `SessionGuard`

#### Scenario: Initiate without an api-key is rejected

- GIVEN a request to `GET /api/auth/google` with no `x-api-key`
- WHEN the request is processed
- THEN the response status is 401 (rejected by `ApiKeyGuard`, unchanged behavior)

#### Scenario: Callback is reachable with a valid api-key and no session

- GIVEN Google's redirect lands on `GET /api/auth/google/callback` through the web's same-origin proxy (which injects `x-api-key` server-side) with no prior session
- WHEN the request is processed
- THEN the request reaches the Google-callback handler and is not rejected by `SessionGuard`

### Requirement: AC-10 — Capability discovery endpoint is session-public, api-key required, always mounted

`GET /api/auth/capabilities` (see design §4.5) MUST remain subject to `ApiKeyGuard` (require a valid `x-api-key`) but MUST be exempt from `SessionGuard` (no prior session required), using the same session-public marker as `login`, `demo`, and the Google login endpoints (AC-07, AC-09). Unlike `/api/auth/google` and `/api/auth/google/callback`, this route MUST be mounted unconditionally regardless of whether `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are configured — its purpose is precisely to let clients discover that activation state before rendering any Google-login affordance. The response body MUST be exactly `{ "googleLoginEnabled": boolean }`, where the value is `true` when both Google credentials are present (`container.googleAuth !== undefined`) and `false` otherwise.

#### Scenario: Capabilities is reachable with a valid api-key and no session

- GIVEN a request with a valid `x-api-key` and no session cookie or Bearer token
- WHEN it requests `GET /api/auth/capabilities`
- THEN the request reaches the capabilities handler and is not rejected by `SessionGuard`

#### Scenario: Capabilities without an api-key is rejected

- GIVEN a request to `GET /api/auth/capabilities` with no `x-api-key`
- WHEN the request is processed
- THEN the response status is 401 (rejected by `ApiKeyGuard`, unchanged behavior)

#### Scenario: Capabilities reports true when Google login is configured

- GIVEN `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both set at boot
- WHEN a client requests `GET /api/auth/capabilities` with a valid `x-api-key`
- THEN the response status is 200 with body `{ "googleLoginEnabled": true }`

#### Scenario: Capabilities reports false when Google login is not configured

- GIVEN `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both absent at boot
- WHEN a client requests `GET /api/auth/capabilities` with a valid `x-api-key`
- THEN the response status is 200 with body `{ "googleLoginEnabled": false }`, and `GET /api/auth/google` and `GET /api/auth/google/callback` both return 404 (AC-09 is unaffected — the endpoint is exempt from `SessionGuard`, not from the feature's activation gate)
