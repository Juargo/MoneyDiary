# Delta for Web Import Preview — Create a Categoría from the Preview Row

**Change**: `crear-categoria-desde-preview`
**Capability**: `web-import-preview` (extends `openspec/specs/web-import-preview/spec.md`)

## Purpose

Closes the "leave the preview, create the categoría, come back, redo every
override" loop: adds a "+" control next to a preview row's categoría select
that opens a form to create a categoría with patrones in one atomic call
(CAT038-10), adopts it on the originating row, and re-evaluates every other
row against the new patrones before commit. Presentation-only per ADR-024:
all creation validation and re-classification logic still comes from the
backend; the client only orchestrates the call sequence and renders the
result.

## ADDED Requirements

### Requirement: WEB-PRV-12 — The "+" control is scoped to rows with a bucket chosen, hidden for duplicates, and demo-gated

A "+" control ("Nueva categoría") MUST render to the right of a preview row's
categoría select, under the exact same condition WEB-PRV-05 already gates the
categoría select on: a bucket has been chosen for that row (locked decision
2). It MUST NOT render for rows where `esDuplicado: true` (duplicate rows are
never editable, WEB-PRV-04). When the session is a demo session (`esDemo`),
the control MUST render disabled with the same house demo-note pattern the
catalog CRUD screens already use (`MENSAJE_DEMO_CATALOGO`); the server still
enforces `DEMO_SOLO_LECTURA` independently (CAT038-10) as the authoritative
gate.

#### Scenario: "+" is hidden until a bucket is chosen

- GIVEN a non-duplicate row where the user has not yet chosen a bucket
- WHEN the row renders
- THEN the "+" control is not rendered

#### Scenario: "+" appears once a bucket is chosen

- GIVEN a non-duplicate row where the user selects a bucket
- WHEN the categoría select becomes available (WEB-PRV-05)
- THEN the "+" control also renders, to the right of the categoría select

#### Scenario: "+" never renders for a duplicate row

- GIVEN a row with `esDuplicado: true`
- WHEN the row renders
- THEN no "+" control appears, regardless of any bucket state

#### Scenario: "+" is disabled with the demo note in a demo session

- GIVEN an authenticated demo session viewing a row with a bucket chosen
- WHEN the row renders
- THEN the "+" control is rendered but disabled, with the same demo-note affordance the catalog CRUD screens use

### Requirement: WEB-PRV-13 — The creation form collects nombre and an editable patrones list, with the bucket fixed to the row's bucket

Activating "+" MUST open a form containing:

- `Nombre` — required text input.
- The row's chosen bucket, shown read-only (not editable) — locked decision 2.
- A patrones editor: one entry prefilled with `{ patron: <row's descripcion>, matchType: 'CONTAINS' }` (locked decision 3), editable and removable; the user MAY add further entries; each entry's `matchType` MUST offer `CONTAINS`/`STARTS_WITH`/`REGEX`. The list MAY be emptied entirely — zero patrones is a valid submission (CAT038-10).
- `Cancelar` and `Guardar` actions.

The form MUST support: `Escape` cancels and closes the form without saving;
opening the form MUST move focus into it (the `Nombre` field or the form's
first focusable element); closing it (via Cancelar, Escape, or a successful
Guardar) MUST return focus to the "+" control that opened it, except where
WEB-PRV-15's post-save re-render explicitly moves focus elsewhere.

#### Scenario: Opening the form prefills the first patrón from the row description

- GIVEN a row with `descripcion: "COMPRA PETCO"` and a bucket chosen
- WHEN the user activates "+"
- THEN the form opens with one patrón entry: `{ patron: "COMPRA PETCO", matchType: "CONTAINS" }`
- AND that entry is editable and removable

#### Scenario: The bucket field is shown but not editable

- GIVEN the row's chosen bucket is "Deseos"
- WHEN the creation form opens
- THEN "Deseos" is displayed as the categoría's bucket
- AND no control in the form allows changing it

#### Scenario: The user can add and remove patrón entries

- GIVEN the creation form is open with its one prefilled patrón entry
- WHEN the user adds a second entry and then removes the first
- THEN exactly one patrón entry remains, reflecting the user's edits

#### Scenario: Zero patrones is a valid submission

- GIVEN the user removes the only (prefilled) patrón entry
- WHEN they click Guardar with `Nombre` filled
- THEN the form submits with an empty patrones list (no client-side block)

#### Scenario: Escape cancels without saving

- GIVEN the creation form is open with unsaved edits
- WHEN the user presses `Escape`
- THEN the form closes, no request is sent, and focus returns to the "+" control

