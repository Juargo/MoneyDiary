# Delta for Web App

## MODIFIED Requirements

### Requirement: WCTG-02 — CA-01 list is grouped by bucket with row actions and creation (CA-01, §3, §8)

`/configuracion/categorias` MUST list the caller's own categories grouped by bucket in the fixed order
`Necesidades`, `Deseos`, `Ahorro` — the `Deseos` group heading MUST render the display label `Gustos`
(reusing `ETIQUETA_BUCKET`, per A1), while the value sent to/read from the API stays the wire value
`Deseos`. Each row MUST show a bucket-colored icon badge (the category's `icono`, or the generic
fallback when null — `categoria-icono` CATICO-06), the categoría name, its pattern tag (WCTG-03), and
edit + delete row actions. A page-level `Nueva categoría` button MUST sit beside the title (`Nueva`
at tablet width per §8). An empty catalog MUST render a specified empty state.
(Previously: rows showed only the categoría name, pattern tag, and actions — no icon badge.)

#### Scenario: Groups render in fixed bucket order with the display label

- GIVEN a catalog with categories in all three assignable buckets
- WHEN the list renders
- THEN groups appear in order `Necesidades`, `Gustos`, `Ahorro` — the middle heading reads `Gustos`, not
  `Deseos`

#### Scenario: A deleted-all-categories user sees the empty state

- GIVEN a user with zero categories
- WHEN `/configuracion/categorias` renders
- THEN a specified empty state renders, not a broken/blank list

#### Scenario: A category with an icono renders it on a bucket-colored badge

- GIVEN a category in `Deseos` with `icono: "house"`
- WHEN its row renders
- THEN the badge shows the `house` icon on the `Deseos` bucket color token

#### Scenario: A category with no icono renders the generic fallback badge

- GIVEN a category with `icono: null`
- WHEN its row renders
- THEN the badge shows the generic fallback icon on that category's bucket color token

### Requirement: WDM-03 — Category groups render the server's order as a collapsed-by-default accordion (CA-03)

Each group MUST render a bucket-colored icon badge (the group's `icono`, or the generic fallback when
null — `categoria-icono` CATICO-06; always the fallback for the synthetic Sin categoría group), the
server's `nombre`, `conteo`, and exact `subtotal` (BigInt-safe string, never `Number()`/
`parseFloat()`), in the server's exact order — es-CL alphabetical, "Sin categoría" last (MBD-02). The
client MUST NOT re-group, re-sort, or truncate the payload. Each group MUST render as an accordion
whose heading is itself the trigger — a real button (hand-rolled, KISS — no new dependency) with
`aria-expanded`/`aria-controls`, wrapped by the group's `<h2>`. Every group MUST start COLLAPSED
regardless of its row count (the `destacar` group is the sole exception, WDM-04). Activating the
trigger MUST reveal ALL of the group's rows — there is no row-count threshold and no partial-reveal
control; collapsing hides them again. The collapsed panel MUST stay mounted (`hidden`, not
unmounted) so in-progress row control state (e.g. a reclassify/delete dialog) survives a
collapse/expand cycle.
(Previously: the group heading rendered `nombre`, `conteo`, and `subtotal` with no icon badge.)

#### Scenario: Collapsed by default, then expands to reveal every row (jsdom)

- GIVEN a group with 12 transactions
- WHEN the page renders
- THEN the trigger reads `aria-expanded="false"` and none of the group's rows are visible
- WHEN the trigger is activated
- THEN all 12 rows show and the trigger reads `aria-expanded="true"`
- WHEN the trigger is activated again
- THEN the rows hide and the trigger reads `aria-expanded="false"`

#### Scenario: A short group is ALSO collapsed by default (jsdom)

- GIVEN a group with 5 transactions
- WHEN the page renders
- THEN none of its rows are visible until the trigger is activated — the accordion default applies
  regardless of size

#### Scenario: Rendered group order matches the payload verbatim (jsdom)

- GIVEN a payload whose groups arrive ordered Ñoquis, Zapatería, "Sin categoría"
- WHEN the page renders
- THEN the rendered order is identical — no client-side re-sort

#### Scenario: A group heading renders its icono on a bucket-colored badge (jsdom)

- GIVEN a group whose category has `icono: "shopping-cart"`
- WHEN the group heading renders
- THEN the badge shows the `shopping-cart` icon on the page's bucket color token

#### Scenario: The Sin categoría group heading always renders the generic fallback (jsdom)

- GIVEN the synthetic Sin categoría group (`icono` always `null`, MBD-02)
- WHEN its heading renders
- THEN the badge shows the generic fallback icon

## REMOVED Requirements

### Requirement: WCTG-12 — Error and success copy is a closed table over 11 codes plus BODY_INVALIDO (§8)

