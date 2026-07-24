# Proposal — migrate-api-to-express: replace NestJS with Express + TypeScript on `apps/api`

Migrate the MoneyDiary backend (`apps/api`) from **NestJS** to **Express + TypeScript (strict)**, per **ADR-028**. This is a **framework-only** migration: the HTTP transport layer is rewritten, everything behind the ports is left untouched. `domain/` and `application/` do **not** change (audited: 0 imports of `@nestjs`/`@prisma` in either). Prisma stays (ADR-002 out of scope). The external HTTP contract (routes, DTOs, status codes) is preserved byte-for-byte, so web/mobile clients never notice (ADR-024, contract-first).

**Cutover strategy: parallel Express server + final cutover.** The new Express app is built alongside Nest on a long-lived branch; endpoints are ported one reviewable PR at a time but **production keeps running Nest, untouched, until the very last PR** flips the entrypoint and deletes Nest. One rehearsed moment of risk instead of a moving target.

## Why now / intent

- **The learning goal outranks everything (ADR-028).** ADR-001 chose NestJS *for* its pedagogical value. After 9 sprints that inverted: Nest's DI magic (providers, tokens, `@Injectable`, `useFactory`) and decorator-metadata reflection now **hide** the fundamentals the project exists to teach. The dependency graph isn't readable in one place — it's dissolved across 7 `@Module` files. This decision is deliberate and made **independently of migration effort**.
- **The architecture already earned this.** ADR-005's dependency rule quarantined the framework to `infrastructure/`. The proof that the isolation worked is that this migration touches **zero** lines of `domain/` and `application/`. Nest was always meant to be replaceable; this change collects on that promise.
- **Express maximizes exposure to fundamentals.** Routing, middleware chains, manual DI via a real composition root, explicit error→HTTP mapping, server lifecycle — all written by hand. That hand-writing *is* the learning.

## Quick path (what this change delivers)

1. A **real composition root** (`src/composition/container.ts`, today an empty `export {}`) that assembles the entire dependency graph with plain `new` — framework-agnostic, readable top-to-bottom.
2. An **Express app** (`src/infrastructure/http-express/` or equivalent) with one thin handler per endpoint, a central error-handling middleware, and a new bootstrap entrypoint.
3. **Auth guards → Express middleware**: `ApiKeyGuard` and `SessionGuard` become middleware; `@CurrentUser()` becomes a `req.userId` set by the session middleware; `@Public()`/`@SessionPublic()` become per-route opt-outs.
4. **All 6 controllers ported** endpoint by endpoint (`resumen`, `buckets`, `movimientos`, `transacciones`, `ingestas`, `auth`), each a reviewable slice with its tests rewritten.
5. **Final cutover PR**: flip Render's entrypoint to the Express bootstrap, delete `main.ts`/`app.module.ts`/all `*.module.ts`, remove Nest deps and the SWC-for-decorators test config (ADR-016 lightens on the backend).

## In scope

### Infrastructure — `apps/api/src/infrastructure/` (English infra convention)

