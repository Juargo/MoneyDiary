# Proposal: Landing Page Visual Restructure

## Intent
Match monefy.com's visual maturity — real assets (SVG bank logos, app screenshots), expanded design tokens, new sections (FAQ, social proof, newsletter).

## Scope

### In Scope
- Real SVG logos for 4 banks (BancoEstado, Chile, BCI, Santander)
- Real app screenshots replacing placeholder frames
- Social proof bar with stats near hero
- Static FAQ accordion component
- Newsletter form (ConvertKit/Mailchimp, client-side)
- Expand tokens: 5 → ~15 (surface levels, secondary, typography from DESIGN.md)
- Visual hierarchy/spacing polish
- Footer privacy link fix

### Out of Scope
- Testimonials (no beta users), Guides & tools (no content), Backend API changes

## Capabilities

### New Capabilities
- `newsletter-subscription`: Email capture with third-party SaaS (ConvertKit/Mailchimp) — client-side only, no NestJS

### Modified Capabilities
- `public-landing`: SVG logos, real screenshots, expanded tokens, FAQ accordion, social proof bar, footer link fix

## Approach
1. **Tokens** — expand `theme.css` with DESIGN.md (surface levels, secondary, typography)
2. **Assets** — source bank SVGs, generate mobile screenshots with demo data
3. **Sections** — FAQ (static Astro + CSS toggle), social proof (hardcoded stats), newsletter (direct ConvertKit form action)
4. **Polish** — spacing/rhythm per DESIGN.md layout guidelines

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/landing/src/styles/theme.css` | Modified | Token expansion |
| `components/Bancos.astro` | Modified | SVG logos |
| `components/Capturas.astro` | Modified | Real screenshots |
| `components/Footer.astro` | Modified | Privacy link |
| `components/Hero.astro` | Modified | Visual polish |
| `pages/index.astro` | Modified | Integrate all new sections |
| `src/components/` | New | FAQ, SocialProof, Newsletter |
| `public/` | New | SVGs, screenshots |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Screenshots not ready | Medium | Generate from mobile demo data; fallback mockups |
| Newsletter backend drift | Medium | Direct third-party form action, no NestJS |
| Privacy URL unavailable | Low | Placeholder until Track C delivers |
| Bank logo brand issues | Low | Official press-kit SVGs only |

## Rollback Plan
Revert `apps/landing/` to previous commit. No DB or data changes.

## Dependencies
- App screenshots from mobile (2-3h)
- Bank SVG logos from brand resources
- ConvertKit/Mailchimp account

## Success Criteria
- [ ] 4 bank SVGs render correctly
- [ ] Screenshots replace placeholder frames
- [ ] FAQ accordion opens/closes without errors
- [ ] Newsletter submits to ConvertKit/Mailchimp
- [ ] Privacy link points to real URL
- [ ] `astro check` passes with zero errors
- [ ] Lighthouse Perf ≥90, A11y ≥95
