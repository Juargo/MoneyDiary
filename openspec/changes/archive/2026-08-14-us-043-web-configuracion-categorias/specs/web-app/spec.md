# Delta for web-app

Source: `openspec/changes/us-043-web-configuracion-categorias/proposal.md`. Every requirement below
cites its origin (CA-0N from issue #277, a binding decision number, or a proposal section §N).

## ADDED Requirements

### Requirement: WCTG-01 — Route hierarchy: shared layout, third-level breadcrumb (CA-02, decision 4, §1)

`configuracion.tsx` MUST become a layout route rendering the shared `Configuración` h1 and section-tab
chrome through `<Outlet/>`. Perfil's content MUST move to a `configuracion.index` leaf. `/configuracion/
categorias` (CA-01 list) MUST be a sibling leaf sharing the same layout chrome, with its `Categorías` tab
carrying `aria-current="page"` and a working `<Link>` (no longer inert). `/configuracion/categorias/
:categoriaId` (CA-02 edit) MUST NOT inherit the tab shell — it renders the frame-3 breadcrumb
(`Configuración` / `Categorías` / `{nombre}`) instead.

#### Scenario: The Categorías tab is a real, active link

- GIVEN an authenticated session on `/configuracion`
- WHEN the user activates the `Categorías` tab
- THEN the URL becomes `/configuracion/categorias` and that tab carries `aria-current="page"`

#### Scenario: The edit route replaces tabs with a breadcrumb

- GIVEN the user opens `/configuracion/categorias/:categoriaId`
- WHEN the page renders
- THEN no tab list is rendered; the breadcrumb `Configuración / Categorías / {nombre}` renders instead

### Requirement: WCTG-02 — CA-01 list is grouped by bucket with row actions and creation (CA-01, §3, §8)

`/configuracion/categorias` MUST list the caller's own categories grouped by bucket in the fixed order
`Necesidades`, `Deseos`, `Ahorro` — the `Deseos` group heading MUST render the display label `Gustos`
(reusing `ETIQUETA_BUCKET`, per A1), while the value sent to/read from the API stays the wire value
`Deseos`. Each row MUST show the categoría name, its pattern tag (WCTG-03), and edit + delete row
actions. A page-level `Nueva categoría` button MUST sit beside the title (`Nueva` at tablet width per
§8). An empty catalog MUST render a specified empty state.

#### Scenario: Groups render in fixed bucket order with the display label

- GIVEN a catalog with categories in all three assignable buckets
- WHEN the list renders
- THEN groups appear in order `Necesidades`, `Gustos`, `Ahorro` — the middle heading reads `Gustos`, not
  `Deseos`

#### Scenario: A deleted-all-categories user sees the empty state

- GIVEN a user with zero categories
- WHEN `/configuracion/categorias` renders
- THEN a specified empty state renders, not a broken/blank list

### Requirement: WCTG-03 — Pattern-count tag has three grammatical forms (§3, wireframes §5)

The pattern-count tag (list row and any other place it appears) MUST render `sin patrones` for 0,
`1 patrón` for exactly 1, and `N patrones` for 2 or more. A naive `${n} patrón${n === 1 ? '' : 'es'}`
MUST NOT be used, since it renders `0 patrones` instead of `sin patrones`.

#### Scenario: Zero patterns render the zero form

- GIVEN a category with zero patterns
- WHEN its tag renders
- THEN it reads exactly `sin patrones`

#### Scenario: Exactly one pattern renders the singular form

- GIVEN a category with exactly 1 pattern
- WHEN its tag renders
- THEN it reads exactly `1 patrón`

#### Scenario: Two or more patterns render the plural form

- GIVEN a category with 3 patterns
- WHEN its tag renders
- THEN it reads exactly `3 patrones`

### Requirement: WCTG-04 — Edit screen has two independent commit semantics (CA-02, decision 2, §4)

The edit screen MUST have two independent mutation surfaces. Identity (`Nombre`, required `Bucket`)
commits ONLY on `Guardar`, via one `PATCH /api/categorias/:id`. Patterns commit immediately, per row,
via independent `POST`/`PATCH`/`DELETE /api/patrones` calls the moment each row action is confirmed —
never batched with `Guardar`. `Cancelar` MUST discard ONLY the identity draft (`Nombre`/`Bucket`) and
return to the list; it MUST NOT revert, hide, or otherwise imply it undid any pattern row already
committed during the same visit.

#### Scenario: A pattern edit survives Cancelar

- GIVEN the user adds a pattern (which commits immediately) and then edits `Nombre` without saving
- WHEN the user activates `Cancelar`
- THEN the identity edit is discarded, the user returns to the list, and the newly added pattern is
  present when the category is reopened

#### Scenario: Guardar sends exactly one PATCH for identity, never touching patterns

- GIVEN `Nombre` is dirty and no pattern was touched this visit
- WHEN the user activates `Guardar`
- THEN exactly one `PATCH /api/categorias/:id` is sent and no pattern endpoint is called

### Requirement: WCTG-05 — Footer is one row; copy and divider carry the two-commit honesty (decision 10, §4)

The edit screen's footer MUST be a single row below the divider that closes the patterns section: the
red `Eliminar categoría` left-aligned, `Cancelar` and `Guardar` right-aligned in the same row. Because
this places the destructive delete control alongside the identity-commit buttons despite WCTG-04's two
different commit semantics, the screen MUST carry that honesty through two things instead of footer
separation: (a) the divider that visually closes the patterns section immediately above the footer, and
(b) copy that never implies a pattern edit is pending, undoable by `Cancelar`, or bundled with `Guardar`.

#### Scenario: Delete sits in the same row as Cancelar/Guardar

- GIVEN the edit screen renders
- WHEN the footer is inspected
- THEN `Eliminar categoría`, `Cancelar`, and `Guardar` are all in one row below the section divider

#### Scenario: No copy implies Cancelar undoes a pattern edit

- GIVEN a pattern was added earlier in the visit
- WHEN the user opens `Cancelar` or reads any footer-adjacent copy
- THEN nothing states or implies that activating `Cancelar` will discard or has discarded that pattern

### Requirement: WCTG-06 — The "sin patrones" note is always rendered, not a zero-state (CA-03, decision 9, §3/§4)

The edit screen MUST render the static note `Sin patrones, la categoría solo se puede asignar
manualmente.` below the patterns section, preceded by an info icon, in the same position REGARDLESS of
how many patterns the category has (0, 1, or many) — it is helper text, not a conditional zero-state.
The list's `sin patrones` tag (WCTG-03) carries the same CA-03 meaning for the list surface.

#### Scenario: The note renders under a category with zero patterns

- GIVEN a category with zero patterns
- WHEN the edit screen renders
- THEN the note renders verbatim below the (empty) patterns section

#### Scenario: The note also renders under a category with several patterns

- GIVEN a category with 3 patterns
- WHEN the edit screen renders
- THEN the identical note still renders below the populated patterns list

### Requirement: WCTG-07 — Bucket change requires an all-periods impact confirmation before saving (decision 1, §5)

WHEN `Bucket` is dirty relative to the loaded value, `Guardar` MUST NOT send `PATCH /api/categorias/:id`
until the user confirms an impact dialog. The dialog's copy MUST state both the `transaccionesCount`
transactions affected AND that the change re-stamps classification for **all periods**, not only the
current month — this is the single most dangerous operation in the change, since it retroactively
rewrites the 50/30/20 split of every closed month. The dialog MUST use `role="alertdialog"`, move focus
to the confirm button on open, close on `Escape` and restore focus to the trigger without sending a
request, and keep the dialog open with an inline error on failure (no silent close).

#### Scenario: A dirty Bucket cannot save without confirming

- GIVEN `Bucket` was changed from `Necesidades` to `Deseos` and is dirty
- WHEN the user activates `Guardar`
- THEN no `PATCH` is sent; a confirmation dialog opens naming the affected count and stating the change
  applies to all periods, not just the current month

#### Scenario: Escape cancels and preserves the dirty draft

- GIVEN the bucket-change confirmation dialog is open
- WHEN the user presses `Escape`
- THEN no request is sent, focus returns to `Guardar`, and `Bucket` remains dirty on screen

### Requirement: WCTG-08 — Delete impact confirmation, and no 409 exists or is ever expected (CA-04, decisions 3/5, §5)

`Eliminar categoría` (from a list row action or the edit screen) MUST open a confirmation dialog whose
impact sentence is sourced from the `transaccionesCount` already present in the caller's `['categorias']`
list data (never a fresh fetch) — e.g. "N transacciones pasan a Sin categoría." The `transaccionesCount
=== 0` case MUST be softened or skipped, mirroring `EliminarIngestaControl`'s zero-movement treatment.
Confirming MUST call `DELETE /api/categorias/:id`, which per decision 5 ALWAYS returns `204` for the
caller's own row — in use or not. The client-side implementation MUST NOT contain any code path, UI
state, or copy that handles a `409` for this endpoint: no such response exists and none will, so nothing
should be built to catch it.

#### Scenario: Confirming delete succeeds unconditionally and returns to the list

- GIVEN the delete confirmation dialog is open for a category with `transaccionesCount: 12`
- WHEN the user confirms
- THEN `DELETE /api/categorias/:id` is called, the response is treated as always successful (`204`), and
  the user is navigated back to the list

#### Scenario: Zero impact is softened

- GIVEN a category with `transaccionesCount: 0`
- WHEN the delete confirmation dialog opens
- THEN the "N transactions" sentence is not shown in its full alarming form (softened or omitted), per
  the `EliminarIngestaControl` precedent

#### Scenario: No 409 handling exists to find

- GIVEN the delete mutation's error-handling code
- WHEN it is inspected
- THEN it contains no branch, state, or copy keyed to a `409` response for `DELETE /api/categorias/:id`

### Requirement: WCTG-09 — Invalidation matrix is asymmetric by mutation kind, with the exclusion enforced (CA-05, §6)

Two profiles apply. **Profile A** (all three pattern mutations: create/update/delete a pattern) MUST
invalidate ONLY `['categorias']`. **Profile B** (all three category mutations: create/rename/re-bucket/
delete a category) MUST invalidate `['categorias']` PLUS the three broad dashboard prefix keys
`['resumen']`, `['resumen-anual']`, `['detalle-bucket']` (no period/bucket segment appended). A pattern
mutation MUST NOT invalidate any of the three dashboard keys — this exclusion is deliberate (pattern CRUD
has zero effect on any persisted transaction) and MUST be its own asserted, testable behavior, not an
implied absence. After a successful delete from the edit screen, the user MUST be navigated back to the
list.

#### Scenario: A pattern mutation invalidates only the catalog

- GIVEN a pattern is added, edited, or deleted
- WHEN the mutation resolves
- THEN `['categorias']` is invalidated

#### Scenario: A pattern mutation does NOT invalidate the dashboard (the exclusion)

- GIVEN the same pattern mutation as above
- WHEN the mutation resolves
- THEN `['resumen']`, `['resumen-anual']`, and `['detalle-bucket']` are NOT invalidated — asserted
  explicitly, not inferred from their absence in a different test

#### Scenario: A category mutation invalidates the catalog and all three dashboard keys

- GIVEN a category is created, renamed, re-bucketed, or deleted
- WHEN the mutation resolves
- THEN `['categorias']`, `['resumen']`, `['resumen-anual']`, and `['detalle-bucket']` are all invalidated

### Requirement: WCTG-10 — `:categoriaId` absent from the list is a reachable, specified not-found state (§1)

Because `GET /api/categorias/:id` does not exist, the edit route MUST resolve its category by `id` out of
the already-loaded `['categorias']` list query — one query serves both screens. WHEN the id is not present
in that list (stale link, or the category was deleted in another tab), a specified not-found state MUST
render (never a blank screen or an unhandled crash), offering navigation back to the list.

#### Scenario: A stale or deleted id renders a not-found state

- GIVEN `/configuracion/categorias/:categoriaId` is opened with an id absent from the caller's own
  `['categorias']` list
- WHEN the route resolves
- THEN a specified not-found state renders, with a way back to the list — not a blank page or a crash

### Requirement: WCTG-11 — Demo sessions see a proactively disabled, read-only catalog (§9)

Every mutation control on both screens (create, `Guardar`, every pattern row action, and both
confirmation dialogs' confirm button) MUST be PROACTIVELY disabled for a demo session (`esDemo`), with a
`role="note"` explanation of why. In addition, a defensive `403 DEMO_SOLO_LECTURA` mapping MUST exist for
every mutation endpoint, using a NEW dedicated `MENSAJE_DEMO_CATALOGO` constant — NOT the existing
`MENSAJE_DEMO_SOLO_LECTURA` copy reused verbatim — in case a disabled control is somehow bypassed. The
read path (list and edit-by-id-from-list) MUST still render normally for a demo session — a demo user sees
their own catalog, read-only. (Reconciled 2026-08-14 with design.md's accepted CORRECTION Q6c — the spec
predated it because spec and design ran in parallel. `MENSAJE_DEMO_SOLO_LECTURA` reads "…para editar tu
perfil.", which is false on the categories screen, hence the new sibling constant.)

#### Scenario: A demo user sees disabled controls with an explanation

- GIVEN a demo session
- WHEN `/configuracion/categorias` or its edit screen renders
- THEN every mutation control is disabled and a `role="note"` element explains why

#### Scenario: A demo user's catalog still reads normally

- GIVEN a demo session
- WHEN the demo user opens the list and an edit screen
- THEN their own catalog and its patterns render exactly as a non-demo user's would, read-only

#### Scenario: A defensive 403 is still mapped even though controls are disabled

(Reconciled 2026-08-14 with design.md's accepted CORRECTION Q6c: the copy shown is the new
`MENSAJE_DEMO_CATALOGO` constant, NOT `MENSAJE_DEMO_SOLO_LECTURA` reused from Perfil.)

- GIVEN a mutation endpoint somehow receives a request from a demo session
- WHEN the response is `403 DEMO_SOLO_LECTURA`
- THEN the verbatim `MENSAJE_DEMO_CATALOGO` copy is shown — a category-specific sentence, distinct from
  (and never falling back to) the existing Perfil surface's `MENSAJE_DEMO_SOLO_LECTURA`

### Requirement: WCTG-12 — Error and success copy is a closed table over 11 codes plus BODY_INVALIDO (§8)

Error copy MUST be a closed table covering exactly the 11 codes the deployed catalog API returns
(`NOMBRE_INVALIDO`, `BUCKET_NO_ASIGNABLE`, `PATRON_INVALIDO`, `MATCH_TYPE_INVALIDO`, `REGEX_INVALIDA`,
`PRIORIDAD_INVALIDA`, `DEMO_SOLO_LECTURA`, `CATEGORIA_NO_ENCONTRADA`, `PATRON_NO_ENCONTRADO`,
`NOMBRE_DUPLICADO`, `PATRON_DUPLICADO`), plus one `BODY_INVALIDO` row for a malformed response body
(mirroring the `tag: 'parse'` `ApiError` case) — 12 codes total. The mapping's selection key MUST be
`code` ALONE, never `(status, code)` and never a server-supplied message string, and totality MUST be
enforced with a `Record<CodigoCatalogo, string>` over the closed 12-member code union — NOT a `switch` +
`never` on the code axis — so that adding a code without a row fails `tsc` directly. (Reconciled 2026-08-14
with design.md's accepted CORRECTION Q8b — the spec predated it because spec and design ran in parallel.
Design's Q8a confirms no code repeats across statuses, which is what makes keying by `code` alone safe: a
composite `(status, code)` key would carry a discriminator that discriminates nothing here.) (Corrected
2026-08-14 — round 2 of judgment-day on PR #334: this row is NOT client-only. The backend emits it
literally — `res.status(400).json({ code: 'BODY_INVALIDO', ... })` in
`apps/api/src/infrastructure/http-express/routes/categorias.routes.ts` and
`apps/api/src/infrastructure/http-express/routes/patrones.routes.ts` — whenever `.safeParse()` rejects a
mutation body, and `errorConCodigo` lifts any body `code` verbatim into `{ tag: 'server', status, code }`
client-side. It is ALSO produced client-side by a `tag: 'parse'` runtime-validation failure, as already
documented below. Both producers are real and both are covered by tests.)

Separately, on a DIFFERENT axis, the function that dispatches on the raw `ApiError` union's `tag` (5
members: `network`, `unauthorized`, `parse`, `invalid`, `server`) MUST itself be a closed `switch` +
`never` exhaustiveness guard, so a sixth `ApiError` tag is a compile error, not a silent fallthrough. Both
guards are required and neither replaces the other. In particular, `tag: 'parse'` — the shape produced when
a 2xx response body fails runtime DTO validation — MUST map to the `BODY_INVALIDO` row of the code table
above; before this reconciliation, that mapping was unspecified and shipped unimplemented (the `tag`
dispatch fell through to a generic fallback instead), which is the gap this reconciliation closes.

#### Scenario: Every one of the 11 codes maps to fixed client copy

- GIVEN each of the 11 documented `status:code` responses in turn
- WHEN it is mapped to UI copy
- THEN a fixed, closed-table string renders — never the server's own `message` field

#### Scenario: A malformed response body maps to the `BODY_INVALIDO` row

- GIVEN a response that fails runtime DTO validation (not a documented error code)
- WHEN it is mapped
- THEN the `BODY_INVALIDO` row's copy renders

#### Scenario: `ApiError` tag `parse` maps to `BODY_INVALIDO`, not the generic fallback

(Added 2026-08-14 reconciliation — this scenario's absence is what let the `tag: 'parse'` case ship
unmapped to a generic fallback instead of `BODY_INVALIDO`.)

- GIVEN an `ApiError` with `tag: 'parse'` (the shape the fetch layer actually produces when a 2xx body
  fails its runtime DTO guard — this shape carries no `code` field at all)
- WHEN the `ApiError`-dispatch `switch` maps it to UI copy
- THEN the `BODY_INVALIDO` row's copy renders — never the generic fallback string

#### Scenario: An unmapped code fails to compile

(Reconciled 2026-08-14 with design.md's accepted CORRECTION Q8b: the code-axis guard is a
`Record<CodigoCatalogo, string>`, not a `switch` + `never` — see the requirement text above. A missing
key in a `Record` literal against a closed union fails `tsc` the same way a `never` guard would; the
guard mechanism changed, the exhaustiveness property did not.)

- GIVEN a hypothetical new `CodigoCatalogo` member added to the closed union without a corresponding row
  in the `Record<CodigoCatalogo, string>` table
- WHEN the mapping table is type-checked
- THEN `tsc` fails to compile — never a silent runtime fallback

### Requirement: WCTG-13 — Mobile viewport gets a defensive floor, not a redesign (decision 8, §J)

At a 360px viewport, both screens MUST guarantee: (a) no horizontal overflow/scroll; (b) `Nombre` and
`Bucket` render stacked, not side by side; (c) every interactive control (row actions, footer buttons,
tab links) has a touch target of at least 24×24 CSS px (WCAG 2.2 AA SC 2.5.8, ADR-018). The desktop
structure is otherwise preserved at this width — vertical tabs, two row icons, breadcrumb. The M2/M3
wireframe restructure (horizontal tabs, single row icon, back-icon IA replacing the breadcrumb, inverted
footer, shortened labels) is explicitly OUT OF SCOPE for this change and is owned by **US-063 (#332)**.

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

### Requirement: WCTG-14 — CA-06 tablet renders correctly with no new breakpoint tier (CA-06, §11)

T2 (list) and T3 (edit) MUST render correctly reusing WCFG-11's existing fluid `lg` grid — a fixed-width
sidebar/tab column beside a fluid content column — with NO new entry added to `layout.ts`. At tablet
width, `Nombre` and `Bucket` MUST stay side by side (unlike the mobile floor in WCTG-13), and pattern rows
shrink proportionally with the fluid column.

#### Scenario: Tablet width reuses the existing fluid grid, no new tier

- GIVEN the viewport is at T2/T3's measured width
- WHEN the list and edit screens render
- THEN the tab/sidebar column is fixed-width, the content column is fluid, and `layout.ts` gains no new
  breakpoint constant

#### Scenario: Nombre and Bucket stay side by side at tablet width

- GIVEN the viewport is at T3's measured width
- WHEN the edit screen renders
- THEN `Nombre` and `Bucket` render side by side, not stacked

## MODIFIED Requirements

### Requirement: WCFG-01 — Route is session-protected and reachable from two entry points (CA-01)

`/configuracion` and all of its nested routes (`/configuracion/categorias`,
`/configuracion/categorias/:categoriaId`) MUST render only inside the `_authenticated` layout's existing
session guard, with no new guard code — the `configuracion` layout route MUST NOT introduce a second
guard; nested routes inherit protection from the shared `_authenticated` ancestor. `/configuracion` MUST
be reachable both from the `Configuración` nav item (`NAV_ITEMS`, shared by `Sidebar`/`BottomTabs`) and
from an icon link in the sidebar footer (`aria-label="Configuración de la cuenta"`, no user name
rendered).
(Previously: scoped to the single `/configuracion` route only; now also covers the nested Categorías
routes introduced by the layout restructure, WCTG-01/§1.)

#### Scenario: Unauthenticated visit redirects to login

- GIVEN no active session
- WHEN the browser navigates to `/configuracion`
- THEN it redirects to `/login?redirect=/configuracion`

#### Scenario: Both entry points reach the page

- GIVEN an authenticated session
- WHEN the user activates the `Configuración` nav item, or the sidebar-footer icon link
- THEN both navigate to `/configuracion`

#### Scenario: A nested categorías route is protected without its own guard code

- GIVEN no active session
- WHEN the browser navigates directly to `/configuracion/categorias/abc123`
- THEN it redirects to `/login?redirect=/configuracion/categorias/abc123`, via the same `_authenticated`
  guard the layout route uses — no second guard was written

### Requirement: WCFG-02 — Perfil layout matches the verbatim visual contract (CA-02)

The Perfil screen MUST render, in order: the shared `Configuración` `<h1>` owned by the layout route; a
vertical section-tab list whose `Perfil` entry carries `aria-current="page"` and whose `Categorías`
entry is a **real, active `<Link>`** to `/configuracion/categorias`; the panel's own `Editar perfil`
heading, one level below the shared `<h1>`; three divided blocks — `Nombre`/`Email`, `Cambiar password`
(`Password actual`/`Password nueva`), `Cuenta de Google` — followed by one right-aligned `Guardar
cambios` button. The Google block MUST render exactly one of two structurally symmetric states, driven
by `me.googleVinculado`.

(Previously: the page's FIRST heading was `Editar perfil`, and the `Categorías` tab was a **placeholder,
inert**, given "the same treatment as `NAV_ITEMS`' unfinished destinations". The layout restructure of
WCTG-01/§1 moves the `Configuración` heading up into the shared layout — demoting `Editar perfil` one
level into the panel — and US-043 is precisely the change that makes the `Categorías` destination real,
so the inert-placeholder clause is retired. **Both departures are deliberate; this delta is what
authorises them.** Everything below the tab list — the three blocks, the button, and the Google block's
two states — is unchanged from the shipped requirement.)

#### Scenario: The shared heading precedes the panel heading

- GIVEN an authenticated session on `/configuracion`
- WHEN the page renders
- THEN the `Configuración` heading is the page's top-level heading and `Editar perfil` is a heading one
  level below it, inside the routed panel — not the first heading on the page

#### Scenario: The Categorías tab is no longer inert

- GIVEN an authenticated session on `/configuracion`
- WHEN the user activates the `Categorías` tab
- THEN it navigates to `/configuracion/categorias` — it is a real `<Link>`, never a disabled control,
  and it MUST NOT carry `aria-disabled`

#### Scenario: Everything below the tab list is unchanged

- GIVEN an authenticated session on `/configuracion`
- WHEN the page renders
- THEN the three divided blocks appear in the shipped order, followed by one right-aligned `Guardar
  cambios` button, and the Google block renders exactly one of its two symmetric states per
  `me.googleVinculado`

#### Scenario: Linked state renders the green pill and Desvincular

- GIVEN `me.googleVinculado` is `true`
- WHEN the Cuenta de Google block renders
- THEN it shows the pill `Vinculada: {me.email}` and a `Desvincular` button, not `Vincular con Google`

#### Scenario: Not-linked state renders the neutral pill and Vincular

- GIVEN `me.googleVinculado` is `false`
- WHEN the Cuenta de Google block renders
- THEN it shows a neutral `No vinculada` pill and a `Vincular con Google` button, in the same layout
  position `Desvincular` would occupy

### Requirement: WCFG-11 — CA-04 fluid layout reproduces T1 without a new breakpoint tier

The shared `configuracion` layout's grid (heading + tab list beside the routed panel) MUST be fluid (a
fixed-width first column plus a flexible panel) and MUST reproduce T1's measured proportions at T1's
viewport width without adding any constant to `layout.ts` or changing `AppShell`/`Sidebar`/`BottomTabs`.
Below the shell's `lg` breakpoint the layout's two columns MUST stack (heading + tab list above the
routed panel). This grid is shared chrome and MUST apply identically to whichever child route
(`/configuracion` Perfil or `/configuracion/categorias` list) renders inside it. The edit route
(`/configuracion/categorias/:categoriaId`) opts out of this chrome per WCTG-01 and is governed by
WCTG-14 instead.
(Previously: scoped to the single Perfil page's own grid; now scoped to the shared layout route the
route restructure introduces, WCTG-01/§1.)

#### Scenario: T1 width reproduces the measured proportions

- GIVEN the viewport is at T1's width
- WHEN the layout renders (Perfil or the Categorías list inside it)
- THEN the sidebar width/font are unchanged and the layout's own gutter/panel measurements match T1, with
  no new entry in `layout.ts`

#### Scenario: Below `lg` the columns stack

- GIVEN the viewport is below the shell's `lg` breakpoint
- WHEN the layout renders
- THEN the heading and tab list appear above the routed panel instead of beside it

#### Scenario: The edit route does not inherit this grid

- GIVEN the user is on `/configuracion/categorias/:categoriaId`
- WHEN the page renders
- THEN it does not render the shared tab-list grid; the breadcrumb chrome (WCTG-01/WCTG-14) renders
  instead

### Requirement: WCFG-12 — Configuración inputs satisfy CA-05 a11y and the scoped lint gate

`eslint-plugin-jsx-a11y` MUST be installed and enabled at `error` severity via a path override scoped to
`src/components/configuracion/**` and every `src/routes/_authenticated/configuracion*.tsx` route file
this change introduces or modifies (`warn` elsewhere). Every form input on any Configuración page MUST
have an associated `<label>` reachable via `getByLabelText`.
(Previously: the route-file portion of the glob covered only the single `configuracion.tsx` file; it now
covers every route file the layout restructure and the new Categorías routes introduce, §12.)

#### Scenario: Every input is reachable by its label

- GIVEN the rendered Perfil form
- WHEN each input is queried by `getByLabelText` with its verbatim label (`Nombre`, `Email`, `Password
  actual`, `Password nueva`)
- THEN each query resolves to exactly one input

#### Scenario: The scoped lint gate is clean

- GIVEN the new files under `src/components/configuracion/**` and every new/modified `configuracion*.tsx`
  route file
- WHEN `pnpm web lint` runs
- THEN it reports zero `jsx-a11y` errors for those files

#### Scenario: New route files are covered by the widened glob

- GIVEN the new Categorías route files exist alongside the original `configuracion.tsx`
- WHEN `pnpm web lint` runs
- THEN the `error` tier applies to those new files too, not only the original single file

### Requirement: WCAT-02 — Panel groups the bucket's transactions by categoría, ordered without a hardcoded enum

Within the selected bucket's panel, transactions MUST be grouped by `categoria` (from `categorias-api`'s
DTO field). Each group header MUST show the categoría name, its transaction count, and its exact subtotal
(from string/BigInt amounts, never `Number()`/`parseFloat()`). Rows with no categoría (SinCategoria
bucket, or an unmatched row) render under a "Sin categoría" group. Group order MUST be data-driven —
alphabetical by categoría `nombre` — with the "Sin categoría" group always rendered last, regardless of
its count. The ordering MUST NOT read a static `ORDEN_CATEGORIAS` enum (retired by this change, §7); a
user-created or renamed categoría MUST sort correctly with no ordering-code change.
(Previously: group order was implicit, driven by the hardcoded `ORDEN_CATEGORIAS.indexOf` enum in
`domain/categoria.ts`; that enum is retired by this change, §7.)

#### Scenario: Necesidades panel groups by its 5 categorías

- GIVEN Necesidades has transactions in Supermercado, Farmacia, and Transporte this period
- WHEN the panel renders
- THEN exactly those 3 categoría groups appear, each with its own count and exact subtotal

#### Scenario: Subtotal precision survives large amounts

- GIVEN a group contains a transaction beyond `Number.MAX_SAFE_INTEGER`
- WHEN the group's subtotal is computed
- THEN every digit is preserved (BigInt/integer arithmetic, not float)

#### Scenario: A newly created categoría sorts alphabetically with no code change

- GIVEN a user creates categoría "Zapatería" in Deseos alongside existing "Delivery" and "Streaming"
- WHEN the Deseos panel renders
- THEN groups appear alphabetically (`Delivery`, `Streaming`, `Zapatería`), with no ordering constant
  updated

#### Scenario: Sin categoría group always renders last

- GIVEN a bucket panel has both categorized and uncategorized transactions
- WHEN the panel renders
- THEN the "Sin categoría" group appears after every named categoría group, regardless of its count

### Requirement: WCAT-04 — Reclassify control is active, data-driven, and updates data on success

The per-row reclassify control MUST no longer be a disabled placeholder: activating it MUST let the user
choose a categoría (offered as ALL of the caller's own categorías, grouped by bucket, sourced from
`useCategorias()` — the live query this change introduces — never a hardcoded list) and call the
`categorias-api` reclassify endpoint. `ReclasificarCategoriaControl` MUST derive the destination bucket
from the chosen categoría's own `bucket` field in the DTO, not a static name→bucket map. When the chosen
categoría's bucket differs from the transaction's current bucket, the control MUST show a confirmation
naming the exact money move (e.g. "Esto mueve $X de Deseos a Necesidades") before committing; same-bucket
reclassification MUST commit immediately without a confirmation step. On success, the panel's transaction
list AND the resumen (pie/traffic-light) MUST refresh to reflect the new categoría/bucket. The
SinCategoria "Clasificar" CTA MUST behave the same way via the same control. A categoría created,
renamed, or deleted through `/configuracion/categorias` MUST be reflected here with no code change
(`domain/categoria.ts`'s hardcoded exports are removed, §7).
(Previously: the dropdown and bucket-move logic were backed by `domain/categoria.ts`'s hardcoded
`ORDEN_CATEGORIAS`/`CATEGORIA_BUCKET`, which could offer a deleted categoría, omit a newly created one, or
misfire/skip the cross-bucket confirmation after a re-bucket, §7.)

#### Scenario: A successful within-bucket reclassify updates the group counts

- GIVEN a transaction shown under "Delivery" in the Deseos panel
- WHEN the user reclassifies it to "Streaming" via the control
- THEN it commits immediately (no confirmation dialog), moves to the "Streaming" group, and both groups'
  counts/subtotals update, with no change to the Deseos pie slice

#### Scenario: A cross-bucket reclassify requires confirmation and then updates the resumen

- GIVEN a transaction shown under Deseos is being reclassified to a Necesidades categoría
- WHEN the user selects the target categoría
- THEN a confirmation naming the money move is shown before anything commits
- WHEN the user confirms
- THEN the transaction disappears from the Deseos panel and the resumen/traffic-light reflects the
  updated bucket totals

#### Scenario: Cancelling a cross-bucket confirmation leaves the UI unchanged

- GIVEN the cross-bucket confirmation dialog is showing
- WHEN the user cancels (or presses Escape)
- THEN no request is sent and the transaction stays in its original group

#### Scenario: A failed reclassify leaves the UI unchanged

- GIVEN the reclassify endpoint returns an error (e.g. cross-tenant/invalid categoría)
- WHEN the user attempts the reclassify
- THEN the transaction stays in its original group and an error is communicated to the user

#### Scenario: A just-created categoría is offered by the dropdown immediately

- GIVEN a user creates categoría "Mascotas" via `/configuracion/categorias`
- WHEN they return to the dashboard and open the reclassify control on any transaction
- THEN "Mascotas" appears in the dropdown, grouped under its bucket, via the existing `['categorias']`
  cache — no code change

#### Scenario: A deleted categoría is no longer offered

- GIVEN a user deletes categoría "Delivery" via `/configuracion/categorias`
- WHEN they return to the dashboard and open the reclassify control
- THEN "Delivery" no longer appears in the dropdown

#### Scenario: A re-bucketed categoría triggers the confirmation correctly

- GIVEN a user moves categoría "Supermercado" from Necesidades to Deseos via the edit screen
- WHEN they reclassify a Necesidades transaction to "Supermercado" on the dashboard
- THEN the cross-bucket confirmation fires (Necesidades→Deseos), because the dropdown derives the bucket
  from the live DTO, not a stale map

## Non-Goals Delta (housekeeping, not a requirement change)

- REMOVE: `The Categorías section's real content (US-043; the tab renders inert)` — this change delivers
  that content; the line no longer describes a non-goal.
