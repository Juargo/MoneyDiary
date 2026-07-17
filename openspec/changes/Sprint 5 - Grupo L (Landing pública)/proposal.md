# Proposal: Sprint 5 — Grupo L (Landing pública)

## Intent

Publicar la landing page de MoneyDiary: cualquier persona puede visitarla, entender la propuesta de valor (50/30/20 + semáforo, 4 bancos chilenos) y acceder a la beta. Sin backend, sin secretos en el bundle.

## Scope

### In Scope
- Scaffold `apps/landing` (Astro 5 SSG + Tailwind 4 via `@tailwindcss/vite`) + shortcut raíz `pnpm landing`
- CI: job build + typecheck en `.github/workflows/ci.yml`
- Hero, cómo funciona, capturas demo anonimizadas, bancos, CTA beta condicional
- Accesibilidad WCAG 2.2 AA + axe automatizado en CI
- Lighthouse perf ≥90, a11y ≥95
- Deploy Vercel + dominio (fallback `*.vercel.app`) + subdominio `app.moneydiary.cl`
- SEO: metatags, OG/Twitter Card, `sitemap.xml`, `robots.txt`, favicon
- Headers seguridad: CSP restrictiva, `nosniff`, `Referrer-Policy`, HSTS
- Smoke test post-deploy + `curl -I` de headers

### Out of Scope
- Waitlist con backend (diferida)
- Política de privacidad (vive en Track C)
- Analítica (ADR-019 pendiente)
- Formularios con backend propio (landing 100% estática)

## Capabilities

### New Capabilities
- `public-landing`: Landing page pública con propuesta de valor, CTA beta, SEO, y despliegue Vercel

### Modified Capabilities
- None (la landing no cambia requisitos de specs existentes)

## Approach

| Capa | Decisión |
|------|----------|
| Stack | Astro 5 SSG + Tailwind 4 (misma versión que `apps/web`) |
| Design tokens | Reusar paleta DESIGN.md (Material 3, Inter) en `@theme` CSS |
| CTA beta | Link TestFlight/Play si existe, fallback email. Markup estático condicional, sin backend |
| Capturas | Generar desde app mobile con datos demo anonimizados (mismo criterio que fixtures `-test`) |
| CI | Nuevo job `landing` en ci.yml: `pnpm landing exec astro check && pnpm landing build` + grep de secretos |
| Deploy | Proyecto Vercel + deploy automático desde `main`. Dominio se define en sprint |
| Headers | Configurar en `vercel.json` (CSP, HSTS, nosniff, Referrer-Policy) |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/landing/` | New | Workspace Astro 5 |
| `package.json` (root) | Modified | Agregar script `"landing": "pnpm --filter @moneydiary/landing"` |
| `.github/workflows/ci.yml` | Modified | Agregar job `landing` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `minimum-release-age` bloquea Astro | Medium | Pin `astro@5.6.x` (estable conocida) |
| Dominio no definido al publicar | Medium | `*.vercel.app` funciona día 1; dominio se conecta después |
| Links beta inactivos (US-021) | High | Fallback email definido en contenido; link se actualiza sin deploy |

## Rollback Plan

1. Revertir PR de scaffold `apps/landing` + cambio `package.json`
2. Revertir cambios en `.github/workflows/ci.yml`
3. Vercel: desactivar proyecto / apuntar dominio al estado anterior
4. Sin migraciones ni datos — rollback es seguro y completo

## Dependencies

- ADR-025 (Astro 5 decidido)
- US-021 (links beta — condicional, no bloqueante)
- Dominio (se define durante sprint, `*.vercel.app` es suficiente)

## Success Criteria

- [ ] Landing visitable en `moneydiary.cl` o `*.vercel.app`
- [ ] Lighthouse CI: perf ≥90, a11y ≥95
- [ ] axe audit sin violaciones WCAG 2.2 AA
- [ ] Build libre de secretos (grep CI pasa)
- [ ] Headers de seguridad verificados (`curl -I` smoke test)
- [ ] SEO: OG/Twitter Card, `sitemap.xml`, `robots.txt`, `favicon` presentes
