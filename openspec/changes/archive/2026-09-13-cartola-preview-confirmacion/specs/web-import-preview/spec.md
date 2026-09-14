# Delta for Web Import Preview — Explicit Decision Step (Subir tal cual / Revisar y editar)

**Change**: `cartola-preview-confirmacion`
**Capability**: `web-import-preview` (extends `openspec/specs/web-import-preview/spec.md`)

## Purpose

Web's preview currently opens the editable row table directly. This delta inserts an
explicit binary decision step between a successful preview and the editable table:
"Subir tal cual" (commit immediately with zero edits) or "Revisar y editar" (the
existing editable table, reached only through this choice, with its existing
inline-editing and inline-categoría-creation behavior unchanged). "Descartar" remains
available throughout. Presentation-only (ADR-024): no backend or contract change.

## MODIFIED Requirements

### Requirement: WEB-PRV-02 — Preview result renders resumen and an explicit decision step before any editable table

Upon a successful preview response, the system MUST render:

1. A `resumen` header showing `totalFilas`, `duplicadosDetectados`, and `nuevas` (from `resumen.*`).
2. A "nothing has been saved yet" affordance, visible to the user.
3. An explicit decision step with two actions — "Subir tal cual" and "Revisar y editar"
   (WEB-PRV-19) — plus "Descartar" (WEB-PRV-07). No row table is rendered at this step.

Selecting "Revisar y editar" transitions to a table covering **every** row in `filas[]`
— no pagination, no row limit (CA-02, product decision 4). Each row MUST display:
`fecha`, `descripcion`, `cargo` (formatted via `formatearMontoCLP`), `abono` (formatted
via `formatearMontoCLP`), suggested classification from `sugerido`, and duplicate status.

The client MUST NOT recompute, re-derive, re-parse, or perform arithmetic on any amount
— only render what the backend returned, applying `formatearMontoCLP` as a display-only
transformation (ADR-024). `formatearMontoCLP` is a presentation helper, not a
business-logic computation.

