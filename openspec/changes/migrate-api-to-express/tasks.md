# Tasks — migrate-api-to-express

Delivery: **feature-branch-chain**, one PR per slice against the tracker branch. **Strict TDD active** (`apps/api`): every code task is test-first (red → green → refactor). Runner: `pnpm api test`.

Slices are dependency-ordered. Only the **cutover** slice changes production behavior.

---

## Slice 0 — Skeleton + composition root (no endpoint migrated)

Goal: make Slices 1+ trivial. Establishes the Express harness, the real container, and the plain Prisma client.

- [x] **0.1** Add `express` as a **direct** dependency of `apps/api` (was only transitive via `@nestjs/platform-express`; isolated pnpm resolution requires it declared). `supertest` + `@types/express`/`@types/supertest` already present. ✅
- [x] **0.2** `src/infrastructure/persistence/create-prisma-client.ts` — plain `PrismaClient` factory (adapter-pg + `DIRECT_URL ?? DATABASE_URL`, logic lifted from `PrismaService`). Test-first: throws when neither env var is set. ✅
- [x] **0.3** `src/composition/container.ts` — `createContainer(prisma?)` returning a typed `Container`. Slice 0 surface = `{ shutdown }` (calls `prisma.$disconnect()`); the interface **grows one field per endpoint slice**. Test-first: `createContainer(fakePrisma).shutdown()` calls `$disconnect`. ✅
- [x] **0.4** `src/infrastructure/http-express/middleware/error.middleware.ts` — central `(err, req, res, next)`: log server-side, generic scrubbed 500. (Domain-error mapping arrives with the endpoints.) ✅
- [x] **0.5** `src/infrastructure/http-express/app.ts` — `createApp(container): Express`: `express.json()` + public `GET /` health returning `'Hello World!'` (preserves current contract) + error middleware last. Test-first: `supertest(createApp(fake)).get('/')` → 200 `'Hello World!'`. ✅
- [x] **0.6** `src/infrastructure/http-express/server.ts` — bootstrap: `dotenv/config`, `createContainer()`, `createApp`, `listen`, graceful shutdown (SIGTERM/SIGINT → `container.shutdown()`). Not the deployed entrypoint yet. ⚠️ Eager `$connect` on boot deferred (Prisma connects lazily on first query) — add fail-fast connect when the first querying endpoint lands (Slice 2) or at cutover.
- [x] **0.7** `package.json` parallel scripts (`start:express` via ts-node, `start:express:prod`) so both stacks coexist on the branch without collision. ✅
- [x] **0.8** Green: `pnpm api test` → **831/831 pass** (3 new specs + all existing untouched); `tsc --noEmit` clean. ✅

---

## Slice 1 — Auth as middleware  🔴 SECURITY HOT PATH

Goal: port the guard chain 1:1 to middleware. Security logic (`extractToken`, `ValidarSesionUseCase`, hashing/expiry) is **reused verbatim** — only the guard→middleware envelope changes.

- [x] **1.1** `api-key.middleware.ts` — port 1:1 of `ApiKeyGuard`: timing-safe compare, fail-closed (500 on missing/short key), 401 on bad/absent key. Test-first via supertest probe app (5 tests). ✅
- [x] **1.2** `session.middleware.ts` — factory (closure-DI): dual transport (cookie **or** `Authorization: Bearer` via reused `extraer-token.ts`) → `validarSesion` → set `req.userId`; 401 scrubbed (path-only log). Test-first: missing / invalid / valid + **cookie-precedence** (4 tests). ✅
- [x] **1.5** Wire `validarSesion` into the `Container` (+ its typed field). **Decoupled `PrismaSessionRepository` constructor `PrismaService` → `PrismaClient`** so the plain container can wire it (Nest still works: `PrismaService extends PrismaClient`). Test-first. ✅
- [x] **1.4** Public-route handling: **pattern established** — "public" = the route simply doesn't mount the middleware (no `@Public()` in Express). Documented in both middleware. Actual mounting + verification lands with the first protected route (Slice 2), since there are no `/api` routes to protect yet.
- [ ] **1.3** ~~`sec-fetch.middleware.ts`~~ → **MOVED to Slice 7.** `esNavegacionDeNivelSuperior` is NOT a global guard — it's a pure `Request → boolean` used only by `GET /api/auth/demo`. Belongs to the auth slice.
- [x] **1.6** 🔴 **Gate — SATISFIED at Slice 2** (`app.resumen.spec.ts`): full auth chain on the real app (no key → 401 / api-key only → 401 / api-key + session → 200) + **isolation proof** — the `userId` reaching the use case is the one derived from the session (`toHaveBeenCalledWith({ userId: 'user-de-sesion' })`), not a fixed constant. Health `GET /` stays public. DB-level "user A ≠ user B" remains covered by the unchanged repo integration tests. ✅

