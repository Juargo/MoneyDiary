# Environment Config Specification (apps/api)

## Purpose

Defines the fail-fast, typed, boot-time environment validation contract for `apps/api` (ADR-029): a single `NODE_ENV` domain, a Zod-validated `Env` loaded once via `loadEnv()`, and the injected read points that consume it. Net-new capability — no prior spec exists for this domain.

## Requirements

### Requirement: ENV-01 — `loadEnv` is a fail-fast function, never partial

The system MUST expose `loadEnv(source = process.env): Env` as a function — never a module-level `Schema.parse(process.env)` executed at import time. Given a valid source for the resolved `NODE_ENV`, it MUST return a typed, immutable `Env`. Given any missing or malformed required variable, it MUST throw synchronously and MUST NOT return a partially-valid `Env`.

#### Scenario: Valid development env returns a typed Env

- GIVEN `process.env` has all required vars valid for `NODE_ENV=development`
- WHEN `loadEnv(process.env)` is called
- THEN it returns an immutable `Env` object with correctly typed fields

#### Scenario: Missing required var throws before boot completes

- GIVEN a required var (e.g. `API_KEY`) is absent from the source
- WHEN `loadEnv(source)` is called
- THEN it throws synchronously
- AND no `Env` object is returned

#### Scenario: Malformed var throws

- GIVEN `PORT` in the source is a non-numeric string
- WHEN `loadEnv(source)` is called
- THEN it throws synchronously

### Requirement: ENV-02 — production `superRefine` rules

`NODE_ENV=production` MUST require `COOKIE_SECURE=true`, MUST require the resolved DB host to be a Supabase host, and MUST forbid `ALLOW_DESTRUCTIVE_DB` being set.

#### Scenario: Production with COOKIE_SECURE=false is rejected

- GIVEN `NODE_ENV=production` and `COOKIE_SECURE=false`
- WHEN `loadEnv(source)` is called
- THEN it throws

#### Scenario: Production with a non-Supabase DB host is rejected

- GIVEN `NODE_ENV=production` and `DATABASE_URL`/`DIRECT_URL` pointing at `localhost`
- WHEN `loadEnv(source)` is called
- THEN it throws

#### Scenario: Production with ALLOW_DESTRUCTIVE_DB set is rejected

- GIVEN `NODE_ENV=production` and `ALLOW_DESTRUCTIVE_DB=1`
- WHEN `loadEnv(source)` is called
- THEN it throws

#### Scenario: Production with all constraints satisfied succeeds

- GIVEN `NODE_ENV=production`, `COOKIE_SECURE=true`, a Supabase DB host, and no `ALLOW_DESTRUCTIVE_DB`
- WHEN `loadEnv(source)` is called
- THEN it returns a valid `Env`

### Requirement: ENV-03 — development DB host is strict-localhost

`NODE_ENV=development` MUST require the resolved DB host to be `localhost`; any other host MUST fail fast (no warning-only mode).

#### Scenario: Development with a localhost DB succeeds

- GIVEN `NODE_ENV=development` and a `localhost` `DATABASE_URL`
- WHEN `loadEnv(source)` is called
- THEN it returns a valid `Env`

#### Scenario: Development pointing at Supabase/prod is rejected

- GIVEN `NODE_ENV=development` and a non-`localhost` `DATABASE_URL` (e.g. Supabase)
- WHEN `loadEnv(source)` is called
- THEN it throws — the process MUST refuse to boot

### Requirement: ENV-04 — test DB host is strict-localhost

`NODE_ENV=test` MUST require the resolved DB host to be `localhost`, with the same fail-fast behavior as ENV-03.

#### Scenario: Test with a localhost DB succeeds

- GIVEN `NODE_ENV=test` and a `localhost` `DATABASE_URL`
- WHEN `loadEnv(source)` is called
- THEN it returns a valid `Env`

#### Scenario: Test pointing at a non-localhost DB is rejected

- GIVEN `NODE_ENV=test` and a non-`localhost` `DATABASE_URL`
- WHEN `loadEnv(source)` is called
- THEN it throws

### Requirement: ENV-05 — `COOKIE_SECURE` parses via enum, not coercion

`COOKIE_SECURE` MUST be parsed with `z.enum(['true','false']).transform(...)`. It MUST NOT use `z.coerce.boolean()`, which mis-parses the string `"false"` as `true`.

#### Scenario: "false" parses to boolean false