#### Scenario: Opening the form moves focus into it

- GIVEN the user activates "+" on a row
- WHEN the form opens
- THEN keyboard focus lands inside the form

### Requirement: WEB-PRV-14 — Save errors keep the form open and place the message at the failing field

Clicking Guardar MUST call the extended `POST /api/categorias`
(CAT038-10/CAT038-11) with the form's `nombre`, the row's fixed bucket, and
the current patrones list. On any error response, the form MUST remain open
with the user's entered values intact, and the message MUST be rendered via
the existing closed `mensajeDeErrorCatalogo` map. A per-patrón error
(identified by index, CAT038-11) MUST be placed at that specific patrón
entry, not as a single form-level message indistinguishable from a
nombre/bucket-level error.

#### Scenario: Duplicate nombre keeps the form open with the mapped message

- GIVEN the caller already owns a categoría named "Mascotas"
- WHEN they submit `nombre: "mascotas"` and click Guardar
- THEN the form stays open, no navigation occurs, and the mapped duplicate-name message renders
- AND nothing is persisted

#### Scenario: An invalid REGEX patrón error is placed at that entry

- GIVEN the form has two patrón entries and the second has an invalid REGEX
- WHEN the user clicks Guardar
- THEN the response identifies index 1 (CAT038-11)
- AND the mapped error message renders at the second patrón entry, not at the top of the form
- AND nothing is persisted

### Requirement: WEB-PRV-15 — On save success, the originating row adopts the new categoría as an explicit edit and the catalog is refreshed

On a successful (`201`) save, the system MUST, in order:

1. Set the originating row's edit to the newly created categoría's id via the
   same `edits` overlay mechanism WEB-PRV-06 already uses — this MUST happen
   even if none of the new patrones match that row's own description (locked
   decision 1). This is an explicit edit like any user-made override: it
   survives subsequent re-runs the same way WEB-PRV-06's existing edits
   already do.
2. Invalidate the catalog query (`['categorias']`) so the new categoría
   appears as an option in every row's categoría select, including rows
   other than the originating one.
3. Re-run `POST /api/ingestas/preview` with the SAME `File` object already
   held in state (WEB-PRV-01), preserving the current `edits` map unchanged
   except for step 1's addition.

Rows that already carry a prior user edit MUST keep that edit through the
re-run (edits always win, existing `resolverCategoriaMerged` rule — no
special-casing introduced by this change). Rows with no prior edit MUST
display whatever `sugerido` the re-run backend response now returns for them,
which MAY be the new categoría if one of its patrones matches.

#### Scenario: The originating row adopts the new categoría even with no matching patrón

- GIVEN the user creates a categoría from a row with zero patrones (or patrones that don't match that row's own description)
- WHEN the save succeeds
- THEN that row's merged categoría is the new categoría, held as an explicit edit

#### Scenario: Untouched rows pick up the new categoría after the re-run

- GIVEN 3 other untouched rows whose descriptions match the new categoría's patrones
- WHEN the save succeeds and the preview re-run completes
- THEN those 3 rows now show the new categoría as their merged (`sugerido`) value

#### Scenario: Previously edited rows keep their prior override through the re-run

- GIVEN a row the user had already manually reassigned to a different categoría
- WHEN a new categoría is created from a different row and the preview re-runs
- THEN the previously-edited row still shows its prior manual categoría, unaffected by the new patrones

#### Scenario: The catalog refresh makes the new categoría selectable everywhere

- GIVEN the save succeeded
- WHEN any other row's categoría select is opened afterward
- THEN the new categoría appears among its bucket's options

### Requirement: WEB-PRV-16 — The re-run announces how many rows changed suggestion, and the progress readout reflects it

After a successful save and preview re-run (WEB-PRV-15), the system MUST
announce, via a `role="status"` region, how many rows changed suggested
classification as a result — including the zero case (e.g. "N movimientos
ahora sugieren «X»" when N > 0, or an equivalent "no other row matched"
message when N = 0). "Changed" MUST be computed by comparing each row's
merged categoría before vs. after the re-run, excluding the originating row
(which always changes, per WEB-PRV-15, and is not part of this count) and
excluding rows with a prior explicit edit (which cannot change, per
WEB-PRV-15). The classification progress readout (the "N de M clasificadas"
count and its progress bar — the same readout `resolverCategoriaMerged`
already backs) MUST reflect the post-re-run state.

#### Scenario: Announcement reports a positive count