**Contract note (verified):** the web client keys off **status codes only** (`res.status === 401`, `!res.ok`) and uses its own messages — it never parses the error body. So the Express error envelope (`{ message }`) differs from Nest's (`{ statusCode, message, error }`) with **zero client impact**.

---

## Slice 2 — `resumen` (`GET /api/resumen`, `GET /api/resumen/anual`) — first real endpoint ✅
- [x] **2.1** `routes/resumen.routes.ts` — `registrarResumen(router, mesUC, anualUC)`: both handlers, `Result→HTTP` (400 scrubbed on `PeriodoInvalidoError`/`AnioInvalidoError`, 500 on `ResumenAnualInvalidoError`/unexpected via `next(err)`), reusing `aResumenMesDto`/`aResumenAnualDto`. Test-first (6 tests). ✅
- [x] **2.2** Wire `calcularResumenMes` + `calcularResumenAnual` into `Container`; decouple `PrismaResumenMesRepository` + `PrismaResumenAnualRepository` `PrismaService → PrismaClient`. ✅
- [x] **2.3** `app.ts` — mount the **protected `/api` router** (`apiKeyMiddleware → sessionMiddleware → registrarResumen`); health `GET /` stays public outside `/api`. First real use of the middleware chain. ✅
- [x] **2.4** Green: **851/851** + `tsc` clean; isolation gate (1.6) satisfied via `app.resumen.spec.ts`. ✅

## Slice 3 — `buckets` (`GET /api/buckets/:bucket`) ✅
- [x] **3.1** `routes/buckets.routes.ts` — `registrarBuckets(router, uc)`: `:bucket` path param + `periodo` query; `BucketInvalidoError`/`PeriodoInvalidoError` → scrubbed 400 (raw `:bucket` never reflected), unexpected → 500; reuse `aDetalleBucketDto`. Test-first (5 tests). ✅
- [x] **3.2** `obtenerDetalleBucket` wired into `Container`; `PrismaDetalleBucketRepository` decoupled `PrismaService → PrismaClient`. ✅
- [x] **3.3** `app.ts` — mount `registrarBuckets` on the protected `/api` router. ✅
- [x] **3.4** `app.buckets.spec.ts` — protected + isolation gate (401 without session, 200 with, session `userId` flows to the use case). Green: **858/858** + `tsc` clean. ✅

## Slice 4 — `movimientos` (`GET /api/movimientos`) ✅
- [x] **4.1** `routes/movimientos.routes.ts` — `registrarMovimientos(router, uc)`: `periodo` query; `PeriodoInvalidoError` → scrubbed 400, unexpected → 500; reuse `aMovimientosMesDto`. Test-first (4 tests). ✅
- [x] **4.2** `obtenerMovimientosMes` wired into `Container`; `PrismaMovimientosMesRepository` decoupled → `PrismaClient`. ✅
- [x] **4.3** `app.ts` — mount on protected `/api`; `app.movimientos.spec.ts` isolation gate (2 tests). Green: **864/864** + `tsc` clean. ✅