- GIVEN `COOKIE_SECURE="false"` in the source
- WHEN `loadEnv(source)` is called
- THEN `env.COOKIE_SECURE === false`

#### Scenario: "true" parses to boolean true

- GIVEN `COOKIE_SECURE="true"` in the source
- WHEN `loadEnv(source)` is called
- THEN `env.COOKIE_SECURE === true`

#### Scenario: Invalid value throws

- GIVEN `COOKIE_SECURE="yes"` in the source
- WHEN `loadEnv(source)` is called
- THEN it throws

### Requirement: ENV-06 — DI read points preserve prior observable behavior

The 5 in-scope read points (cookie Secure flag, API key middleware, rate-limit config, Prisma connection resolution, `PORT`) MUST receive their values via injection from `Env` instead of reading `process.env` directly, and MUST preserve their pre-refactor observable behavior. Per ADR-015, the API key rejection behavior (fail-closed) MUST be unchanged.

#### Scenario: Cookie Secure flag matches the environment

- GIVEN an injected `env.COOKIE_SECURE` value
- WHEN a session cookie is serialized
- THEN the cookie's `Secure` attribute equals the injected value

#### Scenario: API key middleware remains fail-closed after the factory refactor

- GIVEN `createApiKeyMiddleware(env.API_KEY)` mounted on `/api`
- WHEN a request arrives with no `x-api-key` header
- THEN the response status is 401
- AND WHEN a request arrives with `x-api-key` equal to `env.API_KEY`
- THEN the response status is not 401

#### Scenario: Rate-limit config comes from validated env, no ad-hoc loop

- GIVEN `env.LOGIN_RATELIMIT_MAX_EMAIL/IP/WINDOW_MS`
- WHEN `crearAuth` builds `RateLimitConfig`
- THEN the values match the validated env numbers
- AND no manual finite/positive validation loop runs

#### Scenario: Prisma client resolves the connection string once

- GIVEN `env.DIRECT_URL` and `env.DATABASE_URL`
- WHEN `createPrismaClient(env)` is called
- THEN it uses `DIRECT_URL ?? DATABASE_URL` via a single shared resolution (no duplication)

#### Scenario: Server PORT comes from validated env

- GIVEN a validated `env.PORT`
- WHEN `server.ts` starts listening
- THEN it binds to `env.PORT`, not an unchecked `process.env.PORT`

### Requirement: ENV-07 — `.env.example` is derived and CI-guarded

`.env.example` MUST be generated by an `env:example` script from the schema's `.describe()`/`.meta()` metadata, and CI MUST fail when the committed file diverges from a freshly regenerated one. The regenerated file MUST include vars currently missing from the committed file (`NODE_ENV`, `ALLOW_DESTRUCTIVE_DB`, `SEED_USER_EMAIL`, `SEED_USER_PASSWORD`, `CONFIRM_PROD_BACKFILL`).

#### Scenario: Regenerated file matches the committed file

- GIVEN the schema and the committed `.env.example` are in sync
- WHEN CI regenerates `.env.example` into a temp file and diffs it
- THEN the check passes

#### Scenario: Divergence fails CI

- GIVEN the schema changed but `.env.example` was not regenerated
- WHEN CI runs the divergence check
- THEN the build fails

#### Scenario: Previously-missing vars are now documented

- GIVEN the regenerated `.env.example`
- WHEN it is inspected
- THEN it includes `NODE_ENV`, `ALLOW_DESTRUCTIVE_DB`, `SEED_USER_EMAIL`, `SEED_USER_PASSWORD`, and `CONFIRM_PROD_BACKFILL`

## Out of Scope (Non-Goals)

- **web / mobile**: policy-only; no code changes outside `apps/api`.
- **Destructive-op prohibition beyond API boot**: `db-safety.ts` is NOT replaced — it remains the second, runtime layer of defense. `prisma/backfill-categorias.ts` and `prisma/seed.ts` do NOT call `loadEnv()` and keep reading `process.env` directly with their existing guard/ack (`CONFIRM_PROD_BACKFILL`).
- **New env vars or new features**: this is config-hardening + DI only; no endpoint behavior changes beyond what ENV-06 guarantees is preserved.
- **Discriminated-union type-level guarantees**: `Env`'s TS type cannot statically prove per-environment invariants; they are enforced only at boot via `superRefine` (accepted KISS tradeoff).
