# Proposal: Demo/Trial Mode

## Intent

Let anonymous visitors try MoneyDiary instantly — no email, no password. A "Probar demo" button creates an isolated demo user with realistic Chilean transactions and full app access, gated by rate limiting and auto-cleaned.

## Scope

### In Scope
- Landing "Probar demo" → `GET /api/auth/demo` redirect to dashboard
- Demo user (`esDemo`, no email/password) + 30 pre-seeded Chilean transactions
- Full app functionality in demo mode (upload, classify, everything)
- DemoBanner in web layout with CTA to register
- Rate limiting: 3/hour per IP (`DemoRateLimiter`)
- Lazy + cron cleanup of expired accounts (>7d)

### Out of Scope
- User registration/signup (next change)
- Data migration from demo to real account (start fresh)
- Email verification, password reset
- Mobile demo mode (future)
- Admin panel for demo accounts

## Capabilities

### New Capabilities
- `demo-auth`: Demo user creation (`esDemo` User + Account + Ingesta + ~30 Transacciones), `DemoRateLimiter`, `GET /api/auth/demo` endpoint with 302 redirect, `CrearDemoUseCase`, daily cleanup cron

### Modified Capabilities
- `public-landing`: Landing "Probar" CTA now links to `app.moneydiary.cl/api/auth/demo` instead of app root; spec updated for demo-specific CTA behavior

## Approach

- Landing `<a href="https://app.moneydiary.cl/api/auth/demo">` → cross-domain GET to API
- `AuthController` (`@PublicSession()`): rate-limit check → lazy cleanup → `Prisma.$transaction([User{esDemo}, Account, Ingesta, Transacciones(30), Session])` → `Set-Cookie` → `302 /`
- `DemoRateLimiter`: in-memory Map per-IP, fixed 1h window, mirrors `LoginRateLimiter`
- Cleanup: lazy (on create) + `@nestjs/schedule` cron `0 3 * * *`
- Frontend: `fetchMe.esDemo` drives `<DemoBanner>` in `_authenticated` layout

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/prisma/schema.prisma` | Modified | `esDemo Boolean`, `demoCreatedAt DateTime?` on User |
| `apps/api/prisma/demo-data.ts` | New | ~30 Chilean transactions template |
| `apps/api/src/application/use-cases/crear-demo.use-case.ts` | New | Orchestrates demo user creation |
| `apps/api/src/infrastructure/http/auth/auth.controller.ts` | Modified | `GET /api/auth/demo` endpoint |
| `apps/api/src/infrastructure/http/auth/demo-rate-limiter.ts` | New | Per-IP 3/hour limiter |
| `apps/api/src/infrastructure/persistence/prisma-user-credential.repository.ts` | Modified | Handle `esDemo=true` (no email) in `buscarIdentidad` |
| `apps/web/src/api/types.ts` | Modified | `MeDto.esDemo: boolean` |
| `apps/web/src/components/DemoBanner.tsx` | New | Sticky banner with CTA |
| `apps/landing/src/config.ts` | Modified | `PROBAR.url` → demo endpoint |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Auth branch not merged → blocked | High | Build as branch atop auth-login-session |
| Rate limiter is single-instance (Map) | Low | YAGNI; extractable behind port for future Redis |
| Cleanup cascade deletes wrong records | Med | Transactional `deleteMany` ordered: Session → Transaccion → Ingesta → Account → User |

## Rollback Plan

1. Remove `GET /api/auth/demo` route from `AuthController`
2. Revert `esDemo`/`demoCreatedAt` from schema (additive, safe to roll forward)
3. Restore landing `config.ts` `PROBAR.url` to original
4. Remove `DemoRateLimiter` and `@nestjs/schedule` cron
5. Existing demo accounts: cron self-heals within 24h; or manual `DELETE FROM "User" WHERE "esDemo" = true`

## Dependencies

- `feat/auth-login-session` merged (Session model, SessionGuard, cookie infrastructure)
- `@nestjs/schedule` for daily cleanup cron

## Success Criteria

- [ ] Anonymous visitor clicks "Probar demo" → lands on dashboard with 30+ seeded transactions
- [ ] DemoBanner visible at layout top indicating demo mode + CTA to register
- [ ] 4th demo attempt from same IP within 1 hour returns 429
- [ ] Demo accounts >7d are deleted (lazy + cron verified)
- [ ] Demo user can upload a cartola and see it classified in their account
