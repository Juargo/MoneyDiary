# Tasks: Landing Page Visual Restructure

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 400–550 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Foundation) → PR 2 (Components) → PR 3 (Integration) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Foundation: tokens, config, assets | PR 1 | base = main; `astro build` verifiable |
| 2 | New components + existing polish | PR 2 | base = PR 1 branch; depends on tokens |
| 3 | Index layout + verification | PR 3 | base = PR 2 branch; depends on components |

## Phase 1: Foundation

- [x] 1.1 Expand `src/styles/theme.css` from 5 to ~15 tokens (surface-container levels, secondary, typography, outline per DESIGN.md)
- [x] 1.2 Add social-proof stats, FAQ Q&A array, newsletter action URL to `src/config.ts`
- [x] 1.3 Add SVG bank logos at `public/images/banks/` (bancoestado.svg, chile.svg, bci.svg, santander.svg)
- [x] 1.4 Add app screenshots at `public/images/screenshots/` (dashboard, categoria, resumen)

## Phase 2: New Components

- [x] 2.1 Create `src/components/SocialProof.astro` — stats bar from config data
- [x] 2.2 Create `src/components/FAQ.astro` — `<details><summary>` accordion, data-driven, keyboard accessible
- [x] 2.3 Create `src/components/Newsletter.astro` — email input, validation, direct POST to ConvertKit, privacy notice

## Phase 3: Existing Component Polish

- [x] 3.1 `Bancos.astro` — replace emoji icons with SVG `<img>` + alt text
- [x] 3.2 `Capturas.astro` — replace placeholder frames with real `<img>` screenshots
- [x] 3.3 `Footer.astro` — replace `href="#"` with privacy URL from config
- [x] 3.4 `Hero.astro` — polish spacing/typography with expanded tokens
- [x] 3.5 `ComoFunciona.astro` — polish spacing/hierarchy with expanded tokens
- [x] 3.6 `CtaBeta.astro` — minor visual polish with new tokens

## Phase 4: Integration

- [x] 4.1 `pages/index.astro` — import SocialProof, FAQ, Newsletter; place SocialProof after Hero, FAQ before final CTA, Newsletter near footer
- [x] 4.2 Verify component order matches design layout spec

## Phase 5: Verification

- [x] 5.1 Run `astro check` — zero errors
- [x] 5.2 Run `astro build` — succeeds
- [x] 5.3 Manual verification — semantic HTML, headings hierarchy, no broken images/links, Perf/A11y best practices
- [x] 5.4 Manual a11y check — tab through FAQ accordion, focus indicators, keyboard reachability, form labels
