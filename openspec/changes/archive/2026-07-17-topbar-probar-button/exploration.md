## Exploration: Topbar "Probar" Button

### Current State

The landing page header (`apps/landing/src/components/Header.astro`) has a single `<nav>` with one `<a>` link — "Ingresar" (`APP.label`) linking to `APP.url` (`http://localhost:5173`). The nav uses `justify-end`, pushing the single link to the right. The link is styled as a text-only link: no background, just `text-on-surface` with `hover:text-primary`.

The landing page has two distinct link styles:
- **Text link** (Header "Ingresar"): `text-on-surface` with `hover:text-primary`, no background
- **CTA button** (CtaBeta "Solicitar acceso beta"): `bg-primary-container` with `hover:bg-primary`, filled button with shadow

The `config.ts` has `APP` (web app URL + label) and `CTA` (beta signup mailto + label) as separate config objects.

### Affected Areas

- `apps/landing/src/components/Header.astro` — Add the "Probar" button next to "Ingresar"
- `apps/landing/src/config.ts` — Add a `PROBAR` config entry (or extend `APP`) for the new button's URL and label
- `apps/landing/src/styles/theme.css` — No changes needed (tokens already support both styles)

### Approaches

1. **Primary button + text link** — "Probar" as a filled CTA-style button (matching CtaBeta's `bg-primary-container` / `hover:bg-primary`), "Ingresar" as the existing text link. Both link to `APP.url` (the web app).
   - Pros: Clear visual hierarchy (primary action vs secondary), matches common SaaS pattern, "Probar" stands out
   - Cons: Both go to the same URL for now (no separate signup flow), adds a new config entry
   - Effort: Low

2. **Two text links** — "Probar" and "Ingresar" both as text links, side by side, with "Probar" first (left) and "Ingresar" second (right).
   - Pros: Minimal change, consistent styling, easy to implement
   - Cons: No visual distinction between "try" and "sign in", both look the same, misses opportunity to guide new users
   - Effort: Low

3. **"Probar" links to beta signup** — "Probar" uses `CTA.href` (mailto:beta@moneydiary.cl) styled as a primary button, "Ingresar" stays as text link to the web app.
   - Pros: Different destinations make sense (try = sign up, ingresar = existing user), clear separation of intent
   - Cons: Redundant with the CtaBeta button in the hero section, mailto link in header is unusual UX
   - Effort: Low

### Recommendation

**Approach 1: Primary button + text link** — "Probar" as a CTA-style button (matching CtaBeta's `bg-primary-container` / `hover:bg-primary`), "Ingresar" as the existing text link. Both link to `APP.url` (the web app).

Rationale:
- This is the standard SaaS header pattern: primary CTA ("Try it") + secondary text link ("Sign in")
- The visual hierarchy guides new users to "Probar" (try the app) while returning users look for "Ingresar"
- Both go to the same URL for now, which is fine — the app handles auth state internally
- The CtaBeta component already provides the button style pattern to follow
- Adding a `PROBAR` config entry in `config.ts` keeps the data source clear and follows the existing pattern

### Risks

- **Same destination**: Both "Probar" and "Ingresar" link to the same URL (`APP.url`). If the web app later distinguishes signup vs login flows, the links should be updated to point to different routes.
- **Responsiveness**: Adding a second element to the header nav changes the layout. Currently `justify-end` with one link works fine; with two links, need to verify the spacing works on mobile (the header already uses `px-6 py-4` and the nav uses `max-w-5xl`).
- **Config coupling**: Adding a `PROBAR` config entry is clean, but if the URL is the same as `APP.url`, it introduces a maintenance concern if the app URL changes.

### Ready for Proposal

**Yes** — the change is well-understood and low-risk. The orchestrator should tell the user:
- "Probar" will be a CTA-style primary button (matching CtaBeta's style)
- "Ingresar" stays as a text link
- Both link to the web app (`APP.url`) for now
- A new `PROBAR` config entry will be added to `config.ts`
- The nav layout will need `gap-*` and `items-center` for proper spacing

Now let me persist this.

<｜DSML｜tool_calls>
<｜DSML｜invoke name="engram_mem_save">
<｜DSML｜parameter name="title" string="true">sdd/topbar-probar-button/explore