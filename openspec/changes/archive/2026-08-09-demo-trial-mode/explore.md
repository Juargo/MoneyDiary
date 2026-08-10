## Exploration: Demo/Trial Mode

### Current State

**Auth (feat/auth-login-session branch — NOT merged to main):**
- Session model with `tokenHash`, `expiresAt`, `userId` — 7-day TTL, SHA-256 hashed tokens
- `SessionGuard` validates sessions via cookie (`md_session`) OR Bearer header, dual transport
- `LoginUseCase` requires email+password → hasher verify → session create (no "anonymous" path)
- `IUserCredentialRepository.buscarPorEmail` returns `null` for unknown emails OR users without `passwordHash`
- `PrismaUserCredentialRepository.buscarIdentidad` returns `null` if user has no email — currently no `esDemo` flag
- Rate limiter exists: `LoginRateLimiter` — per-IP + per-email, in-Memory Map, fixed window
- Cookie config: `Path=/`, `HttpOnly`, `SameSite=Strict`, `Secure` in production — no `Domain=` attribute (host-only)

**Schema (auth branch vs main):**
- User model on **auth branch**: `id`, `nombre`, `email` (optional, unique), `passwordHash` (optional), `creadoEn`, `accounts[]`, `sessions[]`
- User model on **main branch**: `id`, `nombre`, `creadoEn`, `accounts[]` — simpler, no auth fields
- Session model EXISTS only on auth branch
- No `esDemo` flag exists anywhere yet

**Landing page (Astro static site):**
- `config.ts` has `PROBAR` entry: `{ url: APP.url, label: 'Probar' }` — currently links directly to web app URL
- `Header.astro` renders two buttons: "Probar" and "Ingresar" — both link externally
- Landing is a Vercel-deployed static site
- The "Probar" button today goes to `APP.url` (`http://localhost:5173` in dev) — no API demo flow exists

**Web app:**
- TanStack Router with routes: `/` (resumen), `/buckets/$bucket`, plus `/login` and `/_authenticated` pathless layout on auth branch
- `_authenticated.tsx` runs `requireSession(fetchMe)` in `beforeLoad` — redirects to `/login` on 401
- Current route tree (main branch) has NO `_authenticated` or `/login` — those only on auth branch
- No demo mode awareness anywhere

**Seed:**
- Single fixed user (`USER_ID_FIJO = 'usuario-fijo-moneydiary'`)
- Email/password from env vars (optional backfill) via `Argon2PasswordHasher`
- Fixed Account, 5 BucketPresupuesto, 22 patrones chilenos

### Affected Areas

- `apps/api/prisma/schema.prisma` — Add `esDemo` and `demoCreatedAt` fields to User; demo user has `email=null, passwordHash=null, esDemo=true`; cascade delete scope
- `apps/api/src/infrastructure/persistence/prisma-user-credential.repository.ts` — `buscarIdentidad` needs to handle demo users (return userId + null email)
- `apps/api/src/domain/value-objects/email.ts` — No change needed; demo has no email
- `apps/api/src/application/ports/user-credential-repository.port.ts` — `IdentidadUsuario` may need `esDemo` field
- `apps/api/src/application/ports/reloj.port.ts` — Already exists for time injection
- `apps/api/src/application/use-cases/` — New: `CrearDemoUseCase` (or similar)
- `apps/api/src/infrastructure/http/auth/auth.controller.ts` — New `GET /api/auth/demo` endpoint
- `apps/api/src/infrastructure/http/auth/auth.module.ts` — Wire new use case + rate limiter
- `apps/api/src/infrastructure/http/auth/` — New: `demo-rate-limiter.ts`
- `apps/api/src/infrastructure/http/auth/cookie.ts` — May need `Domain=` attribute for shared cookie
- `apps/api/src/infrastructure/http/auth/session.guard.ts` — Demo user passes SessionGuard no change (same session validation)
- `apps/api/src/application/use-cases/obtener-identidad.use-case.ts` — Return `esDemo` flag
- New: `apps/api/src/domain/value-objects/demo-user.ts` or similar domain logic
- New: demo data template — `apps/api/prisma/demo-data.ts` with realistic Chilean transactions
- New: seed function for demo data
- New: cleanup cron — scheduled job or separate module
- `apps/web/src/api/types.ts` — `MeDto` needs `esDemo` field
- `apps/web/src/api/auth.ts` — `fetchMe` return type updated
- `apps/web/src/api/client.ts` — No change needed
- `apps/web/src/routes/_authenticated.tsx` — No change (same session guard)
- `apps/web/src/lib/require-session.ts` — No change for login gate; banner component checks `fetchMe.esDemo`
- `apps/web/src/components/` — New: `DemoBanner` component in layout
- `apps/web/src/routes/__root.tsx` — Render `DemoBanner` when `esDemo` is true
- `apps/landing/src/config.ts` — Update `PROBAR.url` to demo endpoint
- `apps/landing/src/components/Hero.astro` — Or Header.astro: add "Probar demo" button wired to demo endpoint
- `apps/web/vite.config.ts` — No change (same proxy pattern)
- `.env.example` / env config — `DEMO_RATELIMIT_MAX_IP=3`, `DEMO_SESSION_TTL=7d`

