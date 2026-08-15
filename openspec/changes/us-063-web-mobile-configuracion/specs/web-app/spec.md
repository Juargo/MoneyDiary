# Delta for web-app

Source: `openspec/changes/us-063-web-mobile-configuracion/proposal.md`. Every requirement below cites its
origin (CA-0N verbatim from issue #332, a binding decision letter/number from the proposal, or a
`wireframes-extracted.md` §-reference). New requirements use a fresh family, **`WCTM-*`** (Web
Configuración Tablet/Móvil), rather than extending `WCTG-*` (US-043's already-shipped, archived family) or
introducing a separate `WMOB-*` split — `WCTM-*` keeps the US-063 traceability visible in the ID itself
while reading as a viewport-conditional overlay on top of the already-shipped `WCTG-*`/`WCFG-*` structure,
the same way `WPER-*`/`WMYP-*` got their own family for a related-but-distinct capability instead of
extending an older prefix.

Two scenario labels are used throughout, per the proposal's own §1 lesson (`WCTG-14` shipped false because
jsdom cannot compute layout):

- **(Playwright)** — the scenario's truth depends on rendered geometry (is this horizontal, is this
  full-width, is this the fixed or the fluid column) at a specific viewport. `pnpm web test` (jsdom) CANNOT
  verify these; they require the real-viewport harness this change's D-3 introduces.
- **(jsdom)** — the scenario's truth is DOM structure, text content, or an accessible name/role, which does
  not depend on rendered geometry and IS verifiable by the existing Vitest/jsdom suite.

## ADDED Requirements

### Requirement: WCTM-01 — A new `md` (768px) breakpoint tier is scoped to the Configuración surfaces (D-1)

The Configuración surfaces this change touches (`ConfiguracionLayout`, `ConfiguracionTabs`,
`CategoriasPanel`'s `Nueva categoría` control, `CategoriaFila`, `EditarCategoria`, `PatronesSection`) MUST
distinguish three viewport tiers using Tailwind 4's stock `md` breakpoint (768px, no `--breakpoint-*`
override required) as the mobile/tablet boundary: **mobile <768px · tablet 768–1023px · desktop ≥1024px**.
This is expressed as literal `md:`-prefixed utility classes scoped to the files above, exactly as `lg:` is
used today — it MUST NOT introduce a constant into `apps/web/src/components/app-shell/layout.ts`, and it
MUST NOT change `AppShell`, `Sidebar`, or `BottomTabs`, whose Sidebar↔BottomTabs switch stays governed by
`lg` (1024px), unchanged, exactly as shipped (D-1: different concern, no evidence it needs to move).

#### Scenario: AppShell's Sidebar/BottomTabs switch is untouched (jsdom)

- GIVEN any viewport width
- WHEN `AppShell` renders
- THEN the Sidebar↔BottomTabs switch activates at exactly `lg` (1024px), unchanged by this change — no new
  breakpoint constant appears in `layout.ts`

#### Scenario: The three tiers are distinguishable within Configuración (Playwright)

