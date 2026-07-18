# Tasks — auth-login-session

Source of truth for structure: `design.md` §9 (delivery slicing). Requirement IDs: `AUTH-01..10` (`specs/user-authentication`), `AC-06..08` (`specs/api-access-control`), `ISO-01..02` (`specs/user-data-isolation`), `MOB-01..04` (`specs/mobile-session-auth`).

Strict TDD is active for `apps/api` (Vitest) and `apps/mobile` (jest-expo). Every backend/mobile unit lists the test file **before** the implementation file it drives — write the test first, watch it fail, then implement.

**Delivery strategy:** `ask-on-risk`. Design's Review Workload Forecast already flags **Chained PRs recommended: Yes · 400-line budget risk: High**. Do not collapse this into one PR. 4 slices below, each independently reviewable. Chain strategy (stacked-to-main vs feature-branch-chain) is confirmed by the orchestrator with the user before `sdd-apply` starts — this checklist works under either strategy since each slice is scoped as one deliverable unit regardless of which branch it targets.

## Hard sequencing constraint — read before starting Slice 2 or Slice 4

Slice 2 makes `SessionGuard` **mandatory** on `/api/resumen` (and the other 3 data endpoints). The shipped mobile app currently calls `/api/resumen` with `x-api-key` only — the instant Slice 2 lands in the environment mobile talks to, mobile 401s with no login screen to fall back to. This is a **deploy-order constraint, not just a PR-order constraint**: Slice 4 (mobile login + Bearer) MUST be merged and deployed **together with, or immediately after, Slice 2** — never with a gap where Slice 2 is live and Slice 4 is not. If the chosen chain strategy would otherwise merge Slice 2 to `main`/prod before Slice 4 is ready, hold Slice 2's deploy (not just its merge) until Slice 4 ships, or land them as one coordinated release. Record this explicitly in both slices' PR descriptions.

```
Slice 1 (backend + gate, dual transport)
    │
    ├──▶ Slice 2 (rewire + isolation) ──┐
    │                                    ├── MUST deploy together / back-to-back
    └──▶ Slice 3 (web login UI)         Slice 4 (mobile login + Bearer) ──┘
         (depends on Slice 1; meaningful
          isolation depends on Slice 2,
          but UI itself works after Slice 1)
```

---

## Slice 1 — Auth backend + gate (dual transport)

**Ships:** working `/api/auth/login|logout|me`, `SessionGuard` enforcing session on protected routes (cookie or Bearer), rate limiting. **Data endpoints (`resumen`/`movimientos`/`detalle-bucket`/`ingesta`) still resolve `userId` from `USER_ID_FIJO_TOKEN`** — this slice proves identity, it does not yet rewire consumers. No mobile/web client changes.

**Traceability:** AUTH-01..09, AC-06, AC-07, AC-08.

### 1.1 Domain — value objects & errors

- [x] `apps/api/src/domain/value-objects/email.spec.ts` — test `Email.crear`: trims, lowercases, valid format → `Result.ok`; missing `@`, missing domain, empty string → `Result.fail(EmailInvalidoError)`.
- [x] `apps/api/src/domain/value-objects/email.ts` — implement `Email` VO to pass the spec above. (AUTH-02 support)
- [x] `apps/api/src/domain/errors/email-invalido.error.ts` — `EmailInvalidoError`.
- [x] `apps/api/src/domain/errors/credenciales-invalidas.error.ts` — `CredencialesInvalidasError` (generic, scrubbed message `'Credenciales inválidas.'`). (AUTH-02)
- [x] `apps/api/src/domain/errors/sesion-invalida.error.ts` — `SesionInvalidaError`. (AUTH-05, AUTH-06)
- [x] `apps/api/src/domain/value-objects/duracion-sesion.spec.ts` — test `calcularExpiracion(ahora) === ahora + 7d`; `estaExpirada` true at/after boundary, false before.
- [x] `apps/api/src/domain/value-objects/duracion-sesion.ts` — implement `TTL_SESION_MS`, `calcularExpiracion`, `estaExpirada` (pure, no `Date.now()` inside). (AUTH-06)

**Commit 1 (work unit):** `feat(auth): add Email VO, session-duration domain functions, and auth domain errors` — tests + impl together.

### 1.2 Application — ports

- [x] `apps/api/src/application/ports/user-credential-repository.port.ts` — `IUserCredentialRepository`, `CredencialUsuario`, `IdentidadUsuario`, `USER_CREDENTIAL_REPOSITORY` token.
- [x] `apps/api/src/application/ports/password-hasher.port.ts` — `IPasswordHasher`, `PASSWORD_HASHER` token.
- [x] `apps/api/src/application/ports/session-repository.port.ts` — `ISessionRepository`, `SesionPersistida`, `SESSION_REPOSITORY` token.
- [x] `apps/api/src/application/ports/session-token.port.ts` — `ISessionTokenService`, `TokenGenerado`, `SESSION_TOKEN_SERVICE` token.
- [x] `apps/api/src/application/ports/reloj.port.ts` — `IReloj`, `RELOJ` token.

