# Tasks: US-040 — Edit profile (nombre, email, password), API only

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR #1 ~830 (source ~330, specs ~420, generated ~80); PR #2 ~550 (source ~200, specs ~300, generated ~50); total ~1380 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR #1 → PR #2 (feature-branch-chain; PR #1 base = tracker branch, PR #2 base = PR #1 branch) |
| Delivery strategy | ask-on-risk (orchestrator decides) |
| Chain strategy | feature-branch-chain (cached this session) |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

Both PRs exceed 400 lines; `size:exception` is expected and correct for each — the bulk is test churn
(unit + the §6.4/§6.5 integration/e2e specs), the safest lines in this diff, and the ones the change's
headline risk (email/blind-index desync, §1/D-01) depends on. Further splitting (port+repo vs use
case+route) would ship nothing independently valuable and double contract regeneration. See
`design.md` §7 for the binding rationale.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Identity read (`nombre`) + `PATCH /api/perfil` (nombre/email write) | PR 1 | base = tracker branch; includes `buscarCredencialPorId` (moved per design §7 correction), the binding e2e |
| 2 | `PATCH /api/perfil/password` + session revocation | PR 2 | base = PR 1 branch; depends on PR 1's route file + translator |

**Non-negotiable gates (both PRs):** no Prisma migration (0.1/9.1/17.1); zero diff under `apps/web/`,
`apps/mobile/`; port `email` param is the `Email` VO, never a string; `camposEmail` returns `{}` or
the full pair only.

---

## PR #1 — Identity read + nombre/email write (base: tracker branch)

### Phase 0: Gate

- [x] 0.1 Verify `prisma/schema.prisma` needs NO change (`nombre`, `email`, `emailBlindIndex`,
  `passwordHash`, `Session.tokenHash @unique`, `Session.userId @@index` all already exist — design
  §3.6). **If a migration seems required, STOP and escalate — do not proceed.**

### Phase 1: Domain errors

- [x] 1.1 RED `domain/errors/nombre-perfil-invalido.error.spec.ts` — PERF040-01 addition (design §3.1)
- [x] 1.2 GREEN implement `nombre-perfil-invalido.error.ts` → `400 NOMBRE_INVALIDO`
- [x] 1.3 RED `domain/errors/perfil-rechazado.error.spec.ts` — one fixed message, no interpolated input
- [x] 1.4 GREEN implement `perfil-rechazado.error.ts` — the shared generic rejection (PERF040-03/04)
- [x] 1.5 RED `domain/errors/perfil-demo-solo-lectura.error.spec.ts`
- [x] 1.6 GREEN implement `perfil-demo-solo-lectura.error.ts` — own class, `DEMO_SOLO_LECTURA` (PERF040-08)
- [x] 1.7 RED `domain/errors/email-no-disponible.error.spec.ts` — docblock: never crosses HTTP boundary
- [x] 1.8 GREEN implement `email-no-disponible.error.ts` — port-only, collapsed by the use case (D-01)
- [x] 1.9 Add missing `nombre` empty/over-80-char scenario to `specs/perfil-usuario/spec.md` PERF040-01
  (design §3.1 action item — required so `sdd-verify` checks it)

### Phase 2: Port + repository — the email write-invariant's ONE home (D-01)

- [x] 2.1 Modify `application/ports/user-credential-repository.port.ts`: `IdentidadUsuario` gains
  REQUIRED `nombre: string`; add `buscarCredencialPorId(userId)`, `actualizarPerfil(input: {userId,
  nombre?, email?: Email})` — **`email` is the VALUE OBJECT, never a raw string; a string must not
  type-check** (D-01)
- [x] 2.2 Run `pnpm api exec tsc --noEmit` to enumerate every broken fixture (D-06) before editing them
- [x] 2.3 GREEN fix `obtener-identidad.use-case.spec.ts` fixtures (+`nombre`); assert passthrough — AUTH-09
- [x] 2.4 RED extend `prisma-user-credential.repository.spec.ts`: `buscarIdentidad` select gains
  `nombre`; grow `makePrismaMock` with `user.update`
- [x] 2.5 GREEN update `buscarIdentidad`'s select; extract shared private `aIdentidadUsuario(row)`
- [x] 2.6 RED repository spec for private `camposEmail(email)`: nombre-only ⇒
  `Object.keys(data)` deep-equals `['nombre']`; email present ⇒ `data.email`/`data.emailBlindIndex`
  both derived from the SAME `email.valor`, using the container's INJECTED `crypto`/`blindIndex`
  doubles (G1-G4). **GUARD: this is the ONLY other derivation site in the app besides `seed.ts` and
  `backfill-email-blind-index.ts` — do not open-code the pair a third time anywhere else.**