## Slice 5 — `transacciones` (`PATCH /api/transacciones/:id/categoria`) — first write ✅
- [x] **5.1** `routes/transacciones.routes.ts` — `registrarTransacciones(router, uc)`: **JSON body** manual validation (non-string `categoria` → `''`, uniform rejection); `CategoriaInvalidaError` → scrubbed 400, **`TransaccionNoEncontradaError` → 404** (anti-enumeration), unexpected → 500; reuse `aReclasificarCategoriaDto`. Test-first (5 tests). ✅
- [x] **5.2** `reclasificarTransaccion` wired into `Container`; `PrismaReclasificarCategoriaRepository` decoupled → `PrismaClient`. ✅
- [x] **5.3** `app.ts` — mount on protected `/api` (`express.json()` already global); `app.transacciones.spec.ts` isolation gate (2 tests, PATCH). Green: **871/871** + `tsc` clean. ✅

## Slice 6 — `ingestas` (`POST /api/ingestas`) — file upload ✅
- [x] **6.1** `routes/ingesta.routes.ts` — `multer` route-level (memory, 10MB), `LIMIT_FILE_SIZE` → 400 (mirrors `UploadTooLargeFilter`); **reuse `MulterFileReaderAdapter`** (already framework-agnostic) → `IFileReader`; `processIngesta.execute`; error map (9 `ProcessIngestaError` variants: `PersistenciaFallidaError` → 500, other 8 → 400) with exhaustiveness guard; reuse `aIngestaResponseDto`. Test-first (4 tests). ✅
- [x] **6.2** `composition/crear-process-ingesta.ts` — extracted the full `IngestaModule` graph (14-arg pipeline, xlsx+pdf) into a reusable helper; `processIngesta` wired into `Container`. **6 repos decoupled** `PrismaService → PrismaClient` (account, ingesta, catalogo, transaccion-bucket, transaccion-clasificacion, transaccion-existente-reader). ✅
- [x] **6.3** `app.ts` — mount on protected `/api` (auth runs **before** multer parses the upload); `app.ingesta.spec.ts` isolation gate (2 tests, multipart). Green: **877/877** + `tsc` clean. ✅

## Slice 7 — `auth` (`POST login`/`logout`, `GET me`/`demo`) ✅
- [x] **7.1** `routes/auth.routes.ts` — `registrarAuthPublic` (login/logout/demo) + `registrarAuthMe` (me). Login: rate-limit (429) + argon2 via use case + Set-Cookie + 401 on bad creds. Logout: 204 + clear cookie (robust, never rethrows). Demo: **sec-fetch 403** + existing-session 302 + rate-limit 429 + lazy cleanup (degradable) + 302 redirect. Reuses `cookie.ts`/`client-ip.ts`/`extraer-token.ts`/`sec-fetch-guard.ts` verbatim. Test-first (8 tests). ✅
- [x] **7.2** `composition/crear-auth.ts` — extracted the `AuthModule` graph (consolidates `validarSesion` + login/logout/identidad/demo use cases + rate limiters + cleanup). Wired 8 auth fields into `Container`. **3 more repos/services decoupled** (`prisma-user-credential`, `prisma-demo`, `demo-cleanup.service`) → `PrismaClient`. ✅
- [x] **7.3** `app.ts` **remounted** for session-public: `apiKeyMiddleware` now global on `/api`; **`authPublicApi`** (login/logout/demo — api-key, NO session) mounted **before** `protectedApi` (session + data routes + `/auth/me`). `app.auth.spec.ts` proves login is session-public and `me` is protected (4 tests). Green: **889/889** + `tsc` clean. ✅

**Cutover follow-ups discovered (for Slice 8):**
- `DemoCleanupService.limpiarDiario()` is `@Cron` (`@nestjs/schedule`) — needs a non-Nest scheduler replacement post-cutover. Lazy cleanup in `GET /demo` already works.
- Auth helpers still under `infrastructure/http/auth/` (framework-agnostic: cookie, client-ip, extraer-token, sec-fetch, rate limiters, system-reloj, sha256-token, argon2, demo-cleanup) must relocate to a neutral dir when `http/` is deleted.

## Slice 8 — Cutover  🚀 ONLY slice that changes prod

> **Scope discovery (before deleting Nest):** two things boot Nest and must be migrated FIRST — the **CLI** (`cli/ingestar.ts`, manual Nest wiring) and the **e2e/integration test harness** (19 `test/*.spec.ts` boot `AppModule` via `@nestjs/testing`; `tsconfig.json` has no `exclude` so `tsc` compiles them). Staged approach (user choice).

