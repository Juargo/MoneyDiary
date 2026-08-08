# Delta for API Access Control

## ADDED Requirements

### Requirement: AC-06 — SessionGuard is layered after ApiKeyGuard, for either transport

(Previously: cookie-only. Revised: enforcement is transport-agnostic — see `user-authentication` AUTH-05 for the cookie-or-Bearer precedence rule.)

The system MUST register a second global guard, `SessionGuard`, running after `ApiKeyGuard`. Both guards MUST pass (AND semantics) for a request to reach a protected controller; `SessionGuard` does not replace `ApiKeyGuard`. This applies identically to web (cookie) and mobile (`Authorization: Bearer`) clients — `SessionGuard` enforcement is global across all data endpoints regardless of which transport carries the session token.

#### Scenario: Valid key but no session (either transport) is rejected

- GIVEN a request to a protected endpoint with a valid `x-api-key` but no session cookie and no `Authorization: Bearer` header
- WHEN the request is processed
- THEN the response status is 401

#### Scenario: Valid key and valid cookie session is authorized

- GIVEN a request to a protected endpoint with a valid `x-api-key` and a valid, unexpired, non-revoked session cookie
- WHEN the request is processed
- THEN the request is authorized by both guards

#### Scenario: Valid key and valid Bearer session is authorized

- GIVEN a request to a protected endpoint with a valid `x-api-key` and a valid, unexpired, non-revoked `Authorization: Bearer` token
- WHEN the request is processed
- THEN the request is authorized by both guards, identically to the cookie case

### Requirement: AC-07 — Login is reachable through the api-key layer without an existing session, for both clients

`POST /api/auth/login` MUST remain subject to `ApiKeyGuard` (requires a valid `x-api-key`) but MUST be exempt from `SessionGuard` (no prior session required), via a dedicated marker distinct from the general `@Public()` bypass. This holds for both web and mobile clients — login is api-key-only, session-free, on every platform.

#### Scenario: Login succeeds with a valid api-key and no session

- GIVEN a client (web or mobile) with a valid `x-api-key` and no session cookie or Bearer token
- WHEN it sends `POST /api/auth/login` with valid credentials
- THEN the request reaches the login handler and is not rejected by `SessionGuard`

#### Scenario: Login without an api-key is still rejected

- GIVEN a client with no `x-api-key`
- WHEN it sends `POST /api/auth/login`
- THEN the response status is 401 (rejected by `ApiKeyGuard`, unchanged behavior)

### Requirement: AC-08 — Health endpoint stays public to both guards

`GET /` MUST remain exempt from both `ApiKeyGuard` and `SessionGuard`.

#### Scenario: Health check succeeds with neither key nor session

- GIVEN a client with no `x-api-key` and no session cookie
- WHEN it sends `GET /`
- THEN the response status is 200
