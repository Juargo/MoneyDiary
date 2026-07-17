## Exploration: Landing Page Visual Restructure

### Current State

The MoneyDiary landing page (`apps/landing/`) was already built and archived via **Sprint 5 — Grupo L (Landing pública)** (2026-07-17). It is a fully functional Astro 5 SSG + Tailwind 4 static site deployed on Vercel, with 6 components:

1. **Hero.astro** — "Tus finanzas, en un solo vistazo" headline, subtitle, CTA beta button
2. **ComoFunciona.astro** — 3-column explainer (Subes tu cartola → Categorizamos → Ves tu semáforo)
3. **Bancos.astro** — 4 Chilean banks listed with emoji icons (🏦🏛️💳🏧)
4. **Capturas.astro** — 3 placeholder frames ("Captura 1/2/3" text inside gray boxes)
5. **CtaBeta.astro** — inline CTA from config.ts (currently `mailto:beta@moneydiary.cl`)
6. **Footer.astro** — Contacto, Política de privacidad (#), copyright

**Design system:** Minimal Tailwind 4 theme (5 color tokens: primary, on-primary, primary-container, surface, on-surface, on-surface-variant). Ties into DESIGN.md (Serene Finance design system with ~50 tokens).

**Known issues from Sprint 5 verify-report:**
- Bank logos are emoji, not real SVGs
- Screenshots are placeholder divs, not real app screenshots
- Privacy policy links to `#`
- CI secret grep missing `SECRET` keyword
- axe-core and Lighthouse CI checks deferred

**Monefy.com reference structure:**
1. Hero — headline, subtitle, CTA, trust badge "+11M downloads"
2. Social proof bar — "Trusted by +11.000.000 users", "4.7 ★ 283.000 ratings"
3. Features section — app screenshot alongside feature descriptions
4. Testimonials — wall of user reviews from App Store / Play Store
5. Guides & Tools — links to educational content (budgeting, debt, wealth)
6. FAQ section — accordion-style common questions
7. Newsletter signup — email subscription
8. Footer — resource links, social, legal

### Affected Areas

- `apps/landing/src/components/Hero.astro` — visual polish, potential trust indicators
- `apps/landing/src/components/ComoFunciona.astro` — visual polish, potential restructure
- `apps/landing/src/components/Bancos.astro` — replace emoji with real SVG logos
- `apps/landing/src/components/Capturas.astro` — replace placeholders with real screenshots
- `apps/landing/src/components/CtaBeta.astro` — minor visual updates
- `apps/landing/src/components/Footer.astro` — add privacy policy URL, restructure links
- `apps/landing/src/pages/index.astro` — add new sections (FAQ)
- `apps/landing/src/styles/theme.css` — expand design tokens from DESIGN.md
- `apps/landing/src/config.ts` — potentially add new config entries
- `apps/landing/public/` — add bank logo SVGs, real screenshots
- `apps/landing/src/components/` — new component: FAQ.astro
- `openspec/specs/public-landing/spec.md` — update spec with new requirements

### Approaches

1. **Minimum Viable Polish** — Improve visual quality of existing sections with minimal new content
   - Replace emoji bank logos with real SVG logos
   - Replace screenshot placeholders with real app screenshots (from mobile app)
   - Add static FAQ section (accordion-style, no backend)
   - Expand design tokens to ~15-20 from DESIGN.md (surface-container levels, secondary, typography scale)
   - Improve visual hierarchy, spacing, and overall polish
   - Fix privacy policy link to real URL/page
   - Add subtle Hero improvements (subtitle messaging, visual refinement)
   - **Pros:** Ships quickly, no backend dependencies, respects YAGNI (no newsletter/testimonials/guides without content), improves conversion signal
   - **Cons:** Doesn't match monefy's full feature set, missing social proof and trust indicators
   - **Effort:** Medium (3-5 days — assets + components + design polish)

2. **Full Monefy-style Redesign** — Restructure to match monefy's section flow closely
   - All of approach 1, plus:
   - Add social proof bar (download stats, rating stars — if available)
   - Add testimonials section (requires real beta user quotes or placeholder)
   - Add newsletter signup (requires third-party service like ConvertKit/Mailchimp)
   - Add guides/tools section (requires educational content creation)
   - Restructure features section with app screenshots alongside descriptive text
   - Redesign Hero with trust badges and stronger visual presence
   - **Pros:** Compelling, mature landing presence; better conversion potential
   - **Cons:** Requires content (testimonials, guides), third-party newsletter integration, more complexity, violates YAGNI for beta-stage product with no users yet
   - **Effort:** High (2-3 weeks — design + content + assets + implementation)

### Recommendation

**Recommended: Approach 1 — Minimum Viable Polish**

Rationale:
- **YAGNI:** MoneyDiary is in beta with no public users. Testimonials, guides, and newsletter signup require content or third-party services that don't exist yet. Building those sections now would be speculative.
- **KISS:** The current structure already works and communicates the value prop. The issues are visual quality (emoji logos, placeholder screenshots, minimal design tokens), not structural gaps.
- **Prior art:** The Sprint 5 design explicitly deferred waitlist backend, analytics, and forms. A newsletter signup would violate that decision without backend infrastructure.
- **Highest ROI:** Real screenshots + real bank logos transform the perception of the landing. A static FAQ answers actual user questions. Expanding design tokens makes the entire page feel more refined. These are pure visual improvements with zero backend dependency.
- **Fast ship:** Can be delivered in a single PR cycle (under 400 lines with chained PRs if needed).

### Risks

- **Screenshots don't exist yet:** Need to generate from mobile app with demo/anonymized data. This requires running the mobile app with seeded demo data and capturing screenshots. Effort: 2-3h.
- **Bank logo SVGs:** Need to source or create SVG logos for all 4 Chilean banks (BancoEstado, Banco de Chile, BCI, Santander). Ensure brand guidelines allow use. Effort: 1-2h per bank.
- **Design token expansion:** Adding more tokens from DESIGN.md could drift from the current minimal theme.css. Must stay consistent with the existing visual identity and not introduce unrelated tokens.
- **FAQ content:** Needs actual questions and answers about MoneyDiary's beta product. If the content isn't ready, the section will look empty or generic.
- **Privacy policy URL:** Depends on legal/policy work from Track C. If not ready, the link stays `#`.

### Ready for Proposal

**Yes** — proceed to sdd-propose with Approach 1 (Minimum Viable Polish). The orchestrator should tell the user:
- The landing is already built and deployed from Sprint 5 — this restructure is a visual polish pass, not a from-scratch build
- The main improvements will be: real assets (screenshots + bank SVGs), static FAQ section, expanded design tokens, visual hierarchy polish, and fixing the privacy policy link
- Newsletter, testimonials, guides, and social proof sections are deferred per YAGNI — they require content or backend integration that doesn't exist at beta stage
- Chained PRs may be needed if the change exceeds 400 lines (likely given assets + new component + design token changes)
