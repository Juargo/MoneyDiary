# Proposal — auth-login-session: real per-user login + session as source of `userId`

Add **real per-user authentication (login only)** to MoneyDiary, layered on top of the existing app-level `ApiKeyGuard`. Sessions are **stateful and server-side in Postgres**; the browser carries an **opaque token in an HttpOnly/Secure/SameSite=Strict cookie** set backend-side. The web app redirects to `/login` when there is no valid session. Critically, the session becomes the **source of `userId`** for the app's data endpoints, **replacing the hardcoded `USER_ID_FIJO` constant** — which is what finally makes RNF-SEC-006 isolation real and testable (ADR-015).

This is the **login** slice. Register/signup is the **next** change.

> **REVISION (scope expansion, gate review):** the shipped mobile app (`apps/mobile`) already calls `GET /api/resumen` with only `x-api-key` (no session) — a global mandatory `SessionGuard` would 401 it. **Mobile session auth is now IN SCOPE**: the same stateful `Session` + SHA-256 token is reused, transported as `Authorization: Bearer <token>` (stored in Expo SecureStore) instead of the web's HttpOnly cookie. `SessionGuard` accepts either transport. Register/signup remains OUT of scope for **both** clients.

## Quick path (what this change delivers)

1. **Credentials on `User`** (email + argon2id hash) + a new **`Session`** model, via one additive Prisma migration.
2. A **`POST /api/auth/login`** endpoint that verifies credentials, creates a session row (storing only the token's SHA-256 hash), and sets the opaque cookie backend-side. Plus `POST /api/auth/logout` and `GET /api/auth/me`.
3. A second global **`SessionGuard`** (`APP_GUARD` after `ApiKeyGuard`, AND semantics) that validates the cookie and **exposes the session's `userId`** to controllers.
4. **Rewire the 4 data controllers** (`resumen`, `movimientos`, `detalle-bucket`, `ingesta`) to derive `userId` from the session instead of the injected `USER_ID_FIJO_TOKEN` → real per-user isolation + the isolation integration test.
5. **Basic brute-force rate-limiting** on `/api/auth/login` (per IP + per email).
6. **Web `/login` route** + a `beforeLoad` redirect guard on a pathless protected layout wrapping the data routes.
7. **Mobile login screen** (`apps/mobile`) storing the login response's token in Expo SecureStore, sent as `Authorization: Bearer <token>` on subsequent calls (including `/api/resumen`); falls back to the login screen when no valid token is stored.

## Why now / intent

- **Identity today is a lie of convenience.** "Who is the user" is a hardcoded constant (`USER_ID_FIJO`) injected into every data controller. There is no credential, no gate at the user level — only the app-wide `x-api-key`. Any request through the proxy is "the" user.
- **RNF-SEC-006 isolation cannot be verified until identity is real.** ADR-015 calls for an integration test proving user A cannot read user B's data. That test is **meaningless** while all 4 controllers query with the same fixed id. Making the session the source of `userId` is the architecturally correct move that finally lets that test exist.
- **The next change (register) needs this foundation.** Login-first establishes the `Session` model, the guard chain, the cookie contract, the password-hash column, and the seeded first user — everything register will build on. Deferring register keeps this slice honest and bounded.
- **The proxy is already cookie-transparent.** Exploration confirmed both the dev Vite proxy and the prod Vercel function pass `Cookie`/`Set-Cookie` through untouched — provided the cookie stays **host-only** (no `Domain=`). No proxy work needed.

## In scope

### Backend — `apps/api` (Clean Architecture, Spanish domain/app, English infra)

**Domain (`src/domain/`)**
- `value-objects/email.ts` — `Email` VO with format validation (`Result`-based, never throws).
- Password/credential VOs as needed (e.g. raw-password wrapper) — kept minimal; policy strength is a design detail.
- `value-objects/` for the session token / expiry logic as pure functions where it belongs in the domain.
- New domain errors (e.g. `credenciales-invalidas.error.ts`, `sesion-invalida.error.ts`) — **generic** invalid-credentials error for both unknown-email and wrong-password (no user enumeration).

**Application (`src/application/`)**
- `ports/` — `IPasswordHasher` (hash/verify), `ISessionRepository` (create/find-by-token-hash/delete), `IUserCredentialsRepository` (find-by-email), `IClock`/token-generator port if useful for testability.
- `use-cases/` — `LoginUseCase` (find user by email → verify hash → create session → return opaque token; same generic failure for unknown-email and wrong-password), `ValidarSesionUseCase` (find by token hash → check `expiresAt` server-side → return `userId`), `LogoutUseCase` (revoke current session row only).

**Infrastructure (`src/infrastructure/`)**
- **Prisma delta + migration (additive-only):** `User.email String? @unique`, `User.passwordHash String?` (**nullable** for forward-compat with deferred register; seed backfills it), new `Session { id, userId, expiresAt, creadoEn }` + FK to `User`.
- **argon2 adapter:** `@node-rs/argon2` (argon2id) implementation of `IPasswordHasher` — chosen because it ships prebuilt binaries with **no postinstall/build script** (zero friction with the repo's pnpm `approve-builds` / `minimum-release-age` posture).
- **Session repository:** Prisma impl of `ISessionRepository`; stores only `SHA-256(token)`, never the raw token; looks up by hash.
- **`AuthController`** (`POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`): sets/clears the cookie backend-side (HttpOnly; Secure **env-conditional** — off on `http://localhost`, on in prod; SameSite=Strict; host-only, **no `Domain=`**). **Hand-rolled cookie parsing** for the single opaque token (no `cookie-parser` dep — YAGNI).
- **`SessionGuard`** — second global `APP_GUARD` after `ApiKeyGuard` (AND: api-key layer must pass first, then session). Reads the cookie, validates via `ValidarSesionUseCase`, and **exposes `userId`** to controllers. `/api/auth/login` gets its **own new marker** (not a reuse of `@Public()`) to skip the session check while still requiring the api-key layer; health check skips **both** guards.
- **Rate-limiting (in scope):** basic brute-force protection on `/api/auth/login`, per IP + per email. Mechanism (likely `@nestjs/throttler` in-memory) is a **design-phase** decision — in scope, not finalized here.
- **Seed:** extend `apps/api/prisma/seed.ts` (already upserts `USER_ID_FIJO`) with `email` + an argon2id `passwordHash`. Credentials sourced from **env**, never hardcoded.
- **`USER_ID_FIJO_TOKEN` → session-derived `userId` migration** across the **4 controllers** (`resumen`, `movimientos`, `detalle-bucket`, `ingesta`): each stops injecting the fixed-id token and instead receives the request-scoped `userId` the `SessionGuard` exposes. This is the central architectural payoff and the biggest blast radius of the change.

### Frontend — `apps/web`

- New **`/login`** route: credential form → `POST /api/auth/login` via the existing typed, never-throwing `fetch` conventions in `src/api/client.ts` (401 already maps to a typed unauthorized error).
- **`beforeLoad` redirect guard** on a **pathless protected layout route** (e.g. `_authenticated`) wrapping the data routes (`index`, `buckets.$bucket`); checks the session via `GET /api/auth/me` and `redirect({ to: '/login' })` on failure.
- Auth API hook/helper for `login` / `me` / `logout`. Cookie flows automatically (`credentials: 'same-origin'` default).
- Landing "Ingresar" button is **UNCHANGED**. Proxy (dev + Vercel) needs **NO** changes (already cookie-transparent).

### Mobile — `apps/mobile` (Expo, revision addition)

- New **login screen** (Expo Router) → `POST /api/auth/login` reusing the same `x-api-key` + credentials flow; on success, reads the token from the response body and stores it via **Expo SecureStore**.
- `src/api/client.ts` gains `Authorization: Bearer <token>` on `fetchResumen` (and future data calls) alongside the existing `x-api-key`.
- No stored token, or a 401 from a stored (expired/revoked) token, clears SecureStore and routes back to the login screen — the mobile analogue of AUTH-10.
- `EXPO_PUBLIC_API_KEY` stays as-is (app-level gate, unchanged); it is not a substitute for the per-user session.

### Tests (Vitest — ADR-016; Strict TDD active for `apps/api`, tests first)

- **Unit:** `Email` VO; `LoginUseCase` (success / wrong-password / unknown-email → same generic error); `ValidarSesionUseCase` (valid / expired / unknown token); `SessionGuard` (mirrors `api-key.guard.spec.ts` mock pattern).
- **Integration:** login sets cookie end-to-end; protected endpoint 401s without cookie; and the now-**meaningful `userId` isolation test** (user A cannot read user B's data) enabled by the controller rewire (ADR-015, RNF-SEC-006).
- **Frontend:** login form component test (vitest + Testing Library); `beforeLoad` redirect behavior.
- **Mobile:** jest-expo + RNTL (ADR-017) — login screen, SecureStore read/write, `Authorization: Bearer` header on `fetchResumen`, redirect-to-login on missing/401 token.

## Non-goals (explicit)

- **Register / signup** — the next change, for **both web and mobile**.
- **Password reset**, **email verification**, **OAuth / social login**.
- **Sliding-session refresh** — TTL is 7-day **absolute**.
- **Account lockout** beyond the basic rate-limiting in scope.
- **Remember-me**, **MFA**.

## Approach (high level — full design is the next phase)

- **Login flow:** `POST /api/auth/login` (passes api-key layer, skips session via its own marker) → `LoginUseCase` finds the user by `Email`, `@node-rs/argon2` verifies the hash (constant-time; identical generic failure for unknown-email and wrong-password to prevent enumeration) → on success, generate `randomBytes(32)` opaque token, persist a `Session` row storing only its **SHA-256 hash** with `expiresAt = now + 7d` (absolute) → set the HttpOnly/Secure/SameSite=Strict host-only cookie backend-side.
- **Session lifecycle:** stateful; validated per request by `SessionGuard` (look up by token hash, check `expiresAt` server-side — instant revocation is why it's stateful, not a JWT). **Multi-session allowed** — a user may hold several active sessions; **logout revokes only the current session's row**.
- **Dual transport (revision):** the SAME `Session` row + SHA-256 token + `ValidarSesionUseCase` serve BOTH clients — only the transport differs. Web: HttpOnly/Secure/SameSite=Strict cookie, token never read by web JS. Mobile: `Authorization: Bearer <token>`, token stored in Expo SecureStore (RN cannot rely on HttpOnly browser cookies). Login always sets the cookie AND returns the token in the response body; web ignores the body token, mobile persists it. `SessionGuard` accepts either transport (cookie checked first, then Bearer).
- **Guard chaining:** `ApiKeyGuard` (global) then `SessionGuard` (global, added second) — AND semantics. `/api/auth/login` skips the session check via a dedicated new marker; health skips both.
- **`userId` sourcing:** `SessionGuard` puts the validated `userId` on the request; the 4 controllers consume it (request augmentation / param decorator — the exact mechanism is a design question) **in place of** the injected `USER_ID_FIJO_TOKEN`.
- **CSRF:** **no anti-CSRF token.** SameSite=Strict + the same-origin-only proxy architecture neutralize classic cross-site CSRF; adding a token would be redundant. Recorded as an explicit, justified decision, not an omission.
- **Not ADR-013's `CryptoService`:** `passwordHash` is a **one-way** hash and must **not** be wired through the reversible `CryptoService`/`NoOpCryptoService` (that port is for encrypting sensitive columns like `descripcion`). Do not conflate them.

## First slice / delivery boundary

This scope — auth backend + 4-controller rewire + rate-limiting + web — **very likely exceeds the 400-line budget** and touches **security hot paths** (`**/auth/**`). Delivery strategy is **`ask-on-risk`**, so **chained/stacked PRs are probable**; the actual split is decided at `tasks` time. Suggested natural boundary:

1. **Slice 1 — auth backend + gate:** Prisma delta + migration, argon2 adapter, session repo, `AuthController` (login/logout/me), `SessionGuard`, rate-limiting, seed, `/login` route + `beforeLoad` redirect. Delivers a working gate that still queries with the fixed id.
2. **Slice 2 — session→`userId` rewire:** swap `USER_ID_FIJO_TOKEN` for the session-derived `userId` across the 4 controllers + the isolation integration test. Delivers real RNF-SEC-006 isolation.

`tasks` should confirm the split (or flag `size:exception` if kept single).

## Risks & open design questions (hand-off to `sdd-design`)

| Item | Question for design |
|------|---------------------|
| **Rate-limit storage & thresholds** | In-memory `@nestjs/throttler` vs other; per-IP and per-email limits/windows; behavior under proxy (real client IP via `x-forwarded-for`). In scope; tool + thresholds not finalized. |
| **Guard marker wiring** | Exact new marker for `/api/auth/login` (a `@PublicSession()`-style decorator) that skips `SessionGuard` but not `ApiKeyGuard`; how health skips both cleanly. |
| **How `SessionGuard` exposes `userId`** | Request augmentation vs a param decorator (`@CurrentUser()`), to cleanly replace the injected `USER_ID_FIJO_TOKEN` in 4 controllers without leaking infra into application. |
| **Migration ordering for nullable columns** | Additive `email?`/`passwordHash?` on the already-seeded row, then seed backfill — confirm ordering so the existing `USER_ID_FIJO` row is valid post-migrate. |
| **Dev-vs-prod `Secure` flag plumbing** | Env-conditional Secure attribute (off on `http://localhost`, on in prod) — where the flag is read (mirror `ApiKeyGuard`'s env-driven config). |
| **Token/expiry as domain vs infra** | Where token generation and expiry computation live to respect `domain ← application ← infrastructure`. |

## Next step

Run `sdd-spec` and `sdd-design` (parallel) against this proposal.