**HTTP layer (rewritten)**
- One Express **handler** per current controller method — extracts params/query/body, calls the use case, translates `Result<T,E>` to the response. The translation logic already exists in the controllers; only the envelope changes (`@Param`/`@Query`/`@Body` → `req.params`/`req.query`/`req.body`; `throw new BadRequestException` → `res.status(400)` via the error middleware).
- A central **error-handling middleware** replacing Nest's exception filters / `HttpException` mapping (domain error → scrubbed 400, 401, 500), preserving today's scrubbing guarantees (raw input never reflected).
- **Router wiring** replacing `@Controller`/`@Module` registration.
- **`multer`** wired as Express middleware for `POST /api/ingestas` (already a dep; today used via Nest's `FileInterceptor`).

**Auth (`infrastructure/http/auth/` → middleware)**
- `api-key.guard.ts` → api-key middleware (timing-safe compare preserved, fail-closed).
- `session.guard.ts` → session middleware; validates the token (cookie **or** `Authorization: Bearer`, dual transport preserved) and attaches `req.userId`.
- `sec-fetch-guard.ts` → middleware.
- `@CurrentUser()` → read `req.userId`; `@Public()`/`@SessionPublic()` → explicit per-route middleware placement (public routes simply don't get the middleware).
- Helpers (`cookie.ts`, `client-ip.ts`, `extraer-token.ts`, `login-rate-limiter.ts`, `demo-rate-limiter.ts`, `demo-cleanup.service.ts`, `system-reloj.ts`) are **mostly framework-agnostic already** — reused as-is; only their call sites move from guards to middleware.

**Composition root (`src/composition/container.ts`)**
- Build the full graph: instantiate a plain Prisma client (lifecycle `$connect`/`$disconnect` owned by the container, no more Nest `OnModuleInit`/`OnModuleDestroy`), wire every repository into every use case with `new`, expose the assembled use cases + a `shutdown()`.

**Bootstrap**
- New Express entrypoint (server creation, middleware order, router mount, graceful shutdown) replacing `main.ts` + `app.module.ts`.

### Tests (Vitest — ADR-016; Strict TDD active for `apps/api`)
- **Untouched:** all `domain/` and `application/` unit specs — they don't know the framework changed.
- **Rewritten:** HTTP e2e/integration specs currently built on `@nestjs/testing` → `supertest` against the Express app (or the project's chosen equivalent — a design question). The **`userId` isolation integration test (RNF-SEC-006, ADR-015)** must pass identically post-migration.
- Guard specs (`api-key.guard.spec.ts`, `session.guard.spec.ts`) → middleware specs.

### Deploy — `apps/api` on Render (ADR-004)
- Build output changes from Nest's `dist/main.js` to the Express entrypoint; `render.yaml` / start command updated in the **cutover PR only**. No platform change.

## Explicitly NOT touched (the proof of the design)
- **`domain/`** — 0 changes.
- **`application/`** (use cases + ports) — 0 changes.
- **Prisma / ADR-002** — the ORM stays; a future ORM change would be its own ADR.
- **External HTTP contract** — same routes, same DTOs, same status codes. `openapi.json` (ADR-011) unchanged.
- **Clients** (`apps/web`, `apps/mobile`) — 0 changes; contract-first (ADR-024) means they're blind to the framework swap.

## Non-goals (explicit)
- **Dropping Prisma** — out of scope; separate ADR if ever.
- **Changing the API contract** — no new endpoints, no shape changes, no status-code changes.
- **Adding an input-validation library** (`class-validator`, `zod`) — validation already lives in domain VOs (`Bucket`, `PeriodoMes`, `Email`); this migration does not relocate it.
- **Rewriting business logic** — pure plumbing move.
- **Touching web/mobile.**

## Approach (high level — full design is the next phase)

- **Parallel build:** the Express app and container are built new, importing the *existing* use cases and adapters. Nest keeps running in prod off `main` the whole time. Nothing deploys until cutover.
- **Slice order (dependencies first, then endpoints, then cutover):**
  0. **Skeleton** — real `container.ts`, Express app + error middleware, plain Prisma client + lifecycle, bootstrap (not yet the deployed entrypoint), test harness (`supertest`).
  1. **Auth middleware** — `ApiKeyGuard`/`SessionGuard`/`sec-fetch` → middleware; `req.userId`; public-route handling. **Security hot path** — full ADR-015 access/isolation checklist re-run here.
  2. **resumen** (`GET /`, `GET /anual`) — read-only, simplest real endpoint.
  3. **buckets** (`GET /:bucket`).
  4. **movimientos** (`GET /`).
  5. **transacciones** (`PATCH /:id/categoria`) — first write.
  6. **ingestas** (`POST /`) — file upload / multer, the trickiest.
  7. **auth** (`POST login`/`logout`, `GET me`/`demo`) — rate limiters + cookies.
  8. **Cutover** — flip entrypoint, delete Nest + modules + SWC config, update Render, final full-suite + isolation verification.
- **`userId` sourcing:** the session middleware attaches the validated `userId` to `req`; handlers read `req.userId` in place of Nest's `@CurrentUser()` param decorator — without leaking infra into application (the use cases still receive a plain `userId: string`).
- **DI:** manual, centralized in the container. Handlers receive their use case from the container at wiring time (closure or a thin factory) — no runtime DI framework.

## Delivery boundary
Delivery strategy **`ask-on-risk`**, **`chain_strategy: feature-branch-chain`** — matches Sprints 6/8/9. Each slice above is its own PR against the tracker branch, with fresh-context review per slice (the security slice especially). The **cutover PR is the only one that changes production behavior**. `tasks` confirms the split.

## Risks & open design questions (hand-off to `sdd-design`)

| Item | Question for design |
|------|---------------------|
| **Container shape** | Single `createContainer()` returning all use cases + `shutdown()`, vs per-feature sub-factories. How handlers receive their use case (closure capture vs a `Container` passed to route registrars). |
| **`@CurrentUser()` replacement** | Confirm `req.userId` (via `express-request.d.ts` augmentation, which already exists) as the mechanism; ensure application still receives a plain string, no `req` leak past the handler. |
| **Guard→middleware ordering** | Exact middleware order (api-key → session → sec-fetch) and how `@Public()`/`@SessionPublic()` opt-outs map to "don't mount this middleware on this route" cleanly, including the health check skipping both. |
| **Error-mapping middleware** | Central `(err, req, res, next)` handler vs per-handler try/catch (today controllers try/catch). Preserve scrubbing + the exhaustiveness guard pattern. |
| **File upload** | `multer` as route middleware for `POST /api/ingestas`; match the current `FileReader` adapter boundary so the use case is unchanged. |
| **Cookies** | Reuse the existing hand-rolled `cookie.ts` (no `cookie-parser`); confirm `Set-Cookie` on the Express `res` matches today's HttpOnly/Secure-env/SameSite=Strict/host-only attributes exactly. |
| **Rate limiters** | `login-rate-limiter.ts`/`demo-rate-limiter.ts` are in-memory and framework-agnostic — confirm they port with only call-site changes; real client IP via `x-forwarded-for` behind Render. |
| **Test harness** | `supertest` against the Express app vs alternative; how to spin the app with a test container (inject fakes for repos) so integration tests stay fast and the isolation test is preserved. |
| **Prisma lifecycle** | Container owns `$connect`/`$disconnect`; wire graceful shutdown (SIGTERM on Render) to `container.shutdown()`. |
| **Coexistence during build** | Both `main.ts` (Nest) and the Express bootstrap exist on the branch simultaneously — confirm the build/test scripts can target either without collision until cutover. |

## Next step
Run `sdd-design` against this proposal, then `sdd-tasks` to lock the per-slice checklist. Begin implementation at **Slice 0 (skeleton + container)** — nothing else compiles without it.
