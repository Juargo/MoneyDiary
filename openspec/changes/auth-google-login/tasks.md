# Tasks — auth-google-login (web scope only)

**Scope guard:** this checklist covers the **web** delivery only (design §12 slices A, B, C1, C2, D). Mobile (M1 native token exchange) is explicitly out of scope here — it ships as a separate future change `auth-google-login-mobile` (ADR-035, design §9). `MOB-05` is listed for traceability only; no mobile implementation task exists in this file.

**Strict TDD is active.** Test runner: `pnpm api test` (vitest, unit) / `pnpm api test:integration` (vitest, real Postgres via `apps/api/docs/local-test-db.md`, gated by `ALLOW_DESTRUCTIVE_DB=1`) / `pnpm web test` (vitest + Testing Library). Every implementation task is preceded by a failing-test task for the same behavior — write the test, watch it fail, then implement. `pnpm api exec tsc --noEmit` must be green before closing each slice.

**Clean Architecture order inside each backend slice:** domain → application → infrastructure (ADR-005). Spanish naming in domain/application, English naming in infrastructure. `Result<T,E>` everywhere in domain/application — never throw.

**Chain strategy:** five chained PRs, `A → B → C1 → C2 → D`, one work unit per PR, Conventional Commit work-unit commits inside each PR (work-unit-commits skill). Chain-strategy choice (stacked-to-main vs feature-branch-chain) is not yet cached — see "Dependencies & PR chain" below; the orchestrator must ask before `sdd-apply` starts Slice A.

---

## Prerequisites / out-of-band (block Slice C2, not A/B/C1)