**Commit 2 (work unit):** `feat(auth): add application ports for credentials, password hashing, sessions, tokens, clock` — no tests needed (interfaces only, exercised by use-case specs next).

### 1.3 Application — use cases (TDD, mocked ports)

- [x] `apps/api/src/application/use-cases/login.use-case.spec.ts` — cases: success persists session + returns `{token,userId,expiresAt}`; unknown email → `CredencialesInvalidasError` **and** dummy `verificar` was invoked (assert mock call, no-enumeration); wrong password → identical error; invalid email format → identical error (dummy verify path too). Fake `IReloj`, mocked ports.
- [x] `apps/api/src/application/use-cases/login.use-case.ts` — `LoginUseCase` per design §4 orchestration (Email.crear → dummy-verify-on-fail → buscarPorEmail → verificar → generar+crear sesión). (AUTH-01, AUTH-02, AUTH-03, AUTH-04)
- [x] `apps/api/src/application/use-cases/validar-sesion.use-case.spec.ts` — valid token → `{userId}`; unknown tokenHash → `SesionInvalidaError`; expired (fake clock past `expiresAt`) → `SesionInvalidaError`.
- [x] `apps/api/src/application/use-cases/validar-sesion.use-case.ts` — `ValidarSesionUseCase`. (AUTH-05, AUTH-06)
- [x] `apps/api/src/application/use-cases/logout.use-case.spec.ts` — token present → revokes by tokenHash; token `undefined` → idempotent `Result.ok`.
- [x] `apps/api/src/application/use-cases/logout.use-case.ts` — `LogoutUseCase`. (AUTH-07)
- [x] `apps/api/src/application/use-cases/obtener-identidad.use-case.spec.ts` — returns `{userId,email}`; `buscarIdentidad` → null → fail.
- [x] `apps/api/src/application/use-cases/obtener-identidad.use-case.ts` — `ObtenerIdentidadUseCase`. (AUTH-09)

**Commit 3 (work unit):** `feat(auth): add login, session-validation, logout, and identity use cases` — each use case's test + impl land together; this can be one commit since they're one cohesive vertical slice of application logic, or 4 small commits (one per use case) if preferred — keep tests with the use case they verify either way.

### 1.4 Infrastructure — Prisma schema, migration, seed

- [x] `apps/api/prisma/schema.prisma` — add nullable `email`/`passwordHash` to `User`, new `Session` model (per design §5.1).
- [x] Generate migration `add_auth_login_session` — hand-authored `migration.sql` from the schema delta (DB safety: `prisma migrate dev`/`diff` requires a live/shadow DB connection, out of scope for this batch) — additive/nullable, NOT applied to any database yet.
- [x] `apps/api/prisma/seed.ts` — extend `USER_ID_FIJO` upsert to set `email`/`passwordHash` from `SEED_USER_EMAIL`/`SEED_USER_PASSWORD` env, hashed via `Argon2PasswordHasher`; skip credential backfill (not the whole seed) when env is absent.
- [x] Document in this PR's description: `prisma migrate deploy` must run **before** `prisma db seed` in any environment (runbook note, mirrors design §5.1 ordering).

**Commit 4 (work unit):** `feat(auth): add User email/passwordHash and Session schema, migration, seed backfill` — schema + migration + seed together (a migration without its seed counterpart is incomplete).

### 1.5 Infrastructure — crypto/token/clock adapters (TDD)

- [x] Add `@node-rs/argon2` as a direct `apps/api` runtime dependency (`pnpm --filter @moneydiary/api add @node-rs/argon2`).
- [x] `apps/api/src/infrastructure/http/auth/argon2-password-hasher.spec.ts` — real argon2id roundtrip: `hash` → `verificar` true; wrong password → false. Low-cost params in test config.
- [x] `apps/api/src/infrastructure/http/auth/argon2-password-hasher.ts` — `Argon2PasswordHasher implements IPasswordHasher`. (AUTH-03)
- [x] `apps/api/src/infrastructure/http/auth/sha256-session-token.service.spec.ts` — `generar()` returns token + matching `hashToken(token)`; `hashToken` deterministic.
- [x] `apps/api/src/infrastructure/http/auth/sha256-session-token.service.ts` — `Sha256SessionTokenService implements ISessionTokenService` (`randomBytes(32).toString('base64url')` + SHA-256). (AUTH-04)
- [x] `apps/api/src/infrastructure/http/auth/system-reloj.ts` — `SystemReloj implements IReloj` (`ahora() = new Date()`). Added a 1-line spec (TDD discipline).

