# Design — environments-env-validation

Technical design (the HOW, architectural level) for ADR-029: a single first-class
`NODE_ENV` domain + a Zod-validated, boot-time, injected env config for `apps/api`.
Implements the proposal at `sdd/environments-env-validation/proposal` (id #354).
Scope: `apps/api` only. Strict TDD active (`pnpm api test`).

> Zod docs: Context7 was not reachable from this phase's tool context. This design
> targets the **Zod `^4.4.3`** public API (`z.enum`, `.transform`, `.default`,
> `.superRefine((val, ctx) => ctx.addIssue(...))`, `z.coerce.number`, `ZodObject.shape`,
> field `.meta()`/`.describe()`). The single API detail I could not verify against
> live docs — the exact reader for per-field metadata used by the `.env.example`
> emitter (`field.meta()` vs `field.description`) — is called out as an
> implementation-time verification point in §6. Nothing else in the design depends
> on an unverified API.

---

## 1. Architecture approach

**Pattern:** close an env-shaped hole in the existing manual DI graph (ADR-005 /
ADR-028). No new framework, no new pattern. `env.ts` is a new **infrastructure**
module (`apps/api/src/config/env.ts`); `domain`/`application` never import it. The
composition root threads a single validated, frozen `Env` object down from the boot
entrypoint, exactly as every other adapter is wired.

**Three architectural rules the design obeys:**

1. **Parse once, at boot, as a function.** `loadEnv(source = process.env): Env` is a
   plain function — **never** a top-level `Schema.parse(process.env)` at import. This
   is load-bearing: the unit config (`vitest.config.ts`) has no `setupFiles`/dotenv,
   so most required vars are absent in unit runs. Import-time parsing would crash
   dozens of unrelated pure-domain specs the moment any of them transitively imported
   a module in `env.ts`'s graph. Function-scoped parsing confines the fail-fast to the
   real boot path (`server.ts`) and to specs that explicitly call `loadEnv`.

2. **Fail fast, loudly, immutably.** `loadEnv` validates the whole schema, and on any
   failure throws a single formatted multi-line error (every offending key + reason)
   and the process refuses to start. On success it returns a frozen object
   (`Object.freeze`) typed `Env`. Nothing downstream re-reads `process.env`.

3. **Flat schema + `superRefine`, not a discriminated union.** The three environments
   share ~95% of fields with different *constraints*, not different *shapes*. A union
   would triplicate declarations for no structural gain (KISS/YAGNI) and imports the
   known `discriminatedUnion`+`superRefine` upstream friction. Accepted tradeoff: the
   TS type of `Env` cannot statically prove "prod ⇒ COOKIE_SECURE true"; that is
   enforced at boot by the refinement, which is the actual goal (fail fast, not
   compile-time narrowing of an object nobody branches on by type).

**Boot → DI data flow (single source, one direction):**

```
server.ts
  └─ const env = loadEnv()                 // once, after `import 'dotenv/config'`
       ├─ createContainer(env)             // env → crearAuth(prisma, env) + createPrismaClient(env)
       │     ├─ createPrismaClient(env)               // DB connection string
       │     └─ crearAuth(prisma, env)                // LoginRateLimiter from env.LOGIN_RATELIMIT_*
       ├─ createApp(container, env)         // env.API_KEY → api-key factory; cookieSecure → auth routes
       └─ app.listen(env.PORT)             // PORT schema-covered for the first time
```

`env` is consumed by exactly two composition entrypoints (`createContainer`,
`createApp`) plus `app.listen`. HTTP-presentation scalars (`API_KEY`, the derived
`cookieSecure`) are derived inside `createApp` and stay out of `Container` (SRP:
`Container` holds use-cases, not HTTP-layer values).

---

## 2. The `Env` type and full field list

**10 fields = the 8 inventoried boot vars + `NODE_ENV` + `PORT`.** `SEED_USER_EMAIL`,
`SEED_USER_PASSWORD`, and `CONFIRM_PROD_BACKFILL` are **deliberately absent** — they
belong to standalone scripts outside the API boot DI graph (see §Decision 3).

| Field | Zod | Required? | Default | Prod rule (superRefine) | `.env.example` example |
|---|---|---|---|---|---|
| `NODE_ENV` | `z.enum(['development','test','production'])` | optional | `'development'` | — (drives the others) | `development` |
| `PORT` | `z.coerce.number().int().positive()` | optional | `3000` | — | `3000` |
| `DATABASE_URL` | `z.string().min(1)` | **required** (all envs) | — | must be Supabase host | *(empty — secret)* |
| `DIRECT_URL` | `z.string().min(1).optional()` | optional | — (falls back to `DATABASE_URL`) | (same host rule via resolved string) | *(empty — secret)* |
| `API_KEY` | `z.string().min(16)` | **required** (all envs) | — | — | *(empty — secret)* |
| `COOKIE_SECURE` | `z.enum(['true','false']).default('false').transform(v => v === 'true')` | optional → `boolean` | `false` | must resolve `true` | `false` |
| `ALLOW_DESTRUCTIVE_DB` | `z.literal('1').optional()` | optional | — | **must be absent** in production | *(commented, omitted)* |
| `LOGIN_RATELIMIT_MAX_EMAIL` | `z.coerce.number().int().positive()` | optional | `5` | — | `5` |
| `LOGIN_RATELIMIT_MAX_IP` | `z.coerce.number().int().positive()` | optional | `20` | — | `20` |
| `LOGIN_RATELIMIT_WINDOW_MS` | `z.coerce.number().int().positive()` | optional | `900000` | — | `900000` |

**Type export:**

```ts
export const EnvObjectSchema = z.object({ /* the 10 fields above, each with .meta(...) */ });
export const EnvSchema = EnvObjectSchema.superRefine(refineByEnvironment);
export type Env = Readonly<z.infer<typeof EnvSchema>>;   // COOKIE_SECURE: boolean, PORT: number, ...
```

Two exports on purpose: `EnvObjectSchema` (a `ZodObject`, exposes `.shape` for the
emitter) and `EnvSchema` (object + refinement, used by `loadEnv`). `.superRefine`
returns a wrapper without `.shape`, so the emitter must read the plain object schema.

**Rationale for the tricky field choices:**

- **`NODE_ENV` default `'development'` is the *safe* default.** If a production deploy
  forgets to set `NODE_ENV`, it defaults to `development`, whose rule demands a
  `localhost` DB — which the real Supabase connection string fails → boot refuses.
  Fail-closed. (`render.yaml` still sets it explicitly per ADR-029; the default is a
  safety net, not a substitute.)
- **`COOKIE_SECURE` uses `z.enum(['true','false']).transform(...)`, NOT
  `z.coerce.boolean()`** — the latter treats the string `"false"` as `true` (Zod
  footgun). `.default('false')` applies to the *input* before `.transform`, so
  omitting the var yields `false`.
- **`z.coerce.number().int().positive()` for the rate-limit + PORT numbers** reproduces
  today's fail-closed guard for free: `""` coerces to `0` → fails `.positive()`;
  `"abc"` coerces to `NaN` → fails `.int()`; `undefined` short-circuits to the
  `.default(...)`. This is exactly why `readRateLimitConfigFromEnv`'s manual loop can
  be deleted (DRY — Zod proves the same invariant).
- **`ALLOW_DESTRUCTIVE_DB: z.literal('1').optional()`** is present in the schema *only*
  so `superRefine` can forbid it in production (the "destructive-op prohibition scoped
  to API boot" settled decision). The API never reads its value; dev/test may set it
  (the destructive test scripts do).

---

## 3. The `superRefine` logic

```ts
import { SUPABASE_HOST_PATTERN } from '../persistence/db-safety';  // DRY — reuse, do not re-declare

// db-safety.ts has no localhost concept, so this regex is genuinely new (not a dup).
const LOCALHOST_PATTERN = /(^|@|\/\/)(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;

function refineByEnvironment(env: /* parsed shape */, ctx: z.RefinementCtx): void {
  const conn = resolveConnectionString(env);              // DIRECT_URL ?? DATABASE_URL (shared helper)

  if (env.NODE_ENV === 'production') {
    if (env.COOKIE_SECURE !== true) {
      ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'],
        message: 'production requiere COOKIE_SECURE=true.' });
    }
    if (!SUPABASE_HOST_PATTERN.test(conn)) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'],
        message: 'production requiere una BD Supabase (host *.supabase.co).' });
    }
    if (env.ALLOW_DESTRUCTIVE_DB !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['ALLOW_DESTRUCTIVE_DB'],
        message: 'ALLOW_DESTRUCTIVE_DB está prohibido en production (fail-closed).' });
    }
    return;
  }

  // development | test  →  localhost strict, fail-fast (user decision, both environments)
  if (!LOCALHOST_PATTERN.test(conn)) {
    ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'],
      message: `${env.NODE_ENV} requiere una BD en localhost (no Supabase/prod).` });
  }
}
```

- **`superRefine` runs after field transforms**, so `env.COOKIE_SECURE` is already a
  `boolean` here — the `!== true` check is correct.
- **DRY on Supabase detection:** `db-safety.ts` currently keeps `SUPABASE_HOST_PATTERN`
  private. This change **exports** it from `db-safety.ts` and imports it into `env.ts`
  so there is one Supabase regex in the codebase, not two divergent ones. `db-safety.ts`
  otherwise stays fully intact (2nd runtime layer of defense; its own `process.env`
  fallback and `allowProductionAck` path untouched).
- **`resolveConnectionString`** (§4) is the single `DIRECT_URL ?? DATABASE_URL` helper,
  reused by the refinement *and* `createPrismaClient`.

---

## 4. DI threading — exact new signatures

**Shared connection-string helper (removes the in-boot duplication):**

```ts
// apps/api/src/config/env.ts
export function resolveConnectionString(
  env: Pick<Env, 'DATABASE_URL' | 'DIRECT_URL'>,
): string {
  return env.DIRECT_URL ?? env.DATABASE_URL;
}
```

Used by `createPrismaClient` and by `refineByEnvironment`. (`db-safety.ts`, `seed.ts`,
`backfill-categorias.ts` are out of the boot graph and keep their own reads for now;
they *may* later import this helper — registered as follow-up debt, not done here.)

**Signatures — before → after:**

```ts
// create-prisma-client.ts
- export function createPrismaClient(): PrismaClient
+ export function createPrismaClient(env: Pick<Env, 'DATABASE_URL' | 'DIRECT_URL'>): PrismaClient
//   body: const cs = resolveConnectionString(env); if (!cs) throw ...; new PrismaPg(cs)

// crear-auth.ts
- export function crearAuth(prisma: PrismaClient): AuthGraph
+ export function crearAuth(
+   prisma: PrismaClient,
+   env: Pick<Env, 'LOGIN_RATELIMIT_MAX_EMAIL' | 'LOGIN_RATELIMIT_MAX_IP' | 'LOGIN_RATELIMIT_WINDOW_MS'>,
+ ): AuthGraph
//   loginRateLimiter: new LoginRateLimiter({
//     maxAttemptsPerEmail: env.LOGIN_RATELIMIT_MAX_EMAIL,
//     maxAttemptsPerIp:    env.LOGIN_RATELIMIT_MAX_IP,
//     windowMs:            env.LOGIN_RATELIMIT_WINDOW_MS,
//   })
//   → readRateLimitConfigFromEnv() DELETED. RateLimitConfig interface stays (ctor arg type).

// container.ts
- export function createContainer(prisma: PrismaClient = createPrismaClient()): Container
+ export function createContainer(
+   env: Env,
+   prisma: PrismaClient = createPrismaClient(env),
+ ): Container
//   env moved to first param because the prisma default now depends on it.
//   body: const auth = crearAuth(prisma, env);

// api-key.middleware.ts  (singleton → factory)
- export const apiKeyMiddleware: RequestHandler
+ export function createApiKeyMiddleware(apiKey: string): RequestHandler
//   one-time boot guard: if (apiKey.length < 16) throw ...;  (moved off the per-request path)
//   returned handler: no length check, no 500 branch — only 401 on missing/wrong header.

// cookie.ts  (Decision 1: parameter-threading)
- export function serializeSessionCookie(token: string, expiresAt: Date, ahora?: Date): string
+ export function serializeSessionCookie(token: string, expiresAt: Date, secure: boolean, ahora: Date = new Date()): string
- export function clearSessionCookie(): string
+ export function clearSessionCookie(secure: boolean): string
//   buildCookie(valor, maxAgeSegundos, secure); shouldBeSecure() + its process.env reads DELETED.

// auth.routes.ts deps (registrarAuthPublic second arg gains one field)
+ cookieSecure: boolean
//   3 call sites: serializeSessionCookie(token, expiresAt, deps.cookieSecure)  (×2)
//                 clearSessionCookie(deps.cookieSecure)                        (×1)

// app.ts
- export function createApp(container: Container): Express
+ export function createApp(container: Container, env: Env): Express
//   const cookieSecure = env.NODE_ENV === 'production' || env.COOKIE_SECURE;
//   app.use('/api', createApiKeyMiddleware(env.API_KEY));
//   registrarAuthPublic(authPublicApi, { ...existing, cookieSecure });

// server.ts
+ const env = loadEnv();
  const container = createContainer(env);
  const app = createApp(container, env);
- const port = Number(process.env.PORT ?? 3000);
  const server = app.listen(env.PORT, () => ...);
```

`cookieSecure` keeps the old belt-and-suspenders derivation
(`NODE_ENV==='production' || COOKIE_SECURE`) so behavior is byte-identical to today; the
schema *additionally* forces `COOKIE_SECURE===true` in prod so a misconfigured prod
deploy fails fast even though the derivation alone would have been `true`.

---

## 5. Resolved design decisions

### Decision 1 — Cookie DI shape: **parameter-threading** (not an injected class)

**Chosen:** thread a `secure: boolean` parameter through `serializeSessionCookie(token,
expiresAt, secure, ahora?)` and `clearSessionCookie(secure)`, sourced once from
`cookieSecure` in `createApp` and passed via `registrarAuthPublic`'s deps object.

**Rationale (KISS + YAGNI over uniformity):** cookie helpers are **two pure functions**
with three call sites. A `SessionCookieSerializer` class would add stateful DI ceremony
for zero polymorphism and no second implementation — the YAGNI "no class for what is two
pure functions / no plugin system with one plugin" rule. The repo **already** threads an
injectable `ahora: Date` through `serializeSessionCookie` for deterministic tests;
`secure` follows that exact, sanctioned precedent — it is just another injected value.
The functions stay pure and trivially unit-testable (pass `true`/`false` directly), which
is also what makes the spec migration cheapest (§7).

**Call-sites touched:** `serializeSessionCookie` def + `clearSessionCookie` def
(`cookie.ts`); 3 handler call sites in `auth.routes.ts` (lines 66, 88, 133); the
`AuthPublicDeps` shape + `createApp` wiring (one new `cookieSecure` field);
`cookie.spec.ts` (migrated per §7). `shouldBeSecure()` and its two `process.env` reads
are deleted.

### Decision 2 — Non-`:local` `test:e2e` / `test:integration`: **fold `:local` into the canonical names, delete the duplicates**

With `test ⇒ localhost` enforced at boot, a script that loads the only real `.env`
(Supabase) can **never** succeed — it is a dead footgun, not a "safety net." The actual
safety net is the schema + `db-safety.ts` (both retained). Keeping a script that always
fails fast only invites confusion (it even carries `ALLOW_DESTRUCTIVE_DB=1`).

**End-state `package.json` scripts (`apps/api`):**

```jsonc
// BEFORE                                        // AFTER
"test:e2e": "ALLOW_DESTRUCTIVE_DB=1 vitest run --config ./vitest.e2e.config.ts",
"test:integration": "ALLOW_DESTRUCTIVE_DB=1 vitest run --config ./vitest.int.config.ts",
"test:integration:local": "DOTENV_CONFIG_PATH=.env.test ALLOW_DESTRUCTIVE_DB=1 vitest run --config ./vitest.int.config.ts",
"test:e2e:local": "DOTENV_CONFIG_PATH=.env.test ALLOW_DESTRUCTIVE_DB=1 vitest run --config ./vitest.e2e.config.ts",

// →  the two canonical names now ARE the localhost variants; the :local duplicates are removed:
"test:e2e": "DOTENV_CONFIG_PATH=.env.test ALLOW_DESTRUCTIVE_DB=1 vitest run --config ./vitest.e2e.config.ts",
"test:integration": "DOTENV_CONFIG_PATH=.env.test ALLOW_DESTRUCTIVE_DB=1 vitest run --config ./vitest.int.config.ts",
// (test:e2e:local / test:integration:local  →  DELETED)
```

One name per suite, always `localhost`, no dead path. `docs/local-test-db.md` (which
references the `:local` names) is updated to the canonical names in the same change.

### Decision 3 — `CONFIRM_PROD_BACKFILL` in `loadEnv`'s schema: **NO**

The backfill script (`prisma/backfill-categorias.ts`) runs **outside** the API boot DI
graph, never calls `loadEnv`, and keeps its own `db-safety.ts` path with its
`allowProductionAck` (`CONFIRM_PROD_BACKFILL`) mechanism. Adding the field to the boot
schema would create a dead optional key the API never reads (YAGNI "delete dead code
paths"). The schema stays **honest about what the API boot actually needs**. Same
reasoning excludes `SEED_USER_EMAIL`/`SEED_USER_PASSWORD` (seed-script only). The
supervised-backfill capability survives unchanged.

---

## 6. `.env.example` emitter + CI check

**Script:** `apps/api/scripts/gen-env-example.ts`, run via a new `env:example` script
(`ts-node scripts/gen-env-example.ts`). No new dependency beyond Zod.

**Design — walk the schema, not a parallel table (single source of truth):**

1. Iterate `EnvObjectSchema.shape` (the plain `ZodObject`, before `.superRefine`).
2. For each `[key, field]`, read display metadata attached to the field.
   Each field is declared with metadata, e.g.
   `z.string().min(16).meta({ description: 'API key (>=16 chars). Secret.', example: '' })`.
   **Verification point (Zod 4.4.3):** confirm at implementation time whether the reader
   is `field.meta()` (metadata registry) or `field.description` (from `.describe()`).
   The design does not depend on which — pick the one the installed version exposes and
   use it uniformly; `.describe(text)` is the fallback for the comment line if `.meta()`
   is not ergonomic. Do **not** reverse-engineer `_def.defaultValue` internals; the
   display/example value lives explicitly in the field's metadata.
3. Emit, per field: a `# <description>` comment line then `KEY=<example>` (empty for
   secrets like `DATABASE_URL`/`API_KEY`). Header banner marks the file generated:

```
# GENERATED by `pnpm api env:example` — DO NOT EDIT BY HAND.
# Source of truth: apps/api/src/config/env.ts (EnvObjectSchema).

# App environment. One of: development | test | production.
NODE_ENV=development
# HTTP port the API listens on.
PORT=3000
# Postgres connection string (runtime). Secret — set locally / in Render.
DATABASE_URL=
... (all 10 fields in schema order)
```

**CI check:** the same script accepts `--check` — it regenerates into memory/tmp and
`diff`s against the committed `apps/api/.env.example`, exiting non-zero on divergence.
Wired as `env:example:check` and added to the API CI job (and, optionally,
lint-staged/pre-commit for the schema file). This structurally closes the current gap
(`.env.example` is missing `NODE_ENV`, `ALLOW_DESTRUCTIVE_DB`, etc.) and prevents future
drift.

---

## 7. Unit-spec migration strategy (top delivery risk)

Strict TDD: for each read point the spec moves **first** (red), then the production
signature changes to satisfy it (green). The linchpin that keeps this cheap is a shared
test fixture so specs don't hand-build 10 fields each:

```ts
// apps/api/test/support/env.fixture.ts
export function buildTestEnv(overrides: Partial<Env> = {}): Env {
  return Object.freeze({
    NODE_ENV: 'test', PORT: 3000,
    DATABASE_URL: 'postgresql://moneydiary:moneydiary@localhost:5432/moneydiary_test',
    DIRECT_URL: undefined, API_KEY: 'test-api-key-0000000000000000',
    COOKIE_SECURE: false, ALLOW_DESTRUCTIVE_DB: undefined,
    LOGIN_RATELIMIT_MAX_EMAIL: 5, LOGIN_RATELIMIT_MAX_IP: 20, LOGIN_RATELIMIT_WINDOW_MS: 900_000,
    ...overrides,
  });
}
```

| Spec | Today | Migration |
|---|---|---|
| `env.spec.ts` (**new**) | — | `loadEnv` happy path + each `superRefine` rejection per environment + `COOKIE_SECURE="false"` parses to `false` + rate-limit `""`/`"abc"`/`0` rejection + `API_KEY` <16 rejection. **Absorbs** the coverage relocated from the two specs below. |
| `cookie.spec.ts` | mutates `process.env.NODE_ENV`/`COOKIE_SECURE` | pass `secure: true/false` as an arg; assert `Secure` present/absent by the boolean. No env mutation. |
| `login-rate-limiter.spec.ts` | tests `readRateLimitConfigFromEnv()` via env mutation | **delete** those cases (function removed); the finite/positive coverage moves to `env.spec.ts`. `LoginRateLimiter` behavior specs already pass a `RateLimitConfig` literal — unchanged. |
| `api-key.middleware.spec.ts` | sets `process.env.API_KEY`, imports singleton | call `createApiKeyMiddleware(key)`; the 500 "misconfigured"/length cases move to `env.spec.ts` (API_KEY <16) + one construction-guard test; keep 401/200 request specs. |
| `create-prisma-client.spec.ts` | sets/unsets `process.env.DATABASE_URL`/`DIRECT_URL` | call `createPrismaClient({ DATABASE_URL, DIRECT_URL })` with explicit values; empty-resolution throw tested by explicit empties. |
| `app.*.spec.ts` (HTTP-level) | set `process.env.API_KEY` before `createApp(container)` | `createApp(container, buildTestEnv({ API_KEY: ... }))`. `buildTestEnv` makes this a one-line change per spec. |

**Net coverage is preserved, not lost** — the config-validation assertions that lived in
per-read-point specs are consolidated into `env.spec.ts` (their new, correct home), while
the read points keep only their *behavioral* specs with injected values.

---

## 8. Local Postgres provisioning

The tooling already exists (`apps/api/docker-compose.yml`, `docs/local-test-db.md`,
`test:db:setup`). This change formalizes it as a first-class dependency of the new
`development ⇒ localhost` / `test ⇒ localhost` rules and closes the remaining gaps:

- **Dev `.env` now also localhost.** `docs/local-test-db.md` currently covers only
  `.env.test`. Extend it: regular `pnpm api start` (development) must point `DATABASE_URL`
  at the same local Postgres, because `development ⇒ localhost` is fail-fast. Add a
  short migration note (dev `.env` template mirrors the `.env.test` block, minus the
  test-only bits) — the derived `.env.example` (§6) is the canonical field list.
- **Ergonomic scripts** (low-cost, remove friction of the workflow-breaking dev change):
  `"db:up": "docker compose up -d"`, `"db:down": "docker compose down"` in `apps/api`.
- **Unblocks the ADR-028 e2e/int debt:** same local DB the (now canonical, §Decision 2)
  `test:e2e` / `test:integration` need.

---

## 9. `render.yaml` + guardrails

- **`render.yaml`** adds `- key: NODE_ENV / value: production` (ADR-029 §Consequences).
  Without it prod would default to `development` and — correctly — refuse to boot against
  Supabase, so this is required to actually run in prod.
- **ESLint guard:** a `no-restricted-imports` rule forbidding `domain/**` and
  `application/**` from importing `../config/env` (or any `config/env` path), making the
  ADR-005 boundary explicit and CI-enforced rather than convention-only. The dependency
  rule already forbids it structurally; this is a cheap, loud tripwire.

---

## 10. Component / file map

| File | Change |
|---|---|
| `src/config/env.ts` | **new** — `EnvObjectSchema`, `EnvSchema`, `Env`, `loadEnv`, `resolveConnectionString`, `LOCALHOST_PATTERN`, `refineByEnvironment`, `formatEnvError` |
| `src/config/env.spec.ts` | **new** — schema/refinement/loadEnv unit specs |
| `src/infrastructure/persistence/db-safety.ts` | **export** `SUPABASE_HOST_PATTERN` (DRY); otherwise untouched |
| `src/infrastructure/persistence/create-prisma-client.ts` | `createPrismaClient(env)` via `resolveConnectionString` |
| `src/infrastructure/http/auth/cookie.ts` | `secure` param; delete `shouldBeSecure` |
| `src/infrastructure/http/auth/login-rate-limiter.ts` | **delete** `readRateLimitConfigFromEnv`; keep `RateLimitConfig` + class |
| `src/composition/crear-auth.ts` | `crearAuth(prisma, env)`; build `LoginRateLimiter` from `env` |
| `src/composition/container.ts` | `createContainer(env, prisma?)` |
| `src/infrastructure/http-express/middleware/api-key.middleware.ts` | `createApiKeyMiddleware(apiKey)` factory |
| `src/infrastructure/http-express/app.ts` | `createApp(container, env)`; derive `cookieSecure`; call factory |
| `src/infrastructure/http-express/routes/auth.routes.ts` | thread `cookieSecure` at 3 call sites |
| `src/infrastructure/http-express/server.ts` | `loadEnv()` → thread into container/app/listen |
| `scripts/gen-env-example.ts` | **new** — emitter + `--check` |
| `test/support/env.fixture.ts` | **new** — `buildTestEnv` |
| `package.json` | add `zod ^4.4.3`; scripts `env:example`, `env:example:check`, `db:up`, `db:down`; fold `test:e2e`/`test:integration` to localhost; drop `:local` duplicates |
| `.env.example` | regenerated (derived) |
| `render.yaml` | add `NODE_ENV=production` |
| `docs/local-test-db.md` | dev `.env` localhost note; canonical script names |
| `eslint.config` | `no-restricted-imports` guard for `config/env` in domain/application |

---

## 11. Slice order (design-level; `sdd-tasks` locks the split)

0. `env.ts` + schema + `superRefine` + `loadEnv` + `env.spec.ts` + `zod` dep + export
   `SUPABASE_HOST_PATTERN`. Self-contained, no DB, no behavior change.
1. `create-prisma-client(env)` + spec migration (uses `resolveConnectionString`).
2. `createApiKeyMiddleware` factory + spec migration.
3. `cookie.ts` `secure` param + `auth.routes.ts` call sites + spec migration.
4. `crear-auth(prisma, env)` + delete `readRateLimitConfigFromEnv` + spec cleanup.
5. `container.ts` + `app.ts` + `server.ts` wiring + `app.*.spec.ts` migration + `buildTestEnv`.
6. `.env.example` emitter + CI `--check` + regenerated `.env.example`.
7. Local-Postgres provisioning (docs + `db:up`/`db:down` + script fold) + `render.yaml` + ESLint guard.

---

## 12. Risks & assumptions

- **Spec migration is the top delivery risk** (mitigated by `buildTestEnv` + strict slice
  order; coverage relocated to `env.spec.ts`, not dropped).
- **Dev workflow break:** `development ⇒ localhost` fail-fast means a personal `.env`
  pointing at Supabase stops booting until local Postgres is provisioned (§8 lands in the
  same change; migration note required).
- **Zod `.meta()` vs `.describe()` reader** for the emitter — the one unverified API
  detail (§6); resolve at implementation against installed `zod@4.4.3`. Low blast radius
  (emitter only).
- **Assumption:** Vitest continues to set `NODE_ENV=test` automatically (confirmed in
  exploration), so `test`-env refinement fires in test runs without extra setup.
- **`z.string().min(1)` (not `.url()`) for DB URLs** — avoids any risk of `.url()`
  rejecting the `postgresql://` scheme; host validity is enforced by the `superRefine`
  localhost/Supabase rules, which is where it matters.
```