### Approaches

#### A. User Model: esDemo flag location

| Approach | Pros | Cons | Effort |
|----------|------|------|--------|
| A1: Add `esDemo Boolean @default(false)` on User | Simple, single model, one table | Demo user has optional fields (email=null) that could complicate queries | Low |
| A2: Separate DemoProfile model linked to User | Cleaner separation, nullable-free base User | Extra JOIN on every demo auth check, more migrations | Medium |
| A3: Use a second User with special email prefix (e.g., demo+uuid@moneydiary.cl) | No schema change needed | Bypasses Email VO validation, pollutes unique constraint, timing equalization breaks | Low (but dirty) |

**Recommendation**: A1 — Add `esDemo Boolean @default(false)` AND `demoCreatedAt DateTime?` to User. Simple, KISS. Demo users have `email=null, passwordHash=null, esDemo=true`.

#### B. Demo Data Seeding Strategy

| Approach | Pros | Cons | Effort |
|----------|------|------|--------|
| B1: Copy-on-create — Template module with realistic transactions, inserted per demo user via Prisma createMany | Each demo user has their OWN data (isolated), realistic 50/30/20 distribution | More writes on demo creation, cleanup needs cascade delete | Medium |
| B2: Shared read-only demo data — All demo users read from a shared "demo" Account | Zero writes per demo user, instant, trivial cleanup | NOT isolated — data mutations affect all demo users, complexity for multitenancy | Low (but fragile) |
| B3: Hybrid — Seed one "demo template" set, clone with new IDs per user | Isolated + template-based | Complex cloning logic, two-step process | High |

**Recommendation**: B1 — Copy-on-create. Template in `prisma/demo-data.ts`. Realistic Chilean data (~25-35 transactions per month), created via the same repositories the real pipeline uses. Each demo user gets their own Account, own Ingesta records, own Transaccion rows. Simple cascade cleanup.

#### C. Redirect Flow Architecture

| Approach | Pros | Cons | Effort |
|----------|------|------|--------|
| C1: GET /api/auth/demo → creates session → 302 redirect to web app | Clean UX, single round trip, works as direct link from landing | Cookie domain must match web app domain; landing domain ≠ web domain | Medium |
| C2: POST /api/auth/demo → returns JSON with token → client-side redirect | Flexible (works for mobile too), explicit | Landing page needs JS, more complex on Astro static site | Medium |
| C3: Landing button → web app → web app detects "new demo needed" → calls API | Keeps landing simple (just links to app), all logic in web app | Extra round trip, the app needs to know it's a first visit, more complex UX | Medium |

**Recommendation**: C1 — GET `/api/auth/demo` with 302 redirect. The endpoint MUST be on the SAME domain as the web app (so the cookie is set correctly). The landing page links to `app.moneydiary.cl/api/auth/demo` which:
1. Creates demo user + Account + Ingesta + Transacciones (all via same Prisma transactions)
2. Creates Session with 7-day token
3. Sets cookie via `Set-Cookie` header
4. Returns `302 Location: app.moneydiary.cl/`

**Cookie domain consideration**: If landing is `moneydiary.cl` and web app is `app.moneydiary.cl`, the cookie needs `Domain=.moneydiary.cl` OR the demo endpoint must be on the same domain as the web app. The second approach is simpler: demo endpoint lives at `app.moneydiary.cl/api/auth/demo`.

#### D. Demo Banner — User Identity

