# Tasks: environments-env-validation (ADR-029)

apps/api only. Strict TDD (`pnpm api test`) — RED (failing spec) → GREEN (impl) → REFACTOR per slice. Slice numbers match design §11 exactly (design already locked the split; this phase orders tasks + PR grouping only).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~850 (range 700–950) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (Slice 0) → PR2 (Slices 1–5) → PR3 (Slice 6) → PR4 (Slice 7) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — user decision needed |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

**Why PR2 stays large (~460 lines):** Slices 1–5 change composition-root signatures (`createPrismaClient`, `createApiKeyMiddleware`, `cookie.ts`, `crearAuth`, `container.ts`/`app.ts`/`server.ts`) that call each other — an intermediate merge after only slice 1 or 2 leaves `container.ts`/`app.ts` failing to compile (old call sites, new required `env` param). Splitting further requires a throwaway compatibility shim, which contradicts KISS/YAGNI for a one-time refactor. Recommend either `size:exception` for PR2 alone, or `feature-branch-chain` so PR2's intermediate state never touches `main`.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | `env.ts` schema + `loadEnv` + tests, zero call sites touched | PR1 | Self-contained, ~300 lines, additive only — safe to merge alone (stacked or tracker base) |
| 2 | All 5 read points + wiring (prisma, api-key, cookie, rate-limiter, container/app/server) | PR2 | ~460 lines, atomic — must land as one unit; depends on PR1 |
| 3 | `.env.example` emitter + CI `--check` + regenerated file | PR3 | ~125 lines, depends on PR1's schema only |
| 4 | Local Postgres docs/scripts + `render.yaml` + ESLint guard | PR4 | ~50 lines, mostly independent, depends on PR2's `test:e2e`/`test:integration` fold |

### Spec-Migration Surface (top delivery risk, PR2)

| File | Change | Est. lines |
|---|---|---|
| `create-prisma-client.spec.ts` | pass explicit `{DATABASE_URL, DIRECT_URL}` instead of env mutation | ~25 |
| `api-key.middleware.spec.ts` | `createApiKeyMiddleware(key)`; drop 500/length cases (moved to `env.spec.ts`) | ~35 |
| `cookie.spec.ts` | pass `secure: boolean` arg; drop `process.env` mutation | ~35 |
| `login-rate-limiter.spec.ts` | delete `readRateLimitConfigFromEnv` cases | ~20 |
| `app.*.spec.ts` (HTTP-level, multiple files) | `createApp(container, buildTestEnv({...}))` | ~35 |

## Slice 0 — `env.ts` foundation [ENV-01, ENV-02, ENV-03, ENV-04, ENV-05]

- [x] 0.1 RED: write `src/config/env.spec.ts` — happy path per NODE_ENV, each `superRefine` rejection (prod COOKIE_SECURE/host/ALLOW_DESTRUCTIVE_DB, dev/test non-localhost), `COOKIE_SECURE` enum parsing, rate-limit coercion rejects
- [x] 0.2 GREEN: `src/config/env.ts` — `EnvObjectSchema` (10 fields, `.describe()`), `EnvSchema`, `Env` type, `loadEnv`, `resolveConnectionString`, `LOCALHOST_PATTERN`, `refineByEnvironment`, `formatEnvError`
- [x] 0.3 Export `SUPABASE_HOST_PATTERN` from `src/infrastructure/persistence/db-safety.ts`; import into `env.ts` (DRY, no re-declare)
- [x] 0.4 Add `zod@^4.4.3` to `apps/api/package.json`
- [x] 0.5 `pnpm api test` green; `pnpm api exec tsc --noEmit` clean

## Slice 1 — `createPrismaClient(env)` [ENV-06]

- [x] 1.1 RED: update `create-prisma-client.spec.ts` — call with explicit `{DATABASE_URL, DIRECT_URL}`, assert `resolveConnectionString` precedence + empty-throw
- [x] 1.2 GREEN: `createPrismaClient(env: Pick<Env,'DATABASE_URL'|'DIRECT_URL'>)` using `resolveConnectionString`

## Slice 2 — `createApiKeyMiddleware` factory [ENV-06]

- [x] 2.1 RED: update `api-key.middleware.spec.ts` — `createApiKeyMiddleware(key)`, keep 401/200 request cases; move length/500 cases to `env.spec.ts` (0.1 already covers `API_KEY` min-length)
- [x] 2.2 GREEN: `api-key.middleware.ts` singleton → `createApiKeyMiddleware(apiKey: string): RequestHandler`, boot-time length guard, no per-request 500

