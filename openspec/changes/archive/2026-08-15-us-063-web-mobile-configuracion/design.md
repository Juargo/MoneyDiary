# Design: US-063 — Web Configuración, mobile viewport variants (M2/M3)

- **Change**: `us-063-web-mobile-configuracion`
- **Status**: Designed (2026-08-14)
- **Inputs**: `proposal.md` (binding decisions D-1…D-5, §0–§2, open questions 1–5) ·
  engram `sdd/us-063-web-mobile-configuracion/{explore,state}` ·
  `openspec/changes/archive/2026-08-14-us-043-web-configuracion-categorias/`
  (`design.md`, `wireframes-extracted.md` §3)
- **Extends**: US-043's `design.md` (Q-then-D structure, CORRECTION-marked departures, `never`-guarded
  copy tables, "the DOM carries the claim the layout no longer can")
- **New ADR**: **No.** ADR-018 (a11y by layers, WCAG 2.2 AA), ADR-016 (Vitest), ADR-024 (the client
  only renders), ADR-008 (stack) applied. Nothing deviates.

Departures from the proposal are marked **CORRECTION** and carry their reason. There are **five**
distinct ones:

| # | What the proposal says | Correction | Where |
|---|---|---|---|
| 1 | `index.css` *"possibly modified"* to name the tier | It is **not** modified — stock `md` is already 768 | §1.1 (restated in §3) |
| 2 | Only `WCFG-11`'s *"below `lg`"* scenario needs the tier change | `WCFG-11` **scenario 1** carries the same false claim as `WCTG-14`, from the same arithmetic — and its *"measurements match T1"* clause was never literally true | §1.1 |
| 3 | *"a CSS-hidden button still exists in the a11y tree unless removed"* | False for `display:none`, which is what `md:hidden` emits. CA-02's guarantee **is** satisfied by CSS | §1.4 |
| 4 | Success Criteria require the mobile footer *"separated from `Eliminar categoría`"* | Contradicts the proposal's own §2 note that this is **not** a criterion. Resolved in favour of §2 | §1.5 |
| 5 | Approach: slice 1 = tier, slice 2 = Playwright | **Inverted.** The harness lands first, with the `WCTG-14` assertion committed as `test.fail()` | §1.6, §8 |

---

## 0. Framing — the three things this document exists to pin down

Most of this change is idiom: Tailwind utilities on components that already exist, a lucide icon, a
`<Link>`. Three things are not, and everything else is subordinate to them.

1. **One testability decision, taken once for all five criteria.** CSS-only or JS breakpoint state is
   not five independent calls; taken per-criterion it produces a codebase running two responsive
   models at once. §1.4 decides it once and states, without softening, what the unit suite can and
   cannot prove afterwards.
2. **A verification harness that must prove the defect before repairing it.** `WCTG-14` shipped false
   through six layers of review because nothing could evaluate geometry. A harness that arrives
   *after* the fix inherits the same epistemic weakness — it would only ever have seen green. §1.5
   lands it first, with the failing assertion committed as `test.fail()`.
3. **A 3-way label split that must not become 3-way duplication of controls.** CSS-only variants are
   safe for *text* and fatal for *controls* — two `Guardar` buttons in the DOM break every
   `getByRole` query in the shipped suite. §1.2 turns that into one greppable rule.

---

## 1. The five forks, resolved

### 1.1 — How the `md` tier is introduced

**Facts, verified in the tree (not inherited from the proposal):**

| Fact | Evidence |
|---|---|
| `index.css` has no `--breakpoint-*` override → Tailwind 4 stock scale applies (`sm`=640, `md`=768, `lg`=1024) | `apps/web/src/index.css:5-47`, `@theme` holds only fonts and colors |
| **The `md:` variant is used ZERO times in `apps/web/src` today** | grep `\bmd:` over `src/` → only `--radius-md` and prose in comments |
| The Configuración grid is `lg:grid-cols-[200px_1fr]` | `ConfiguracionLayout.tsx:34` |
| The identity-field grid is `sm:grid-cols-[1fr_220px]` | `EditarCategoria.tsx:406` |
| `layout.ts` holds only the shell's four `lg` shell constants | `app-shell/layout.ts:17-24` |

**D-01 — The tier is Tailwind's stock `md` (768px), used as bare utilities. No config change, no
constants module, no `layout.ts` coupling.**

Three options were live:

| Option | Verdict |
|---|---|
| A constant in `app-shell/layout.ts` | **Rejected.** The proposal forbids it (D-1: shell concern) and it is the wrong shape anyway — `layout.ts` exists to keep *pairs* of coupled values in sync (`w-64`↔`lg:pl-64`). `md:grid-cols-[200px_1fr]` has no partner |
| A `--breakpoint-md` override in `index.css` | **Rejected.** It would redefine `md` **app-wide** to buy a value it already has. Stock `md` is already exactly 768 |
| A new `configuracion/breakpoints.ts` exporting class strings | **Rejected.** Each `md:` utility appears **once**, in a different file. A constant per single-use string is drift with extra steps (`dry`'s three-strike rule is not met) |

The framing that matters for the spec delta: **we are not creating a breakpoint, we are starting to
use one Tailwind already ships.** `WCTG-14`'s literal clause — *"with NO new entry added to
`layout.ts`"* — therefore stays **true**; its *intent* ("this page runs one boundary, `lg`") is
reversed. The spec delta MODIFIES it for the intent, and the reversal's justification is the
arithmetic in `proposal.md` §1, restated as the one assertion nobody ever ran (§4, `E-02`).

**Where the tier is defined, since it is not a constant.** Two places, both executable or
load-bearing, neither decorative:

- **Executable**: `playwright.config.ts`'s three projects (360 / 880 / 1280). This is the only
  artifact in the repo that can be *wrong* about the tier and fail.
- **Prose**: the docblock of `EtiquetaResponsiva.tsx` (§1.2) — the one file that must encode all
  three bands at once, so the definition lives where it is unavoidable.

**D-02 — `ConfiguracionLayout`'s grid becomes `grid grid-cols-1 gap-8 md:grid-cols-[200px_1fr]`.**

Arithmetic, checked against Tailwind's real scale (this is the check whose absence shipped
`WCTG-14`):

