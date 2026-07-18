# Design — auth-login-session

Architecture + concrete technical decisions to satisfy the spec (AUTH-01..10, AC-06..08, ISO-01..02, **MOB-01..04**) under Clean Architecture (ADR-005), `Result<T,E>` (never throw in domain/application), Spanish domain/application naming + English infrastructure (backend); pure-TS `src/domain` for mobile. Strict TDD (Vitest backend/web — ADR-016; jest-expo + RNTL mobile — ADR-017).

All LOCKED proposal decisions are encoded here, not re-opened. This document resolves the **two OPEN questions** (rate-limit mechanism; how `SessionGuard` exposes `userId`) and specifies every component, interface signature, data-model delta, and wiring.

> **REVISION (dual transport + mobile auth).** A gate review found the shipped mobile app (`apps/mobile`) calls `GET /api/resumen` with only `x-api-key`; a global mandatory `SessionGuard` would 401 it. Mobile now gets **real session auth** reusing the **same** `Session` table, opaque token, SHA-256 hash, and `ValidarSesionUseCase` — the **only** difference is transport: web keeps the HttpOnly cookie, mobile uses `Authorization: Bearer <token>` stored in **Expo SecureStore**. Login now ALSO returns the raw token in the response body (web ignores it; mobile persists it). `SessionGuard` extracts the token from **cookie OR `Authorization: Bearer`** (cookie takes precedence when both present). No `USER_ID_FIJO` keyless fallback remains on any of the 4 data endpoints, `/api/resumen` included. This revision touches four areas of this doc — §2 (resumen isolation), §5.3 (guard transport), §5.4 (login body), the new **§6.2 Mobile layer** — plus §7/§8/§9/§10; the rate-limit decision (§1) and the `@CurrentUser()` decision (§2) stand unchanged.

---

## 0. Architecture at a glance

```
Web (cookie)  ┐                                   ApiKeyGuard (APP_GUARD #1, existing)  ── AND ──▶ SessionGuard (APP_GUARD #2, new)
Mobile (Bearer)┘─▶ Request ─────────────────────▶   │ skips @Public()                                │ skips @Public() OR @PublicSession()
                                                     │                                                │ resolves token: cookie md_session FIRST,
                                                     │                                                │ else Authorization: Bearer → validates → sets request.userId
                                                     ▼                                                ▼
   AuthController (api/auth: login/logout/me)      4 data controllers (@CurrentUser() userId)
             │                                                │
   LoginUseCase / LogoutUseCase / ValidarSesion    existing use cases (unchanged signatures)
   ObtenerIdentidadUseCase                          take userId: string
             │ (ports)                                        │
   IUserCredentialRepository · IPasswordHasher      IResumenMesReader · IMovimientosMes · …
   ISessionRepository · ISessionTokenService · IReloj
             │ (adapters, infra)
   Prisma repos · Argon2PasswordHasher · Sha256SessionTokenService · SystemReloj · LoginRateLimiter
```

Dependency direction stays `domain ← application ← infrastructure`. The guard, decorator, rate-limiter, cookie serialization, and token/hash primitives all live in **infrastructure**; application receives only plain values (`string`, `Date`, `boolean`) through ports. Application never imports NestJS, Express, Prisma, `node:crypto`, or `@node-rs/argon2`. **Dual transport is an infrastructure concern only**: `SessionGuard` reads the token from either the cookie or the `Authorization` header and hands `ValidarSesionUseCase` a plain `string` — the application/domain layers are transport-agnostic and require **zero** changes for mobile. On the client side, `apps/mobile` mirrors the same discipline: a pure-TS `src/domain`, a thin `src/api` client that is the only place touching `fetch`/SecureStore, and Expo Router screens in `app/`.

---

## 1. OPEN QUESTION 1 — Rate limiting

### Decision: hand-rolled in-memory `LoginRateLimiter` (NO new dependency), consulted by `AuthController`

**Rejected: `@nestjs/throttler`.** Reasons, grounded in the design skills:
- **YAGNI / dependency posture.** Throttler is a new runtime dependency subject to `.npmrc` `minimum-release-age=10080` quarantine and adds a global guard we do not want globally. The repo already chose to **hand-roll cookie parsing** to avoid `cookie-parser`; the same reasoning applies here. A single Render instance needs **no shared store** — in-memory is correct, not a limitation to design around (Redis would be speculative infrastructure).
- **Semantic mismatch (the decisive one).** AUTH-08 requires throttling **failed** attempts and states *"Successful authentication MUST NOT be throttled by this mechanism."* Throttler counts **every** request that reaches the route regardless of outcome, so a correct password typed after a few failures still consumes the window. Getting throttler to count only failures requires fighting its model (`skipIf`/manual `storageService` poking). A small purpose-built limiter that we increment **only on failure** and **reset on success** matches the spec exactly and is simpler to read (KISS).
- **Per-email keying.** Throttler keys by IP (`getTracker` override needed for per-email). We need **both** per-IP and per-email; a two-key `Map` is trivial hand-rolled.

**Component:** `apps/api/src/infrastructure/http/auth/login-rate-limiter.ts` — an injectable singleton.

```ts
export interface RateLimitConfig {
  readonly maxPorEmail: number;   // default 5
  readonly maxPorIp: number;      // default 20
  readonly ventanaMs: number;     // default 900_000 (15 min)
}

export class LoginRateLimiter {
  // Map<key, { conteo: number; expiraEn: number }>; key = `email:<normEmail>` | `ip:<ip>`
  estaBloqueado(ip: string, email: string): boolean;      // true if EITHER counter ≥ its max within window
  registrarFallo(ip: string, email: string): void;        // increment both keys; lazily (re)start window
  resetear(ip: string, email: string): void;              // clear both keys on successful login
}
```

- **Storage:** in-process `Map`, single Render instance. Lazy eviction: on each access, entries past `expiraEn` are treated as absent (and overwritten). No timer/sweeper needed (KISS).
- **Window:** fixed window of `ventanaMs` (15 min default), started on first failure for a key.
- **Thresholds (defaults, env-configurable):** `LOGIN_RATELIMIT_MAX_EMAIL=5`, `LOGIN_RATELIMIT_MAX_IP=20`, `LOGIN_RATELIMIT_WINDOW_MS=900000`. Read once at module composition (mirrors `ApiKeyGuard` env-driven config).
- **Throttled response:** HTTP **429** with a generic body (`{ message: 'Demasiados intentos. Espera unos minutos.' }`), **distinct** from the 401 generic-invalid-credentials response (satisfies AUTH-08 scenario "distinct from the generic invalid-credentials response"). Optional `Retry-After` header; no per-account state leaked.
- **Counts only failures / resets on success:** the **controller** (not the use case) calls `registrarFallo` when `LoginUseCase` returns `Result.fail`, and `resetear` when it returns `Result.ok`. This keeps `LoginUseCase` free of IP/transport concerns (SRP) — rate limiting is an HTTP-transport policy, not a domain rule.