## Slice 3 — `cookie.ts` `secure` param [ENV-06]

- [x] 3.1 RED: update `cookie.spec.ts` — pass `secure: true/false` directly, drop env mutation, keep `ahora` injection
- [x] 3.2 GREEN: `serializeSessionCookie(token, expiresAt, secure, ahora=new Date())`, `clearSessionCookie(secure)`; delete `shouldBeSecure()`
- [x] 3.3 Update 3 call sites in `auth.routes.ts` (lines ~66/88/133) + `AuthPublicDeps.cookieSecure: boolean`

## Slice 4 — `crearAuth(prisma, env)` [ENV-06]

- [x] 4.1 RED: `login-rate-limiter.spec.ts` — delete `readRateLimitConfigFromEnv` test cases (finite/positive coverage now lives in `env.spec.ts` 0.1)
- [x] 4.2 GREEN: delete `readRateLimitConfigFromEnv`; `crearAuth(prisma, env)` builds `LoginRateLimiter` from `env.LOGIN_RATELIMIT_*`; keep `RateLimitConfig` interface

## Slice 5 — wiring: `container.ts`/`app.ts`/`server.ts` [ENV-06]

- [x] 5.1 Add `test/support/env.fixture.ts` — `buildTestEnv(overrides)`, frozen, all 10 fields defaulted
- [x] 5.2 RED: migrate `app.*.spec.ts` (HTTP-level) — `createApp(container, buildTestEnv({...}))` replacing `process.env.API_KEY` mutation
- [x] 5.3 GREEN: `createContainer(env, prisma=createPrismaClient(env))`; `createApp(container, env)` derives `cookieSecure = env.NODE_ENV==='production' || env.COOKIE_SECURE`, mounts `createApiKeyMiddleware(env.API_KEY)`, wires `cookieSecure` into `registrarAuthPublic`
- [x] 5.4 `server.ts`: `const env = loadEnv()` after `import 'dotenv/config'`; thread into `createContainer`/`createApp`; `app.listen(env.PORT, ...)` replaces `Number(process.env.PORT ?? 3000)`
- [x] 5.5 Full `pnpm api test` (832/832, 111 files) + `tsc --noEmit` green. Manual boot smoke (`pnpm api start`) **NOT run** — no local Postgres provisioned in this sandbox (pre-existing ADR-028 debt; Slice 7 provisions `db:up`). Also fixed every OTHER call site whose signature this PR changed to keep the build atomic: `src/infrastructure/cli/ingestar.ts` (CLI entrypoint) + all 19 `test/*.e2e-spec.ts`/`test/*.int-spec.ts` files (blocked from running by the same DB debt, but must still type-check) now use `loadEnv()`/`createPrismaClient(env)`/`createContainer(env, prisma)`/`createApp(container, env)`.

## PR2 review fixes (post-Slice 5, pre-push — two fresh-context reviews)

- [x] R-FIX1 (BLOCKER): cover `cookieSecure = env.NODE_ENV==='production' || env.COOKIE_SECURE` derivation in `app.ts` — 3 cases added to `app.auth.spec.ts` via `buildTestEnv`'s post-parse override bypass
- [x] R-FIX2 (should-fix): restore dropped rate-limit coverage in `env.spec.ts` — negative-number rejection + non-default override round-trip
- [x] R-FIX3 (should-fix): add `crear-auth.spec.ts` for `env.LOGIN_RATELIMIT_* -> RateLimitConfig` mapping (ENV-06); added `LoginRateLimiter.configuracion` read-only getter to make it inspectable
- [x] R-FIX4 (R1 suggestion): narrow `crearAuth(prisma, env)` to `Pick<Env, 'LOGIN_RATELIMIT_MAX_EMAIL'|'LOGIN_RATELIMIT_MAX_IP'|'LOGIN_RATELIMIT_WINDOW_MS'>` for defense-in-depth, consistent with `createPrismaClient`'s scoping
- Deferred (documented, not implemented): boot smoke test — blocked on no local Postgres, gated on Slice 7 (`db:up`); CI `forbidOnly` gate — pre-existing, out of scope for this change
- Verification: `pnpm api test` 838/838 (112 files) green; `pnpm api exec tsc --noEmit` clean; `git diff --stat` 5 files, +126/-1

## Slice 6 — `.env.example` emitter + CI guard [ENV-07] — ✅ DONE (PR3, `env-config/03-env-example-emitter`)