- [ ] **P1.** Google Cloud Console: create/confirm an OAuth 2.0 Web Client, register `redirect_uri` for local (`http://localhost:5173/api/auth/google/callback`) and prod (`https://app.moneydiary.cl/api/auth/google/callback`). Owner: human operator, not `sdd-apply`.
- [ ] **P2.** Render dashboard: add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` as `sync:false` secrets (mirrors `API_KEY`/`DATABASE_URL` convention in `CLAUDE.md`). Do NOT set them until Slice C2 is ready to merge — before that, absence is the desired "feature off" state end to end.
- [ ] **P3.** Confirm `openid-client` v6 target release is **older than 7 days** (`.npmrc` `minimum-release-age=10080`): run `npm view openid-client time` before starting Slice B. Blocks the Slice B install step, not earlier work.
- [ ] **P4.** Flag for `sdd-verify`: `openspec/changes/auth-login-session` is **unarchived** — `AUTH-01/02/05/06`, `AC-07`, `MOB-01/02` are baseline anchors verified against live code this session (design.md "Baseline caveat") but not yet part of the permanent archived baseline. Verify does not block apply; note it in the verify report.
- [ ] **P5.** Flag for a possible immediate, independent fix PR (design §6.3(b)): confirm whether `pino-http`'s default `res` serializer is emitting `headers` (including `Set-Cookie`) today for `POST /api/auth/login` and `GET /api/auth/demo`. If confirmed, this is a **pre-existing** production log leak of live session tokens, unrelated to this change's own scope, and should be triaged separately from this chain (Slice C1 closes it for the Google path regardless — see A1/C1 below).

---

## Slice A — Application core (PR #1, targets `main` or tracker)

**Spec coverage:** AUTH-14 (identity resolution algorithm), AUTH-13 (session issuance parity, port-level), AUTH-18 (no token persistence, port shape). **Design refs:** §1 layer map, §4.1 ports, §5 (D4) placement/algorithm/concurrency/ADR-013 pipeline.
**Independently shippable:** yes — inert, nothing in the composition root constructs it yet.

### Domain

- [x] **A1.** Write failing unit test for `LoginConGoogleFallidoError` (`apps/api/src/domain/errors/login-con-google-fallido.error.spec.ts`): fixed `message`, `motivo` is one of the six enum values (`'sin-match' | 'email-no-verificado' | 'usuario-demo' | 'ya-vinculado-a-otra-identidad' | 'link-perdio-la-carrera' | 'email-invalido'`), message is identical across all six motivos.
- [x] **A2.** Implement `apps/api/src/domain/errors/login-con-google-fallido.error.ts` per design §6.1. Run A1 green.

### Application — ports

- [x] **A3.** Write failing type-level/contract tests (or a minimal double + compile check) for `apps/api/src/application/ports/verificador-identidad-externa.port.ts`: `InicioAutorizacion`, `IdentidadExterna`, `ParametrosCallback`, `IIniciadorLoginExterno`, `IVerificadorIdentidadExterna` — both interfaces return `Result<T, VerificacionIdentidadFallidaError>` (confirm/create `VerificacionIdentidadFallidaError` alongside if not already present from a prior auth change).
- [x] **A4.** Implement `verificador-identidad-externa.port.ts` per design §4.1. Two role interfaces in one file, per ISP rationale — do not merge into one interface.
- [x] **A5.** Write failing unit tests for `apps/api/src/application/ports/identidad-google-repository.port.ts` shape (`UsuarioVinculable`, `IIdentidadGoogleRepository` with `buscarPorGoogleSub`, `buscarPorEmail`, `vincularGoogleSub`) — test via a hand-written double used later by A7.
- [x] **A6.** Implement `identidad-google-repository.port.ts` per design §5.2. Confirm `IUserCredentialRepository` is **not** modified (grep the diff before committing — this is a hard constraint from design §5.2).

### Application — use case

- [x] **A7.** Write failing unit tests for `apps/api/src/application/use-cases/login-con-google.use-case.spec.ts` with port doubles (`IVerificadorIdentidadExterna` double + `IIdentidadGoogleRepository` double + session collaborators double), covering every branch in design §5.3/§11.2:
  - existing `googleSub` match, non-demo → session issued, no email lookup performed (assert repo double's `buscarPorEmail` never called)
  - existing `googleSub` match, demo user → generic failure, no session
  - first-time link, `emailVerificado: true`, unmatched user found → `vincularGoogleSub` called, session issued
  - `emailVerificado: false` → generic failure, **`buscarPorEmail` never called** (assert not called)
  - no match anywhere → generic failure, no user created (nothing to assert-create since use case never calls a create method — assert the double has no create method invoked)
  - demo match via email path → generic failure, no link
  - **★ email match already linked to a different `googleSub`** → generic failure, no overwrite, `vincularGoogleSub` never called
  - `vincularGoogleSub` returns `false` (race lost) → generic failure
  - every failure branch produces the **identical** `LoginConGoogleFallidoError.message`
  - session issuance shape matches `LoginUseCase`: opaque token + SHA-256 hash + `expiresAt` = now + 7 days (reuse the same `IReloj`/token-service/session-repository ports the password `LoginUseCase` uses — do not introduce parallel ports)
- [x] **A8.** Implement `apps/api/src/application/use-cases/login-con-google.use-case.ts` per design §5.1/§5.3/§5.4/§5.5. No explicit transaction (design §5.1 rationale — do not add one). Uses `Email.crear` only when a lookup is about to happen; a malformed Google email is a generic failure (`motivo: 'email-invalido'`), never `EmailInvalidoError` surfaced raw. Run A7 green.

### Infrastructure — persistence (contract only, real impl deferred to Slice B)

- [x] **A9.** Prisma schema delta: add `googleSub String? @unique` to `User` model in `apps/api/prisma/schema.prisma`.
- [x] **A10.** Generate the additive migration (`pnpm api exec prisma migrate dev --name add_user_google_sub` or CI-equivalent). Confirm it is additive-only: `ALTER TABLE "User" ADD COLUMN "googleSub" TEXT` + unique index, no data rewrite, no backfill. Verify existing rows get `NULL`.

### Slice close-out

- [x] **A11.** `pnpm api test` green. `pnpm api exec tsc --noEmit` green.
- [x] **A12.** Confirm nothing in `domain/` or `application/` imports `openid-client`, Express, or Prisma directly (grep check, design §1 invariant).
- [ ] **A13.** Open PR #1 (chained-pr skill: state start/finish/rollback in the PR body; dependency diagram with 📍 on this PR). Rollback: revert PR, column becomes inert (nothing reads it yet). — **deferred**: apply phase stops after the last commit per orchestrator instructions; PR creation happens after the 4R review gate.

**Verified by:** unit tests + `prisma migrate` dry-run/apply in CI's integration job.
**Rollback:** revert PR; `googleSub` column becomes inert (nothing reads it).

---

## Slice B — Adapters + env (PR #2, targets Slice A's branch/PR)

**Spec coverage:** AUTH-12 (id_token cryptographic validation), AUTH-18 (token discard), AUTH-16 (activation-gate env shape, partial — full gate lands in C1). **Design refs:** §4.2 (adapter + lazy discovery), §5.5 (blind-index pipeline reuse), §8 (D7 env schema).
**Depends on:** Slice A merged (uses `IVerificadorIdentidadExterna`/`IIdentidadGoogleRepository` ports and `LoginConGoogleFallidoError`... actually adapter does not depend on the use case; the repository impl depends on A6's port).
**Independently shippable:** yes — no HTTP surface yet, nothing in `container.ts` wires it.

- [ ] **B1.** Blocking check: confirm P3 (openid-client release age > 7 days) before running install.
- [ ] **B2.** Add `openid-client` v6 as a dependency of `apps/api` (`pnpm --filter @moneydiary/api add openid-client`). Confirm `pnpm-lock.yaml` updates cleanly and `pnpm audit --audit-level=high` stays green.

### Infrastructure — OIDC adapter

- [ ] **B3.** Write failing unit tests for `apps/api/src/infrastructure/oidc/openid-client-google.adapter.spec.ts` with a stubbed `openid-client` discovery/`Configuration`:
  - `iniciar()` returns `InicioAutorizacion` with `state`/`nonce`/`codeVerifier`/`urlAutorizacion` populated
  - `verificar()` maps claims to `IdentidadExterna` (`sub`, `email`, `emailVerificado`) correctly
  - adapter **never throws** across the port boundary — wrap `openid-client` exceptions into `Result.fail`
  - discovery failure → `Result.fail`, memo cleared on rejection so a subsequent call retries (assert discovery is re-attempted, not permanently poisoned)
  - `access_token`/`refresh_token` never appear in the returned `IdentidadExterna` shape (AUTH-18 port-level guarantee)
  - fail-closed coalescing of optional claims: `email ?? null`, `email_verified ?? false` — a **missing** `email_verified` claim (not merely `undefined` read via JS truthiness, but the explicit coalesce) MUST resolve to `false`, asserted against a stubbed claim set that omits the key entirely (4R carry-forward)
- [ ] **B4.** Implement `apps/api/src/infrastructure/oidc/openid-client-google.adapter.ts` — `OpenIdClientGoogleAdapter implements IIniciadorLoginExterno, IVerificadorIdentidadExterna`, lazy memoised discovery per design §4.2. This is the **only** file in the repo importing `openid-client`. Run B3 green.

### Infrastructure — persistence (real implementation)

- [ ] **B5.** Write failing integration tests (`pnpm api test:integration`, real Postgres) for `apps/api/src/infrastructure/persistence/prisma-identidad-google.repository.spec.ts` per design §11.3:
  - `buscarPorGoogleSub` finds a linked user
  - `buscarPorEmail` finds by `emailBlindIndex`, proving the blind index computed here matches the one the existing login path writes (reuse the same `HmacBlindIndexService` instance/derivation — do not re-derive)
  - `vincularGoogleSub` writes once, returns `true`; second call on an already-linked row returns `false`, does **not** overwrite
  - a `P2002` unique-constraint collision (simulated concurrent link) returns `false` rather than throwing
  - **both race paths proven in the same test suite, neither ever throws across the port:** the `updateMany` count===0 path (loser of the conditional update) AND the caught `P2002` path (TOCTOU collision) both resolve to `vincularGoogleSub` returning `false` — assert this explicitly rather than relying on only one of the two being exercised (4R carry-forward, design §5.4)
  - demo rows surface with `esDemo: true`
  - the adapter uses the **container's single shared `HmacBlindIndexService` instance** to compute `emailBlindIndex` — assert reference/derivation equality against the same instance `PrismaUserCredentialRepository` uses (not a freshly re-derived key), since a differently-derived key silently breaks linking with no error (4R carry-forward, design §5.5)
- [ ] **B6.** Implement `apps/api/src/infrastructure/persistence/prisma-identidad-google.repository.ts` implementing `IIdentidadGoogleRepository` per design §5.2/§5.4/§5.5. `vincularGoogleSub` uses the conditional `updateMany({ where: { id, googleSub: null } })` pattern (design §5.4), catches `P2002` and returns `false`. Run B5 green (requires local Postgres — see `apps/api/docs/local-test-db.md`, `ALLOW_DESTRUCTIVE_DB=1`).

### Config — env schema (ADR-029)

- [ ] **B7.** Write failing unit tests for `apps/api/src/config/env.spec.ts` additions:
  - both `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` present → schema accepts
  - neither present → schema accepts (feature off)
  - **exactly one present → boot fails** (all-or-nothing `superRefine` rule)
  - both present, `GOOGLE_REDIRECT_URI` absent, `NODE_ENV=production` → boot fails
  - both present, `GOOGLE_REDIRECT_URI` absent, `NODE_ENV=development|test` → defaults to `http://localhost:5173/api/auth/google/callback`
  - `GOOGLE_REDIRECT_URI` present but `pathname !== '/api/auth/google/callback'` → boot fails with a message naming both the configured and expected pathname (design §8 boot-time assertion)
  - `GOOGLE_REDIRECT_URI` non-`https` in production → boot fails
