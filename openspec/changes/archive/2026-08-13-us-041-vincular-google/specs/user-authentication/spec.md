# Delta for User Authentication (US-041)

Adds a second, explicit entry point into Google linking — see `../vinculacion-google/spec.md` for the
full `VINC041-*` requirement family (link/unlink endpoints, the signed link-intent, the ★ rule, the
never-passwordless invariant). This delta only touches the three requirements that the explicit path
shares ownership of: the identity read (AUTH-09), the callback route (AUTH-12), and the scope of the
`email_verified` gate (AUTH-14).

## MODIFIED Requirements

### Requirement: AUTH-09 — `GET /api/auth/me` reports the authenticated identity

With a valid session, `GET /api/auth/me` MUST return the authenticated user's minimal identity —
including `nombre` and `googleVinculado` — but no password hash, no session token, and no raw
`googleSub`. Without a valid session, it MUST return 401.

(Previously: the identity payload did not include `googleVinculado`. See `vinculacion-google`
VINC041-08 for the full requirement on what this field means and how it is derived.)

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

#### Scenario: Identity payload includes the Google link state

- GIVEN a valid session
- WHEN a client sends `GET /api/auth/me`
- THEN the response body includes `googleVinculado`, reflecting whether the account currently has a
  linked Google identity, and never includes the raw `googleSub` value

### Requirement: AUTH-12 — Google callback validates state, PKCE, and id_token before resolving identity, and is dual-mode

`GET /api/auth/google/callback` MUST validate the returned `state` against the transient cookie
(single-use — the transient cookie MUST be invalidated once read, regardless of outcome), MUST
validate the PKCE `code_verifier`, and MUST cryptographically validate the `id_token` (signature,
`iss`, `aud`, `exp`, `nonce`) before any identity resolution is attempted. Any validation failure at
this stage MUST redirect to `/login?error=...` using the same generic message defined by AUTH-15 — no
failure copy or status code may distinguish "bad state" from "bad token" from "no matching account."

The same callback route is dual-mode: when the OAuth cookie carries a validly signed link marker (see
`vinculacion-google` VINC041-03), the request MUST be routed to the explicit link resolution instead of
the implicit login/link resolution defined by AUTH-14, and in that mode the callback MUST NOT issue a
new session — the caller's existing `md_session` was only ever withheld on the cross-site hop, not
revoked. When no link marker is present, the callback's behavior is unchanged from before this
requirement was modified: it always resolves through the implicit login/link path (AUTH-14) and always
issues a session on success (AUTH-13).

(Previously: the callback had exactly one mode — implicit login/link resolution followed by session
issuance on every success path. See `vinculacion-google` VINC041-03 for how the link marker's integrity
is established.)

#### Scenario: Valid state, PKCE, and id_token proceed to identity resolution

- GIVEN a transient cookie set by a prior call to `GET /api/auth/google`
- WHEN `GET /api/auth/google/callback` is called with the matching `state` and a `code` that yields a
  validly-signed `id_token` for the registered `aud`
- THEN the request proceeds to identity resolution (AUTH-14)

#### Scenario: Missing or mismatched state is rejected before identity resolution

- GIVEN no transient cookie, or a transient cookie whose `state` does not match the callback's `state`
  query parameter
- WHEN `GET /api/auth/google/callback` is called
- THEN the request is rejected without calling the token endpoint and without creating a session
- AND the response redirects to `/login?error=...` with the generic message (AUTH-15)

#### Scenario: Tampered or expired id_token is rejected

- GIVEN a `state`/PKCE pair that validates correctly
- WHEN the resulting `id_token` fails signature, `iss`, `aud`, `exp`, or `nonce` validation
- THEN no session is created
- AND the response redirects to `/login?error=...` with the generic message (AUTH-15)

#### Scenario: A validly signed link marker routes to explicit link resolution without issuing a session

- GIVEN a caller previously initiated linking (`vinculacion-google` VINC041-01) and the OAuth cookie
  carries a validly signed link marker for the current `state`
- WHEN `GET /api/auth/google/callback` completes an otherwise-valid OIDC exchange
- THEN the request resolves through the explicit link path, not the implicit login/link path
- AND no new `Session` row is created and no `md_session` cookie is set by the callback

#### Scenario: Absence of a link marker preserves the existing login-only behavior

- GIVEN the OAuth cookie carries no link marker
- WHEN `GET /api/auth/google/callback` completes an otherwise-valid OIDC exchange
- THEN the request resolves through the implicit login/link path (AUTH-14) exactly as before this
  requirement was modified
