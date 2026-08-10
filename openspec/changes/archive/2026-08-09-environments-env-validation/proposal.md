# Proposal — environments-env-validation: first-class NODE_ENV + Zod-validated, injected config on `apps/api`

> **Closure note (2026-08-09).** COMPLETED — task 7.6 (one-off manual local e2e/int run, blocked at the time by a local port conflict) checked off retroactively: the goal is permanently covered by CI's ephemeral-Postgres integration job since PR #149.
> Remaining unchecked boxes (if any) were ticked retroactively against this evidence when the change was archived.

Give MoneyDiary's backend (`apps/api`) a **single, first-class notion of "which environment am I in"** and a **fail-fast, typed, schema-validated environment config** that is loaded **once at boot** and **injected via DI** — replacing today's scattered, ad-hoc `process.env` reads spread across 5+ files, each with its own parsing and its own (inconsistent) validation. This implements **ADR-029 (DECIDED)**. Scope is **only `apps/api`**; web/mobile stay policy-only.

The environment is governed by a single `NODE_ENV ∈ {development, test, production}` — no parallel `APP_ENV`. Config is validated with **Zod (`^4.4.3`)** in a net-new `apps/api/src/config/env.ts` (infrastructure layer), exposed as a **function** `loadEnv(source = process.env): Env` that parses once, fails fast on a bad/missing var, and returns a typed, immutable object threaded down through the composition root. `.env.example` stops being a hand-maintained file and becomes a **derived artifact** emitted from the schema, guarded by a CI divergence check.

## Why now / intent

- **No first-class environment today.** "Which environment am I in?" is answered ad-hoc: `cookie.ts` reads `NODE_ENV === 'production'`, `db-safety.ts` sniffs connection-string hosts with a regex, other modules never consult the environment at all. There is no single source of truth, so per-environment rules (cookie security, DB host, destructive-op prohibition) are enforced inconsistently — or not at all.
- **Scattered, duplicated, inconsistent env parsing.** The exploration inventoried **8 `process.env` read points**. Some throw on bad input (`create-prisma-client.ts`, `login-rate-limiter.ts`'s manual finite/positive loop), some silently accept garbage (`server.ts`'s `PORT`, never schema-covered), and the connection-string fallback `DIRECT_URL ?? DATABASE_URL` is **duplicated 3×**. Each read point re-invents validation. This violates DRY and leaves gaps.
- **Late, per-request runtime failures instead of one boot-time gate.** `api-key.middleware.ts` reads and length-checks `API_KEY` **on every request** (500 per-request), not once at boot. A misconfigured server today can start "successfully" and only reveal the problem when a specific code path runs — the opposite of fail-fast. ADR-029's goal is a **single validation at boot**: if config is wrong, the process refuses to start, loudly, before serving a single request.
- **The architecture already earned this (ADR-005).** `env.ts` belongs in `infrastructure/`; `domain`/`application` never import it. Values are injected from `composition/container.ts` / `server.ts`, exactly as every other adapter is wired — no new pattern, just closing an env-shaped hole in the existing DI graph.
- **Unblocks the ADR-028 e2e/int debt.** A strict `development ⇒ localhost` / `test ⇒ localhost` DB rule is only safe (and honest) if the local disposable Postgres actually exists. Formalizing that provisioning — sketched but unprovisioned in `docs/local-test-db.md` — is in scope here, and it's the same local DB the blocked e2e/int suites need.

## What this change delivers

1. **`apps/api/src/config/env.ts`** (net-new, infrastructure): a flat Zod schema + `superRefine`, and `loadEnv(source = process.env): Env` exported as a **function** (never a top-level `Schema.parse(process.env)` at import — that would break unit specs that mutate `process.env`). Returns a typed, immutable `Env`.
2. **DI threading from boot**: `server.ts` calls `loadEnv()` once, then threads `env` into `createPrismaClient(env)`, `crearAuth(prisma, env)`, and `createApp(container, env)` (or bakes env-derived values like `cookieSecure` into the `Container`).
3. **Refactor of the 5 in-scope read points** to receive injected config instead of reading `process.env` themselves.
4. **Derived `.env.example`**: an `env:example` script that emits the file from the schema's `.describe()`/`.meta()` metadata, plus a **CI check** that regenerates into a temp file and fails on divergence from the committed one.
5. **Local disposable Postgres provisioning** (docker-compose / brew), formalized from `docs/local-test-db.md`, so the API boots in `development` and `test` against `localhost` without Supabase.
6. **`render.yaml` sets `NODE_ENV=production` explicitly** — ADR-029 §Consequences calls this out; do not rely on Render's implicit `NODE_ENV`.

## In scope