- [ ] **B8.** Implement the three-key addition to `apps/api/src/config/env.ts` per design §8: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` optional strings, `GOOGLE_REDIRECT_URI` optional URL with the `refineByEnvironment` all-or-nothing rule + pathname assertion + env-conditional default. Run B7 green.
- [ ] **B9.** Regenerate `.env.example` (`pnpm api env:example`) and confirm the CI check that diffs it against the schema stays green. Add `.describe(...)` text for all three keys.

### Slice close-out

- [ ] **B10.** `pnpm api test` and `pnpm api test:integration` green. `pnpm api exec tsc --noEmit` green.
- [ ] **B11.** Open PR #2 targeting Slice A's branch (feature-branch-chain) or `main` (stacked-to-main) per chosen chain strategy — dependency diagram with 📍 on this PR, prior dependency = PR #1.

**Verified by:** unit + integration tests in CI.
**Rollback:** revert PR; no runtime path reaches the adapters (nothing in composition wires them yet).

---

## Slice C1 — Activation seam (PR #3, targets Slice B's branch/PR)

**Spec coverage:** AUTH-16 (404 when unconfigured — the actual routing behavior), AC-10 (capabilities endpoint contract, full), design's discovered fix for §4.4 (routes-not-mounted ≠ 404 trap), §6.3 log-redaction hardening (independently valuable, ships here regardless of P5 outcome).
**Depends on:** Slice B merged (needs `crearAuthGoogle`'s collaborators + env keys).
**Independently shippable:** yes — ships AUTH-16's 404 contract and the capabilities contract with **zero Google network traffic**.

### Infrastructure — rate limiter rename

- [ ] **C1.1.** Write/adjust failing tests for `apps/api/src/infrastructure/http/auth/ip-rate-limiter.spec.ts` (rename from `demo-rate-limiter.spec.ts`): confirm the key-prefix constructor parameter works for two independently-budgeted instances.
- [ ] **C1.2.** Rename `demo-rate-limiter.ts` → `ip-rate-limiter.ts`, class `DemoRateLimiter` → `IpRateLimiter` with an explicit `keyPrefix` constructor param (mechanical rename per design §6.4 — logic is unchanged, only the name and the added parameter). Update every import site (`crear-auth.ts`, `container.ts`, existing specs). Run C1.1 and the full existing demo-rate-limiter test suite (now under the new name) green.

### Composition — activation seam

- [ ] **C1.3.** Write failing unit tests for `apps/api/src/composition/crear-auth-google.spec.ts`: returns `undefined` when either credential is absent; returns a `GoogleAuthGraph` (`iniciador`, `loginConGoogle`, `googleRateLimiter`) when both are present; internally constructs its own `SystemReloj`/`Sha256SessionTokenService`/`PrismaSessionRepository` instances (assert via double injection or structural check, not global state); receives `blindIndex` as the **same instance** `container.ts` derives (assert reference equality, not a fresh derivation).
- [ ] **C1.4.** Implement `apps/api/src/composition/crear-auth-google.ts` per design §4.3, mirroring `crear-auth.ts`'s pattern verbatim. Wire `container.ts`'s `Container.googleAuth?: GoogleAuthGraph`, constructed by `crearAuthGoogle(prisma, env, blindIndex)` where `blindIndex` is the existing instance already held by `container.ts` (no new HKDF derivation). Run C1.3 green.

### Infrastructure — disabled stub route + capabilities route

- [ ] **C1.5.** Write failing supertest specs (fake-container pattern, design §11.2) asserting: `GET /api/auth/google` and `GET /api/auth/google/callback` return **404** (not 401, not 500) when `container.googleAuth` is `undefined` — this is the regression test for the §4.4 routing trap (unmounted route falling through to `sessionMiddleware` → 401).
- [ ] **C1.6.** Implement `registrarAuthGoogleDeshabilitado(router)` (the disabled-stub route registrar, ~8 lines per design §4.4) in `apps/api/src/infrastructure/http-express/routes/auth-google.routes.ts` (stub half only — the real handlers land in C2). Wire the `app.ts` branch: `container.googleAuth !== undefined ? registrarAuthGoogle(...) : registrarAuthGoogleDeshabilitado(...)` (real `registrarAuthGoogle` is a no-op/placeholder until C2 — confirm C1's stub branch is the only reachable path until then, i.e. do not half-wire the real routes in C1). Run C1.5 green.
- [ ] **C1.7.** Write failing unit test + supertest spec for `GET /api/auth/capabilities`: 401 without `x-api-key` (AC-10); 200 `{ "googleLoginEnabled": true }` when `container.googleAuth` is defined; 200 `{ "googleLoginEnabled": false }` when undefined; session-public (reachable with no session cookie/Bearer, per AC-10).
- [ ] **C1.8.** Implement `apps/api/src/infrastructure/http-express/routes/auth-capabilities.routes.ts` (always mounted, unconditional per design §4.5) + `apps/api/src/infrastructure/http-express/schemas/auth-capabilities.schema.ts` (Zod schema for the response body, following the existing per-schema pattern). Run C1.7 green.

### Infrastructure — log-redaction hardening (design §6.3 a+b)

- [ ] **C1.9.** Write failing unit test for `apps/api/src/infrastructure/http-express/middleware/redactar-query-params-sensibles.spec.ts` (or co-located with `request-logger.middleware.ts`): `code`/`state`/`id_token`/`access_token`/`refresh_token`/`token`/`code_verifier` values redacted to `[REDACTED]`; `periodo`/`anio` and other non-sensitive params untouched; malformed/no-query URLs handled safely.
- [ ] **C1.10.** Implement `redactarQueryParamsSensibles(url: string): string` (pure function, ~20 lines) and wire it as `serializers.req` in `createRequestLoggerMiddleware` (`apps/api/src/infrastructure/http-express/middleware/request-logger.middleware.ts`). Run C1.9 green.
- [ ] **C1.11.** Investigate P5 (whether `res.headers` including `Set-Cookie` is currently logged). Write a failing regression test capturing the NDJSON pino stream for a login/demo response and asserting no token value appears. Add `'res.headers["set-cookie"]'` to `SENSITIVE_REDACT_PATHS` (`apps/api/src/infrastructure/logging/pino-logger.ts`) if the test proves the leak exists. Run the regression test green. **Note in the PR description that this fix is a pre-existing-bug closure, not new-feature scope** — flag to the reviewer per P5.
- [ ] **C1.12.** Write a failing test asserting `errorMiddleware` (`apps/api/src/infrastructure/http-express/middleware/error.middleware.ts`) never serializes `LoginConGoogleFallidoError`'s `motivo` property into any client-facing response body — pass a `LoginConGoogleFallidoError` with each `motivo` value through the middleware and assert the JSON response contains only the generic message, never a `motivo` key or its value. This is an AUTH-15 consistency guard shared with C2 (re-run against the real callback route's error path in C2.3/C2.7, not just this unit-level check) — 4R carry-forward.

### OpenAPI (partial — capabilities only; the two Google routes land in C2)

- [ ] **C1.13.** Register `/api/auth/capabilities` `get` in `apps/api/src/infrastructure/http-express/schemas/openapi-document.ts` (appended at the end of `paths`, never reordering existing entries — design §10 determinism contract). Run `pnpm api openapi:emit` and `openapi:check`.

### Slice close-out

- [ ] **C1.14.** `pnpm api test` and `pnpm api test:integration` green. `pnpm api exec tsc --noEmit` green.
- [ ] **C1.15.** Manual smoke: confirm both Google paths 404 and `/api/auth/capabilities` returns `false` with zero Google credentials configured locally.
- [ ] **C1.16.** Open PR #3, dependency diagram 📍 on this PR, prior dependency = PR #2.

**Verified by:** supertest specs + log regression test in CI.
**Rollback:** revert PR; `/api/auth/google` returns to 401-by-fallthrough (an unreachable state pre-this-change anyway — no client calls it).

---

## Slice C2 — The real endpoints (PR #4, targets Slice C1's branch/PR)

**Spec coverage:** AUTH-11, AUTH-12, AUTH-13, AUTH-15, AUTH-16 (full activation, real handlers), AC-09. **Design refs:** §2 (D1 — SameSite=Strict, no code change, manual gate only), §3 (D2 — transient cookie), §6.1–6.2 (error/redirect), §6.4 (shared rate limiting), §10 (OpenAPI), §11.4 (manual verification — hard gate).
**Depends on:** Slice C1 merged (needs the activation seam and the disabled-stub route to flip into the real one).
**Independently shippable:** yes — backend feature is complete after this slice; web still shows no button (Slice D not yet merged).

**No code changes required for D1 (design §2) — `md_session`/`cookie.ts` are untouched.** Do not create a task for this; it is a decision-not-to-change, verified only by the manual gate below.

### Infrastructure — transient state cookie

- [ ] **C2.1.** Write failing unit tests for `apps/api/src/infrastructure/http/auth/oauth-transient-cookie.spec.ts` per design §3 and §11.2: serialize `{state, nonce, codeVerifier}` to `base64url(JSON.stringify(...))`; exact attribute string (`md_oauth`, `HttpOnly`, `SameSite=Lax`, `Secure` on/off per `cookieSecure`, `Path=/api/auth/google`, `Max-Age=600`, host-only); round-trip parse; malformed/absent/truncated payload → `undefined`; clear-cookie header shape (`Max-Age=0`).
- [ ] **C2.2.** Implement `apps/api/src/infrastructure/http/auth/oauth-transient-cookie.ts` (pure functions, same style as `cookie.ts`/`extraer-token.ts`). Run C2.1 green.

### Infrastructure — the two real routes

- [ ] **C2.3.** Write failing supertest specs (fake container + fake `IIniciadorLoginExterno`/`IVerificadorIdentidadExterna`) for `auth-google.routes.ts` per design §11.2:
  - initiate: `403` on non-top-level navigation (reuse `esNavegacionDeNivelSuperior` verbatim, AUTH-11); `302` to Google + `Set-Cookie: md_oauth` on a valid top-level request; `429` after the shared rate-limit budget is exceeded
  - callback: missing/mismatched `state` → `302 /login?error=google`, **and the verifier double is never called** (assert this — AUTH-12's "before any identity resolution is attempted"); `md_oauth` is cleared on **every** outcome (success, state mismatch, token failure, no-match) — assert the clear header appears on each branch, not just success
  - callback happy path (fake verifier double) → `Set-Cookie: md_session` with attributes equal to the password-login cookie (AUTH-13) + `302 /`
  - callback failure paths (tampered/expired id_token via fake verifier, no-match via fake use case) → identical `302 /login?error=google` response shape across causes (AUTH-15 — assert byte-identical `error` value across at least three distinct failure causes)
  - both endpoints `404` when `container.googleAuth` is `undefined` (regression guard, already covered in C1.5 — re-run, do not duplicate)
  - **infra fault mid-flow (DB error inside `loginConGoogle`'s repository/session calls, simulated via a double that rejects):** explicit test proving the route handler wraps the use-case call so an unexpected throw ALSO produces the uniform `302 /login?error=google` redirect — the AUTH-15 no-enumeration guarantee must hold even for unhandled infra faults, not just modeled `Result.fail` branches (4R carry-forward). If the design decision is instead to let it propagate to a 500 via `errorMiddleware`, document that carve-out explicitly here and in design §6 before implementing, rather than leaving it implicit.
  - **benign partial-state ordering (design §5.1):** when `vincularGoogleSub` succeeds but the subsequent session-issuance step fails (simulated via a `sessions.crear` double that rejects after a successful link), assert no rollback is attempted and no duplicate link occurs on the immediate retry path — the account is left linked-but-not-logged-in, self-repairing on the next attempt via `buscarPorGoogleSub` (4R carry-forward)
- [ ] **C2.4.** Implement the real handlers in `apps/api/src/infrastructure/http-express/routes/auth-google.routes.ts` (`registrarAuthGoogle`), replacing the C1 placeholder wiring so the `app.ts` branch now calls the real registrar when `container.googleAuth` is defined:
  - initiate: Sec-Fetch guard → shared `IpRateLimiter` (`google:ip:`, 10/15min) → `iniciador.iniciar()` → set `md_oauth` → 302
  - callback: read + immediately clear `md_oauth` (before any other work, on every outcome) → compare `state` → `verificador.verificar()` → `loginConGoogle` use case → on success set `md_session` (same attributes as password login) + 302 `/`; on any failure 302 `/login?error=google`
  - Sec-Fetch guard is applied to **both** endpoints (design §3 CSRF posture — not just initiate)
  - callback handler wraps the `loginConGoogle` call (and any unexpected throw from its collaborators) so an infra fault redirects to `/login?error=google` exactly like a modeled failure — per the C2.3 carry-forward test above — unless design §6 documents an explicit 500 carve-out instead
  - on the benign linked-but-not-logged-in partial state (link succeeds, session issuance fails), log it at a level distinguishable from a routine failure (observability for the 4R carry-forward above) — do not attempt a compensating rollback
  - Run C2.3 green.

### Composition — wire the shared rate limiter instance

- [ ] **C2.5.** Update `crearAuthGoogle` (from C1.4) to construct the `IpRateLimiter` with prefix `google:ip:`, budget 10/15min (hardcoded constants, no new env vars, per design §6.4). Confirm `crearAuth`'s existing `demo:ip:` limiter is unaffected (budget/behavior unchanged, only the class name changed in C1.2).

### OpenAPI

- [ ] **C2.6.** Register `/api/auth/google` `get` and `/api/auth/google/callback` `get` in `openapi-document.ts` (appended at the end of `paths`, design §10): `302`(+`Location`)/`403`/`404`/`429` for initiate; `302`(both outcomes, documenting the AUTH-15 indistinguishability as the contract itself)/`403`/`404`/`429` for callback. Run `pnpm api openapi:emit` and `openapi:check`.

### Slice close-out

- [ ] **C2.7.** `pnpm api test` and `pnpm api test:integration` green (integration: one end-to-end callback with a verifier **double**, never live Google, asserting a real `Session` row with SHA-256 hash + `expiresAt` = creation + 7 days, indistinguishable from a password-login row — design §11.3). `pnpm api exec tsc --noEmit` green.
- [ ] **C2.8. — MANUAL GATE, BLOCKS MERGE.** Run the full design §11.4 checklist against a real Google Cloud Console test client (requires P1/P2 done and Google credentials set in the target environment) and paste the result into the PR description before merging:
  1. Local: consent → land authenticated on the dashboard **without a manual refresh** (the D1 gate).
  2. Repeat in **Chrome, Firefox, and Safari** — confirm `md_session` present in DevTools → Application → Cookies with `HttpOnly` + `SameSite=Strict` (+`Secure` in prod).
  3. Cancel at consent → generic alert on `/login`, no session.
  4. Google account matching no MoneyDiary user → generic alert, confirm in DB **no user row was created**.
  5. Tamper `state` in callback URL → generic alert, no session; confirm logs show failure **without** `code`/`state` values.
  6. Unset both env vars → restart → both endpoints 404, button hidden (kill-switch drill).
  7. Repeat steps 1–3 against prod after deploy, through `app.moneydiary.cl`.
  8. **Verify the `redirect_uri` registered in Google Cloud Console matches `GOOGLE_REDIRECT_URI` exactly** (scheme/host/port/pathname) for each environment — a mismatch bypasses the app and surfaces Google's own error page instead of `/login?error=google` (design §8's accepted exception).
  - **If step 1 or 2 fails in any browser: apply the pre-approved design §2 contingency** (flip `md_session` to `SameSite=Lax` globally, one-line change in `buildCookie`) rather than improvising — this becomes a blocking follow-up task inside this same slice, not a separate change.
- [ ] **C2.9.** Open PR #4, dependency diagram 📍 on this PR, prior dependency = PR #3. PR description must include the pasted §11.4 checklist results (C2.8) before requesting merge.

**Verified by:** supertest + the mandatory manual gate (C2.8).
**Rollback:** revert PR, **or** unset the two Google env vars in Render (instant, no deploy, no code change needed).

---

## Slice D — Web UI (PR #5, targets Slice C2's branch/PR)

**Spec coverage:** AUTH-16 (web hides entry point when inactive), AUTH-17 (anchor-only entry point, `?error=` rendering). **Design refs:** §4.5 (capability discovery client side), §6.2 (web-side `?error=` handling).
**Depends on:** Slice C2 merged (needs `/api/auth/capabilities` and the real Google endpoints live).
**Independently shippable:** yes — completes the web feature; backend stays live and harmless if this slice is reverted.

- [ ] **D1.** Write failing component test for `apps/web/src/api/capabilities.ts` (TanStack Query hook, mirrors existing `apps/web/src/api/*` hand-written-DTO pattern): fetches `/api/auth/capabilities`, returns `{ googleLoginEnabled: boolean }`.
- [ ] **D2.** Implement `apps/web/src/api/capabilities.ts`. Run D1 green.
- [ ] **D3.** Write failing component test for `apps/web/src/components/GoogleLoginButton.tsx` (or co-located under `login` route components): renders as `<a href="/api/auth/google">` — **never** a button with an `onClick` handler issuing `fetch`/`window.location` (AUTH-17); hidden entirely while capability is loading (reserve space, no flash of a dead button per design §4.5) and when `googleLoginEnabled: false`; visible as an anchor when `true`.
- [ ] **D4.** Implement `apps/web/src/components/GoogleLoginButton.tsx` (or repo-conventional path) — top-level `<a href>`, same pattern as the landing's demo link. Wire into `/login` below the existing form. Run D3 green.
- [ ] **D5.** Write failing test for `apps/web/src/routes/login.tsx` `validateSearch` extension: whitelists `error: 'google'` only (any other `?error=` value is stripped, matching `sanitizeRedirect`'s discipline — never echo attacker-controlled values); existing `redirect` behavior unchanged.
- [ ] **D6.** Implement the `validateSearch` extension per design §6.2. Run D5 green.
- [ ] **D7.** Write failing test asserting `/login` renders the existing generic `role="alert"` component when `?error=google` is present in the resolved search params (reuse `LoginForm`'s existing alert style — do not introduce a second alert component).
- [ ] **D8.** Implement the `?error=` rendering wiring in `login.tsx`/`LoginForm`. Run D7 green.
- [ ] **D9.** `pnpm web test` green. `pnpm web typecheck` green.
- [ ] **D10.** Manual smoke: with Google configured locally, confirm the button appears and completes end-to-end (this overlaps with C2.8 step 1 but is now exercised through the actual UI element, not a raw URL).
- [ ] **D11.** Open PR #5, dependency diagram 📍 on this PR, prior dependency = PR #4. This is the **last** PR in the web chain.

**Verified by:** `pnpm web test`.
**Rollback:** revert PR; backend stays live and harmless (Google flow remains reachable by direct URL, just no UI entry point).

---

## Review Workload Forecast

| Slice | ~Changed lines (incl. tests) | Hot path? |
|---|---|---|
| A — Application core | ~400 | Yes (`**/auth/**`) |
| B — Adapters + env | ~450 | Yes (`**/auth/**`, `**/security/**`-adjacent env handling) |
| C1 — Activation seam | ~300 | Yes (`**/auth/**`) |
| C2 — Real endpoints | ~380 | Yes (`**/auth/**`) — new externally-reachable, attacker-controlled-input endpoints |
| D — Web UI | ~180 | No (client-side rendering only, no new trust boundary) |
| **Total** | **~1,710** | — |

- **Hot paths touched:** Yes — every backend slice (A/B/C1/C2) touches `**/auth/**`; per the trigger rule this means **full 4R fan-out review** (`review-risk`, `review-resilience`, `review-readability`, `review-reliability` in parallel) is strongly recommended for each of those four PRs, not just at final merge. `judgment-day` is recommended after Slice C2 specifically (the slice that ships live, network-reachable OAuth handling) and was already run after `design`.
- **400-line budget risk:** **High** — the proposal's original A/B/C/D estimate (~1,200–1,700) held, and splitting into A/B/C1/C2/D (this file) keeps every individual PR under or near the 400-line ceiling; none is ≤400 by a wide margin except D, so each backend PR still deserves full review attention, not a rubber stamp.
- **Chained PRs recommended:** **Yes.**
- **Decision needed before apply:** **Yes** — `delivery_strategy` is `ask-on-risk`, and `chain_strategy` (stacked-to-main vs feature-branch-chain) has not been cached for this session. The orchestrator must ask before Slice A's PR is opened.

---

## Dependencies between slices & what each PR targets

```
A ──▶ B ──▶ C1 ──▶ C2 ──▶ D
📍 marks the current PR in each PR's own description (chained-pr skill requirement).
```

- **A** has no dependency on this change's other slices; it is inert on its own.
- **B** depends on A's ports (`IVerificadorIdentidadExterna`, `IIdentidadGoogleRepository`) and error type.
- **C1** depends on B's `crearAuthGoogle` collaborators and env keys to build the activation seam.
- **C2** depends on C1's activation seam and disabled-stub scaffolding to flip into the real, live-Google-reachable handlers. **C2 also has an external dependency on P1/P2 (Google Console + Render secrets) for its manual gate (C2.8) — code can be written and unit/integration-tested without them, but the merge-blocking manual gate cannot run until they exist.**
- **D** depends on C2's `/api/auth/capabilities` and the two real Google endpoints being live to render/verify against.

**Stacked-to-main implications:** each PR (A, B, C1, C2, D) merges to `main` independently and in order; fastest iteration, but C2 briefly exists on `main` with live Google endpoints reachable before D ships the UI (harmless — no button yet, but the URL is directly hittable by anyone who knows it, same exposure as `GET /api/auth/demo` already has). Fix-on-the-go if a later slice's tests reveal an earlier slice's gap.

**Feature-branch-chain implications:** a draft/no-merge tracker PR accumulates A→D; only the tracker merges to `main`, so the live-but-unbuttoned window in the stacked model does not happen on `main` at all — but review latency compounds (later PRs wait on earlier ones being reviewed against the tracker, not `main`), and rollback of a single slice mid-chain requires retargeting children.

Given the auth hot-path sensitivity and that C2 introduces a genuinely live, externally-reachable OAuth surface, **feature-branch-chain is the safer default recommendation**, but this is presented to the user per the `ask-on-risk` delivery strategy — not decided here.

---

## Prerequisites / out-of-band items (recap)

1. Google Cloud Console OAuth client + registered redirect URIs (P1) — blocks C2.8, not A/B/C1.
2. Render env vars for `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI` (P2) — set only when C2 is ready to merge, kept absent until then.
3. `openid-client` release-age check against `.npmrc` quarantine (P3) — blocks Slice B's install step.
4. **`openspec/changes/auth-login-session` remains unarchived** — flag for `sdd-verify` (P4); baseline requirement IDs cited throughout spec/design (`AUTH-01/02/05/06`, `AC-07`, `MOB-01/02`) are verified-against-live-code but not yet part of the permanent archived baseline, and archival could renumber them.
5. Possible pre-existing production log leak of `Set-Cookie: md_session` via `pino-http`'s default response-header serializer (P5) — investigated and closed for the Google path inside C1 (C1.11) regardless of outcome; if confirmed, recommend a separate, immediate fix PR for the pre-existing password/demo exposure ahead of or parallel to this chain.
6. Mobile (`auth-google-login-mobile`, ADR-035) is a **future, separate SDD change** — not started by this tasks file. `MOB-05` traceability is preserved here for reference only.
