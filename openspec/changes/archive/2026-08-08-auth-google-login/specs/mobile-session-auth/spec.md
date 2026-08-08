# Delta for Mobile Session Auth

Pins the **observable contract** for Google sign-in on mobile without fixing the native flow mechanism (M1 native token exchange vs. M2 server-terminated + deep link) — that choice belongs to `sdd-design` (see proposal risk #3). Whatever mechanism is chosen, its result MUST look like this to the rest of the mobile app.

**Baseline caveat:** `MOB-01/02` are genuine baseline anchors, defined in the **unarchived** change `openspec/changes/auth-login-session/specs/mobile-session-auth/spec.md` (no `mobile-session-auth` spec exists yet in the archived `openspec/specs/`) and verified against live code this session — see design.md's "Baseline caveat" note. `MOB-05` is a new requirement ID minted by this change (below) that continues the same numbering; it describes a feature that does not exist in live code yet, so there is nothing to verify against — see the ADDED Requirements section.

## ADDED Requirements

### Requirement: MOB-05 — Mobile Google sign-in issues a Bearer session, mechanism-agnostic

Completing Google sign-in on mobile, regardless of the native flow chosen at design time, MUST result in the same client-observable outcome as password login (MOB-01/MOB-02): a session token — issued through the identity-resolution path defined by `user-authentication` AUTH-14 and the session-issuance path defined by AUTH-13 — persisted in Expo SecureStore, and sent as `Authorization: Bearer <token>` on subsequent requests. Demo accounts remain excluded per AUTH-14 — mobile Google sign-in MUST NOT authenticate or create a session for a demo account. On any failure (no matching account, unverified email, cancelled/denied consent), the mobile app MUST show the same generic error used elsewhere in the Google flow (AUTH-15) and MUST NOT persist any token.

This requirement does not pin: the API surface used to complete the exchange, the deep-link or token-exchange mechanism, or the `aud` validation strategy for a mobile-issued `id_token`/code — those are design decisions.

#### Scenario: Successful Google sign-in stores a Bearer token like password login

- GIVEN a user completes Google sign-in on mobile and it resolves to an existing, non-demo user (AUTH-14)
- WHEN the flow completes
- THEN the mobile app stores a session token in Expo SecureStore
- AND subsequent requests carry `Authorization: Bearer <token>` alongside `x-api-key`, identically to a password-login session (MOB-02)

#### Scenario: Failed Google sign-in shows a generic error and stores nothing

- GIVEN a Google identity on mobile that resolves to no existing account (AUTH-14)
- WHEN the flow completes
- THEN the mobile app shows the same generic error used for other Google-flow failures
- AND no token is written to SecureStore

#### Scenario: Demo mode is not reachable via Google sign-in

- GIVEN a Google identity that would otherwise match a demo account
- WHEN the flow completes on mobile
- THEN no session is issued and no token is stored, per AUTH-14's demo-exclusion rule
