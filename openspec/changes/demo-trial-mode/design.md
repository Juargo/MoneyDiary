# Design: Demo/Trial Mode

## Technical Approach

Demo mode creates ephemeral User accounts (`esDemo=true`) with a pre-seeded Chilean transaction set, gated by per-IP rate limiting (3/hr). A single `GET /api/auth/demo` → rate check → lazy cleanup → transactional create (User+Account+Ingesta+30 Transacciones+Session) → `Set-Cookie` → 302 redirect. Cleanup is dual: lazy (before each create) + daily cron. Extends `feat/auth-login-session` — no new domain entities, no new NestJS modules.

## Architecture Decisions

| Option | Tradeoffs | Decision |
|--------|-----------|----------|
| New `DemoUser` entity vs User+esDemo | New entity adds ceremony; User with nullable email already supports the pattern | **User+esDemo** — `esDemo Boolean @default(false)`, `demoCreatedAt DateTime?` on User |
| Static template vs factory vs seed function | Static = predictable/testable; factory = nondeterministic; seed = infra coupling | **Static TS module** `prisma/demo-data.ts` — 30 hardcoded Chilean transactions, bucket assignments via `BUCKET_IDS` |
| New DemoModule vs AuthModule | Demo IS auth (session creation); AuthModule already wires session/cookie infra | **AuthModule** — add providers: `CrearDemoUseCase`, `DemoRateLimiter`, `DemoCleanupService` |
| Cleanup: lazy+cron vs cron-only | Lazy prevents DB bloat before creates; cron catches missed cleanup | **Both** — `DemoCleanupService` called by controller (lazy) + `@nestjs/schedule` cron 0 3 * * * |
| Use case with PrismaService vs repository ports | Direct Prisma in use case breaks Clean Arch | **New `IDemoRepository` port** — one `$transaction` for User+Account+Ingesta+Transacciones |
| Cookie domain strategy | Demo endpoint on `app.moneydiary.cl` → same-domain cookie; landing links cross-domain (GET redirect, no CORS) | **No `Domain=` attribute** — host-only cookie on `app.moneydiary.cl` |

## Data Flow

```
Visitor → moneydiary.cl → click "Probar demo"
  → GET https://app.moneydiary.cl/api/auth/demo
  → [@PublicSession()] AuthController.demo(req,res)
    → DemoRateLimiter.isBlocked(ip)? → 429
    → DemoCleanupService.borrarExpirados(reloj.ahora())
    → CrearDemoUseCase.execute()
      → IDemoRepository.crear({ nombre })
        Prisma.$transaction([
          user.create({ esDemo, demoCreatedAt, nombre }),
          account.create({ userId, banco, tipoCuenta, ... }),
          ingesta.create({ accountId, estado: PROCESADA }),
          transaccion.createMany(30 items)
        ])
      → ISessionTokenService.generar()
      → ISessionRepository.crear({ userId, tokenHash, expiresAt })
    → serializeSessionCookie(token, expiresAt)
    → 302 Location: /
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modify | +`esDemo Boolean @default(false)`, +`demoCreatedAt DateTime?` on User |
| `prisma/demo-data.ts` | Create | 30 Chilean transaction definitions (static array, BUCKET_IDS references) |
| `src/application/ports/demo-repository.port.ts` | Create | `IDemoRepository.crear(input): CrearDemoResult` |
| `src/application/ports/user-credential-repository.port.ts` | Modify | `IdentidadUsuario` gets `email: string \| null`, `esDemo: boolean` |
| `src/application/use-cases/crear-demo.use-case.ts` | Create | Orchestrate demo creation via ports |
| `src/application/use-cases/obtener-identidad.use-case.ts` | Modify | Return `esDemo` in result |
| `src/infrastructure/http/auth/demo-rate-limiter.ts` | Create | Per-IP 3/hr, in-memory Map, mirrors `LoginRateLimiter` |
| `src/infrastructure/http/auth/demo-cleanup.service.ts` | Create | Cascade delete: Session→Transaccion→Ingesta→Account→User |
| `src/infrastructure/http/auth/demo-data-seeder.ts` | Create | Reads `demo-data.ts`, seeds per-user transacciones with BUCKET_IDS |
| `src/infrastructure/persistence/prisma-demo.repository.ts` | Create | `IDemoRepository` impl, Prisma.$transaction |
| `src/infrastructure/persistence/prisma-user-credential.repository.ts` | Modify | `buscarIdentidad` returns `esDemo`, allows `email=null` |
| `src/infrastructure/http/auth/auth.controller.ts` | Modify | +`GET /api/auth/demo` endpoint |
| `src/infrastructure/http/auth/auth.module.ts` | Modify | Wire demo providers + `ScheduleModule.forRoot()` |
| `apps/api/package.json` | Modify | +`@nestjs/schedule` dependency |
| `apps/web/src/api/types.ts` | Modify | `MeDto.esDemo: boolean` |
| `apps/web/src/api/auth.ts` | Modify | `esMeDto` guard checks `esDemo` |
| `apps/web/src/components/DemoBanner.tsx` | Create | Sticky dismissable banner, reads `esDemo` from auth context |
| `apps/web/src/routes/_authenticated.tsx` | Modify | Render `<DemoBanner>` when `esDemo` is true |
| `apps/landing/src/config.ts` | Modify | `PROBAR.url` → `https://app.moneydiary.cl/api/auth/demo` |

## Interfaces / Contracts