### Config — `apps/api/src/config/env.ts` (net-new, infrastructure)
- **Flat Zod schema + `superRefine`** (NOT a discriminated union of 3 env-specific schemas). The three environments share ~95% of fields with different *constraints*, not different *shapes*; a union would triplicate declarations for no structural gain (KISS/YAGNI). `superRefine` cleanly expresses per-environment rules:
  - `production ⇒` `COOKIE_SECURE` must be `true`, DB host must be Supabase/prod, `ALLOW_DESTRUCTIVE_DB` **forbidden**.
  - `development ⇒` DB host must be `localhost` (**strict, fail-fast** — user decision).
  - `test ⇒` DB host must be `localhost` (**strict, fail-fast** — user decision).
- **`COOKIE_SECURE` uses `z.enum(['true','false']).transform(v => v === 'true')`**, NOT `z.coerce.boolean()` (which mis-parses the string `"false"` as `true` — a well-known Zod footgun).
- **`loadEnv(source = process.env): Env` as a function** — validates once, fail-fast, returns a typed immutable object. Consumers get one flat `Env` type everywhere.
- `.describe()`/`.meta()` metadata on each field feeds the `.env.example` emitter.

### The 5 in-scope `process.env` read points → DI
- **`create-prisma-client.ts`**: `createPrismaClient(env: Pick<Env, 'DATABASE_URL' | 'DIRECT_URL'>)` replaces the internal read. Extract the `DIRECT_URL ?? DATABASE_URL` resolution as a small shared helper (removes duplication).
- **`cookie.ts`**: thread a `secure: boolean` (computed once from `env`) through `serializeSessionCookie`/`clearSessionCookie` — DI shape (parameter vs small injected serializer class) is a **design-phase decision**; KISS favors the parameter.
- **`login-rate-limiter.ts`**: its ad-hoc `Number(...)` + manual finite/positive validation loop becomes **redundant once Zod validates `LOGIN_RATELIMIT_MAX_EMAIL/IP/WINDOW_MS`** as positive finite numbers. **Delete the loop** (DRY); `crearAuth` builds `RateLimitConfig` directly from `env.LOGIN_RATELIMIT_*`.
- **`api-key.middleware.ts`**: convert the top-level singleton into a **factory** `createApiKeyMiddleware(apiKey: string): RequestHandler`, called once in `app.ts` (`app.use('/api', createApiKeyMiddleware(env.API_KEY))`). Kills the per-request read/length-check.
- **`server.ts`**: `PORT` comes from the validated `env` (schema-covered for the first time).

### `.env.example` emitter + CI check
- `env:example` script (`tsx`/`ts-node` one-off) iterates the schema and emits `KEY=` / `KEY=<default>` plus a comment from field metadata. No new dependency beyond Zod.
- CI check regenerates and diffs against the committed `.env.example`; **fails on divergence**. Closes the current documentation gap (`.env.example` is missing `NODE_ENV`, `ALLOW_DESTRUCTIVE_DB`, `SEED_USER_EMAIL`, `SEED_USER_PASSWORD`, `CONFIRM_PROD_BACKFILL`).

### Local disposable Postgres provisioning
- Formalize the docker-compose / brew tooling sketched in `apps/api/docs/local-test-db.md` so `development` and `test` boot against `localhost`. Unblocks the ADR-028 e2e/int debt (same local DB).

### Infra file
- `render.yaml` adds `NODE_ENV: production`.

### Dependency
- Add **`zod` `^4.4.3`** to `apps/api`. Clears repo security policy: ~3 months old (> `minimum-release-age=10080` = 7 days), **zero runtime deps** (satisfies `block-exotic-subdeps=true`), no high/critical advisories (`audit-level=high`).

### Tests (Vitest — ADR-016; Strict TDD active for `apps/api`, `pnpm api test`)
- New unit specs for `env.ts` (`loadEnv` happy path + each `superRefine` rejection per environment + the `COOKIE_SECURE="false"` parsing case).
- **Migrate the existing specs** of the 5 read points from mutating `process.env` to passing injected values as parameters/constructor args (`cookie.spec.ts`, `login-rate-limiter.spec.ts`, `api-key.middleware.spec.ts`, `create-prisma-client.spec.ts`, plus HTTP-level `app.*.spec.ts` that set `process.env.API_KEY`). This is a real, non-trivial migration surface — `sdd-tasks` must size it.

## Explicitly NOT in scope (non-goals)