- GIVEN viewport widths 360px, 880px, and 1280px (D-3's three verification widths)
- WHEN any Configuración surface renders
- THEN 360px renders the mobile variant, 880px renders the tablet variant, and 1280px renders the desktop
  variant — asserted by real rendered geometry, never by className-literal presence alone (a class existing
  in markup does not prove it is in effect at a given width — the exact gap that shipped `WCTG-14` false)

### Requirement: WCTM-02 — CA-01: mobile list chrome — horizontal tabs and a full-width Nueva categoría (CA-01, frame M2)

Below `md` (768px), `ConfiguracionTabs`' `Perfil`/`Categorías` tab list MUST render horizontally, spanning
the full available width — not the vertical column used at tablet/desktop widths (WCFG-11). Below `md`,
the `Nueva categoría` button on `/configuracion/categorias` MUST render as a full-width button positioned
below the tab list, not beside the section title as at tablet/desktop widths (WCTG-02).

#### Scenario: Tabs render horizontal and full-width below `md` (Playwright)

- GIVEN the viewport is below `md` (768px) — e.g. 360px
- WHEN `/configuracion` or `/configuracion/categorias` renders
- THEN the `Perfil`/`Categorías` tab list renders as a single horizontal row spanning the full content
  width — not the vertical column tablet/desktop widths render

#### Scenario: Nueva categoría renders full-width below the tabs (Playwright)

- GIVEN the viewport is below `md` (768px)
- WHEN `/configuracion/categorias` renders
- THEN the `Nueva categoría` button spans the full content width and sits below the tab list — not beside
  the section title

### Requirement: WCTM-03 — CA-02: mobile list row shows exactly one action control, with delete only via edit (CA-02, D-4, frame M2)

Below `md` (768px), each `CategoriaFila` list row MUST render exactly one action control — the edit link —
and MUST NOT render a separate delete control; the two-icon row WCTG-02 ships at tablet/desktop widths does
not carry over. `/configuracion/categorias` MUST render the footer sentence `Toca una categoría para
editarla o eliminarla.` below `md`, replacing whatever sentence renders at tablet/desktop widths. On a
mobile viewport, deleting a category MUST be reachable ONLY via the edit screen's `Eliminar categoría`
control (WCTG-08) — no swipe or long-press affordance exists (D-4); this is the single guarantee CA-02
protects, and it MUST be assertable regardless of which mechanism the single-icon requirement below is
implemented with.

#### Scenario: Exactly one action control renders per row below `md` (jsdom if conditional / Playwright if CSS-only)

- GIVEN the viewport is below `md` (768px) — e.g. 360px
- WHEN a category row renders
- THEN the row exposes the edit action and no delete action to the accessibility tree — not merely a
  visually-hidden delete button, since a CSS-hidden control can remain reachable by assistive tech; if the
  implementation renders the delete control conditionally (no delete `<button>` in the DOM below `md`) this
  is jsdom-assertable directly, if it hides the control with a `md:hidden`-style class this requires the
  Playwright real-viewport path plus an explicit accessibility-tree check

#### Scenario: The mobile footer sentence explains the single delete path (jsdom)

- GIVEN the viewport is below `md`
- WHEN `/configuracion/categorias` renders
- THEN the footer sentence `Toca una categoría para editarla o eliminarla.` is present, verbatim

### Requirement: WCTM-04 — CA-03: mobile header uses a back control and a section title on both the list and edit screens (CA-03, frames M2/M3)

Below `md` (768px), the Configuración header MUST replace the shared `Configuración` `<h1>` (WCFG-11) with
a back-icon control plus the screen's own section title, on BOTH `/configuracion` and
`/configuracion/categorias` (the shared-chrome list/Perfil screens, WCFG-11) AND
`/configuracion/categorias/:categoriaId` (the edit screen, where it also replaces the 3-level breadcrumb,
WCTG-01). CA-03 is not scoped to the edit screen alone. The section title reuses the screen's own existing
title text — no new copy is introduced for the title itself: the list/Perfil screens reuse their own
existing section label (`Perfil`/`Categorías`), the edit screen reuses the breadcrumb leaf it replaces (the
categoría's `nombre`).

The back control MUST navigate to a fixed, named destination route — never `history.back()` /
`router.back()`, so its behavior is identical on a cold deep-link with no history entry:

- From `/configuracion/categorias/:categoriaId`, back navigates to `/configuracion/categorias`.
- From `/configuracion/categorias` or `/configuracion`, back navigates to the dashboard (`/`).

(This mapping is this spec's resolution of the proposal's open question 3 — the wireframes draw the icon
but not its destination. It is grounded in the existing route hierarchy WCTG-01 already establishes: one
level up for the edit screen, mirroring the breadcrumb segment it replaces; out of the section entirely for
its two top-level screens, since CA-01 keeps the `Perfil`/`Categorías` tab switcher available immediately
below the header for moving between them, which would make a same-level "back" redundant there. If design
or a later reconciliation against issue #332's discussion finds different evidence, this mapping MUST be
revised explicitly, not silently overridden.)

The back control MUST satisfy WCAG 2.2 AA SC 2.5.8: a touch target of at least 24×24 CSS px, matching the
minimum WCTG-13 already requires of every other Configuración control, and MUST carry a non-empty,
descriptive accessible name (in Spanish, consistent with the rest of the interface's copy) identifying it
as a return control, reachable via its accessible name — not only visually distinguishable as an icon.

`/configuracion` (M1, Perfil) inherits this header change automatically, since it is the same shared
`ConfiguracionLayout` chrome as `/configuracion/categorias` — no Perfil-specific code is required (D-5);
this MUST be asserted as its own scenario rather than assumed.

#### Scenario: The shared h1 is absent below `md` on both list/Perfil and edit screens (jsdom)

- GIVEN the viewport is below `md` (768px)
- WHEN `/configuracion`, `/configuracion/categorias`, or `/configuracion/categorias/:categoriaId` renders
- THEN no `Configuración` `<h1>` renders; a back-icon control plus the screen's own section title renders
  instead

#### Scenario: The edit screen's breadcrumb is absent below `md` (jsdom)

- GIVEN the viewport is below `md`
- WHEN `/configuracion/categorias/:categoriaId` renders
- THEN the 3-level breadcrumb (`Configuración / Categorías / {nombre}`) does not render; the back control
  and the categoría's `nombre` render instead

#### Scenario: Back from the edit screen goes to the list, regardless of history (jsdom)

- GIVEN the edit screen was reached via a cold deep-link with no prior history entry
- WHEN the user activates the back control
- THEN the URL becomes `/configuracion/categorias` — a real navigation to a named route, not a
  history-dependent action

#### Scenario: Back from the list or Perfil screen exits to the dashboard, regardless of history (jsdom)

- GIVEN `/configuracion/categorias` (or `/configuracion`) was reached via a cold deep-link with no prior
  history entry
- WHEN the user activates the back control
- THEN the URL becomes `/` — a real navigation to a named route, not a history-dependent action

#### Scenario: The back control meets the a11y minimum (jsdom)

- GIVEN the back control renders on any of the three screens
- WHEN it is queried by its accessible name and measured
- THEN it resolves to exactly one control with a non-empty accessible name and a touch target of at least
  24×24 CSS px

#### Scenario: M1 (Perfil, mobile) inherits the header change with no Perfil-specific code (Playwright, D-5)

- GIVEN the viewport is below `md` (768px) — e.g. 360px
- WHEN `/configuracion` (Perfil) renders
- THEN it shows the same back-icon-plus-title header as the Categorías list, produced entirely by the
  shared `ConfiguracionLayout`/`ConfiguracionTabs` chrome — with no change made inside `PerfilPanel` or
  `PerfilForm`

### Requirement: WCTM-05 — CA-04: edit screen stacks Nombre/Bucket for the full mobile range and inverts the footer order (CA-04, frame M3)

Below `md` (768px) — the full mobile range D-1 defines, not only the 360px floor WCTG-13 already
guarantees — `EditarCategoria`'s `Nombre` and `Bucket` fields MUST render stacked, not side by side.

`EditarCategoria`'s existing field grid activates side-by-side at `sm` (640px), a boundary narrower than,
and predating, the mobile range D-1 now defines. Between 640px and 767px inclusive, the `sm` boundary alone
renders the fields side by side, which does NOT satisfy this requirement's mobile domain. Closing this gap
— moving this grid's own boundary to `md`, or an equivalent mechanism — is required for this requirement to
hold across its full stated domain; `sdd-design`/`sdd-tasks` MUST account for it explicitly, and
verification MUST NOT rely solely on the 360px width WCTG-13 already covers.

Below `md`, the footer's button order MUST invert relative to WCTG-05's shipped one-row layout: `Guardar`
renders first, full-width; `Cancelar` renders below it, as a text-style (not full-width) button. This
requirement does NOT require separating `Guardar`/`Cancelar` from the red `Eliminar categoría` — WCTG-05's
single-footer-row, two-commit-honesty guarantee is otherwise unchanged; only the `Guardar`/`Cancelar`
sub-order and `Guardar`'s full-width treatment change.

#### Scenario: Nombre and Bucket stack across the full mobile range, not only at 360px (Playwright)

- GIVEN the viewport width is anywhere below `md` (768px), including the 640–767px range the existing `sm`
  boundary does not cover
- WHEN the edit screen renders
- THEN `Nombre` and `Bucket` render stacked — `sdd-tasks` MUST add real-viewport coverage inside 640–767px,
  since neither of D-3's named widths (360px, 880px) falls inside that gap and would therefore miss a
  regression there

#### Scenario: Guardar renders full-width above a text-style Cancelar (Playwright)

- GIVEN the viewport is below `md`
- WHEN the edit screen's footer renders
- THEN `Guardar` renders first, full-width, and `Cancelar` renders below it as a smaller, text-style control

#### Scenario: Eliminar categoría stays in the same footer as Guardar/Cancelar at mobile widths (jsdom)

- GIVEN the viewport is below `md`
- WHEN the edit screen's footer renders
- THEN the red `Eliminar categoría` control renders in the same footer as `Guardar`/`Cancelar` — CA-04 does
  not require it to move to a separate section, and this scenario exists precisely so that requirement is
  not silently over-implemented

### Requirement: WCTM-06 — CA-05: six Configuración strings resolve per tier, including a non-monotonic Nueva categoría (CA-05, frames M2/T2)

The following strings MUST resolve to the value named for each tier — mobile <768px, tablet 768–1023px,
desktop ≥1024px (WCTM-01):

| String | Desktop (≥1024) | Tablet (768–1023) | Mobile (<768) |
|---|---|---|---|
| Patterns section heading | `Patrones de auto-categorización` | `Patrones de auto-categorización` (unchanged) | `Patrones` |
| Add-pattern control | `Agregar patrón` | `Agregar patrón` (unchanged) | `Agregar` |
| Zero-patterns note (WCTG-06) | `Sin patrones, la categoría solo se puede asignar manualmente.` | (unchanged) | `Sin patrones: solo asignación manual.` |
| List subtitle `Tu catálogo propio…` | rendered | rendered (unchanged) | omitted |
| `Nueva categoría` button label | `Nueva categoría` | `Nueva` | `Nueva categoría` |

The `Nueva categoría` row is **non-monotonic** — long at desktop, short at tablet, long again at mobile —
because CA-01 names the full string `Nueva categoría` for frame M2's full-width button (which has room for
the long label), while CA-05 separately names the tablet shortening `Nueva` for frame T2's narrower,
fixed-width button. A mapping that shortens monotonically as width decreases does NOT satisfy both CA-01
and CA-05 simultaneously; a mechanism keyed only on a single boolean threshold (the two-`<span>` idiom
already used elsewhere in this codebase) cannot express this three-way, non-monotonic mapping directly.

#### Scenario: Patrones/Agregar/note/subtitle shorten only below `md`, tablet matches desktop (Playwright)

- GIVEN the viewport is 1280px, then 880px, then 360px in turn
- WHEN `PatronesSection` and `CategoriasPanel` render at each width
- THEN 1280px and 880px both render the long forms (`Patrones de auto-categorización`, `Agregar patrón`,
  the long zero-patterns note, and the subtitle), and only 360px renders the short forms and omits the
  subtitle

#### Scenario: Nueva categoría is non-monotonic — long at mobile and desktop, short only at tablet (Playwright)

- GIVEN the viewport is 1280px, then 880px, then 360px in turn
- WHEN the `Nueva categoría` button renders at each width
- THEN 1280px and 360px both render `Nueva categoría`, and only 880px renders `Nueva`

#### Scenario: Which string is rendered is verifiable, not merely present in the markup (Playwright)

- GIVEN a CSS-only mechanism where both the short and long forms of a string exist in the DOM
  simultaneously, one hidden by a viewport-scoped utility class
- WHEN the active viewport is asserted against
- THEN the assertion is made against rendered/visible content at a real viewport, not against the mere
  presence of a string literal in markup — the same class of gap `WCTG-02`'s icon-suppression risk names,
  and the exact gap that shipped `WCTG-14` false

## MODIFIED Requirements

### Requirement: WCTG-13 — Mobile viewport floor stays a floor; the M2/M3 restructure lands in `WCTM-*` (decision 8, §J; scope clause repaired by US-063)

At a 360px viewport, both screens MUST still guarantee the three floors below — unchanged from the original
requirement: (a) no horizontal overflow/scroll; (b) `Nombre` and `Bucket` render stacked, not side by side;
(c) every interactive control (row actions, footer buttons, tab links) has a touch target of at least
24×24 CSS px (WCAG 2.2 AA SC 2.5.8, ADR-018). These three floors are a MINIMUM every viewport below `md`
(768px) MUST clear — never a ceiling. `WCTM-01..06` (US-063, this change) now define the actual M2/M3
restructure: horizontal tabs, a single row icon, back-icon IA replacing the h1/breadcrumb, an inverted
footer, and shortened labels.
(Previously: this requirement's own text carved the M2/M3 restructure OUT of scope and assigned it to
"US-063 (#332)" as future work. That clause is now false — this change IS US-063 — and is retired; the
floors below are unchanged and still hold.)

#### Scenario: No horizontal overflow at 360px

- GIVEN the viewport is 360px wide
- WHEN either screen renders
- THEN no element causes horizontal scrolling

#### Scenario: Nombre and Bucket stack at 360px

- GIVEN the viewport is 360px wide
- WHEN the edit screen renders
- THEN `Nombre` and `Bucket` render as a stacked column, not side by side

#### Scenario: Every interactive target meets the 24×24 CSS px minimum

- GIVEN the viewport is 360px wide
- WHEN row actions, footer buttons, and tab links are measured
- THEN each has a touch target of at least 24×24 CSS px

### Requirement: WCTG-14 — CA-06 tablet renders correctly at the `md` breakpoint (repaired; supersedes "no new tier", US-063 D-1/D-2)

T2 (list) and T3 (edit) MUST render correctly with a fixed-width sidebar/tab column beside a fluid content
column, activated at `md` (768px) — the tier US-063 D-1 introduces — not at `lg` (1024px), and not without
any new breakpoint entry as originally written. At tablet width, `Nombre` and `Bucket` MUST stay side by
side (unlike the mobile floor in WCTG-13), and pattern rows shrink proportionally with the fluid column.
(Previously: this requirement asserted reuse of `WCFG-11`'s existing `lg` grid "with NO new entry added to
`layout.ts`", and its first scenario claimed that at T2/T3's measured width (880px) "the tab/sidebar column
is fixed-width, the content column is fluid". That scenario was FALSE as shipped: `ConfiguracionLayout`'s
grid activated at `lg` (1024px), and 880 < 1024, so the grid fell back to `grid-cols-1` — the same stacked
layout mobile got. The requirement was self-contradictory at spec-freeze: it demanded reuse of the existing
`lg` grid AND a fixed tab column at 880px, and those could not both hold. This repair moves the boundary to
`md` (768px), where 880 ≥ 768 holds, making the scenario true. The "no new entry in `layout.ts`" guarantee
is preserved even though the boundary moves: `md` is expressed as a literal `md:`-prefixed utility class,
the same mechanism `lg:` already used, with no config-file entry required — see WCTM-01.)

#### Scenario: Tablet width gets the fixed tab/content grid via the `md` breakpoint (repaired)

- GIVEN the viewport is at T2/T3's measured width (880px)
- WHEN the list and edit screens render
- THEN the tab/sidebar column is fixed-width and the content column is fluid — because 880px is ≥ `md`
  (768px), the tier US-063 D-1 introduces, not because of `lg` (1024px), which 880px never reached
  (880 < 1024) — the exact arithmetic gap that shipped this scenario false originally

#### Scenario: Nombre and Bucket stay side by side at tablet width

- GIVEN the viewport is at T3's measured width
- WHEN the edit screen renders
- THEN `Nombre` and `Bucket` render side by side, not stacked

### Requirement: WCFG-11 — CA-04 fluid layout reproduces T1 at the `md` breakpoint (boundary moved from `lg`, US-063 D-1/D-2)

The shared `configuracion` layout's grid (heading + tab list beside the routed panel) MUST be fluid (a
fixed-width first column plus a flexible panel) and MUST render **that kind of layout** at T1's viewport
width, without adding any constant to `layout.ts` or changing `AppShell`/`Sidebar`/`BottomTabs`.

**The claim is kind-level, not pixel-level, and that is a repair — not a loosening.** The superseded
wording said "MUST reproduce T1's **measured proportions**". That was never literally true and never
could be: the frames draw the tab column at **113px** (`wireframes-extracted.md` §1, §3) while
`ConfiguracionLayout` ships **200px** (`lg:grid-cols-[200px_1fr]`), a deliberate US-042 choice nobody
has asked to revisit. Left as written, this change would be required to author a test asserting 113px —
a test that cannot pass against intended code. What the requirement actually protects is the *shape*
(fixed column beside fluid panel), and that is what it now says. Any future change wanting the frames'
exact 113px must say so as its own decision, against the code, not inherit it by implication here.
Below `md` (768px) — not `lg` — the layout's two columns MUST stack (heading + tab list above the routed
panel). This grid is shared chrome and MUST apply identically to whichever child route (`/configuracion`
Perfil or `/configuracion/categorias` list) renders inside it. The edit route
(`/configuracion/categorias/:categoriaId`) opts out of this chrome per WCTG-01 and is governed by WCTG-14
instead.
(Previously: the two-column boundary was `lg` (1024px). By the same arithmetic that shipped `WCTG-14`
false, this requirement's own first scenario was ALSO unverified and, on the evidence, false as shipped:
T1's measured width is 880px, which is below `lg` (1024px), so the grid this requirement governs would have
fallen back to `grid-cols-1` at T1's own width — the stacked layout, not the fixed-sidebar/fluid-content
layout the scenario claims. This repair moves the boundary to `md` (768px), where 880 ≥ 768 holds, and
scenario 1 becomes true. "No new entry in `layout.ts`" is preserved for the same reason as WCTG-14: `md` is
a stock Tailwind literal-class boundary, not a config constant. This is the same grid `WCTG-14` reuses, so
this repair and `WCTG-14`'s repair are the same fix applied once.)

#### Scenario: T1 width reproduces the measured proportions (repaired)

- GIVEN the viewport is at T1's width (880px)
- WHEN the layout renders (Perfil or the Categorías list inside it)
- THEN the sidebar width/font are unchanged and the layout's own gutter/panel measurements match T1 — with
  a fixed-width column and a fluid column, because 880px is ≥ `md` (768px), and with no new entry in
  `layout.ts`

#### Scenario: Below `md` the columns stack

- GIVEN the viewport is below `md` (768px)
- WHEN the layout renders
- THEN the heading and tab list appear above the routed panel instead of beside it

#### Scenario: The edit route does not inherit this grid

- GIVEN the user is on `/configuracion/categorias/:categoriaId`
- WHEN the page renders
- THEN it does not render the shared tab-list grid; the back-icon chrome (WCTG-01/WCTG-14/WCTM-04) renders
  instead