| Viewport | `md`(768) active? | `lg`(1024) active? | Grid | Requirement served |
|---|---|---|---|---|
| 360 | no | no | `grid-cols-1` — tabs stack above the panel | M2/CA-01 |
| 880 | **yes** | no | `[200px_1fr]` — **fixed tab column + fluid content** | `WCTG-14` repaired |
| 1280 | yes | yes | `[200px_1fr]` — unchanged from shipped | no regression |

**CORRECTION to the proposal's Affected Areas.** It lists `apps/web/src/index.css` as *"possibly
modified — only if design names the tier via `--breakpoint-*`"*. It is **not** modified. Naming the
tier that way changes `md` for the whole app to obtain the value it already has.

**CORRECTION / finding handed to `sdd-spec`: `WCTG-14` is not the only false requirement — `WCFG-11`
carries the same defect, in the same file, from the same arithmetic.** `WCFG-11` scenario 1 asserts
the layout *"reproduces T1's measured proportions at T1's viewport width"*. **T1 is 880×1248**
(`wireframes-extracted.md` frame table) and the grid stacks below 1024 — so it reproduces nothing at
T1 either. The proposal only foresaw `WCFG-11`'s *second* scenario (`lg` → `md`) needing a change.
Both scenarios need it. Additionally, *"the layout's own gutter/panel measurements match T1"* was
**never literally true at any width**: T1 draws a `113px` tab column, the code ships `200px`. D-02
repairs the *kind* of layout (fixed + fluid), not the pixel values, and the spec must be reworded to
the kind-level claim — otherwise this change is required to write a test that cannot pass.

---

### 1.2 — The label mechanism

The shipped idiom is two `<span>`s plus a stable `aria-label` (`CategoriasPanel.tsx:205-211`,
`:268-276`). It encodes exactly one boolean. CA-05 needs three bands across six strings, at least two
of which are genuinely 3-way:

| String | mobile (<768) | tablet (768–1023) | desktop (≥1024) | Source |
|---|---|---|---|---|
| `Nueva categoría` (button) | `Nueva categoría` | `Nueva` | `Nueva categoría` | CA-05 (tablet) + §3's silence on mobile — **non-monotonic**, Q-01 |
| list footer note | `Toca una categoría para editarla o eliminarla.` | `Eliminar en uso: advertencia, transacciones a Sin categoría.` | `Eliminar una categoría en uso muestra advertencia: sus transacciones pasan a Sin categoría.` | CA-02 (mobile) + shipped `lg` split |
| `Patrones de auto-categorización` | `Patrones` | (long) | (long) | CA-05 |
| `Agregar patrón` | `Agregar` | (long) | (long) | CA-05 |
| `Sin patrones, la categoría solo se puede asignar manualmente.` | `Sin patrones: solo asignación manual.` | (long) | (long) | CA-05 |
| `Tu catálogo propio…` subtitle | **absent** | shown | shown | CA-05 |

**D-03 — One typed component, `components/configuracion/EtiquetaResponsiva.tsx`, emitting two or
three literal-class spans.**

```tsx
export type CopiaResponsiva = {
  readonly movil: string;
  /** Omit when tablet shows the desktop string (the 4 mobile-only shortenings). */
  readonly tablet?: string;
  readonly escritorio: string;
};
```

