# Delta for API Access Control

Extends the session-public marker pattern (AC-07/AC-09) to the new `POST /api/auth/google/token` endpoint, and extends the capabilities response with a second, mobile-specific, independently-computed boolean. `googleLoginEnabled` keeps its current web-only meaning unchanged — this is purely additive; a live web client that only reads that field is unaffected.

## MODIFIED Requirements

### Requirement: AC-10 — Capability discovery endpoint is session-public, api-key required, always mounted

`GET /api/auth/capabilities` (see design §8, "D7 — The capabilities contract") MUST remain subject to `ApiKeyGuard` (require a valid `x-api-key`) but MUST be exempt from `SessionGuard` (no prior session required), using the same session-public marker as `login`, `demo`, and the Google login endpoints (AC-07, AC-09). It MUST be mounted unconditionally regardless of any Google configuration — its purpose is precisely to let clients discover activation state before rendering any Google-login affordance. The response body MUST be exactly `{ "googleLoginEnabled": boolean, "googleLoginMobileEnabled": boolean }`. `googleLoginEnabled` is `true` when both `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are present (unchanged). `googleLoginMobileEnabled` is `true` only when the mobile native client ID configuration required by `user-authentication` AUTH-22 is present. Each flag MUST be computed independently — any of the four true/false combinations MUST be possible — and `googleLoginMobileEnabled` MUST equal `true` if and only if `POST /api/auth/google/token` is reachable (not 404).
(Previously: response body was exactly `{ "googleLoginEnabled": boolean }`, a single web-only field.)

#### Scenario: Capabilities is reachable with a valid api-key and no session

- GIVEN a request with a valid `x-api-key` and no session cookie or Bearer token
- WHEN it requests `GET /api/auth/capabilities`
- THEN the request reaches the capabilities handler and is not rejected by `SessionGuard`

#### Scenario: Capabilities without an api-key is rejected

- GIVEN a request to `GET /api/auth/capabilities` with no `x-api-key`
- WHEN the request is processed
- THEN the response status is 401 (rejected by `ApiKeyGuard`, unchanged behavior)

#### Scenario: Capabilities reports true for web when Google login is configured

- GIVEN `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both set at boot
- WHEN a client requests `GET /api/auth/capabilities` with a valid `x-api-key`
- THEN the response includes `"googleLoginEnabled": true`

#### Scenario: Capabilities reports false for web when Google login is not configured

- GIVEN `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both absent at boot
- WHEN a client requests `GET /api/auth/capabilities` with a valid `x-api-key`
- THEN the response includes `"googleLoginEnabled": false`, and `GET /api/auth/google`/`GET /api/auth/google/callback` both return 404

#### Scenario: Capabilities reports true for mobile only when the mobile client ID is configured

- GIVEN the mobile native client ID configuration is present at boot
- WHEN a client requests `GET /api/auth/capabilities` with a valid `x-api-key`
- THEN the response includes `"googleLoginMobileEnabled": true`
- AND `POST /api/auth/google/token` is reachable (not 404)

#### Scenario: Web and mobile flags vary independently

- GIVEN `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are absent and the mobile native client ID is present
- WHEN a client requests `GET /api/auth/capabilities` with a valid `x-api-key`
- THEN the response includes `"googleLoginEnabled": false` and `"googleLoginMobileEnabled": true`
- AND `GET /api/auth/google` returns 404 while `POST /api/auth/google/token` is reachable

## ADDED Requirements

### Requirement: AC-11 — Mobile Google token endpoint is session-public, api-key required

`POST /api/auth/google/token` MUST remain subject to `ApiKeyGuard` (require a valid `x-api-key`) but MUST be exempt from `SessionGuard` (no prior session required), using the same session-public marker as `login`, `demo`, and the web Google endpoints (AC-07, AC-09). No exemption from `ApiKeyGuard` is introduced anywhere — the endpoint stays under `/api`.

#### Scenario: Reachable with a valid api-key and no session

- GIVEN a request with a valid `x-api-key` and no session cookie or Bearer token
- WHEN it requests `POST /api/auth/google/token`
- THEN the request reaches the handler and is not rejected by `SessionGuard`

#### Scenario: Rejected without an api-key

- GIVEN a request to `POST /api/auth/google/token` with no `x-api-key`
- WHEN the request is processed
- THEN the response status is 401 (rejected by `ApiKeyGuard`, unchanged behavior)
