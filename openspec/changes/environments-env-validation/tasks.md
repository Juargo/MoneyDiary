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

- [ ] 0.1 RED: write `src/config/env.spec.ts` — happy path per NODE_ENV, each `superRefine` rejection (prod COOKIE_SECURE/host/ALLOW_DESTRUCTIVE_DB, dev/test non-localhost), `COOKIE_SECURE` enum parsing, rate-limit coercion rejects
- [ ] 0.2 GREEN: `src/config/env.ts` — `EnvObjectSchema` (10 fields, `.meta()`/`.describe()`), `EnvSchema`, `Env` type, `loadEnv`, `resolveConnectionString`, `LOCALHOST_PATTERN`, `refineByEnvironment`, `formatEnvError`
- [ ] 0.3 Export `SUPABASE_HOST_PATTERN` from `src/infrastructure/persistence/db-safety.ts`; import into `env.ts` (DRY, no re-declare)
- [ ] 0.4 Add `zod@^4.4.3` to `apps/api/package.json`
- [ ] 0.5 `pnpm api test` green; `pnpm api exec tsc --noEmit` clean

## Slice 1 — `createPrismaClient(env)` [ENV-06]

- [ ] 1.1 RED: update `create-prisma-client.spec.ts` — call with explicit `{DATABASE_URL, DIRECT_URL}`, assert `resolveConnectionString` precedence + empty-throw
- [ ] 1.2 GREEN: `createPrismaClient(env: Pick<Env,'DATABASE_URL'|'DIRECT_URL'>)` using `resolveConnectionString`

## Slice 2 — `createApiKeyMiddleware` factory [ENV-06]

- [ ] 2.1 RED: update `api-key.middleware.spec.ts` — `createApiKeyMiddleware(key)`, keep 401/200 request cases; move length/500 cases to `env.spec.ts` (0.1 already covers `API_KEY` min-length)
- [ ] 2.2 GREEN: `api-key.middleware.ts` singleton → `createApiKeyMiddleware(apiKey: string): RequestHandler`, boot-time length guard, no per-request 500

## Slice 3 — `cookie.ts` `secure` param [ENV-06]

- [ ] 3.1 RED: update `cookie.spec.ts` — pass `secure: true/false` directly, drop env mutation, keep `ahora` injection
- [ ] 3.2 GREEN: `serializeSessionCookie(token, expiresAt, secure, ahora=new Date())`, `clearSessionCookie(secure)`; delete `shouldBeSecure()`
- [ ] 3.3 Update 3 call sites in `auth.routes.ts` (lines ~66/88/133) + `AuthPublicDeps.cookieSecure: boolean`

## Slice 4 — `crearAuth(prisma, env)` [ENV-06]

- [ ] 4.1 RED: `login-rate-limiter.spec.ts` — delete `readRateLimitConfigFromEnv` test cases (finite/positive coverage now lives in `env.spec.ts` 0.1)
- [ ] 4.2 GREEN: delete `readRateLimitConfigFromEnv`; `crearAuth(prisma, env)` builds `LoginRateLimiter` from `env.LOGIN_RATELIMIT_*`; keep `RateLimitConfig` interface

## Slice 5 — wiring: `container.ts`/`app.ts`/`server.ts` [ENV-06]

- [ ] 5.1 Add `test/support/env.fixture.ts` — `buildTestEnv(overrides)`, frozen, all 10 fields defaulted
- [ ] 5.2 RED: migrate `app.*.spec.ts` (HTTP-level) — `createApp(container, buildTestEnv({...}))` replacing `process.env.API_KEY` mutation
- [ ] 5.3 GREEN: `createContainer(env, prisma=createPrismaClient(env))`; `createApp(container, env)` derives `cookieSecure = env.NODE_ENV==='production' || env.COOKIE_SECURE`, mounts `createApiKeyMiddleware(env.API_KEY)`, wires `cookieSecure` into `registrarAuthPublic`
- [ ] 5.4 `server.ts`: `const env = loadEnv()` after `import 'dotenv/config'`; thread into `createContainer`/`createApp`; `app.listen(env.PORT, ...)` replaces `Number(process.env.PORT ?? 3000)`
- [ ] 5.5 Full `pnpm api test` + `tsc --noEmit` green; manual boot smoke (`pnpm api start`) with local `.env`

## Slice 6 — `.env.example` emitter + CI guard [ENV-07]

- [ ] 6.1 **Verify at implementation time**: does installed `zod@4.4.3` expose per-field metadata via `.meta()` or `.description` (from `.describe()`)? Pick the one that works; `.describe()` is the documented fallback (design §6 flagged this as unverified — Context7 was unreachable during design)
- [ ] 6.2 RED: add a spec/manual-check for `scripts/gen-env-example.ts --check` exit codes (0 = match, non-zero = divergence)
- [ ] 6.3 GREEN: `scripts/gen-env-example.ts` — walks `EnvObjectSchema.shape`, emits `# <description>` + `KEY=<example>` (secrets empty), `--check` diffs against committed file
- [ ] 6.4 `package.json`: add `env:example`, `env:example:check` scripts
- [ ] 6.5 Regenerate `apps/api/.env.example` — must include `NODE_ENV`, `ALLOW_DESTRUCTIVE_DB`, `SEED_USER_EMAIL`, `SEED_USER_PASSWORD`, `CONFIRM_PROD_BACKFILL`
- [ ] 6.6 Wire `env:example:check` into API CI job

## Slice 7 — local Postgres + `render.yaml` + ESLint guard

- [ ] 7.1 `package.json`: fold `test:e2e`/`test:integration` to the `DOTENV_CONFIG_PATH=.env.test` localhost variants (design Decision 2); delete `test:e2e:local`/`test:integration:local`
- [ ] 7.2 Add `db:up`/`db:down` scripts (`docker compose up -d` / `down`) in `apps/api`
- [ ] 7.3 Update `docs/local-test-db.md` — canonical script names (no `:local`); add dev-`.env` localhost migration note (mirrors `.env.test`, minus test-only bits)
- [ ] 7.4 `render.yaml`: add `NODE_ENV=production`
- [ ] 7.5 `eslint.config`: `no-restricted-imports` forbidding `domain/**`/`application/**` → `config/env`
- [ ] 7.6 Run `pnpm api test:e2e` / `test:integration` locally against `db:up` Postgres — confirms ADR-028 e2e/int debt unblocked