**Commit 5 (work unit):** `feat(auth): add argon2 password hasher and SHA-256 session token adapters`.

### 1.6 Infrastructure — Prisma repository adapters (TDD)

- [x] `apps/api/src/infrastructure/persistence/prisma-user-credential.repository.spec.ts` (mocked `PrismaService`, per repo's existing repo-test convention) — `buscarPorEmail` found/not-found/null-passwordHash cases; `buscarIdentidad` found/not-found.
- [x] `apps/api/src/infrastructure/persistence/prisma-user-credential.repository.ts` — `PrismaUserCredentialRepository implements IUserCredentialRepository`.
- [x] `apps/api/src/infrastructure/persistence/prisma-session.repository.spec.ts` — `crear`/`buscarPorTokenHash`/`revocarPorTokenHash` (idempotent) cases.
- [x] `apps/api/src/infrastructure/persistence/prisma-session.repository.ts` — `PrismaSessionRepository implements ISessionRepository`.

**Commit 6 (work unit):** `feat(auth): add Prisma repository adapters for user credentials and sessions`.

### 1.7 Infrastructure — guard chain, markers, decorator (TDD)

- [x] `apps/api/src/infrastructure/http/auth/session-public.decorator.ts` — `IS_SESSION_PUBLIC_KEY`, `PublicSession()`. (AC-07)
- [x] `apps/api/src/infrastructure/http/auth/extraer-token.spec.ts` — pure `extraerToken(request)` helper: cookie-only → cookie token; Bearer-only → Bearer token; both present → cookie token (precedence); malformed `Authorization` (no `Bearer ` scheme) → `undefined`; neither → `undefined`.
- [x] `apps/api/src/infrastructure/http/auth/extraer-token.ts` — implement per design §5.3 (extract as its own module so it's colocated with its spec and reusable from the guard). (AUTH-05)
- [x] `apps/api/src/infrastructure/http/auth/session.guard.spec.ts` — mirrors `api-key.guard.spec.ts` shape: skips on `@Public()`/`@PublicSession()`; authorizes + sets `request.userId` with valid cookie only; authorizes with valid Bearer only; cookie precedence (mock asserts `ValidarSesionUseCase` received the cookie token, not the garbage Bearer); 401 when both transports absent; 401 on invalid token from either transport. Mock `ValidarSesionUseCase` + `Reflector` + request.
- [x] `apps/api/src/infrastructure/http/auth/session.guard.ts` — `SessionGuard implements CanActivate` using `extraerToken` + `ValidarSesionUseCase`. (AUTH-05, AUTH-06, AC-06)
- [x] `apps/api/src/infrastructure/http/auth/express-request.d.ts` — module augmentation, `request.userId?: string`.
- [x] `apps/api/src/infrastructure/http/auth/current-user.decorator.ts` — `@CurrentUser()` param decorator. (used later in Slice 2 — created here since it's part of the guard-chain infra, wired into controllers only in Slice 2)

**Commit 7 (work unit):** `feat(auth): add SessionGuard with cookie-or-Bearer precedence, @PublicSession marker, @CurrentUser decorator`.

### 1.8 Infrastructure — rate limiter (TDD)

- [x] `apps/api/src/infrastructure/http/auth/login-rate-limiter.spec.ts` — blocks after `maxPorEmail` failures; blocks after `maxPorIp`; `resetear` clears both keys; window expiry re-allows; distinct-from-401 assertion left to the controller/e2e test but limiter's `estaBloqueado` boolean is unit-tested directly.
- [x] `apps/api/src/infrastructure/http/auth/login-rate-limiter.ts` — `LoginRateLimiter`, `RateLimitConfig`, env-driven defaults (`LOGIN_RATELIMIT_MAX_EMAIL`, `LOGIN_RATELIMIT_MAX_IP`, `LOGIN_RATELIMIT_WINDOW_MS`). (AUTH-08)
- [x] `apps/api/src/infrastructure/http/auth/client-ip.ts` (own file — cookie.spec-style separate spec, branching logic on x-forwarded-for) — `obtenerIpCliente(req)` (leftmost `x-forwarded-for` hop, fallback `req.socket.remoteAddress`). Added `client-ip.spec.ts`.

**Commit 8 (work unit):** `feat(auth): add hand-rolled login rate limiter with per-email and per-IP thresholds`.

### 1.9 Infrastructure — cookie serialization, controller, module, app wiring

- [x] `apps/api/src/infrastructure/http/auth/cookie.spec.ts` — `serializarCookieSesion` sets `md_session`, `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age=604800`, no `Domain=`, `Secure` present only when `NODE_ENV=production` or `COOKIE_SECURE=true`; `limpiarCookieSesion` same attributes + `Max-Age=0`.
- [x] `apps/api/src/infrastructure/http/auth/cookie.ts` — implement per design §5.4. (AUTH-01)
- [x] `apps/api/src/infrastructure/http/auth/auth.controller.spec.ts` — unit-level controller test (mocked use cases + rate limiter): `POST /login` → blocked path (429), fail path (401 + `registrarFallo` called), success path (`resetear` called, `Set-Cookie` header set, body is `{token,userId,expiresAt}`); `POST /logout` → clears cookie regardless of token presence; `GET /me` → delegates to `ObtenerIdentidadUseCase` with `@CurrentUser()` userId.
- [x] `apps/api/src/infrastructure/http/auth/auth.controller.ts` — `AuthController` (route base `api/auth`) per design §5.4. (AUTH-01, AUTH-07, AUTH-09, AC-07)
- [x] `apps/api/src/infrastructure/http/auth/auth.module.ts` — composition root: providers for all 5 ports (`useFactory`, no decorators), 4 use cases, `LoginRateLimiter`, `SessionGuard`, `AuthController`; exports `SessionGuard`.
- [x] `apps/api/src/main.ts` — add `app.set('trust proxy', 1)`.
- [x] `apps/api/src/app.module.ts` — import `AuthModule`; register `{ provide: APP_GUARD, useExisting: SessionGuard }` **after** the existing `ApiKeyGuard` provider (order matters — AC-06).
- [x] Confirmed `app.controller.ts` health route's existing `@Public()` is unchanged and skips both guards structurally (`SessionGuard` checks `IS_PUBLIC_KEY` too) — no code change needed; a live assertion is part of the deferred e2e suite (AC-08).

**Commit 9 (work unit):** `feat(auth): add cookie serialization, AuthController, and wire SessionGuard as second global guard`.

### 1.10 Integration / e2e tests (real DB, destructive gate)

- [x] `apps/api/test/auth-login.e2e-spec.ts` — login with seeded creds → 200 + `Set-Cookie` (HttpOnly/SameSite=Strict/no Domain=) + body `{token,userId,expiresAt}`; wrong password ≡ unknown email (same status+shape); a protected endpoint 401 without session, 200 with cookie session (AC-06); Bearer transport 200 with `Authorization: Bearer <body.token>` and no cookie; cookie-precedence case (valid cookie + garbage Bearer still succeeds); `GET /me` returns identity; logout clears cookie + revokes row while a second session (Y) still works (AUTH-07). **Written but NOT executed against the real DB this batch** (DB safety — migration not applied); every assertion gates on `ALLOW_DESTRUCTIVE_DB=1`.
- [x] `apps/api/test/auth-rate-limit.e2e-spec.ts` — N failed logins for one email → 429 (distinct from 401); correct login not throttled. **Written but NOT executed against the real DB this batch**, same deferral as above.

**Commit 10 (work unit):** `test(auth): add login and rate-limit e2e coverage` — no new prod code, pure verification unit; still a legitimate standalone commit since it exercises the full slice end-to-end.

### 1.11 Slice 1 close-out

- [x] Run `pnpm api test` (unit) green — 570/570. `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:e2e` is **DEFERRED** (requires applying the migration first — explicit user approval step, out of scope for this batch per DB safety).
- [x] Run `pnpm api exec tsc --noEmit` — clean.
- [ ] Update `CLAUDE.md` "Estado actual" only if this PR merges standalone before Slice 2/3/4 are ready (optional — coordinate with the chain strategy chosen by the orchestrator). Not done in this batch (mid-slice, not merge-ready yet).
- [x] PR description note (for whoever opens the PR): data endpoints still use `USER_ID_FIJO_TOKEN` (no isolation change yet) and that is intentional — Slice 2 follows. Also flag the deferred migration-apply + e2e run as an explicit follow-up before merge/deploy.

---

## Slice 2 — Session → `userId` rewire + isolation

**Ships:** the 4 data controllers derive `userId` from `@CurrentUser()`; `USER_ID_FIJO_TOKEN` deleted; real per-user isolation (ISO-01/ISO-02) proven with an integration test across both transports. **Depends on Slice 1** (needs `SessionGuard`, `@CurrentUser()`, `ValidarSesionUseCase` already merged).

**⚠️ Deploy coupling:** see "Hard sequencing constraint" above — this slice must not go live without Slice 4 shipping alongside or immediately after.

**Traceability:** ISO-01, ISO-02.

### 2.1 Rewire controllers (mechanical, one commit per controller or grouped — see note)

- [x] `apps/api/src/infrastructure/http/resumen.controller.ts` — remove `@Inject(USER_ID_FIJO_TOKEN) private readonly userId` ctor param; add `@CurrentUser() userId: string` param on the handler; pass into `execute({ userId, periodo })`.
- [x] `apps/api/src/infrastructure/http/resumen.module.ts` — remove the `{ provide: USER_ID_FIJO_TOKEN, useValue: USER_ID_FIJO }` provider + its import.
- [x] `apps/api/src/infrastructure/http/movimientos.controller.ts` — same rewire on `listar()`.
- [x] `apps/api/src/infrastructure/http/movimientos.module.ts` — same provider removal.
- [x] `apps/api/src/infrastructure/http/detalle-bucket.controller.ts` — same rewire on `obtener()`.
- [x] `apps/api/src/infrastructure/http/detalle-bucket.module.ts` — same provider removal.
- [x] `apps/api/src/infrastructure/http/ingesta.controller.ts` — remove `import { USER_ID_FIJO }` + `userId: USER_ID_FIJO`; add `@CurrentUser() userId: string` param on `ingestar()`; pass into `execute({ fileReader, userId })`.
- [x] `apps/api/src/infrastructure/persistence/constants.ts` — delete `USER_ID_FIJO_TOKEN` (dead after the above). **Keep `USER_ID_FIJO`** (still used by `seed.ts` + CLI).
- [x] `apps/api/src/infrastructure/persistence/constants.spec.ts` — checked: no assertion referenced `USER_ID_FIJO_TOKEN`, no change needed.
- [x] Update each of the 4 controllers' existing `*.spec.ts` (`resumen.controller.spec.ts`, `movimientos.controller.spec.ts` if present, `detalle-bucket.controller.spec.ts`, `ingesta.controller.spec.ts`) — replace the fixed-userId injection mock with a `@CurrentUser()`-style injected param in the test call, asserting the use case still receives whatever `userId` the test passes in. `resumen.controller.spec.ts` and `movimientos.controller.spec.ts` did not exist before this slice — created new (Strict TDD, first coverage of these controllers). Also updated `session-public-carveout.spec.ts` into a permanent regression guard (asserts the 4 controllers do NOT carry `IS_SESSION_PUBLIC_KEY` anymore).
- [x] Confirm `apps/api/src/infrastructure/cli/ingestar.ts` is untouched (still passes `USER_ID_FIJO` directly — no session concept for the local CLI, per design §2).

**Commit 1 (work unit):** `refactor(auth): derive userId from session across the 4 data controllers` — commit `e38674f`.

### 2.2 Isolation integration test (TDD-after, since it exercises the rewire)

- [x] `apps/api/test/auth-isolation.int-spec.ts` — seed users A and B, each with their own account + transactions for the same period; log in as A; assert all 4 endpoints (`/api/resumen`, `/api/movimientos`, `/api/buckets/:bucket`, `/api/ingestas`) return only A's data (ISO-02). Cover both transports for `/api/resumen` (A's cookie, then identically A's `Authorization: Bearer`). No-keyless-fallback case: `/api/resumen` with valid `x-api-key` but no session (neither cookie nor Bearer) → 401 (ISO-01). Requires `ALLOW_DESTRUCTIVE_DB=1`. **Written, NOT executed against the real DB this batch** — same deferral as Slice 1's e2e suites (migration not yet applied, pending explicit user approval).

**Commit 2 (work unit):** `test(auth): add cross-user isolation integration test across all 4 endpoints and both transports` — commit `8472051`.

### 2.3 Slice 2 close-out

- [x] `pnpm api test` = 598/598 green (unit). `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:e2e`/`test:integration` **DEFERRED** — same reason as Slice 1 (migration not applied to any DB yet; out of scope for this batch per DB safety, requires explicit user approval).
- [x] `pnpm api exec tsc --noEmit` — clean.
- [x] PR description note (for whoever opens the PR): MUST call out the deploy coupling with Slice 4 — SessionGuard is now mandatory on `/api/resumen` (and the other 3 data endpoints); the shipped mobile app (`apps/mobile`) currently calls `/api/resumen` with `x-api-key` only and will 401 with no login screen to fall back to once this slice is LIVE. Do not deploy this slice ahead of Slice 4 — merge/deploy together or back-to-back (see "Hard sequencing constraint" at the top of this document). Also flag: the 4 existing `*.e2e-spec.ts` files for these endpoints (`resumen.e2e-spec.ts`, `movimientos.e2e-spec.ts`, `detalle-bucket.e2e-spec.ts`, `ingesta.e2e-spec.ts`) call these endpoints with `x-api-key` only, no session — they will need an authenticated session added before `pnpm api test:e2e` can pass post-migration; not in this slice's scope per tasks.md, tracked as a follow-up.

---

## Slice 3 — Web login UI

**Ships:** `/login` route, protected-route redirect, web auth client. **Depends on Slice 1** (login endpoint exists) for the UI to function; **depends on Slice 2** for the redirect-on-401 behavior to mean anything (isolation is what makes the gate load-bearing) — but the UI itself compiles/works after Slice 1 alone, so this can be built/reviewed in parallel with Slice 2 if the chain strategy allows, merging after both.

**Traceability:** AUTH-01 (web-must-not-persist body token), AUTH-10.

### 3.1 API client + types (TDD)

- [ ] `apps/web/src/api/auth.spec.ts` (or colocated with existing web test conventions) — `postLogin` posts credentials, returns `ApiResult<void>` (does not surface the token even on success — assert the resolved value contains no `token` field); `fetchMe` maps 200→`MeDto`, 401→`{tag:'unauthorized'}`; `postLogout` posts and returns `ApiResult<void>`.
- [ ] `apps/web/src/api/auth.ts` — implement `postLogin`/`fetchMe`/`postLogout` per design §6.1, same never-throw `ApiResult<T>` discipline as `api/client.ts`, same-origin `fetch` (cookie flows via default `credentials: 'same-origin'`). (AUTH-01 web-must-not-persist)
- [ ] `apps/web/src/api/types.ts` — add `MeDto = { userId: string; email: string }`.

**Commit 1 (work unit):** `feat(web): add auth API client (postLogin/fetchMe/postLogout) that never surfaces the login body token`.

### 3.2 Login route + protected layout (TDD where testable)

- [ ] `apps/web/src/lib/require-session.spec.ts` (or `routes/_authenticated.spec.ts`, matching existing test-location conventions) — test the extracted `requireSession(fetchMe)` helper: `unauthorized` result → throws/returns a `redirect({ to: '/login' })` call; `ok` result → passes through.
- [ ] `apps/web/src/lib/require-session.ts` (or colocated) — implement the helper (extracted so it's unit-testable without a live router context, per design §6.1 note).
- [ ] `apps/web/src/routes/login.tsx` — `createFileRoute('/login')`, email+password form → `postLogin()`; success → `navigate({ to: '/' })` honoring an optional `redirect` search param; failure → generic message. Container/presentational split.
- [ ] `apps/web/src/components/LoginForm.test.tsx` (or colocated with the route per existing convention) — renders inputs; submit calls `postLogin`; shows error on failure; navigates on success (mock `api/auth` + router).
- [ ] `apps/web/src/routes/_authenticated.tsx` — pathless layout, `beforeLoad` using `requireSession(fetchMe)`.
- [ ] Move `apps/web/src/routes/index.tsx` → `apps/web/src/routes/_authenticated/index.tsx` (mechanical file move, component body unchanged).
- [ ] Move `apps/web/src/routes/buckets.$bucket.tsx` → `apps/web/src/routes/_authenticated/buckets.$bucket.tsx` (mechanical file move, component body unchanged).
- [ ] Regenerate `apps/web/src/routeTree.gen.ts` via `tsr generate` (already wired into `build`/`typecheck` — run once locally to confirm no manual edits needed, file stays gitignored).

**Commit 2 (work unit):** `feat(web): add /login route, protected-route redirect via _authenticated layout` — route + moved files + their tests land together (the move is only correct alongside the new gate that replaces the previous unprotected access).

### 3.3 Slice 3 close-out

- [ ] Run `pnpm web test` green.
- [ ] Run `pnpm web typecheck` (runs `tsr generate` + `tsc -b`) green.
- [ ] Manually confirm the landing page's "Ingresar" button is unchanged (AUTH-10 — no regression).

---

## Slice 4 — Mobile login UI + Bearer

**Ships:** mobile login screen, SecureStore token persistence, Bearer header on authenticated requests, root session gate, logout. **Depends on Slice 1** (login returns body token) **and Slice 2** (the `/api/resumen` endpoint mobile calls now actually enforces the session — without Slice 2 merged, Bearer would validate but `userId` would still be the fixed constant, making this slice's isolation guarantee untestable/meaningless). **MUST ship together with or immediately after Slice 2 — see the hard sequencing constraint at the top of this document.**

**Traceability:** MOB-01, MOB-02, MOB-03, MOB-04.

### 4.1 Dependency + token store (TDD)

- [x] Add `expo-secure-store` as a direct `apps/mobile` dependency via `expo install expo-secure-store` (run inside `apps/mobile` — do NOT `pnpm add` a floating version; pins to the SDK 57-vendored version).
- [x] `apps/mobile/src/api/session-store.spec.ts` — mock `expo-secure-store`; `guardarToken` calls `setItemAsync(KEY, token)`; `leerToken` returns stored value, `null` when absent; `borrarToken` calls `deleteItemAsync`, idempotent (calling twice does not throw).
- [x] `apps/mobile/src/api/session-store.ts` — implement `guardarToken`/`leerToken`/`borrarToken` wrapping `expo-secure-store`, `KEY = 'md_session_token'`, never-throws-across-boundary discipline. (MOB-01)

**Commit 1 (work unit):** `feat(mobile): add expo-secure-store token store for session persistence` — commit `d4bcee3`.

### 4.2 HTTP client wiring (TDD)

- [x] `apps/mobile/src/api/client.spec.ts` (extend existing) — `fetchResumen` sends both `x-api-key` and `Authorization: Bearer <token>` when `leerToken()` resolves a token (mock the store module); sends only `x-api-key` when no token; 401 still maps to `{tag:'unauthorized'}` (unchanged). New: `postLogin` POSTs credentials, `ok`→`{token,userId,expiresAt}`, failure→`{tag:'unauthorized'}`; `fetchMe`/`postLogout` send both headers when a token exists.
- [x] `apps/mobile/src/api/client.ts` — extend `fetchResumen` per above; add `postLogin`/`fetchMe`/`postLogout`. (MOB-02, MOB-04)
- [x] `apps/mobile/src/domain/resumen.types.ts` (or wherever mobile DTOs live alongside existing types) — add `MeDto = { userId: string; email: string }`.

**Commit 2 (work unit):** `feat(mobile): wire Authorization Bearer header into the HTTP client and add login/me/logout calls` — commit `e147ae6`.

### 4.3 Login screen (TDD)

- [x] `apps/mobile/app/login.spec.tsx` — renders email+password inputs + submit; submit calls `postLogin`; on success calls `guardarToken(value.token)` and navigates to `/` (mock `expo-router`); on failure shows a generic error and does NOT call `guardarToken`.
- [x] `apps/mobile/app/login.tsx` — Expo Router route, `{idle|submitting|error}` state via `useState`, container/presentational split (mirrors `app/index.tsx` conventions). (MOB-01)

**Commit 3 (work unit):** `feat(mobile): add login screen storing the session token on success` — commit `42f8093`.

### 4.4 Session gate + logout (TDD)

- [x] `apps/mobile/src/api/session-gate.spec.ts` (or `useSessionGate.spec.ts`, colocated with the hook) — no stored token → gate reports `unauthenticated`, `/api/resumen` client is NOT called (assert client mock not invoked); stored token + resumen call returns `{tag:'unauthorized'}` → gate calls `borrarToken` and reports `unauthenticated`; valid token + ok resumen → gate reports `authenticated`.
- [x] `apps/mobile/src/api/use-session-gate.ts` (or a suitable colocated path matching existing mobile module layout) — implement `useSessionGate()` returning `{estado:'checking'|'authenticated'|'unauthenticated'}`. (MOB-03)
- [x] `apps/mobile/app/_layout.tsx` — wrap `Stack` with the gate: `checking` → loading state; `unauthenticated` → redirect to `/login`; `authenticated` → render protected stack. (MOB-03) — implemented via `Stack.Protected` guards (official Expo Router auth pattern) instead of a manual `<Redirect>`, so `/login` stays a reachable registered screen; the gate re-runs on every `usePathname()` change so a fresh login is picked up.
- [x] Logout affordance test (extend `app/index.spec.tsx` or a new small component spec, wherever the logout action lives per design's "minimal affordance" note) — logout action calls `postLogout` then `borrarToken` then redirects to `/login`; local token cleared even when `postLogout` rejects/network-fails (MOB-04).
- [x] Implement the logout affordance (small button/menu item on the resumen screen) wired to the sequence above. (MOB-04)

**Commit 4 (work unit):** `feat(mobile): add session gate on app start and logout action clearing local + server session` — commit `a6311c3`.

**POST-REVIEW FIX (same slice, follow-up batch on `feat/auth-login-session-4`): root-cause deadlock in the gate above.**
A fresh-context review found that the `use-session-gate.ts` implementation above (async `fetchResumen()` keyed on `usePathname()`) deadlocks: on login, `app/login.tsx` stores the token and calls `router.replace('/')` while `estado` is still `unauthenticated`; `Stack.Protected` blocks the navigation (guard false), so the pathname never actually changes, the gate's effect never re-runs, and the user is stranded on `/login` despite holding a valid token (logout mirrors the same deadlock in reverse). Fixed by replacing `use-session-gate.ts`/`useSessionGate()` with a **synchronous auth-context** (`apps/mobile/src/api/session-context.tsx` — `SessionProvider` + `useSession()`, exposing `{estado, signIn(token), signOut()}`), the official Expo Router auth-gating pattern: `signIn`/`signOut` are plain `setState` calls that flip the guard on the SAME render pass, no external re-trigger needed. `app/_layout.tsx`, `app/login.tsx`, `app/index.tsx` updated accordingly; `use-session-gate.ts`/`.spec.ts` deleted. Cold-start validation now calls `fetchMe()` (not `fetchResumen()`) — decouples the auth gate from the resumen screen's own data fetch and fixes review finding #4 (duplicate `/api/resumen` call). New `apps/mobile/src/api/session-context.spec.tsx` (unit) + `apps/mobile/test/auth-navigation.integration.spec.tsx` (real navigation integration test via `expo-router/testing-library`'s `renderRouter`, proving both login and logout actually LAND on the target screen, not just that a navigation function was called — this is the coverage gap that hid the original bug). Also closed in the same batch: SEC MEDIUM (`session-store.ts` `borrarToken` now verifies the delete by re-reading and retries once before surfacing via `console.warn`, instead of silently claiming success on a failed keychain delete), REL MEDIUM (double-submit guard in `login.tsx`'s submit handler), REL LOW (wrapped the logout interaction in `app/index.spec.tsx` in `act(...)`). `pnpm --filter @moneydiary/mobile test` = 103/103 green (up from 91), `tsc --noEmit` clean.

### 4.5 Slice 4 close-out

- [ ] Run `pnpm --filter @moneydiary/mobile test` green.
- [ ] Manually verify on device/Expo Go (per ADR-017 Maestro is manual, not CI): fresh install → login screen shown, no `/api/resumen` call fires before login; successful login → resumen renders; kill+relaunch app → still authenticated (SecureStore persisted); logout → returns to login screen and old token is rejected server-side.
- [ ] Coordinate merge/deploy timing with Slice 2 per the hard sequencing constraint (this is the deploy gate check, not optional).

---

## Cross-slice / final checklist (after all 4 slices merged)

- [ ] Update `CLAUDE.md` "Estado actual" with the closed sprint/change summary for `auth-login-session` (US/ADR references if any apply, or note as an SDD change outside the sprint numbering).
- [ ] Confirm `docs/mobile-launch-runbook.md`'s Track A note (11.6 column-encryption accepted-risk) is still accurate — this change does not touch `descripcion`/`ICryptoService`, so no update expected, but verify no drift.
- [ ] Run `pnpm test` and `pnpm build` at the workspace root once all 4 slices are on the same branch/main.
- [ ] Confirm no `USER_ID_FIJO_TOKEN` references remain anywhere (`rg USER_ID_FIJO_TOKEN` should be empty after Slice 2 — re-check after all slices in case of merge conflicts reintroducing it).

---

## Review Workload Forecast

- **Chained PRs recommended:** Yes.
- **400-line budget risk:** High.
- **Estimated changed lines per slice** (rough, additions+deletions, includes tests):
  - Slice 1: ~750–950 lines (5 domain files, 5 ports, 4 use cases + specs, Prisma delta+migration+seed, 3 crypto/token/clock adapters + specs, 2 Prisma repo adapters + specs, guard+marker+decorator+extraer-token + specs, rate-limiter + spec, cookie+controller+module+wiring + specs, 2 e2e files). **This is the largest slice and likely needs its own internal split** (e.g. domain+application as commit-group A, infrastructure adapters as commit-group B, guard+controller+wiring as commit-group C) even within one PR, or a further chain split (1a: domain/application/adapters, 1b: guard/controller/wiring) if the reviewer's 60-minute budget is tight. Flag this to the user when confirming chain strategy.
  - Slice 2: ~150–250 lines (4 controllers + 4 modules + constants + spec updates + 1 integration test file). Lower risk, single coherent PR.
  - Slice 3: ~200–300 lines (auth client + types + login route + layout + 2 moved files + tests).
  - Slice 4: ~300–400 lines (session store + client extension + login screen + gate + logout + 4 spec files).
  - **Total estimate: ~1,400–1,900 changed lines** across the whole change — well over any single-PR budget, confirming the chain recommendation.
- **Decision needed before apply:** Yes — specifically (a) confirm chain strategy (stacked-to-main vs feature-branch-chain) and (b) confirm whether Slice 1 itself needs sub-splitting given its size estimate above.
- **Chain strategy considerations:**
  - **stacked-to-main** fits well here: Slice 1 is safe to merge alone (adds a dormant auth system, doesn't change any existing behavior — data endpoints are untouched). Slice 2 and Slice 4 are the pair with a real coupling constraint (see hard sequencing note) — under stacked-to-main this means holding Slice 2's *deploy* (not necessarily its merge-to-main, if deploys are decoupled from merges) until Slice 4 is ready, or merging them close together. Slice 3 can stack independently after Slice 1.
  - **feature-branch-chain** also fits, and makes the Slice 2/4 coupling structurally explicit (tracker branch only merges to main once all 4 children, including the paired 2+4, are integrated) — trades faster main-integration for a cleaner deploy-coupling guarantee. Likely the safer default here specifically because of the mobile-outage risk if Slice 2 deploys to production ahead of Slice 4.
  - Either way: Slice 1 → (Slice 2 and Slice 4 as a coordinated pair) → Slice 3 can run in parallel with the Slice 2/4 pair once Slice 1 is in.
