# Design: US-040 — Edit profile (nombre, email, password), API only

- **Change**: `us-040-editar-perfil`
- **Status**: Designed (2026-08-12)
- **Inputs**: `proposal.md` (binding decisions 1–3, open questions 1–5),
  `specs/perfil-usuario/spec.md` (PERF040-01…09), `specs/user-authentication/spec.md` (AUTH-09 delta)
- **Precedent**: `openspec/changes/archive/2026-08-12-us-039-eliminar-categoria-en-uso/design.md`
  (Q-then-D structure, exhaustive-translator guard, compile-error-as-cleanup-mechanism)
- **New ADR**: **No.** ADR-013 already mandates the encrypted-column + blind-index shape; this change
  is its first *application-layer writer*, not a new decision. ADR-005 (layering), ADR-028 (Express +
  manual composition root), ADR-033 (logging redaction), ADR-036/037 (demo gate, identity is the
  owned row) all hold unchanged. ADR-034/035 (Google login) are untouched — linking is US-041.

---

## 0. Framing

This change adds **three write paths** to a codebase that, until now, has had **zero** application-layer
writers for `User.nombre`, `User.email`/`emailBlindIndex` and `User.passwordHash`. The only writers
that ever existed are `prisma/seed.ts` and `prisma/backfill-email-blind-index.ts` — both one-off
scripts, both **open-coding** the email pair (`crypto.encrypt(n)` + `blindIndex.compute(n)` from the
same `const normalizado`), and one of them produced a real production lockout on 2026-08-02.

So the design's job is not "where do I put a PATCH handler". It is:

1. Give the `email` ↔ `emailBlindIndex` derivation **one home** whose shape makes the half-write
   unrepresentable, not merely discouraged (§2/D-01, §4.1).
2. Make every gate a **compile error when forgotten**, not a runtime hole: `esDemo` required,
   `tokenHashActual` required, `nombre` required on `IdentidadUsuario`, `tokenHash` required on
   `ValidarSesionResult`, and an exhaustive `never` guard in the HTTP translator (§2/D-06).
3. Collapse two *different* failures into **one indistinguishable response**, without cargo-culting
   login's timing trick that does not apply here (§2/D-04).
4. Order two writes across two aggregates so that the forbidden interleaving is unreachable, and
   **enumerate honestly what the ordering still leaves open** (§4.3).

Everything else is an application of idioms already in the repo. Where this design departs from the
proposal, the departure is marked **CORRECTION** and carries its reason. There are three of them
(§1/Q2, §1/Q4, §7).

The five open questions are resolved first (§1), because three of them change what the code looks
like.

---

## 1. Open questions resolved

### Q1 — Must `passwordNueva` differ from the current password? ⇒ **No. Recorded as a decision, with the trigger and the exact shape if it is ever added.**

Confirmed as the proposal leaned, but the reasoning is not "it does not matter" — it is that the
check protects against nothing and costs a whole error path.

**What actually happens on a same-password change**: the current password verifies, `Password.crear`
passes, argon2 produces a *different* hash (new salt), every other session is revoked, the row is
updated. The user who did this because they suspected a leak **still got the remedy they came for** —
the stolen session token is dead (PERF040-06). The password itself being unchanged is only a problem
if the *password* leaked, and in that case they typed the wrong thing, which no server-side check can
diagnose for them.

**What the check would cost**: a new domain error class + spec, a new `code` in `aPerfilHttpError`, a
new `400` response in the OpenAPI operation, a regenerated client type, and a spec scenario the
already-written `perfil-usuario/spec.md` does not ask for.

**Rejected implementation note, recorded so it is not re-derived**: if it is ever added, compare the
two **plaintexts** (`input.passwordActual === input.passwordNueva`) — never a second
`hasher.verificar(passwordNueva, cred.passwordHash)`. Both values are the caller's own inputs, known
to the caller in full, so a plain `===` leaks nothing and costs no argon2 run; a second verify would
double the endpoint's CPU cost for a cosmetic check. It belongs **after** `Password.crear()` and
**before** `hasher.hash()`, as `PasswordSinCambioError` → `400 PASSWORD_SIN_CAMBIO`.

**Trigger to revisit**: a support case showing a user believed they rotated and did not.

### Q2 — `200` with a body vs `204` ⇒ **`200 AuthMeResponse` for `/api/perfil`, `204` for `/api/perfil/password`. The asymmetry is the point.** — with a **CORRECTION** to how the body is produced

The two endpoints answer different questions, so a uniform answer would be wrong on one of them:

| Endpoint | Status | Why |
|---|---|---|
| `PATCH /api/perfil` | `200` + identity | It mutates **displayable, cached** state (`nombre`, `email`) **and normalizes it**. `Email.crear()` trims and lowercases, so `"  Jorge@Example.COM "` is stored as `jorge@example.com`. A client that optimistically echoes its own input therefore caches a value the server does not have. Returning the post-write identity is the only way US-042 can refresh its cache correctly, and it does so without a second `GET /api/auth/me` |
| `PATCH /api/perfil/password` | `204` | It mutates nothing displayable. The only post-state is a hash, which must never leave the server. A `200 {}` would be an envelope pretending to carry data |

**The response shape is `authMeResponseSchema` (`AuthMeResponse`), reused — not a new
`PerfilResponse`.** One identity shape ⇒ one OpenAPI `$ref` ⇒ **one** generated client type that
US-042 can drop straight into its cache. A second schema with byte-identical fields would be two
types the client must prove equal by hand, which is the drift this repo already avoids by generating
(ADR-011/012). `esDemo` riding along is not noise: it is part of the identity, and it is always
`false` here (a demo session cannot reach this code, PERF040-08). The schema's `meta.description`
names both endpoints.

**CORRECTION to the proposal — where the body comes from.** The proposal wrote the port method as
`Promise<Result<void, EmailNoDisponibleError>>`, which forces the use case to re-read via
`buscarIdentidad(userId)` after the write. That re-read has an unrepresentable-state branch:
`buscarIdentidad` returns `null` for a deleted row *or* for the fail-closed "real user with `null`
email" case, and the use case would then have to invent a business error for a state that is not a
business outcome — or return `401`, which §2/D-04 explicitly bans. Application code may not throw
(ADR-005), so there is no clean answer at that layer.

**Decision**: `actualizarPerfil` returns the updated identity, mapped from the row `prisma.user.update()`
already returns:

```ts
actualizarPerfil(input: {
  userId: string;
  nombre?: string;
  email?: Email;
}): Promise<Result<IdentidadUsuario, EmailNoDisponibleError>>;
```

Three reasons this is better, not just different:

1. **It is the established repository idiom in this codebase.** `ICategoriaRepository.crear()` and
   `.actualizar()` both return the written entity (`CategoriaConPatrones`). A write that returns what
   it wrote is not a second responsibility here; it is the house style.