| Approach | Pros | Cons | Effort |
|----------|------|------|--------|
| D1: fetchMe returns `esDemo` boolean | Simple, single `me` call gives all context | Frontend needs to pass flag through auth context | Low |
| D2: Separate endpoint `GET /api/auth/is-demo` | Separation of concerns | Extra API call on EVERY page load | Low |
| D3: Session token encodes demo status (e.g., prefix `demo_`) | No extra query | Breaks token opacity, URL-parseable | Low (dirty) |

**Recommendation**: D1 — Extend `MeDto` to include `esDemo: boolean`. The `_authenticated` layout or `__root` layout reads `esDemo` from the auth context (already has it via `requireSession` / `fetchMe` call) and renders a sticky `<DemoBanner>`. No extra API call.

#### E. Rate Limiting

| Approach | Pros | Cons | Effort |
|----------|------|------|--------|
| E1: Per-IP counter (3/hour), in-Memory Map, mirrors LoginRateLimiter pattern | Consistent with existing code, KISS | Lost on server restart (memory), not distributed | Low |
| E2: Per-IP counter via DB (Redis or Prisma) | Survives restart, distributed | Over-engineering for MVP (single Render instance), Redis infra | High |

**Recommendation**: E1 — New `DemoRateLimiter` class, same pattern as `LoginRateLimiter` but IP-only (no email dimension). Config: `DEMO_RATELIMIT_MAX_IP=3`, `DEMO_RATELIMIT_WINDOW_MS=3600000` (1 hour). In-memory Map, fixed window, lazy eviction with MAX_ENTRIES cap.

#### F. Cleanup Mechanism

| Approach | Pros | Cons | Effort |
|----------|------|------|--------|
| F1: Lazy cleanup — Check `creadoEn` on demo actions, delete if >7d | No infra needed, happens naturally | Data accumulates until a demo action triggers cleanup | Low |
| F2: Cron job via `@nestjs/schedule` — Daily cleanup of expired demo users | Deterministic cleanup, scheduled | Requires `@nestjs/schedule` dep, cron config | Medium |
| F3: Prisma migration with TTL index + database-level cascade | No app code needed | TTL index requires PostgreSQL extension (`pg_cron`), complex migration | High |

**Recommendation**: F1 + F2 — Both. Lazy cleanup in the demo creation path (delete expired demos before creating new ones) AS source of truth + scheduled daily cron as a safety net. The cron uses Prisma deleteMany with `where: { esDemo: true, demoCreatedAt: { lt: cutoffDate } }`. Cascade deletes handle related records. Requires `@nestjs/schedule` module.

#### G. Demo Data Realism

**Recommendation**: A month's worth of Chilean transactions showing ~50/30/20 distribution:
- **Income** (1 transaction): ~$1,200,000 sueldo
- **Needs** (~60%): Arriendo $400K, Isapre ~$90K, Gastos comunes ~$50K, Supermercado (Líder/Jumbo) ~$200K, Bencina ~$60K, Agua/Luz/Internet ~$80K
- **Wants** (~20%): Netflix ($7K), Spotify ($5K), Salidas a comer ($60K), Cine/entretención ($20K), Rappi/Uber Eats ($40K)
- **Savings** (~10%): Transferencia a cuenta de ahorro ($120K)
- Total spending should be realistic for a Chilean professional in Santiago

### Architecture Proposal

**Domain Layer:**
- No new domain entities needed — demo user is a User with `esDemo=true`
- New domain function/service for generating a demo display name like "Demo-" + cuid prefix

**Application Layer:**
- New use case: `CrearDemoUseCase` — orchestrates demo creation:
  1. Rate-limit check (injected `DemoRateLimiter`)
  2. Lazy cleanup of expired demos
  3. Create User with `esDemo=true, email=null, passwordHash=null, nombre=randomDemoName`
  4. Create Account linked to demo user (one account, e.g., Banco Estado)
  5. Create Ingesta record (PROCESADA, no real file)
  6. Create ~25-35 Transaccion records in that ingesta (demo data from template)
  7. Create Session with 7-day TTL
  8. Return `{ token, userId, expiresAt }` — same shape as `LoginUseCase`
- Updated: `ObtenerIdentidadUseCase` — returns `esDemo` flag