(Reason: the closed code table grows from 11 to 12 domain codes — `ICONO_INVALIDO` is added by this
change — so the requirement's title, which encodes the exact count, changes. This is a rename, not a
pure edit: the archive composer matches MODIFIED by exact canonical title, so a count change must be
expressed as REMOVED + ADDED rather than MODIFIED.)
(Migration: replaced verbatim, with the same body and all pre-existing scenarios preserved plus one
new scenario, by "WCTG-12 — Error and success copy is a closed table over 12 codes plus BODY_INVALIDO
(§8)" under `## ADDED Requirements` below.)

## ADDED Requirements

### Requirement: WCTG-12 — Error and success copy is a closed table over 12 codes plus BODY_INVALIDO (§8)

Error copy MUST be a closed table covering exactly the 12 codes the deployed catalog API returns
(`NOMBRE_INVALIDO`, `BUCKET_NO_ASIGNABLE`, `PATRON_INVALIDO`, `MATCH_TYPE_INVALIDO`, `REGEX_INVALIDA`,
`PRIORIDAD_INVALIDA`, `DEMO_SOLO_LECTURA`, `CATEGORIA_NO_ENCONTRADA`, `PATRON_NO_ENCONTRADO`,
`NOMBRE_DUPLICADO`, `PATRON_DUPLICADO`, `ICONO_INVALIDO`), plus one `BODY_INVALIDO` row for a
malformed response body (mirroring the `tag: 'parse'` `ApiError` case) — 13 codes total. The
mapping's selection key MUST be `code` ALONE, never `(status, code)` and never a server-supplied
message string, and totality MUST be enforced with a `Record<CodigoCatalogo, string>` over the
closed 13-member code union — NOT a `switch` + `never` on the code axis — so that adding a code
without a row fails `tsc` directly.
(Previously — as `WCTG-12 — Error and success copy is a closed table over 11 codes plus BODY_INVALIDO
(§8)`, see `## REMOVED Requirements` above: the closed table covered 11 codes plus `BODY_INVALIDO`,
12 total — `ICONO_INVALIDO` did not exist.)

Separately, on a DIFFERENT axis, the function that dispatches on the raw `ApiError` union's `tag` (5
members: `network`, `unauthorized`, `parse`, `invalid`, `server`) MUST itself be a closed `switch` +
`never` exhaustiveness guard, so a sixth `ApiError` tag is a compile error, not a silent fallthrough.
Both guards are required and neither replaces the other. In particular, `tag: 'parse'` — the shape
produced when a 2xx response body fails runtime DTO validation — MUST map to the `BODY_INVALIDO` row
of the code table above.

#### Scenario: Every one of the 12 codes maps to fixed client copy

- GIVEN each of the 12 documented `status:code` responses in turn
- WHEN it is mapped to UI copy
- THEN a fixed, closed-table string renders — never the server's own `message` field

#### Scenario: A malformed response body maps to the `BODY_INVALIDO` row

- GIVEN a response that fails runtime DTO validation (not a documented error code)
- WHEN it is mapped
- THEN the `BODY_INVALIDO` row's copy renders

#### Scenario: `ApiError` tag `parse` maps to `BODY_INVALIDO`, not the generic fallback

- GIVEN an `ApiError` with `tag: 'parse'` (no `code` field at all)
- WHEN the `ApiError`-dispatch `switch` maps it to UI copy
- THEN the `BODY_INVALIDO` row's copy renders — never the generic fallback string

#### Scenario: An unmapped code fails to compile

- GIVEN a hypothetical new `CodigoCatalogo` member added to the closed union without a corresponding
  row in the `Record<CodigoCatalogo, string>` table
- WHEN the mapping table is type-checked
- THEN `tsc` fails to compile — never a silent runtime fallback

#### Scenario: ICONO_INVALIDO maps to fixed copy, not the generic fallback

- GIVEN a `400 ICONO_INVALIDO` response from `POST`/`PATCH /api/categorias`
- WHEN it is mapped to UI copy
- THEN the `ICONO_INVALIDO` row's fixed string renders

### Requirement: Category create/edit forms include an accessible icon picker as part of the identity draft

The `Nueva categoría` creation flow and the edit screen's identity draft (WCTG-04) MUST include an
icon picker offering the curated allowlist (`categoria-icono` CATICO-01) plus a "no icon" option. A
selection MUST travel with the identity payload: `POST /api/categorias` on create, and `PATCH
/api/categorias/:id`'s `Guardar` commit on edit (`categoria-icono` CATICO-02/03) — never as a
separate save action. Each picker option MUST expose a human-readable accessible name, never the raw
lucide identifier (`categoria-icono` CATICO-08).

#### Scenario: Selecting an icon on create includes it in the POST body

- GIVEN the `Nueva categoría` form with `nombre`/`bucket` filled and an icon selected
- WHEN the form is submitted
- THEN `POST /api/categorias` is called with that `icono` value

#### Scenario: Changing the icon on edit sends it with Guardar, not separately

- GIVEN the edit screen with a different icon selected than the category's current one
- WHEN the user activates `Guardar`
- THEN the same `PATCH /api/categorias/:id` request that commits `Nombre`/`Bucket` also carries the
  new `icono` value

#### Scenario: Picker options expose readable accessible names

- GIVEN the icon picker renders its allowlisted options
- WHEN an assistive-technology user inspects one option
- THEN its accessible name is a human-readable label, never the raw lucide identifier
