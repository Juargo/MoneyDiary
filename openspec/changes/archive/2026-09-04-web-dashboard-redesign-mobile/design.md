# Design — Serene Finance restyle + responsive nav shell (`web-dashboard-redesign-mobile`)

Visual restyle **in place** of the existing `apps/web` dashboard to the Serene Finance identity, plus a **net-new responsive nav shell** (sidebar on desktop, bottom tab bar on mobile). No backend, no rebuild, no fetch-path change. This doc resolves the four open questions the proposal deferred and specifies the shell architecture, the token layer, the per-component restyle plan, and — the load-bearing part — the **contrast fixes the pastel palette forces**.

## Decisions at a glance

| # | Decision | Choice | One-line rationale |
|---|----------|--------|--------------------|
| 1 | Token naming | **Normalize to the shadcn/Tailwind convention already in `index.css`** (not Material `surface-container-*`) | One token system, not two; shadcn card/badge already consume these names (DRY/KISS). |
| 2 | Icon set | **lucide-react** (already installed `^0.469.0`) | No CDN font (mockup's Material Symbols is a Google Fonts CDN — banned), tree-shakeable, soft stroke fits Serene. |
| 3 | Charting | **Keep the hand-rolled SVG** `DistribucionPie`/`MiniDistribucionPie` | Preserves already-tested a11y (`role=button` slices, `aria-pressed`); a lib is pure churn+risk (YAGNI). |
| 4 | Inter source | **`@fontsource-variable/inter`** (new dep, bundled, self-hosted) | Same-origin, offline-friendly, no render-blocking Google Fonts CDN. |
| 5 | Shell mount point | **`_authenticated.tsx`**, NOT `__root.tsx` (deviation from the task hint — see §5) | `__root` also renders `/login` (out of scope); the auth layout is the exact logged-in boundary (SRP). |

**Deviation flag:** the brief said the shell "goes in `__root.tsx`". The real route tree (discovered while reading) already has a pathless `_authenticated.tsx` layout wrapping exactly the dashboard + `buckets/$bucket`, with `login.tsx` sitting *outside* it. Mounting the chrome in `_authenticated.tsx` excludes `/login` for free and keeps `__root` owning only providers/devtools. This is the correct home. Documented so tasks plan against it.

---

## 1. Token layer (`src/index.css`)

### Naming: shadcn convention, remapped to Serene values

`index.css` today already runs **two** token systems side by side: raw `@theme` bucket colors (`--color-necesidades`…) and the shadcn semantic set (`--card`, `--primary`, `--muted-foreground`, …) wired through `@theme inline`. Adding a third Material `surface-container-*` namespace would orphan the shadcn primitives (`card`, `badge`) and duplicate meaning. So: **remap the existing shadcn `:root` variables to Serene Finance colors** and change nothing about the variable *names*. Consumers (`bg-card`, `text-muted-foreground`, `bg-primary`) keep working; only the resolved colors shift.

### Concrete `@theme` / `:root` block (illustrative)

```css
@theme {
  /* Inter first, self-hosted (see §4). Keep the system fallback stack. */
  --font-sans: 'Inter Variable', system-ui, 'Segoe UI', Roboto, sans-serif;
  --font-mono: ui-monospace, Consolas, monospace;

  /* Bucket fill colors — Serene pastels. Still exposed as utility classes
     (bg-necesidades, fill-gustos) AND CSS vars for SVG fill=. Keep hex in
     sync with src/lib/bucket-colors.ts. THESE ARE FILLS ONLY, never text. */
  --color-necesidades: #8FA7D1; /* soft blue   — Necesidades */
  --color-gustos:      #B1A7D1; /* lavanda     — Deseos/Gustos */
  --color-ahorro:      #E6D194; /* pastel yellow — Ahorro */
  --color-exceso:      #E88A8A; /* coral — over-budget state (see §1.1) */
}

:root {
  --radius: 0.5rem;                 /* 8px default (was 0.625rem/10px) */
  --background:  #f9f9f9;           /* surface — off-white */
  --foreground:  #1a1c1c;           /* on-surface */
  --card:        #ffffff;           /* surface-container-lowest */
  --card-foreground: #1a1c1c;
  --popover:     #ffffff;
  --popover-foreground: #1a1c1c;
  --primary:     #475f85;           /* strong blue — buttons/heading TEXT */
  --primary-foreground: #ffffff;
  --secondary:   #61597f;           /* strong lavanda — section subheads TEXT */
  --secondary-foreground: #ffffff;
  --muted:       #f3f3f3;           /* surface-container-low */
  --muted-foreground: #44474e;      /* on-surface-variant — sub-labels */
  --accent:      #eeeeee;           /* surface-container */
  --accent-foreground: #1a1c1c;
  --destructive: #ba1a1a;           /* error */
  --border:      #c4c6cf;           /* outline-variant */
  --input:       #c4c6cf;
  --ring:        #1a1c1c;           /* focus ring — dark, ≥3:1 on any surface */
}
```

`@theme inline` (the `--color-* : var(--*)` bridge) and the `.dark` block stay **as-is** — dark mode is out of scope, `.dark` remains inert.

**Radius:** `--radius` drops to `0.5rem` (8px) per DESIGN.md. This only affects shadcn `card`/`badge` (which use `rounded-xl` = `calc(radius+4px)`). The dashboard components use *literal* `rounded-2xl`/`rounded-xl` classes and are re-mapped explicitly in §6, not via this token.

**Two-tier color rule (critical, drives §7 contrast):**
- **Pastels** (`#8FA7D1/#B1A7D1/#E6D194/#E88A8A`) = **backgrounds / SVG fills / dots ONLY**. Never text, never a button background with light text.
- **Strong tones** (`primary #475f85`, `secondary #61597f`, `on-surface #1a1c1c`) = **all text and any control that needs a light foreground**.

### 1.1 `bucket-colors.ts` migration shape

Keep the **exact export shape** so no consumer churns (`DistribucionPie`, `MiniDistribucionPie`, `LeyendaGasto` import `COLOR_BUCKET`/`ETIQUETA_BUCKET` unchanged). Only the hex literals move, plus one new named constant for the coral state:

```ts
// src/lib/bucket-colors.ts — Serene Finance palette (WEB ONLY; diverges from
// apps/mobile/src/theme/colors.ts by product decision — see proposal Risks).
// Hex MUST match the @theme tokens in index.css.
export const COLOR_BUCKET: Record<string, string> = {
  Necesidades: '#8FA7D1', // was #464B69
  Deseos:      '#B1A7D1', // was #E7E1BF
  Ahorro:      '#E6D194', // was #3E9B52
}

// Over-budget accent (DESIGN.md: Wants→Coral when the limit is exceeded).
// Exported as a named token; wired ONLY where an over-budget affordance
// actually exists. See §3 — the dashboard has no progress bar today, so this
// may ship defined-but-unconsumed (acceptable design-system token) rather than
// inventing a new over-budget UI in a restyle (YAGNI).
export const COLOR_EXCESO = '#E88A8A'

export const ETIQUETA_BUCKET: Record<string, string> = {
  Necesidades: 'Necesidades',
  Deseos: 'Gustos',
  Ahorro: 'Ahorro',
  SinCategoria: 'Sin categoría',
} // unchanged
```

**Test impact (deliberate):** two tests assert the *exact old RGB/hex*:
- `LeyendaGasto.test.tsx` "applies the resolved color to each color dot" → `rgb(70,75,105)/rgb(231,225,191)/rgb(62,155,82)` must become `rgb(143,167,209)/rgb(177,167,209)/rgb(230,209,148)`.
- `DistribucionPie.test.tsx` "applies the resolved color to each slice" → `['#464B69','#E7E1BF','#3E9B52']` must become `['#8FA7D1','#B1A7D1','#E6D194']`.

These change **in lockstep** with the hex, in the same slice. Not a blind find/replace — they are the guardrail that the palette actually landed.

---

## 2. Icons — lucide-react + `src/lib/category-icons.ts`

lucide-react is already a dependency (`^0.469.0`), tree-shakeable (only imported glyphs ship), and needs **no external font** — decisive against the mockup's `Material Symbols Outlined` Google Fonts CDN, which violates the "no render-blocking CDN" constraint the same way Inter does.

The 8 canonical categories are fixed by the backend seed (`apps/api/.../categoria-ids.ts`, `Categoria` enum): **Supermercado, Combustible, Farmacia, Salud, Transporte, Streaming, Delivery, Ahorro**. The lookup keys on `grupo.nombre` (the category string surfaced by `BucketDetailList`).

```ts
// src/lib/category-icons.ts
import {
  ShoppingCart, Fuel, Pill, HeartPulse, Bus, PlayCircle, Bike, PiggyBank,
  Receipt, type LucideIcon,
} from 'lucide-react'

const ICONO_POR_CATEGORIA: Record<string, LucideIcon> = {
  Supermercado: ShoppingCart,
  Combustible:  Fuel,
  Farmacia:     Pill,
  Salud:        HeartPulse,
  Transporte:   Bus,
  Streaming:    PlayCircle,
  Delivery:     Bike,
  Ahorro:       PiggyBank,
}

/** Category name → icon, with a generic fallback for SinCategoria / unknown. */
export function iconoDeCategoria(nombre: string | null | undefined): LucideIcon {
  return (nombre && ICONO_POR_CATEGORIA[nombre]) || Receipt
}
```

Pure, no DOM, unit-testable in isolation (asserts every canonical name resolves + fallback). Icons are **decorative** next to a text label → render with `aria-hidden` (the row/group already carries the accessible name); this adds no a11y semantics to preserve or break.

---

## 3. Charting — keep the hand-rolled SVG

No charting lib. `DistribucionPie`/`MiniDistribucionPie` already encode the exact a11y contract the ADR-018 fixes established: `role="group"` vs `role="img"` toggle (WCAG 4.1.2), per-slice `role="button"`/`tabIndex`/`aria-pressed`/keyboard handlers, `aria-hidden` decorative labels, empty-state placeholder ring. A library (Recharts/visx) would either drop or re-implement all of that — pure risk against a screen that already passes. The restyle only touches **fills, strokes, and label color** on these SVGs (§6/§7), never the geometry or the interaction contract. This is a YAGNI + a11y-preservation call.

The one **over-budget** case DESIGN.md describes (Wants bar → coral) has no host: the dashboard visualizes distribution via a pie + the existing `SemaforoBadge`, not progress bars. Introducing a progress bar to consume coral is new UI outside the restyle scope. Decision: define `--color-exceso`/`COLOR_EXCESO` as a token, leave it unconsumed this change, revisit if/when a progress-bar affordance is designed.

---

## 4. Inter font — `@fontsource-variable/inter`

Add dep `@fontsource-variable/inter`; import once (in `main.tsx` or top of `index.css`):

```ts
import '@fontsource-variable/inter'
```

One variable-font file covers 400/600/700 (all weights DESIGN.md uses), served **same-origin from the bundle** — no Google Fonts `<link>`, satisfying the "no render-blocking CDN / offline-friendly / sin-registro" constraint. `font-display: swap` is fontsource's default (text paints in the fallback immediately, swaps when Inter loads — no invisible-text flash). `--font-sans` lists `'Inter Variable'` first with the current `system-ui` stack as fallback, so a font fetch failure degrades gracefully. Chosen over manual woff2 self-host purely to avoid hand-maintaining `@font-face`/`unicode-range` blocks (KISS) — same offline guarantee, less surface.

---

## 5. Nav shell architecture (net-new)

### Mount point & route strategy

Mount in **`_authenticated.tsx`**'s `RouteComponent`, wrapping `<DemoBanner/>` + `<Outlet/>`. `/login` (outside `_authenticated`) never sees the chrome — no manual path guard needed. `__root.tsx` stays untouched.

```tsx
// _authenticated.tsx RouteComponent (shape only)
function RouteComponent() {
  return (
    <AppShell>
      <DemoBanner esDemo={esDemo} />
      <Outlet />
    </AppShell>
  )
}
```

### Component structure — SRP split, KISS internals

One `AppShell` container that composes two presentational siblings; **no nav state library** (nav "state" is just the current route, owned by the router).

```
src/components/app-shell/
  AppShell.tsx        # layout frame: sidebar (lg+) | <main> content | bottom tabs (<lg)
  Sidebar.tsx         # desktop rail: brand block + NavItem list + inert placeholders
  BottomTabs.tsx      # mobile bar: the 3 primary NavItems as icon+label tabs
  NavItem.tsx         # one link; active state via TanStack Router (shared by both)
  nav-items.ts        # single source of the nav model (label, to, icon, disabled)
```

- **SRP:** `AppShell` = responsive frame only. `Sidebar`/`BottomTabs` = two presentations of the **same** `nav-items.ts` model (DRY — define nav once, render twice). `NavItem` = one link's a11y + active styling.
- **Nav model** (`nav-items.ts`): `Inicio/Subir` → `/` (or upload placeholder), `Panel` → `/` dashboard, `Transacciones` → `/` filtered (placeholder target until a route exists). Placeholders: **Configuración**, **Ayuda**, and the **"Subir nuevo archivo"** button — rendered, visibly present, inert.
- **Active route:** use TanStack Router `<Link>` with `activeProps`/`activeOptions={{ exact }}` so the active item gets the highlighted style (mockup: bold + `border-r-4` on sidebar, filled tab on mobile). No `useState`, no context.

### Responsive strategy — one breakpoint, CSS only

- Breakpoint: **`lg`** (1024px), matching the dashboard body's existing `lg:grid-cols-2`.
- `Sidebar`: `hidden lg:flex` — fixed left rail (`lg:w-64`/`w-70`), the mockup's `280px`.
- `<main>`: `lg:pl-64` to clear the fixed sidebar on desktop; full-width with `pb-16` on mobile to clear the bottom bar.
- `BottomTabs`: `fixed bottom-0 inset-x-0 lg:hidden` — icon+label tabs.
- No JS media queries, no separate mobile/desktop trees beyond these two siblings — Tailwind responsive utilities switch which chrome is visible. KISS.

### Placeholder accessibility

Inert items are **rendered but not activatable**, announced as disabled:
- Disabled links/buttons: real `<button disabled>` (Configuración, Ayuda, "Subir nuevo archivo") OR, if kept as `<a>`, `aria-disabled="true"` + `tabIndex={-1}` + no `href`/`onClick` + `pointer-events-none` visual dimming. Prefer `<button disabled>` — native disabled semantics, KISS.
- The pattern mirrors the codebase's existing precedent (`ResumenAnual`'s disabled month cell: `aria-disabled="true"`, kept out of the tab order, no handler). Reuse that discipline.