2. **The impossible state moves to the layer where handling it is legal.** The repository *may*
   throw for infrastructure failures — its own port docblock says so ("Este puerto no lanza para
   casos de negocio; solo puede rechazar por fallas de infraestructura"). A non-demo user whose
   `email` is `null` after a successful update is a corrupted row, not a business outcome: the
   repository throws, `errorMiddleware` answers `500`, and the bug stays visible.
3. **One round trip, and the returned row is provably the post-write row** — no window between write
   and read.

Drift between the two producers of the identity payload (`buscarIdentidad`, `actualizarPerfil`) is
contained structurally: both map through the **same private `aIdentidadUsuario(row)`** in the same
file (which is where the fail-closed guard lives, once), and both endpoints serialize against the
**same** `authMeResponseSchema`, pinned by a schema spec.

### Q3 — `buscarCredencialPorId` vs widening `buscarIdentidad` ⇒ **a separate method. Widening is a structural hazard, not a style preference.**

Confirmed as the proposal leaned, with the argument sharpened and one **consequence the proposal did
not surface** (Google-only users).

```ts
buscarCredencialPorId(userId: string): Promise<CredencialUsuario | null>;
```

- `IdentidadUsuario` is **serialized to the wire in two places** after this change (`GET /api/auth/me`,
  `PATCH /api/perfil`). Putting `passwordHash` on it would leave an argon2 hash exactly one careless
  `res.json(identidad)` refactor away from a response body. Today both routes spread fields
  explicitly; that is a convention, not a barrier. Keeping the hash out of the type **is** the barrier.
- **No new type is needed.** `CredencialUsuario` (`{ userId, passwordHash }`) already exists and is
  exactly this shape. The new method is a second lookup key (primary key instead of blind index) for
  a type the port already carries.
- **ISP**: `ObtenerIdentidadUseCase` would otherwise depend on a field it must never read.

**Null semantics — mirror `buscarPorEmail` exactly**: return `null` both for "no such user" and for
"user has no `passwordHash`". This matters more than it looks.

> **Consequence, not previously recorded: a Google-only user cannot change their email or password.**
> ADR-034/035 create users who authenticate with `googleSub` and may have `passwordHash = null`. For
> them `buscarCredencialPorId` returns `null`, the use case answers the generic `PerfilRechazadoError`
> (`403 PERFIL_RECHAZADO`), and there is no way forward from the API. **`nombre`-only edits still
> work**, because they do not require the current password (Q4).
>
> This is the correct behaviour to ship, not a bug: a distinct "you have no password, set one first"
> error would be a new identity affordance (a password-set flow with no current-password to verify —
> i.e. an account-takeover surface if it were ever reachable from a stolen session), and it is the
> natural companion of **US-041**'s link/unlink work, not of this change. **Trigger**: ship it with
> US-041, or the first support case, whichever comes first.

**No timing equalization on this lookup, deliberately.** Login's `HASH_DUMMY_PARA_TIMING` exists
because its unknown-email branch skips argon2 entirely and the caller is *anonymous*. Here the caller
is already authenticated **as the account in question** — "does my own account have a password" is
information they already have. Adding a dummy hash would be cargo cult; §2/D-04 records the same
argument for the shared error.

### Q4 — The `nombre`-only conditional ⇒ **one helper produces the email column pair or an empty object; the conditional itself is split across two layers with two different jobs**

Two sub-questions hide here. Both matter.

**(a) How the write path avoids touching the email columns.** Neither a bare branch nor a partial
input type. The mechanism is a **single expression that can only produce the pair or nothing**:

```ts
/**
 * camposEmail — la ÚNICA derivación del par (email, emailBlindIndex) en toda
 * la app (PERF040-02, ADR-013). Ambas columnas salen del MISMO `email.valor`
 * (ya normalizado por Email.crear — trim + lowercase), en el MISMO literal,
 * usando las instancias `crypto`/`blindIndex` que el composition root
 * construyó UNA vez (container.ts:117-135). Ausencia ⇒ `{}`: Prisma no
 * emite columna alguna, así que un PATCH de solo `nombre` deja el ciphertext
 * y el índice BYTE-IDÉNTICOS.
 *
 * NO devolver `{ email: undefined, emailBlindIndex: undefined }`: funciona en
 * Prisma, pero deja de ser imposible escribir media pareja (un `null` por
 * error NULea la columna). El `{}` no puede expresar media pareja.
 */
private camposEmail(email: Email | undefined) {
  if (email === undefined) return {};
  return {
    email: this.crypto.encrypt(email.valor),
    emailBlindIndex: this.blindIndex.compute(email.valor),
  };
}
```

Why this and not the alternatives:

| Alternative | Rejected because |
|---|---|
| Inline `if` inside `actualizarPerfil`, appending to a mutable `data` object | The two assignments become two statements a future edit can separate. The whole point is that they are one expression |
| A discriminated union on the port input (`{nombre} \| {email, ...}`) | It encodes the *transport* rule ("at least one of") in the port, complicates every call site, and does **not** prevent the actual hazard (a half-written pair inside the adapter). Complexity with no payoff — YAGNI/KISS |
| Extract a shared helper for `seed.ts` / `backfill-email-blind-index.ts` too | Rule of three (`yagni`): two one-off scripts outside the app + one adapter. **Trigger recorded: a third in-app writer ⇒ extract.** The scripts stay as they are; refactoring them is an explicit non-goal |

`nombre` uses the same absence-is-`{}` shape, so the whole `data` object is two spreads (§4.1).

**(b) Where the "email ⇒ `passwordActual` required" rule lives — without duplicating the *reason*.**
It lives in **both** layers, but they state **different things**, which is why it is not duplication:

| Layer | States | Failure |
|---|---|---|
| `perfilUpdateRequestSchema` (Zod) | **Shape**: "`passwordActual` is required when `email` is present"; "at least one of `nombre`/`email`" | `400 BODY_INVALIDO` — a malformed request, no security claim made |
| `ActualizarPerfilUseCase` | **Policy**: an email change is re-authenticated (binding decision 2, PERF040-03) — and a **missing** `passwordActual` collapses into the *same* generic rejection as a **wrong** one | `403 PERFIL_RECHAZADO` |

The use-case branch is therefore not a restatement of the Zod rule: it is the anti-enumeration
collapse (§2/D-04), and it is what makes the rule real for any non-HTTP caller. The schema's docblock
points at the use case as the authority in one sentence — the `categorias.schema.ts` layer-honesty
precedent — and does **not** restate the rationale.

Pinned by a unit test that bypasses the schema entirely: calling the use case directly with
`{ email, passwordActual: undefined }` must return `PerfilRechazadoError`. If that test can be made
green by deleting the use-case branch, the rule was living in the wrong layer.

**And the `nombre`-only path requires nothing**: no `passwordActual`, no credential lookup, no argon2
run, no email derivation. Confirmed against binding decision 2 (scoped to the email, which is the
account key) — a `nombre` edit has no takeover value, so requiring re-authentication would be pure
friction.

### Q5 — `PERF040-*` placement ⇒ **confirmed as written in the spec; recording *why*, because the boundary is not obvious**

`specs/perfil-usuario/spec.md` already exists with `PERF040-01…09`, and the revoke-other-sessions
rule is `PERF040-06` **in `perfil-usuario`**, not a `user-authentication` delta. `user-authentication`
carries only the AUTH-09 delta (`nombre` in the identity payload). This design confirms both and
supplies the argument the spec states only implicitly:

`user-authentication` (AUTH-04…07) owns the session **mechanism** — issuing, validating, expiring and
revoking a token. PERF040-06 is a **policy that consumes** that mechanism, triggered by, and only by,
a password change through this endpoint. Filing it under `user-authentication` would say "sessions
behave this way", which is false: nothing else in the product revokes siblings. Filing it under
`perfil-usuario` says "changing your password behaves this way", which is exactly the claim.

**Boundary for the future**: a "log out everywhere" control (revocation triggered by the session
lifecycle itself, not by a profile edit) **would** belong in `user-authentication`. That is the line.

Design-element → requirement mapping (used by `sdd-verify`):

| Requirement | Owned by |
|---|---|
| PERF040-01 | `perfilUpdateRequestSchema` (`.strict()` + both refines), `ActualizarPerfilUseCase`, `camposEmail` absence branch |
| PERF040-02 | `camposEmail` + the single `prisma.user.update()` (§4.1) |
| PERF040-03 | `ActualizarPerfilUseCase` step 2, `CambiarPasswordUseCase` steps 2–3, `buscarCredencialPorId` |
| PERF040-04 | `PerfilRechazadoError` (one class, one message) + the repository's targeted P2002 catch (§4.2) |
| PERF040-05 | `Password` VO + `IPasswordHasher` + `actualizarPassword` |
| PERF040-06 | `ISessionRepository.revocarOtrasPorUserId` + `ValidarSesionResult.tokenHash` → `req.sessionTokenHash` (§4.3) |
| PERF040-07 | `.strict()` schemas + `req.userId!` only (§2/D-05) |
| PERF040-08 | `PerfilDemoSoloLecturaError` + required `esDemo` input on both use cases |
| PERF040-09 | `openapi-document.ts` + `openapi:check` + api-client `generate`/`typecheck` |
| AUTH-09 (delta) | `IdentidadUsuario.nombre` (required), `buscarIdentidad` select, `authMeResponseSchema` |

---

## 2. Architecture decisions (D-numbered)

### D-01 — The email write-invariant has exactly one home: `PrismaUserCredentialRepository`

The port method takes the **`Email` value object**, never a `string`. This is the load-bearing
sentence of the change, so state precisely what it buys and what it does not:

- **A raw body string cannot reach the write path — it does not type-check.** `Email.crear()` is the
  only normalizer in the codebase, `email.valor` is what the read path (`buscarPorEmail`,
  `PrismaIdentidadGoogleRepository.buscarPorEmail`) already hashes, and `Email`'s constructor is
  `private`. There is no way to fabricate an `Email` carrying an un-normalized value.
- **Both columns are written in one `prisma.user.update()`**, from one `camposEmail()` call, from one
  `email.valor` binding. A single Postgres `UPDATE` is atomic across columns.
- **No new collaborator is introduced.** The adapter already holds the `crypto` and `blindIndex`
  instances the composition root built once (`container.ts:117-135`) — the same ones its own
  `buscarPorEmail` uses. Nothing is re-derived, so a key mismatch of the 2026-08-02 kind is not
  expressible here.

Why the repository and not an application-layer helper: the **read** side of this exact pair
(`WHERE emailBlindIndex = blindIndex.compute(email.valor)`) already lives in that file. Putting the
write beside it keeps derivation symmetric in one file, under one docblock explaining both
directions. An application helper would create a *second* place that knows the derivation while the
repository still knows the lookup — two homes for one invariant, which is the problem, not the fix.
`Email` is a domain type, so the port stays framework-free (ADR-005); `buscarPorEmail(email: Email)`
already sets that precedent.

**No pre-flight "is this email taken?" lookup.** It is a TOCTOU race that adds a query, still needs
the P2002 catch for correctness, and turns the endpoint into a cleaner enumeration oracle. Rely on
the constraint — the `vincularGoogleSub` precedent (§4.2).

### D-02 — `Password` is a real value object; hashing stays in infrastructure

**Confirmed** — and the YAGNI counter-argument ("one consumer today") is answered by the fact that
the alternative parks a business rule where the architecture forbids it. There is **no** password
validation anywhere in the codebase today (not in `Argon2PasswordHasher`, not in `LoginUseCase`, not
in any Zod schema), so CA-04/PERF040-05 requires writing the rule from scratch. The only question is
where.

```ts
// domain/value-objects/password.ts
export class Password {
  private static readonly MIN = 8;
  private static readonly MAX = 128;
  private constructor(readonly valor: string) {}
  static crear(raw: string): Result<Password, PasswordInvalidaError> { … }
  /** Defensa en profundidad: el VO NUNCA se serializa en claro. */
  toJSON(): string { return '[REDACTED]'; }
}
```

- **Rules: 8–128 characters, length over composition classes** (NIST 800-63B). The upper bound is an
  argon2 CPU-cost guard, not cosmetics. No forced symbol/digit classes, no dictionary check.
- **The number lives in one place.** `passwordUpdateRequestSchema` keeps type/presence checks only
  (`z.string()`); it does **not** restate the length. Same layer-honesty gate as
  `categorias.schema.ts`'s `bucket`/`nombre`.
- **Hashing is not in the VO.** The VO is domain: synchronous, pure, dependency-free. argon2id is
  async, CPU-bound infrastructure and already has a port (`IPasswordHasher`) and an adapter
  (`Argon2PasswordHasher`). The use case calls `hasher.hash(password.valor)`; the VO never touches it.
- **`toJSON()` is a deliberate new micro-pattern** (no other VO in the repo has one), justified by the
  proposal's CRITICAL risk "password material reaching a log". `SENSITIVE_REDACT_PATHS` covers
  `password`/`*.password` **keys**, so a `logger.debug('…', { nuevaPassword: vo })` would serialize
  `{"valor":"secreto"}` under an unredacted path. `toJSON()` closes that vector at the object, not at
  the key name. Asserted at the `JSON.stringify` level in the VO spec (§6.2), which is a mechanism
  test, not a pino-internals test.
- **`PasswordInvalidaError` carries the RULE, never the value.** It must **not** copy
  `EmailInvalidoError`'s `rawValue` field (that field exists for server-side logging of a
  non-secret; a password is a secret). Pinned by a spec asserting the serialized error contains
  neither the attempted password nor any substring of it.

