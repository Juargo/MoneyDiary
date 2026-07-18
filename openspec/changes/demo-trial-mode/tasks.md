# Tasks: Demo/Trial Mode

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR 1: ~600 / PR 2: ~170 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (backend) → PR 2 (UI) |
| Delivery strategy | force-chained |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Demo backend (schema → ports → use case → rate limiter → cleanup → controller → module) | PR 1 (base: `feat/auth-login-session`) | Self-contained: demo creation, rate limiting, cleanup all work via API |
| 2 | Demo UI (MeDto → DemoBanner → layout → landing config) | PR 2 (base: PR 1 branch) | Depends on PR 1 for `fetchMe.esDemo` |

## PR 1 — Backend (`apps/api`)

### Schema & Data

- [ ] 1.1 Add `esDemo Boolean @default(false)` + `demoCreatedAt DateTime?` to User in `prisma/schema.prisma`; run `prisma migrate dev`
- [ ] 1.2 Create `prisma/demo-data.ts` — static array of 25-35 Chilean transactions (1 sueldo ~$1.2M, necesidades ~60%, deseos ~20%, ahorro ~10%)
- [ ] 1.3 Create `src/infrastructure/http/auth/demo-data-seeder.ts` — maps demo-data definitions to `Prisma.TransaccionCreateManyInput[]` using `BUCKET_IDS` at runtime

### Ports & Application

- [ ] 1.4 Create `src/application/ports/demo-repository.port.ts` — `IDemoRepository` with `crear(CrearDemoInput): Promise<CrearDemoResult>`
- [ ] 1.5 Modify `src/application/ports/user-credential-repository.port.ts` — add `esDemo: boolean` to `IdentidadUsuario`, make `email` nullable (`email: string | null`)
- [ ] 1.6 Create `src/application/use-cases/crear-demo.use-case.ts` — orchestrates demo repo + session repo + token service; returns `{ token, userId, expiresAt }`
- [ ] 1.7 Modify `src/application/use-cases/obtener-identidad.use-case.ts` — passes through `esDemo` from repository

### Infrastructure

- [ ] 1.8 Create `src/infrastructure/http/auth/demo-rate-limiter.ts` — IP-only, 3/hour, mirrors `LoginRateLimiter` pattern (Map, fixed window, lazy eviction)
- [ ] 1.9 Create `src/infrastructure/persistence/prisma-demo.repository.ts` — implements `IDemoRepository` via `Prisma.$transaction` (User+Account+Ingesta+Transacciones)
- [ ] 1.10 Modify `src/infrastructure/persistence/prisma-user-credential.repository.ts` — `buscarIdentidad` returns `esDemo`, allows `email=null` for demo users
- [ ] 1.11 Create `src/infrastructure/http/auth/demo-cleanup.service.ts` — `borrarExpirados()` cascade delete (Session→Transaccion→Ingesta→Account→User), `@Cron('0 3 * * *')`
- [ ] 1.12 Add `@nestjs/schedule` to `apps/api/package.json`; import `ScheduleModule.forRoot()` in module

### Controller & Wiring

- [ ] 1.13 Add `GET /api/auth/demo` to `auth.controller.ts` — `@PublicSession()`, rate-limit check → lazy cleanup → `CrearDemoUseCase` → `Set-Cookie` → `302 /`
- [ ] 1.14 Wire `CrearDemoUseCase`, `PrismaDemoRepository`, `DemoRateLimiter`, `DemoCleanupService`, `DemoDataSeeder` in `auth.module.ts`

### Tests

- [ ] 1.15 `DemoRateLimiter` spec — 3/hr block, window expiry, reset, MAX_ENTRIES eviction
- [ ] 1.16 `CrearDemoUseCase` spec — mock ports, verify call order, name pattern
- [ ] 1.17 `DemoCleanupService` spec — mock Prisma, verify cascade order + cutoff
- [ ] 1.18 `PrismaDemoRepository` spec — mock Prisma, verify $transaction calls
- [ ] 1.19 `DemoDataSeeder` spec — verify valid BUCKET_IDS, 25-35 txns, cargo/abono > 0
- [ ] 1.20 `AuthController` demo spec — mock use case + rate limiter, verify 429/302/cookie

## PR 2 — UI (`apps/web` + `apps/landing`)

- [ ] 2.1 Add `esDemo: boolean` to `MeDto` in `apps/web/src/api/types.ts`; update `esMeDto` guard in `apps/web/src/api/auth.ts`
- [ ] 2.2 Create `apps/web/src/components/DemoBanner.tsx` — sticky dismissable banner with CTA, reads `esDemo` from auth context
- [ ] 2.3 Modify `apps/web/src/routes/_authenticated.tsx` — render `<DemoBanner>` when `esDemo` is true
- [ ] 2.4 Update `apps/landing/src/config.ts` — `PROBAR.url` → `${APP.url}/api/auth/demo`
- [ ] 2.5 Test `DemoBanner` with Vitest + Testing Library — visible for demo, hidden for real, dismiss works

## Blockers

- Requires `feat/auth-login-session` merged (Session model, SessionGuard, cookie infrastructure)
- PR 1 must merge before PR 2 (backend before UI)