### Real client IP through the proxies

- **Helper** `obtenerIpCliente(req)` in `login-rate-limiter.ts` (or a small `client-ip.ts`): read the **leftmost** hop of `x-forwarded-for`; fall back to `req.socket.remoteAddress`.
- **Dev (Vite proxy):** `http-proxy` with `changeOrigin: true` appends `x-forwarded-for` by default → real browser IP present.
- **Prod (Vercel function `[...path].ts`):** it forwards all client headers except `host`/`connection`/`x-api-key`, so the `x-forwarded-for` set by Vercel's edge passes through to Render untouched.
- **Express trust proxy:** set `app.set('trust proxy', 1)` in `main.ts` so `req.ip` is also correct as defense-in-depth (we read XFF directly, but this keeps Express consistent).
- **Spoofability caveat (documented risk):** `x-forwarded-for` is client-controllable in principle; behind Render + Vercel the platform overwrites/sets it. The **per-email** limit is the real backstop against a spoofed-IP brute force. Acceptable for the MVP threat model (ADR-021), recorded as a risk.

---

## 2. OPEN QUESTION 2 — How `SessionGuard` exposes `userId` to controllers

### Decision: `SessionGuard` augments the request; a `@CurrentUser()` param decorator reads it. Use-case signatures unchanged.

- **`SessionGuard` (infra)** validates the cookie via `ValidarSesionUseCase`, then writes the validated id onto the Express request: `request.userId = userId`.
- **`@CurrentUser()` param decorator (infra)** — `createParamDecorator((_data, ctx) => ctx.switchToHttp().getRequest<Request>().userId)` — injects that `string` as a **method parameter**.
- **The 4 controllers** stop constructor-injecting `USER_ID_FIJO_TOKEN` and instead accept `@CurrentUser() userId: string` as a handler parameter, then pass it into the **existing** use case exactly as before (`execute({ userId, … })`). The application use cases (`CalcularResumenMesUseCase`, `ObtenerMovimientosMesUseCase`, `ObtenerDetalleBucketUseCase`, `ProcessIngestaUseCase`) **do not change** — they already take `userId: string`.

**Why this respects `domain ← application ← infrastructure`:** the decorator and guard are pure infrastructure (HTTP/Express). They hand the application layer a plain `string`. Nothing from NestJS/Express leaks into `application/` or `domain/`. This is strictly cleaner than the alternative (`@Inject(REQUEST)` request-scoped provider), which would force request scope on the use-case providers and complicate the composition roots — rejected on KISS grounds.

**Request typing:** add module augmentation so `request.userId` is typed:
`apps/api/src/infrastructure/http/auth/express-request.d.ts` →
```ts
declare global { namespace Express { interface Request { userId?: string } } }
export {};
```

**Per-controller edits (Slice 2):**

| Controller | Remove | Add |
|---|---|---|
| `resumen.controller.ts` | `@Inject(USER_ID_FIJO_TOKEN) private readonly userId` (ctor) | `@CurrentUser() userId: string` param on `obtener()`; use it in `execute({ userId, periodo })` |
| `movimientos.controller.ts` | same ctor inject | `@CurrentUser() userId` param on `listar()` |
| `detalle-bucket.controller.ts` | same ctor inject | `@CurrentUser() userId` param on `obtener()` |
| `ingesta.controller.ts` | `import { USER_ID_FIJO }` + `userId: USER_ID_FIJO` | `@CurrentUser() userId` param on `ingestar()`; `execute({ fileReader, userId })` |

| Module | Remove |
|---|---|
| `resumen.module.ts`, `movimientos.module.ts`, `detalle-bucket.module.ts` | the `{ provide: USER_ID_FIJO_TOKEN, useValue: USER_ID_FIJO }` provider + the import |
| `constants.ts` | `USER_ID_FIJO_TOKEN` becomes dead → delete it. Keep `USER_ID_FIJO` (still used by `seed.ts` + CLI). |

**CLI stays on `USER_ID_FIJO`.** `infrastructure/cli/ingestar.ts` has no session; it is a local admin tool, not one of the "4 controllers" ISO-01 governs. It keeps passing `USER_ID_FIJO` directly (YAGNI — no session concept for a local CLI). Documented.

**No keyless fallback on any of the 4 endpoints — `/api/resumen` included (ISO-01 revised).** Because `SessionGuard` is a global mandatory guard and every one of the 4 controllers now derives `userId` from `@CurrentUser()`, there is **no** code path that answers a data request with a fixed/default id. This holds identically for **both transports**: a web caller with only a cookie-less request and a mobile caller with only `x-api-key` (no Bearer token) both get **401**, not a `USER_ID_FIJO` result. This is the load-bearing change that makes mobile `/api/resumen` a real per-user endpoint rather than a shared-key public read — the `x-api-key` layer is app-level admission, never identity.

---

## 3. Domain layer (`apps/api/src/domain/`, Spanish)