- **web / mobile** — policy-only per ADR-029; no code changes to `apps/web` or `apps/mobile`.
- **The destructive-op prohibition beyond API boot.** `production ⇒ ALLOW_DESTRUCTIVE_DB forbidden` applies **only to the API server boot** via the schema. Standalone supervised scripts (`prisma/backfill-categorias.ts`, `prisma/seed.ts`) do **NOT** call `loadEnv()` — they keep the existing `db-safety.ts` runtime guard + their explicit ack (`CONFIRM_PROD_BACKFILL`). The documented supervised-backfill capability survives unchanged (user decision).
- **Replacing `db-safety.ts`.** It stays as a **second, runtime layer of defense** (belt-and-suspenders). Schema rules make bad configs un-bootable; `db-safety.ts` still guards call-time connection strings. Reconciliation limit: at most, let its default lookup accept an injected `env` — but the independent heuristic check is preserved, not deleted.
- **The 3 out-of-boot-path read points** (`db-safety.ts` by design, `prisma/backfill-categorias.ts`, `prisma/seed.ts`) — they keep reading `process.env` directly; they are not part of the API boot DI graph.
- **New env vars or new features.** Pure config-hardening + DI refactor; no behavior change to endpoints.
- **Discriminated-union type-level guarantees.** Flat schema means `Env`'s TS type cannot statically prove "prod ⇒ COOKIE_SECURE true" — enforced at boot via `superRefine`, which is the actual goal (fail fast, not compile-time narrowing). Accepted tradeoff (KISS).

## Approach (high level — full design is the next phase)

- **Boot → DI path:** `server.ts` → `const env = loadEnv()` (once, before anything) → `createContainer(prisma?, env)` → `createPrismaClient(env)`, `crearAuth(prisma, env)`, `createApp(container, env)`. Env-derived scalars (e.g. `cookieSecure`, `apiKey`, rate-limit config, `port`) are computed once and passed down; nothing downstream re-reads `process.env`.
- **`loadEnv` is a function, not a module-level constant.** This protects the unit suite (`vitest.config.ts` has no `setupFiles`/dotenv; most required vars are absent there and specs mutate `process.env` ad-hoc). Import-time parsing would break dozens of unrelated pure-domain unit tests. `domain`/`application` must never import `config/env.ts` (ADR-005) — enforce as an ESLint/review checkpoint.
- **Flat schema + `superRefine`** for per-environment constraints; avoids the known `discriminatedUnion`+`superRefine` ergonomic friction upstream (colinhacks/zod #3720, #3830).
- **`CONFIRM_PROD_BACKFILL`** as a single named optional field (`z.string().optional()`) if the schema references it at all — but per the non-goal above, the backfill script keeps its own path; design confirms whether the field even belongs in `loadEnv`'s schema.

## First-slice boundary

**Slice 0 — `env.ts` + schema + `loadEnv` + its unit specs (TDD), plus the `zod` dependency.** Nothing wires until the schema and typed `Env` exist. This slice is self-contained, touches no existing behavior, and is fully unit-testable without a database. Subsequent slices refactor the read points one reviewable unit at a time (create-prisma-client → api-key factory → cookie → rate-limiter delete), then the `.env.example` emitter + CI check, then local-Postgres provisioning + `render.yaml`. `sdd-tasks` locks the split and sizes the spec-migration surface.

## Risks & open design questions (hand-off to `sdd-spec` / `sdd-design`)

| Item | Risk / question |
|------|-----------------|
| **Breaking 5+ unit specs** | The read-point specs currently mutate `process.env` directly. Migrating them to injected parameters is a real, non-trivial surface (Strict TDD: tests move first). Under-sizing this is the top delivery risk. |
| **Dev workflow change** | `development ⇒ localhost` is **fail-fast**: if the developer's personal `.env` points at Supabase prod today (plausible — no separate dev Supabase exists per CLAUDE.md/ADR-002/ADR-023), `pnpm api start` will **refuse to boot** until they migrate to the local Postgres. Provisioning that DB is in scope and must land in the same change, plus a migration note. |
| **`render.yaml` needs explicit `NODE_ENV=production`** | Infra file outside `apps/api/src`. Without it, `production` rules never fire in prod. Must be a task. |
| **`import`-time vs boot-time parsing** | If any module in a unit spec's import graph eagerly parses `process.env`, unrelated tests break. `loadEnv`-as-function is the mitigation; ESLint/review guard that `domain`/`application` never import `env.ts`. |
| **`COOKIE_SECURE` coercion footgun** | `z.coerce.boolean()` treats `"false"` as `true`. Must use `z.enum(['true','false']).transform(...)`. Design/tasks must not regress this. |
| **`test:e2e`/`test:integration` (non-`:local`) fate** | With `test ⇒ localhost` schema-enforced, the non-`:local` scripts (which load default `.env`, possibly Supabase) will fail fast at boot instead of at `db-safety` runtime — same blocked outcome. Design decides: deprecate them in favor of always-`:local`, or keep as an intentionally-blocked safety net. |
| **Cookie DI shape** | Parameter-threading (KISS, more call-site churn) vs a small injected `SessionCookieSerializer` (uniform with class-based DI). Design picks one. |

## Next step
Run `sdd-spec` and `sdd-design` (parallel) against this proposal, then `sdd-tasks`. Begin implementation at **Slice 0 (`env.ts` + schema + `loadEnv` + specs + `zod` dep)** — nothing else wires without it.