- [x] 2.7 GREEN implement `camposEmail` — `{}` or the FULL pair; never `{email: undefined,
  emailBlindIndex: undefined}` (design §1/Q4a)
- [x] 2.8 RED repository spec for `actualizarPerfil`'s P2002 catch — the 4 pinned cases (design §4.2):
  `target: ['emailBlindIndex']` ⇒ `Result.fail(EmailNoDisponibleError)`; `target: ['googleSub']` ⇒
  **rethrows**; `target: undefined` ⇒ **rethrows** (fail-closed); `target: 'User_emailBlindIndex_key'`
  (string form) ⇒ `Result.fail`. **A bare `error.code === 'P2002'` catch must fail this spec.**
- [x] 2.9 GREEN implement `actualizarPerfil`: one `prisma.user.update()`, `where: {id: userId}`, the
  `apuntaA(meta, 'emailBlindIndex')` guard inspecting `error.meta.target`, the inconsistent-row throw
  (design §4.1) — PERF040-01/02
- [x] 2.10 RED repository spec for `buscarCredencialPorId`: `where: {id: userId}`; `null` for absent
  row AND for `passwordHash === null` (Google-only user, design §1/Q3); never selects `email`
- [x] 2.11 GREEN implement `buscarCredencialPorId`

### Phase 3: Use case — `ActualizarPerfilUseCase` (PERF040-01/02/03/04/07/08)

