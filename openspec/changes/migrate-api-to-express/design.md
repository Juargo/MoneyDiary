# Design — migrate-api-to-express

Framework-only migration of `apps/api` from NestJS to Express + TypeScript (strict), per ADR-028. This document locks the cross-cutting patterns (Slice 0 + Slice 1); per-endpoint slices are then mechanical repetition of the handler pattern.

## Locked decisions

1. **Cutover strategy — parallel build + final cutover.** The Express app is built alongside Nest on a long-lived branch. Production runs Nest untouched until the last PR flips the entrypoint and deletes Nest. Only the cutover PR changes prod behavior.
2. **DI — plain container + closures.** `createContainer()` returns an object holding every assembled use case plus `shutdown()`. Route registrars receive the use case(s) they need; handlers capture them by closure. No runtime DI, no service locator, no string tokens. The graph reads top-to-bottom in one file.

## Directory layout

```
apps/api/src/
  composition/
    container.ts              ← the real composition root (replaces `export {}`)
  infrastructure/
    persistence/
      create-prisma-client.ts ← plain PrismaClient factory, no Nest lifecycle
    http-express/             ← NEW — the Express transport (parallel to http/ during build)
      app.ts                  ← builds the Express app: middleware order + router mount
      server.ts               ← bootstrap: create app, listen, graceful shutdown
      middleware/
        api-key.middleware.ts
        session.middleware.ts
        sec-fetch.middleware.ts
        error.middleware.ts   ← central (err, req, res, next) → HTTP
      routes/
        resumen.routes.ts     ← registrar(router, useCase) per feature
        buckets.routes.ts
        movimientos.routes.ts
        transacciones.routes.ts
        ingestas.routes.ts
        auth.routes.ts
    http/                     ← Nest controllers/modules — DELETED at cutover
```

`infrastructure/http/` (Nest) and `infrastructure/http-express/` coexist on the branch. The DTOs (`http/dto/*`) and auth helpers (`http/auth/cookie.ts`, `client-ip.ts`, `extraer-token.ts`, rate limiters, `system-reloj.ts`) are framework-agnostic and **imported by both** — they move/stay at cutover, not duplicated.

## Composition root (`container.ts`)

```ts
export interface Container {
  readonly calcularResumenMes: CalcularResumenMesUseCase;
  readonly obtenerResumenAnual: ObtenerResumenAnualUseCase;
  readonly obtenerDetalleBucket: ObtenerDetalleBucketUseCase;
  readonly obtenerMovimientosMes: ObtenerMovimientosMesUseCase;
  readonly reclasificarCategoria: ReclasificarCategoriaUseCase;
  readonly processIngesta: ProcessIngestaUseCase;
  // auth use cases (login, validar-sesion, logout, demo)…
  readonly validarSesion: ValidarSesionUseCase;   // used by session middleware
  readonly shutdown: () => Promise<void>;
}

export function createContainer(prisma: PrismaClient = createPrismaClient()): Container {
  // infra adapters → use cases, plain `new`, read top-to-bottom
  const detalleBucket = new ObtenerDetalleBucketUseCase(new PrismaDetalleBucketRepository(prisma));
  // …the rest of the graph…
  return { obtenerDetalleBucket: detalleBucket, /* … */, shutdown: () => prisma.$disconnect() };
}
```

- **Prisma lifecycle moves out of Nest.** `create-prisma-client.ts` returns a plain `PrismaClient` (with the `@prisma/adapter-pg` + `DIRECT_URL ?? DATABASE_URL` logic lifted verbatim from `PrismaService`). `$connect` happens on boot (in `server.ts`), `$disconnect` via `container.shutdown()` on SIGTERM. The existing `@Injectable` `PrismaService` stays for Nest until cutover, then is deleted.
- The container imports **only** application (use cases) and infrastructure (adapters) — never Express. It is testable with a fake `PrismaClient`.

## Express app assembly (`app.ts`)

Middleware order (global, in sequence), then routers:

```
1. express.json()                  (JSON body parsing — NOT for the multipart ingesta route)
2. apiKeyMiddleware                (fail-closed; skipped only on health)
3. secFetchMiddleware
4. sessionMiddleware               (sets req.userId; skipped on public auth routes + health)
5. feature routers (each mounted with its use case from the container)
6. errorMiddleware                 (LAST — 4-arg signature)
```