- [x] 6.1 **Verified**: `zod@4.4.3`'s `.describe(text)` registers into `core.globalRegistry` and each schema exposes a `description` getter reading it back — read `schema.description` directly, no `.meta()` needed. Confirmed against the installed package (probed `def`/`description` at runtime), not reverse-engineered from `_def`.
- [x] 6.2 RED: `src/config/env-example.spec.ts` — `formatFieldLine`/`renderEnvExample`/`envExampleDiverges` pure-logic specs (known field → exact `KEY=default  # description` line; required field → empty value; `envExampleDiverges` false on match, true on tamper and on schema drift)
- [x] 6.3 GREEN: `src/config/env-example.ts` (pure formatting: walks `EnvObjectSchema.shape` + `.description`, unwraps `optional`/`pipe` wrappers to read the pre-transform default) + `scripts/gen-env-example.ts` (thin fs/argv/exit-code CLI wrapper, same split as `prisma/seed.ts`) — `--check` diffs against committed file
- [x] 6.4 `package.json`: added `env:example` (write) and `env:example:check` (verify, non-zero exit on divergence) scripts
- [x] 6.5 Regenerated `apps/api/.env.example` via `pnpm api env:example` — now includes `NODE_ENV`, `ALLOW_DESTRUCTIVE_DB`, `LOGIN_RATELIMIT_*`. **Decision (documented, KISS)**: `SEED_USER_EMAIL`/`SEED_USER_PASSWORD`/`CONFIRM_PROD_BACKFILL` stay OUT of `EnvObjectSchema` (design decision #3 unchanged — schema stays honest about API-boot needs) but ARE emitted in a fixed, hardcoded trailer block in the generated file (commented, non-schema-driven) so they remain discoverable without a second manually-maintained doc.
- [x] 6.6 Wired `pnpm api env:example:check` into `.github/workflows/ci.yml` (API job, right after the `tsc --noEmit` step)

## Slice 7 — local Postgres + `render.yaml` + ESLint guard — PR4, `env-config/04-local-db-render-eslint`

- [x] 7.1 `package.json`: fold `test:e2e`/`test:integration` to the `DOTENV_CONFIG_PATH=.env.test` localhost variants (design Decision 2); delete `test:e2e:local`/`test:integration:local`
- [x] 7.2 Add `db:up`/`db:down` scripts (`docker compose up -d` / `down`) in `apps/api`
- [x] 7.3 Update `docs/local-test-db.md` — canonical script names (no `:local`); added dev-`.env` localhost migration note (ADR-029 fail-fast in dev/test)
- [x] 7.4 `render.yaml`: add `NODE_ENV=production` (+ refreshed 2 adjacent stale comments referencing deleted `shouldBeSecure`/`readRateLimitConfigFromEnv`)
- [x] 7.5 `eslint.config`: `no-restricted-imports` forbidding `domain/**`/`application/**` → `config/env`. **Verified**: temporarily added `import { loadEnv } from '../../config/env'` to `src/domain/value-objects/bucket.ts`, ran `eslint`, got `no-restricted-imports` error naming the exact message; reverted, re-ran, 0 errors on that file.
- [x] 7.6 Run `pnpm api test:e2e` / `test:integration` locally against `db:up` Postgres — **attempted, blocked by a NEWLY DIAGNOSED environment issue** (not just "no DB available"): the `moneydiary-test-db` Docker container was already up/healthy (pre-existing, 30h uptime) and `.env.test` pre-existed, but `prisma migrate deploy` and `vitest run --config vitest.int.config.ts` both failed identically with `User was denied access on the database (not available)`. Root-caused via `lsof -nP -iTCP:5432 -sTCP:LISTEN`: a **Homebrew `postgresql@17` service is ALSO bound to `127.0.0.1:5432`/`[::1]:5432` on the host** (separate from Docker's `*:5432` forward) and the OS routes loopback connections to the more-specific brew-bound socket first — so `.env.test`'s `localhost:5432` silently hits the wrong Postgres (no `moneydiary` role there), never reaching the Docker container. Confirmed the Docker container itself is fine (`docker exec moneydiary-test-db psql -U moneydiary -d moneydiary_test` and `PGPASSWORD=moneydiary` over the container's own loopback both succeed). Did not touch the host's brew service or `.env.test` (env-file writes/reads are permission-denied to this agent) — see apply-progress for the exact 1-command fix for the user.