If a valid draft is restored from `sessionStorage` (an in-progress review that already
has `edits` recorded from a prior "Revisar y editar" session, matched to the re-picked
file's identity), the system MUST skip the decision step and render the editable table
directly, pre-populated with the restored `edits` — the user already chose to review.

(Previously: rendered the editable table directly on preview success, with no decision
step and no distinction between a fresh preview and a restored draft.)

#### Scenario: Resumen header shows correct counts

- GIVEN the preview response has `resumen.totalFilas=120`, `duplicadosDetectados=20`, `nuevas=100`
- WHEN the review step is displayed
- THEN the UI shows "120 filas", "20 duplicados", "100 nuevas" (or equivalent labels)
- AND the "nothing saved yet" affordance is visible

#### Scenario: Decision step renders with no table

- GIVEN a successful preview response with no restored draft
- WHEN the review step is displayed
- THEN the resumen header and the "Subir tal cual" / "Revisar y editar" / "Descartar" actions are visible
- AND no row table is rendered

#### Scenario: All filas are rendered without truncation once reviewing

- GIVEN the preview response contains 250 rows in `filas[]`
- WHEN the user selects "Revisar y editar"
- THEN all 250 rows are displayed without pagination controls

#### Scenario: Amount fields are rendered formatted via the presentation helper

- GIVEN a row with `cargo: "150000"` and `abono: "0"` in the review table
- WHEN the row renders
- THEN the UI displays the amounts formatted via `formatearMontoCLP` (the existing presentation helper, e.g. `"$ 150.000"`)
- AND no BigInt math, no re-computation, and no re-derivation is performed by the client (ADR-024)
- AND the raw backend string is never re-parsed, re-rounded, or re-computed — `formatearMontoCLP` is a display-only transformation applied to the string value as received

#### Scenario: A restored draft skips the decision step

- GIVEN a valid `sessionStorage` draft exists from a prior "Revisar y editar" session, and the re-picked file's identity matches it
- WHEN the preview response arrives
- THEN the system renders the editable table directly, pre-populated with the restored `edits`
- AND the decision step is not shown

---

### Requirement: WEB-PRV-06 — Commit sends the edits overlay and lands on the `exito` confirmation, triggered from either "Subir tal cual" or "Agregar transacciones"

Two actions MUST trigger a `multipart/form-data` request to `POST /api/ingestas/commit`
with:
- `file`: the same `File` object held from the upload step.
- `edits`: a JSON string of `[{ rowIndex: number, categoriaId: string | null }]`.

1. **"Subir tal cual"** (WEB-PRV-19), clicked directly from the decision step — MUST
   send `edits: []` (an empty array); the user never reached the row-level cascade
   selects.
2. **"Agregar transacciones"**, clicked from the review table (reached via "Revisar y
   editar") — MUST send `edits` covering only the rows the user edited (excluding
   unedited and duplicate rows), unchanged from prior behavior.

On success (either trigger), the system MUST invalidate the dashboard query keys
(`['resumen']`, `['resumen-anual']`, `['detalle-bucket-mes']`, `['ingestas']`) and
transition to the `exito` landing state (`SubirCartola.tsx`) — a real, non-auto-navigating
confirmation screen, not a transient panel. `exito` MUST show the committed-row count
and bank already held in memory (no new computation) plus the month's semáforo verdict
fetched from `useResumen` and rendered verbatim (ADR-024 — `derivarMesDominante` only
picks which month to request, it does not compute the verdict). `exito` MUST present two
explicit actions: "Ver resumen del mes" (navigates to the dashboard for the derived
month) and "Subir otra cartola" (resets the flow to `idle` in place, no navigation). The
system MUST NOT auto-navigate away from `exito`.

(Previously: only reachable from the review table's "Agregar transacciones" button;
always carried whatever edits the user had made, possibly none; this delta's own prior
text additionally said commit auto-navigated to `/` with no success panel — corrected
here to match the shipped peak-end `exito` landing.)

#### Scenario: "Subir tal cual" commits with an empty edits overlay

- GIVEN the user is at the decision step after a successful preview
- WHEN the user clicks "Subir tal cual"
- THEN `POST /api/ingestas/commit` is called with `file` and `edits: []`
- AND the request is multipart/form-data

#### Scenario: Commit sends file and edits overlay (review-table path)

- GIVEN the user has edited categoría for row 3 to "cat_manual" and left all others unchanged
- WHEN the user clicks "Agregar transacciones"
- THEN `POST /api/ingestas/commit` is called with `file` and `edits: [{"rowIndex":3,"categoriaId":"cat_manual"}]`
- AND the request is multipart/form-data

#### Scenario: Successful commit invalidates dashboard queries and lands on `exito` (either trigger)

- GIVEN the commit response is 201, from either "Subir tal cual" or "Agregar transacciones"
- WHEN the success callback runs
- THEN the query keys `['resumen']`, `['resumen-anual']`, `['detalle-bucket-mes']`, `['ingestas']` are invalidated
- AND the screen transitions to the `exito` landing state, showing the committed-row confirmation and the month's semáforo verdict
- AND no automatic navigation to `/` occurs

#### Scenario: `exito` offers "Ver resumen del mes" and "Subir otra cartola"

- GIVEN the screen is on the `exito` landing state after a successful commit
- WHEN the user views the available actions
- THEN "Ver resumen del mes" and "Subir otra cartola" are both present
- AND clicking "Ver resumen del mes" navigates to the dashboard for the derived month
- AND clicking "Subir otra cartola" resets the flow to `idle` in place, without navigating

#### Scenario: Rows without user edits are not included in the edits overlay

- GIVEN the user edited only row 5 and left all other rows unmodified
- WHEN the edits overlay is assembled for the commit request
- THEN the overlay contains only `{ rowIndex: 5, categoriaId: <chosen> }`
- AND duplicate rows are excluded from the overlay regardless of any disabled-select state

#### Scenario: Commit 400 error — review table and edits are preserved for retry

- GIVEN the user has edited rows and clicked "Agregar transacciones"
- WHEN `POST /api/ingestas/commit` returns a 400 with `body.message: "Ediciones inválidas"`
- THEN the review table REMAINS rendered with all rows and edits intact
- AND an inline descriptive error message "Ediciones inválidas" appears in the `role="alert"` region
- AND the "Agregar transacciones" button is accessible so the user can retry with the same file and same edits
- AND the file picker is re-enabled so the user can pick a new file (which resets the flow)
- AND no page reload occurs

#### Scenario: Commit 500 error — same preserve-and-retry behavior

- GIVEN the user has edited rows and clicked "Agregar transacciones"
- WHEN `POST /api/ingestas/commit` returns a 500 (infrastructure fault)
- THEN the review table REMAINS rendered with all rows and edits intact
- AND an inline error message appears in the `role="alert"` region
- AND the user can retry the commit or pick a new file without losing their edits

#### Scenario: Picking a new file after a commit error resets the flow

- GIVEN the commit returned a 400 error and the review table is still rendered
- WHEN the user picks a new file via the file input
- THEN `handleFileChange` clears the edits map and resets both mutations
- AND a new preview request is sent for the new file
- AND the previous edits do NOT appear in the new review table

#### Scenario: "Subir tal cual" error keeps the decision step visible for retry

- GIVEN the user clicked "Subir tal cual" and the commit returned a 400 or 500
- WHEN the failure is handled
- THEN the decision step remains visible with "Subir tal cual", "Revisar y editar", and "Descartar" available
- AND an inline error message appears in the `role="alert"` region
- AND the user can retry "Subir tal cual", switch to "Revisar y editar", or pick a new file

---

### Requirement: WEB-PRV-07 — "Descartar" clears the flow and returns to the dashboard, from either the decision step or the review table

Clicking "Descartar" — available both at the decision step (WEB-PRV-02, WEB-PRV-19)
and at the review table (reached via "Revisar y editar") — MUST reset the state machine
(clear the held `File` and `edits` map, return to `idle`) and navigate to `/`. Because
preview writes nothing, no server-side cleanup is needed.

(Previously: only available from the review table.)

#### Scenario: Discard resets state and navigates away (from the review table)

- GIVEN the user is on the review table after selecting "Revisar y editar"
- WHEN the user clicks "Descartar"
- THEN the state machine returns to `idle` (File and edits cleared)
- AND the router navigates to `/`
- AND no `POST /api/ingestas/commit` request is sent

#### Scenario: Discard resets state and navigates away (from the decision step)

- GIVEN the user is at the decision step after a successful preview, before choosing "Revisar y editar"
- WHEN the user clicks "Descartar"
- THEN the state machine returns to `idle` (File and edits cleared)
- AND the router navigates to `/`
- AND no `POST /api/ingestas/commit` request is sent

#### Scenario: Edits do not survive a discard-then-reupload cycle

- GIVEN the user edited some rows, then discarded, then uploaded a new file
- WHEN the new preview response arrives
- THEN the `edits` map is empty (edits from the previous session are gone)

## ADDED Requirements

### Requirement: WEB-PRV-19 — Decision step actions are explicit and accessible

The decision step MUST present exactly two commit-path actions — "Subir tal cual" and
"Revisar y editar" — plus "Descartar" (WEB-PRV-07). Each control MUST have an
accessible name identifying its action (visible text is sufficient). "Revisar y editar"
MUST be the only path that renders the editable table (WEB-PRV-02); the review table's
inline editing (bucket/categoría cascade, WEB-PRV-05) and inline categoría creation
(WEB-PRV-12–18) remain reachable only after this transition.

#### Scenario: Both actions are present and labeled

- GIVEN a successful preview with no restored draft
- WHEN the decision step renders
- THEN a "Subir tal cual" button and a "Revisar y editar" button are both present with accessible names matching their visible text

#### Scenario: "Revisar y editar" is the only path to the editable table

- GIVEN the decision step is showing
- WHEN the user clicks "Revisar y editar"
- THEN the editable review table (WEB-PRV-02) renders
- AND clicking "Subir tal cual" instead never renders that table