- [x] 3.1 RED `application/use-cases/actualizar-perfil.use-case.spec.ts` — guard order (design §4.1):
  demo (no repo call) → `nombre` trim/1-80 → `Email.crear` → `passwordActual` missing on email change
  (**schema-bypass test**: call use case directly, bypass Zod) → `buscarCredencialPorId → null` → wrong
  password → `EmailNoDisponibleError` collapsed to `PerfilRechazadoError` (assert message equality
  against the SAME instance, not a copied literal); **port receives an `Email` instance, not a
  string** (`toBeInstanceOf(Email)`), normalized `.valor` for `'  Jorge@Example.COM '`; **no log call
  ever carries a `nombre`/`email`/`password` VALUE** (inspect the logger double's recorded contexts)
- [x] 3.2 GREEN implement `ActualizarPerfilUseCase` — `esDemo: boolean` REQUIRED input (compile-enforced,
  D-05); `nombre?`/`emailRaw?`/`passwordActual?`; `logger.debug` lines carry only field
  names/booleans (e.g. `{cambiaNombre, cambiaEmail}`), never values (D-07)

### Phase 4: HTTP layer

- [x] 4.1 RED `infrastructure/http-express/routes/perfil-http-error.spec.ts` — 4 classes map to exact
  `(status, code)`: `NombrePerfilInvalidoError→400`, `EmailInvalidoError→400`,
  `PerfilDemoSoloLecturaError→403`, `PerfilRechazadoError→403`; the `403` body is identical regardless
  of cause
- [x] 4.2 GREEN implement `aPerfilHttpError` for `ActualizarPerfilError`, with `const _exhaustive: never
  = error` (D-06) — `EmailNoDisponibleError` must NOT be a member of this union (compile error if added)
- [x] 4.3 RED `infrastructure/http-express/schemas/perfil.schema.spec.ts` — both `.refine`s; `.strict()`
  rejects an extra `userId` field (PERF040-07); layer-honesty: no length/format enforced on `nombre`/`email`
- [x] 4.4 GREEN implement `perfilUpdateRequestSchema` + `perfilErrorResponseSchema` — NO `.min()`/`.max()`/
  `.email()` (§5.4 layer-honesty gate)
- [x] 4.5 RED extend `auth-me.schema.spec.ts` — `nombre` required; body without it is rejected
- [x] 4.6 GREEN `authMeResponseSchema` gains `nombre: z.string()`; `meta.description` names both endpoints
- [x] 4.7 RED `perfil.routes.spec.ts` (PATCH /api/perfil only): `200` `AuthMeResponse` body; `400
  BODY_INVALIDO` for `{}`, `{email}` without `passwordActual`, and `{nombre, userId:'otro'}`
  (`.strict()`); each use-case error → its status/code; `esDemo` threaded from `req.esDemo!`
- [x] 4.8 GREEN implement `registrarPerfil(router, perfil)` PATCH /api/perfil — `.safeParse()`, never
  echoes body or Zod issues
- [x] 4.9 RED extend `auth.routes.spec.ts` + `app.auth.spec.ts` — `/auth/me` payload includes `nombre`
- [x] 4.10 GREEN update `auth.routes.ts` — `nombre` in `/auth/me` (AUTH-09)

### Phase 5: Composition + logging

- [x] 5.1 Create `composition/crear-perfil.ts` — `crearPerfil(prisma, crypto, blindIndex, logger)` →
  `PerfilGraph`. **GUARD (non-negotiable): MUST NOT call `deriveBlindIndexKey`, `new
  AesGcmCryptoService`, or `new HmacBlindIndexService` — receive the container's single instances only**
  (`crearAuthGoogle` precedent)
- [x] 5.2 Modify `composition/container.ts` (one line: `const perfil = crearPerfil(...)` + field/docblock);
  mount `registrarPerfil(protectedApi, container.perfil)` in `http-express/app.ts`, after `sessionMiddleware`
- [x] 5.3 RED `infrastructure/logging/pino-logger.spec.ts` — assert `{nombre}` context is redacted
- [x] 5.4 GREEN add `'nombre'`, `'*.nombre'` to `SENSITIVE_REDACT_PATHS` (D-07) — defense in depth, not
  the rule (the rule stays: log field names/booleans, never values)

### Phase 6: Contract sync

- [x] 6.1 Add `perfilUpdateOperation` + `/api/perfil` PATCH path to `openapi-document.ts` (append-only);
  extend `openapi-document.spec.ts` inventory — PERF040-09
- [x] 6.2 `pnpm api openapi:emit && pnpm --filter @moneydiary/api-client generate && pnpm api
  openapi:check && pnpm --filter @moneydiary/api-client typecheck` — commit regenerated
  `openapi.json` + `types.gen.ts` WITH the code

### Phase 7: Integration + the binding e2e

- [x] 7.1 New `test/perfil-crud.int-spec.ts` — PERF040-01 (nombre-only leaves email columns
  byte-identical, read straight from DB; nombre+email together reflected in `/auth/me`); PERF040-03
  email half (wrong `passwordActual` on email change ⇒ 403, columns unchanged); PERF040-04 (user B
  owns the target email; A's PATCH with A's correct password ⇒ body deep-equals the wrong-password
  case; B's row untouched); AUTH-09 (`/auth/me` returns `nombre`)
- [x] 7.2 New `test/perfil-demo-gate.int-spec.ts` (scaffolded from `catalogo-demo-gate.int-spec.ts`) —
  demo session PATCH /api/perfil ⇒ `403 DEMO_SOLO_LECTURA`; `/auth/me` still `200`; no `User` column
  changed — PERF040-08
- [x] 7.3 Extend `test/auth-isolation.int-spec.ts` — body naming another user's id ⇒ `400` via
  `.strict()`, other user's row byte-identical afterward — PERF040-07
- [x] 7.4 **THE BINDING E2E — own task, the change's headline proof (design §6.4).** New
  `test/perfil-email-change.e2e-spec.ts`: seed via `buildEncryptedEmailFields` (never hand-roll
  encryption) → login with OLD email succeeds → `PATCH /api/perfil` with new email (mixed case +
  surrounding spaces, to also pin normalization) → login with NEW email succeeds → login with OLD
  email fails `401` → independently re-derive `crypto.decrypt(row.email)` and
  `blindIndex.compute(...)` from the DB row and confirm BOTH match. **Verification:**
  `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:e2e -- perfil-email-change`
- [x] 7.5 Regression check: `test/auth-login.e2e-spec.ts`, `test/catalogo-demo-gate.int-spec.ts` stay
  green, unmodified

### Phase 8: PR #1 gate

- [x] 8.1 Full green bar: `pnpm api test`; `pnpm api exec tsc --noEmit`; `ALLOW_DESTRUCTIVE_DB=1 pnpm
  api test:integration`; `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:e2e`; `pnpm api openapi:check`; `pnpm
  --filter @moneydiary/api-client typecheck`
- [x] 8.2 **Verify zero files changed under `apps/web/` and `apps/mobile/`** and no
  `prisma/schema.prisma`/migration file in the PR diff — STOP and escalate if either is touched

---

## PR #2 — Password change + session revocation (base: PR #1 branch)

### Phase 9: Domain — `Password` VO

- [ ] 9.1 RED `domain/value-objects/password.spec.ts` — boundaries 7/8/128/129 (fail/ok/ok/fail);
  `valor` unmodified (no trim — spaces are legitimate password chars); `JSON.stringify(pwd)` contains
  `'[REDACTED]'`, never the plaintext
- [ ] 9.2 GREEN implement `Password.crear()` (8-128 chars, length over composition), `toJSON() →
  '[REDACTED]'` (D-02)
- [ ] 9.3 RED `domain/errors/password-invalida.error.spec.ts` — states the rule; **NO `rawValue`
  property** (unlike `EmailInvalidoError` — a password is a secret); `JSON.stringify` contains no
  substring of the attempted password
- [ ] 9.4 GREEN implement `PasswordInvalidaError`

### Phase 10: Ports — session revocation (PERF040-06)

- [ ] 10.1 Modify `application/ports/session-repository.port.ts`: add
  `revocarOtrasPorUserId(userId, tokenHashActual): Promise<void>`
- [ ] 10.2 Modify `application/ports/user-credential-repository.port.ts`: add
  `actualizarPassword(userId, passwordHash): Promise<void>` (already-hashed input, per `IPasswordHasher`)
- [ ] 10.3 RED `prisma-session.repository.spec.ts` — `revocarOtrasPorUserId`: `deleteMany` where
  deep-equals `{userId, tokenHash: {not: tokenHashActual}}`; idempotent (0 rows deleted = success)
- [ ] 10.4 GREEN implement `revocarOtrasPorUserId` in `PrismaSessionRepository`
- [ ] 10.5 RED repository spec `actualizarPassword` — `update` with `data: {passwordHash}`, no other key
- [ ] 10.6 GREEN implement `actualizarPassword` in `PrismaUserCredentialRepository` — uses `update`
  (not `updateMany`), so a deleted row (F8) is loud

### Phase 11: `tokenHash` surfacing — `req.sessionTokenHash`

- [ ] 11.1 RED `validar-sesion.use-case.spec.ts` — `ValidarSesionResult` gains REQUIRED `tokenHash`;
  assert it EQUALS what `tokens.hashToken` already computes (not a re-hash)
- [ ] 11.2 GREEN add `tokenHash` to `ValidarSesionResult` — the value already computed at line 34,
  currently discarded; one-field change (design §4.3)
- [ ] 11.3 RED `session.middleware.spec.ts` — double now returns `{userId, esDemo, tokenHash}`
  (compile error otherwise); assert `req.sessionTokenHash` set on success, `undefined` on the 401 paths
- [ ] 11.4 GREEN `session.middleware.ts` writes `req.sessionTokenHash = sesion.tokenHash`; add
  `sessionTokenHash?: string` to `express-request.d.ts` — docblock: SHA-256 hash, DB's stored form,
  never the raw token, single consumer, never logged/serialized

### Phase 12: Use case — `CambiarPasswordUseCase` (PERF040-03 password half/05/06)

- [ ] 12.1 RED `application/use-cases/cambiar-password.use-case.spec.ts` — demo ⇒ error, NO repo call;
  `buscarCredencialPorId → null` ⇒ `PerfilRechazadoError`; wrong current ⇒ `PerfilRechazadoError` AND
  neither `revocarOtrasPorUserId` nor `actualizarPassword` called; short password ⇒
  `PasswordInvalidaError` AFTER verify, no write; happy path ⇒ **invocation-order assertion**:
  `revocarOtrasPorUserId` called BEFORE `actualizarPassword` (order check, not two independent
  `toHaveBeenCalled`s — §4.3/F3); `revocarOtrasPorUserId` receives EXACTLY `input.tokenHashActual`
  (**pins the F7 empty-string pass-through degradation** — no runtime guard exists, this test is the
  only pin); value passed to `actualizarPassword` is the hasher's output, never the plaintext
- [ ] 12.2 GREEN implement `CambiarPasswordUseCase` — `esDemo: boolean` and `tokenHashActual: string`
  REQUIRED inputs (compile-enforced, D-05); order: demo → credencial lookup → verify current → hash →
  **revoke-then-write ORDERING (not a cross-aggregate transaction)** → `actualizarPassword`

### Phase 13: HTTP layer extension

- [ ] 13.1 RED extend `perfil-http-error.spec.ts` — `PasswordInvalidaError → 400 PASSWORD_INVALIDA`;
  the widened `never` guard still compiles for `CambiarPasswordError` (D-06)
- [ ] 13.2 GREEN extend `aPerfilHttpError` to cover `CambiarPasswordError`
- [ ] 13.3 RED extend `perfil.schema.spec.ts` — `passwordUpdateRequestSchema` `.strict()`;
  layer-honesty: a 3-char `passwordNueva` parses fine at schema level (domain rejects it)
- [ ] 13.4 GREEN implement `passwordUpdateRequestSchema`
- [ ] 13.5 RED extend `perfil.routes.spec.ts` — PATCH /api/perfil/password: `204` no-body on ok;
  `esDemo` AND `tokenHashActual` threaded from `req`
- [ ] 13.6 GREEN implement PATCH /api/perfil/password in `perfil.routes.ts`, wired through
  `PerfilGraph.cambiarPassword`

### Phase 14: Contract sync

- [ ] 14.1 Add `perfilPasswordUpdateOperation` + `/api/perfil/password` PATCH path to
  `openapi-document.ts` (append-only); extend inventory spec — PERF040-09
- [ ] 14.2 `pnpm api openapi:emit && pnpm --filter @moneydiary/api-client generate && pnpm api
  openapi:check && pnpm --filter @moneydiary/api-client typecheck` — commit regenerated artifacts with code

### Phase 15: Integration — the two-session revocation proof

- [ ] 15.1 **THE BINDING SESSION-REVOCATION TEST — own task (design §6.5).** New
  `test/perfil-password-sessions.int-spec.ts`, scaffolded from `catalogo-demo-gate.int-spec.ts` with
  `crearSesionParaUsuario`. Sequence: seed 1 user + 2 real sessions A, B → pre-assert BOTH work
  (`/auth/me` `200`/`200`) → `PATCH /api/perfil/password` with A ⇒ `204` → `/auth/me` with **B ⇒
  401** (other session rejected) → `/auth/me` with **A ⇒ 200** (caller's still works) →
  `session.count({userId})` === 1, its `tokenHash` is A's → login with NEW password ⇒ `200`, OLD ⇒
  `401`. **Verification:** `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration -- perfil-password-sessions`
- [ ] 15.2 Extend `test/perfil-crud.int-spec.ts` — PERF040-03 password half (wrong `passwordActual`
  on `/password` ⇒ `403`, `passwordHash` unchanged AND both seeded sessions still valid); PERF040-05
  (7-char `passwordNueva` ⇒ `400 PASSWORD_INVALIDA`, hash unchanged; valid ⇒ `204`, stored value
  starts with `$argon2id$`, never plaintext)
- [ ] 15.3 Extend `test/perfil-demo-gate.int-spec.ts` — demo session PATCH /api/perfil/password ⇒ `403
  DEMO_SOLO_LECTURA`

### Phase 16: PR #2 gate

- [ ] 16.1 Full green bar (same command list as 8.1) + regression: `auth-login.e2e-spec.ts`,
  `auth-isolation.int-spec.ts`, `catalogo-demo-gate.int-spec.ts` stay green
- [ ] 16.2 **Verify zero files changed under `apps/web/` and `apps/mobile/`** and no migration file in
  the PR diff — STOP and escalate if either is touched

---

## Non-negotiables (apply to both PRs)

- No Prisma migration (0.1, 8.2, 16.2).
- The port method's `email` param is the `Email` value object, never `string` (2.1).
- `camposEmail` returns `{}` or the full pair — never a half-pair (2.7).
- P2002 catch inspects `error.meta.target`, rethrows on anything unrecognized (2.8/2.9).
- `crearPerfil` receives `crypto`/`blindIndex`; never constructs them, never calls
  `deriveBlindIndexKey` (5.1).
- `revocarOtrasPorUserId` runs BEFORE `actualizarPassword`; the unit spec asserts order (12.1/12.2).
- `esDemo` and `tokenHashActual` stay REQUIRED inputs — never optional (3.2, 12.2).
- No `.min()`/`.max()`/`.email()` in Zod schemas — domain owns the rules (4.4, 13.4).
- No log line ever carries a `nombre`/`email`/`password`/token VALUE (3.2, 5.4, D-07).
- `openapi.json` + `types.gen.ts` committed WITH the code, never as a follow-up (6.2, 14.2).
- Zero `apps/web/`, `apps/mobile/` diff (8.2, 16.2).