Three class strings, written **literally** in this file (Tailwind 4 scans literals only —
`layout.ts:10-13`'s constraint):

| Band | Class |
|---|---|
| mobile only | `md:hidden` |
| tablet only | `hidden md:inline lg:hidden` |
| desktop only | `hidden lg:inline` |

When `tablet` is omitted the component emits two spans (`md:hidden` + `hidden md:inline`), so the
2-way case costs no extra DOM. `escritorio` is also the canonical string for the accessible name
(D-04). Pure, no React state, `it.each`-testable on "which strings and which classes are emitted for
a 2-band vs a 3-band input" — the one thing jsdom *can* prove about CA-05.

The subtitle's omission is **not** a label swap and does not use this component: it is
`className="hidden md:block"` on the existing `<p>`. Modelling "absent" as a copy variant would put an
empty string in a copy table.

**D-04 — Every element whose visible text is responsive carries an explicit `aria-label` equal to the
`escritorio` string. This is a hard rule, not a per-case judgement.**

Two independent reasons, both load-bearing:

1. **The a11y reason.** Name-from-content skips `display:none` subtrees, so in a real browser the
   accessible name would *change with viewport width*. A control that is `Nueva categoría` at 1280 and
   `Nueva` at 880 is two controls to a returning screen-reader user. `aria-label` pins it.
2. **The test reason, which is the one that keeps the shipped suite alive.** jsdom applies no
   Tailwind CSS (components never import `index.css`; only `main.tsx` does), so **every span is
   "visible" in jsdom** and name-from-content would compute the *concatenation*
   (`PatronesPatrones de auto-categorización`). `getByRole('button', { name: 'Nueva categoría' })`
   would stop resolving across the existing suite. `aria-label` overrides name-from-content, so jsdom
   and the browser agree at every width — which is precisely why the shipped idiom put it there
   (US-043 Q8c) and why generalising the idiom must generalise the rule with it.

**Where the rule does NOT apply: non-interactive `<p>` text** (the footer note, the `sin patrones`
note). `aria-label` on a nameless `<p>` is ignored by much assistive tech, and **SC 2.5.3 (Label in
Name) governs user-interface components with labels, not static prose** — so the note's mobile form
not being a substring of its desktop form is not a violation. Consequence for `sdd-tasks`: unit tests
must query these by the **variant string** (`getByText('Sin patrones: solo asignación manual.')`),
never by the paragraph's `textContent`, which in jsdom is all variants concatenated.

`<h2 id="titulo-patrones">` gets the `aria-label` despite not being interactive, because
`PatronesSection.tsx:94` names its `<section>` through `aria-labelledby` — an unstable heading name
would silently rename the landmark.

**SC 2.5.3 check on the three interactive cases**: `Nueva categoría` ⊇ `Nueva` ✓ ·
`Patrones de auto-categorización` ⊇ `Patrones` ✓ · `Agregar patrón` ⊇ `Agregar` ✓.

---

### 1.3 — The back control (CA-03), on both screens

No back-navigation pattern exists anywhere in `apps/web` (`ArrowLeft`/`ChevronLeft`/`router.back` →
zero hits). But a **destination** precedent does: `EditarCategoria.tsx:147,158` already renders
`<Link to="/configuracion/categorias">Volver a Categorías</Link>` in its error/not-found states.

**D-05 — An explicit `<Link to>`, never `router.history.back()`.**

Browser-back is unpredictable exactly where this control matters most: the edit screen is
deep-linkable (`configuracion_.categorias.$categoriaId`), so on a cold open there is no history entry
and `back()` either does nothing or leaves the app. An explicit destination is also the only version
of this control that can be asserted at all. The accessible name **names the destination**, reusing
the shipped string verbatim rather than inventing a second wording.

| Screen | Component that owns it | Destination | Accessible name |
|---|---|---|---|
| `/configuracion/categorias/{id}` (M3) | `EditarCategoria` (replaces the breadcrumb below `md`) | `/configuracion/categorias` | `Volver a Categorías` |
| `/configuracion`, `/configuracion/categorias` (M2, M1) | `ConfiguracionLayout` (shared chrome) | `/` | `Volver al inicio` — **Q-02**, spec owns it |

**D-06 — One shared `components/configuracion/BotonVolver.tsx`, and `CLASE_BOTON_ICONO` moves up one
level.**

Two call sites, in two different folders, with an identical and easy-to-get-subtly-wrong a11y
contract (accessible name, visible focus ring, ≥24×24 target). The extraction shares the *contract*,
not the markup — stated explicitly because `dry`'s three-strike rule is not met on markup alone.

`CLASE_BOTON_ICONO` (`size-6` = 24 CSS px, SC 2.5.8) is reused, **not redefined** (proposal
constraint). It currently lives in `categorias/estilos.ts`; `ConfiguracionLayout` is one level above
that folder, and US-043's D-09 already ruled that a shared-level file importing *into* a section
folder "would signal ownership that is not real". So the constant **moves to
`components/configuracion/estilos.ts`** and its three existing importers (`CategoriaFila`,
`PatronFila`, and the new `BotonVolver`) re-point. Mechanical, one commit, no value change — a test
already pins `toContain('size-6')` and moves with it.

`to` is typed as a narrow literal union (`Extract<NavRoute, '/' | '/configuracion/categorias'>`), not
`string`: a third destination must be a decision, not an accident.

**D-07 — The `<h1>Configuración</h1>` does not disappear; it becomes `max-md:sr-only`.**

CA-03 says the mobile header has no *visible* `<h1>Configuración`. It does not say the page loses its
heading, and losing it is a real degradation (the document would start at `h2`). `sr-only` satisfies
the frames (nothing visible, zero layout space) while keeping the h1 in the a11y tree at every width
— and, not incidentally, keeps every shipped
`getByRole('heading', { name: 'Configuración' })` assertion passing unchanged.

This is the **one deliberate `max-*` variant** in the change; everything else is mobile-first `md:`.
The reason is legibility: the desktop treatment (`text-2xl font-semibold`) stays unconditional and
one variant marks the exception, versus `sr-only md:not-sr-only md:text-2xl md:font-semibold`, which
inverts the file's whole styling voice for one node.

**The "section title" the frames draw next to the back icon is the panel's own `<h2>`**
(`Categorías y patrones`, `Editar perfil`), which already renders directly below the chrome. No new
title prop, no `staticData` on the routes, no second source for a string that already exists.
*Rejected alternative, recorded*: give each leaf route `staticData: { tituloSeccion }` and have the
layout read the deepest match. It works, but it buys a vertical ordering the criterion never asked
for at the price of coupling the layout to router matching. The ordering question goes to spec as
**Q-03**.

**Focus.** `BotonVolver` is a plain link: activating it is a route change, and the app already leaves
post-navigation focus to the browser on every other `<Link>`. This change introduces **no**
route-transition focus management — inventing it here would be a new global behaviour smuggled in
through a mobile chrome fix. Recorded so nobody "fixes" it in review.

---

### 1.4 — Icon suppression, and the testability axis of the whole change

This is the most consequential decision in the document. It applies to CA-01, CA-02, CA-04 and CA-05
at once, and it is taken once.

**Facts, verified:**

| Fact | Consequence |
|---|---|
| **Zero `matchMedia` / `useMediaQuery` usage in `apps/web/src`** | a JS breakpoint has no precedent to follow, and `matchMedia` is **absent from jsdom** — introducing it means a global stub in `src/test/setup.ts` whose blast radius is *every* test file in the app |
| `apps/web` is a pure SPA with no SSR | the usual hydration argument against `matchMedia` **does not apply here**, and this design does not use it |
| Tailwind's `hidden`/`md:hidden` compile to `display: none` | a CSS-suppressed control is removed from the accessibility tree **and** from the tab order — it is genuinely gone, not merely invisible |

**CORRECTION to the proposal's risk table.** It states that *"a CSS-hidden button still exists in the
a11y tree unless removed"*. That is true of `visibility:hidden`, opacity and off-screen positioning;
it is **false for `display:none`**, which is what `md:hidden`/`hidden` emit. CA-02's guarantee — *one
delete path on mobile* — is therefore **satisfied in the accessibility sense** by CSS alone. The
guarantee that CSS cannot give is *machine verification in jsdom*, which is a different problem with
a different answer (§1.5).

**D-08 — CSS-only. Zero JS breakpoint state, zero `matchMedia`, for all five criteria.**

| | CSS-only (chosen) | JS `useMediaQuery` (rejected) |
|---|---|---|
| Idiom | every responsive decision in this repo | none; introduces a second responsive model beside the first |
| Layout (CA-01, CA-04) | `md:` utilities | `className={esMovil ? … : …}` — strictly worse than the utility it replaces |
| a11y of CA-02 | correct (`display:none`) | correct |
| jsdom assertability of the five CAs | **almost none** | high |
| Test-infra cost | none | a global `matchMedia` stub in `setup.ts` — every test file in the app |
| Sources of truth for `768` | one (the CSS scale) | two (the CSS scale and a JS constant) |

**The consequence, stated plainly rather than softened: after D-08 the Vitest suite cannot assert a
single one of CA-01…CA-05 as a user-visible outcome.** What it can still assert is that the
*mechanism is wired* — the class literal is present, `EtiquetaResponsiva` emits the right three
strings for the right three bands, the delete button carries `hidden md:inline-flex`, the back link
exists with its accessible name, the h1 is still in the a11y tree. That is mechanism coverage, not
acceptance coverage, and calling it acceptance coverage is exactly the mistake that shipped
`WCTG-14`. **The entire acceptance burden moves to Playwright**, which is why §1.5 makes the harness
land *first* and why it is not negotiable down to a smoke test.

**D-09 — The rule that makes CSS-only survivable: variants may duplicate TEXT, never CONTROLS.**

`EtiquetaResponsiva` puts two or three `<span>`s of copy in the DOM at once — harmless, because every
query resolves through the `aria-label` of the single enclosing control (D-04). Rendering **two
footers**, or two `Guardar` buttons, one hidden per band, would put two identically-named controls in
the DOM; in a real browser only one is in the a11y tree, but in jsdom `getByRole('button', { name:
'Guardar' })` throws *"found multiple elements"* and the shipped suite dies. This is the obvious
instinct when a layout has to invert (§1.5's CA-04), so it is written down as a greppable
prohibition: **exactly one instance of every interactive control, at every width.** Inversions are
solved by DOM order plus a `*-reverse` utility (D-10), never by duplication.

Mechanical note for CA-02: `CategoriaFila`'s delete button already composes through `cn()`
(`CategoriaFila.tsx:145-148`). `cn(CLASE_BOTON_ICONO, 'hidden md:inline-flex', …)` is correct
**because the added class comes second** — tailwind-merge treats `display` as one group, so `hidden`
wins over `CLASE_BOTON_ICONO`'s `inline-flex` while the `md:` variant survives as a separate group.
Reversing the argument order silently produces `inline-flex` and the criterion fails with no test to
catch it.

---

### 1.5 — CA-04's footer inversion, and where the DOM/visual divergence lands

CA-04 requires `Guardar` above `Cancelar` at mobile. The shipped DOM order is `Eliminar`, then
`Cancelar`, `Guardar` (`EditarCategoria.tsx:485-587`), and D-09 forbids duplicating the buttons.
**Some DOM-versus-visual divergence is therefore unavoidable** — CSS can reorder pixels, never tab
order. The only real question is which viewport absorbs it.

| Option | Divergence lands on | Verdict |
|---|---|---|
| Keep DOM, `flex-col-reverse` below `md` | **mobile**, vertically, across three controls | **Rejected.** SC 1.4.10 (Reflow) means a desktop user at 400% zoom *gets the mobile layout* — "mobile" is not a keyboard-free zone, and a reversed vertical reading order is the textbook 1.3.2/2.4.3 failure |
| Two footers, one per band | nowhere | **Rejected by D-09** — duplicate controls break every jsdom `getByRole` |
| **Reorder the DOM to the mobile order; reverse the desktop row** | **desktop**, horizontally, within one visible row | **Chosen** |

**D-10 — The footer's DOM order becomes `[Guardar, Cancelar]`, then `Eliminar categoría`; the desktop
appearance is restored with `md:flex-row-reverse`.**

```tsx
<footer className="mt-2 flex flex-col gap-3 border-t border-border pt-4
                   md:flex-row-reverse md:flex-wrap md:items-center md:justify-between">
  <div className="flex flex-col gap-2 md:flex-row-reverse md:items-center">
    <button ref={guardarRef} type="submit" form="form-identidad" className="w-full … md:w-auto">Guardar</button>
    <button type="button"   form="form-identidad" className="w-full … md:w-auto">Cancelar</button>
  </div>
  <button ref={eliminarRef} type="button" className="self-start …">Eliminar categoría</button>
</footer>
```

| Viewport | Visual result |
|---|---|
| 360 | `Guardar` full-width · `Cancelar` below it · `Eliminar categoría` last, `self-start` — **CA-04 ✓** |
| ≥768 | outer `flex-row-reverse` + `justify-between` puts `Eliminar` left and the pair right; inner `flex-row-reverse` puts `Cancelar` left of `Guardar` — **byte-for-byte the shipped appearance** |

Two properties this ordering buys that the rejected options do not:

- **US-043's D-02 mechanism 4 survives at both widths.** *"The red button is never adjacent to
  `Guardar`"* holds on desktop (`justify-between` + `border-t`) **and** on mobile, where `Cancelar`
  now sits between them. The obligation is preserved, not degraded — and the load-bearing mechanisms
  (`form=` association, per-row pattern announcements, disambiguated accessible names) are untouched
  by this change entirely.
- **The residual divergence is the mildest available**: on desktop, tab order is
  `Guardar → Cancelar → Eliminar` while the visible row reads right-to-left. All three controls are
  simultaneously visible in one row, each has a visible focus ring, and each already carries a
  disambiguated accessible name (`Cancelar cambios de nombre y bucket`,
  `Eliminar categoría {nombre}`). SC 1.3.2's "meaningful sequence" concerns content whose reading
  order conveys meaning; three sibling buttons in a toolbar row do not.

**CORRECTION to the proposal's Success Criteria.** Its second bullet requires the mobile footer to be
*"separated from `Eliminar categoría` — asserted by Playwright"*, while its own §2 note states that
separating them is **not** an acceptance criterion. The proposal contradicts itself. This design
resolves it in favour of §2 (which is reconciled against #332): **`Eliminar categoría` is not moved,
resized, or given a separation rule.** It lands last in the mobile stack as a *consequence* of D-10's
ordering, and Playwright asserts the **order** CA-04 requires (`Guardar`.y < `Cancelar`.y), never a
separation distance the criteria never defined.

**CORRECTION (orchestrator, 2026-08-14) — this paragraph was wrong twice. It now reads:**

`Nombre`/`Bucket` **must** move from `sm:grid-cols-[1fr_220px]` to `md:` (`EditarCategoria.tsx:406`,
`NuevaCategoriaForm.tsx:69`). Task 25 performs the move.

The superseded text said stacking needed *no* code change and that moving to `md:` "would break
`WCTG-14`'s second scenario (side-by-side at 880)". Both halves are false:

1. **The arithmetic does not hold.** `md:` applies at **≥768**, and **880 ≥ 768** — side-by-side at
   880 survives the move untouched. Nothing breaks.
2. **The premise ignored the 640–767px band.** "Stacks below 640" is true, but D-01 defines mobile as
   **<768**. With `sm:`, the 128px band from 640 to 767 is *mobile by the tier* yet renders the fields
   *side by side* — a direct violation of `WCTM-05`/CA-04, which requires stacking across the **full**
   mobile range. Neither of the originally-named viewports (360, 880) falls inside that band, so no
   planned assertion would have caught it.

Caught by `sdd-tasks` reading this document against the frozen spec and **reporting the contradiction
instead of encoding it** — the behaviour US-043's retrospective asked for. This is the fourth
arithmetic error in this project's plan layers (`WCFG-11`, `WCTG-14`, the 640–767 gap, and this claim)
and the first caught before it reached code. `WCTM-05` and task 25 are authoritative; a fourth
Playwright viewport inside 640–767 is required to pin it.

---

### 1.6 — The Playwright slice

**D-11 — Playwright, Chromium-only, three viewport projects, every `/api/**` request stubbed at the
network layer, run against `vite preview` of the production build.**

| Aspect | Decision | Why |
|---|---|---|
| Location | `apps/web/playwright.config.ts` · specs in `apps/web/e2e/*.e2e.ts` | `apps/web`-scoped, so CI's existing `web` path filter covers it with no new filter |
| Server | `webServer: { command: 'pnpm run build && pnpm exec vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI }` | `preview` serves the real build, so the **real compiled Tailwind CSS** is under test. `vite dev` would test a different CSS pipeline than production ships. `pnpm exec vite preview` rather than `pnpm preview --port …` — the workspace `preview` script takes no arguments and `pnpm run` argument forwarding is not something to bet the harness on |
| Backend | **None.** `page.route('**/api/**')` fulfils `GET /api/auth/me`, `GET /api/categorias`, `GET /api/version` from fixtures | The suite asserts *layout*. A real API adds Render cold starts, DB state and auth cookies as failure modes for assertions that do not depend on any of them. Stubbing `/api/auth/me` also satisfies `_authenticated.beforeLoad`'s `requireSession` with no login flow |
| Browsers | Chromium only | The criteria are layout facts of one CSS engine. Firefox/WebKit triple CI time for zero additional criterion coverage. Recorded as a deliberate narrowing, not an oversight |
| Projects | `movil` 360×740 · `tablet` 880×1000 · `escritorio` 1280×800 | The executable definition of D-01's tier |
| `@axe-core/playwright` | **Not installed in this slice** | ADR-018 names it, but no CA here is an axe finding. Adding it is a recorded follow-up, not a silent omission |

**Three integration details that are load-bearing and are invisible until they bite:**

1. **Vitest would swallow the suite.** Vitest's default `include` is
   `**/*.{test,spec}.?(c|m)[jt]s?(x)` across the workspace root, so `e2e/*.spec.ts` would be collected
   by `pnpm web test` and fail on importing `@playwright/test`. Two independent guards: the naming
   convention `*.e2e.ts` (matched by `testMatch` in the Playwright config) **and** an explicit
   `exclude: [...configDefaults.exclude, 'e2e/**']` in `vitest.config.ts`.
2. **`pnpm web typecheck` would ignore the whole suite.** `tsconfig.json` references only
   `tsconfig.app.json` (`include: ["src"]`) and `tsconfig.node.json`
   (`include: ["vite.config.ts", "api/**/*.ts"]`) — `e2e/` and `playwright.config.ts` are in neither.
   A new `tsconfig.e2e.json` (`types: ["node"]`, including `e2e/**/*.ts` and `playwright.config.ts`)
   is added to `tsconfig.json`'s `references`. Without it, the change's only real verification layer
   is the one thing in the repo that is never typechecked.
3. **`sr-only` is VISIBLE to Playwright.** `sr-only` renders a 1×1 clipped box, so
   `expect(h1).toBeHidden()` on D-07's heading would **fail**. The assertion is on geometry:
   `expect((await h1.boundingBox())!.height).toBeLessThanOrEqual(1)`. `toBeHidden()` is correct only
   for `display:none` nodes (the `md:hidden` spans, the breadcrumb, the delete icon).

**CI**: a new `web-e2e` job in `.github/workflows/ci.yml`, gated on the same
`needs.changes.outputs.web` filter as the `web` job, added to `ci-success`'s `needs`. Browsers via
`pnpm --filter @moneydiary/web exec playwright install --with-deps chromium`, with
`actions/cache` on `~/.cache/ms-playwright` keyed by the resolved Playwright version. A **separate**
job, not extra steps on `web`: a geometry failure must be distinguishable at a glance from a unit
failure, and the browser download must not slow the fast gate.

**D-12 — The harness lands FIRST, and the `WCTG-14` assertion is committed as `test.fail()` before
the grid is repaired.**

**CORRECTION to the proposal's Approach ordering** (slice 1 = tier, slice 2 = Playwright). Inverted,
for two reasons:

1. **Strict TDD is active.** Writing the geometry assertion *after* flipping the grid means the
   assertion has only ever been observed green — the exact epistemic position that let `WCTG-14` ship.
2. **It makes the defect an artifact.** Playwright's `test.fail()` inverts the expectation: the run
   fails if the test *passes*. Committing the 880px two-track assertion as `test.fail()` puts the
   defect in CI as an executable, reviewable fact, and slice 2's repair is a one-line annotation
   removal in the same file as the one-word grid change.

The harness has **zero product dependency** — it runs against `main` as shipped — so this ordering
costs nothing.

---

## 2. Architecture decisions (summary)

| # | Decision | §|
|---|---|---|
| **D-01** | The tier is Tailwind's **stock `md` (768)** as bare utilities. No `layout.ts` entry, no `--breakpoint-*` override, no constants module. Defined executably in `playwright.config.ts`, in prose in `EtiquetaResponsiva.tsx` | 1.1 |
| **D-02** | `ConfiguracionLayout` → `md:grid-cols-[200px_1fr]`. 880 gets two tracks; 360 gets one. `WCTG-14` (and `WCFG-11` scenario 1) repaired | 1.1 |
| **D-03** | `EtiquetaResponsiva` — typed `{ movil, tablet?, escritorio }`, two or three literal-class spans, pure, unit-testable | 1.2 |
| **D-04** | Hard rule: responsive-text **controls** carry `aria-label = escritorio`. Static `<p>`s do not (SC 2.5.3 does not reach them); their tests query the variant string | 1.2 |
| **D-05** | Back control is an explicit `<Link to>`, never `history.back()`. Accessible name names the destination; `Volver a Categorías` reused verbatim from shipped code | 1.3 |
| **D-06** | One `BotonVolver`; `CLASE_BOTON_ICONO` moves to `configuracion/estilos.ts` and is reused, never redefined | 1.3 |
| **D-07** | The `Configuración` h1 becomes `max-md:sr-only` — invisible per CA-03, still the page's h1, shipped tests unchanged. The frames' "section title" is the panel's existing `<h2>` | 1.3 |
| **D-08** | **CSS-only for all five criteria.** Zero `matchMedia`. The unit suite proves mechanism, Playwright proves acceptance | 1.4 |
| **D-09** | Variants may duplicate **text**, never **controls**. Exactly one instance of each interactive control at every width | 1.4 |
| **D-10** | Footer DOM reordered to `[Guardar, Cancelar]`, `Eliminar`; desktop restored via `md:flex-row-reverse`. Divergence lands on the desktop row, not the mobile stack | 1.5 |
| **D-11** | Playwright: Chromium, 3 viewport projects, `page.route` stubs, `vite preview` of the production build, its own CI job, its own tsconfig project | 1.6 |
| **D-12** | Harness lands **before** the tier; the `WCTG-14` assertion is committed as `test.fail()` | 1.6 |

---

## 3. Module map

**CORRECTION to the proposal's Affected Areas**: `index.css` is **not** modified (D-01); a
`tsconfig.e2e.json`, a `vitest.config.ts` exclude and an `estilos.ts` move are **added** to the list.

| File | Action | Detail |
|---|---|---|
| `src/components/configuracion/ConfiguracionLayout.tsx` (+ test) | **Modify** | `lg:` → `md:` grid (D-02) · h1 `max-md:sr-only` (D-07) · `BotonVolver` `md:hidden` |
| `src/components/configuracion/ConfiguracionTabs.tsx` (+ test) | **Modify** | `flex flex-col` → `flex flex-row md:flex-col`; `TAB_BASE` gains `flex-1 text-center md:flex-none md:text-left` (CA-01) |
| `src/components/configuracion/EtiquetaResponsiva.tsx` (+ test) | **New** | D-03 — the three literal-class bands |
| `src/components/configuracion/BotonVolver.tsx` (+ test) | **New** | D-05/D-06 — `<Link>` + `ArrowLeft` + narrow `to` union |
| `src/components/configuracion/estilos.ts` (+ test) | **New (moved)** | `CLASE_BOTON_ICONO` relocated from `categorias/estilos.ts`; the `size-6` test moves with it |
| `src/components/configuracion/categorias/estilos.ts` | **Delete** | Contents moved one level up (D-06) |
| `src/components/configuracion/categorias/CategoriasPanel.tsx` (+ test) | **Modify** | Header `flex-col md:flex-row` + `w-full md:w-auto` button (CA-01) · subtitle `hidden md:block` (CA-05) · button label and footer note via `EtiquetaResponsiva` (CA-02/CA-05) |
| `src/components/configuracion/categorias/CategoriaFila.tsx` (+ test) | **Modify** | Delete button `cn(CLASE_BOTON_ICONO, 'hidden md:inline-flex', …)` (CA-02, D-09's mechanical note) · import path of the constant |
| `src/components/configuracion/categorias/EditarCategoria.tsx` (+ test) | **Modify** | Breadcrumb `hidden md:block` + `BotonVolver md:hidden` (CA-03) · footer reorder + `md:flex-row-reverse` (CA-04, D-10) |
| `src/components/configuracion/categorias/PatronesSection.tsx` (+ test) | **Modify** | Three labels via `EtiquetaResponsiva`; h2 gains `aria-label` (CA-05, D-04) |
| `src/components/configuracion/categorias/PatronFila.tsx` | **Modify (import only)** | `estilos.ts` path. Its mousedown/blur logic is **untouched** |
| `apps/web/playwright.config.ts` | **New** | D-11 |
| `apps/web/e2e/*.e2e.ts` + `e2e/fixtures/` | **New** | §4 |
| `apps/web/tsconfig.e2e.json` · `apps/web/tsconfig.json` | **New / Modify** | The third project reference (D-11 detail 2) |
| `apps/web/vitest.config.ts` | **Modify** | `exclude: [...configDefaults.exclude, 'e2e/**']` (D-11 detail 1) |
| `apps/web/package.json` | **Modify** | `@playwright/test` devDependency · `test:e2e`, `test:e2e:ui` scripts |
| `.github/workflows/ci.yml` | **Modify** | New `web-e2e` job + `ci-success` `needs` |
| `src/components/configuracion/perfil/**` | **Unchanged** | D-5 of the proposal: M1 is a verification scenario. A diff here means the claim was false |
| `src/components/app-shell/**`, `src/index.css`, `src/api/**` | **Unchanged** | D-01, D-08 |
| `apps/api/**`, `apps/mobile/**` | **Unchanged** | Zero files. Re-verified as the last task of every slice |

---

## 4. What Playwright asserts, per criterion

Assertions are on **rendered geometry and visibility**, never on class names. Structural, not
pixel-literal: M2's frame is 432px wide with 36px gutters (content 360), while the suite runs a 360px
*viewport* whose content band is 328 after `px-4` — so "full width" is asserted as
*element width ≈ its container's content width*, never as `=== 360`.

| id | Viewport(s) | Assertion |
|---|---|---|
| `E-01` | 360 | List: the two tab links share a `y` and differ in `x` (one row); the nav's width ≈ the content band; `Nueva categoría`'s width ≈ the content band and its `y` > the tabs' `y` — **CA-01** |
| `E-02` | 880 | `getComputedStyle(grid).gridTemplateColumns` resolves to **two** tracks with the first `200px`; at 360 it resolves to **one** — **`WCTG-14` repaired** (committed as `test.fail()` in the harness slice, D-12) |
| `E-03` | 360 / 880 / 1280 | In a category row, `Editar categoría {n}` is visible at all three; `Eliminar categoría {n}` `toBeHidden()` at 360 and visible at 880/1280 — **CA-02** |
| `E-04` | 360 | The list's mobile note `Toca una categoría para editarla o eliminarla.` is visible; the other two variants are hidden — **CA-02/CA-05** |
| `E-05` | 360 / 1280 | List: `Volver al inicio` visible at 360, hidden at 1280; the `Configuración` h1's `boundingBox().height <= 1` at 360 and > 1 at 1280 — **CA-03**, D-07, D-11 detail 3 |
| `E-06` | 360 / 1280 | Edit: `nav[aria-label="Ruta de navegación"]` `toBeHidden()` at 360, visible at 1280; `Volver a Categorías` inversely — **CA-03** |
| `E-07` | 360 / 880 | Edit: `Nombre` and `Bucket` have different `y` and equal width at 360; equal `y` at 880 — **CA-04** + `WCTG-13`(b) + `WCTG-14` scenario 2 |
| `E-08` | 360 / 1280 | Edit footer: at 360 `Guardar`.y < `Cancelar`.y and `Guardar`'s width ≈ the content band; at 1280 they share a `y` with `Cancelar`.x < `Guardar`.x — **CA-04**, D-10 |
| `E-09` | 360 / 880 / 1280 | For each of the six responsive strings in §1.2's table, the band's expected variant is visible and the others `toBeHidden()` — **CA-05** (+ the CA-02 note and the CA-05 subtitle omission) |
| `E-10` | 360 / 880 / 1280 | Both screens: `documentElement.scrollWidth <= clientWidth` — **`WCTG-13`(a), archive debt 1** |
| `E-11` | 360 / 880 / 1280 | Every **icon-only control and standalone button/link** inside `main` has a bounding box ≥ 24×24 — **`WCTG-13`(c), archive debt 1** |
| `E-12` | 360 | `/configuracion` (Perfil): `E-01`, `E-05`, `E-10`, `E-11` all hold with **zero** `perfil/**` diff — **M1 as verification** (proposal D-5) |

**`E-11` must encode SC 2.5.8's *Inline* exception, or it ships a false red.** The success criterion
exempts targets "in a sentence or whose size is otherwise constrained by the line-height of
non-target text". `EditarCategoria`'s breadcrumb links and the `Volver a Categorías` text links in the
error states are inline text at `text-sm` — roughly 20px tall — and are **exempt**. A naive
`a, button, input, select` sweep would flag them and invite someone to inflate a breadcrumb to satisfy
a criterion that never applied to it. The selector is scoped to icon-only controls and standalone
buttons/links; the exemption and its reason belong in a comment in the spec file.

`E-02` + `E-07` + `E-10` + `E-11` are exactly US-043's still-open `WCTG-13`/`WCTG-14` manual pass.
**The harness pays twice**: it is this change's acceptance layer *and* the closure of archive-report
debt 1.

---

## 5. Testing strategy

Strict TDD is active. Red → green → refactor per unit.

### What Vitest/jsdom CAN prove (mechanism, not acceptance — D-08)

| Target | Assertions |
|---|---|
| `EtiquetaResponsiva` (pure) | a 3-band input emits three spans with `md:hidden` / `hidden md:inline lg:hidden` / `hidden lg:inline` and the right strings; a 2-band input emits two |
| `estilos.ts` (pure) | `CLASE_BOTON_ICONO` still contains `size-6` (moved test) |
| `BotonVolver` (RTL) | renders a `link` with the given accessible name and `href`; carries `CLASE_BOTON_ICONO` and the focus-ring classes |
| `ConfiguracionLayout` (RTL) | the h1 is still reachable as `heading level 1 "Configuración"`; the grid element carries `md:grid-cols-[200px_1fr]`; the back link renders |
| `EditarCategoria` (RTL) | footer DOM order is `Guardar`, `Cancelar`, `Eliminar categoría`; the breadcrumb and the back link both render; every shipped behavioural test still passes **unchanged** |
| `CategoriaFila` (RTL) | the delete button's className contains `hidden md:inline-flex` and **not** a bare `inline-flex` (D-09's `cn` trap) |
| Every touched component | its shipped tests still pass — the class-literal ones update from `lg` to `md`, the behavioural ones must not need editing at all. **A behavioural test that needs editing is a signal this design got something wrong**, not a chore |

### What only Playwright can prove

Every user-visible claim in CA-01…CA-05, plus `WCTG-13`/`WCTG-14`. §4.

### Gates

```
pnpm web typecheck   # tsr generate && tsc -b — now covers e2e/ via tsconfig.e2e.json
pnpm web test        # vitest run — excludes e2e/**
pnpm web lint        # eslint .
pnpm web test:e2e    # playwright test — the acceptance layer
```

---

## 6. Open questions

| id | Question | Owner | Blocking? |
|---|---|---|---|
| **Q-01** | Does the `Nueva categoría` mapping really run long → short → long across the three bands? `D-03`'s helper renders either shape without redesign, but the copy table needs the answer | `sdd-spec` (proposal §2, open question 2) | No — helper is agnostic |
| **Q-02** | Does the mobile back control from the **list** go to `/` (this design's default) or somewhere else? CA-03 fixes the control, never the destination | `sdd-spec` (proposal open question 3) | No — one literal changes |
| **Q-03** | Does the mobile header need a layout-owned section title above the tabs, or is the panel's existing `<h2>` the "section title" (D-07's reading)? | `sdd-spec` (proposal open question 4) | **Yes if the answer is "above the tabs"** — that needs route `staticData`, a rejected alternative in D-07 |
| **Q-04** | Does `Categorías y patrones` shorten to `Categorías` at mobile? The frames draw `Categorías`; CA-05 does not list it. **This design does not shorten it** (no invention) | `sdd-spec` | No |
| **Q-05** | Does the always-rendered `sin patrones` note (US-043 decision 9) keep its "static helper text" semantic at mobile, or does the shortened string change its role? This design keeps the semantic and only swaps the string | `sdd-spec` (proposal open question 5) | No |
| **Q-06** | `WCFG-11` scenario 1 is false for the same reason `WCTG-14` is, and its *"measurements match T1"* clause was never literally true (113px drawn, 200px shipped). Does the spec delta reword it to the kind-level claim? | `sdd-spec` (§1.1 finding) | No — D-02 repairs the code either way |

---

## 7. Design element → requirement mapping (hand-off to `sdd-spec`)

| Design element | Suggested requirement |
|---|---|
| D-01/D-02 — the `md` tier and the two-track grid at 880 | **MODIFY `WCTG-14`** (intent, not the `layout.ts` clause) · **MODIFY `WCFG-11`** (both scenarios, Q-06) |
| D-02 mobile branch + horizontal tabs + full-width `Nueva categoría` | `WCTM-01` (CA-01) |
| D-08/D-09 + `hidden md:inline-flex` + the mobile note | `WCTM-02` (CA-02) |
| D-05/D-06/D-07 — back control, destinations, accessible names, the `sr-only` h1 | `WCTM-03` (CA-03) |
| D-10 — stacked fields (already shipped) + the inverted footer, **without** a delete-separation clause | `WCTM-04` (CA-04) |
| D-03/D-04 — the six-string band table and the stable-accessible-name rule | `WCTM-05` (CA-05) |
| D-11/D-12 + §4's `E-10`/`E-11` | **MODIFY `WCTG-13`** — its three guarantees survive as floors; its "desktop structure otherwise preserved" clause is superseded, and its manual pass becomes executable |
| §4 `E-12` | A verification scenario on `WCFG-11`/`WCTG-13`, **not** a new Perfil requirement (proposal D-5) |

---

## 8. Slice sketch (hand-off to `sdd-tasks`)

`sdd-tasks` owns the binding forecast and the final slicing. This is the **ordering the dependencies
force**, and it **CORRECTS the proposal's Approach** (D-12).

| PR | Content | Must be here because |
|---|---|---|
| **#1 Harness** | `@playwright/test`, `playwright.config.ts`, `tsconfig.e2e.json`, the Vitest exclude, the CI job, `page.route` fixtures, and the specs that **should already be green on `main`** (`E-07`@880, `E-10`, `E-11`) **plus `E-02` as `test.fail()`** | Zero product dependency; runs against shipped code. Lands the defect in CI as an executable fact before anything is repaired (D-12). **If any of `E-07`/`E-10`/`E-11` comes back red on `main`, that is a genuine pre-existing `WCTG-13` defect the harness just found — report it, do not adjust the assertion to fit.** That is what archive debt 1 was for |
| **#2 Tier + shared chrome** | `md:` grid (D-02) + `E-02`'s `test.fail()` removed · `ConfiguracionTabs` horizontal · h1 `max-md:sr-only` · `BotonVolver` · **the `estilos.ts` move, including the import-line updates in `CategoriaFila` and `PatronFila`** · `E-01`, `E-05`, `E-12` | Slices #3/#4 all sit on `md` existing. The move must land with `BotonVolver`, its first shared-level importer — a move split across two PRs is a broken build in between. `E-12` proves M1 here, where the shared chrome actually changes |
| **#3 Labels + list surface** | `EtiquetaResponsiva` + its six call sites · `CategoriasPanel` header/subtitle/note · `CategoriaFila`'s `hidden md:inline-flex` (**className only — its import moved in #2**) · `E-03`, `E-04`, `E-09` | The helper and its consumers must land together — a helper with no call site is unreviewable, and `E-09` needs all six strings |
| **#4 Edit surface** | Breadcrumb ↔ `BotonVolver` swap · the footer reorder (D-10) · `E-06`, `E-08` | The riskiest slice: it reorders a shipped footer whose every `disabled` condition is judgment-day scar tissue. Reviewed unmixed |

**Prohibitions.**

1. **Do not reorder the footer in a PR that does not also carry `E-08`.** D-10 deliberately moves a
   DOM/visual divergence; shipping the move without the assertion that pins the resulting order is
   the `WCTG-14` failure repeated inside the change that exists to repair it.
2. **Do not "fix" `EditarCategoria`'s `sm:grid-cols-[1fr_220px]` to `md:`.** It is correct
   (§1.5) and changing it breaks `WCTG-14` scenario 2 at 880.
3. **Do not touch `perfil/**`.** M1 is a verification scenario (proposal D-5); a diff there means the
   "for free" claim was false and the design needs revisiting, not patching.
4. **Zero files under `apps/api/**` and `apps/mobile/**`**, re-verified as the last task of every
   slice.

---

## 9. Risks this design does not remove

| Risk | Status after this design |
|---|---|
| **The unit suite cannot assert CA-01…CA-05** | **Not removed — chosen** (D-08). Mitigated by making the harness slice #1 and by refusing to call mechanism coverage acceptance coverage. If PR #1 is descoped, the change ships with *no* acceptance layer at all |
| **Desktop tab order no longer matches the footer's visual order** | **Introduced deliberately** (D-10). The alternatives were a vertical reversal on mobile — which SC 1.4.10 puts in front of desktop keyboard users at 400% zoom — or duplicated controls, which breaks the shipped suite. Named, not hidden |
| **`test.fail()` is a one-shot device** | If PR #2 slips, `E-02` sits in `main` as a documented red. That is the intent, but it must not become permanent — PRs #1 and #2 belong to the same chain |
| **Playwright asserts one browser** | Chromium only (D-11). A WebKit-specific flex/grid difference at 360 would ship unseen. Accepted: no criterion is browser-specific, and `apps/web` has no cross-browser gate today either |
| **Real touch-device event ordering, real screen readers, physical ergonomics** | Unchanged by this design. `PatronFila`'s mousedown/blur logic is untouched and its pending touch check stays a manual pass (ADR-018's stated position) |
| **The frames' vertical ordering (title above tabs) is not reproduced** | Deliberate (D-07), pending **Q-03**. If spec confirms the frames, `staticData` re-enters and slice #2 grows |
| **`aria-label` makes the accessible name diverge from the visible text at mobile** | Accepted, and inherited: the shipped `Nueva categoría` button already does this (US-043 Q8c). SC 2.5.3 holds on all three interactive cases (§1.2); the divergence is the price of a name that does not change under the user as they rotate their phone |
| **A future contributor adds a `matchMedia` hook** | Nothing enforces D-08 mechanically. The rule lives in this document and in `EtiquetaResponsiva`'s docblock — a lint rule for it would be a rule with one subject (`yagni`) |