### Contrast guardrails for the sidebar (see §7)

If the sidebar uses the mockup's pastel-blue background (`bg-primary-container` #8FA7D1), nav text MUST be **solid** `on-primary-container` #233c60 (4.58:1 — passes AA), and active/inactive differentiation MUST come from **weight + left border + a subtle bg tint, NOT opacity** (`opacity-70` on text silently breaks the 4.5:1 floor). Alternative (lower risk): a light `bg-card`/`surface-container-low` sidebar with `on-surface` text. Either is acceptable; the pastel-blue version is mockup-faithful *with the solid-text guardrail*.

---

## 6. Per-component restyle plan

All changes are **visual classes only**. Every listed a11y attribute/semantic is preserved **verbatim**. Money labels stay the exact BigInt-safe strings already rendered — no formatting logic touched.

| Component | Class changes (visual) | Preserved verbatim (do NOT touch) |
|-----------|------------------------|-----------------------------------|
| `ResumenScreen` | Card wrappers `rounded-2xl`→`rounded-lg`, `border-slate-200`→`border-border`, `bg-white`→`bg-card`; section subhead `text-slate-500`→`text-secondary`; gaps to 24px rhythm | `<h1 className="sr-only">`, heading order, `data-testid="semaforo-global"`, `lg:grid-cols-2` structure, all props wiring |
| `DistribucionPie` | Slice fills via migrated `COLOR_BUCKET`; **add `stroke="#ffffff" strokeWidth={2}`** to wedge paths (1.4.11 adjacency, §7); **on-slice `<text>` `fill="#FFFFFF"`→`fill="#1a1c1c"`** (§7 — required contrast fix); IDEAL inset border to `border-card` | `role` group/img toggle, per-slice `role=button`/`tabIndex`/`aria-label`/`aria-pressed`/`onKeyDown`, `focus-visible:outline-slate-800`, `aria-hidden` on labels, `data-testid`s, geometry |
| `LeyendaGasto` | Dot color via migrated `COLOR_BUCKET`; text `text-slate-700/900` may go `text-foreground/muted-foreground`; selected row `bg-slate-100`→`bg-muted` | `<button>` per row, `aria-label`, `aria-pressed`, `focus-visible:outline-slate-800` (FIX 3), `data-testid`s |
| `BucketDetailList` | Row cards `rounded-xl`→`rounded-lg`, `border-slate-200`→`border-border`; **add category icon** (`iconoDeCategoria`, `aria-hidden`) in group headers; group header badge = aggregated total chip (client-derived, `bg-secondary/…`) | `Heading`/`HeadingGrupo` derivation (h1/h2→h2/h3), `<section>` structure, `ReclasificarCategoriaControl` wiring, cargo/abono two-amount rendering, all copy |
| `ResumenAnual` | Card + month cells `rounded-2xl/rounded-xl`→`rounded-lg`, `border-slate-*`/`bg-white`→tokens; active cell highlight to `ring-primary`/`border-primary` | `aria-labelledby`→h2, month `<button>`/disabled-cell split, `aria-current="date"`, `mes-actual-marker`, `focus-visible:outline-slate-800` (FIX 2), `role=button`+`aria-disabled` on empty cells |
| `MiniDistribucionPie` | Slice fills via migrated `COLOR_BUCKET`; optional `stroke="#ffffff"` for wedge separation | `aria-hidden="true"` on `<svg>`, placeholder ring, `data-testid`s, geometry |

