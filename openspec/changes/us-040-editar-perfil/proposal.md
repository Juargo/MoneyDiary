# Proposal: US-040 — Edit profile (nombre, email, password) — API only

- **Change**: `us-040-editar-perfil`
- **Issue**: [#274](https://github.com/Juargo/MoneyDiary/issues/274) · Milestone `Sprint-12`
- **Status**: Proposed (2026-08-12)
- **Builds on**: US-035 / ADR-013 (encrypted email + blind index), AUTH-01..09 (sessions),
  US-038 / ADR-037 (demo gate + `{message, code}` error bodies) — all merged and deployed
- **Requires new ADR**: **No.** ADR-013 already mandates the encrypted-column + blind-index shape;
  this change is its first *application-layer writer*, not a new decision. ADR-034/035 (Google login)
  are untouched — linking/unlinking is US-041.
- **⚠️ Action item on issue #274**: **CA-03 is being widened.** The issue requires the current
  password only for the password change; [binding decision 2](#binding-decisions) also requires it to
  change the **email**. Update the issue so the criterion matches what ships.

## Intent

A user who mistyped their name at signup, changed email provider, or wants to rotate a password has
no way to do any of it. There is no write path to `User.nombre`, `User.email` or `User.passwordHash`
anywhere in the product — the only mutations that ever touched them are `prisma/seed.ts` and a
one-off backfill script. Account maintenance today means asking the developer.

After this change the API can:

- Update `nombre` and/or `email` for the session's own user, with the email's ciphertext and blind
  index regenerated **together** so login keeps working (**CA-01**, **CA-02**).
- Change the password after re-verifying the current one, storing it with argon2id and domain
  validation rules (**CA-03**, **CA-04**), and expelling every **other** session
  ([binding decision 1](#binding-decisions)).
- Refuse an email already claimed by another account with the same generic, non-enumerating error as
  a wrong current password (**CA-05**).
- Operate exclusively on `req.userId`, never on an id from the request (**CA-06**).

## Why now

1. **US-042 (issue #276) is blocked on this contract.** It declares "Depende de: US-040 (API de
   perfil)" in its own body. Building the Configuración screen against a contract that does not exist
   means building it twice.
2. **The write-invariant should be designed once, deliberately, before it is needed in a hurry.**
   The `email` ↔ `emailBlindIndex` pair has already produced one production outage (2026-08-02). The
   first application-layer writer is the moment to give that invariant a single home — see
   [Approach §1](#1-the-email-write-invariant-one-home-one-normalization-one-update).
3. **Password rotation is the only self-service remedy the product can offer today.** Password
   recovery by email is out of scope and unbuilt; without US-040 a user who suspects their password
   leaked has no action available at all.

## Binding decisions

Settled with the user before this proposal; recorded here as decisions, not options.

| # | Decision | Rationale |
|---|----------|-----------|
| **1** | A password change **revokes every other session and keeps the current one alive** | Industry standard. A stolen session token is expelled; the user is not logged out of the tab they are working in. Requires a new `ISessionRepository` method — none exists (see [§3](#3-session-revocation-revoke-others-keep-mine)) |
| **2** | Changing the **email also requires the current password** | Hardening beyond issue #274. The email is the account key: a compromised open session must not be able to take the account over by pointing it at an attacker's address. A `nombre`-only edit does **not** require it — no security payoff, pure friction |
| **3** | **Demo users cannot edit their profile at all** — every profile mutation refuses an `esDemo` session with `403 DEMO_SOLO_LECTURA` | Mirrors US-038/ADR-036. A demo has neither email nor `passwordHash`; letting it set either would silently turn a 7-day sandbox into a persistent account — a new, unreviewed identity path. The message points at registering a real account |

## Scope

### In scope

**A. Profile read** — `GET /api/auth/me` gains `nombre` (additive). `IdentidadUsuario` and
`ObtenerIdentidadUseCase` carry it. No new read endpoint ([§4](#4-http-surface)).

**B. `PATCH /api/perfil`** — update `nombre` and/or `email`. New `ActualizarPerfilUseCase`, new
write method on `IUserCredentialRepository` that owns the crypto invariant ([§1](#1-the-email-write-invariant-one-home-one-normalization-one-update)).

**C. `PATCH /api/perfil/password`** — verify current password, validate + hash the new one, revoke
other sessions. New `CambiarPasswordUseCase`, new `Password` value object ([§2](#2-password-a-real-value-object-because-no-rule-exists-yet)),
new `ISessionRepository.revocarOtrasPorUserId` ([§3](#3-session-revocation-revoke-others-keep-mine)).

**D. `aPerfilHttpError`** — a dedicated exhaustive translator for this error union, following
`aCatalogoHttpError`'s shape (one class ⇒ one status ⇒ one `code`, with the
`const _exhaustive: never` compiler guard). Not a reuse — different union.

**E. Contract regeneration** — new Zod schemas + operations in `openapi-document.ts`,
`apps/api/openapi.json`, `packages/api-client` types. Both already CI drift-gated (ADR-011/012).

**F. Tests** — unit (VOs, use cases, translator), repository spec pinning the write invariant,
integration (isolation, demo gate), e2e proving **login still works with the new email** after a change.

### Non-goals (out of scope)

| Not doing | Why / owner |
|-----------|-------------|
| **Any `apps/web` work** — the Configuración page, its route, flipping the nav placeholder, the Perfil form | **US-042 (#276)**, which names US-040 as its dependency. US-040 is **API-only**. The regenerated `@moneydiary/api-client` types are a contract artifact; *consuming* them is US-042's job |
| Link / unlink Google | **US-041**. `googleSub` is untouched here |
| Password recovery / reset by email | Explicit non-goal of #274. Needs email delivery infrastructure that does not exist |
| Email verification of the **new** address (confirm-before-switch) | Deferred, [recorded as a risk](#risks-and-mitigations) with its trigger. The current password (decision 2) is the safeguard this change ships |
| Encrypting `nombre` | `nombre` is a plaintext column today and stays one. ADR-013 scoped encryption to email/account number; widening it is its own change |
| Rate limiting the current-password check | The endpoint is already behind `x-api-key` + a valid session. If abuse appears, reuse `demoRateLimiter`'s shape. Trigger recorded |
| Refactoring `seed.ts` / `backfill-email-blind-index.ts` onto the new write path | One-off scripts, outside the app. Trigger: a **third** writer ⇒ extract (rule of three, `yagni`) |
| A migration | None needed — `nombre`, `email`, `emailBlindIndex`, `passwordHash` and the unique index all exist |

## Approach

### 1. The email write-invariant: one home, one normalization, one UPDATE

**The failure to design against.** On 2026-08-02 the blind index written by a script (wrong
`ENCRYPTION_KEY`) did not match the index computed at login (correct key), and a real user got a
`401` with the correct password. US-040 makes that class of failure reachable **by a normal user
action**, not just by an ops event. Four concrete ways it comes back, and what structurally forbids
each:

| Failure mode | Structural defence |
|---|---|
| **Recompute skew** — ciphertext derived from one string, blind index from another | The port method takes the **`Email` value object**, not a `string`. `Email.crear()` is the only normalizer in the codebase and `email.valor` is what the read path (`buscarPorEmail`) already hashes. A raw body string cannot reach the write path — it does not type-check |
| **Partial write** — two round trips, crash in between | Both columns in **one** `prisma.user.update({ data: { nombre, email, emailBlindIndex } })`. A single Postgres UPDATE is atomic across columns. Exactly the seed/backfill pattern |
| **Wrong/stale key instance** — a new `AesGcmCryptoService` / `HmacBlindIndexService` built inside the use case | The write lives in `PrismaUserCredentialRepository`, which **already holds** the `crypto` and `blindIndex` instances built once in `container.ts:117-135` — the same ones its own `buscarPorEmail` uses. The new method adds **no new collaborator**; nothing is re-derived |
| **Unique-collision leaked raw** — `emailBlindIndex` is `@unique`, so a taken email raises P2002 | Caught in the repository, returned as a typed failure, mapped by the use case to the shared generic error of [§5](#5-one-generic-error-for-ca-03-and-ca-05) — never a 500, never a constraint message |

**Decision: the invariant's single home is the repository, via one new port method.**

```ts
// application/ports/user-credential-repository.port.ts (added)
actualizarPerfil(input: {
  userId: string;
  nombre?: string;
  email?: Email;           // VO, never a raw string
}): Promise<Result<void, EmailNoDisponibleError>>;
```

Why there and not in a shared application helper: the read side of this exact pair
(`WHERE emailBlindIndex = blindIndex.compute(email.valor)`) already lives in that file. Putting the
write beside it keeps derivation symmetric in **one** file, with one docblock explaining both. An
application-layer helper would create a second place that knows the derivation order while the
repository still knows the lookup — two homes for one invariant, which is the problem, not the fix.

`Email` is a domain type, so the port stays framework-free (ADR-005): `buscarPorEmail(email: Email)`
already sets this precedent.

Deliberately **not** extracted into a shared helper for `seed.ts` / `backfill` today: those are
one-off scripts, and a premature extraction would be the wrong abstraction chosen from two samples.
Trigger recorded: a third writer ⇒ extract (`yagni`, rule of three).

Also decided: **no pre-flight "is this email taken?" lookup.** It is a TOCTOU race that adds a query
and still needs the P2002 catch for correctness, and it turns the endpoint into a cleaner
enumeration oracle. Rely on the constraint — the `vincularGoogleSub` P2002-catch precedent.

### 2. `Password`: a real value object, because no rule exists yet

There is **no** password validation anywhere in the codebase today — not in `Argon2PasswordHasher`,
not in login, not in a Zod schema. CA-04 requires domain rules, so they are written from scratch.

**Decision: introduce `Password` in `domain/value-objects/`**, `Result`-returning, mirroring `Email`:

```ts
Password.crear(raw: string): Result<Password, PasswordInvalidaError>
```

Rules (KISS, aligned with NIST 800-63B — length over composition classes): **minimum 8 characters,
maximum 128** (an explicit upper bound is an argon2 CPU-cost guard, not cosmetics). No forced
symbol/digit classes, no dictionary check.

Why a VO rather than a Zod `.min()` in the HTTP schema:

- A `min` in the schema puts a **business rule in the infrastructure layer** — invisible to the use
  case, unavailable to any other caller (CLI, a future registration flow), and untestable without HTTP.
- `Email` set the precedent for exactly this and it is the reason normalization is safe in §1.
- The number lives in **one** place. The Zod schema keeps type/presence checks only
  (`BODY_INVALIDO` 400); it does not restate the length (DRY).

The YAGNI counter-argument ("one consumer today") is answered by the same carve-out that justifies
`Email`: the layers and `Result` are structure, not speculation — and the alternative parks a domain
rule where the architecture forbids it.

### 3. Session revocation: revoke others, keep mine

`ISessionRepository` exposes only `crear` / `buscarPorTokenHash` / `revocarPorTokenHash`. Adding:

```ts
revocarOtrasPorUserId(userId: string, tokenHashActual: string): Promise<void>;
// deleteMany({ where: { userId, tokenHash: { not: tokenHashActual } } })
```

`Session.userId` is already indexed and `tokenHash` is unique — no migration, no index work.

**Getting the current session's hash.** `sessionMiddleware` publishes only `req.userId` / `req.esDemo`
today; the hash is computed inside `ValidarSesionUseCase` (`tokens.hashToken(input.token)`) and
discarded. Decision: **`ValidarSesionResult` returns the `tokenHash` it already computed** and the
middleware writes it to `req.sessionTokenHash` (typed in `express-request.d.ts`). Rejected
alternative: re-extract the token in the route and re-hash it — that duplicates a security-relevant
derivation and drags `ISessionTokenService` into a route that should stay thin.

**Ordering instead of a cross-aggregate transaction.** The two writes live in two different ports
(sessions, credentials); wrapping them in one Prisma transaction would require a port method that
owns both aggregates. Not worth it, because the ordering already puts the failure on the safe side:

```
demo gate → load credential → verify current password → Password.crear(new)
          → hash → revoke other sessions → write passwordHash
```

- Revocation fails ⇒ abort **before** the password is written (fail-closed; nothing changed).
- Password write fails after revocation ⇒ other devices must log in again with the **old** password,
  which still works. A nuisance, never a hole.

The forbidden state — new password stored while a pre-change stolen session survives — is
unreachable by construction. That is what the atomicity would have bought, obtained by ordering.

### 4. HTTP surface

**Two endpoints, not one.** They have different security semantics (one re-authenticates and expels
sessions, one does not), disjoint error sets, and merging them would invent a partial-failure
question ("email changed but password did not") that no criterion asks for.

| Route | Body | Success | Notes |
|---|---|---|---|
| `GET /api/auth/me` | — | `200 { userId, nombre, email, esDemo }` | `nombre` added — additive, backward compatible |
| `PATCH /api/perfil` | `{ nombre?, email?, passwordActual? }` | `200` with the same identity shape, so a client can replace its cached identity without a second call | `passwordActual` **required iff `email` is present** (decision 2); at least one of `nombre`/`email` required |
| `PATCH /api/perfil/password` | `{ passwordActual, passwordNueva }` | `204` | Revokes all other sessions; the caller's cookie/token stays valid |

**No new `GET /api/perfil`**: it would duplicate `/api/auth/me` field for field and give the web two
competing identity sources. Adding `nombre` to the existing DTO is cheaper and drift-safer.

Error bodies use `{ message, code }` — the convention US-038 introduced for new endpoints:

| Status | Code | Cause |
|---|---|---|
| `400` | `BODY_INVALIDO` | Zod rejection. Body and issues never echoed (scrub convention) |
| `400` | `EMAIL_INVALIDO` / `PASSWORD_INVALIDA` | The caller's own new value fails its VO. Reveals nothing about other accounts |
| `403` | `DEMO_SOLO_LECTURA` | Decision 3 |
| `403` | `PERFIL_RECHAZADO` | Wrong current password **or** email already taken — see §5 |
| `401` | — | Only ever from `sessionMiddleware`. **No use-case branch returns 401** |

**CA-06 is free and structural**: both routes read `req.userId!` / `req.esDemo!` from the session
middleware and neither schema accepts a user id. There is no id to tamper with — the
`categorias.routes.ts` pattern verbatim.

### 5. One generic error for CA-03 and CA-05

CA-05 demands anti-enumeration parity with login. `LoginUseCase` collapses malformed email, unknown
email and wrong password into a single `CredencialesInvalidasError`. The equivalent here:
**wrong current password** and **email already claimed** collapse into one
`PerfilRechazadoError` → `403 PERFIL_RECHAZADO`, one message ("no pudimos actualizar tu perfil,
revisá los datos ingresados"). Since decision 2 makes the current password mandatory for any email
change, an attacker probing addresses cannot distinguish "taken" from "you typed your password
wrong", which is exactly the login property.

**Why `403` and not `401`.** `401` is the session-invalid signal: `requireSession` redirects to
`/login` on it. Reusing it for a password typo would conflate "your typo" with "your session died"
and risks bouncing the user out of the form. `403` is the correct semantics — the request was
understood and refused.

**Timing equalization is not replicated.** Login's dummy-hash trick exists because the *unknown
email* branch skips argon2 entirely. Here the current-password verification runs on **every** branch
before any lookup, so the two collapsed outcomes already share the expensive path. Adding a dummy
hash would be cargo-culting.

### 6. Demo gate

`esDemo` is a **required** input field on both use cases (not optional, not defaulted), gated at the
top before any repository call — the `crear-categoria.use-case.ts` precedent. Forgetting it is a
**compile error**, not a silent hole. New `PerfilDemoSoloLecturaError` (own class, same
`DEMO_SOLO_LECTURA` code, message pointing at registering a real account) rather than reusing
`CatalogoDemoSoloLecturaError`, which would drag the catalog error union into a different exhaustive
translator. Third occurrence ⇒ generalize.

### 7. Tests

| Criterion | Coverage |
|---|---|
| **CA-01** | Use-case unit tests (nombre only, email only, both); route spec for `200` + payload shape |
| **CA-02** | **Repository spec**: one `update()` call carrying **both** `email` and `emailBlindIndex`, both derived from the same `email.valor`, using the injected instances. **E2E**: seed via `test/support/encrypted-email.fixture.ts` → login OK → `PATCH /api/perfil` with a new email → **login with the new email succeeds and with the old one fails**. This is the regression test for the 2026-08-02 incident |
| **CA-03** | Unit: wrong `passwordActual` ⇒ `PerfilRechazadoError`, no write attempted. Integration: `403 PERFIL_RECHAZADO`. Plus: password change revokes other sessions and **keeps the caller's** (two sessions seeded, one survives) |
| **CA-04** | `Password` VO spec (boundaries 7/8/128/129); use case asserts the stored value is an argon2id hash, never plaintext |
| **CA-05** | Integration: user B changes their email to user A's ⇒ `403 PERFIL_RECHAZADO`, **byte-identical** to the wrong-password body; A's row untouched |
| **CA-06** | `auth-isolation.int-spec.ts` family: a body/param carrying another user's id changes nothing for that user |
| Decision 3 | Demo gate int-spec: all three mutations ⇒ `403 DEMO_SOLO_LECTURA` |

Strict TDD applies. `pnpm api test`, `pnpm api test:integration`, `pnpm api test:e2e` against the
local/CI ephemeral Postgres (`apps/api/docs/local-test-db.md`).

## Affected areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/prisma/schema.prisma` + migrations | **Unchanged** | Every column and index already exists |
| `domain/value-objects/password.ts` (+ spec) | **New** | §2 |
| `domain/errors/password-invalida.error.ts`, `perfil-rechazado.error.ts`, `perfil-demo-solo-lectura.error.ts` | **New** | §2, §5, §6 |
| `application/ports/user-credential-repository.port.ts` | Modified | `actualizarPerfil`, `actualizarPassword`, `buscarCredencialPorId` (verify current password by `userId` — today only `buscarPorEmail` returns a hash); `nombre` on `IdentidadUsuario` |
| `application/ports/session-repository.port.ts` | Modified | `revocarOtrasPorUserId` |
| `application/use-cases/actualizar-perfil.use-case.ts`, `cambiar-password.use-case.ts` (+ specs) | **New** | §1, §3 |
| `application/use-cases/validar-sesion.use-case.ts` | Modified | `ValidarSesionResult` returns the already-computed `tokenHash` (§3) |
| `application/use-cases/obtener-identidad.use-case.ts` | Modified | Carries `nombre` |
| `infrastructure/persistence/prisma-user-credential.repository.ts` (+ spec) | Modified | The write-invariant home; P2002 catch; `nombre` in `buscarIdentidad`'s select |
| `infrastructure/persistence/prisma-session.repository.ts` | Modified | `deleteMany` on `{ userId, tokenHash: { not } }` |
| `infrastructure/http-express/middleware/session.middleware.ts` + `express-request.d.ts` | Modified | Publishes `req.sessionTokenHash` |
| `infrastructure/http-express/routes/perfil.routes.ts`, `perfil-http-error.ts` (+ specs) | **New** | §4, §5 |
| `infrastructure/http-express/routes/auth.routes.ts` | Modified | `nombre` in the `/auth/me` payload |
| `infrastructure/http-express/schemas/perfil.schema.ts` + `openapi-document.ts` | New / Modified | Request/response schemas, two operations, `authMeOperation` response |
| `composition/container.ts` + `crear-*` | Modified | Wire the two use cases. **No new crypto instance** — §1 |
| `apps/api/openapi.json`, `packages/api-client` types | **Generated** | Regenerated; both CI drift-gated |
| `apps/web/**`, `apps/mobile/**` | **Unchanged** | US-042 owns the UI. The `/auth/me` change is additive |

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Email/blind-index desync locks a user out of their own account** (repeat of 2026-08-02, now user-triggered) | Low | **Critical** | The four structural defences of §1 — VO-typed port, single UPDATE, injected instances, P2002 mapping — plus the e2e that logs in with the new email. This is the change's headline risk and its headline test |
| **A user changes their email to an address they do not control** (typo, or an attacker with an open session) and cannot log in again | Medium | High | Decision 2's current-password requirement is the safeguard shipped now. Confirm-before-switch (verification email) is the real fix and is deferred — **trigger: the first support case, or the arrival of any email-sending capability** |
| **`nombre` leaks into logs** — it is PII and, unlike email, unencrypted | Low | Medium | ADR-033's redaction is mandatory: log field *names*/booleans, never values. Follow `login.use-case.ts`'s `{ emailValido: boolean }` pattern in every new `logger.debug` |
| **Password material reaching a log or an error message** | Low | Critical | `PasswordInvalidaError` carries the rule, never the value (`EmailInvalidoError` echoes the raw input — the new error must **not** copy that trait). Asserted in the VO spec |
| **`403` vs `401` for a wrong current password** confuses the US-042 client into a logout loop | Low | Medium | Decided and documented in §5; the OpenAPI operation states it; US-042 reads the generated types |
| **Session revocation surprises the user** ("why am I signed out on my phone?") | Medium | Low | Decision 1 keeps the current session. The `204` is a UI-messaging concern for US-042, not an API change |
| **`ValidarSesionResult` gaining `tokenHash` spreads a secret-adjacent value** through `req` | Low | Medium | It is a SHA-256 hash, already the DB's stored form, never the raw token, never logged, never serialized to a response. Single consumer, named in the type's docblock |
| **P2002 handling misfires** because `googleSub` is also `@unique` on `User` | Low | Medium | The catch must inspect `error.meta.target` and only map the `emailBlindIndex` constraint; anything else propagates. Pinned by a repository spec |
| **Contract drift** (`openapi.json`, api-client) | Low | Low | Existing CI gates (`openapi:check`, api-client job) |
| **Scope creep into the Configuración UI** | **High** | Medium | Explicit non-goal, stated three times (scope table, affected areas, here). US-040 must not change a single `apps/web` source file |
| **Issue #274's CA-03 stays stale** and verification checks against wording nobody updated | Medium | Low | Header action item; the spec phase writes the widened criterion |

## Success criteria

| AC | Criterion |
|----|-----------|
| **CA-01** | `PATCH /api/perfil` updates `nombre` and/or `email` for the session's user and returns `200` with the updated identity; `GET /api/auth/me` reflects it |
| **CA-02** | On an email change, ciphertext and `emailBlindIndex` are written **in one UPDATE, both derived from the same `Email.valor`, using the container's crypto/blind-index instances**. E2E: login with the **new** email succeeds; the old one fails |
| **CA-03** | Changing the password — **and changing the email** — requires `passwordActual`; a mismatch returns the generic `403 PERFIL_RECHAZADO` with no leak and no write |
| **CA-04** | The new password passes `Password.crear()` (8–128 chars) and is stored as an argon2id hash; every domain/application failure is a `Result`, never a thrown exception |
| **CA-05** | An email already claimed by another account returns a response **byte-identical** to CA-03's; the other account is untouched |
| **CA-06** | Both routes derive the user solely from `req.userId`; no schema accepts a user id; the isolation integration test passes |
| — | A password change deletes all of the user's **other** sessions and leaves the caller's session valid |
| — | Demo sessions get `403 DEMO_SOLO_LECTURA` on all three mutations, with `esDemo` a required use-case input |
| — | Zero files changed under `apps/web/` and `apps/mobile/` |
| — | No Prisma migration added |
| — | `openapi.json` + api-client regenerated, drift gates green |
| — | `pnpm api test`, `test:integration`, `test:e2e`, `pnpm api exec tsc --noEmit` all green |

## Delivery and size forecast

**Two chained PRs.** The slices are independently valuable, independently testable and
independently revertable, and they carry different risk profiles — mixing them would put the crypto
invariant and the session semantics under one review.

| PR | Content | Why it stands alone |
|----|---------|---------------------|
| **#1 — Profile read + nombre/email write** | `nombre` on `/auth/me`; `actualizarPerfil` port + repository (the §1 invariant); `ActualizarPerfilUseCase`; `PATCH /api/perfil`; `PerfilRechazadoError` + `PerfilDemoSoloLecturaError` + translator; schemas + contract regen; unit/int/e2e | Ships CA-01/02/05/06 end to end. The highest-risk code, reviewed on its own with the incident evidence in front of the reviewer |
| **#2 — Password change + session revocation** | `Password` VO; `buscarCredencialPorId` + `actualizarPassword`; `revocarOtrasPorUserId`; `tokenHash` through `ValidarSesionResult` → `req`; `CambiarPasswordUseCase`; `PATCH /api/perfil/password`; tests | Ships CA-03/04. Depends on #1 only for the translator and route file it extends |

Rough shape: ~14 hand-written source files plus ~10 spec files across both, plus regenerated
contract artifacts. Each slice is plausibly near the 400-line budget once generated files and tests
are counted — **`Chained PRs recommended: Yes`** is this proposal's leaning, but the `sdd-tasks`
phase owns the binding forecast.

## Rollback plan

1. **No migration, no data transformation.** Rollback is `git revert` + redeploy; the endpoints
   disappear and `/auth/me` loses `nombre`.
2. **Profile edits already made survive the revert and stay correct.** A changed `nombre` or
   `passwordHash` is just a column value. A changed email is a valid ciphertext + blind-index pair
   that the *unchanged* login path reads correctly — the read side is not touched by this change.
3. **Revoked sessions do not come back**, by design. Affected users log in again. No corruption.
4. **The generated contract must be reverted with the code** — an `openapi.json` advertising
   `/api/perfil` after the routes are gone would send US-042's client at a 404. The CI drift gate
   makes this automatic.
5. **The one unrecoverable case**: a user who changed to an email they do not control and then lost
   their password. A revert does not restore the old address — recovery is a manual DB fix (or
   Supabase PITR). This is precisely the risk the deferred confirm-before-switch would close.

## Capabilities

### New capabilities

- `perfil-usuario`: self-service profile editing for the session's own user — reading `nombre`,
  updating `nombre`/`email` with the encrypted-column + blind-index invariant, changing the password
  with current-password re-verification, the demo gate, the shared anti-enumeration error, and the
  revoke-other-sessions rule. Requirement family `PERF040-*`.

### Modified capabilities

- `user-authentication`: **AUTH-09** — `GET /api/auth/me` returns `nombre` in addition to `userId`,
  `email` and `esDemo`. Delta only; no other AUTH requirement changes.

`catalogo-clasificacion-ownership` is **unrelated and must not be modified**. `user-data-isolation`
needs no delta — CA-06 is an instance of its existing requirement, verified by a new test.

## Open questions (non-blocking — resolve in design)

1. **Must `passwordNueva` differ from the current password?** Cheap to add (the hasher is already in
   hand), prevents a confusing no-op. Leaning: **no** — no criterion asks for it, and the failure is
   harmless. Record the decision either way.
2. **Should `PATCH /api/perfil` return `200` with a body or `204`?** Leaning `200` with the identity
   shape, so US-042 can refresh its cached identity without a follow-up `GET /api/auth/me`.
3. **Does a nombre-only edit really skip `passwordActual`?** Leaning yes (decision 2 is scoped to the
   email). The design must express the conditional in **both** the Zod schema (400 courtesy) and the
   use case (the real rule) without duplicating the *reason*.
4. **Where the current-password read comes from** — a new `buscarCredencialPorId(userId)` on the
   credential port vs. widening `buscarIdentidad`. Leaning: a separate method, because `IdentidadUsuario`
   is deliberately hash-free and feeds a response DTO.
5. **`PERF040-*` numbering** and whether the revoke-other-sessions rule belongs in `perfil-usuario`
   or as a `user-authentication` delta. Leaning: `perfil-usuario` — it is a property of the profile
   endpoint, not of the session lifecycle in general.