**Infrastructure Layer:**
- New endpoint: `GET /api/auth/demo` on `AuthController` (marked `@PublicSession()`)
- New: `DemoRateLimiter` — per-IP, 3/hour, mirrors `LoginRateLimiter` pattern
- New: `DemoDataSeeder` — service that generates demo transactions
- Updated: `PrismaUserCredentialRepository.buscarIdentidad` — handles demo users (returns `{ userId, email: null, esDemo: true }`)
- Cookie: Same `serializeSessionCookie` — no change needed if endpoint is on web app domain
- Cron: `@nestjs/schedule` module with `@Cron('0 3 * * *')` for daily cleanup at 3 AM

**Schema changes:**
```prisma
model User {
  id            String    @id @default(cuid())
  nombre        String
  email         String?   @unique
  passwordHash  String?
  esDemo        Boolean   @default(false)
  demoCreatedAt DateTime?
  creadoEn      DateTime  @default(now())
  accounts      Account[]
  sessions      Session[]
}
```

No cascade configuration in Prisma — cleanup is explicit via `deleteMany` on each related table in transaction order: Session → Transaccion → Ingesta → Account → User.

**Frontend:**
- `MeDto` gets `esDemo: boolean`
- New `<DemoBanner>` component — sticky banner at top of `_authenticated` layout
- `<DemoBanner>` renders: "🔍 Estás usando MoneyDiary en modo demostración. Los datos mostrados son de ejemplo. Crea tu cuenta para empezar a controlar tus finanzas." + CTA button
- Banner is dismissable (localStorage) or persistent per session

**Landing page:**
- `PROBAR.url` points to `app.moneydiary.cl/api/auth/demo` (or the production URL)
- The redirect endpoint responds at that URL with a 302
- Button label: "Probar demo"

**Flow diagram (pseudocode):**
```
GET /api/auth/demo → 
  1. Get client IP
  2. DemoRateLimiter.isBlocked(ip)? → 429
  3. DemoRateLimiter.recordFailure(ip) [optimistic]
  4. Lazy cleanup: deleteAllExpiredDemos()
  5. Create user + account + ingesta + transactions (Prisma transaction)
  6. Create session token
  7. DemoRateLimiter.reset(ip)
  8. Set-Cookie: md_session=...
  9. 302 → /
```

### Risks

- **Auth branch not merged yet**: The demo feature depends on the Session model, SessionGuard, and session cookie infrastructure. If we build on the auth branch, we MUST wait for it to merge OR build on a branch that depends on it. The complexity of the auth chain merge means we can't ship demo mode until auth-login-session is merged to main.
- **Cookie domain mismatch**: If landing is at `moneydiary.cl` and web app is at `app.moneydiary.cl`, the demo redirect endpoint must be on `app.moneydiary.cl` for the cookie to work. The landing link `<a href="https://app.moneydiary.cl/api/auth/demo">` is a cross-domain link — no CORS issues (it's a GET redirect, not XHR), and the cookie set by the 302 response will be for `app.moneydiary.cl`'s domain. The browser will then redirect to `app.moneydiary.cl/` which already has the cookie. This works!
- **Cleanup cascade complexity**: Deleting a demo user must delete: Sessions → Transacciones → Ingestas → Accounts → User. Need to ensure ORDERED deleteMany in a transaction, and verify no orphan FK constraints.
- **Demo data staleness**: If bucket IDs or classification patterns change in a migration, the demo data may have `bucketId` pointing to non-existent buckets. The demo seeder must read current bucket IDs from `BUCKET_IDS` constant (which already exists).
- **Demo user enumeration**: An attacker could create 3 demo accounts/hour per IP and fill the DB. Rate limiter mitigates this, plus cleanup cron is a safety net.
- **Rate limiter on a Map is single-instance**: If we scale to multiple Render instances, the IP count is per-instance. YAGNI for MVP.
- **Mobile app demo flow**: If mobile also needs demo mode, the approach differs (POST + Bearer token per C2). Currently mobile uses POST/login → Bearer token stored in `expo-secure-store`. A mobile demo would follow the same pattern. This is deferred.

### Ready for Proposal
Yes — full architecture is clear. Ready for `sdd-propose`. The feature is medium-sized, well-contained, and directly extends the existing auth infrastructure. Recommend starting proposal after feat/auth-login-session merges to main, OR as a dependent branch off the tracker branch.
