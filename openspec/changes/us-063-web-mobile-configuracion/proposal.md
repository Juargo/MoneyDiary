# Proposal: US-063 — Web Configuración, mobile viewport variants (M2/M3)

- **Change**: `us-063-web-mobile-configuracion`
- **Issue**: [#332](https://github.com/Juargo/MoneyDiary/issues/332) · Wireframes: Whimsical `LYiabT1DD6UvDMnFXnBkn9`, frames `M2`, `M3` (implementation), `M1` (verification only)
- **Status**: Proposed (2026-08-14)
- **Builds on** (shipped, `main` `dade5b7`): `openspec/specs/web-app/spec.md` `WCTG-01..14` (US-043), `WCFG-01..13` (US-042)
- **Ground truth**: `openspec/changes/archive/2026-08-14-us-043-web-configuracion-categorias/wireframes-extracted.md` §3 (per-element pixel table) and §4
- **Requires new ADR**: **No.** ADR-024 (presentation lives in the client), ADR-018 (a11y by layers, WCAG 2.2 AA, `@axe-core/playwright` already named), ADR-008/016 (stack). Nothing deviates.
- **API/mobile impact**: **zero.** `apps/web` only.

---

## 0. Source of truth for the acceptance criteria — resolved

The propose phase ran without shell access and could not read `gh issue view 332`, so it
**reconstructed** CA-01..CA-05 from `wireframes-extracted.md` §3 and the binding decisions, and
flagged that honestly rather than presenting them as verbatim.

**The orchestrator has since reconciled them against issue #332 (2026-08-14).** §2 below now carries
the **verbatim** criteria. Four divergences were found and corrected — recorded here because they are
exactly the derived-layer invention this project has been burned by twice:

| # | Reconstructed said | #332 actually says |
|---|---|---|
| 1 | CA-03 scoped the back-icon header to the **edit screen** | CA-03 covers **the mobile header**, frames **M2 *and* M3** — the list too |
| 2 | CA-04 required `Guardar`/`Cancelar` **separated from** the red `Eliminar categoría` | #332 requires only the stack + the inverted footer order. The separation is **not** an acceptance criterion |
| 3 | CA-01 absorbed the `Tu catálogo propio…` subtitle omission | It belongs to **CA-05** |
| 4 | CA-05 absorbed CA-02's `Toca una categoría…` footer sentence | It belongs to **CA-02** |

The frame-and-component traceability the propose phase added is kept — it is genuinely useful and is
*derived from*, not a substitute for, the criteria.

---

## Intent

**Mobile restructures; it does not resize.** That single sentence is the whole difference between this
change and the tablet work US-043 absorbed. T2/T3 are frame 2/3 at a smaller width — tab column
`113×88` in both, content column 760 → 534, everything else fluid (`wireframes-extracted.md` §1).
M2/M3 change *layout and behaviour*: horizontal tabs, one row icon instead of two, back icon instead
of a breadcrumb, stacked identity fields, an inverted footer, and six shortened strings (§3).

US-043 shipped **a 360px defensive floor, not a redesign** — deliberately, recorded as decision 8 and
frozen into `WCTG-13`. A phone user today gets the desktop structure squeezed into 360px: a vertical
tab list stacked above the panel, two icons per row, and a breadcrumb. Nothing is broken; nothing is
designed. This change closes that.

## Why now

1. **The page is already reachable at 360px** and has been since US-042. Shipping nothing for mobile
   does not mean mobile users do not arrive — it means they arrive at a desktop layout.
2. **`WCTG-13` names US-063 as its owner** in the live spec (`openspec/specs/web-app/spec.md:484`).
   The debt is written down with this change's number on it.
3. **`WCTG-14` is false as shipped** (§1). The repair is the same file and the same decision this
   change has to touch anyway. Fixing it here costs a line; leaving it costs a spec that lies.

---

## 1. The defect this change repairs — `WCTG-14` is false as shipped

`WCTG-14` (merged into the live spec 2026-08-14) asserts that at T2/T3's measured width *"the
tab/sidebar column is fixed-width, the content column is fluid"*. **That is false**, and the
arithmetic is three lines:

| Fact | Evidence |
|---|---|
| No `--breakpoint-*` override exists → Tailwind 4 stock tiers apply (`sm`=640, `md`=768, `lg`=1024) | `apps/web/src/index.css` |
| The Configuración grid is `grid grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]` → two columns only at **≥1024px** | `ConfiguracionLayout.tsx:34` |
| T2/T3's measured frame width is **880px** | `wireframes-extracted.md` frame table |

880 < 1024. At tablet width the grid falls back to `grid-cols-1` — **the same stacked layout a phone
gets.** The requirement was **self-contradictory at spec-freeze**: it simultaneously demanded reuse of
the existing `lg` grid *and* a fixed tab column at 880px. Those cannot both hold.

Two things make this worth stating plainly rather than filing as cleanup:

- **Nobody did the arithmetic.** Not the proposal, the spec, the design, the tasks, two independent
  judgment-day judges, `sdd-verify`, nor the orchestrator — who recorded it as merely "partially
  verified" (archive-report, debt 1).
- **It survived because jsdom performs no layout.** `ConfiguracionLayout.test.tsx` asserts that the
  literal string `lg:grid-cols-[200px_1fr]` is present in a `className`. It can never assert that the
  class is *in effect at a given width*. The test passes and proves nothing about geometry.

`WCTG-14`'s **second** scenario (Nombre/Bucket side by side at 880px) **is** satisfied — that grid
correctly uses `sm`(640): `EditarCategoria.tsx:406`, `grid-cols-1 sm:grid-cols-[1fr_220px]`. So the
codebase already runs **two different, undocumented "is this narrow" boundaries on the same screen**.
The new `md` tier makes that split deliberate and named instead of accidental.

---

## Binding decisions

Settled with the maintainer. Recorded as decisions, not options — `sdd-design` and `sdd-tasks` inherit
them and do not re-litigate.

| # | Decision | Rationale |
|---|---|---|
| **D-1** | **A new breakpoint tier is introduced: `md` (768px) as the mobile/tablet split, scoped to the Configuración surfaces.** `lg` (1024px) stays exactly as-is for `AppShell`'s Sidebar↔BottomTabs switch. Resulting model: **mobile <768 · tablet 768–1023 · desktop ≥1024**. | One boundary cannot serve two questions. 880 (tablet) and 432 (mobile) both sit below `lg`, so `lg` cannot distinguish them — which is precisely how §1 happened. `md`=768 cleanly separates them and is consistent with the already-correct `sm`=640 identity-field boundary. The shell's Sidebar↔BottomTabs switch is a **different concern** with no evidence it needs to move; touching it would put a shipped global surface in this change's blast radius for nothing |
| **D-2** | **US-063 repairs `WCTG-14` in scope.** The spec delta MODIFIES it; it does not silently contradict it. | Same file, same decision, same line. A change that introduces the tier and leaves a live requirement asserting the opposite ships a second lie on top of the first |
| **D-3** | **Verification is a real deliverable: Playwright, real viewports (360 / 880 / 1280), asserting rendered geometry — its own slice, with its own review.** | CA-01..CA-05 are claims about *layout*. jsdom cannot evaluate a single one of them (§1). This is also the tool that finally settles US-043's still-pending `WCTG-13`/`WCTG-14` manual pass (archive-report debt 1), which ADR-018 already anticipated by naming `@axe-core/playwright`. Bolting it onto a UI slice guarantees it gets reviewed as an afterthought — it gets its own PR |
| **D-4** | **On mobile there is exactly ONE path to delete a category: the edit screen.** No swipe, no long-press. The list footer note tells the user so. | `M2` draws a single row icon at x=722 where frames 2/T2 draw two (x=1670/1698), and rewrites the footer sentence to `Toca una categoria para editarla o eliminarla.` — an instruction to the user, not a behaviour note (§3 row 3, §2 C-3). A swipe/long-press affordance is invented mechanism the frames do not draw, and it is undiscoverable without a hint the frames also do not draw |
| **D-5** | **`M1` (Perfil mobile) is in scope as a verification scenario, not as implementation work.** Honest scope: **2 frames of new component work + 1 frame of verification.** | `PerfilPanel`/`PerfilForm` are already pure `flex-col` with no side-by-side fields. Every chrome difference M1 draws (horizontal tabs, no `Configuración` h1) lives in the **shared** `ConfiguracionLayout`/`ConfiguracionTabs`, which this change fixes once for M2. Perfil renders inside that same layout, so it comes along for free — but "for free" is a claim, and claims get asserted |

---

## 2. Acceptance criteria — verbatim from issue #332

**These five are the contract.** The frame and component columns are traceability added by this
proposal; the requirement text is #332's, reconciled 2026-08-14 (see §0).

| CA | Requirement (verbatim, #332) | Frame evidence (§3 row) | Owning component(s) |
|---|---|---|---|
| **CA-01** | Dado un viewport mobile, cuando renderiza la lista, entonces las tabs `Perfil`/`Categorías` son **horizontales a todo el ancho** (no la columna vertical de escritorio) y `Nueva categoría` es un botón **full-width debajo de las tabs** (frame M2) | rows 1, 6 | `ConfiguracionTabs`, `ConfiguracionLayout`, `CategoriasPanel` |
| **CA-02** | Dada una fila de categoría en mobile, cuando renderiza, entonces muestra **un solo icono de acción** (editar) en lugar de dos, y la nota `Toca una categoría para editarla o eliminarla.` explica que eliminar vive en la pantalla de edición (frame M2) | row 3 | `CategoriaFila`, `CategoriasPanel` |
| **CA-03** | Dado el encabezado en mobile, cuando renderiza, entonces usa **icono de volver + título de sección**, sin el `<h1>Configuración</h1>` ni el breadcrumb de 3 niveles (**frames M2/M3**) | rows 2, 4, 5 | `ConfiguracionLayout`, `EditarCategoria` |
| **CA-04** | Dada la pantalla de edición en mobile, cuando renderiza, entonces `Nombre` y `Bucket` **apilan**, y el footer invierte el orden: `Guardar` full-width con `Cancelar` como botón de texto debajo (frame M3) | rows 7, 10 | `EditarCategoria` |
| **CA-05** | Dados los labels largos, cuando el viewport es mobile, entonces se acortan según los frames: `Patrones de auto-categorización` → `Patrones`, `Agregar patrón` → `Agregar`, `Sin patrones, la categoría solo se puede asignar manualmente.` → `Sin patrones: solo asignación manual.`, y el subtítulo `Tu catálogo propio…` se omite. En tablet, `Nueva categoría` → `Nueva` (frame T2) | rows 8, 9, §3 closing line | `PatronesSection`, `CategoriasPanel` |

**Two notes for `sdd-spec`, from the reconciliation:**

- **CA-03 covers both screens.** It says "el encabezado en mobile … (frames M2/M3)" — the list header
  (where the `Configuración` h1 lives, owned by `ConfiguracionLayout`) *and* the edit header (where
  the 3-level breadcrumb lives, owned by `EditarCategoria`). Do not narrow it to the edit screen.
- **CA-04 does not require separating `Guardar`/`Cancelar` from `Eliminar categoría`.** It requires
  only the stack and the inverted footer order. Whether the red delete button also moves at mobile is
  **not** an acceptance criterion — if the M3 frame shows it moving, that is a design decision to
  state explicitly, not a criterion to infer.

**Frames vs. shipped code — one contradiction to resolve in spec, not design.** §3's closing line
records the `Nueva categoría` → `Nueva` shortening as a **tablet** observation (T2, 111px). The
shipped swap is `lg`-bound (`CategoriasPanel.tsx:209-210`), so tablet already shows `Nueva` — correct
today. But M2 gives that button the **full 360px width**, where the long label fits, and §3 never
records a mobile shortening for it. If spec confirms the frames, the mapping is **non-monotonic**
(long → short → long as width decreases), which no single boolean can express. Spec must state which
label each of the three tiers renders.

---

## Scope

### In scope

| | Deliverable |
|---|---|
| **A** | **The `md` tier** (D-1) — one named mobile/tablet boundary for the Configuración surfaces, plus the `WCTG-14` repair (D-2): `ConfiguracionLayout`'s two-column grid activates at **`md`**, so 880px gets the fixed tab column the spec always claimed |
| **B** | **Shared chrome restructure** (CA-01, CA-03 chrome half) — `ConfiguracionTabs` horizontal below `md`, `ConfiguracionLayout` heading behaviour. Serves M1, M2 and M3 at once (D-5) |
| **C** | **CA-01 list surface** — full-width `Nueva categoría` placement, subtitle suppression (`CategoriasPanel`) |
| **D** | **CA-02** — single row action below `md` + the mobile footer sentence (`CategoriaFila`, `CategoriasPanel`) |
| **E** | **CA-03** — the back control on the edit screen: icon, accessible name, target size, and a stated destination |
| **F** | **CA-04** — stacked identity fields + inverted footer (`EditarCategoria`) |
| **G** | **CA-05** — the label mechanism and its ~6 swaps (`PatronesSection`, `CategoriasPanel`) |
| **H** | **Playwright verification** (D-3) — real viewports 360 / 880 / 1280, asserting rendered geometry for CA-01..CA-05, **plus M1 as a verification scenario** (D-5), **plus** US-043's pending `WCTG-13`/`WCTG-14` checks |

### Out of scope

| Not doing | Why / owner |
|---|---|
| The **Expo app** (`apps/mobile`) | **US-044 (#278).** M1/M2/M3 are mobile-viewport frames of `apps/web` — the bottom bar they draw is the shipped web `AppShell`, not React Native (§4). Zero files under `apps/mobile/**` |
| Any change to **`AppShell`'s `lg` Sidebar↔BottomTabs boundary** | D-1. Different concern, no evidence it needs to move, shipped global surface |
| Any `apps/api` change | Frontend-only against deployed contracts. Zero files under `apps/api/**` |
| Retroactive reclassification | Issue **#331 (US-062)**, unchanged by this proposal |
| The remaining US-043 debts — production functional smoke, `BucketDetailList` focus loss on catalog retry | Archive-report debts 2 and 3. Neither is a viewport concern. **Debt 1 (the manual 360/880 pass) IS absorbed**, by D-3 |
| A global responsive-label abstraction beyond Configuración | Only Configuración has the 3-way problem today (`yagni`) |

---

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-app`: **MODIFY `WCTG-14`** (the false requirement — the tab column becomes fixed-width at
  `md`=768, so 880px satisfies it; the "no new entry in `layout.ts`" clause is superseded by D-1 and
  must be rewritten, not quietly dropped) · **MODIFY `WCTG-13`** (mobile stops being a defensive floor
  and becomes the M2/M3 restructure; its three guarantees — no overflow, stacked fields, ≥24×24 targets
  — survive as floors, not as the ceiling) · **MODIFY `WCFG-11`** (its scenario *"Below `lg` the
  columns stack"* becomes `md`) · **ADD** the CA-01..CA-05 mobile requirements (suggested prefix
  `WCTM-01..`; `sdd-spec` owns the final IDs).

---

## Approach

Four work units. `sdd-tasks` owns the final slicing; this is the shape the dependencies force.

1. **Tier + shared chrome + `WCTG-14` repair** (A + B). Touches `ConfiguracionLayout`,
   `ConfiguracionTabs` and their tests. Lands first because C–G all sit on top of it, and it is the
   slice that repairs the defect.
2. **Playwright harness + geometry suite** (H). Independent of 3 and 4; must land **before or with**
   them so the visual claims are asserted by something. New tooling: Playwright is **not installed**
   anywhere in the monorepo today (only a transitive entry in `pnpm-lock.yaml`) — config, scripts, CI
   wiring and a fixture strategy are all new surface.
3. **List surface** (C + D) — `CategoriasPanel`, `CategoriaFila`.
4. **Edit surface** (E + F + G) — `EditarCategoria`, `PatronesSection`, and the label mechanism.

**Constraints that bind design (mechanism is `sdd-design`'s to choose, but these are not negotiable):**

- The new tier must **not** be expressed by coupling to `apps/web/src/components/app-shell/layout.ts`,
  whose constants are the shell's `lg` Sidebar/BottomTabs pair (`lg:pl-64`, `pb-16 lg:pb-0`). Different
  concern, D-1.
- Tailwind 4 requires every utility to appear as a **literal string** in a scanned source file — no
  template-built class names (`layout.ts:10-13`). Any label/class helper must respect that.
- `CLASE_BOTON_ICONO` is `size-6` (24 CSS px) and already satisfies SC 2.5.8. It is reused by
  `CategoriaFila` **and** `PatronFila` — do not redefine it per surface.
- `PatronFila`'s mousedown/blur pointer-intent delete logic is **untouched** by this change; only
  `PatronesSection`'s labels move. Its pending touch-device check stays owned by the manual/Playwright
  pass, not by this restructure.

---

## Affected Areas

**`apps/web` only. Zero files under `apps/api/**` and `apps/mobile/**`** — carried forward as a
non-negotiable; it held across all nine of US-043's slices and must be re-verified as the last task of
every slice here.

| Area | Impact | What changes |
|---|---|---|
| `apps/web/src/components/configuracion/ConfiguracionLayout.tsx` | Modified | Grid boundary `lg` → `md` (D-2); heading behaviour below `md` (CA-01) |
| `apps/web/src/components/configuracion/ConfiguracionTabs.tsx` | Modified | `flex flex-col` → horizontal, full-width below `md` (CA-01) |
| `apps/web/src/components/configuracion/categorias/CategoriasPanel.tsx` | Modified | Full-width `Nueva categoría`, subtitle, mobile footer sentence, label swaps (CA-01/02/05) |
| `apps/web/src/components/configuracion/categorias/CategoriaFila.tsx` | Modified | Single action below `md` (CA-02) |
| `apps/web/src/components/configuracion/categorias/EditarCategoria.tsx` | Modified | Back control, stacked fields, inverted footer (CA-03/04) |
| `apps/web/src/components/configuracion/categorias/PatronesSection.tsx` | Modified | Shortened labels (CA-05) |
| Responsive-label helper (path TBD by design) | New | The 3-way label mechanism (CA-05) |
| `apps/web/src/index.css` | Possibly modified | Only if design names the tier via `--breakpoint-*`; stock `md`=768 may suffice |
| `apps/web/` Playwright config, specs, scripts, CI job | New | D-3 |
| `apps/web/src/components/configuracion/**/*.test.tsx` | Modified | Existing className-literal assertions referencing `lg` |
| `openspec/specs/web-app/spec.md` | Modified | Via the change's delta (archive step) |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **CA-01..CA-05 are invisible to the existing Vitest/jsdom suite for their actual visual claims.** This is precisely how `WCTG-14` shipped false: a test asserting `toHaveClass('lg:grid-cols-...')` passes whether or not the class is ever in effect | **Certain** | High | **D-3's Playwright slice is the mitigation.** What it does NOT cover, stated honestly: real touch-device event ordering (`PatronFila`'s mousedown/blur), real screen readers (VoiceOver/TalkBack), physical target ergonomics beyond the 24×24 CSS-px minimum, and any device-specific browser chrome. Those stay manual, ADR-018's stated position |
| **Introducing a tier reverses a frozen decision from the previous change** — `WCTG-14`'s literal *"with NO new entry added to `layout.ts`"* and US-043 decision 8's "no new tier" | Certain | Medium | Design must **explain the reversal in writing** (the arithmetic of §1), and the spec delta must **MODIFY `WCTG-14`**, never silently contradict it (D-2). A spec whose live text disagrees with the shipped code is the exact failure this change exists to repair |
| **CA-03's back icon has no precedent anywhere in `apps/web`** (no `ArrowLeft`/`ChevronLeft`/`router.back` usage exists) | Certain | Medium | New UI surface with its own ADR-018 obligations: accessible name, visible focus ring, ≥24×24 target, and a **stated destination**. Spec must name where "back" goes **from each screen** — from `/configuracion/categorias/:id` the answer is the list; from the list itself the frames show tabs, not a back icon. Do not implement `history.back()` without saying what it does on a cold deep-link |
| **The shipped two-`<span>` label idiom cannot express a 3-way split.** `lg:hidden` / `hidden lg:inline` encodes one boolean; CA-05 needs ~5 mobile swaps at `md` **plus** a tablet one at `lg`, and possibly a non-monotonic mapping (§2) | High | Medium | A small typed helper is likely warranted (three appearances, not a premature abstraction). **Mechanism is `sdd-design`'s**; the binding constraint is Tailwind 4's literal-class-string requirement and that hand-duplicating spans per case does not scale to six swaps across two boundaries |
| **The icon-suppression mechanism is a real fork with testability consequences.** Conditional rendering (one `<Link>`, no delete `<button>` below `md`) is assertable in jsdom; a CSS-only `md:hidden` is not — and a CSS-hidden button still exists in the a11y tree unless removed | High | Medium | Flagged for `sdd-design` as an explicit fork with the tradeoff named. Whichever is chosen, CA-02's guarantee ("exactly one path to delete") must be assertable by **something** — jsdom if conditional, Playwright if CSS |
| **Existing Configuración tests assert `lg` class literals** and will fail on the tier change | High | Low | Expected and healthy — they are the change's own regression surface. Update them in slice 1, not opportunistically later |
| **M1 comes "for free" is a claim, not a fact** | Medium | Low | D-5 makes it a verification scenario at 360px, so the claim is asserted rather than assumed |

---

## Delivery forecast

US-043's calibration: size **production** code, multiply by **≥2.4** for the total (that change ran
83 files, +11 395 / −761 across nine slices), and treat any slice under **250 production lines** with
suspicion.

| Slice | Production estimate | Total estimate (×2.4) |
|---|---|---|
| 1 — tier + shared chrome + `WCTG-14` repair | 120–200 | 290–480 |
| 2 — Playwright harness + geometry suite | 250–400 | 600–950 |
| 3 — list surface (CA-01/02/05 partial) | 200–300 | 480–720 |
| 4 — edit surface (CA-03/04/05) | 250–350 | 600–840 |
| **Total** | **820–1250** | **≈2000–3000** |

- **400-line budget risk: High**
- **Chained PRs recommended: Yes**
- **Decision needed before apply: Yes**

Cached session settings: `delivery_strategy: ask-on-risk` · `chain_strategy: feature-branch-chain`
(PR #1 targets the tracker branch; each later child PR targets the immediately previous PR branch;
only the tracker merges to `main`). Slice 1 is the smallest and may land under 250 production lines —
that is acceptable **only** because it is a boundary change that everything else depends on, not
because the work was thin. `sdd-tasks` owns the binding forecast; this is the proposal's estimate.

---

## Rollback Plan

`apps/web`-only, no schema, no API, no data migration — rollback is a revert.

1. **Per slice**: revert the child PR. Because the chain is `feature-branch-chain`, only the tracker
   reaches `main`, so an un-merged slice never touched production.
2. **After the tracker merges**: `git revert` the tracker merge commit and push to `main`. Vercel
   redeploys `apps/web` from `main`; confirm via `app.moneydiary.cl/version.json`.
3. **Partial rollback of the tier alone** (if `md` proves wrong at some width): reverting slice 1
   restores `lg:grid-cols-[200px_1fr]` and with it the pre-existing `WCTG-14` defect — so a tier
   rollback **must** re-open the defect explicitly rather than let the spec quietly re-lie.
4. **Playwright rollback**: the harness is additive (new config + new specs + a CI job). Removing the
   job unblocks CI without touching product code.

## Dependencies

- **None blocking.** US-043 is shipped (`dade5b7`) and archived; the catalog API is deployed; no
  backend work is required.
- **New tooling**: Playwright + its browsers must be installed in `apps/web` and wired into CI
  (`@axe-core/playwright` is already named by ADR-018 for the a11y layer, but nothing is installed —
  the only current mention is transitive, in `pnpm-lock.yaml`). Expect CI time and cache implications.
- **Input still to reconcile**: the verbatim CA text of issue #332 (§0).

## Success Criteria

- [ ] At **360px**, the Categorías list renders horizontal full-width tabs, a full-width
      `Nueva categoría`, no `Configuración` h1, and **exactly one** action control per row — asserted
      by Playwright, not by className presence.
- [ ] At **360px**, the edit screen renders a back control (with an accessible name and a stated
      destination), stacked `Nombre`/`Bucket`, and a footer with full-width `Guardar` above `Cancelar`
      — asserted by Playwright. **Separation from `Eliminar categoría` is deliberately NOT asserted
      here**: #332's CA-04 does not require it (see §0 divergence 2 and §2's note). If the M3 frame
      shows the delete button moving too, that is a design decision to state explicitly in `design.md`,
      not an acceptance criterion. *(Corrected 2026-08-14 — the orchestrator fixed §2 to verbatim but
      left this criterion carrying the reconstructed wording; caught by the design phase.)*
- [ ] At **360px**, the six CA-05 strings render their mobile forms; at **880px** and **1280px** they
      render the forms their tier specifies (§2's non-monotonic question resolved in the spec).
- [ ] At **880px**, `ConfiguracionLayout` renders **two columns** with a fixed-width tab column and a
      fluid content column — the assertion that `WCTG-14` claimed and that has never once been run.
- [ ] At **360px**, **`M1` (Perfil)** renders correctly inside the same restructured chrome, with no
      Perfil-specific component change (D-5's claim, asserted).
- [ ] US-043's pending `WCTG-13` checks — no horizontal overflow at 360px, every interactive target
      ≥24×24 CSS px — pass in Playwright at all three viewports, closing archive-report debt 1.
- [ ] `pnpm web typecheck` clean · `pnpm web test` green · `pnpm web lint` zero `jsx-a11y` errors on
      the touched files (`WCFG-12`'s scoped `error` tier).
- [ ] **Zero files changed under `apps/api/**` and `apps/mobile/**`** — verified on every slice.
- [ ] The spec delta **MODIFIES** `WCTG-13`, `WCTG-14` and `WCFG-11`; no live requirement is left
      asserting a boundary the code does not implement.

---

## Open questions for `sdd-spec`

1. **CA-01..CA-05 verbatim** against issue #332 (§0). Blocking.
2. **The `Nueva categoría` / `Nueva` mapping across three tiers** (§2). Which label at 432, at 880, at
   1280?
3. **Where "back" navigates from each screen** (CA-03) — and what it does on a cold deep-link with no
   history entry.
4. **Does the `Configuración` h1 disappear below `md`, or is it replaced by the section title?** §3
   row 4 says the frames draw "back icon + section title, no `Configuración` h1" for M3; M2's heading
   treatment must be stated explicitly rather than inferred.
5. **Does the always-rendered `sin patrones` note (US-043 decision 9) keep that semantic at mobile**,
   or does the shortened string change its role? §2 C-2's finding — the note is drawn under populated
   lists in all three edit frames — applies to M3 too.
