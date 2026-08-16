# Design: US-048 — Web annual table redesign, navigable mini-charts (#282)

**Inputs (read, verified against real code):** `proposal.md` (canonical, D-1..D-4 + R-1..R-8 binding),
`sdd/us-048-web-tabla-anual/explore` (engram #738), and the actual sources listed in §9.
**Scope of this document:** the HOW at architectural level — DOM/AX structure, component contracts, visual
language, copy, test strategy, lint scope, impact sweep. No task breakdown (that is `sdd-tasks`).

**Language contract:** this artifact is English. Every user-facing string it specifies is Spanish, properly
accented.

---

## 0. Architecture position (one paragraph)

This change lives entirely in the web presentation layer (`apps/web/src/components`). It adds **zero** domain
logic: no percentage math, no threshold math, no bp arithmetic — the client only *formats*, *labels* and
*apportions the sanctioned ring* (ADR-024, `WG5-11`, R-8). The only "computation" is two string equalities
(`mes.periodo === periodoSeleccionado`, `mes.periodo === periodoActual`) and one deletion of an argument.
The one new module (`MiniSemaforoTag`) is a presentational component with no state and no data access.

---

## 1. Decisions (ADR-style)

Numbered `D-01…D-16`. The proposal's own product decisions are `D-1…D-4` and are **inputs**, not restated here.

### D-01 — `MesCelda` becomes a non-interactive positioned wrapper with two sibling controls

**Decision.** `MesCelda` returns a `<div className="relative h-full">` (no role, no handlers, no visual
styling) containing exactly two children, in this DOM order:

1. the **month control** — the existing `<button>` (data months) or the existing `<div role="button"
   aria-disabled="true">` (`sinIngreso` months), now carrying `h-full w-full`;
2. a `<span className="absolute top-1 right-1">` wrapping the new **`MiniSemaforoTag`** `<a>`.

**Why the frame stays on the month control, not on the wrapper.** The wrapper is *layout only*; every existing
visual class (`rounded-lg border p-3`, the LOCKED `focus-visible:outline-slate-800` ring, `border-dashed
border-border bg-muted opacity-60` on the disabled branch) stays byte-identical on the month control. Moving
the frame to the wrapper would have rewritten every one of those classes and invalidated the FIX-2 WCAG
1.4.11 test for no benefit.

**Why the tag wrapper (not the component) owns the positioning.** `MiniSemaforoTag` must not know it lives in
a corner (SRP/OCP — it would gain a layout prop it can only ever receive one value of, YAGNI rule 3). The
call site positions it, exactly as `ResumenScreen` already wraps `SemaforoTag` in a plain `<span
data-testid="semaforo-global">`.

**Rejected:** (a) `<ul>/<li>` grid semantics — a real AX improvement but it changes the grid's role, is not
required by any CA, and would put a `role`-bearing element under the jsx-a11y `error` scope for the first
time (YAGNI); (b) frame on the wrapper (above); (c) keeping the tag inside the button (invalid HTML, broken AX
tree — the reason CA-05 needs a restructure at all).

### D-02 — DOM order is month-first, tag-second; no `tabIndex` anywhere

**Decision.** Per cell, tab order is **month control → semáforo tag**, produced purely by DOM order. No
positive `tabIndex`, no `tabIndex={0}` added anywhere; the disabled branch keeps **no** `tabIndex` (FIX 3).

**Why.** Month-first is simultaneously (a) the visual reading order — the month label renders at the top-left
of the cell, the tag at the top-right — and (b) the priority order (selecting the month is the cell's primary
action; the semáforo is a secondary shortcut). The two coincide, so the natural DOM order is correct and
needs no override. Grouping by cell (`ENE-button, ENE-tag, FEB-button, FEB-tag, …`) also keeps the keyboard
narrative coherent: a user traverses one month at a time instead of 12 months and then 12 tags.

**Accepted cost (R-5).** The grid's tab stops go from (months with data) to (months with data) + 12 tag stops,
up to 24. This is a deliberate, stated tradeoff, not an accident: 12 static links are trivial to render, and
`WG5-07` makes each one a required entry point. No skip link is added (YAGNI — the grid is the last section of
the page; there is nothing after it to skip to).

### D-03 — The tag overlays the month control's top-right corner; hit areas cannot collide

**Decision.** The tag is absolutely positioned at `top-1 right-1` (4px inset) inside the wrapper, painting over
the month control's top-right corner. It is **28×28 CSS px** (D-06).

**Why there is no accidental-activation path.** The two controls are DOM **siblings**, not ancestor/descendant:
a click on the tag has no bubbling path to the month control at all. A positioned element paints above its
static sibling, so the tag wins hit-testing inside its own 28px box, and the month control wins everywhere
else. This is stronger than the usual `stopPropagation` workaround and is provable in jsdom (test `N-06`:
clicking the tag must not call `onSelectPeriodo`).

**Geometric headroom.** Worst case is the 2-column mobile tier. At a 320px viewport the cell is ≈118px wide;
the month label is horizontally **centred** by the existing `flex flex-col items-center`, occupying roughly
x∈[44,74], while the tag occupies x∈[86,114]. At 360px (the `movil` Playwright project) the margin is larger.
The label and the tag never overlap at any supported width.

**Bonus, and it is the point of D-2:** because the tag is *outside* the disabled `<div>`, the disabled cell's
`opacity-60` does **not** dim it. An empty month's semáforo therefore *looks* live, matching the fact that it
*is* live. Nesting would have required fighting the opacity back.

### D-04 — `esActual` (today) and `esSeleccionado` (selected) occupy **different visual channels**

**Decision.**

| Marker | Channel | Rendering | AX |
|---|---|---|---|
| **Today** (`esActual`) | inline glyph | the existing `✓` `<span data-testid="mes-actual-marker" aria-hidden="true">` next to the month label — **byte-identical to today** | `aria-current="date"` on the month control — **unchanged** |
| **Selected** (`esSeleccionado`) | cell chrome + a circle around the mini ring | a 64px mint-filled circle enclosing the 56px `MiniDistribucionPie`, plus a 2px emerald cell border | none (see below) |

`esActual` **no longer drives any `className`.** Today's `border-2 border-primary bg-muted` on the month
button is retired; cell chrome becomes exclusively the *selected* channel.

**Why.** R-3's failure mode is precisely two markers competing for the same channel. Splitting them means the
two are readable **simultaneously** on the same cell when today *is* the selected month, and unmistakably
distinct when they differ. It also means today's marker gets a **zero-diff** treatment (`✓` + `aria-current`),
which is the safest possible outcome for the "retained and separately audited" requirement of D-1.

**No test locks the retired `border-primary`/`bg-muted` classes** — verified: `ResumenAnual.test.tsx`'s
current-month tests assert only the `mes-actual-marker` testid and the `aria-current` attribute, and the FIX-2
test asserts only the `focus-visible:*` classes. Nothing regresses.

**Why "selected" gets no ARIA state.** `aria-current="date"` means *today* and must not be overloaded (D-1).
The correct ARIA for "selected" here would be `aria-current="true"`/`aria-pressed`, both of which would either
collide with `aria-current="date"` on the same element (only one `aria-current` value is possible) or turn the
month control into a toggle it is not. The selected month's identity is already announced unambiguously and
redundantly elsewhere on the page: `PeriodoSelector`'s header and the new caption (D-09) both name it in text.
Registered as a deliberate, reasoned omission, not an oversight.

### D-05 — The selected marker is a mint circle in a **space that is always reserved** (zero layout shift)

**Decision.** In every cell, the `MiniDistribucionPie` is wrapped in a fixed `h-16 w-16` (64×64px) circular
flex box. On the selected cell only, that box gains `border-2 border-ingreso-foreground bg-ingreso` and a
`data-testid="mes-seleccionado-marker"`. The pie's own `size` stays **56** (`MiniDistribucionPie` untouched).
The selected month control additionally gets `border-2 border-ingreso-foreground` (border only; `bg-card`
unchanged).

**Why a reserved box instead of growing the pie.** A `size={64}` pie on the selected cell would make that
cell taller than its row siblings; grid rows stretch, so *the whole row* would jump 8px every time the user
picks a different month. Reserving 64px in every cell makes the marker appear and disappear with **zero**
reflow. Tailwind's `box-sizing: border-box` means the 2px border does not change the box either.

**Why these tokens.** `--color-ingreso` (`#d1fae5` mint) / `--color-ingreso-foreground` (`#065f46` emerald) is
this app's **already contrast-verified 6.78:1 AA pair**, and its twin `--color-vinculo-activo` is literally
the repo's "this item is the active one" token. `bg-ingreso` and `text-ingreso-foreground` are proven-working
utilities (`IngresoCard.tsx`, `SubirCartola.tsx`); `border-ingreso-foreground` comes from the same Tailwind 4
`--color-*` namespace. No new token, no new hex, no `@theme` edit.

**Not color alone (WCAG 1.4.1).** The marker is a *shape that exists or does not* (a 64px ring around the
56px pie), not a hue swap — a monochrome user still sees the circle.

**Rejected:** growing the pie (layout shift, above); `ring-*` utilities (same effect, but `border-*` is the
utility family this file and the whole dashboard already use — boring technology, KISS rule 2); repainting
wedge colors (they are data, never decoration).

### D-06 — `MiniSemaforoTag` is a 28×28 icon-only `<Link>`; the whole box is the target

**Decision.** One box: `h-7 w-7` (28×28 CSS px) `rounded-full inline-flex items-center justify-center`, with
the estado glyph centred inside at `text-[14px] leading-none` and `aria-hidden="true"`. There is no separate
"visual glyph" and "hit area" to reconcile — the coloured circle *is* the target.

**Why 28 and not exactly 24.** D-3's floor is 24×24 (WCAG 2.5.8 AA). Shipping exactly at the floor leaves zero
headroom for sub-pixel rounding, browser zoom, or a future root-font-size change, and the R-4 assertion is
`≥ 24`. 28 gives 4px of headroom at a cost of 4px of cell corner. It remains visually compact and, per D-03,
still cannot overlap the month label at 320px.

**Why one box instead of glyph + padded hit area.** Two boxes means two numbers to keep in sync and a target
whose bounds are invisible to the user. One box is simpler (KISS) and self-evidently meets the floor.

**How the floor is proven.** **Only** by rendered geometry in Playwright (`E-01`). This design **forbids** a
jsdom test that asserts `h-7`/`w-7` class presence — that is exactly the `WCTG-14` false-green R-4 names
(`WG5-10`/`WCTM-01` precedent). See §6.4.

### D-07 — The tag's accessible name is `Semáforo de {mes completo}: {estado}`

**Decision.** The name is carried by a `<span className="sr-only">` inside the link:
`Semáforo de enero 2026: Verde` (`estadoGlobal: null` → `Semáforo de enero 2026: Sin datos`). The glyph span
is `aria-hidden="true"`. The month portion is derived **inside** the component via
`mesCompletoLabel(periodo)` — the component owns its own name (SRP), and its prop shape stays identical to
`SemaforoTag`'s (`{ estadoGlobal, periodo }`), which keeps the two visually-different siblings mentally
interchangeable.

**Why not "Semáforo: Verde" (`SemaforoTag`'s name).** Two reasons, one of them load-bearing:

1. **Context.** Twelve identically-named links in one grid is an AX failure — a screen-reader user pulling up
   the links list would see "Semáforo: Verde" twelve times with no way to tell March from November.
2. **Collision, verified.** `ResumenScreen.test.tsx` (T14, US-047) queries
   `getByRole('link', { name: /Semáforo: Verde/ })` on the composed dashboard. RTL throws on multiple matches.
   The name `Semáforo de enero 2026: Verde` does **not** contain the substring `Semáforo: Verde`, so all 15
   existing `ResumenScreen` tests keep passing **unmodified**. This was checked against the real query strings,
   not assumed.

**Why `sr-only` text rather than `aria-label`.** Matches `SemaforoTag`'s own construction (visible/textual
name + `aria-hidden` emoji), keeps the name in the accessibility *content* tree, and survives translation.

### D-08 — The Space-key handler is duplicated, deliberately, with a registered trigger

**Decision.** `MiniSemaforoTag` carries its own `onKeyDown` Space→click handler, a ~7-line copy of
`SemaforoTag`'s (`WG5-12`: Space does not natively activate an `<a href>`).

**Why not extract.** Two occurrences is strike two of DRY's rule of three, and D-4 already sanctioned this
exact tradeoff ("only the `Link` JSX duplicates"). The *shared* part — the estado→(label, cara, className)
table — is already extracted into `lib/semaforo-estilos.ts` and is reused verbatim; only the JSX shell
duplicates.

**Debt registered with an explicit trigger:** the moment a **third** semáforo link is authored, extract the
Space handler (e.g. `lib/activar-con-espacio.ts`) rather than adding a third copy.

### D-09 — The caption is a single text node, in the data branch only

**Decision.** Below the grid, inside the section (which is `flex flex-col gap-4`, so the caption is a flex
sibling of the grid):

```tsx
<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
  <Info aria-hidden="true" size={14} className="shrink-0" />
  {`Toca un mes: el gráfico principal cambia a ese mes, con el mismo drill-down de siempre. Estás viendo ${mesCompletoLabel(periodoSeleccionado)}.`}
</p>
```

(Copy shown here is the APPROVED literal — see D-10 for the resolution record.)

Three sub-decisions, each load-bearing:

- **One template literal, not JSX interpolation.** `Toca…{mesCompletoLabel(x)}.` would split the sentence into
  three DOM text nodes and make `getByText('Toca un mes … julio 2026.')` fail, pushing the test toward a
  brittle regex or `textContent` matcher. A single template literal is one text node, so the test asserts the
  exact user-visible sentence.
- **Rendered only in the data branch.** Loading/Error/Empty render no grid, and a caption explaining how to
  click a grid that is not there is noise.
- **Plain visible text, no `aria-describedby`.** Follows the sanctioned D-08 precedent from US-047
  (`ResumenScreen`'s hint text): the controls already carry their own accessible names, and wiring
  `aria-describedby` from 24 controls to one caption would make every control announce the sentence again.
  The caption is **not** `aria-hidden` — it is real content, reachable by AT in normal reading order.

**Icon.** `Info` from `lucide-react` (ADR-027; `lucide-react` is already a dependency — `SemaforoTag` imports
`ChevronRight` from it). `aria-hidden`, decorative.

### D-10 — Final Spanish copy — APPROVED literals (wireframe-wins, resolved in the proposal question round)

**Resolution recorded.** This copy was contested during review: design's earlier draft (`Tu año {anio}`) was
an invented header not sourced from the wireframe. The user resolved it wireframe-wins, with the caption's
dynamic reading kept — both strings below are the binding, approved literals. `sdd-spec` (WTA-06) pins them
verbatim; this table restates them for the design's own DOM/test sections (§2.3, §6.3).

| Element | Copy | Notes |
|---|---|---|
| Section header (`<h2>`, also the region's accessible name) | `Año {anio} — vista macro por mes` → renders **`Año 2026 — vista macro por mes`** | Wireframe-literal, replaces both `Resumen Anual {anio}` and the rejected `Tu año {anio}` draft. The `<h2>` is `text-xs font-semibold tracking-widest uppercase`. |
| Caption | `Toca un mes: el gráfico principal cambia a ese mes, con el mismo drill-down de siempre. Estás viendo {mes año}.` → **`Toca un mes: el gráfico principal cambia a ese mes, con el mismo drill-down de siempre. Estás viendo julio 2026.`** | Wireframe's first sentence verbatim (accented); `{mes año}` is the wireframe sketch's "Ago = mes seleccionado" annotation translated into the dynamic selected-month sentence, via `mesCompletoLabel(periodoSeleccionado)` (correct lowercase mid-sentence Spanish). |
| Tag accessible name | `Semáforo de {mes completo}: {estado}` | D-07. `estado` ∈ `Verde`/`Amarillo`/`Rojo`/`Sin datos`, from `semaforo-estilos.ts` — never a second copy of the mapping. |

**Rejected:** the earlier `Tu año {anio}` header draft (invented, not wireframe-sourced — superseded by the
resolution above); a caption with an added semáforo clause ("…toca su semáforo para ver el detalle") — CA-06
defines exactly two duties (explain the month click, name the selected month), the tag announces itself, and a
two-clause caption at `text-xs` is a wall; a hardcoded month ("Ago") — explicitly forbidden by the proposal.

**Override procedure.** Copy is spec-owned; `sdd-spec` (WTA-06) is the pin of record. Blast radius of landing
these APPROVED literals: the header string touches **5 assertions across 3 files** — §6.3 (`ResumenAnual.test.tsx`:
title-with-year at :315, plus TWO occurrences in region-name-via-`aria-labelledby` at :379 and :382 — the
`getByText` grabbing `titulo.id` is easy to miss), §6.5 (`ResumenScreen.test.tsx:557`: 1 copy edit), and §6.6
(`ResumenPage.test.tsx:237`'s cross-suite heading pin — see §9); the caption string is exercised for the first
time by the NEW `N-07` test (not a touched-test edit), all enumerated.

### D-11 — `periodoSeleccionado` is a **required** prop with no default

**Decision.** `ResumenAnual`'s props become `{ anio, periodoSeleccionado, onSelectPeriodo, ahora? }`.
`periodoSeleccionado: string` is required.

**Why.** A default (`''`, or `periodoActualUTC(ahora)`) would let a caller silently forget to thread it and
render a grid whose "you are here" marker is quietly wrong or quietly absent — the failure would be invisible
in review. Required means `tsc` names every call site (1 production + 14 test renders). This is the direct
application of the US-047 lesson recorded in the impact-sweep instruction (§9).

`ahora` stays optional (`= new Date()`) — unchanged, it is a test seam, not a correctness input.

### D-12 — `renderEstado` takes a single named-argument object

**Decision.** `renderEstado({ query, onSelectPeriodo, periodoActual, periodoSeleccionado })` instead of four
positional parameters.

**Why.** `periodoActual` and `periodoSeleccionado` are **both `string`**, adjacent, and semantically opposite.
Positionally, swapping them type-checks and produces a grid where "today" and "selected" are exchanged —
a silent, plausible-looking bug that no compiler catches. Named arguments make the swap impossible. (KISS:
"explícito sobre implícito".)

### D-13 — The disabled cell's accessible name becomes `DIC` (the `Sin datos` fragment moves out, not away)

**Decision.** Nothing is added to compensate for the `SemaforoBadge` leaving the disabled cell.

**Before / after screen-reader narrative for December (no data):**

| | Today | After this change |
|---|---|---|
| Cell | "DIC Sin datos, botón, no disponible" | "DIC, botón, no disponible" |
| Sibling | — (the badge was inside the cell, `role="img"`, not focusable) | "Semáforo de diciembre 2026: Sin datos, enlace" |

**Why this is an improvement, not a regression.** The estado did not disappear; it moved to a sibling that
announces it with **more** context (full month name + the word "Semáforo") and is now reachable. Re-adding an
`sr-only` "Sin datos" inside the cell would make every empty month announce "Sin datos" twice in a row.

**Consequence, deliberately preserved:** the disabled cell still has **no** accessible name containing
"diciembre". That is what keeps the existing CA-04 pin `queryByRole('button', { name: /diciembre/i })` →
absent valid. It now holds **for a stated reason** rather than by accident, and `N-09` pins the name as exactly
`DIC` so a future well-meaning `aria-label` cannot silently break the CA-04 pin.

### D-14 — `ResumenAnual.test.tsx` migrates wholesale to `renderConRouter`, and the Loading test gets a never-resolving fetch

**Decision.** Every `render(<ResumenAnual …/>, { wrapper: crearWrapper() })` becomes
`renderConRouter(<ResumenAnual …/>)`; the local `crearWrapper` helper is deleted (dead code —
`renderConRouter` provides an identical `QueryClient` with `retry: false`). The Loading test's fetch mock
becomes a **never-resolving promise** (`new Promise(() => {})`).

**Why the migration is unavoidable.** `MesCelda` now renders a TanStack `<Link>`; without router context React
throws "useRouter must be used inside a `<RouterProvider>`". This is the same one-helper-change migration
`ResumenScreen.test.tsx` already performed in US-047 T11.

**Why all 14 tests, not just the grid ones.** Loading/Error/Empty do not render `MesCelda` and would
technically still work with a bare provider. Mixing two render helpers in one file creates a
"which-one-do-I-use" bug class for the next author; uniformity is worth 3 extra mechanical edits (KISS).

**Why the never-resolving fetch.** `renderConRouter` resolves its initial route match **asynchronously**
(documented in the harness and in `SemaforoTag.test.tsx`), so the current synchronous
`expect(screen.getByText('Cargando resumen anual…'))` cannot work, and the naive fix
(`await findByText(…)`) races the query's own resolution — the pending state might already be gone. A fetch
that never settles makes the pending state permanent and the assertion deterministic. This *strengthens* the
test rather than re-recording it.

### D-15 — e2e goes in a **new** `annual-grid.e2e.ts`; `dashboard-donut.e2e.ts` and `tablet-grid.e2e.ts` stay zero-diff

**Decision (a declared narrowing of the proposal's Affected Areas).** The proposal listed both existing e2e
files as "Modified (precedent files)". Design narrows this to: **new file** `apps/web/e2e/annual-grid.e2e.ts`;
both existing specs keep **zero diff**.

**Why.** `dashboard-donut.e2e.ts`'s own docblock declares its scope and pins its assertion count ("Exactly 6
assertions, one test per named proof… do not collapse them"); appending unrelated annual-grid proofs would
falsify that contract. `tablet-grid.e2e.ts` is the Configuración `WCTG-14` repair — it has nothing to do with
the annual grid and was cited as a *pattern* precedent, not an edit target. The shared
`e2e/fixtures/api-stubs.ts` **is** edited (§6.4), which is where the proposal's real coupling lives.

### D-16 — Two dead paths are created by this change; both are registered debt, not deletions

YAGNI rule 3 says delete parameters that only ever receive their default. Two things qualify **after** this
change, and both are explicitly out of scope per the proposal's zero-diff success criteria. Registering them
with triggers is the sanctioned pattern in this repo (`yagni.md` §"deuda consciente").

| Dead path | State after this change | Why not deleted now | Trigger |
|---|---|---|---|
| `SemaforoBadge.tsx` | **Zero production call sites.** Verified by `rg`: its only non-test usage was `ResumenAnual.tsx:132`. Its 6 unit tests keep running against a component nobody renders. | The proposal's success criteria require `SemaforoBadge.tsx` **zero diff**. Deleting it is a different change with its own review. | US-049 either adopts it on the `/semaforo` page, or a cleanup change removes component + test together. |
| `calcularDistribucionGasto`'s `bucketsIncluidos` param | Only ever receives its `BUCKETS_ANILLO` default in production (`resumen-view-model.ts:236` passes nothing; `DistribucionPie.tsx` imports `BUCKETS_5030` for the *ideal inset* record, a different code path). Non-default callers are now only its own unit tests. | `distribucion-gasto.ts` is declared untouched, and `distribucion-gasto.test.ts:184` is a **judgment-day-locked** regression contract for the renormalization bug — retiring the param means retiring that pin, which needs its own review. | A cleanup change that retires both the param and the `BUCKETS_5030`-renormalization test together. |

---

## 2. Target structure

### 2.1 `MesCelda` — rendered DOM (data month, selected, and also "today")

```
div.relative.h-full                                   ← wrapper: no role, no handler, no visual style
├── button[type=button][aria-label="Ver julio 2026"][aria-current="date"]   ← control 1, tab stop 1
│   │   .flex.flex-col.items-center.gap-1.h-full.w-full.rounded-lg.border.p-3
│   │   .focus-visible:outline-2.focus-visible:outline-slate-800  (LOCKED, WCAG 1.4.11)
│   │   + selected: .border-2.border-ingreso-foreground
│   ├── span.flex.items-center.gap-1              "JUL"
│   │   └── span[data-testid=mes-actual-marker][aria-hidden]   "✓"      ← today channel
│   └── span[data-testid=mes-seleccionado-marker]                        ← selected channel
│       │   .flex.h-16.w-16.items-center.justify-center.rounded-full
│       │   .border-2.border-ingreso-foreground.bg-ingreso
│       └── svg[aria-hidden] (MiniDistribucionPie size=56, 4 wedges)
└── span.absolute.top-1.right-1                                           ← control 2, tab stop 2
    └── a[href="/semaforo?periodo=2026-07"].h-7.w-7.rounded-full          (MiniSemaforoTag)
        ├── span[aria-hidden] "🙂"
        └── span.sr-only "Semáforo de julio 2026: Verde"
```

Unselected month: the `h-16 w-16` box renders **without** the testid, border and mint fill — same geometry,
no marker. Not today: no `✓` span, no `aria-current`.

### 2.2 `MesCelda` — rendered DOM (`sinIngreso` month)

Identical wrapper and identical `<span class="absolute top-1 right-1">` tag (D-2 — always live, never dimmed,
because it sits **outside** the `opacity-60` element). Control 1 is the unchanged
`div[role=button][aria-disabled=true]` — no `tabIndex`, no `onClick`, `aria-current="date"` still applied when
the empty month is also today (FIX 1/FIX 5 intact). Accessible name: `DIC` (D-13).

The `mes-seleccionado-marker` lives in the shared `contenido` fragment, so it survives on the disabled branch
by construction — mirroring FIX 1's discipline for `esActual`. **Not user-reachable via the production wiring
today**: `ResumenPage` short-circuits to `<Empty />` when `query.data.sinIngreso` (the monthly resumen
endpoint), so `ResumenScreen` (and therefore `ResumenAnual`) never renders while the *selected* month is empty
**per that query**. `query.data.sinIngreso` and `useResumenAnual`'s per-month `sinIngreso` (the annual
endpoint) are two **independent** queries, though, and could disagree (e.g. the annual endpoint reports a
month `sinIngreso` while the monthly endpoint for that same `periodo` has not caught up, or vice versa) — this
is not merely structural, so it is not left untested: `N-10` (§6.3) closes the gap directly with a unit test
that renders `ResumenAnual` with `periodoSeleccionado` targeting a `sinIngreso` month and asserts the selected
marker renders inside the disabled cell without crashing.

### 2.3 `ResumenAnual` — section structure

```
section[aria-labelledby=resumen-anual-titulo-2026]  (DASHBOARD_CARD_CLASS + flex flex-col gap-4)
├── h2#resumen-anual-titulo-2026        "Año 2026 — vista macro por mes"
└── renderEstado({query, onSelectPeriodo, periodoActual, periodoSeleccionado})
    ├── pending → <Loading/>   |   error → <ErrorState/>   |   all sinIngreso → <Empty/>
    └── data →
        ├── div.grid.grid-cols-2.gap-3.sm:grid-cols-3.lg:grid-cols-4   ← WDS-04 grid-columns test, UNTOUCHED
        │   └── MesCelda × 12
        └── p.flex.items-center.gap-1.5.text-xs.text-muted-foreground  ← caption (D-09)
```

The grid remains the **first** `.grid` in the container, so `ResumenAnual.test.tsx`'s code-level
grid-columns test (`container.querySelector('.grid')`) still resolves to it. That test — not the `WDS-04`
requirement text itself, per the disclosure in the spec preamble and §11 — is what stays locked and green.

### 2.4 Data flow (unchanged plumbing + one new prop)

```
ResumenPage ──viewModel(periodo)──▶ ResumenScreen ──periodoSeleccionado={viewModel.periodo}──▶ ResumenAnual
     ▲                                    │                                                        │
     │                                    └──onPeriodoChange──────────────────────────────────────┘
     │                                                                            (unchanged: CA-03)
     └── TanStack Router `periodo` search param ◀── onPeriodoChange ◀── MesCelda onClick
```

`ResumenAnual` keeps its own `useResumenAnual(anio)` query and its own Loading/Error/Empty states (explicitly
out of scope to change). No new state container, no new fetch, no new route. `MiniSemaforoTag` navigates
through the **existing** `/semaforo` stub — this change is a caller, never its owner.

---

## 3. Component contract — `apps/web/src/components/MiniSemaforoTag.tsx` (new)

```ts
export function MiniSemaforoTag(props: {
  readonly estadoGlobal: string | null;   // wire value, verbatim; null/unknown → SIN_DATOS
  readonly periodo: string;               // "YYYY-MM"; also the search param
}): JSX.Element
```

| Aspect | Contract |
|---|---|
| Element | `<Link to="/semaforo" search={{ periodo }}>` → a real `<a href>` |
| Size | `h-7 w-7` = 28×28 CSS px; the whole box is the target (D-06) |
| Estado mapping | `resolverEstiloSemaforo(estadoGlobal)` — the **only** source; never a second table (`WG5-08`) |
| `null`/unknown estado | renders `SIN_DATOS`; **still a live link**, never omitted, never disabled (`WG5-08`, D-2) |
| Accessible name | `sr-only` span: `Semáforo de {mesCompletoLabel(periodo)}: {estilo.label}` (D-07) |
| Glyph | `estilo.cara`, `aria-hidden="true"` |
| Keyboard | Tab/Enter native (`<a href>`); Space via the explicit `onKeyDown` (`WG5-12`, D-08) |
| Focus ring | `focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-800` — the same LOCKED ring every dashboard control uses (WCAG 1.4.11) |
| Layout | **None.** No margin, no positioning, no `className` prop — the call site positions it (D-01) |
| State/data | None. Pure props-in |

Untouched by construction: `SemaforoTag.tsx`, `SemaforoBadge.tsx`, `MiniDistribucionPie.tsx`,
`DistribucionPie.tsx`, `distribucion-gasto.ts`, `bucket-colors.ts`, `semaforo-estilos.ts`, `periodo-anual.ts`.

---

## 4. The 4-wedge change (CA-01) — exact mechanics and the R-2 fixture

**Production change: one argument and one comment.**

```diff
-import { BUCKETS_5030, calcularDistribucionGasto } from '@/domain/distribucion-gasto';
+import { calcularDistribucionGasto } from '@/domain/distribucion-gasto';
...
-  // US-047 PR1 interim: … until US-048 redesigns this table …
-  const tajadas = calcularDistribucionGasto(mes.buckets, BUCKETS_5030);
+  const tajadas = calcularDistribucionGasto(mes.buckets);
```

The default is `BUCKETS_ANILLO` — the same 4-item ring the main chart reads (`WG5-01`/`WG5-13`).
`MiniDistribucionPie` is already generic and `COLOR_BUCKET` already carries `SinCategoria: '#AEB4C4'`
(US-047 D-08). No component code changes.

### 4.1 The inverted pin — exact fixture and expected outcome (R-2)

Reuse the existing `eneroConSinCategoria` fixture in `ResumenAnual.test.tsx` **verbatim** (it already carries a
nonzero `SinCategoria`, which is precisely why the pin was written that way):

| Bucket | `total` | share | `porcentaje` after largest-remainder |
|---|---|---|---|
| Necesidades | `500000` | 500/1100 = 0.454545… | **46** (receives the single leftover point — largest remainder .4545) |
| Deseos | `300000` | 300/1100 = 0.272727… | **27** |
| Ahorro | `200000` | 200/1100 = 0.181818… | **18** |
| **SinCategoria** | **`100000`** (nonzero — the whole point) | 100/1100 = 0.090909… | **9** |
| | total `1100000` | | Σ = 100 |

Old behavior (`BUCKETS_5030`): **3** wedges at 50/30/20. New behavior: **4** wedges.

**Assertion (`N-00` in the ledger, §6.3):** `getAllByTestId('mini-pie-slice')` has length **4**, **and** the four
`fill` attributes are, in ring order, `#8FA7D1`, `#B1A7D1`, `#E6D194`, `#AEB4C4`.

**Why the fills and not just the count.** A count alone proves "four paths exist"; the fill sequence proves
*which* four — i.e. that the 4th wedge is genuinely the `SinCategoria` grey from `COLOR_BUCKET`, in
`BUCKETS_ANILLO` order. `MiniDistribucionPie` renders no `%` labels, so fills are the only observable
identity in jsdom. Percentages themselves are already locked by `distribucion-gasto.test.ts` (untouched) —
re-asserting them here would test the domain twice.

### 4.2 Gotcha the tasks must not trip on

`calcularDistribucionGasto` includes a bucket by **presence**, not by nonzero total. The shared `mesConDatos`
fixture carries `SinCategoria: '0'`, so after this change **every** data month renders **4** `<path>` nodes —
the 4th being a zero-sweep, zero-area arc (`calcularAngulos` forces the last tramo to close at 360°). This is
identical to the shipped main-chart behavior for a zero `SinCategoria`, not a new artifact. **Consequence:** no
test anywhere may assert "3 slices" against `mesConDatos`; the only slice-count assertion in the suite is the
inverted pin above, on the nonzero fixture.

---

## 5. Accessibility summary

| Concern | Resolution |
|---|---|
| Nested interactive controls (CA-05) | Eliminated structurally — siblings, not nesting (D-01). Pinned by `N-05` |
| `aria-current="date"` | Stays on the month control, **today only**, both branches (unchanged). Pinned by existing tests + `N-02` |
| Selected marker | Visual + textual (caption names the month); no ARIA state, reasoned in D-04 |
| Disabled cell | `role="button"` + `aria-disabled="true"`, no `tabIndex`, no handlers — unchanged (FIX 3) |
| Disabled cell's live tag | Deliberate asymmetry (D-2), reinforced by the tag being outside the dimmed element (D-03) |
| Target size | 28×28, ≥ the 24×24 WCAG 2.5.8 floor; proven by rendered geometry only (D-06, R-4) |
| Keyboard | Tab/Enter/Space on every tag (`WG5-12`); month controls unchanged |
| Focus ring | Same LOCKED `outline-slate-800` on both control types (WCAG 1.4.11) |
| Not color alone | Estado word in every tag's accessible name; selected marker is a shape, not a hue |
| Heading/region | `aria-labelledby` → `<h2>`, no duplicate `aria-label` (FIX 4) — only the copy changes |

---

## 6. Test strategy and ledger (§5-style)

### 6.1 Ordering — R-1's mitigation is executable, not aspirational

R-1 (High) is that the restructure silently regresses already-shipped CA-03/CA-04. The mitigation has a
**required order**:

1. **First**, with `MesCelda` still in its current shape, add the CA-03/CA-04 regression pins expressed
   **behaviorally** (click → `onSelectPeriodo('2026-01')`; disabled → click and `keyDown Enter` produce no
   call; `aria-disabled` present; no `tabindex`). These already exist as tests 5, 6 and 14 — so step 1 is
   *verifying they are green and structure-independent*, plus adding `N-06` (clicking the tag must not select
   the month), which is a new CA-03/CA-04-adjacent hazard the restructure creates.
2. **Then** perform the restructure.
3. **Re-run** the same assertions unchanged. Any of them going red is the regression R-1 predicted.

**Structure-independence audit (the reason step 3 is meaningful).** Every existing assertion was checked
against the target DOM:

- `within(botonActual).getByTestId('mes-actual-marker')` — the `✓` **stays inside** the month control. Survives.
- `within(botonNoActual).queryByTestId(…)` — same. Survives.
- `screen.getByText('DIC').closest('[aria-disabled="true"]')` — `DIC` stays inside the disabled div. Survives.
- `findByRole('button', { name: 'Ver enero 2026' })` — `aria-label` unchanged. Survives.
- `queryByRole('button', { name: /diciembre/i })` → absent — holds, for the reason stated in D-13.
- `container.querySelector('.grid')` — the grid is still the first `.grid`. Survives.

**The only element leaving the month control is the `SemaforoBadge`, which no existing test queries via
`within`.** The restructure's blast radius on existing assertions is therefore limited to (a) the router-context
migration (D-14) and (b) the header copy (D-10) — both mechanical and both enumerated below.

### 6.2 `apps/web/src/components/MiniSemaforoTag.test.tsx` — **NEW file, 8 tests**

Harness: `renderConRouter` (the `/semaforo` sentinel route already exists in it).

| # | Test | Newly-proven behavior |
|---|---|---|
| M-01 | renders an `<a>` whose accessible name is `Semáforo de enero 2026: Verde` | the estado word is in the name (not color alone, ADR-018/`W2-02`) **and** the name is month-scoped, so 12 tags are distinguishable |
| M-02 | `href` = `/semaforo?periodo=2026-01`, echoing the `periodo` prop | the tag targets the existing stub with the right month (CA-05 wiring) |
| M-03 | `estadoGlobal: null` → name contains `Sin datos`, element is still an `<a>` | `WG5-08`'s never-omit/never-disable rule holds in the compact form (D-2's foundation) |
| M-04 | `estadoGlobal: 'azul'` → falls back to the same `Sin datos` treatment | an unknown wire value is never coerced into a known color |
| M-05 | the glyph span is `aria-hidden`, and the name comes from the `sr-only` text | the emoji never leaks into the accessible name |
| M-06 | the link is focusable (`.focus()` → `toHaveFocus()`) | Tab-reachability half of `WG5-12` |
| M-07 | Space fires `preventDefault` **and** navigates to the sentinel | `WG5-12`'s Space requirement — the behavior D-08 duplicates actually exists here |
| M-08 | click navigates to the sentinel | mouse activation (Enter is the browser's native default; same documented equivalence as `SemaforoTag.test.tsx`) |

**Explicitly absent:** any assertion on `h-7`/`w-7` or any size class. Target size is a rendered-geometry claim
and is proven only in `E-01` (D-06, R-4).

### 6.3 `apps/web/src/components/ResumenAnual.test.tsx` — 14 existing → **24 tests**

**Existing 14, by kind of edit:**

| Kind | Count | Tests | Edit |
|---|---|---|---|
| Migration only (mechanical) | 10 | error, empty, 12-months, clickable-month (CA-03 pin), disabled-month (CA-04 pin), current-month marker, `aria-current`, focus-outline, grid-columns (code-level lock; tracks the accepted-but-unratified `WDS-04` deviation, see spec preamble + §11), FIX-5 | `render(…, {wrapper: crearWrapper()})` → `renderConRouter(…)`; add the new required `periodoSeleccionado` prop. **Zero assertion changes.** |
| Migration + fetch-shape | 1 | loading state | plus a never-resolving fetch and `findByText` (D-14) |
| Migration + copy | 2 | title-with-year, region-name-via-`aria-labelledby` | `'Resumen Anual 2026'` → `'Año 2026 — vista macro por mes'` (D-10, APPROVED literal) |
| Migration + **semantic inversion** | 1 | the 3-slice pin (`N-00`) | → 4 slices + fill sequence, nonzero `SinCategoria` fixture (§4.1) |

`crearWrapper` is deleted (dead after the migration).

**10 new tests:**

| # | Test | Newly-proven behavior |
|---|---|---|
| N-01 | with `periodoSeleccionado="2026-03"`, `mes-seleccionado-marker` is inside MAR's control and absent from every other cell | the selected marker exists, is derived from the prop, and is exactly one |
| N-02 | with `periodoSeleccionado="2026-03"` and `ahora`=JUL: MAR has the selected marker and **no** `✓`/`aria-current`; JUL has `✓`+`aria-current="date"` and **no** selected marker | D-1/R-3: the two markers are genuinely distinct concepts on distinct cells, and `aria-current="date"` never drifts onto "selected" |
| N-03 | all 12 months render a semáforo link, each with `href="/semaforo?periodo={that month}"` | CA-05 coverage is complete, not sampled; each link carries its **own** month |
| N-04 | December (`sinIngreso`): the cell is `aria-disabled`, has no `tabindex`, and click/Enter do not call `onSelectPeriodo`, **while** its semáforo link is present and is an `<a>` | D-2's asymmetry, asserted as one indivisible fact (CA-04 intact **and** the tag live) |
| N-05 | for every cell: the link is not a descendant of the month control (`link.closest('button,[role="button"]')` is `null`) and `within(control).queryByRole('link')` is `null` | CA-05's "no interactive element nested inside another", in the rendered tree |
| N-06 | clicking a semáforo link does **not** call `onSelectPeriodo` | D-03: the sibling restructure means tag clicks have no path to the month control — the hazard the restructure introduces is closed |
| N-07 | the caption renders the exact sentence naming the selected month, and changes when `periodoSeleccionado` changes | CA-06: dynamic, never hardcoded |
| N-08 | the month control precedes its semáforo link in document order (`compareDocumentPosition`) | D-02's per-cell tab order is a structural fact, not an accident of styling |
| N-09 | December's disabled cell has accessible name exactly `DIC` | D-13: pins the name so a future `aria-label` cannot silently invalidate the CA-04 `/diciembre/i` pin |
| N-10 | with `periodoSeleccionado` set to a `sinIngreso` month (e.g. December), `mes-seleccionado-marker` renders inside that disabled cell without crashing | §2.2: closes the "mirrors FIX 1" claim with a real assertion (not left structural-and-untested) **and** covers the cross-endpoint `sinIngreso` disagreement between `query.data` and `useResumenAnual`'s per-month data — the two queries are independent and could disagree |

### 6.4 `apps/web/e2e/annual-grid.e2e.ts` — **NEW file, 4 tests** (+ `api-stubs.ts` edits)

Real-viewport proofs only — every assertion reads rendered geometry or real navigation, never a className
(`WG5-10`/`WCTM-01`; this is R-4's mitigation).

| # | Project | Test | Newly-proven behavior |
|---|---|---|---|
| E-01 | `movil` (360px, worst case) | every one of the 12 `getByRole('link', {name: /^Semáforo de /})` has `boundingBox()` with `width ≥ 24` **and** `height ≥ 24` | D-3's WCAG 2.5.8 floor is **in effect** at the tightest tier, for all 12 — not merely present in a class string |
| E-02 | `escritorio` | set a `window` sentinel, click `Ver enero 2026`, then: URL matches `periodo=2026-01`, the sentinel survives (no document reload), and `mes-seleccionado-marker` is now inside ENE's control | CA-03 end-to-end: SPA switch, no reload, **and** the selected marker follows the real viewed period |
| E-03 | `escritorio` | click the link named `/^Semáforo de marzo 2026:/` → URL matches `/semaforo?periodo=2026-03` and the stub's `Semáforo` heading renders | CA-05 end-to-end against the real route tree and the real `_authenticated` layout |
| E-04 | `movil` | exactly one `mes-seleccionado-marker` exists, and its `boundingBox()` is ≥ 64×64 | CA-02's "larger mint circle" is a real rendered box at the tightest tier, and is unique |

**Two `e2e/fixtures/api-stubs.ts` edits (shared fixture — both verified safe for `dashboard-donut.e2e.ts`,
which asserts nothing about the annual grid and only needs the page to settle):**

1. `**/api/resumen*` **echoes** the requested `?periodo=` into the returned DTO's `periodo` field (falling back
   to `2026-07` when absent). Without this the view model's period never moves and E-02 could only assert the
   URL — a much weaker CA-03 proof.
2. `RESUMEN_ANUAL_FIXTURE`: months `2026-08`…`2026-12` become `sinIngreso: true` with zeroed buckets and
   `estadoGlobal: null`. Needed so the grid has both branches at a real viewport, and so E-01 covers a
   `Sin datos` tag. Not all 12 — an all-`sinIngreso` year would trip `ResumenAnual`'s Empty state.

**Deliberately not asserted in e2e:** the `✓`/today marker. It depends on the machine's real calendar date
(`anio` is pinned at 2026 by the fixture, so from 2027 onward no cell is "today"). Today-vs-selected
distinctness is proven in jsdom, where `ahora` is injectable (`N-02`).

### 6.5 `apps/web/src/components/ResumenScreen.test.tsx` — 15 existing → **16 tests**

| Kind | Count | Detail |
|---|---|---|
| Unchanged | 14 | Verified against the new markup: the T14 keyboard test's `getByRole('link', {name: /Semáforo: Verde/})` still matches exactly one element, because the 12 mini tags are named `Semáforo de … : Verde` (D-07). No `getAllByRole('link')` assertion exists in this file. |
| Copy edit | 1 | "renders the annual summary below…" — `'Resumen Anual 2026'` → `'Año 2026 — vista macro por mes'` (D-10, APPROVED literal) |
| **New** | 1 | **S-01:** rendering with `viewModel.periodo = '2026-01'` puts `mes-seleccionado-marker` inside ENE's control and nowhere else — proving `ResumenScreen` threads `viewModel.periodo` (not today, not a local guess) end-to-end into the grid |

`mockFetchPorBucket`'s annual fixture is **not** modified (January already has data, which is all S-01 needs) —
avoiding collateral risk to the other 14 tests.

### 6.6 `apps/web/src/components/ResumenPage.test.tsx` — 5 existing → **5 tests** (missed blast-radius site)

| Kind | Count | Tests | Edit |
|---|---|---|---|
| Copy edit | 1 | "renders the data state with income, all 4 buckets, and the global semáforo" | `screen.getByRole('heading', { level: 2, name: 'Resumen Anual 2026' })` (line 237) → `name: 'Año 2026 — vista macro por mes'` (D-10, APPROVED literal). One-line assertion edit, same test |
| Unchanged | 4 | error, loading/empty-adjacent states, previous-month wiring | No diff |

**Why this file was missed initially and is called out here.** `ResumenPage.test.tsx` composes `ResumenPage`
→ `ResumenScreen` → `ResumenAnual` and pins the `<h2>` region name a **third** place, independent of §6.3 and
§6.5. It is part of D-10's blast radius (§1 D-10) and of the impact sweep (§9) exactly like the other two.

### 6.7 Suites explicitly **not** touched

`SemaforoTag.test.tsx`, `SemaforoBadge.test.tsx`, `MiniDistribucionPie`/`DistribucionPie` tests,
`distribucion-gasto.test.ts`, `pie-geometry.test.ts`, `resumen-view-model.test.ts`, `dashboard-donut.e2e.ts`,
`tablet-grid.e2e.ts`. Zero diff, all must stay green.

### 6.8 Ledger totals

| Suite | Existing | Edited | New | Final |
|---|---|---|---|---|
| `MiniSemaforoTag.test.tsx` (new file) | 0 | 0 | 8 | 8 |
| `ResumenAnual.test.tsx` | 14 | 14 (10 mechanical, 1 fetch-shape, 2 copy, 1 inversion) | 10 | 24 |
| `ResumenScreen.test.tsx` | 15 | 1 (copy) | 1 | 16 |
| `ResumenPage.test.tsx` | 5 | 1 (copy) | 0 | 5 |
| `annual-grid.e2e.ts` (new file) | 0 | 0 | 4 | 4 |
| `e2e/fixtures/api-stubs.ts` | — | 2 fixture edits, 0 tests | 0 | — |
| **Total** | **34** | **16 tests touched** | **23 new tests** | **57** |

Only **one** of the 16 touched tests changes what it proves (the 3→4 inversion, §4.1). The other 15 keep their
assertions byte-identical except for header-copy-string edits (5 literal occurrences across §6.3, §6.5, §6.6 —
see D-10's blast radius). The caption string is exercised for the first time by the NEW `N-07` test (it belongs
to the 23-new bucket, not the touched set) — §4.1 anti-blind-re-record is satisfied by construction.

---

## 7. `eslint.config.js` — D-10 scope

**Decision.** Add a **new** scoped-`error` block for US-048 (do not extend the US-047 block), following the
US-042/043/047 precedent of one block per change with its own rationale comment:

```js
// Scoped ERROR — US-048 (design D-10). Same FILE-LIST form as the US-047
// block above (loose siblings under `src/components/`, not a subdirectory —
// globbing `src/components/**` would absorb the app's pre-existing a11y debt).
// `ResumenScreen.tsx` is already gated by the US-047 block; not repeated here.
{
  files: [
    'src/components/ResumenAnual.tsx',
    'src/components/MiniSemaforoTag.tsx',   // gated BEFORE it is authored
  ],
  extends: [jsxA11y.flatConfigs.recommended],
},
```

- **Touched vs new:** both files this change authors are listed. `MiniSemaforoTag.tsx` is listed *before* it
  exists — the same "gated before authored" discipline as `configuracion*.tsx`/`semaforo*.tsx`.
- **Not listed:** `ResumenScreen.tsx` (already in the US-047 block — a duplicate entry is noise), `*.test.tsx`
  (no existing scoped block lists test files), and any route file (this change adds none).
- **Debt inherited, not re-opened:** the US-047 block's registered trigger ("collapse these file lists into one
  `src/components/dashboard/**` glob once that directory is extracted") now covers one more file. Do not do the
  extraction here (YAGNI).

**Pre-decided contingency (so `sdd-apply` does not improvise).** Putting `ResumenAnual.tsx` at `error` promotes
its existing warnings. The one construct at risk is FIX 3's `<div role="button" aria-disabled="true">` with
**no** handlers and **no** `tabIndex`. `jsx-a11y/interactive-supports-focus` reports elements that have an
interactive role *and* interaction handlers; this element has none, so it is expected **not** to fire.
**If it does fire:** do **not** add `tabIndex` — that re-breaks CA-04 (FIX 3's whole point). Add a
line-scoped `// eslint-disable-next-line jsx-a11y/interactive-supports-focus` carrying the FIX-3 rationale, and
record it in the apply notes. Any other new `error` in these two files is a real finding and must be fixed, not
disabled.

---

## 8. Slicing and rollback

The three pieces are independent and independently revertible (proposal's Rollback Plan). If delivery is
chained, this is the dependency-correct order:

| Slice | Content | Independently green? |
|---|---|---|
| **A** | 4-wedge minis: the one-argument deletion + the inverted pin (§4) | Yes — no DOM change, no router migration |
| **B** | Selected marker: `periodoSeleccionado` prop + `esActual` channel split + `ResumenScreen` threading + caption + header copy (D-04, D-05, D-09..D-12) | Yes — still no `<Link>`, so no test-harness migration |
| **C** | `MiniSemaforoTag` + `MesCelda` restructure + the router migration of `ResumenAnual.test.tsx` + eslint block + e2e (D-01..D-03, D-06..D-08, D-14, D-15) | Yes — carries R-1 in full |

Slice C is where R-1 lives; §6.1's write-pins-first ordering applies **inside** it. Slice A and B do not touch
`MesCelda`'s DOM shape at all.

---

## 9. Impact sweep (US-047 lesson: sweep every signature/default that moves)

Performed with `rg` over `apps/web`, `apps/api`, `apps/mobile`, `packages/`.

| Symbol | Change | Call sites found | Verdict |
|---|---|---|---|
| `calcularDistribucionGasto` | **Signature unchanged.** Only one call site stops passing the optional 2nd arg | `ResumenAnual.tsx:118` (changed), `resumen-view-model.ts:236` (no 2nd arg, unchanged), `distribucion-gasto.test.ts` (×13, untouched) | Zero collateral. `DistribucionPie.tsx`'s `BUCKETS_5030` import is for the **ideal-inset `valores` record**, a different code path — untouched |
| `BUCKETS_5030` | Import removed from `ResumenAnual.tsx` only | still imported by `DistribucionPie.tsx:15`, `resumen-view-model.ts:7`, `distribucion-gasto.test.ts` | Export stays. No dead-export |
| `ResumenAnual` props | **+1 required prop** (`periodoSeleccionado`) — deliberately required (D-11) | `ResumenScreen.tsx:179` (1 production), `ResumenAnual.test.tsx` (14 renders) | 15 sites, all `tsc`-enforced. No default hides a miss |
| `renderEstado` | positional → single object (D-12) | module-private, 1 caller | Contained |
| `MesCelda` | +`esSeleccionado` prop | module-private, 1 caller | Contained |
| `SemaforoBadge` | loses its **only** production call site | after this change: `SemaforoBadge.test.tsx` only | **Dead component** — registered debt with trigger, not deleted (D-16) |
| `mesCompletoLabel` | new consumer (`MiniSemaforoTag`) | unchanged signature | None |
| `resolverEstiloSemaforo` | new consumer (`MiniSemaforoTag`) | unchanged signature | None |
| `crearWrapper` (test-local) | deleted (D-14) | `ResumenAnual.test.tsx` only | None |
| `<h2>` region name string | `'Resumen Anual 2026'` → `'Año 2026 — vista macro por mes'` (D-10, APPROVED literal) | `ResumenAnual.test.tsx` (§6.3, 3 assertions — :315, :379, :382; the region-name test carries TWO occurrences), `ResumenScreen.test.tsx:557` (§6.5, 1 assertion), **`ResumenPage.test.tsx:237`** (§6.6, 1 assertion — initially missed, added by review) | 3 files, 5 assertions total, all string literals — no `tsc` enforcement possible for a string; caught only by re-running the suites |

**Cross-app confirmation:** `apps/api`, `packages/api-client` and `apps/mobile` have **zero** diff. No DTO
field is added, removed or reinterpreted — `ResumenMesDto`/`ResumenAnualDto` are consumed exactly as today
(`periodo`, `buckets`, `sinIngreso`, `estadoGlobal`). There is no wire change, no migration, no persisted
state, and no new route (the `/semaforo` stub already exists). Any task touching those workspaces is scope
creep (ADR-024).

---

## 10. Risk register mapping

| # | Risk (proposal) | Where this design closes it |
|---|---|---|
| R-1 | Restructure silently regresses CA-03/CA-04 | §6.1: pins-first ordering + a per-assertion structure-independence audit showing the existing `within(botonActual)`/`closest('[aria-disabled]')` queries **survive unchanged**; `N-04`, `N-06`, `N-09` close the new hazards |
| R-2 | 3→4 test passes against a zero fixture | §4.1: exact nonzero fixture (`SinCategoria: '100000'`), exact expected shares (46/27/18/9), and a **fill-sequence** assertion so the 4th wedge is provably `SinCategoria` grey. §4.2 forbids any 3-slice assertion elsewhere |
| R-3 | Two markers read as noise or as one broken marker | D-04: separate channels (glyph vs cell chrome), today's marker is zero-diff; `N-02` asserts distinctness with `ahora` pinned; `E-04` proves the mint circle is a real ≥64px box |
| R-4 | 24×24 met by a className assertion | D-06 + §6.2: **no** size assertion in jsdom, by explicit prohibition; `E-01` reads `boundingBox()` for all 12 links at 360px |
| R-5 | 12 more links flood the tab order | D-02: (months with data) + 12 tag stops, up to 24, per-cell grouping, DOM-order only, no `tabIndex`; accepted and stated, pinned by `N-08` |
| R-6 | Wireframe's "6-per-row/48px" reopens `WDS-04` | Grid classes untouched; the code-level grid-columns test (`ResumenAnual.test.tsx`) is in the migration-only bucket (assertions byte-identical) — `WDS-04` itself is only an accepted-but-unratified deviation recorded in the un-archived `web-dashboard-redesign-mobile` change, not a locked requirement (spec preamble, §11). Circle sizes are design-owned: 56px pie kept, 64px halo added within the audited 2-column fit (D-05, §D-03 geometry) |
| R-7 | "Análisis por periodo" means something outside the repo | Nothing to design; the proposal's Intent is the deliverable. Not re-litigated here |
| R-8 | Estado/percentage math creeps into `apps/web` | §0: the only new logic is two string equalities. `resolverEstiloSemaforo` renders the backend's verbatim estado; no bp, no thresholds, no ratios anywhere in this change |

---

## 11. Open items handed to `sdd-tasks` / `sdd-spec`

1. **Copy is APPROVED and spec-owned (WTA-06).** D-10's two Spanish literals were resolved wireframe-wins in
   the proposal question round; `sdd-spec` (WTA-06) is the pin of record (override cost enumerated: 4 header
   assertions across §6.3/§6.5/§6.6, 1 caption assertion at §6.3 `N-07`).
2. **`WTA-*` requirements** must *reference* `WG5-01`/`WG5-07`/`WG5-08`/`WG5-09`/`WG5-13`/`WG5-10`/`WDS-04`
   per the proposal's binding instruction — this design deliberately restates none of them.
3. **Two registered debts** (D-16) need backlog entries with their triggers: dead `SemaforoBadge`, and
   `calcularDistribucionGasto`'s now-default-only `bucketsIncluidos`.
4. **The eslint contingency** (§7) is pre-decided; `sdd-apply` must not invent a different resolution.
5. **Backlog candidate — give `WDS-04` a canonical home.** `WDS-04` (capability `web-dashboard-shell`) is
   defined only in the **un-archived** change `openspec/changes/web-dashboard-redesign-mobile/specs/
   web-dashboard-shell/spec.md`; its own verify-report records this grid's `2/3/4`-column layout as an
   **accepted-but-unresolved PARTIAL/SUGGESTION deviation**, not a ratified living requirement. This change
   cites `WDS-04` (spec preamble, §2.3, §6.3, §10) purely to point at the code-level `ResumenAnual.test.tsx`
   grid-columns test, which IS locked and green — it does not ratify the requirement text itself. Archiving or
   promoting `web-dashboard-redesign-mobile` (which would resolve the PARTIAL and give `WDS-04` a canonical,
   ratified home) is out of scope here and is recorded as backlog for a future change.