### Value objects
- **`value-objects/email.ts`** — `Email`.
  - `static crear(raw: string): Result<Email, EmailInvalidoError>` — trims, **lowercases** (normalization), validates with one pragmatic format regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`). Immutable, exposes `valor: string`. KISS: no exotic RFC-5322 parsing.
- **NO password VO.** Justified by **YAGNI**: login only needs to *verify* an existing hash — password **policy/strength** is a register-time concern, and register is the explicitly deferred next change. The raw password stays a `string` passed straight to `IPasswordHasher.verificar`. Adding a policy VO now would be speculative (a code path no current requirement exercises). Recorded as deliberate.
- **`duracion-sesion.ts`** — pure domain functions owning the **7-day absolute TTL** (single source of truth, DRY):
  - `TTL_SESION_MS = 7 * 24 * 60 * 60 * 1000`
  - `calcularExpiracion(ahora: Date): Date` → `new Date(ahora.getTime() + TTL_SESION_MS)`
  - `estaExpirada(expiresAt: Date, ahora: Date): boolean` → `ahora.getTime() >= expiresAt.getTime()`
  These are pure (no `Date.now()` inside) so tests drive them with a fixed `ahora` — determinism without a heavyweight VO.

### Errors
- **`errors/credenciales-invalidas.error.ts`** — `CredencialesInvalidasError`, the **single generic** error returned for *both* unknown-email and wrong-password (AUTH-02, no enumeration). Scrubbed message (`'Credenciales inválidas.'`), no field distinguishing the two cases.
- **`errors/sesion-invalida.error.ts`** — `SesionInvalidaError` for missing/unknown/expired/tampered session (AUTH-05/06).
- **`errors/email-invalido.error.ts`** — `EmailInvalidoError` produced by the `Email` VO. `LoginUseCase` maps it internally to `CredencialesInvalidasError` (an invalid email format must not surface as a *different* error → no enumeration).

> **`passwordHash` is a one-way hash — NOT ADR-013's reversible `CryptoService`.** It must never be wired through `ICryptoService`/`NoOpCryptoService` (that port is for reversible column encryption like `descripcion`). Kept entirely separate.

---

## 4. Application layer (`apps/api/src/application/`, Spanish)

### Ports (interfaces in `application/ports/`, adapters in infra)

```ts
// user-credential-repository.port.ts
export interface CredencialUsuario { readonly userId: string; readonly passwordHash: string }
export interface IdentidadUsuario  { readonly userId: string; readonly email: string }
export interface IUserCredentialRepository {
  buscarPorEmail(email: Email): Promise<CredencialUsuario | null>; // null = unknown email
  buscarIdentidad(userId: string): Promise<IdentidadUsuario | null>; // for GET /me
}
export const USER_CREDENTIAL_REPOSITORY = 'IUserCredentialRepository';

// password-hasher.port.ts
export interface IPasswordHasher {
  hash(plano: string): Promise<string>;
  verificar(plano: string, hash: string): Promise<boolean>; // argon2id constant-time verify
}
export const PASSWORD_HASHER = 'IPasswordHasher';

