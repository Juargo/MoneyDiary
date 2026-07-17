# Design: Landing Page Visual Restructure

## Technical Approach

Four layers, foundation-first: (1) expand `theme.css` tokens from DESIGN.md, (2) source bank SVGs + generate app screenshots, (3) build new components (FAQ, SocialProof, Newsletter), (4) polish existing components with new tokens and assets. Pure SSG — zero client JS needed.

## Architecture Decisions

### FAQ: CSS-only accordion

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `<details><summary>` | Native HTML5, accessible, zero JS, keyboard-friendly | **Adopt** — KISS, no dependencies |
| Alpine.js CDN | Adds 12KB+ idle payload for one interaction | Reject — overengineered for static page |
| Checkbox hack | Works but less semantic, no native disclosure role | Reject — worse a11y than details/summary |

### Newsletter: direct form action

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `<form action="https://...">` | Simple POST to ConvertKit, redirect after submit | **Adopt** — no backend, YAGNI |
| Fetch API inline script | Inline success/error feedback | Reject — premature; add when UX data proves redirect hurts conversion |
| Astro client:load island | Framework tooling, event handlers | Reject — static page, no interaction framework needed |

### Social proof: standalone component

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Inline in Hero.astro | Tight coupling, harder to toggle | Reject — SRP |
| Separate `SocialProof.astro` + `config.ts` export | Decoupled, data source clear, easy to hide at beta | **Adopt** — component owns layout, config owns data |

### Asset storage

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `public/images/` | Static assets served as-is; Astro resolves at `/images/...` | **Adopt** — matches `favicon.ico`, `og-image.png` pattern |
| `src/assets/` with Astro Image | Requires import, no benefit for raw SVGs/screenshots | Reject — overengineered for hand-optimized assets |

## Data Flow

```
Static SSG — data flows at BUILD time only:

config.ts ──→ SocialProof.astro  (stats strings)
           ─→ Newsletter.astro   (form action URL)
           ─→ FAQ.astro          (question/answer data)

public/images/banks/ ──→ Bancos.astro  (<img src> or inline SVG)
public/images/screenshots/ ──→ Capturas.astro  (<img> or astro <Image>)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/styles/theme.css` | Modify | Expand ~5 to ~15 tokens (surface levels, secondary, typography rounded) |
| `src/components/Bancos.astro` | Modify | Replace emoji icons with SVG bank logos |
| `src/components/Capturas.astro` | Modify | Replace placeholder frames with real `<img>` screenshots |
| `src/components/Footer.astro` | Modify | Replace `href="#"` with real privacy URL |
| `src/components/Hero.astro` | Modify | Polish spacing with new tokens |
| `src/pages/index.astro` | Modify | Insert SocialProof, FAQ, Newsletter sections |
| `src/config.ts` | Modify | Add stats, FAQ data, newsletter action URL |
| `src/components/SocialProof.astro` | Create | Stats bar (trusted users, rating) |
| `src/components/FAQ.astro` | Create | CSS `<details>` accordion with FAQ items |
| `src/components/Newsletter.astro` | Create | Email form posting to ConvertKit/Mailchimp |
| `public/images/banks/` | Create | SVG logos: bancoestado.svg, chile.svg, bci.svg, santander.svg |
| `public/images/screenshots/` | Create | App screenshots: dashboard.png, categoria.png, resumen.png |

## Token Map (DESIGN.md → theme.css)

```css
/* Current (5 tokens): */
--color-primary, --color-on-primary, --color-primary-container,
--color-surface, --color-on-surface, --color-on-surface-variant

/* Add ~10 tokens: */
--color-surface-dim, --color-surface-bright, --color-surface-container-lowest,
--color-surface-container-low, --color-surface-container,
--color-surface-container-high, --color-surface-container-highest,
--color-secondary, --color-on-secondary, --color-secondary-container,
--font-sans, --font-display-lg, --font-headline-lg, --font-title-md,
--color-outline, --color-outline-variant
/* rounded tokens already covered by --radius-DEFAULT, --radius-sm, etc. */
```

## Component Layout (index.astro)

```
<Hero />          → refined headline + CTA
<SocialProof />   → "Trusted by X beta users" stats bar
<ComoFunciona />  → visual polish (tokens, spacing)
<Bancos />        → SVG logos
<Capturas />      → real screenshots
<FAQ />           → CSS accordion (details/summary)
<Newsletter />    → email input + ConvertKit form action
<section CTA />   → existing final CTA block
<Footer />        → fixed privacy link
```

## Interfaces / Contracts

No new interfaces. FAQ and SocialProof use typed arrays from `config.ts`:

```typescript
// In config.ts additions:
export const SOCIAL_PROOF = {
  users: '500+',
  rating: '4.8',
  reviews: '120',
} as const;

export const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  // defined inline or imported
];

export const NEWSLETTER = {
  /** ConvertKit form action URL — replace with real URL at deploy */
  action: '',
  placeholder: 'tu@email.com',
} as const;
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Build | All components compile | `astro build` — must succeed |
| Check | TypeScript + Astro validation | `astro check` — zero errors |
| A11y | Semantic HTML, keyboard nav, roles | Manual: tab through FAQ, verify labels |
| Performance | Lighthouse thresholds | Lighthouse CI: Perf ≥90, A11y ≥95 |

No test runner for landing — pure SSG output.

## Migration / Rollout

No migration required. Old assets (`favicon.ico`, `og-image.png`) remain in `public/`. The deploy replaces the whole page atomically via Vercel static deployment.

## Open Questions

- [ ] Privacy policy URL — not yet delivered from Track C. Use placeholder `#` again or a `/_legal/privacy` Astro route?
- [ ] Newsletter form action URL — needs ConvertKit/Mailchimp account setup. Leave as `''` and guard with conditional render until configured.
