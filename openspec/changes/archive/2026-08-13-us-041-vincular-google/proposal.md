# Proposal: US-041 — Link and unlink Google from the profile — API + OIDC only

- **Change**: `us-041-vincular-google`
- **Issue**: [#275](https://github.com/Juargo/MoneyDiary/issues/275) · Milestone `Sprint-12`
- **Status**: Proposed (2026-08-13)
- **Builds on**: ADR-034 (web OIDC login, `googleSub`, the ★ no-re-link rule), US-040 / `perfil-usuario`
  (the `PATCH /api/perfil` family, `PerfilRechazadoError`, `PerfilDemoSoloLecturaError`,
  `aPerfilHttpError`), US-035 / ADR-013 (HKDF-derived keys from `ENCRYPTION_KEY`), US-038 / ADR-037
  (`{message, code}` bodies + demo gate) — all merged and deployed
- **Requires new ADR**: **No — ADR-034 gets an amendment.** See [§8](#8-adr-034-amendment-not-a-new-adr).
- **⚠️ Action items on issue #275**:
  1. **CA-01 is being hardened**: linking requires the **current password**
     ([binding decision 2](#binding-decisions)). Update the criterion.
  2. **CA-03 is being widened the same way**: unlinking also requires the current password
     ([decision 4](#binding-decisions)).
  3. The issue does not mention the demo gate; it ships ([decision 3](#binding-decisions)).

## Intent

Google is today an **implicit, invisible** side effect of logging in: the first time you sign in with
Google and your verified Google email happens to match your account, the backend writes `googleSub`
onto your row and never tells you. You cannot ask for that link, you cannot see it, and you can
**never** undo it — there is no write path that clears `googleSub` anywhere in the product.

After this change the API can:

- **Link on purpose** — an authenticated, password-re-verified user starts the existing OIDC flow
  from their profile, and the returned Google identity is bound to **their own** account, with no
  email matching involved (**CA-01**).
- **Refuse a stolen identity** — a `googleSub` already owned by another account is rejected with the
  same generic error as every other Google failure; nothing is ever re-linked (**CA-02**, the ★ rule).
- **Unlink safely** — `googleSub` is cleared **only if the account still has a password**, so no
  account is ever left with zero ways in (**CA-03**).
- **Report the state** — the identity read exposes whether Google is linked, so US-042 can render it
  (**CA-04**).
- **Store nothing from Google** — no `access_token`, no `refresh_token`, no `id_token`; and every
  operation targets the session's own user only (**CA-05**).

## Why now

1. **US-042 (issue #276) is blocked on this contract.** It owns the Configuración page and its Google
   section; it cannot render a link state, a link button or an unlink button against endpoints that
   do not exist.
2. **The implicit link is a one-way door today.** A user who signed in with Google once — perhaps by
   accident, perhaps with a Google account they later lose — has a permanent second access method to
   their financial data and no way to revoke it. That is an unreviewed security posture, not a
   feature.
3. **The dangerous version of this change is the obvious one.** Carrying "which account should this
   link go to?" through the OAuth round-trip in an unsigned cookie is a working implementation and an
   account-takeover primitive ([§1](#1-the-link-intent-must-be-unforgeable)). This is exactly the
   moment to decide the mechanism deliberately, once, with the reasoning written down.

## Binding decisions

Settled with the user before this proposal. Recorded as decisions, not options.

| # | Decision | Rationale |
|---|----------|-----------|
| **1** | The link-intent that travels through the OAuth round-trip is **HMAC-signed** | `md_session` is `SameSite=Strict`, so it is **not sent** on Google's cross-site redirect back to us — `req.userId` does not exist at the callback. Only `md_oauth` (`Lax`) survives, so the target account must travel there. Unsigned, that field is account takeover: an attacker sets a cookie naming the **victim's** `userId`, consents with their **own** Google account, and walks away with a permanent access method to the victim's account. Signed with the existing HMAC/HKDF pattern it needs no server-side state, no new table, no TTL to administer ([§1](#1-the-link-intent-must-be-unforgeable)) |
| **2** | **Linking requires the current password** | Linking adds a permanent access method. A compromised open session must not be able to install its own door. Same reasoning US-040 used to require the password for an email change; the account key is being extended, so the account key must be proven |
| **3** | **Demo sessions can neither link nor unlink** — `403 DEMO_SOLO_LECTURA` | Mirrors US-038/US-040. A demo has no email and no password; linking Google to it would silently turn a 7-day sandbox into a permanent account through an unreviewed identity path. `esDemo` is a **required** use-case input, so omitting the gate is a compile error |
| **4** | **Unlinking also requires the current password** (decided here, extends the issue) | CA-03 guarantees the user *has* a password, so requiring it costs nothing structurally, and it keeps one mental model for the Configuración page: *changes to how you get in always cost your password*. It also neutralises "attacker with a stolen session strips your Google link". Cheap, symmetric, and it falls out of the read the use case already needs — `buscarCredencialPorId` returns `null` **exactly when** the account has no password, which **is** CA-03's condition ([§3](#3-ca-03-one-conditional-write-owns-the-invariant)) |

## Scope

### In scope

**A. Link initiation** — `POST /api/perfil/google/vincular`, session-gated, demo-gated,
password-verified. Returns the Google authorization URL and sets `md_oauth` carrying the **signed**
link intent ([§2](#2-two-legs-one-callback)).

**B. Callback branching** — the **existing** `GET /api/auth/google/callback` becomes dual-purpose:
login (no link marker) or link (valid signed marker). One route, one registered redirect URI
([§2](#2-two-legs-one-callback)).

**C. Link resolution** — new `VincularGoogleUseCase`: idempotent for an identity already linked to
the caller, generic refusal for an identity owned by anyone else (★), generic refusal when the
caller's row already carries a *different* `googleSub` (switch = unlink first).

**D. Unlink** — `POST /api/perfil/google/desvincular`. New `DesvincularGoogleUseCase` + a **single
conditional write** that owns the CA-03 invariant at the database level
([§3](#3-ca-03-one-conditional-write-owns-the-invariant)).

**E. Link state on the identity read** — `GET /api/auth/me` (and therefore `PATCH /api/perfil`'s
response, which reuses the same schema) gains `googleVinculado: boolean`
([§4](#4-ca-04-the-link-state-rides-the-identity-read)). **This is a required field on a generated
contract type — see [§4](#4-ca-04-the-link-state-rides-the-identity-read) for the fixture fallout.**

**F. Key + signer** — a second HKDF-derived key (`oauth-link-intent-v1` info string) and a small
`link-intent` sign/verify module in `infrastructure/http/auth/`
([§1](#1-the-link-intent-must-be-unforgeable)).

**G. Contract regeneration** — `openapi-document.ts`, `apps/api/openapi.json`,
`packages/api-client` types. Both already CI drift-gated (ADR-011/012).

**H. Tests** — unit, route, repository, integration and the three binding security proofs
([§7](#7-tests)).

**I. ADR-034 amendment** ([§8](#8-adr-034-amendment-not-a-new-adr)).

### Non-goals (out of scope)

| Not doing | Why / owner |
|-----------|-------------|
| **Any `apps/web` or `apps/mobile` *source* change** — the Configuración page, the Google section, the link/unlink buttons, extending the `esMeDto` runtime guard | **US-042 (#276)**. CA-04 means the API *exposes* the state, not that anything renders it. The only client-side files this change touches are **test fixtures** typed as `MeDto`, which stop compiling when the DTO gains a required field ([§4](#4-ca-04-the-link-state-rides-the-identity-read)) |
| Google linking on **mobile** | ADR-035's native `id_token` flow is untouched. It has no `md_oauth`, no redirect round-trip, and therefore none of this change's mechanism. A mobile link flow is a separate decision |
| Any other identity provider | No second provider exists or is planned. A `googleSub` column and a Google-shaped flow is what ships (`yagni`) |
| **Registration** with Google (find-or-create) | ADR-034 §Consecuencias already names this as its own product decision. This change stays find-only |
| Switching Google accounts in one step | Rejected as a distinct operation: unlink then link. Two audited transitions instead of one compound one, no extra code |
| Requiring the Google email to match the account email at link time | Deliberately **not** required — see [§5](#5-why-the-link-path-does-not-check-email_verified) |
| A dedicated `GET /api/perfil` | US-040 already decided this: `/api/auth/me` is the single identity source |
| A migration | None needed. `googleSub String? @unique` and `passwordHash String?` already exist |
| Rate limiting the new password check | Same deferral US-040 recorded: the endpoints sit behind `x-api-key` + a valid session. Trigger: first sign of abuse ⇒ reuse `demoRateLimiter`'s shape. The **callback** keeps the existing shared `googleRateLimiter` |

## Approach

### 1. The link-intent must be unforgeable

**The constraint, stated precisely.** `md_session` is `SameSite=Strict` (`http/auth/cookie.ts`). The
callback is reached by a genuinely cross-site top-level navigation (`accounts.google.com` →
`api.moneydiary.cl`), and browsers withhold `Strict` cookies on cross-site requests — including
top-level navigations, where `Lax` would be sent. So **at the callback there is no session, by
construction**, even though the user was and still is logged in. The only cookie that survives the
round-trip is `md_oauth` (`Lax`, `Path=/api/auth/google`, 10 min, HttpOnly).

`md_oauth` is unsigned today, and its docstring justifies that: *"an attacker who can set a cookie on
the domain doesn't need to forge content — they can get a valid one by starting their own flow."*
**That reasoning dies the moment the payload names an account.** A forged
`md_oauth = {state, nonce, codeVerifier, link: {userId: <victim>}}` plus a consent screen completed
with the attacker's own Google account yields `vincularGoogleSub(victimId, attackerSub)` — a
permanent, password-free access method on someone else's financial data.

**Decision: HMAC-sign the link field, keyed by a second HKDF-derived key.**

```
mac = HMAC-SHA256(linkIntentKey, `${state}.${userId}`)
md_oauth payload = { state, nonce, codeVerifier, link?: { userId, mac } }
```

| Question | Decision | Why |
|---|---|---|
| **Key derivation** | `deriveLinkIntentKey(encryptionKey)` — HKDF-SHA256 over the same `ENCRYPTION_KEY`, **info string `'oauth-link-intent-v1'`**, 32 bytes. Added as a second named export **in `composition/derive-blind-index-key.ts`**, which already single-sources salt/hash/length | A **separate info string is mandatory** — never reuse the blind-index key for a second purpose. Keeping both derivations in one file is what stops salt/hash/length from drifting apart (that file's docstring exists precisely because a drifted derivation once broke login silently). No new env var, consistent with US-035. Renaming the file to `derive-keys.ts` is deferred: pure import churn in `seed.ts`/`backfill` for zero behaviour |
| **What is signed** | `state` **and** `userId`, joined | `state` is fresh 32-byte randomness per flow, so a signature cannot be lifted from one flow into another, nor paired with a different `state`. Signing `userId` alone would give an attacker a permanently replayable token for their own account — useless to them, but the property we want is *this intent belongs to exactly this flow* |
| **Why not sign the whole payload** | Not needed | `state` is already validated against the query parameter, and `codeVerifier` proves itself at Google's token endpoint. Only `userId` is a *claim about an account*, and only claims need integrity. Signing everything would also change the byte shape of the login-only cookie for zero gain — the login path stays untouched |
| **Comparison** | `crypto.timingSafeEqual` on equal-length buffers, with an explicit length check first | `timingSafeEqual` **throws** on length mismatch; the length check keeps the fail-closed posture instead of turning a forged cookie into a 500 |
| **Failure mode** | `link` present + MAC invalid ⇒ **reject the whole callback** with the standard generic redirect. Never fall through to login | Falling back would silently run the *implicit, email-matching* link path when the user asked for the *explicit* one — a different operation than the one requested, decided by an attacker-controllable byte. Rejecting also makes the attack a distinguishable log line (`.warn`, no PII). `link` **absent** ⇒ the ordinary login path, byte-identical to today |
| **Where the signer lives** | `infrastructure/http/auth/link-intent.ts` — plain functions taking the key, mirroring `oauth-transient-cookie.ts` | Cookie integrity is a **transport** concern. The application layer must not learn that a MAC exists; the use case receives a `userId` it can trust, exactly like it receives one from `sessionMiddleware` (ADR-005) |
| **Parser** | `parseOauthCookie`'s shape validator accepts both shapes and returns `undefined` for a malformed `link` | Its existing fail-closed contract extends unchanged: any unexpected shape ⇒ `undefined` ⇒ generic failure downstream, never a throw |

**Rejected: a server-side `state → userId` record.** Conceptually the strongest option — nothing
account-naming ever leaves the server. Rejected because it buys a new table (or a new ephemeral
store), a TTL, an expiry sweep and a second demo-cleanup-shaped job, all to protect a value that
lives for seconds and is already protected by a MAC the codebase knows how to compute. Recorded as
the escalation path if link-intent ever needs to carry more than a user id.

**Why the signed `userId` is sufficient authorisation at the callback.** It has to be said out loud,
because "no session at the callback" reads like a hole. The signature can only exist if the server
produced it, and the server only produces it after: a valid `md_session` for that `userId`, a
non-demo account, a **correct current password**, and a fresh random `state`. It then lives in an
HttpOnly, `Path`-scoped, 10-minute cookie that is cleared on **every** callback exit. That is a
short-lived capability token issued to an authenticated and re-authenticated session — the *same*
trust model the existing flow already places in `state`/`codeVerifier`, which today authorise the
issuance of a full session from cookie-carried material. This change does not lower that bar; it adds
integrity precisely because the payload now names a specific account.

### 2. Two legs, one callback

**Leg 1 — `POST /api/perfil/google/vincular` (JSON, not a redirect).** Binding decision 2 requires the
current password, and a password cannot travel on an `<a href>` top-level navigation (a query string
would put it in logs, history and `Referer`). So initiation is a normal authenticated JSON endpoint
under `protectedApi` — `req.userId`, `req.esDemo` free from the session middleware — which:

1. gates demo (decision 3) and verifies `passwordActual` (decision 2);
2. calls the **existing** `iniciador.iniciar()` (unchanged) for `state`/`nonce`/PKCE and the
   authorization URL;
3. responds `200 { urlAutorizacion }` **plus** `Set-Cookie: md_oauth` carrying the signed link intent.

The client then does a top-level `location.assign(urlAutorizacion)` — straight to
`accounts.google.com`, never through our API — so no Sec-Fetch guard applies to that hop. US-042
writes that one line.

Two details that make this work and are worth pinning in the design phase:

- **`md_oauth` keeps `Path=/api/auth/google` even though it is set from `/api/perfil/...`.** A
  `Set-Cookie` `Path` attribute does not have to match the request path (RFC 6265); the cookie only
  needs to be *readable* at the callback, which is where the path scope applies. Keeping the scope
  unchanged means the link flow adds **zero** new cookie surface. An integration test asserts the
  header; production behaviour is confirmed by the existing prod smoke path.
- **The Vercel proxy relays it unchanged.** `apps/web/api/proxy.ts` copies every non-hop-by-hop
  upstream response header verbatim, including `Set-Cookie` (that is exactly how the demo flow's
  cookie already reaches the browser). **No `apps/web` change is required.**

**CSRF on the new POST endpoints** needs no new mechanism: `md_session` is `SameSite=Strict`, so a
cross-site POST arrives with no session at all and is rejected by `sessionMiddleware` before any
handler runs. This is the same protection every existing `PATCH /api/perfil*` endpoint relies on.

**Leg 2 — the callback branches; it does not fork.** One route, two modes:

| | No `link` in `md_oauth` | Valid signed `link` | Invalid/mismatched `link` |
|---|---|---|---|
| Use case | `LoginConGoogleUseCase` (unchanged) | `VincularGoogleUseCase` | — |
| Session | issues `md_session` | **issues nothing** | — |
| Success redirect | `/` (unchanged) | `/configuracion?google=vinculado` | — |
| Failure redirect | `/login?error=google` (unchanged) | `/configuracion?google=error` | `/login?error=google` |

**Why one route and not `/callback/link`.** The redirect URI is *configured*
(`env.GOOGLE_REDIRECT_URI`) and *registered in Google Cloud Console per environment*. A second
callback means a second registered URI in every environment, a second env var, a second Sec-Fetch and
rate-limit surface, and a second place where a mistake becomes an auth bug — to distinguish two modes
that a signed cookie field already distinguishes. Rejected.

**Link mode must not issue a session,** and it does not need to: the user's `md_session` cookie was
never deleted — it was merely *withheld* on the cross-site hop. The moment the browser follows the
302 back to `app.moneydiary.cl`, that same-site navigation carries it again and the user is still
logged in. Issuing a fresh session in link mode would be a silent, unrequested session rotation.

`VincularGoogleUseCase.execute({ userId, esDemo?, sub })`:

1. `buscarPorId(userId)` → `null` ⇒ generic failure; `esDemo` ⇒ demo error (defence in depth —
   unreachable through leg 1's gate, and free because this read is needed anyway).
2. `estado.googleSub === sub` ⇒ **success, idempotent**. Re-linking what you already have is the
   desired end state, not an error.
3. `estado.googleSub !== null` (a *different* identity) ⇒ refuse. Switching accounts = unlink first.
4. `buscarPorGoogleSub(sub) !== null` ⇒ **★ refuse, never re-link.** After step 2 this can only be
   another account's identity. This step is the ★ rule's explicit, testable home; the
   `googleSub @unique` constraint is its second, unconditional line of defence.
5. `vincularGoogleSub(userId, sub)` — the **existing** conditional
   `updateMany WHERE id = ? AND googleSub IS NULL`; `false` (lost race or P2002) ⇒ generic failure.

**`IIdentidadGoogleRepository` needs exactly one new read for linking** (`buscarPorId`, returning the
existing `UsuarioVinculable` projection). `vincularGoogleSub` is reused **verbatim** — its conditional
write and P2002 catch already do the right thing for a caller that knows its own `userId`.

### 3. CA-03: one conditional write owns the invariant

**The invariant**: *an account must never be left without a way in.* Today `passwordHash` is nullable
and `googleSub` is nullable, so "both null" is representable — and CA-03 is the only thing standing
between the product and that state.

**Is a Google-only real user reachable today? No — verified.** Every `prisma.user.create` outside
tests is either `prisma/seed.ts` (always writes a `passwordHash`) or
`prisma-demo.repository.ts` (demo users, excluded from every Google path and from every profile
mutation). There is no self-registration endpoint (ADR-034: *solo ingreso, sin registro*). And only
two code paths ever write `passwordHash` — `seed.ts` and `actualizarPassword` — **neither of which
can write `null`**. So the passwordless-real-user state is unreachable today.

**Does US-041 change that? No, and that is the point.** Unlink is gated by CA-03 and linking never
removes a password, so the state stays unreachable after this change. Concretely, this also means
**US-040's recorded debt does not become reachable**: `buscarCredencialPorId` returns `null` for a
passwordless user, which would surface as a generic `403 PERFIL_RECHAZADO` on an email or password
change — a real trap, but one no real user can fall into, before or after this change.

**Decision: the check and the write are the same statement.**

```ts
// IIdentidadGoogleRepository (new)
desvincularGoogleSub(userId: string): Promise<boolean>;
// updateMany({
//   where: { id: userId, passwordHash: { not: null }, googleSub: { not: null } },
//   data:  { googleSub: null },
// })  →  count === 1
```

This is the confirmation the exploration asked for: it is the same idiom `vincularGoogleSub` already
uses, and it closes the TOCTOU between "does this user have a password?" and "clear the link" that a
read-then-write would leave open. Postgres evaluates the predicate and the update in one statement;
there is no window.

The application layer still reads first, but **for the message, not for the invariant**:

```
demo gate → buscarCredencialPorId(userId)
              null ⇒ VinculoRequierePasswordError (403, actionable, own-account-only)
          → verify passwordActual ⇒ mismatch ⇒ PerfilRechazadoError (403 generic, reused)
          → desvincularGoogleSub(userId)
              true  ⇒ 204
              false ⇒ 204 (idempotent — see below)
```

Two decisions embedded there:

- **"You have no password" is a specific error, not the generic one.** It reveals nothing about any
  other account — it is a statement about the caller's own credentials, to a caller who has already
  proven session ownership. Collapsing it into `PERFIL_RECHAZADO` would tell a user to "check your
  data" when the real answer is *"set a password first"*. Anti-enumeration protects **other**
  accounts; it is not a reason to be unhelpful about your own. (It is also, per the paragraph above,
  currently unreachable — it exists so that the day registration or Google-first signup arrives, the
  refusal is already correct and already tested.)
- **`false` from the write is treated as success.** Its only reachable cause is *"there was no link
  to begin with"* — the requested end state already holds. The other theoretical cause, a password
  vanishing mid-flight, has **no code path that can produce it** (verified above), and even if it
  somehow occurred the `WHERE` clause guarantees the safe outcome: the link stays, the account keeps
  an access method. Fail-closed by construction.

### 4. CA-04: the link state rides the identity read

**Decision: `GET /api/auth/me` gains `googleVinculado: boolean`.** `PrismaUserCredentialRepository`
adds `googleSub: true` to `buscarIdentidad`'s existing `select` and maps
`googleVinculado = user.googleSub !== null` — **one query, no new repository call, no new endpoint,
no extra round trip for US-042**. The raw `googleSub` never crosses the port; only the boolean does.
This follows US-040's decision verbatim: `/api/auth/me` is the single identity source, and
`PATCH /api/perfil` reuses the same response schema, so it stays consistent for free.

**⚠️ This is a required field on a generated contract type, and it breaks client test fixtures.**
`MeDto` is a re-export of the generated `AuthMeResponse` in both `apps/web` and `apps/mobile`, so
every fixture literal typed as `MeDto` stops compiling the moment the field is added. Exactly what
`nombre` did in US-040. Known blast radius, verified by inspection:

| File | Why | Gate that catches it |
|---|---|---|
| `apps/web/src/api/auth.test.ts` (2 fixtures) | typed `const … : MeDto` | `pnpm web typecheck` — **not** `pnpm web test` (vitest does not typecheck) |
| `apps/mobile/src/api/client.spec.ts` | typed `MeDto` | `pnpm --filter @moneydiary/mobile exec tsc --noEmit` |
| `apps/mobile/src/api/session-context.spec.tsx` | typed `MeDto` | idem |
| `apps/mobile/test/auth-navigation.integration.spec.tsx` | typed `MeDto`, **already missing `nombre`** | **Nothing** — `apps/mobile/tsconfig.json` includes only `app`/`src`, so `test/` is never typechecked. Pre-existing latent drift from US-040, not caused here. Fix the fixture while nearby; widening the tsconfig `include` is out of scope |

Both typecheck commands are in `.github/workflows/ci.yml` (web at :526, mobile at :569) and both are
**mandatory verification steps for this change** ([§7](#7-tests)).

**The `esMeDto` runtime guard in `apps/web/src/api/auth.ts` is deliberately not extended.** It is
`apps/web` *source*, and the boundary is binding. US-040 set the same precedent with `nombre`.
Recorded as a hand-off item: US-042 extends the guard when it starts consuming `googleVinculado`.

### 5. Why the link path does not check `email_verified`

ADR-034 gates the *implicit* link on `email_verified === true`, and it must: on that path the **email
is the binding key**, so an unverified email would let anyone who can mint a Google account with your
address claim your row.

The explicit path binds by **session-authenticated, password-re-verified `userId`**. The email is
never consulted, never compared, never used to select a row. There is nothing for `email_verified` to
protect. Requiring it would only break the legitimate case of a user whose Google account is not the
one they registered with — which is a normal thing to want and which the ★ rule already keeps safe.

This asymmetry is intentional and goes in the ADR amendment: **the `email_verified` gate belongs to
email-matched linking, not to linking in general.** Note also that once linked, login resolves through
`buscarPorGoogleSub` *before* any email gate — so the post-link login behaviour is already consistent
with this.

### 6. HTTP surface and errors

| Route | Auth | Body | Success |
|---|---|---|---|
| `POST /api/perfil/google/vincular` | session + demo gate + password | `{ passwordActual }` | `200 { urlAutorizacion }` + `Set-Cookie: md_oauth` |
| `POST /api/perfil/google/desvincular` | session + demo gate + password | `{ passwordActual }` | `204` |
| `GET /api/auth/google/callback` | none (by construction) | — | `302` — mode-dependent ([§2](#2-two-legs-one-callback)) |
| `GET /api/auth/me` | session | — | `200 { userId, nombre, email, esDemo, googleVinculado }` |

`POST /api/perfil/google/desvincular` rather than `DELETE /api/perfil/google`: the request carries a
body (`passwordActual`), and a body on `DELETE` is legal-but-underspecified and unevenly handled by
intermediaries. An explicit action verb is the honest shape.

`urlAutorizacion` is generated server-side by `openid-client` against Google's discovered issuer and
is **never** derived from request input — the same posture that keeps `redirect_uri` configured
rather than header-derived (ADR-034 design §7). It is not an open-redirect vector.

Error bodies keep the `{message, code}` convention and extend the **existing** `aPerfilHttpError`
translator (its `const _exhaustive: never` guard means a new error variant that nobody maps stops
compiling):

| Status | Code | Cause |
|---|---|---|
| `400` | `BODY_INVALIDO` | Zod rejection; body and issues never echoed |
| `403` | `DEMO_SOLO_LECTURA` | Decision 3, reuses `PerfilDemoSoloLecturaError` |
| `403` | `PERFIL_RECHAZADO` | Wrong `passwordActual`; reuses `PerfilRechazadoError` |
| `403` | `VINCULO_REQUIERE_PASSWORD` | Unlink refused: no password on the account ([§3](#3-ca-03-one-conditional-write-owns-the-invariant)) |
| `409` | `GOOGLE_YA_VINCULADO` | Link initiation while the account already carries a `googleSub` — cheap pre-flight on leg 1 so the user is not sent to Google for nothing. Not a security control: the real one is step 3 of the callback use case |
| `401` | — | Only ever from `sessionMiddleware` |

The **callback** has no error body — every outcome is a 302, and every failure is the single generic
value (AUTH-15 parity). One failure marker, never a per-cause code.

Security surface, stated plainly:

| Already there (inherited unchanged) | Added by this change |
|---|---|
| Sec-Fetch top-level-navigation guard on initiate + callback | HMAC integrity on the account-naming cookie field ([§1](#1-the-link-intent-must-be-unforgeable)) |
| `state` + `nonce` + PKCE, `md_oauth` cleared on every callback exit | Current-password re-verification before an intent is ever signed |
| Shared `googleRateLimiter` (`google:ip:`, 10/15min) on the callback | Demo gate on both new endpoints |
| Generic failure redirect, no cause enumeration | `SameSite=Strict` session as CSRF protection for the two new POSTs |

**CA-05 is satisfied structurally, not by new code**: the link path reuses
`IVerificadorIdentidadExterna` unchanged — the adapter validates the `id_token` and discards it, and
nothing in `VincularGoogleUseCase`'s signature can even receive a token. There is no field to persist
one into. A test asserts the use case receives only `{ userId, sub }`.

### 7. Tests

| Criterion / property | Coverage |
|---|---|
| **CA-01** | `VincularGoogleUseCase` unit spec (fresh link, idempotent re-link, account already carrying another sub); route spec for leg 1 (`200` + `Set-Cookie`); **integration**: authenticated session → initiate → faked callback → row carries the new `googleSub` |
| **CA-02 (★)** | Unit: `buscarPorGoogleSub` returns another user ⇒ failure, `vincularGoogleSub` **never called**. Integration: user B's identity offered to user A ⇒ generic redirect, **both** rows unchanged |
| **CA-03** | Repository spec pinning the `WHERE passwordHash IS NOT NULL AND googleSub IS NOT NULL` predicate. Integration: a passwordless user (seeded directly) unlinking ⇒ `403 VINCULO_REQUIERE_PASSWORD`, `googleSub` unchanged. Unit: `false` from the write ⇒ `204` |
| **CA-04** | Repository spec: `buscarIdentidad` selects `googleSub` and returns the boolean, never the raw value. Route spec: `/api/auth/me` payload shape |
| **CA-05** | Use-case spec asserts the input carries no token-shaped field; the verificador double is asserted to be called with the existing arguments only |
| **Signed intent (decision 1)** | **Binding proof**: a callback carrying a `link` with a tampered `userId`, a MAC from a *different* `state`, or **no MAC at all** ⇒ generic redirect and **zero writes**. Plus a unit spec for the signer: same input ⇒ same MAC, `state` change ⇒ different MAC, wrong-length MAC ⇒ `false`, never a throw |
| **Decision 2 / 4** | Integration: wrong `passwordActual` on either endpoint ⇒ `403 PERFIL_RECHAZADO`, no `md_oauth` set, no write |
| **Decision 3** | Demo-gate int-spec extended: both endpoints ⇒ `403 DEMO_SOLO_LECTURA`, nothing written |
| **Isolation** | `auth-isolation.int-spec.ts` family: user A cannot unlink user B by any body field |
| **Login regression** | The existing `auth-google-callback.int-spec.ts` must pass **unchanged** — proof that a cookie without `link` still behaves byte-identically |

The OIDC provider is faked the way the existing specs already do it: a
`verificador: { verificar: vi.fn() }` double against a real Postgres — **never** live Google. The new
link specs extend that harness with an authenticated pre-condition (a seeded session) before hitting
leg 1.

Strict TDD applies. **Verification commands** (all mandatory, the last two because of
[§4](#4-ca-04-the-link-state-rides-the-identity-read)):

```
pnpm api test · pnpm api test:integration · pnpm api test:e2e · pnpm api exec tsc --noEmit
pnpm web typecheck
pnpm --filter @moneydiary/mobile exec tsc --noEmit
```

### 8. ADR-034 amendment, not a new ADR

**Amendment.** ADR-035 earned its own ADR because it *deviated* from ADR-034's core commitment — the
flow no longer terminated in `apps/api`. US-041 deviates from nothing: same `openid-client` adapter,
same single registered redirect URI, same callback route, same session model, same web-only scope,
same "no Google tokens persisted". It adds a second **entry point** into a decided flow. A new ADR
would fragment one decision across two documents.

The amendment states exactly four things:

1. **Linking now has two pathways.** *Implicit*, email-matched, `email_verified`-gated, occurring only
   during login (unchanged); and *explicit*, `userId`-bound, password-re-verified, initiated from the
   profile. The `email_verified` gate belongs to the first only, and
   [§5](#5-why-the-link-path-does-not-check-email_verified) says why.
2. **The callback is dual-purpose**, distinguished by an **HMAC-signed** link marker inside
   `md_oauth` — not by a second redirect URI. `md_oauth` is therefore no longer "unsigned by design";
   its original rationale is superseded for the field that names an account.
3. **The ★ no-re-link rule is a database-level invariant** (`googleSub @unique` + conditional
   `updateMany`), enforced at two call sites rather than one use case.
4. **New account invariant, first-class**: *an account must never be left without an access method.*
   `googleSub` may only be cleared while `passwordHash IS NOT NULL`, enforced in the `WHERE` clause of
   the unlink statement.

## Affected areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/prisma/**` | **Unchanged** | `googleSub`, `passwordHash` and the unique index all exist. **No migration** |
| `composition/derive-blind-index-key.ts` | Modified | Second export `deriveLinkIntentKey` + `'oauth-link-intent-v1'` info ([§1](#1-the-link-intent-must-be-unforgeable)) |
| `infrastructure/http/auth/link-intent.ts` (+ spec) | **New** | Sign/verify, constant-time, fail-closed |
| `infrastructure/http/auth/oauth-transient-cookie.ts` (+ spec) | Modified | Optional `link` in the payload + shape validation |
| `application/ports/identidad-google-repository.port.ts` | Modified | `buscarPorId`, `desvincularGoogleSub` |
| `infrastructure/persistence/prisma-identidad-google.repository.ts` (+ spec) | Modified | The two methods; the CA-03 conditional write |
| `application/ports/user-credential-repository.port.ts` | Modified | `googleVinculado` on `IdentidadUsuario` |
| `infrastructure/persistence/prisma-user-credential.repository.ts` (+ spec) | Modified | `googleSub` added to `buscarIdentidad`'s select, mapped to a boolean |
| `application/use-cases/vincular-google.use-case.ts`, `desvincular-google.use-case.ts` (+ specs) | **New** | [§2](#2-two-legs-one-callback), [§3](#3-ca-03-one-conditional-write-owns-the-invariant) |
| `application/use-cases/iniciar-vinculacion-google.use-case.ts` (+ spec) | **New** | Demo gate + password verification + `iniciador.iniciar()` |
| `application/use-cases/login-con-google.use-case.ts` | **Unchanged** | The login path is not touched |
| `domain/errors/vinculo-requiere-password.error.ts`, `vinculacion-rechazada.error.ts` | **New** | [§6](#6-http-surface-and-errors) |
| `infrastructure/http-express/routes/perfil-google.routes.ts` (+ spec) | **New** | The two new endpoints |
| `infrastructure/http-express/routes/auth-google.routes.ts` (+ spec) | Modified | Callback branching |
| `infrastructure/http-express/routes/perfil-http-error.ts` (+ spec) | Modified | Two new variants (exhaustive guard) |
| `infrastructure/http-express/routes/auth.routes.ts` | Modified | `googleVinculado` in the `/auth/me` payload |
| `infrastructure/http-express/schemas/**` + `openapi-document.ts` | Modified | Two operations + the `AuthMeResponse` field |
| `composition/crear-auth-google.ts`, `crear-perfil.ts`, `container.ts` | Modified | Wire the new use cases + the derived link key. **No new crypto instance** |
| `apps/api/openapi.json`, `packages/api-client` types | **Generated** | Regenerated; both CI drift-gated |
| `apps/web/**`, `apps/mobile/**` **source** | **Unchanged** | US-042 owns the UI |
| `apps/web/src/api/auth.test.ts`, `apps/mobile/src/api/*.spec.*`, `apps/mobile/test/auth-navigation.integration.spec.tsx` | Modified (**fixtures only**) | Forced by the required DTO field ([§4](#4-ca-04-the-link-state-rides-the-identity-read)) |
| `docs/adr/ADR-034-login-con-google-oidc.md` | Modified | Amendment ([§8](#8-adr-034-amendment-not-a-new-adr)) |

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Forged link-intent grants an attacker an access method on a victim's account** | Low | **Critical** | The headline risk and the headline test. HMAC over `state.userId` with a purpose-separated key, constant-time compare, reject-never-fall-back, and a binding integration proof that a tampered/absent MAC writes nothing ([§1](#1-the-link-intent-must-be-unforgeable), [§7](#7-tests)) |
| **Key reuse**: the link key derived with the blind-index info string | Low | **Critical** | Distinct `info` is stated in the decision, lives beside the blind-index constant in one file, and is asserted by a spec (the two derivations must differ for the same `ENCRYPTION_KEY`) |
| **Cookie shadowing** — a sibling host sets a `Domain=`-scoped `md_oauth` that the browser prefers | Low | Medium | The MAC makes the content unforgeable, so the worst outcome is a failed flow, not a wrong link. Recorded, not engineered against |
| **An account ends up with no access method** | Low | **Critical** | The invariant lives in a single `WHERE` clause, not in an application-level pre-check ([§3](#3-ca-03-one-conditional-write-owns-the-invariant)); pinned by a repository spec |
| **Client typecheck breaks on the required DTO field** and is discovered in CI, not locally | **High** | Low | Named explicitly in [§4](#4-ca-04-the-link-state-rides-the-identity-read) with the exact file list, and both typecheck commands are mandatory verification steps. `pnpm web test` passing means nothing here |
| **`md_oauth`'s `Path` scope fails to apply when set from `/api/perfil/...`** | Low | High | RFC-permitted and asserted by an integration test on the `Set-Cookie` header; the redirect target is confirmed in the prod smoke path before the flow is announced |
| **The redirect contract with US-042 drifts** (`/configuracion?google=…`) | Medium | Low | The path is a constant in the API and is written into the spec; US-042 reads it there. If US-042 renames the route, the constant changes with it — one line |
| **Login regression from callback branching** | Low | High | The existing callback integration spec must pass **unchanged**; the no-`link` path is byte-identical |
| **Scope creep into the Configuración UI** | **High** | Medium | Explicit non-goal, stated in the scope table, the affected-areas table and here. Zero `apps/web`/`apps/mobile` **source** files |
| **Contract drift** (`openapi.json`, api-client) | Low | Low | Existing CI drift gates |
| **Issue #275's CA-01/CA-03 stay stale** | Medium | Low | Header action items; the spec phase writes the hardened criteria |

## Success criteria

| AC | Criterion |
|----|-----------|
| **CA-01** | An authenticated non-demo user who supplies the correct current password can run the existing OIDC flow from the profile and end with `googleSub` set on **their own** row |
| **CA-02** | A `googleSub` owned by another account is refused with the generic failure; **no** row is re-linked, and the other account is untouched |
| **CA-03** | Unlink clears `googleSub` **only** while `passwordHash IS NOT NULL`, enforced in the write's `WHERE` clause; a passwordless account gets `403 VINCULO_REQUIERE_PASSWORD` and keeps its link |
| **CA-04** | `GET /api/auth/me` returns `googleVinculado: boolean`, derived from `googleSub`, from a single query; the raw `googleSub` never crosses the port |
| **CA-05** | No Google token is persisted anywhere, and both endpoints operate solely on the session's user / the signed intent — no request field can name another user |
| — | A callback whose `link` field carries a tampered, cross-flow or absent MAC performs **zero** writes and redirects generically |
| — | Demo sessions get `403 DEMO_SOLO_LECTURA` on both endpoints, with `esDemo` a required use-case input |
| — | The existing Google **login** integration spec passes unchanged |
| — | Zero **source** files changed under `apps/web/` and `apps/mobile/`; fixture updates only |
| — | No Prisma migration added |
| — | `openapi.json` + api-client regenerated, drift gates green |
| — | `pnpm api test`, `test:integration`, `test:e2e`, `pnpm api exec tsc --noEmit`, `pnpm web typecheck`, `pnpm --filter @moneydiary/mobile exec tsc --noEmit` all green |

## Delivery and size forecast

**Two chained PRs.** Different risk profiles: PR #1 carries a new cryptographic mechanism and a change
to an auth hot path; PR #2 carries a data invariant. Reviewing them together would bury one under the
other.

| PR | Content | Why it stands alone |
|----|---------|---------------------|
| **#1 — Link** | `deriveLinkIntentKey`; `link-intent.ts`; `md_oauth` payload extension; `IniciarVinculacionGoogleUseCase` + `POST /api/perfil/google/vincular`; callback branching; `VincularGoogleUseCase` + `buscarPorId`; `googleVinculado` on `/auth/me`; contract regen + client fixtures; specs | Ships CA-01/02/04/05 end to end. The security mechanism gets a review of its own, with the forged-cookie proof in front of the reviewer |
| **#2 — Unlink** | `desvincularGoogleSub` conditional write; `DesvincularGoogleUseCase`; `POST /api/perfil/google/desvincular`; `VinculoRequierePasswordError` + translator variants; specs | Ships CA-03. Depends on #1 only for the route file and translator it extends |

Rough shape: ~10 hand-written source files plus ~10 spec files across both, plus regenerated contract
artifacts. PR #1 is the larger and is plausibly at the 400-line budget once the generated
`openapi.json`/api-client diff is counted — **`Chained PRs recommended: Yes`** is this proposal's
leaning; `sdd-tasks` owns the binding forecast.

## Rollback plan

1. **No migration, no data transformation.** Rollback is `git revert` + redeploy; the two endpoints
   disappear, the callback loses its branch, `/auth/me` loses `googleVinculado`.
2. **Links already created survive the revert and keep working.** A `googleSub` written by the
   explicit path is indistinguishable from one written by the implicit path — the *unchanged* login
   path resolves it by `buscarPorGoogleSub` exactly as before.
3. **Unlinks already performed also survive**, and safely: every account that reached that state
   provably had a password at the moment of the write.
4. **The generated contract must be reverted with the code** — an `openapi.json` advertising the link
   endpoints after the routes are gone would send US-042's client at a 404. The CI drift gate makes
   this automatic.
5. **One transient edge**: a user mid-flow at revert time returns to a callback with no link branch;
   their `md_oauth` carries a `link` field the old parser rejects ⇒ generic failure redirect, nothing
   written, cookie cleared. Fail-closed, self-healing on retry.

## Capabilities

### New capabilities

- `vinculacion-google`: explicit linking and unlinking of a Google identity from the authenticated
  profile — password-re-verified initiation, the signed link-intent through the OIDC round-trip, the
  dual-mode callback, the ★ no-re-link rule on the explicit path, the never-leave-an-account-without-
  access invariant, the demo gate, and the exposed link state. Requirement family `VINC041-*`.

### Modified capabilities

- `user-authentication`: **AUTH-09** — `/api/auth/me` returns `googleVinculado`. **AUTH-12/AUTH-14** —
  the callback is dual-mode, and the `email_verified` gate is scoped to email-matched linking. Deltas
  only.
- `perfil-usuario`: no requirement changes. The new endpoints live under `/api/perfil` and reuse its
  demo gate, its error translator and its `PerfilRechazadoError`, but they are Google-identity
  requirements — `sdd-spec` should keep them in `vinculacion-google` and cross-reference.

`catalogo-clasificacion-ownership` and `user-data-isolation` are unrelated and must not be modified.

## Open questions (non-blocking — resolve in design)

1. **Is `409 GOOGLE_YA_VINCULADO` on leg 1 worth it,** or should the account-already-linked case be
   caught only at the callback? Leaning: keep it — sending a user to a consent screen that is
   guaranteed to fail is worse UX than a clean refusal, and it is not the security control.
2. **Should the link failure redirect distinguish "that Google account belongs to someone else"** from
   the generic failure? Leaning: **no** — one failure value, AUTH-15 parity. Revisit only if support
   traffic shows users cannot tell what went wrong.
3. **Exact redirect path** (`/configuracion?google=vinculado|error`) — needs one line of agreement
   with US-042 before implementation. Cheap to change, expensive to discover late.
4. **`VINC041-*` numbering and spec placement** — one new capability file vs. deltas split across
   `user-authentication` and `perfil-usuario`. Leaning: one new capability, deltas only where the
   existing requirements literally change.
5. **Rename `derive-blind-index-key.ts` → `derive-keys.ts`** once it exports two derivations. Leaning:
   defer — import churn in `seed.ts`/`backfill` for zero behaviour change.
6. **Should `md_oauth`'s Max-Age shrink for link mode?** The 10-minute window was sized for a login
   consent screen. Leaning: leave it — one constant, one behaviour, and the MAC is what bounds the
   risk, not the clock.