**Focus rings stay `outline-slate-800`.** `#1e293b` (slate-800) is ~11:1 on the white/off-white surfaces — a neutral high-contrast ring that works over any card and is already asserted by three tests as the unified WCAG 1.4.11 focus color. Re-tinting it to pastel primary would drop below 3:1 and break those tests for no visual gain. KISS: leave it.

---

## 7. Contrast / a11y verification (the load-bearing section)

The Serene pastels are all **light and similar-luminance** — this creates concrete WCAG failures the restyle MUST fix, not inherit.

### 7.1 On-slice percent labels — CRITICAL, white text fails on every pastel

Current `DistribucionPie` renders percent labels `fill="#FFFFFF"`. White on the new pastels (label is ~21px bold → "large text", 3:1 floor):

| Slice fill | White text ratio | 3:1? |
|------------|------------------|------|
| #8FA7D1 blue | 2.43:1 | ❌ |
| #B1A7D1 lavanda | 2.24:1 | ❌ |
| #E6D194 yellow | 1.52:1 | ❌ |
| #E88A8A coral | 2.49:1 | ❌ |

**Fix:** switch the label fill to **`#1a1c1c` (on-surface)** — dark text yields 7.4–11.9:1 on all four pastels (all pass). The label is `aria-hidden` decorative, so this is a **pure visual contrast fix, zero a11y-semantic change**, and no test asserts the fill color (only the "50%" text presence) — so it won't break tests, but it MUST be done or the pie ships non-compliant.