`createApp(container: Container): Express` builds and returns the app without listening — so tests can `supertest(createApp(testContainer))` without a live port.

## Auth as middleware (Slice 1 — security hot path)

The Nest guards become middleware; the mapping is 1:1 in behavior, only the shape changes.

| Nest today | Express |
|---|---|
| `ApiKeyGuard` (`APP_GUARD`, `canActivate`) | `apiKeyMiddleware` — timing-safe compare of `x-api-key`; `next()` or `401`. Fail-closed preserved. |
| `SessionGuard` (`APP_GUARD`, dual transport) | `sessionMiddleware` — extract token (cookie **or** `Authorization: Bearer`, reusing `extraer-token.ts`), `validarSesion.execute()`, set `req.userId`; `401` on failure. |
| `SecFetchGuard` | `secFetchMiddleware`. |
| `@Public()` decorator | route simply **not** mounted behind the middleware (health). |
| `@SessionPublic()` decorator | auth-public routes (`login`, `demo`) mounted behind api-key but **before/without** session middleware. |
| `@CurrentUser()` param decorator | `req.userId` — typed via the **existing** `express-request.d.ts` augmentation. |

**`req.userId` never leaks past the handler.** The handler reads `req.userId` and passes a plain `userId: string` to the use case. Application stays ignorant of Express — the dependency rule holds.

**Verification gate (ADR-015):** the `userId` isolation integration test (user A cannot read user B) and the full curl matrix (health 200 / no key 401 / bad session 401 / valid 200) must pass identically against the Express app before Slice 1 is done.

## Error-handling middleware

Central `(err, req, res, next)` replaces Nest's `HttpException` + exception filters. Handlers do **not** try/catch per-call (unlike today's controllers); they `next(err)` on unexpected errors and return the mapped response on `Result.fail`. The middleware preserves today's guarantees:
- Domain errors → scrubbed status (400/401) with a **fixed** client message; raw input **never** reflected.
- Unexpected errors → logged server-side (stack), generic 500 to the client.
- The `Result<T,E>` exhaustiveness pattern stays in the handler (each known error → its status); the middleware is the safety net for thrown/unexpected failures.

## Handler pattern (per-endpoint slices)

Each feature is a `registrar(router, useCase)` function. The handler: read `req.params`/`req.query`/`req.body` + `req.userId` → `useCase.execute(...)` → translate `Result` → `res.status().json(aDto(...))` or `next(err)`. The **use case and the DTO mapper are imported unchanged** from application/infrastructure. This is the same 20 lines repeated per endpoint — which is why, after Slice 1, the endpoint slices are fast.

## File upload (`ingestas`)

`POST /api/ingestas` uses `multer` as **route-level** middleware (not global) so only this route parses multipart. The current `MulterFileReader` adapter boundary (`IFileReader`) is preserved — the handler adapts `req.file` to the port, and `ProcessIngestaUseCase` is unchanged.

## Test harness

- `supertest` against `createApp(testContainer)` — no live port, no `@nestjs/testing`.
- A **test container** built from `createContainer(fakePrisma)` (or per-use-case fakes) keeps integration tests fast and hermetic.
- Domain/application unit specs: **untouched**, run as-is.
- Guard specs → middleware specs (mirror the current mock pattern in `api-key.guard.spec.ts`).

## Coexistence during build

Both `main.ts` (Nest) and `server.ts` (Express) exist on the branch. `package.json` scripts gain a parallel target (e.g. `start:express`, `test:express`) so either stack runs without collision. At cutover: `main.ts`, `app.module.ts`, all `*.module.ts`, `PrismaService`, `@nestjs/*` deps, and the SWC-for-decorators Vitest config are deleted; `start`/`build`/Render point at the Express entrypoint.

## Slice 0 deliverables (concrete)

1. `create-prisma-client.ts` — plain client factory (logic lifted from `PrismaService`).
2. `container.ts` — full graph assembled with `new`, `shutdown()`, typed `Container` interface. Unit test: `createContainer(fakePrisma)` returns wired use cases.
3. `http-express/app.ts` + `error.middleware.ts` — app skeleton with a trivial health route to prove the harness.
4. `http-express/server.ts` — boot + `$connect` + graceful shutdown (not yet the deployed entrypoint).
5. `supertest` wired; a smoke test hitting `/health` green.
6. `package.json` parallel scripts.

No endpoint is migrated in Slice 0 — it exists to make Slice 1+ trivial.