- GIVEN 3 untouched rows newly match the created categoría's patrones after the re-run
- WHEN the re-run completes
- THEN the `role="status"` region announces that 3 rows now suggest the new categoría

#### Scenario: Announcement reports the zero case

- GIVEN no other row's description matches any of the new categoría's patrones
- WHEN the re-run completes
- THEN the `role="status"` region announces that no other row matched
- AND this is not treated as an error state

#### Scenario: The classification progress readout updates after the re-run

- GIVEN the "N de M clasificadas" readout showed a given count before the save
- WHEN the re-run completes and additional rows now have a merged categoría
- THEN the readout's count and progress bar reflect the new, larger classified count

### Requirement: WEB-PRV-17 — A preview re-run failure after a successful save does not lose the created categoría or the prior review state

If `POST /api/ingestas/preview` fails during the WEB-PRV-15 re-run (after the
categoría was already created successfully server-side), the system MUST:

- Keep the previous (pre-re-run) preview table on screen, with all prior
  `edits` intact, rather than blanking the review to an error screen.
- Show an inline error describing that the refresh failed.
- Leave the newly created categoría in place — it already exists server-side
  and remains selectable in every categoría select (the catalog query
  invalidation in step 2 of WEB-PRV-15 already completed independently of the
  preview re-run's own outcome).

#### Scenario: Re-run failure preserves the review table and the created categoría

- GIVEN a categoría was just created successfully and the preview re-run then fails (e.g. a 500)
- WHEN the failure is handled
- THEN the review table still shows the rows and edits from before the re-run attempt
- AND an inline error is shown describing the refresh failure
- AND the new categoría still appears as an option in every categoría select

### Requirement: WEB-PRV-18 — rowIndex identity is stable across two preview runs of the same file, and this is independently verified

WEB-PRV-15's re-run depends on `rowIndex` continuing to identify the same
logical row across two separate `POST /api/ingestas/preview` calls for the
same `File` — the entire `edits` overlay (WEB-PRV-06) is keyed by it, and
this change is the first caller that invokes preview twice for one file in a
single session. The backend's existing `rowIndex` contract already declares
it "stable for a given file bytes + server parse run"
(`ingesta-preview-commit` spec, PREV-EXT-01); this requirement makes the
double-call case an explicit, independently tested guarantee rather than an
assumption: a test in the preview use case or parser layer MUST assert that
parsing the same file bytes twice yields an identical `rowIndex` ↔ row
mapping (same row, same `fecha`/`descripcion`/`cargo`/`abono`, at the same
index, both times).

#### Scenario: Two preview runs of the same file yield identical row identity

- GIVEN a fixture cartola file
- WHEN it is previewed twice in sequence (same bytes, two separate server parse runs)
- THEN every `rowIndex` in the second run's `filas[]` refers to the same logical row (identical `fecha`/`descripcion`/`cargo`/`abono`) as that same `rowIndex` did in the first run

## Out of Scope

- **Persisted transactions** — no retroactive reclassification of
  already-committed transactions (tracked separately, issue #331 / US-062).
  Only the in-flight preview's rows are affected by the re-run.
- **Editing or deleting** an existing categoría or its patrones from the
  preview — this change is creation-only; use `/configuracion/categorias`
  for edit/delete.
- **Mobile** (`apps/mobile`) — untouched; the "+" control and creation form
  are web-only.
- Priority editing for newly created patrones — the server default applies
  (CAT038-10).

## Testing Emphasis (ADR-014/015)

| Layer | Focus |
|-------|-------|
| Unit — "+" visibility | Hidden with no bucket chosen; visible once chosen; never rendered for duplicate rows; disabled with demo note when `esDemo` |
| Unit — creation form | Prefilled first patrón from row description; bucket read-only; add/remove entries; zero-patrones submission allowed; Escape cancels; focus enters on open, returns to trigger on close |
| Unit — save error handling | Per-patrón error placed at the correct entry via its index; form-level errors (duplicate nombre) via `mensajeDeErrorCatalogo`; nothing persisted, form stays open |
| Unit/Integration — save success orchestration | Originating row's edit set to new id even with zero matching patrones; catalog query invalidated; preview re-run called with the same `File`; prior edits preserved through the re-run |
| Unit — announcement | Correct count computed excluding the originating row and previously-edited rows; zero case renders a non-error message; progress readout reflects the new classified count |
| Integration — re-run failure | Prior table and edits preserved on re-run failure; created categoría still selectable; inline error shown |
| Backend/parser — rowIndex stability | Same file bytes parsed twice yield an identical `rowIndex` ↔ row mapping (WEB-PRV-18) |