// session-repository.port.ts
export interface SesionPersistida { readonly userId: string; readonly expiresAt: Date }
export interface ISessionRepository {
  crear(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  buscarPorTokenHash(tokenHash: string): Promise<SesionPersistida | null>;
  revocarPorTokenHash(tokenHash: string): Promise<void>; // idempotent
}
export const SESSION_REPOSITORY = 'ISessionRepository';

// session-token.port.ts   (raw bytes + hashing = infra crypto, kept behind a port)
export interface TokenGenerado { readonly token: string; readonly tokenHash: string }
export interface ISessionTokenService {
  generar(): TokenGenerado;            // randomBytes(32) → base64url token + SHA-256(token)
  hashToken(token: string): string;    // SHA-256(token) for lookup on validation
}
export const SESSION_TOKEN_SERVICE = 'ISessionTokenService';

// reloj.port.ts   (deterministic TTL in tests)
export interface IReloj { ahora(): Date }
export const RELOJ = 'IReloj';
```

Ports are narrow, per-role (ISP): a `LoginUseCase` mock stubs only what it uses. Repositories may throw on infra failure (caught at the controller boundary, mirroring existing controllers' `try/catch`); use cases return `Result` for domain-level outcomes.

### Use cases (`application/use-cases/`)

```ts
// login.use-case.ts
class LoginUseCase {
  constructor(creds: IUserCredentialRepository, hasher: IPasswordHasher,
              sessions: ISessionRepository, tokens: ISessionTokenService, reloj: IReloj) {}
  async execute(input: { emailRaw: string; password: string }):
    Promise<Result<{ token: string; userId: string; expiresAt: Date }, CredencialesInvalidasError>>;
}
```
Orchestration + failure branches (all failures → the **same** `CredencialesInvalidasError`):
1. `Email.crear(emailRaw)` fails → run a **dummy `verificar`** against a constant fake argon2id hash (timing equalization), return generic fail.
2. `creds.buscarPorEmail(email)` → `null` → dummy `verificar`, return generic fail. *(Same code path/time shape as a real verify — AUTH-02.)*
3. `hasher.verificar(password, cred.passwordHash)` → `false` → generic fail.
4. success → `{ token, tokenHash } = tokens.generar()`; `expiresAt = calcularExpiracion(reloj.ahora())`; `sessions.crear({ userId, tokenHash, expiresAt })`; return `Result.ok({ token, userId, expiresAt })`. The **raw `token`** is returned to the controller only to set the cookie; it is **never** persisted or echoed in a body.

```ts
// validar-sesion.use-case.ts
class ValidarSesionUseCase {
  constructor(sessions: ISessionRepository, tokens: ISessionTokenService, reloj: IReloj) {}
  async execute(input: { token: string }): Promise<Result<{ userId: string }, SesionInvalidaError>>;
}
```
1. `tokenHash = tokens.hashToken(input.token)`.
2. `sesion = sessions.buscarPorTokenHash(tokenHash)` → `null` → fail (unknown/tampered).
3. `estaExpirada(sesion.expiresAt, reloj.ahora())` → fail (expired = treated as absent, AUTH-06).
4. → `Result.ok({ userId: sesion.userId })`.

```ts
// logout.use-case.ts
class LogoutUseCase {
  constructor(sessions: ISessionRepository, tokens: ISessionTokenService) {}
  async execute(input: { token: string | undefined }): Promise<Result<void, never>>; // idempotent
}
```
- `token` present → `sessions.revocarPorTokenHash(tokens.hashToken(token))`. Always `Result.ok` (cookie clearing is the controller's job). Revokes **only** the current row (multi-session preserved, AUTH-07).

```ts
// obtener-identidad.use-case.ts   (GET /me)
class ObtenerIdentidadUseCase {
  constructor(creds: IUserCredentialRepository) {}
  async execute(input: { userId: string }): Promise<Result<IdentidadUsuario, SesionInvalidaError>>;
}
```
- `creds.buscarIdentidad(userId)` → `null` (shouldn't happen post-guard, defensive) → fail; else ok `{ userId, email }`. Keeps the "controllers delegate to a use case" convention.

---

## 5. Infrastructure layer (`apps/api/src/infrastructure/`, English)

### 5.1 Prisma schema delta + migration

`prisma/schema.prisma`:
```prisma
model User {
  id           String    @id @default(cuid())
  nombre       String
  email        String?   @unique      // additive, nullable
  passwordHash String?                // additive, nullable (one-way argon2id hash)
  creadoEn     DateTime  @default(now())
  accounts     Account[]
  sessions     Session[]
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  tokenHash String   @unique          // SHA-256(token); raw token NEVER stored
  expiresAt DateTime
  creadoEn  DateTime @default(now())
  @@index([userId])
}
```
- **Migration:** one additive migration `add_auth_login_session`. Columns are **nullable** precisely so the migration succeeds against the **already-seeded `USER_ID_FIJO` row** without a default backfill. `tokenHash @unique` gives O(1) lookup by hash.
- **Ordering:** `prisma migrate deploy` (additive, existing row valid) → **then** `prisma db seed` backfills `email`/`passwordHash` on `USER_ID_FIJO`. Login cannot succeed for that user until the seed runs (runbook note).
- **Seed (`prisma/seed.ts`):** extend the existing idempotent `user.upsert` for `USER_ID_FIJO` to set `email` and an argon2id `passwordHash`. **Credentials come from env** (`SEED_USER_EMAIL`, `SEED_USER_PASSWORD`), never hardcoded; the seed hashes the password via `Argon2PasswordHasher` before writing. If env is absent, skip the credential backfill (seed stays runnable for non-auth use) — documented.

### 5.2 Adapters
- **`http/auth/argon2-password-hasher.ts`** — `Argon2PasswordHasher implements IPasswordHasher` using `@node-rs/argon2` (`argon2id` variant). Constant-time `verify` built-in.
- **`http/auth/sha256-session-token.service.ts`** — `Sha256SessionTokenService implements ISessionTokenService`: `generar()` = `randomBytes(32).toString('base64url')` + `createHash('sha256').update(token).digest('hex')`; `hashToken(token)` = same SHA-256. (SHA-256 is sufficient — the token is a 256-bit random secret, not a low-entropy password, so no argon2 on lookup.)
- **`http/auth/system-reloj.ts`** — `SystemReloj implements IReloj` → `ahora() = new Date()`.
- **`persistence/prisma-session.repository.ts`** — `PrismaSessionRepository implements ISessionRepository` (create / find-by-tokenHash / delete-by-tokenHash).
- **`persistence/prisma-user-credential.repository.ts`** — `PrismaUserCredentialRepository implements IUserCredentialRepository` (`buscarPorEmail` on `email @unique`, returns `null` when unknown or when `passwordHash` is null; `buscarIdentidad` by id).

### 5.3 Guard chain, markers, decorator
- **`http/auth/session-public.decorator.ts`** — mirrors the existing `public.decorator.ts`:
  ```ts
  export const IS_SESSION_PUBLIC_KEY = 'isSessionPublic';
  export const PublicSession = () => SetMetadata(IS_SESSION_PUBLIC_KEY, true);
  ```
  Distinct from `@Public()`: `@PublicSession()` skips **only** `SessionGuard` (still requires `x-api-key`).
- **`http/auth/session.guard.ts`** — `SessionGuard implements CanActivate` (async). **Dual-transport token resolution (AUTH-05 revised):**
  1. Reflector: if `IS_PUBLIC_KEY` **or** `IS_SESSION_PUBLIC_KEY` → `return true` (health skips both; login/logout skip session).
  2. **Resolve the token via a single helper `extraerToken(request): string | undefined`** — the one place transport is decided (SRP/KISS):
     - **cookie first**: hand-rolled single-cookie parse of `md_session` from `request.headers.cookie` (no `cookie-parser`). If present and non-empty → use it, **ignore any Bearer header** (cookie precedence, AUTH-05).
     - **else Bearer**: read `request.headers.authorization`; if it matches `^Bearer\s+(.+)$` (case-insensitive scheme, trimmed) → use the captured token.
     - else → `undefined`.
  3. `token === undefined` → `throw new UnauthorizedException` (401) — missing on **both** transports.
  4. `ValidarSesionUseCase.execute({ token })` → fail → 401. **The same use-case path handles both transports** — hashing, lookup, expiry, and revocation are identical regardless of where the token came from (AUTH-05).
  5. success → `request.userId = userId`; `return true`.
  - Injected deps: `Reflector` (global) + `ValidarSesionUseCase`. Mirrors `ApiKeyGuard`'s style and its spec's mock pattern.
  - **Why a single `extraerToken` helper (not two branches inline):** the precedence rule ("cookie wins when both present") is a single piece of knowledge (DRY) and must be trivially unit-testable in isolation. Keeping it pure (`request → string | undefined`, no I/O) lets the guard test assert precedence without a live session. Bearer parsing is deliberately minimal — one scheme, one token, no auth-param grammar (YAGNI; we only ever issue our own opaque tokens).
- **`http/auth/current-user.decorator.ts`** — `@CurrentUser()` param decorator (see §2).
- **Health (`app.controller.ts`)** keeps `@Public()` → skipped by both guards (AC-08). No change needed there beyond `SessionGuard` also honoring `IS_PUBLIC_KEY`.

### 5.4 AuthController (`http/auth/auth.controller.ts`, route base `api/auth`)
- **`POST /login`** `@PublicSession()` `@HttpCode(200)`, body `{ email, password }`, `@Res({ passthrough: true }) res`:
  1. `ip = obtenerIpCliente(req)`; if `rateLimiter.estaBloqueado(ip, email)` → **429**.
  2. `LoginUseCase.execute({ emailRaw: email, password })`.
  3. fail → `rateLimiter.registrarFallo(ip, email)` → **401** generic (`CredencialesInvalidasError.message`).
  4. ok → `rateLimiter.resetear(ip, email)`; `res.setHeader('Set-Cookie', serializarCookieSesion(token, expiresAt))`; **return `{ token, userId, expiresAt }`** (AUTH-01 revised — see below).

  **AUTH-01 revised — the login body now carries the token for Bearer clients.** `LoginUseCase.execute` **already** returns `{ token, userId, expiresAt }`; the previous design threw the token away at the controller and returned `{ ok: true }`. This is a **controller-level change only** — the use case, ports, and `Session` persistence are untouched. The response body is now `{ token: string; userId: string; expiresAt: string }` (`expiresAt` ISO-8601). Both clients receive the cookie AND the body token:
  - **Web** sets the HttpOnly cookie automatically and its client code **MUST NOT** read, store, or forward the body token (AUTH-01 "web-must-not-persist"). Enforced by convention in `apps/web/src/api/auth.ts`: `postLogin` returns `ApiResult<void>` — it does not surface the token to callers, so no web code can accidentally persist it.
  - **Mobile** reads `body.token` and writes it to Expo SecureStore (MOB-01).
  - **XSS-surface tradeoff (explicit).** Returning the token in the body widens the attack surface: a successful XSS on the web page could read the login response and exfiltrate the token, whereas a pure HttpOnly cookie is unreadable by JS. We accept this **scoped** tradeoff because (a) mobile has no HttpOnly-cookie option and the alternative (a mobile-only login endpoint or a divergent response shape) duplicates the login path (DRY) for no security gain — an XSS that can read a fetch response can equally issue authenticated same-origin requests; (b) the web client never touches the body token, so the *marginal* web exposure is limited to the single login response, not ongoing token handling. This is **not** a general token-in-body pattern: only `/api/auth/login` returns a token, and only mobile persists it. Recorded as a deliberate decision.
- **`POST /logout`** `@PublicSession()` `@HttpCode(204)`: hand-roll-parse cookie → `LogoutUseCase.execute({ token })` → `res.setHeader('Set-Cookie', limpiarCookieSesion())` (Max-Age=0, same attributes). Idempotent even without a valid session (robust logout).
- **`GET /me`** (no marker → `SessionGuard` enforces a valid session): `@CurrentUser() userId` → `ObtenerIdentidadUseCase.execute({ userId })` → `{ userId, email }` (no hash, no token). Missing session → 401 via guard (AUTH-09).

**Cookie serialization** — `http/auth/cookie.ts` (hand-rolled; one known cookie, trivial):
- Name `md_session`. Attributes: `HttpOnly`; `SameSite=Strict`; `Path=/`; `Max-Age=604800`; **no `Domain=`** (host-only → proxy-transparent); `Secure` **env-conditional** — set when `process.env.NODE_ENV === 'production'` **or** `process.env.COOKIE_SECURE === 'true'`, omitted on `http://localhost` dev (browsers reject `Secure` over plain http). This mirrors `ApiKeyGuard`'s env-driven config. Clearing = same attributes with `Max-Age=0`.
- **No CSRF token** (locked): `SameSite=Strict` + the same-origin-only proxy neutralize classic cross-site CSRF; a token would be redundant. Recorded as an explicit decision.

### 5.5 `main.ts`
- Add `app.set('trust proxy', 1)` (accurate `req.ip` behind Render/Vercel; defense-in-depth for §1's IP handling). No other bootstrap change.

### 5.6 Composition root — `http/auth/auth.module.ts`
- Provides (via `useFactory`, plain classes, no decorators — ADR-005):
  `USER_CREDENTIAL_REPOSITORY`→`PrismaUserCredentialRepository`, `PASSWORD_HASHER`→`Argon2PasswordHasher`, `SESSION_REPOSITORY`→`PrismaSessionRepository`, `SESSION_TOKEN_SERVICE`→`Sha256SessionTokenService`, `RELOJ`→`SystemReloj`; the 4 use cases; `LoginRateLimiter` (with env config); `SessionGuard`; controller `AuthController`. `PrismaService` is `@Global`, injected directly.
- **Exports `SessionGuard`** so `AppModule` can register it as the 2nd global guard.
- **Guard ordering (AC-06 — ApiKeyGuard MUST run first):** register **both** `APP_GUARD` entries in **`AppModule.providers`**, in order:
  ```ts
  imports: [ …, AuthModule ],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyGuard },      // #1 (existing, unchanged)
    { provide: APP_GUARD, useExisting: SessionGuard },  // #2 (from AuthModule)
  ]
  ```
  Nest applies global guards in provider-registration order → `ApiKeyGuard` then `SessionGuard` (AND semantics). `useExisting` reuses the single `SessionGuard` instance from `AuthModule`.

---

## 6. Client layer (web + mobile)

Two clients, one shared auth contract (`POST /api/auth/login` → cookie + body token; `GET /api/auth/me`; `POST /api/auth/logout`). Web consumes the session via the HttpOnly cookie; mobile via `Authorization: Bearer`. Neither client shares code with the other or with `apps/api/domain` (ADR-008 — DTOs hand-written per client).

### 6.1 Web (`apps/web/src/`)

- **`routes/login.tsx`** — `createFileRoute('/login')`, top-level (unprotected). Email+password form → `postLogin()`; on success `navigate({ to: '/' })` (honor an optional `redirect` search param); on failure show a generic message. Container/presentational: keep the form logic testable (mirrors the repo's split).
- **Pathless protected layout** — `routes/_authenticated.tsx` with a `beforeLoad` that calls `fetchMe()`; on the typed `unauthorized` result → `throw redirect({ to: '/login' })` (AUTH-10). Move the two protected routes under it:
  - `routes/index.tsx` → `routes/_authenticated/index.tsx`
  - `routes/buckets.$bucket.tsx` → `routes/_authenticated/buckets.$bucket.tsx`
  `routeTree.gen.ts` regenerates (`tsr generate`, already in `build`/`typecheck`). File moves are mechanical; component bodies unchanged.
- **`api/auth.ts`** — new, same never-throw `ApiResult<T>` discipline as `api/client.ts` (same-origin `fetch`, cookie flows via default `credentials: 'same-origin'`):
  - `postLogin(input: { email; password }): Promise<ApiResult<void>>`
  - `fetchMe(): Promise<ApiResult<MeDto>>` (401 → `{ tag: 'unauthorized' }`)
  - `postLogout(): Promise<ApiResult<void>>`
- **`api/types.ts`** — add `MeDto = { userId: string; email: string }` (hand-written DTO, ADR-008 — no `packages/shared`).
- **NO proxy changes** — dev Vite proxy and the Vercel function are already cookie-transparent (confirmed in exploration: `Set-Cookie`/`Cookie` pass through; host-only cookie needs no `Domain=`). The landing **"Ingresar" button is UNCHANGED**.

### 6.2 Mobile (`apps/mobile/src/` + `app/`, Expo) — MOB-01..04

Mobile mirrors the **existing** `apps/mobile` shape (thin `src/api` client is the only place touching `fetch`/SecureStore; pure-TS `src/domain`; Expo Router screens in `app/`). The **money/BigInt-string handling and the whole view-model (`resumen-view-model.ts`, `formatear-monto.ts`, etc.) are UNTOUCHED** — this change only adds an auth layer around the existing read.

**6.2.1 Token store — `src/api/session-store.ts`** (the single owner of persisted token I/O; MOB-01):
```ts
// wraps expo-secure-store; never throws across this boundary (mirrors client.ts ApiResult discipline)
export async function guardarToken(token: string): Promise<void>;   // SecureStore.setItemAsync(KEY, token)
export async function leerToken(): Promise<string | null>;          // SecureStore.getItemAsync(KEY) — null when absent
export async function borrarToken(): Promise<void>;                 // SecureStore.deleteItemAsync(KEY) — idempotent
```
- `KEY = 'md_session_token'`. This is the mobile analogue of the web HttpOnly cookie: the token lives in the OS keychain/keystore, **never** in AsyncStorage or plain module state that survives restart (MOB-01 forbids unencrypted persistence).
- SRP: this file is the only place that imports `expo-secure-store`. `client.ts` and screens depend on these three functions, not on SecureStore directly — so a test swaps the store via a module mock, and a future storage change (e.g. biometric-gated read) touches one file (DRY).

**6.2.2 HTTP client wiring — `src/api/client.ts`** (extends the existing `fetchResumen`; MOB-02/MOB-04):
- **`fetchResumen`** reads the token via `leerToken()` and, when present, sends **BOTH** headers: the existing `x-api-key` **and** `Authorization: Bearer <token>`. `x-api-key` stays exactly as-is (app-level gate, unchanged). The `ApiResult<T>`/`ApiError` tagged-union discipline is preserved verbatim.
- On **401** from any authenticated call (`{ tag: 'unauthorized' }`): the client is NOT responsible for navigation, but the flow must clear the stored token so a rejected (expired/revoked) token is not reused. Decision: **the caller (root gate / screen) clears the token on `unauthorized`** — the client stays a pure request→result mapper (SRP; it already returns `{ tag: 'unauthorized' }` for 401). `borrarToken()` is invoked by the gate, not buried in `fetchResumen`, so the "clear + route to login" reaction lives in one place (MOB-03/MOB-04).
- **New auth calls** (same never-throw `ApiResult` shape, both send `x-api-key`; login is session-free so sends no Bearer):
  - `postLogin(input: { email; password }): Promise<ApiResult<{ token: string; userId: string; expiresAt: string }>>` — POSTs credentials; on `ok` the **caller** persists `value.token` via `guardarToken`.
  - `fetchMe(): Promise<ApiResult<MeDto>>` — sends `x-api-key` + `Authorization: Bearer <token>`; 401 → `{ tag: 'unauthorized' }`.
  - `postLogout(): Promise<ApiResult<void>>` — sends both headers so the backend revokes the row (AUTH-07); caller then `borrarToken()` (MOB-04).
  - `MeDto = { userId: string; email: string }` — hand-written in `src/domain/` alongside `resumen.types.ts` (ADR-008, no `packages/shared`).

**6.2.3 Login screen — `app/login.tsx`** (Expo Router route; MOB-01):
- Email + password form (React Native `TextInput`s, `secureTextEntry` on password) + submit. Container/presentational split consistent with the repo: the screen owns the `{idle|submitting|error}` state via plain `useState` (no query lib — matches `app/index.tsx`); a presentational form component renders inputs and error text. Money-free, so no view-model.
- On submit → `postLogin(...)`. `ok` → `guardarToken(value.token)` → `router.replace('/')` (navigate to resumen, MOB-01). `!ok` → show a **generic** error message (`'Credenciales inválidas.'` — mirrors the backend generic error; no email-existence leak) and write **nothing** to SecureStore (MOB-01 "stores nothing on failure").

**6.2.4 Auth gate / unauthenticated routing — `app/_layout.tsx` (MOB-03):**
- **Mechanism (decided): a root gate in `app/_layout.tsx`** — the mobile analogue of the web `_authenticated beforeLoad` redirect. On mount it calls `leerToken()`:
  - **no token** → render/redirect to `/login` **without** calling `/api/resumen` (MOB-03 "no stored token on app start shows login, does not call resumen").
  - **token present** → allow the protected stack (`app/index.tsx`) to render. `index.tsx`'s existing fetch runs; if it (or any authenticated call) returns `{ tag: 'unauthorized' }` (stored token expired/revoked), the gate reacts by `borrarToken()` + `router.replace('/login')` (MOB-03 "stored token rejected → clear + login"). The 401→clear+redirect reaction lives in the gate, keeping `index.tsx`'s 4-state switch essentially unchanged (it already surfaces `unauthorized`; the gate observes it).
- **Implementation shape:** a small `useSessionGate()` hook (pure-ish: takes `leerToken`/`borrarToken` injected or module-mocked) returning `{ estado: 'checking' | 'authenticated' | 'unauthenticated' }`, plus an effect that redirects on `'unauthenticated'`. `_layout.tsx` wraps the `Stack` and renders a `Loading` while `'checking'`. Keeping the decision logic in a testable hook (not inline JSX) mirrors the web design's `requireSession(fetchMe)` helper (KISS/testability).
- **Logout entry point (MOB-04):** a logout action (from the resumen screen, minimal affordance) → `postLogout()` (revoke server row) → `borrarToken()` → `router.replace('/login')`. Even if `postLogout` fails on the network, the local token is still cleared (robust logout, mirrors backend idempotent logout).
- **YAGNI:** no token-refresh, no multi-account switcher, no deep-link-after-login restore — the web `redirect` search-param is a nicety the mobile MVP does not need (single screen). Absolute 7-day TTL means the gate just re-shows login on expiry.

---

## 7. New dependencies

| Dep | Layer | Build script? | pnpm posture |
|---|---|---|---|
| **`@node-rs/argon2`** | `apps/api` runtime | **None** — prebuilt per-platform napi binaries via `optionalDependencies`, no `postinstall` | No `allowBuilds` / `pnpm approve-builds` entry needed. Subject to `minimum-release-age=10080` (mature package, satisfied). Ships its own TS types (no `@types`). **Unchanged by this revision.** |
| **`expo-secure-store`** | `apps/mobile` runtime | **No npm `postinstall`** — it is an Expo-managed native module; its native code is linked at **build time by Expo autolinking / EAS Build** (config-plugin model), not by an npm install script | Install with **`expo install expo-secure-store`** (inside `apps/mobile`) so the version is pinned to the one Expo SDK 57 vendors — do **not** `pnpm add` a floating version. Must be declared as a **direct dep of `apps/mobile`** (pnpm isolated/non-hoisted resolution — same rule that bit `multer`/`dotenv` in `apps/api`). Included in Expo Go and dev builds, so no bespoke native step for local testing; on device it uses iOS Keychain / Android Keystore. `minimum-release-age` applies at the workspace level; the SDK-pinned version is mature. |

`@node-rs/argon2` remains the **only** new backend runtime dependency; `expo-secure-store` is the **only** new mobile dependency. Deliberately avoided: `@nestjs/throttler` (hand-rolled limiter, §1), `cookie-parser` + `cookie` (hand-rolled parse/serialize, locked), any mobile secure-storage alternative (SecureStore is the Expo-canonical, keychain-backed choice — no `react-native-keychain` third-party). **Verify** during apply: (a) the `@node-rs/argon2` linux prebuilt binary resolves on the Render build image (glibc); (b) `expo-secure-store` autolinks cleanly under the pnpm workspace and the EAS Build picks it up (config-plugin present). Both noted as risks.

---

## 8. Test design (Strict TDD, Vitest — tests first)

### Unit (`apps/api`, colocated `*.spec.ts`, no DB)
- `email.spec.ts` — normalizes + lowercases + trims; valid vs `EmailInvalidoError` cases.
- `duracion-sesion.spec.ts` — `calcularExpiracion = ahora + 7d`; `estaExpirada` true/false at the exact boundary.
- `login.use-case.spec.ts` — success persists a session and returns token+userId+expiresAt; **unknown email → `CredencialesInvalidasError` AND dummy `verificar` invoked** (no-enumeration); wrong password → identical error; invalid email format → identical error. Fake `IReloj`, mocked ports.
- `validar-sesion.use-case.spec.ts` — valid → userId; unknown tokenHash → `SesionInvalidaError`; **expired → `SesionInvalidaError`** (fake clock past `expiresAt`).
- `logout.use-case.spec.ts` — revokes by tokenHash; idempotent when token `undefined`.
- `obtener-identidad.use-case.spec.ts` — returns `{ userId, email }`; null → fail.
- `session.guard.spec.ts` — mirrors `api-key.guard.spec.ts`: skips on `@Public()`/`@PublicSession()`; sets `request.userId` on valid. **Dual-transport cases (AUTH-05):** authorizes with a valid **cookie** only; authorizes with a valid **`Authorization: Bearer`** only; **cookie precedence** — request carries a valid cookie AND a different/garbage Bearer header → guard validates the **cookie's** token and the Bearer is never passed to `ValidarSesionUseCase` (assert the mock received the cookie token); **401 when both transports absent** (no cookie, no Authorization header); 401 on invalid token from either transport. Mock `ValidarSesionUseCase` + `Reflector` + request.
- `extraer-token.spec.ts` (or colocated with the guard) — the pure `extraerToken(request)` helper in isolation: cookie-only → cookie token; Bearer-only → Bearer token; **both present → cookie token** (precedence); malformed `Authorization` (no `Bearer ` scheme) → `undefined`; neither → `undefined`. Keeps the precedence knowledge testable without a session.
- `login-rate-limiter.spec.ts` — blocks after `maxPorEmail` failures; after `maxPorIp`; `resetear` clears; window expiry re-allows; 429 distinct from 401 path.
- `sha256-session-token.service.spec.ts` — `generar` returns token + matching hash; `hashToken` deterministic.
- `argon2-password-hasher.spec.ts` — hash→verify roundtrip true; wrong password → false (real `@node-rs/argon2`, low-cost params in test).

### Integration / e2e (`apps/api`, real DB, `ALLOW_DESTRUCTIVE_DB=1` gate)
- `auth-login.e2e-spec.ts` — login with seeded creds → 200 + `Set-Cookie` (`HttpOnly`, `SameSite=Strict`, **no `Domain=`**) **AND** a body `{ token, userId, expiresAt }` (AUTH-01 revised — token now IS in the body for Bearer clients); wrong password ≡ unknown email (same status + body shape); a protected endpoint returns **401 without** the session cookie and 200 **with** it (AC-06); **Bearer transport:** the same protected endpoint returns 200 when called with `Authorization: Bearer <body.token>` and no cookie, and **cookie precedence** — a request with a valid cookie + a garbage Bearer still succeeds (AUTH-05); `GET /me` returns identity; logout clears the cookie and revokes the row (AUTH-07 multi-session: session Y still works).
- **`auth-isolation.int-spec.ts` (the ISO-02 payoff, Slice 2)** — seed users **A** and **B**, each with their own account + transactions for the same period; log in as A; assert **all 4 endpoints** (`/api/resumen`, `/api/movimientos`, `/api/buckets/:bucket`, `/api/ingestas`) return **only A's data** and never B's (ISO-01/ISO-02, RNF-SEC-006). **Cover both transports for `/api/resumen`:** A's data via A's **cookie** and identically via A's **`Authorization: Bearer`** (ISO-02 mobile scenario). **No-keyless-fallback:** `/api/resumen` with a valid `x-api-key` but **no session** (neither cookie nor Bearer) → **401**, no default-`userId` data (ISO-01 mobile scenario). **Requires the destructive-DB gate.**
- `auth-rate-limit.e2e-spec.ts` — N failed logins for one email → **429** (distinct from 401); a correct login is not throttled.

### Web (`apps/web`, vitest + Testing Library)
- `LoginForm.test.tsx` — renders; submit calls `postLogin`; shows error on failure; navigates on success (mock `api/auth` + router).
- `beforeLoad` redirect — extract the guard as a small `requireSession(fetchMe)` helper and unit-test that it `redirect`s on `unauthorized` (a `createFileRoute` component needs a live router context, so test the helper, per the existing note in `index.tsx`).

### Mobile (`apps/mobile`, jest-expo + RNTL — ADR-017, tests first)

Mirror the existing patterns: module-boundary mocks (`jest.mock('../src/api/client', …)` per `app/index.spec.tsx`) and the `jest.resetModules()` + re-require env pattern (per `src/api/client.spec.ts`). Mock `expo-secure-store` at the module boundary.

- `session-store.spec.ts` — **roundtrip:** `guardarToken` calls `SecureStore.setItemAsync(KEY, token)`; `leerToken` returns the stored token, `null` when absent; `borrarToken` calls `deleteItemAsync` and is idempotent. (Mock `expo-secure-store`.) (MOB-01)
- `client.spec.ts` (extend existing) — **`fetchResumen` sends BOTH headers** `x-api-key` and `Authorization: Bearer <token>` when `leerToken()` returns a token (mock the store); sends only `x-api-key` when no token; **401 stays `{ tag: 'unauthorized' }`** (the caller reacts). New: `postLogin` POSTs credentials and maps `ok`→`{ token, userId, expiresAt }`, failure→`{ tag: 'unauthorized' }`; `postLogout`/`fetchMe` send both headers. (MOB-02/MOB-04)
- `login.spec.tsx` — **renders** email+password inputs + submit; **submit calls `postLogin`**; on success **stores the token** (`guardarToken` invoked with `value.token`) and navigates to `/` (mock `expo-router`); on failure shows the generic error and **does not** call `guardarToken` (MOB-01).
- `session-gate.spec.tsx` (or `useSessionGate.spec.ts`) — **no stored token** → gate reports `unauthenticated` and `/api/resumen` is **not** called (assert the client mock was not invoked) + redirect to `/login` (MOB-03 app-start); **stored token then a `{ tag: 'unauthorized' }` from the resumen fetch** → gate calls `borrarToken` and redirects to `/login` (MOB-03 rejected-token); **valid token + ok resumen** → stays on the resumen screen.
- `logout` behavior (in the gate/screen test) — logout action calls `postLogout` then `borrarToken` then redirects; local token cleared even if `postLogout` returns a network error (MOB-04).

---

## 9. Delivery / slicing

Hot path `**/auth/**` + scope now spanning **backend + web + mobile** → estimated **well over 400 changed lines** → **chained/stacked PRs recommended** (`delivery_strategy: ask-on-risk`; chain strategy decided at `tasks`). **Review Workload Forecast (re-run for the revised scope) → Chained PRs recommended: Yes · 400-line budget risk: High · Decision needed before apply: Yes.** The revision adds a whole mobile client (store + client extension + login screen + gate + their jest-expo tests), which on its own is a coherent, separately-reviewable slice — reinforcing the chained-PR recommendation.

Proposed **4 slices** (each an independently shippable, independently reviewable security-coherent unit):

- **Slice 1 — auth backend + gate (dual transport)**: domain VOs/errors, ports, 4 use cases, Prisma delta + migration + seed backfill, `@node-rs/argon2` adapter, token/reloj adapters, Prisma repos, `AuthController` (login/logout/me — **login returns `{ token, userId, expiresAt }`**), cookie serialization, `SessionGuard` with the **`extraerToken` cookie-or-Bearer + precedence** helper, `@PublicSession()` marker + `@CurrentUser()` decorator + `AuthModule` + `AppModule` guard wiring, `LoginRateLimiter`, `main.ts` trust proxy. **Data endpoints still query with `USER_ID_FIJO_TOKEN`** — the gate proves identity (via either transport) but controllers are untouched. Delivers a working login gate for both transports.
- **Slice 2 — session → `userId` rewire + isolation**: swap `USER_ID_FIJO_TOKEN` for `@CurrentUser() userId` across the 4 controllers, drop the token + its module providers, delete `USER_ID_FIJO_TOKEN` from `constants.ts`, add `auth-isolation.int-spec.ts` (both transports for `/api/resumen` + no-keyless-fallback). Delivers real RNF-SEC-006 isolation (ISO-01/ISO-02) — the endpoints mobile depends on now require a session for **every** caller.
- **Slice 3 — web login UI**: `/login` route + `_authenticated` layout `beforeLoad` + `api/auth.ts` (`postLogin`/`fetchMe`/`postLogout`, `postLogin` returns `ApiResult<void>` — web never surfaces the body token) + `MeDto` + the web component/redirect tests. No proxy changes. Depends on Slice 1 (login endpoint) + Slice 2 (real isolation is what makes the gate meaningful, though the UI works after Slice 1).
- **Slice 4 — mobile login UI + Bearer**: `expo-secure-store` dep, `src/api/session-store.ts`, `client.ts` Bearer wiring + `postLogin`/`fetchMe`/`postLogout` + `MeDto`, `app/login.tsx`, `app/_layout.tsx` gate (`useSessionGate`) + logout, and the jest-expo tests. Depends on Slice 1 (login body token) + Slice 2 (the `/api/resumen` endpoint the mobile client calls now enforces the session — without Slice 2, mobile Bearer would be validated but `userId` would still be fixed). Ordering it **last** means the shipped mobile app is not broken mid-chain: mobile's current `x-api-key`-only call keeps working until Slice 2 lands the mandatory guard, so Slice 4 must ship **together with or immediately after** Slice 2 to avoid a window where mobile is 401'd with no login screen. `tasks` must sequence Slice 2 and Slice 4 to avoid a mobile outage (chain ordering note).

`tasks` confirms the split, the chain strategy, and the Slice 2/Slice 4 co-ordering (or records `size:exception` if any pair is kept single).

---

## 10. Requirement → design traceability

| Req | Satisfied by |
|---|---|
| AUTH-01 | `LoginUseCase` success → `Session` row + `serializarCookieSesion` (HttpOnly/SameSite=Strict/host-only, env-Secure) **AND** body `{ token, userId, expiresAt }` for Bearer clients; web `postLogin` returns `ApiResult<void>` so web never persists the body token (§5.4) |
| AUTH-02 | Single `CredencialesInvalidasError` + dummy-verify on unknown email/invalid format (timing equalization) |
| AUTH-03 | `Argon2PasswordHasher` (argon2id); plaintext never stored/logged/returned |
| AUTH-04 | `Sha256SessionTokenService` — only `SHA-256(token)` in `Session.tokenHash` |
| AUTH-05 | `SessionGuard.extraerToken` — cookie `md_session` first, else `Authorization: Bearer` (cookie precedence); same `ValidarSesionUseCase` path for both transports; missing on both / unknown / tampered → 401; sets `userId` (§5.3) |
| AUTH-06 | `duracion-sesion` absolute 7-day TTL + `estaExpirada` server-side check |
| AUTH-07 | `LogoutUseCase.revocarPorTokenHash` (current row only) + cookie clear; multi-session preserved |
| AUTH-08 | `LoginRateLimiter` per-IP + per-email, failures-only, 429 distinct from 401 |
| AUTH-09 | `GET /me` → `ObtenerIdentidadUseCase` (`{userId,email}`, no hash/token); 401 without session |
| AUTH-10 | `_authenticated` layout `beforeLoad` → `redirect('/login')`; landing button unchanged |
| AC-06 | Two `APP_GUARD` in order (ApiKeyGuard then SessionGuard), AND semantics |
| AC-07 | `@PublicSession()` marker on `/login` (skips SessionGuard, keeps ApiKeyGuard) |
| AC-08 | Health `@Public()` honored by both guards |
| ISO-01 | 4 controllers use `@CurrentUser() userId`; `USER_ID_FIJO_TOKEN` deleted; **no keyless fallback on any endpoint incl. `/api/resumen` for mobile** (§2) |
| ISO-02 | `auth-isolation.int-spec.ts` across all 4 endpoints, **both transports for `/api/resumen`** (cookie + Bearer) + no-session→401 (destructive-DB gate) |
| MOB-01 | `app/login.tsx` submits `postLogin` → `guardarToken(value.token)` in `session-store.ts` (Expo SecureStore, never AsyncStorage); failure stores nothing (§6.2.1/6.2.3) |
| MOB-02 | `client.ts fetchResumen` sends `x-api-key` **and** `Authorization: Bearer <leerToken()>`; data scoped to session `userId` (§6.2.2) |
| MOB-03 | `app/_layout.tsx` `useSessionGate`: no token → login screen, no `/api/resumen` call; stored token 401 → `borrarToken` + redirect to `/login` (§6.2.4) |
| MOB-04 | logout action → `postLogout` (revokes row) → `borrarToken`; token cleared even on network failure (§6.2.2/6.2.4) |
```