### 8a — Migrate the CLI ✅
- [x] **8a.1** `cli/ingestar.ts` — replaced the inline Nest wiring (`new PrismaService()` + hand-built `ProcessIngestaUseCase`) with `createPrismaClient()` + `crearProcessIngesta(prisma)`; `$connect`/`$disconnect` lifecycle; dropped `reflect-metadata`. CLI and HTTP now share the SAME composition root. `tsc` clean, **889/889**. ✅

### 8b — Migrate the e2e/integration harness ✅
- [x] **8b.1** Rewrote all 19 `test/*.{e2e,int}-spec.ts` — 10 app-booting → `createApp(createContainer(prisma))` + `request(app)`; 9 db-only → `createPrismaClient()`. Only boot/teardown swapped; bodies/assertions/seed logic untouched (delegated + verified). Also decoupled `PrismaTransaccionRepository` (`PrismaService → PrismaClient`) — an internal read repo used only by `prisma-persistence.int-spec` and the CLI, not any HTTP endpoint. `tsc --noEmit` clean; zero `@nestjs`/`AppModule`/`PrismaService` refs left in `test/` (one harmless doc-comment aside). **Execution against a real DB is deferred to 8d** (gated `ALLOW_DESTRUCTIVE_DB`); several older e2e were already session-bit-rotted pre-migration.

### 8c — Delete Nest + flip ✅
- [x] **8c.1** Deleted **36 Nest files** (`main.ts`, `app.{module,controller,service}.ts` + spec, `prisma.{service,module}.ts` + `prisma.service.spec`, 5×`*.controller.ts`+specs+`*.module.ts`, `api-key`/`session` guards+specs, `auth.controller`+spec+`auth.module`, `public`/`session-public`/`current-user` decorators, `upload-too-large.filter`, `session-public-carveout.spec`, `vitest.setup.ts`). Kept the 17 framework-agnostic survivors. Fixed 12 repo specs (`PrismaService → PrismaClient`) + decoupled `PrismaTransaccionRepository` (found via tsc). **Zero `@nestjs` refs in `src/`.**
- [x] **8c.2** `demo-cleanup.service.ts` — Nest `Logger` → `console`; dropped `@Cron` (daily `limpiarDiario` is now an unscheduled plain method — **needs a `node-cron`-style scheduler post-cutover**; lazy cleanup in `GET /demo` still works). Spec updated (`console` spies).
- [x] **8c.3** Flipped scripts: `build` → `tsc -p tsconfig.build.json`, `start` → ts-node Express server, `start:prod` → `node dist/infrastructure/http-express/server`. `render.yaml` comments updated (its commands already call the scripts; `healthCheckPath: /` matches the Express health route). **Build verified**: `pnpm build` emits `dist/infrastructure/http-express/server.js`.
- [x] **8c.4** Removed deps: `@nestjs/{common,core,platform-express,schedule,cli,schematics,testing}`, `reflect-metadata`, `rxjs`, `@swc/core`, `unplugin-swc`, `ts-loader`. Simplified all 3 vitest configs (dropped SWC + `oxc:false` + `reflect-metadata` setup → default Oxc transformer). **809/809 unit green** (was 889; −80 deleted Nest-controller/guard specs). ⚠️ Intermittent supertest port-collision flake observed under load-spike (passed 5/5 on re-run) — watch in CI.

### 8d — Verify 🔴
- [ ] **8d.1** Full unit suite + integration + `tsc` green; boot the Express server; curl matrix (health 200 / no key 401 / bad session 401 / valid 200); fresh-context review; Render deploy verification.

> Optional cleanup (cosmetic, non-blocking): relocate the surviving `http/` utilities to a neutral dir now that `http/` no longer holds the Nest HTTP layer.

---

*Review Workload Forecast: multi-slice, security hot path (Slice 1) + write paths. Chained PRs: Yes. Each slice ≤ ~400 lines by construction. Cutover is the risk moment — rehearsed by then.*
