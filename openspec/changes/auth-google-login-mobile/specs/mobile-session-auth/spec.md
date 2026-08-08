# Delta for Mobile Session Auth

Fulfills the mechanism-agnostic parent requirement MOB-05 with a concrete mechanism (ADR-035 M1): the mobile login screen gains a Google sign-in button whose visibility is gated by the capabilities mobile flag, and whose success/failure behavior is exactly MOB-05's already-specified contract. MOB-05 is unmodified — this delta only pins the button's visibility and placement.

## ADDED Requirements

### Requirement: MOB-06 — Mobile Google button visibility is gated by the capabilities mobile flag

The mobile login screen MUST render the Google sign-in button only when ALL of the following hold: (a) `GET /api/auth/capabilities` reports the mobile activation flag (`api-access-control` AC-10, `googleLoginMobileEnabled`) as `true`; (b) the build has `GOOGLE_CLIENT_ID_ANDROID` configured; (c) the native auth request is initialized and ready. The capabilities flag alone is necessary but not sufficient — it MUST render it as a secondary control positioned below the password submit button, only once all three conditions hold. If any one condition is not met, the button MUST remain hidden with no error shown (fail-closed, design §9.3). Any failure of the underlying sign-in flow (no matching account, unverified email, cancelled/denied consent, invalid token) MUST surface the same generic error already defined by MOB-05, with no distinction by cause.

#### Scenario: Button hidden when the mobile flag is false

- GIVEN `GET /api/auth/capabilities` reports the mobile flag as `false`
- WHEN the mobile login screen renders
- THEN no Google sign-in button is shown

#### Scenario: Button hidden when the mobile flag is true but the build has no Android client ID configured

- GIVEN `GET /api/auth/capabilities` reports the mobile flag as `true`
- AND the build does not have `GOOGLE_CLIENT_ID_ANDROID` configured
- WHEN the mobile login screen renders
- THEN no Google sign-in button is shown and no error is displayed

#### Scenario: Button hidden when the mobile flag is true and the client ID is configured, but the auth request is not yet ready

- GIVEN `GET /api/auth/capabilities` reports the mobile flag as `true`
- AND the build has `GOOGLE_CLIENT_ID_ANDROID` configured
- AND the native auth request has not finished initializing
- WHEN the mobile login screen renders
- THEN no Google sign-in button is shown and no error is displayed

#### Scenario: Button shown as a secondary control when all three conditions hold

- GIVEN `GET /api/auth/capabilities` reports the mobile flag as `true`
- AND the build has `GOOGLE_CLIENT_ID_ANDROID` configured
- AND the native auth request is initialized and ready
- WHEN the mobile login screen renders
- THEN the Google sign-in button is shown below the password submit button, styled as a secondary action

#### Scenario: Every failure cause shows the same generic error

- GIVEN a Google sign-in attempt that fails for any reason (invalid token, unverified email, no matching account, cancelled consent)
- WHEN the flow completes
- THEN the mobile app shows the single generic error defined by MOB-05, with no cause-specific copy
- AND no token is written to SecureStore
