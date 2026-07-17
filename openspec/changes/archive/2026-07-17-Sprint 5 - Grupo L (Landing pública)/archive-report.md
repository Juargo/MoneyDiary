# Archive Report: Sprint 5 — Grupo L (Landing pública)

**Archived on**: 2026-07-17
**Artifact store mode**: hybrid
**Verdict**: PASS WITH WARNINGS (verify-report)

## Change Summary

Public landing page for MoneyDiary (Astro 5 SSG + Tailwind 4). Communicates value prop (50/30/20 budget, traffic-light system, 4 Chilean banks), beta access CTA, SEO, accessibility, and security headers. 100% static — no backend, no secrets in bundle. Deployed via Vercel.

### Scope Delivered

- ✅ `apps/landing/` — Astro 5 workspace with Tailwind 4 via `@tailwindcss/vite`
- ✅ `pnpm landing` script in root `package.json`
- ✅ `src/styles/theme.css` with ~12 Design tokens from `DESIGN.md`
- ✅ `src/config.ts` with site metadata + conditional CTA config
- ✅ `src/layouts/Layout.astro` — HTML shell, OG/Twitter Card SEO meta
- ✅ `src/pages/index.astro` — 6 sections (Hero, ComoFunciona, Bancos, Capturas, CtaBeta, Footer)
- ✅ `src/pages/404.astro`
- ✅ 6 components: Hero, ComoFunciona, Bancos, Capturas, CtaBeta, Footer
- ✅ `public/robots.txt`, `public/favicon.ico`, `public/og-image.png`
- ✅ `apps/landing/vercel.json` — CSP, HSTS, nosniff, Referrer-Policy
- ✅ CI: `landing` job in `.github/workflows/ci.yml` — typecheck, build, secret grep, smoke test
- ✅ `@astrojs/sitemap` — generates `sitemap-index.xml`

### Out of Scope (documented)

- Waitlist with backend (deferred to future sprint)
- Privacy policy page (Track C)
- Analytics (ADR-019 pending)
- Forms with own backend

## Artifact Status

| Artifact | Filesystem Path | Status |
|----------|----------------|--------|
| Proposal | `openspec/changes/archive/2026-07-17-Sprint 5 - Grupo L (Landing pública)/proposal.md` | ✅ Complete |
| Spec (main, no delta) | `openspec/specs/public-landing/spec.md` | ✅ Created (new domain — no delta merge needed) |
| Design | `openspec/changes/archive/2026-07-17-Sprint 5 - Grupo L (Landing pública)/design.md` | ✅ Complete |
| Tasks | `openspec/changes/archive/2026-07-17-Sprint 5 - Grupo L (Landing pública)/tasks.md` | ✅ 18/18 core tasks complete; 2 deferred documented below |
| Apply Progress | Engram #189 | ✅ All phases applied |
| Verify Report | `openspec/changes/archive/2026-07-17-Sprint 5 - Grupo L (Landing pública)/verify-report.md` | ✅ PASS WITH WARNINGS |

### Engram Observation IDs (Traceability)

| Artifact | Engram ID |
|----------|-----------|
| `sdd/{change-name}/proposal` | #182 |
| `sdd/{change-name}/spec` | #184 |
| `sdd/{change-name}/design` | #185 |
| `sdd/{change-name}/tasks` | #187 |
| `sdd/{change-name}/apply-progress` | #189 |
| `sdd/{change-name}/verify-report` | #194 |

## Spec Sync Summary

**Domain**: `public-landing`
**Action**: Created (new domain — no prior main spec existed)

Since this was a new domain, the delta spec WAS the main spec. It was written directly to `openspec/specs/public-landing/spec.md` during the spec phase. No merge was needed during archive.

## Stale-Checkbox Reconciliation

**Reason**: Two CI infrastructure tasks (3.3 axe-core, 3.4 Lighthouse CI) remain unchecked because they require a Vercel preview deployment URL and LHCI token configured in GitHub secrets — infrastructure not yet set up. These are explicitly documented as deferred in the spec, design, apply-progress, and verify-report.

**Proof from verify-report**: 12/12 non-deferred spec scenarios compliant; verdict PASS WITH WARNINGS; 0 CRITICAL issues.

**Orchestrator instruction**: User explicitly instructed to archive ("Archiva el cambio completado"). Verified against apply-progress and verify-report per the exceptional reconciliation procedure.

**Reconciled checkboxes**:
| Task | State | Rationale |
|------|-------|-----------|
| 3.3 — axe-core check | Deferred | Requires Vercel preview URL + LHCI token in CI |
| 3.4 — Lighthouse CI budget gates | Deferred | Requires LHCI token in GitHub secrets |

These remain unchecked in the archived `tasks.md` as intentional deferred items — not stale checkboxes for completed work.

## Known Warnings (from verify-report)

1. **CI secret grep missing `SECRET` keyword**: CI pattern `(API_KEY|DATABASE_URL|-----BEGIN)` does not include `SECRET` as specified in the spec. Not a real leak risk (API_KEY + -----BEGIN cover most scenarios), but should be added.
2. **Bank logos are emoji, not SVGs**: `Bancos.astro` uses emoji placeholders — replace with real bank SVGs when available.
3. **Screenshot placeholders**: `Capturas.astro` renders placeholder divs — replace when actual demo screenshots exist.
4. **Privacy policy link is `#`**: Footer links `/politica-de-privacidad` to `#` — needs a real URL or page.

## Lessons Learned

1. **Astro 5 + Tailwind 4 via `@tailwindcss/vite`** works well for static landing pages — zero JS runtime, fast builds (~470ms).
2. **CI deferred tasks pattern**: Documenting tasks as deferred with explicit blockers (rather than deleting them) preserves the audit trail and makes it clear what's pending for future sprints.
3. **Stacked PRs vs single branch**: Phase 3 was small enough (~50 lines) to add to the existing PR branch instead of a stacked PR — good judgment call.
4. **Secret grep on `dist/`**: Essential for static sites since there's no runtime to filter env vars. CSP in `vercel.json` adds defense-in-depth.
5. **`@astrojs/sitemap` generates `sitemap-index.xml`** even for 2-page sites — `robots.txt` correctly references it.

## Future Work / Technical Debt

| Item | Priority | Effort | Notes |
|------|----------|--------|-------|
| Add `SECRET` to CI grep pattern | Low | 5 min | Add `SECRET` and `PRIVATE_KEY` to the grep regex in `ci.yml` |
| Replace emoji bank logos with SVGs | Low | 1-2h | Source real SVG logos for Banco de Chile, BCI, Santander, Estado |
| Replace screenshot placeholders | Medium | 2-3h | Generate demo screenshots from app with anonymized data |
| Implement privacy policy page | Medium | TBD | Depends on Track C / ADR timeline |
| axe-core CI check (task 3.3) | Medium | 4h | Needs Vercel preview URL + LHCI token in GitHub secrets |
| Lighthouse CI budget gates (task 3.4) | Low | 2h | Needs LHCI token in GitHub secrets |
| Analytics integration | Low | TBD | Blocked on ADR-019 decision |

## Next Steps for the Project

1. Deploy to Vercel from `main` — the `vercel.json`, `astro.config.ts`, and all source are ready
2. Configure domain (`moneydiary.cl` or subdomain) in Vercel project settings
3. Set up LHCI token as GitHub secret for deferred CI tasks
4. Connect CTA links once TestFlight/Play beta links are ready (US-021)

---

*Archived by sdd-archive sub-agent. Orchestrator: user (Jorge). Intentional archive with stale-checkbox reconciliation — 2 deferred CI infrastructure tasks documented.*
