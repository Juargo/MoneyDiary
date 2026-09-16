# Delta for Mobile Configuracion

## MODIFIED Requirements

### Requirement: MCTG-01 — Catálogo list grouped by bucket (mirrors WCTG-02/03)

The Categorías tab MUST list categories grouped in fixed order
`Necesidades → Gustos → Ahorro` (wire value `Deseos` displayed as `Gustos`),
each row showing a bucket-colored icon badge (the category's `icono`, or the generic fallback when
null — `categoria-icono` CATICO-06), a pattern-count tag (`sin patrones` / `1 patrón` /
`N patrones`), and a `Nueva categoría` entry point.
(Previously: rows showed only the pattern-count tag and entry point — no icon badge.)

#### Scenario: Groups render in fixed order with the display label

- GIVEN categories across all three buckets
- WHEN the list renders
- THEN groups appear `Necesidades`, `Gustos`, `Ahorro`, in that order

#### Scenario: Pattern-count tag has three grammatical forms

- GIVEN categories with 0, 1, and 3 patterns
- WHEN their tags render
- THEN they read `sin patrones`, `1 patrón`, `3 patrones` respectively

#### Scenario: A category with an icono renders it on a bucket-colored badge

- GIVEN a category in `Necesidades` with `icono: "house"`
- WHEN its row renders
- THEN the badge shows the `house` icon on the `Necesidades` bucket color token

#### Scenario: A category with no icono renders the generic fallback badge

- GIVEN a category with `icono: null`
- WHEN its row renders
- THEN the badge shows the generic fallback icon

### Requirement: MCTG-06 — Catálogo error copy closed table plus demo defensive mapping (mirrors WCTG-12, CQ-4)

Copy MUST be a `Record<CodigoCatalogo, string>` over the same 13 codes web
uses (verbatim strings, including `ICONO_INVALIDO`), selected by `code` alone. `403 DEMO_SOLO_LECTURA`
MUST map defensively to the same copy row; no proactive disabled-controls
layer is built (mobile cannot hold a demo session today — YAGNI).
(Previously: the table covered the same 12 codes web used before `ICONO_INVALIDO` existed.)

#### Scenario: An unmapped code fails to compile

- GIVEN a new `CodigoCatalogo` member with no table row
- WHEN the mapping is type-checked
- THEN `tsc` fails

#### Scenario: A defensive 403 still renders mapped copy

- GIVEN a mutation somehow receives `403 DEMO_SOLO_LECTURA`
- WHEN it is mapped
- THEN the closed table's demo row renders, not a generic fallback

#### Scenario: ICONO_INVALIDO renders mapped copy, not a generic fallback

- GIVEN a `400 ICONO_INVALIDO` response from `POST`/`PATCH /api/categorias`
- WHEN it is mapped
- THEN the closed table's `ICONO_INVALIDO` row renders

## ADDED Requirements

### Requirement: Category create/edit screens include an accessible icon picker as part of the identity draft (mirrors web icon picker)

`Nueva categoría` (MCTG-02) and the edit screen's identity draft (MCTG-03) MUST include an icon
picker over the curated allowlist (`categoria-icono` CATICO-01) plus a "no icon" option, rendered
with `lucide-react-native` components. A selection MUST travel with the identity payload: `POST
/api/categorias` on create, and `PATCH /api/categorias/:id`'s `Guardar` commit on edit — never as a
separate save action. Each picker option MUST expose an `accessibilityLabel` with the icon's
human-readable name, never the raw lucide identifier (`categoria-icono` CATICO-08).

#### Scenario: Selecting an icon on create includes it in the POST body

- GIVEN the `Nueva categoría` form with `nombre`/`bucket` filled and an icon selected
- WHEN the form is submitted
- THEN `POST /api/categorias` is called with that `icono` value

#### Scenario: Changing the icon on edit sends it with Guardar, not separately

- GIVEN the edit screen with a different icon selected than the category's current one
- WHEN the user activates `Guardar`
- THEN the same `PATCH /api/categorias/:id` request that commits `Nombre`/`Bucket` also carries the
  new `icono` value

#### Scenario: Picker options expose an accessibilityLabel with a readable name

- GIVEN the icon picker renders its allowlisted options
- WHEN a screen reader inspects one option
- THEN its `accessibilityLabel` is a human-readable label, never the raw lucide identifier