### D-03 — Two endpoints, never one

`PATCH /api/perfil` and `PATCH /api/perfil/password` have different security semantics (one
re-authenticates and expels sessions; one does not), disjoint error sets, and different success
codes (Q2). Merging them would invent a partial-failure question ("email changed but password did
not") that no requirement asks and no client wants.

**No new `GET /api/perfil`**: it would duplicate `/api/auth/me` field for field and give the web two
competing identity sources. `nombre` is added to the existing payload instead (AUTH-09 delta) — this
is also why `PATCH /api/perfil` returns `AuthMeResponse` (Q2).

### D-04 — One generic rejection, `403`, no timing theatre

**Wrong current password**, **missing current password on an email change**, **email already claimed
by another account**, and **caller has no `passwordHash` at all** (Q3) all collapse into a single
`PerfilRechazadoError` → `403 PERFIL_RECHAZADO`, one message. This is `LoginUseCase`'s
`CredencialesInvalidasError` property, transplanted: since binding decision 2 makes the current
password mandatory for any email change, an attacker probing addresses cannot separate "taken" from
"you typed your password wrong" (PERF040-04).

**`403`, not `401` — verified against the web, not assumed.** In `apps/web`, `client.ts` maps
`res.status === 401` to `{ tag: 'unauthorized' }`, and `routes/_authenticated.tsx`'s `beforeLoad`
calls `requireSession(fetchMe, …)`, which `throw redirect({ to: '/login' })` on any non-ok result.
`401` is therefore hard-wired in this product to mean "your session died, go log in again". Returning
it for a password typo inside the Configuración form would risk bouncing the user out of the form
they are filling. `403` is the honest semantics: the request was understood, authenticated, and
refused.

> **Handoff note for US-042** (not work for US-040): `client.ts` currently folds any other non-2xx
> into `{ tag: 'server', status }` with a generic message, so US-042 needs a profile-specific client
> function that reads the `{ message, code }` body to render an inline form error. The `code` is in
> the contract precisely so it does not have to string-match the message.

**Timing equalization is deliberately NOT replicated.** Login's dummy hash exists because its
unknown-email branch skips argon2 entirely for an *anonymous* caller. Here the current-password
verification runs on every branch that reaches a lookup, and the caller is already authenticated as
the account in question. Adding a dummy hash would be cargo cult. (The one branch that skips argon2
is "caller has no `passwordHash`" — Q3 shows that leaks nothing, because the caller already knows.)

### D-05 — `esDemo` and self-scoping are compile-enforced, not remembered

- `esDemo: boolean` is a **required** input field on both use cases, gated at the very top before any
  repository call — the `crear-categoria.use-case.ts` precedent. Forgetting to thread it from
  `req.esDemo!` is a **compile error**.
- A new `PerfilDemoSoloLecturaError` (own class, same `DEMO_SOLO_LECTURA` code, message pointing at
  registering a real account) rather than reusing `CatalogoDemoSoloLecturaError`, which would drag the
  catalog error union into a different exhaustive translator. **Third occurrence ⇒ generalize.**
- PERF040-07 is structural and nearly free: both routes read `req.userId!` / `req.esDemo!`, neither
  schema accepts a user id, and both schemas are `.strict()` — so a body carrying `userId` is
  **rejected with `400`**, not silently ignored. There is no field to tamper with.

### D-06 — Every new gate is a compile error when omitted

The cleanup/threading order for the tasks phase is mechanical because four type changes each
enumerate their own fallout via `tsc --noEmit`:

| Type change | What breaks (deliberately) |
|---|---|
| `IdentidadUsuario` gains **required** `nombre: string` | every fixture that builds one: `obtener-identidad.use-case.spec.ts`, `prisma-user-credential.repository.spec.ts`, `auth.routes.spec.ts`, `app.auth.spec.ts`, `auth-me.schema.spec.ts` |
| `ValidarSesionResult` gains **required** `tokenHash: string` | `validar-sesion.use-case.spec.ts`, `session.middleware.spec.ts` |
| `esDemo` / `tokenHashActual` required on the new use-case inputs | any route that forgets to thread them |
| `aPerfilHttpError`'s `const _exhaustive: never = error` | any error class added to the union without a mapping — **and**, in the other direction, adding `EmailNoDisponibleError` to `ActualizarPerfilError` stops compiling, which is the proof that it never reaches HTTP |

Sequence the work by making the type change first and letting `tsc` list the sites (US-039 D-04
precedent). Do not hunt references by grep.

### D-07 — `nombre` joins the redaction net; the rest is discipline

`nombre` is **plaintext PII** (ADR-013 scoped encryption to email + account number; widening it is
its own change and an explicit non-goal here). It is **not** currently in
`SENSITIVE_REDACT_PATHS` — verified: the list covers `cargo/abono/monto/montos/email/numeroCuenta/rut/password/authorization/cookie` and their `*.` variants.

**Decision: add `'nombre'` and `'*.nombre'` to `SENSITIVE_REDACT_PATHS`.** Verified there is
currently **zero** `logger.*` call site passing a `nombre` field anywhere in `apps/api/src`, so the
change has no collateral today. The accepted future cost is that a log line carrying a *category*
name would print `[REDACTED]` — a false positive that is cheap, non-destructive, and whose correct
fix is to log `categoriaId` instead, which is the better log line anyway.

The net is defence in depth, **not** the rule. The rule is unchanged and mandatory (ADR-033,
`login.use-case.ts`'s `{ emailValido: boolean }` pattern): **log field names and booleans, never
values.** Every new log line in this change:

```ts
this.logger.debug('actualizar-perfil: campos solicitados', {
  cambiaNombre: input.nombre !== undefined,
  cambiaEmail:  input.email  !== undefined,
});
this.logger.debug('actualizar-perfil: verificación de password actual', { passwordValida });
this.logger.debug('cambiar-password: sesiones revocadas', { userId });
```

No `nombre`, no email, no password, no token, no hash — ever, in any of the three paths.

---

## 3. Module and layer map

Refines the proposal's Affected-areas table. **Bold rows are corrections or additions** where the code
disagreed with the proposal or the proposal was silent.

### 3.1 `domain/`

| File | Action | Detail |
|---|---|---|
| `value-objects/password.ts` (+ spec) | **New** | D-02. `crear()` (8–128), `valor`, `toJSON() → '[REDACTED]'` |
| `errors/password-invalida.error.ts` (+ spec) | **New** | Carries the rule. **No `rawValue`** — explicitly unlike `EmailInvalidoError` |
| `errors/perfil-rechazado.error.ts` (+ spec) | **New** | The shared generic rejection (D-04). One message: `"No pudimos actualizar tu perfil. Revisá los datos ingresados."` |
| `errors/perfil-demo-solo-lectura.error.ts` (+ spec) | **New** | D-05. Message points at registering a real account |
| `errors/email-no-disponible.error.ts` (+ spec) | **New** | Returned by the port on a `emailBlindIndex` P2002. Docblock: *never crosses the HTTP boundary* — the use case collapses it into `PerfilRechazadoError` |
| **`errors/nombre-perfil-invalido.error.ts` (+ spec)** | **New — addition beyond the proposal** | See the action item below |
| `value-objects/email.ts` | **Unchanged** | Already the single normalizer |

> **Addition beyond the proposal, flagged for the tasks/spec phase.** The proposal specifies no
> validation for `nombre`. Without one, `PATCH /api/perfil` with `nombre: ""` **erases the user's
> displayed name** through the shipped UI — a reachable, user-visible break, not a hypothetical.
> Decision: validate in `ActualizarPerfilUseCase` (trim, 1–80 chars) with
> `NombrePerfilInvalidoError` → `400 NOMBRE_INVALIDO`, mirroring `CrearCategoriaUseCase`'s inline
> `NOMBRE_MIN`/`NOMBRE_MAX` (80 rather than 40 because personal names are longer than category
> labels; the column is an unbounded `String`).
> **Action item**: add a scenario to `PERF040-01` covering the empty/over-long `nombre` rejection, so
> `sdd-verify` checks the implementation against a criterion that mentions it.

### 3.2 `application/`

| File | Action | Detail |
|---|---|---|
| `ports/user-credential-repository.port.ts` | Modify | `IdentidadUsuario` gains **required** `nombre: string`. Three methods added: `buscarCredencialPorId`, `actualizarPerfil`, `actualizarPassword` (§5.1) |
| `ports/session-repository.port.ts` | Modify | `revocarOtrasPorUserId(userId, tokenHashActual): Promise<void>` (§5.1) |
| `use-cases/actualizar-perfil.use-case.ts` (+ spec) | **New** | §4.1 |
| `use-cases/cambiar-password.use-case.ts` (+ spec) | **New** | §4.3 |
| `use-cases/validar-sesion.use-case.ts` (+ spec) | Modify | `ValidarSesionResult` gains **required** `tokenHash` — the value it **already computes** at line 34 and currently discards. Body change is one field in the `Result.ok`. Docblock names the single consumer |
| `use-cases/obtener-identidad.use-case.ts` | **Unchanged** | Returns `IdentidadUsuario` whole; the new field rides along with zero code change (same passthrough its docblock already documents for `esDemo`) |
| `ports/password-hasher.port.ts`, `ports/logger.port.ts` | **Unchanged** | Both already sufficient |

### 3.3 `infrastructure/`

| File | Action | Detail |
|---|---|---|
| `persistence/prisma-user-credential.repository.ts` (+ spec) | Modify | The invariant's home. `nombre` in `buscarIdentidad`'s select; private `aIdentidadUsuario(row)` extracted and shared; private `camposEmail(email)`; `buscarCredencialPorId`; `actualizarPerfil` with the targeted P2002 catch; `actualizarPassword` (§4) |
| `persistence/prisma-session.repository.ts` (+ spec) | Modify | `revocarOtrasPorUserId` → `deleteMany({ where: { userId, tokenHash: { not: tokenHashActual } } })`. `Session.userId` is already `@@index`ed and `tokenHash` `@unique` — **no migration, no index work** (verified in `schema.prisma:50-59`) |
| `http-express/middleware/session.middleware.ts` (+ spec) | Modify | Writes `req.sessionTokenHash = sesion.tokenHash` next to `req.userId` / `req.esDemo` |
| `http/auth/express-request.d.ts` | Modify | `sessionTokenHash?: string`, with the docblock naming its single consumer and stating it is a SHA-256 hash (the DB's stored form), never the raw token |
| `http-express/routes/perfil.routes.ts` (+ spec) | **New** | `registrarPerfil(router, perfil: PerfilGraph)` — closure-DI, `.safeParse()` at the boundary, never echoes the body or Zod issues |
| `http-express/routes/perfil-http-error.ts` (+ spec) | **New** | `aPerfilHttpError` with the `never` guard (§5.3) |
| `http-express/routes/auth.routes.ts` (+ spec) | Modify | `nombre` added to the `/auth/me` payload |
| `http-express/schemas/perfil.schema.ts` (+ spec) | **New** | Request schemas + `perfilErrorResponseSchema` (§5.4) |
| `http-express/schemas/auth-me.schema.ts` (+ spec) | Modify | `nombre: z.string()`; description names both endpoints that return it |
| `http-express/schemas/openapi-document.ts` (+ spec) | Modify | Two new operations + two new paths, append-only (§5.5) |
| `http-express/app.ts` (+ `app.auth.spec.ts`) | Modify | `registrarPerfil(protectedApi, container.perfil)` — mounted on the **protected** router, after `sessionMiddleware`, alongside `registrarAuthMe` |
| `logging/pino-logger.ts` (+ spec) | Modify | `'nombre'`, `'*.nombre'` added to `SENSITIVE_REDACT_PATHS` (D-07) |
| `http/auth/argon2-password-hasher.ts` | **Unchanged** | `hash()` already exists and is already used by `seed.ts` |

### 3.4 `composition/`

| File | Action | Detail |
|---|---|---|
| `crear-perfil.ts` | **New** | `PerfilGraph { actualizarPerfil, cambiarPassword }`, built by `crearPerfil(prisma, crypto, blindIndex, logger)` |
| `container.ts` | Modify | One line: `const perfil = crearPerfil(prisma, crypto, blindIndex, logger);` + the `Container` field and its docblock |
| `derive-blind-index-key.ts` | **Unchanged** | **Non-negotiable**: `crearPerfil` MUST NOT call `deriveBlindIndexKey`, `new AesGcmCryptoService` or `new HmacBlindIndexService`. It receives the container's single instances, exactly as `crearAuthGoogle`/`crearAuthGoogleMobile` already do |

`crearPerfil` builds its own stateless adapters (`PrismaUserCredentialRepository`,
`PrismaSessionRepository`, `Argon2PasswordHasher`) over the shared `prisma`/`crypto`/`blindIndex`.
That is the `crearAuthGoogle` precedent verbatim (it builds its own `PrismaIdentidadGoogleRepository`
over the shared `blindIndex`) and it avoids widening `AuthGraph` to export adapters, which would leak
infrastructure through a graph that currently exposes only use cases.

The guard that a wrong key instance was never introduced is **the e2e in §6.4** — logging in with the
new email fails loudly if the write used a different key than the read. That is a stronger guarantee
than any "did not call `new`" assertion could be.

### 3.5 Generated / contract

| Artifact | Action |
|---|---|
| `apps/api/openapi.json` | Regenerated (`pnpm api openapi:emit`) |
| `packages/api-client/src/types.gen.ts` | Regenerated (`pnpm --filter @moneydiary/api-client generate`) |

### 3.6 Confirmed untouched

- **`apps/api/prisma/schema.prisma` + migrations** — verified: `nombre String` (required, line 17),
  `email String?`, `emailBlindIndex String? @unique`, `passwordHash String?`, `googleSub String? @unique`,
  `Session.tokenHash @unique` + `@@index([userId])`. **No migration. If one appears in the diff, the
  change went off-design.**
- **`prisma/seed.ts`, `prisma/backfill-email-blind-index.ts`** — explicit non-goal (rule of three, Q4a).
- **`apps/web/**`, `apps/mobile/**`** — US-042 owns the UI; the `/auth/me` change is additive.
  **Zero files changed under either.**
- **`LoginUseCase`, `LogoutUseCase`, `CrearDemoUseCase`, the Google login graphs** — untouched.
  `ValidarSesionUseCase` changes by one returned field only.

---

## 4. The three write paths, end to end

### 4.1 `PATCH /api/perfil` — nombre and/or email

**Use case order** (guard clauses, `Result.fail` first — KISS §3):

```
1. esDemo                      ⇒ PerfilDemoSoloLecturaError            (403 DEMO_SOLO_LECTURA)
2. nombre present?  trim, 1..80 ⇒ NombrePerfilInvalidoError            (400 NOMBRE_INVALIDO)
3. email present?
   3a. Email.crear(raw)         ⇒ EmailInvalidoError                   (400 EMAIL_INVALIDO)
   3b. passwordActual missing   ⇒ PerfilRechazadoError                 (403 PERFIL_RECHAZADO)
   3c. buscarCredencialPorId → null ⇒ PerfilRechazadoError             (403)
   3d. hasher.verificar false   ⇒ PerfilRechazadoError                 (403)
4. creds.actualizarPerfil({ userId, nombre?, email? })
     └─ EmailNoDisponibleError  ⇒ PerfilRechazadoError                 (403)
5. Result.ok(identidad)                                                (200 AuthMeResponse)
```

Cheap shape checks (2, 3a) run before the expensive argon2 verify (3d). That ordering leaks nothing:
every one of those failures is about the **caller's own input**, never about another account. The
only outcomes that could distinguish another account's state are 3d and 4, and they are the same
response (D-04).

**The adapter**:

```ts
async actualizarPerfil(input: {
  userId: string; nombre?: string; email?: Email;
}): Promise<Result<IdentidadUsuario, EmailNoDisponibleError>> {
  try {
    const row = await this.prisma.user.update({
      where: { id: input.userId },
      data: {
        ...(input.nombre === undefined ? {} : { nombre: input.nombre }),
        ...this.camposEmail(input.email),          // {} o el par completo — §1/Q4a
      },
      select: { id: true, nombre: true, email: true, esDemo: true },
    });
    const identidad = this.aIdentidadUsuario(row);
    if (identidad === null) {
      // Fila inconsistente (usuario real con email null) — NO es un resultado
      // de negocio. Falla de infraestructura ⇒ 500 vía errorMiddleware.
      throw new Error(`Identidad inconsistente tras actualizar el perfil de ${input.userId}`);
    }
    return Result.ok(identidad);
  } catch (error) { /* §4.2 */ }
}
```

**Guarantees in force:**

| # | Guarantee | Enforced by |
|---|---|---|
| G1 | The ciphertext and the blind index always derive from the same normalized string | `camposEmail` reads `email.valor` twice in one literal; `Email.crear` is the only normalizer and its constructor is private |
| G2 | The two email columns are written together or not at all | One `update()`, one `data` object, `{}`-or-pair (§1/Q4a) |
| G3 | A `nombre`-only edit leaves both email columns **byte-identical** | The columns are absent from `data`, so absent from the SQL — PERF040-01's scenario is structural |
| G4 | No key can drift from the read path's key | The adapter reuses the instances the composition root built once; nothing is constructed inside the method (D-01, §3.4) |
| G5 | A taken email is a typed business failure, never a 500 and never a constraint message | The targeted P2002 catch (§4.2) |
| G6 | The mutation can only hit the caller's own row | `where: { id: input.userId }`, and `userId` comes only from `req.userId!`; `.strict()` schemas reject any id-bearing field (D-05) |
| G7 | A failed update leaves the account log-in-able | Every failure branch returns **before** the `update()`; the update itself is atomic (PERF040-02's second scenario) |

### 4.2 The P2002 disambiguation — the exact check, and the test that kills the naive version

`User` has **two** unique constraints: `emailBlindIndex` and `googleSub`. A bare
`error.code === 'P2002'` catch would map *any* unique collision to "that email is taken".

```ts
} catch (error) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    apuntaA(error.meta, 'emailBlindIndex')
  ) {
    return Result.fail(new EmailNoDisponibleError());
  }
  throw error;   // cualquier otra colisión/falla: infraestructura, NO negocio
}

/**
 * `meta.target` es `string[]` (nombres de columna) en la mayoría de las
 * combinaciones driver/versión, pero históricamente también llegó como
 * `string` (nombre del constraint, p. ej. "User_emailBlindIndex_key"). Ambas
 * formas contienen el nombre de la columna, así que ambas se aceptan.
 * DESCONOCIDO ⇒ false ⇒ RETHROW (fail-closed): un 500 visible es mejor que
 * decirle "ese email ya está en uso" a alguien cuya colisión real fue otra.
 */
function apuntaA(meta: unknown, columna: string): boolean {
  const target = (meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) return target.includes(columna);
  if (typeof target === 'string') return target.includes(columna);
  return false;
}
```

**Honest scope of this guard.** As written, `data` never contains `googleSub`, and Postgres only
re-checks a unique index when its columns are written — so a `googleSub` P2002 is **not reachable
through this UPDATE today**. The check is therefore a **structural guard against the next writer**
(US-041 links/unlinks `googleSub`; a future `actualizarPerfil` could grow a column), plus a
fail-closed policy for any collision this code did not anticipate. Saying it is fixing a live bug
would be overstating it; shipping without it would be leaving a trap for US-041.

**The test that would fail against a naive catch** (§6.2):

| Input | Required behaviour |
|---|---|
| `P2002` with `meta: { target: ['emailBlindIndex'] }` | `Result.fail(EmailNoDisponibleError)` |
| `P2002` with `meta: { target: ['googleSub'] }` | **rejects** (throws) — a naive `code === 'P2002'` catch returns `Result.fail` here and the test goes red |
| `P2002` with `meta: undefined` | **rejects** (fail-closed) |
| `P2002` with `meta: { target: 'User_emailBlindIndex_key' }` (string form) | `Result.fail(EmailNoDisponibleError)` |

### 4.3 `PATCH /api/perfil/password` — verify, validate, revoke, write

```
1. esDemo                          ⇒ PerfilDemoSoloLecturaError   (403 DEMO_SOLO_LECTURA)
2. buscarCredencialPorId → null    ⇒ PerfilRechazadoError         (403 PERFIL_RECHAZADO)
3. hasher.verificar(actual) false  ⇒ PerfilRechazadoError         (403)
4. Password.crear(nueva) fail      ⇒ PasswordInvalidaError        (400 PASSWORD_INVALIDA)
5. hash = await hasher.hash(password.valor)
6. await sessions.revocarOtrasPorUserId(userId, tokenHashActual)
7. await creds.actualizarPassword(userId, hash)
8. Result.ok(undefined)                                            (204)
```

**Why verify (3) before validate (4)**: a caller who cannot prove the current password gets no
feedback at all about the new one, and every rejected attempt does the same argon2 work in the same
order. Both orders satisfy PERF040-03/05; this one is the tighter of the two.

**`tokenHashActual` is a required input field**, sourced from `req.sessionTokenHash!`, which
`sessionMiddleware` copies from `ValidarSesionResult.tokenHash` — the value
`ValidarSesionUseCase` **already computes** (`tokens.hashToken(input.token)`, line 34) and today
throws away. Rejected alternative: re-extract the token in the route and re-hash it — that duplicates
a security-relevant derivation and drags `ISessionTokenService` into a route that should stay thin.
Risk of spreading a secret-adjacent value: it is a SHA-256 hash, already the DB's stored form, never
the raw token, never logged (it is not a `SENSITIVE_REDACT_PATHS` key precisely because it must never
be logged at all), never serialized to a response. Single consumer, named in the type's docblock.

**Ordering instead of a cross-aggregate transaction — the argument, validated.** The two writes live
in two different ports (sessions, credentials). Wrapping them in one Prisma transaction would require
a port method owning both aggregates, i.e. an adapter that knows about sessions *and* credentials.
The proposal argues the ordering already puts every failure on the safe side. **That argument holds**,
and here is the complete enumeration — including three modes the proposal did not list:

| # | Situation | Outcome | Verdict |
|---|---|---|---|
| F1 | Revocation (6) fails | Throws before (7); nothing written; other sessions alive; **old password still works** | Fail-closed. Nothing changed |
| F2 | Password write (7) fails after (6) | `500`; other devices must log in again **with the old password, which still works** | Nuisance, never a hole |
| F3 | The forbidden state: new password stored while a **pre-change stolen session** survives | Unreachable — (7) is strictly after (6), and every session existing at (6) is either the caller's (kept by design, PERF040-06) or deleted | This is what atomicity would have bought, obtained by ordering |
| F4 | **New (not in the proposal)** — a session created **between** (6) and (7) | Only creatable by someone who can log in, i.e. who **already has the old password**. The revocation protects against *stolen tokens*, not against a leaked old password | Accepted. Sub-millisecond window, precondition-heavy, and not the threat this rule addresses |
| F5 | **New** — the `204` is lost in transit and the client retries with the old `passwordActual` | The retry now `403`s. The user sees an error for a change that succeeded | Accepted (the standard non-idempotent-write retry problem). Mitigation is US-042 UX: on `403` after a submitted password change, tell the user to try the new password |
| F6 | **New** — two of the user's own sessions change the password concurrently | A revokes B, B revokes A; both writes land, last one wins. The user can end up fully logged out with exactly one of the two passwords valid | Accepted. Requires simultaneous changes from two devices; fail-safe and recoverable by logging in |
| F7 | `tokenHashActual` arrives empty (`''`) | `deleteMany({ tokenHash: { not: '' } })` deletes **every** session including the caller's ⇒ full logout | Degraded, not dangerous (the new password works). No runtime guard — the only producer is the middleware, and a unit test pins the pass-through (§6.2). YAGNI |
| F8 | The user's row is deleted mid-request | `update()` raises P2025 ⇒ propagates ⇒ `500` | Honest: an infrastructure surprise, not a business outcome |

`actualizarPassword(userId, passwordHash): Promise<void>` returns `void`, not `Result`: there is no
business failure left to model at that point — the row was read two steps earlier. It uses `update`
(not `updateMany`) precisely so F8 is loud.

---

## 5. Contracts

### 5.1 Ports

```ts
// application/ports/user-credential-repository.port.ts
export interface IdentidadUsuario {
  readonly userId: string;
  /** AUTH-09 (US-040 delta): nombre de pila del usuario. Requerido — un
   *  campo opcional dejaría que un productor lo olvide en silencio. Es PII
   *  en claro (ADR-013 no lo cifra): NUNCA loguear su valor (ADR-033, D-07). */
  readonly nombre: string;
  readonly email: string | null;
  readonly esDemo: boolean;
}

export interface IUserCredentialRepository {
  buscarPorEmail(email: Email): Promise<CredencialUsuario | null>;
  buscarIdentidad(userId: string): Promise<IdentidadUsuario | null>;

  /** PERF040-03. `null` tanto para usuario inexistente como para usuario sin
   *  passwordHash (login solo-Google, ADR-034/035) — el use case colapsa
   *  ambos al mismo PerfilRechazadoError (no enumeración, §1/Q3). */
  buscarCredencialPorId(userId: string): Promise<CredencialUsuario | null>;

  /** PERF040-01/02. `email` es el VALUE OBJECT, nunca un string: es lo que
   *  hace IMPOSIBLE que un raw body alcance la derivación (D-01). Escribe
   *  ambas columnas del par en UN solo UPDATE. Devuelve la identidad ya
   *  actualizada (idioma del repo: crear/actualizar devuelven la entidad). */
  actualizarPerfil(input: {
    userId: string;
    nombre?: string;
    email?: Email;
  }): Promise<Result<IdentidadUsuario, EmailNoDisponibleError>>;

  /** PERF040-05. `passwordHash` YA viene hasheado por IPasswordHasher — este
   *  puerto nunca ve texto plano. */
  actualizarPassword(userId: string, passwordHash: string): Promise<void>;
}

// application/ports/session-repository.port.ts
export interface ISessionRepository {
  crear(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  buscarPorTokenHash(tokenHash: string): Promise<SesionPersistida | null>;
  revocarPorTokenHash(tokenHash: string): Promise<void>;
  /** PERF040-06. Revoca TODAS las sesiones del usuario MENOS la del hash
   *  dado. Idempotente (deleteMany). `tokenHashActual` vacío borraría también
   *  la del llamador — ver design.md §4.3/F7. */
  revocarOtrasPorUserId(userId: string, tokenHashActual: string): Promise<void>;
}
```

### 5.2 Use-case contracts

```ts
export type ActualizarPerfilError =
  | PerfilDemoSoloLecturaError
  | NombrePerfilInvalidoError
  | EmailInvalidoError
  | PerfilRechazadoError;          // ← EmailNoDisponibleError NO aparece: se colapsa acá

class ActualizarPerfilUseCase {
  constructor(
    private readonly creds: IUserCredentialRepository,
    private readonly hasher: IPasswordHasher,
    private readonly logger: ILogger,
  ) {}
  execute(input: {
    userId: string;
    esDemo: boolean;               // REQUERIDO (D-05)
    nombre?: string;
    emailRaw?: string;             // raw: el VO se crea acá, no en la ruta
    passwordActual?: string;
  }): Promise<Result<IdentidadUsuario, ActualizarPerfilError>>;
}

export type CambiarPasswordError =
  | PerfilDemoSoloLecturaError
  | PerfilRechazadoError
  | PasswordInvalidaError;

class CambiarPasswordUseCase {
  constructor(
    private readonly creds: IUserCredentialRepository,
    private readonly sessions: ISessionRepository,
    private readonly hasher: IPasswordHasher,
    private readonly logger: ILogger,
  ) {}
  execute(input: {
    userId: string;
    esDemo: boolean;               // REQUERIDO (D-05)
    tokenHashActual: string;       // REQUERIDO (§4.3)
    passwordActual: string;
    passwordNueva: string;
  }): Promise<Result<void, CambiarPasswordError>>;
}
```

`emailRaw: string` rather than `email: Email` on the use-case input, deliberately: the route must not
know how to build domain objects (it stays a thin transport adapter, `categorias.routes.ts`
precedent), and `EmailInvalidoError` must be produced **inside** the use case so a non-HTTP caller
gets it too. The VO-typed boundary that matters is the **port** (D-01), one layer deeper.

### 5.3 HTTP surface

| Route | Body | Success | Notes |
|---|---|---|---|
| `GET /api/auth/me` | — | `200 { userId, nombre, email, esDemo }` | `nombre` added — additive, backward compatible (AUTH-09 delta) |
| `PATCH /api/perfil` | `{ nombre?, email?, passwordActual? }` | `200` same identity shape (`AuthMeResponse`) | `passwordActual` required **iff** `email` present; at least one of `nombre`/`email` required |
| `PATCH /api/perfil/password` | `{ passwordActual, passwordNueva }` | `204` | Revokes all other sessions; the caller's token stays valid |

`aPerfilHttpError` — one class ⇒ one status ⇒ one code, with the `never` guard
(`aCatalogoHttpError` shape, **not** a reuse — different union):

| Class | Status | Code |
|---|---|---|
| `NombrePerfilInvalidoError` | `400` | `NOMBRE_INVALIDO` |
| `EmailInvalidoError` | `400` | `EMAIL_INVALIDO` |
| `PasswordInvalidaError` | `400` | `PASSWORD_INVALIDA` |
| `PerfilDemoSoloLecturaError` | `403` | `DEMO_SOLO_LECTURA` |
| `PerfilRechazadoError` | `403` | `PERFIL_RECHAZADO` |
| *(route-level)* Zod `.safeParse` failure | `400` | `BODY_INVALIDO` — body and issues **never** echoed |
| *(middleware only)* | `401` | — **No use-case branch ever returns 401** (D-04) |

### 5.4 Zod (`http-express/schemas/perfil.schema.ts`)

```ts
export const perfilUpdateRequestSchema = z
  .object({
    nombre: z.string().optional(),
    email: z.string().optional(),
    passwordActual: z.string().optional(),
  })
  .strict()                                     // PERF040-07: un `userId` extra ⇒ 400, no ignorado
  .refine((b) => b.nombre !== undefined || b.email !== undefined, {
    message: 'At least one of nombre or email must be present.',
  })
  .refine((b) => b.email === undefined || b.passwordActual !== undefined, {
    message: 'passwordActual is required when email is present.',
  });

export const passwordUpdateRequestSchema = z
  .object({ passwordActual: z.string(), passwordNueva: z.string() })
  .strict();

export const perfilErrorResponseSchema = z
  .object({ message: z.string(), code: z.string() })
  .meta({ id: 'PerfilErrorResponse', description: '…' });
```

**LAYER-HONESTY GATE** (file docblock, `categorias.schema.ts` precedent): no `.min(8)`/`.max(128)` on
`passwordNueva`, no `.email()` on `email`, no length on `nombre`. Those are DOMAIN rules
(`Password`, `Email`, `NombrePerfilInvalidoError`) and duplicating them here would (a) put business
rules in infrastructure, (b) make the numbers live in two files, (c) hide them from every non-HTTP
caller. The second `.refine` is **shape**, not policy — the policy lives in the use case (§1/Q4b), and
the docblock says so in one sentence without restating the rationale.

`perfilErrorResponseSchema` duplicates `catalogoErrorResponseSchema`'s **shape** but not its
**knowledge** (different code sets, different operations). Reusing a schema whose generated type is
named `CatalogoErrorResponse` in a profile operation would be actively confusing for US-042.
**Third occurrence ⇒ extract a shared `ErrorResponse`** (`dry` rule of three).

`authMeResponseSchema` gains `nombre: z.string()`; its `meta.description` is updated to say it is the
response of **both** `GET /api/auth/me` and `PATCH /api/perfil`.

### 5.5 OpenAPI (`openapi-document.ts`) — append-only

Two new operation consts + two new `paths` entries, following the existing file's exact shape:

```ts
const perfilUpdateOperation: ZodOpenApiOperationObject = {
  summary: 'Update the current user profile (nombre and/or email)',
  description:
    'Authenticated endpoint that updates the caller\'s own nombre and/or email (US-040, ' +
    'PERF040-01/02/03/04/07). `passwordActual` is REQUIRED whenever `email` is present. On an email ' +
    'change the ciphertext and blind index are rewritten together in one atomic update, so login ' +
    'keeps working with the NEW address and stops working with the old one. A wrong `passwordActual` ' +
    'and an email already claimed by another account return the SAME generic 403 PERFIL_RECHAZADO ' +
    '(anti-enumeration) — 403, never 401: 401 is reserved for an invalid session. Requires ' +
    'x-api-key + a valid session. Rejected for demo sessions (403 DEMO_SOLO_LECTURA).',
  requestBody: { content: { 'application/json': { schema: perfilUpdateRequestSchema } } },
  responses: {
    '200': { description: 'Profile updated; the full updated identity is returned.',
             content: { 'application/json': { schema: authMeResponseSchema } } },
    '400': { description: 'Malformed body, or an invalid nombre/email.',
             content: { 'application/json': { schema: perfilErrorResponseSchema } } },
    '403': { description: 'Demo session, wrong current password, or the email is already in use.',
             content: { 'application/json': { schema: perfilErrorResponseSchema } } },
    '401': { description: 'No valid session (missing, expired, or invalid token).' },
  },
};

const perfilPasswordUpdateOperation: ZodOpenApiOperationObject = { /* 204 / 400 / 403 / 401, same shape */ };

// paths (append):
'/api/perfil':          { patch: perfilUpdateOperation },
'/api/perfil/password': { patch: perfilPasswordUpdateOperation },
```

`authMeOperation` needs **no edit** — it already `$ref`s `authMeResponseSchema`, so `nombre` appears
automatically. That is the payoff of Q2's single-schema decision.

**Additivity**: two new paths + one new response field. Nothing is narrowed, nothing removed — safe
for every existing consumer (`apps/web`, `apps/mobile`, `packages/api-client`).

### 5.6 Regeneration commands (in order)

```bash
pnpm api openapi:emit                              # rewrites apps/api/openapi.json
pnpm --filter @moneydiary/api-client generate      # rewrites packages/api-client/src/types.gen.ts
pnpm api openapi:check                             # drift gate, must be green
pnpm --filter @moneydiary/api-client typecheck
```

Both artifacts are CI drift-gated (PERF040-09) and must be committed **with** the code. An
`openapi.json` advertising `/api/perfil` after a revert would point US-042's generated client at a
404 — exactly what the gate exists to prevent (rollback step 4).

---

## 6. Testing strategy (strict TDD)

Order per slice: **red unit → green → red integration → green**. Runners: `pnpm api test` (Vitest,
Oxc, no DB), `pnpm api test:integration` and `pnpm api test:e2e` (real ephemeral Postgres —
`apps/api/docs/local-test-db.md`, `ALLOW_DESTRUCTIVE_DB=1`, already wired in CI per ADR-029).

### 6.1 Existing tests affected (all named — none discovered mid-implementation)

Every entry below was found by reading the code; two of the four causes are **compile errors**, which
is the mechanism, not an accident (D-06).

| # | File | Why it breaks | Becomes |
|---|---|---|---|
| 1 | `application/use-cases/obtener-identidad.use-case.spec.ts` | `IdentidadUsuario` fixtures lack `nombre` (required) | add `nombre` to each fixture; assert it passes through untouched |
| 2 | `infrastructure/persistence/prisma-user-credential.repository.spec.ts` | same, **plus** `buscarIdentidad`'s `select` gains `nombre`, **plus** `makePrismaMock` only has `user.findUnique` — it must grow `user.update` | rewrite `makePrismaMock`; new `describe`s for the three new methods (§6.2) |
| 3 | `infrastructure/http-express/routes/auth.routes.spec.ts` | `/auth/me` payload assertion + the `ObtenerIdentidadUseCase` double | assert `nombre` in the 200 body |
| 4 | `infrastructure/http-express/app.auth.spec.ts` | the HTTP-level `/auth/me` sync assertion (this endpoint has **no DTO mapper**, so this supertest assertion *is* the sync guarantee — see `auth-me.schema.ts`'s docblock) | assert `nombre` |
| 5 | `infrastructure/http-express/schemas/auth-me.schema.spec.ts` | schema gains a required field | parse fixtures gain `nombre`; add a case asserting a body **without** `nombre` is rejected |
| 6 | `application/use-cases/validar-sesion.use-case.spec.ts` | `ValidarSesionResult` gains required `tokenHash` | assert the returned `tokenHash` **equals what `tokens.hashToken` returned** — i.e. it is the already-computed value, not a re-hash |
| 7 | `infrastructure/http-express/middleware/session.middleware.spec.ts` | its `ValidarSesionUseCase` double returns `Result.ok({userId, esDemo})` — now a compile error | add `tokenHash`; assert `req.sessionTokenHash` is set on success and left `undefined` on the 401 paths |
| 8 | `infrastructure/persistence/prisma-session.repository.spec.ts` | new method | new `describe` (§6.2) |
| 9 | `infrastructure/logging/pino-logger.spec.ts` | `SENSITIVE_REDACT_PATHS` gains two entries | assert a `{ nombre }` context is redacted (D-07) |
| 10 | `infrastructure/http-express/schemas/openapi-document.spec.ts` | new paths/operations registered | extend whatever path/operation inventory it asserts |
| 11 | `test/auth-login.e2e-spec.ts`, `test/auth-isolation.int-spec.ts`, `test/catalogo-demo-gate.int-spec.ts` | **not modified** | must stay green as no-regression checks. A diff touching `catalogo-demo-gate.int-spec.ts` is a review red flag |

### 6.2 New unit coverage — target file → assertions

| Target file | Assertions |
|---|---|
| `domain/value-objects/password.spec.ts` | Boundaries **7 / 8 / 128 / 129** (fail/ok/ok/fail); `valor` is the raw input **unmodified** (no trim — leading/trailing spaces are legitimate password characters, unlike `Email`); `JSON.stringify(pwd)` contains `'[REDACTED]'` and **not** the plaintext (D-02) |
| `domain/errors/password-invalida.error.spec.ts` | `message` states the rule; the instance has **no** `rawValue` property; `JSON.stringify(err)` contains no substring of the attempted password |
| `domain/errors/perfil-rechazado.error.spec.ts` | one fixed message, no interpolated input |
| `application/use-cases/actualizar-perfil.use-case.spec.ts` | demo ⇒ `PerfilDemoSoloLecturaError` **and the repository is never called**; `nombre`-only ⇒ **`buscarCredencialPorId` and `hasher.verificar` are never called** and `actualizarPerfil` receives `email: undefined`; `email` present + `passwordActual` **absent** ⇒ `PerfilRechazadoError` (**the §1/Q4b schema-bypass test**); wrong password ⇒ `PerfilRechazadoError` **and `actualizarPerfil` is never called**; `buscarCredencialPorId → null` ⇒ `PerfilRechazadoError` (Google-only user, §1/Q3); invalid email ⇒ `EmailInvalidoError` before any lookup; port `EmailNoDisponibleError` ⇒ collapsed to `PerfilRechazadoError` (**byte-identical `message` to the wrong-password case** — assert equality against the same instance's message, not a copied literal); `nombre` `""` / 81 chars ⇒ `NombrePerfilInvalidoError`; **the port receives an `Email` instance, not a string** (`expect(arg.email).toBeInstanceOf(Email)`), and `arg.email.valor` is the **normalized** form for input `'  Jorge@Example.COM '`; no log call ever receives a `nombre`/`email`/`password` **value** (inspect the logger double's recorded contexts) |
| `application/use-cases/cambiar-password.use-case.spec.ts` | demo ⇒ error, **no repository call**; `buscarCredencialPorId → null` ⇒ `PerfilRechazadoError`; wrong current ⇒ `PerfilRechazadoError` **and neither `revocarOtrasPorUserId` nor `actualizarPassword` is called** (PERF040-03's "no session is revoked"); short password ⇒ `PasswordInvalidaError` **after** the verify, with no write; happy path ⇒ **call-order assertion**: `revocarOtrasPorUserId` is invoked **before** `actualizarPassword` (§4.3/F3 — use an invocation-order check, not two independent `toHaveBeenCalled`s); `revocarOtrasPorUserId` receives **exactly** `input.tokenHashActual` (F7); the value passed to `actualizarPassword` is the hasher's output and **never** equals the plaintext |
| `infrastructure/persistence/prisma-user-credential.repository.spec.ts` · `actualizarPerfil` | `update` called **once**; `where` deep-equals `{ id: USER_ID }`; **`nombre`-only**: `Object.keys(data)` deep-equals `['nombre']` — **fails if someone emits `email: undefined`** (§1/Q4a); **email present**: `data.email === crypto.encrypt(valor)` **and** `data.emailBlindIndex === blindIndex.compute(valor)`, both from the same normalized string, using the **injected** doubles; the returned identity is mapped from the `update` return row; the four P2002 cases of §4.2 |
| `…` · `buscarCredencialPorId` | queries `where: { id: userId }`; returns `null` when the row is absent **and** when `passwordHash === null`; never selects/returns `email` |
| `…` · `actualizarPassword` | `update` with `where: { id }`, `data: { passwordHash }`, and **no other key** |
| `…` · `buscarIdentidad` | `select` includes `nombre`; the returned identity carries it; the fail-closed null branch (real user, null email) still holds |
| `infrastructure/persistence/prisma-session.repository.spec.ts` · `revocarOtrasPorUserId` | `deleteMany` `where` deep-equals `{ userId, tokenHash: { not: tokenHashActual } }` — the `not` is the whole point; idempotent (0 rows deleted is success) |
| `infrastructure/http-express/routes/perfil-http-error.spec.ts` | all 5 classes map to their exact `(status, code)`; the `403` bodies of `PerfilRechazadoError` are identical regardless of which cause produced them |
| `infrastructure/http-express/routes/perfil.routes.spec.ts` | `200` + `AuthMeResponse`-shaped body on ok; `204` (no body) on password ok; `400 BODY_INVALIDO` for `{}` , for `{ email }` without `passwordActual`, and for **`{ nombre, userId: 'otro' }`** (`.strict()` — PERF040-07); each use-case error → its status/code; `esDemo` and `tokenHashActual` are threaded from `req` |
| `infrastructure/http-express/schemas/perfil.schema.spec.ts` | both refines; `.strict()` rejection; **no** length/format rule is enforced by the schema (the layer-honesty assertion: an 3-char `passwordNueva` **parses fine** — the domain rejects it) |

### 6.3 Integration (real DB)

| Requirement | Spec · case |
|---|---|
| PERF040-01 | **new `test/perfil-crud.int-spec.ts`** — `nombre`-only ⇒ `200`, and the `email`/`emailBlindIndex` columns read straight from the DB are **byte-identical** to the values captured before the request; `nombre`+`email` together ⇒ `200`, and a follow-up `GET /api/auth/me` reflects both |
| PERF040-03 | `perfil-crud.int-spec.ts` — wrong `passwordActual` on an email change ⇒ `403 PERFIL_RECHAZADO`, both email columns unchanged; wrong `passwordActual` on `/password` ⇒ `403`, `passwordHash` unchanged **and both seeded sessions still valid** |
| PERF040-04 | `perfil-crud.int-spec.ts` — user B takes `taken@…`; user A PATCHes to it with A's **correct** password ⇒ response body **deep-equals** the wrong-password body from the PERF040-03 case (compare captured objects, not literals); B's `email`/`emailBlindIndex` untouched |
| PERF040-05 | `perfil-crud.int-spec.ts` — `passwordNueva` of 7 chars ⇒ `400 PASSWORD_INVALIDA`, hash unchanged; valid ⇒ `204` and the stored value starts with `$argon2id$` and is not the plaintext |
| PERF040-06 | **§6.5** |
| PERF040-07 | `test/auth-isolation.int-spec.ts` (extended) — A sends `PATCH /api/perfil` with a body naming B's id; the request is rejected `400` by `.strict()` **and** B's row is byte-identical afterward. Also: A's own row is the only one that ever changes |
| PERF040-08 | **new `test/perfil-demo-gate.int-spec.ts`**, scaffolded verbatim from `catalogo-demo-gate.int-spec.ts` (per-run user id, `crearSesionParaUsuario`, full `afterAll` teardown) — both mutations from a demo session ⇒ `403 DEMO_SOLO_LECTURA`; `GET /api/auth/me` still `200` for that same session; no `User` column changed |
| AUTH-09 | `perfil-crud.int-spec.ts` — `GET /api/auth/me` returns `nombre` |

### 6.4 The binding e2e — the 2026-08-02 regression test

**`test/perfil-email-change.e2e-spec.ts`** (new). This is the change's headline test; if only one test
survives review, it is this one.

1. Seed a user with `buildEncryptedEmailFields(EMAIL_VIEJO, env)` (`test/support/encrypted-email.fixture.ts`)
   + an argon2 `passwordHash`. **Do not hand-roll the encryption** — that fixture exists precisely so
   the spec's key matches the app's.
2. `POST /api/auth/login` with `EMAIL_VIEJO` ⇒ `200`, capture the cookie.
3. `PATCH /api/perfil` `{ email: EMAIL_NUEVO, passwordActual }` ⇒ `200`, body's `email` is
   `EMAIL_NUEVO` **normalized** (send it with mixed case and surrounding spaces so the assertion also
   pins normalization).
4. **`POST /api/auth/login` with `EMAIL_NUEVO` ⇒ `200`.** ← the invariant, proven end to end through
   the real container's real keys.
5. **`POST /api/auth/login` with `EMAIL_VIEJO` ⇒ `401`.** ← proves the blind index moved, not that a
   stale row still matches.
6. Read the row directly: `crypto.decrypt(row.email) === EMAIL_NUEVO_NORMALIZADO` **and**
   `row.emailBlindIndex === blindIndex.compute(EMAIL_NUEVO_NORMALIZADO)` — the pair, asserted as a
   pair, against independently recomputed values.

Steps 4–5 are what the 2026-08-02 incident lacked: they fail if the ciphertext and the index ever
derive from different strings or different keys, which is the entire hazard class of §1/D-01.

### 6.5 The two-session revocation spec, specified precisely

**`test/perfil-password-sessions.int-spec.ts`** (new), scaffolded from `catalogo-demo-gate.int-spec.ts`'s
structure with `crearSesionParaUsuario` (which mirrors `Sha256SessionTokenService`'s exact hashing, so
the tokens it returns validate through the real middleware).

1. One user, `passwordHash` set. Create **two** real sessions: A (the caller) and B (the sibling).
   Prove both work first: `GET /api/auth/me` with A ⇒ `200`, with B ⇒ `200`. *(Without this
   pre-assertion the test is satisfiable by two broken sessions.)*
2. `PATCH /api/perfil/password` with **A**'s token ⇒ `204`.
3. `GET /api/auth/me` with **B** ⇒ **`401`** (PERF040-06, revoked).
4. `GET /api/auth/me` with **A** ⇒ **`200`** (PERF040-06, kept — this is the half that a naive
   "revoke all" implementation fails).
5. `prisma.session.count({ where: { userId } })` ⇒ **exactly 1**, and its `tokenHash` is A's.
6. `POST /api/auth/login` with the **new** password ⇒ `200`; with the **old** ⇒ `401`.

Step 4 and step 5 together are what distinguish this from `revocarPorTokenHash`; step 6 is what
distinguishes a successful revocation from a successful revocation that forgot to write the hash
(§4.3/F2).

### 6.6 Full green bar

```bash
pnpm api test
pnpm api exec tsc --noEmit
ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration
ALLOW_DESTRUCTIVE_DB=1 pnpm api test:e2e
pnpm api openapi:check
pnpm --filter @moneydiary/api-client typecheck
pnpm web test          # untouched — run as a no-regression check
```

---

## 7. Delivery constraints for the tasks phase

**Two chained PRs, confirmed** — with a **CORRECTION** to the proposal's split.

The slices carry genuinely different risk profiles (a crypto invariant vs. session semantics) and
mixing them would put both under one review. But the proposal's table places
`buscarCredencialPorId` in PR #2, which **cannot work**: PR #1 ships the email change, and binding
decision 2 makes the current password mandatory for an email change — so PR #1 needs
`buscarCredencialPorId`, `IPasswordHasher` in `ActualizarPerfilUseCase`, and `PerfilRechazadoError`
from day one. Corrected split:

| PR | Content | Stands alone because |
|---|---|---|
| **#1 — Identity read + nombre/email write** | `nombre` on `IdentidadUsuario` → `buscarIdentidad` → `/auth/me` → `authMeResponseSchema`; `camposEmail` + `actualizarPerfil` + the P2002 catch; **`buscarCredencialPorId`** *(moved from PR #2)*; `ActualizarPerfilUseCase`; `PerfilRechazadoError`, `PerfilDemoSoloLecturaError`, `EmailNoDisponibleError`, `NombrePerfilInvalidoError`; `perfil.routes.ts` + `aPerfilHttpError` + schemas; `crearPerfil` + container; D-07 redaction; contract regen; unit + `perfil-crud.int-spec.ts` + `perfil-demo-gate.int-spec.ts` + **the §6.4 e2e** | Ships PERF040-01/02/03(email half)/04/07/08 + AUTH-09 end to end. The highest-risk code, reviewed on its own with the 2026-08-02 incident in front of the reviewer |
| **#2 — Password change + session revocation** | `Password` VO + `PasswordInvalidaError`; `actualizarPassword`; `revocarOtrasPorUserId`; `tokenHash` through `ValidarSesionResult` → `sessionMiddleware` → `req`; `CambiarPasswordUseCase`; the `/password` route + its schema + two translator branches; unit + **§6.5** | Ships PERF040-03(password half)/05/06. Depends on #1 only for the route file and translator it extends |

**Size forecast** — refined from the file map:

| Bucket | Rough changed lines |
|---|---|
| PR #1 source (≈12 files, 6 new) | ~330 |
| PR #1 specs (≈9 files, 4 new incl. the e2e) | ~420 |
| PR #1 generated (`openapi.json`, `types.gen.ts`) | ~80 |
| PR #2 source (≈9 files, 3 new) | ~200 |
| PR #2 specs (≈7 files, 3 new incl. §6.5) | ~300 |
| PR #2 generated | ~50 |

⇒ **Both PRs exceed the 400-line budget; `size:exception` is the expected and correct outcome for
each.** The bulk is test churn plus three new integration/e2e specs — the safest possible lines in a
diff, and the ones this change's headline risk depends on. The tasks phase owns the binding forecast
and should record the exception up front rather than discovering it at PR time. Splitting further
(e.g. "port + repository" then "use case + route") would produce slices that ship nothing
independently valuable and would double the contract regeneration.

**Non-negotiables handed to `sdd-apply`:**

- **No Prisma migration.** Every column and index exists (§3.6). One in the diff ⇒ the change went
  off-design.
- **Zero files changed under `apps/web/` or `apps/mobile/`.** Stated three times on purpose.
- The port method takes `Email`, never `string`. A `string` there voids §1/D-01 entirely.
- `camposEmail` returns `{}` or the **full pair**. Never `{ email: undefined, emailBlindIndex: undefined }`.
- The P2002 catch inspects `error.meta.target` and **rethrows** on anything it does not recognize
  (§4.2). A bare `code === 'P2002'` fails the repository spec.
- `crearPerfil` receives `crypto`/`blindIndex`; it **never** constructs them and never calls
  `deriveBlindIndexKey`.
- `revocarOtrasPorUserId` runs **before** `actualizarPassword`, and the unit spec asserts the order,
  not just the calls.
- `esDemo` and `tokenHashActual` stay **required** input fields. Making either optional deletes the
  compile-time guarantee that is the whole point.
- No `.min()`/`.max()`/`.email()` in the Zod schemas (§5.4 layer-honesty gate).
- No log line ever carries a `nombre`, `email`, password or token **value** (D-07).
- `openapi.json` + `types.gen.ts` committed **with** the code, never in a follow-up.
- `catalogo-demo-gate.int-spec.ts`, `auth-isolation.int-spec.ts`'s existing cases and
  `auth-login.e2e-spec.ts` are regression guards — green, and (except for the PERF040-07 extension)
  unmodified.

**Open action items for the tasks phase** (both flagged in-line above):

1. **Issue #274's CA-03 is stale** — it names the current password only for the password change; the
   shipped behaviour also requires it for the email (binding decision 2). Update the issue, or
   verification checks against wording nobody updated.
2. **`PERF040-01` needs a `nombre` validation scenario** (§3.1) to cover the empty/over-long
   rejection this design adds.

---

## 8. Residual risks

| Risk | Status / mitigation |
|---|---|
| **Email/blind-index desync locks a user out of their own account** — now reachable by a normal user action, not just an ops event | The four structural defences of D-01 (VO-typed port, `{}`-or-pair helper, single UPDATE, shared instances) + the §6.4 e2e that logs in with the new email and fails with the old. Headline risk, headline test |
| **A user changes their email to an address they do not control** and cannot log back in | Binding decision 2's current-password requirement is the safeguard shipped now. Confirm-before-switch (verification email) is the real fix, deferred — **trigger: the first support case, or the arrival of any email-sending capability.** Rollback does **not** restore the old address; recovery is a manual DB fix or Supabase PITR |
| **A Google-only user cannot change their email or password** (§1/Q3) | Accepted and now documented. `nombre` edits still work. **Trigger: ship a password-set flow with US-041**, or the first support case |
| **`nombre` leaks into logs** — plaintext PII | D-07: added to `SENSITIVE_REDACT_PATHS` (net) **and** the names/booleans-only rule (the actual rule), asserted in the logger spec and in each use-case spec |
| **Password material reaching a log or an error message** | `Password.toJSON() → '[REDACTED]'`, `PasswordInvalidaError` with no `rawValue`, both asserted at the `JSON.stringify` level (D-02) |
| **P2002 handling misfires** because `googleSub` is also `@unique` | Targeted `meta.target` inspection, fail-closed rethrow, four pinned cases (§4.2). Honest scope: the `googleSub` collision is not reachable through today's UPDATE — the guard is for the next writer (US-041) |
| **F4–F7 of §4.3** (post-revoke login window; lost-response retry; concurrent dual change; empty `tokenHashActual`) | All enumerated, all fail-safe, none mitigated in code. F5's mitigation is a US-042 UX note, not an API change |
| **`403` vs `401` confuses the US-042 client into a logout loop** | Decided and verified against `apps/web`'s `client.ts`/`requireSession` (D-04); the OpenAPI description states it; a handoff note tells US-042 to read the `code` |
| **`ValidarSesionResult.tokenHash` spreads a secret-adjacent value through `req`** | SHA-256 hash, already the DB's stored form; never the raw token, never logged, never serialized. Single consumer, named in the docblock |
| **Scope creep into the Configuración UI** | Explicit non-goal in the proposal, the spec, §3.6 and §7. Zero `apps/web` files |
| **Contract drift** | Existing CI gates (`openapi:check`, api-client job), PERF040-09 |
| **`aPerfilHttpError` duplicates `aCatalogoHttpError`'s shape** | Deliberate: different unions, and the `never` guard's value comes from being per-union. **Third exhaustive translator ⇒ consider a shared builder** (rule of three) |