### 7.2 Adjacent slice separation (WCAG 1.4.11)

Same-luminance pastels touching each other are <1.2:1 apart (blue↔lavanda ≈ 1.09:1) — visually ambiguous. **Fix:** add a `stroke="#ffffff" strokeWidth={2}` separator to wedge paths (matches the mockup's white borders). Info is also redundantly available via on-slice % + legend text, but the stroke resolves the pure-visual adjacency cleanly.

### 7.3 Text colors — use strong tones, they pass

| Text token on white/off-white | Ratio | AA text? |
|-------------------------------|-------|----------|
| `primary #475f85` (headings/buttons) | ~6.5:1 | ✅ |
| `secondary #61597f` (subheads) | ~6.5:1 | ✅ |
| `on-surface #1a1c1c` | ~16:1 | ✅ |
| `muted-foreground #44474e` (sub-labels) | ~8.9:1 | ✅ |

**Rule enforced in §1:** pastels are never text. Following it keeps all body/heading text compliant.

### 7.4 Buttons — do NOT use #8FA7D1 as a button bg with white text

DESIGN.md literally says "primary buttons: Soft Blue #8FA7D1 + white text" — that is **2.43:1, a fail**. Use `bg-primary #475f85` + white (6.5:1). The only primary button here ("Subir nuevo archivo") is an inert placeholder, so low real-world risk, but the pattern must not propagate.

### 7.5 Sidebar text

Per §5: pastel-blue sidebar → solid `#233c60` text (4.58:1 ✅), never opacity-dimmed. Or light-surface sidebar with `on-surface` text.

---

## 8. Testing strategy

| Test surface | What to change / add | Why deliberate |
|--------------|----------------------|----------------|
| `LeyendaGasto.test.tsx` color-dot assertion | Update expected RGB → `rgb(143,167,209)/rgb(177,167,209)/rgb(230,209,148)` | Locks the new palette actually landed — the assertion IS the guardrail. |
| `DistribucionPie.test.tsx` slice-fill assertion | Update expected hex → `['#8FA7D1','#B1A7D1','#E6D194']` | Same lockstep with `bucket-colors.ts`. |
| Focus-ring assertions (`outline-slate-800`) in Leyenda/Anual | **No change** — ring stays slate-800 | We deliberately did not re-tint the ring (§6). |
| New `category-icons.ts` | New unit test: every canonical name resolves to a distinct icon + fallback for unknown/null | Pure fn, cheap, prevents silent icon-map drift. |
| New `AppShell`/`Sidebar`/`BottomTabs` | New tests: renders 3 primary nav links; active route gets active styling; placeholders are `disabled`/`aria-disabled` and NOT activatable (fireEvent click → no nav) | Net-new slice needs its own coverage (proposal risk: shell is new pattern). |
| All other dashboard tests | Should stay green untouched — restyle is class-only; a11y roles/labels/testids unchanged | If any a11y/role test breaks, that's a signal the restyle touched semantics — STOP, it's out of scope. |

**Discipline:** a color/hex test change is only allowed **paired with the corresponding `bucket-colors.ts`/token change in the same slice**, and only after re-checking the contrast ratio (§7), never as a blind swap to make red go green.

---

## 9. Flags for `sdd-tasks` / PR sizing

- **Slice boundaries hold** (proposal's 5): (1) tokens+font+`bucket-colors.ts`, (2) shell, (3) component restyle, (4) icons, (5) mobile responsive pass. Natural, low-coupling seams.
- **>400-line / chained-PR risk: real.** Slice 2 (shell: ~5 new files + tests) and Slice 3 (6 components + their test updates) each plausibly approach or exceed 400 changed lines on their own. Recommend the tasks phase plan **chained PRs**, likely: PR1 = slices 1+4 (tokens/font/colors/icons — small, foundational), PR2 = slice 2 (shell, isolated, own tests), PR3 = slice 3 (restyle), PR4 = slice 5 (responsive polish). Confirm split in tasks under `ask-on-risk`.
- **Two new deps** to add: `@fontsource-variable/inter` (font). lucide-react already present. No charting lib. Note pnpm isolated-resolution: declare `@fontsource-variable/inter` as a direct dep of `apps/web`.
- **Mount-point deviation** (`_authenticated.tsx`, not `__root.tsx`) must be reflected in the task list so no task edits `__root.tsx` for the shell.
- **`COLOR_EXCESO` may ship unconsumed** — tasks should not invent an over-budget progress bar to "use" it (YAGNI); defining the token is enough.
- **Non-negotiable in every restyle task:** do not touch `vite.config.ts`, `api/client.ts`, `apps/web/api/[...path].ts`, or any a11y role/label/testid. Money strings stay verbatim.

## Checklist (for tasks/verify)

- [ ] `@theme`/`:root` remapped to Serene tokens; `--radius` = 0.5rem; pastels are fills-only.
- [ ] `bucket-colors.ts` hex migrated + `COLOR_EXCESO` added; export shape unchanged.
- [ ] On-slice label fill dark `#1a1c1c` (contrast fix); white wedge strokes added.
- [ ] `category-icons.ts` with 8 canonical categories + fallback; icons `aria-hidden`.
- [ ] `@fontsource-variable/inter` added + imported; no Google Fonts CDN anywhere.
- [ ] Shell in `_authenticated.tsx`; sidebar↔bottom-tabs at `lg`; placeholders inert & announced.
- [ ] Every existing a11y role/label/testid preserved verbatim; only color/hex tests changed, in lockstep.

## Next step

`sdd-tasks` — break these slices into ordered, dependency-aware tasks and confirm the chained-PR split.
