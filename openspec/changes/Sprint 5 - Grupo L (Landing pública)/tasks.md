# Tasks: Sprint 5 — Grupo L (Landing pública)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~700 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 |
| Delivery strategy | ask-always |
| Chain strategy | stacked-to-main (user resolved) |

Decision needed before apply: Yes → Stacked PRs (stacked-to-main) accepted
Chained PRs recommended: Yes → Stacked PRs (stacked-to-main) accepted
Chain strategy: stacked-to-main
400-line budget risk: High → Mitigated via stacked PRs (PR 1 = ~200 lines)

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Scaffold + CI foundation | PR 1 | apps/landing/, configs, theme, CI job (typecheck + build). Base = main. |
| 2 | Layout + Components + SEO | PR 2 | Layout, 6 components, pages, config.ts usage. Base = main (depends only on scaffold existing, not on CI). |
| 3 | Security + deploy + verification gates | PR #47 (same branch) | vercel.json headers, CI secret grep, smoke test, sitemap. axe & LHCI deferred. |

## Phase 1: Foundation

- [x] 1.1 Create apps/landing/ with package.json, tsconfig.json, astro.config.ts
- [x] 1.2 Add `"landing"` shortcut to root package.json
- [x] 1.3 Create src/styles/theme.css with @theme tokens (primary, surface, fonts, radius)
- [x] 1.4 Create src/config.ts with site metadata and conditional CTA config
- [x] 1.5 Create public/robots.txt and add public/favicon.ico
- [x] 1.6 Add `landing` job to .github/workflows/ci.yml (typecheck + build)
- [x] 1.7 Verify: pnpm install, typecheck, build → dist/ exists

## Phase 2: Layout + Components + SEO

- [x] 2.1 Create src/layouts/Layout.astro with HTML shell, SEO meta (OG, Twitter Card), nav + footer slots
- [x] 2.2 Create src/pages/index.astro composing all 6 sections
- [x] 2.3 Create src/pages/404.astro
- [x] 2.4 Create src/components/Hero.astro (headline, subtitle, CTA, above-fold)
- [x] 2.5 Create src/components/ComoFunciona.astro (3-step 50/30/20 explainer)
- [x] 2.6 Create src/components/Bancos.astro (4 Chilean bank logos grid)
- [x] 2.7 Create src/components/Capturas.astro (demo screenshot gallery)
- [x] 2.8 Create src/components/CtaBeta.astro (conditional link/email from config.ts)
- [x] 2.9 Create src/components/Footer.astro (links, copyright)
- [x] 2.10 Add og-image.png to public/
- [x] 2.11 Verify: all sections render, responsive 375/768/1280px, CTA correct, SEO meta present

## Phase 3: Security + Verification

- [x] 3.1 Create apps/landing/vercel.json with CSP, HSTS, nosniff, Referrer-Policy
- [x] 3.2 Add secret grep (API_KEY|DATABASE_URL|-----BEGIN) to CI landing job
- [ ] 3.3 Add axe-core check to CI landing job *(deferred — requires Vercel preview URL + LHCI token setup)*
- [ ] 3.4 Add Lighthouse CI budget gates (perf ≥90, a11y ≥95) *(deferred — requires LHCI token in GitHub secrets)*
- [x] 3.5 Smoke test: serve dist/ locally + curl for 200 in CI

### Phase 3 Extra (sitemap)

- [x] Install @astrojs/sitemap and configure in astro.config.ts
- [x] Generate sitemap-index.xml automatically on build (robots.txt already referenced it)