- AND a session is issued on success (AUTH-13)

### Requirement: AUTH-14 — Google identity resolution is find-only; no user is ever created

The system MUST resolve a validated Google identity (`sub`, `email`, `email_verified`) to an existing
MoneyDiary user using the following order, and MUST NOT create a user at any point in this flow. This
resolution order, and its `email_verified` gate, apply only to the **login** path — when the callback's
OAuth cookie carries no link marker (AUTH-12). The explicit link path (`vinculacion-google` VINC041-02)
binds by session-authenticated, password-re-verified `userId` instead, and never consults
`email_verified`; see `vinculacion-google`'s Non-Goals for why an email match is not required there.

1. Look up a user by `googleSub === sub`. If found (and not a demo user), that user is the match.
2. Else, if `email_verified === true`, derive the blind index for `email` using the same pipeline
   password login and ADR-013 already use, and look up a user by `emailBlindIndex`. A Google email MUST
   NOT be compared in cleartext against the database at any point. If a match is found and it is not a
   demo user:
   - If that user's `googleSub` is already set to a value different from the incoming `sub`, the system
     MUST NOT overwrite it and MUST fail with the generic error defined by AUTH-15 (this is not the
     same case as step 1 — step 1 already failed to match, so a non-null `googleSub` found here belongs
     to a different, already-linked Google identity).
   - Otherwise (the user's `googleSub` is unset), the system MUST persist `googleSub` on that user
     (link) before issuing the session.
3. Else, if `email_verified` is not `true`, the system MUST NOT attempt an email-based lookup at all.
4. If no match is found by step 1 or step 2, the system MUST NOT create a user and MUST fail with the
   generic error defined by AUTH-15.

Users with `esDemo === true` MUST be excluded from both lookup and linking: a Google identity that
would otherwise match a demo user's `googleSub` or linked email MUST be treated as no-match.

(Previously: this resolution order was the callback's only behavior, with no scope qualifier, because
no other resolution path existed. See `vinculacion-google` VINC041-02 through VINC041-05 for the
explicit path's own resolution order.)

#### Scenario: Existing `googleSub` match logs in directly

- GIVEN a non-demo user with `googleSub` already set from a prior login
- WHEN that same Google identity (`sub`) completes the callback with no link marker present
- THEN the user is resolved by `googleSub` alone (no email lookup is performed)
- AND a session is issued for that user (AUTH-13)

#### Scenario: First-time login links by verified email

- GIVEN a non-demo user with `googleSub` unset and a known email
- WHEN a Google identity with `email_verified: true` and a matching email (via blind index) completes
  the callback with no link marker present
- THEN the system persists `googleSub` on that user
- AND a session is issued for that user (AUTH-13)

#### Scenario: Unverified email never triggers a lookup

- GIVEN a Google identity with `email_verified: false` and an email that matches an existing user
- WHEN that identity completes the callback with no link marker present
- THEN the system does not perform an email-based lookup
- AND the request fails with the generic error (AUTH-15) — no `googleSub` is persisted and no session
  is issued

#### Scenario: No match anywhere creates nothing

- GIVEN a Google identity whose `sub` matches no user and whose email (when `email_verified: true`)
  matches no user
- WHEN that identity completes the callback with no link marker present
- THEN no user row is created
- AND the request fails with the generic error (AUTH-15), indistinguishable in response shape from
  AUTH-02's unknown-email case

#### Scenario: Demo users are excluded from linking

- GIVEN a demo user (`esDemo === true`) whose email would otherwise match a Google identity with
  `email_verified: true`
- WHEN that identity completes the callback with no link marker present
- THEN the system treats it as no-match — the demo user is not looked up, linked, or authenticated
- AND the request fails with the generic error (AUTH-15)

#### Scenario: Email match already linked to a different Google identity is rejected, not re-linked

- GIVEN a non-demo user whose `googleSub` is already set, from a prior login, to a value belonging to a
  different Google identity
- WHEN a different Google identity (a different `sub`) with `email_verified: true` and a matching email
  (via blind index) completes the callback with no link marker present
- THEN the system does not overwrite the existing `googleSub`
- AND the request fails with the generic error (AUTH-15) — no re-link occurs and no session is issued

#### Scenario: Login-path resolution is unreachable when a link marker is present

- GIVEN the OAuth cookie carries a validly signed link marker
- WHEN the callback completes
- THEN this login-path resolution order is not executed at all — the explicit link path
  (`vinculacion-google` VINC041-02) runs instead