```typescript
// application/ports/demo-repository.port.ts
export interface CrearDemoInput {
  readonly nombre: string;
}
export interface CrearDemoResult {
  readonly userId: string;
  readonly accountId: string;
}
export interface IDemoRepository {
  crear(input: CrearDemoInput): Promise<CrearDemoResult>;
}
export const DEMO_REPOSITORY = 'IDemoRepository';

// Updated: IdentidadUsuario
export interface IdentidadUsuario {
  readonly userId: string;
  readonly email: string | null;
  readonly esDemo: boolean;
}
```

```typescript
// Updated MeDto (web/src/api/types.ts)
export interface MeDto {
  readonly userId: string;
  readonly email: string | null;
  readonly esDemo: boolean;
}
```

```typescript
// DemoCleanupService — infra service, no port needed
export class DemoCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: IReloj,
  ) {}

  async borrarExpirados(): Promise<number> {
    const cutoff = new Date(this.reloj.ahora().getTime() - 7 * 24 * 60 * 60 * 1000);
    const demos = await this.prisma.user.findMany({
      where: { esDemo: true, demoCreatedAt: { lt: cutoff } },
      select: { id: true },
    });
    if (demos.length === 0) return 0;
    const ids = demos.map(u => u.id);
    return this.prisma.$transaction(async tx => {
      await tx.session.deleteMany({ where: { userId: { in: ids } } });
      await tx.transaccion.deleteMany({ where: { account: { userId: { in: ids } } } });
      await tx.ingesta.deleteMany({ where: { account: { userId: { in: ids } } } });
      await tx.account.deleteMany({ where: { userId: { in: ids } } });
      const { count } = await tx.user.deleteMany({ where: { id: { in: ids } } });
      return count;
    });
  }
}
```

## Key Design Details

### DemoDataTemplate (`prisma/demo-data.ts`)
- Static `const DEMO_TRANSACCIONES: DemoTransaccionDef[]` — 30 records
- Each entry: `{ descripcion, cargo, abono, bucketKey: Bucket, daysAgo: number }`
- Bucket assigned via `BUCKET_IDS[entry.bucketKey]` at seeder runtime
- Distribution: 1 income (Ingreso, ~$1.2M) + needs ~60% + wants ~20% + savings ~10%
- Realistic Chilean descriptions: "Sueldo", "Arriendo", "Isapre", "Lider", "Netflix", etc.

### DemoDataSeeder
- Receives `(transactionDefs, bucketIds, accountId, ingestaId, ahora)`
- Returns `Prisma.TransaccionCreateManyInput[]` — maps `daysAgo` to actual dates, assigns bucketIds

### DemoRateLimiter
- Constructor: `(maxAttemptsPerIp=3, windowMs=3600000, ahora=Date.now, maxEntries=10000)`
- Methods: `isBlocked(ip): boolean`, `recordFailure(ip): void`, `reset(ip): void`
- Key prefix: `demo:ip:{ip}` (avoids collision with LoginRateLimiter keys)

### DEMO-AUTH-03 (reuse valid session)
- Controller checks `extractToken(req)` — if present and valid, skip creation and redirect
- Implementation: call `ValidarSesionUseCase` first; if valid AND user is demo, return 302 directly

### DEMO-AUTH-04 (expired → fresh)
- If `ValidarSesionUseCase` fails or userId is not demo, fall through to creation path

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | CrearDemoUseCase | Mock IDemoRepository + ISessionRepository; verify call order, name generation |
| Unit | DemoRateLimiter | Mirror LoginRateLimiter tests: 3/hr block, window reset, MAX_ENTRIES eviction |
| Unit | DemoDataSeeder | Verify output references valid BUCKET_IDS, 25-35 txns, cargo/abono > 0 |
| Unit | DemoCleanupService | Mock Prisma; verify cascade order + cutoff calculation |
| Integration | Demo creation | Real DB: `GET /api/auth/demo` → verify User+Account+Ingesta+Session created |
| Integration | Rate limit | 4 sequential requests → 4th returns 429 |
| Integration | Session reuse | Create demo, call endpoint again → same session, no new user |
| Integration | Cleanup cron | Create demo, fast-forward clock, verify cascade deletion |
| Integration | Demo user `/me` | `esDemo=true`, `email=null` in response |

## Migration / Rollout

- Prisma migration: additive only (`esDemo`, `demoCreatedAt`) — no rollback needed
- Add `@nestjs/schedule` to `apps/api/package.json` dependencies
- Deploy as chained PR on top of `feat/auth-login-session` merge (PR #1: auth-login-session → main, PR #2: demo-trial-mode → main)
- Landing config: update `PROBAR.url` to point to the web app domain
- Existing demo accounts: none on first deploy (fresh feature)

## Delivery Slicing

Given the 400-line review guard, the feature splits into 2 stacked PRs:

| Slice | Scope | Est. Size | Rationale |
|-------|-------|-----------|-----------|
| **PR 1: Demo backend** | Schema + ports + CrearDemoUseCase + DemoRateLimiter + DemoCleanupService + controller + module wiring | ~350 lines | Self-contained: demo creation works, rate-limited, cleanup runs |
| **PR 2: Demo UI** | MeDto/esDemo + DemoBanner + landing config + type guard updates | ~150 lines | Depends on PR 1 for `/me` returning `esDemo`; purely frontend changes |

Both target `main` sequentially (PR 1 merges first, PR 2 rebases).

## Open Questions

- [ ] `SameSite=Strict` on 302 redirect: same domain (`app.moneydiary.cl`), so no cross-site issue — verify with integration test
- [ ] DemoBanner dismissal UX: localStorage vs sessionStorage vs in-memory? SessionScope (in-memory) aligns with "per session" spec — no need to persist dismissal
