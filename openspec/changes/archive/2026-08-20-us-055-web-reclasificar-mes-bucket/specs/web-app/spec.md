# Delta for web-app

Source: `openspec/changes/us-055-web-reclasificar-mes-bucket/proposal.md` (US-055, issue #289).
All changes are scoped to `apps/web` only — no backend, no contract, no migration. Decisions D-01..D-05
are pinned and drive every requirement below.
Scenario labels follow the repo precedent: **(jsdom)** = DOM/text/accessible-name truth;
**(Playwright)** = rendered geometry at a real viewport.

## MODIFIED Requirements

### Requirement: WCAT-04 — Reclassify control is active, data-driven, and updates data on success

The per-row reclassify control MUST no longer be a disabled placeholder: activating it MUST let the user
choose a categoría (offered as the caller's own categorías whose bucket is in `BUCKETS_ASIGNABLES`
— `Necesidades`, `Deseos`, `Ahorro` — grouped by bucket via `<optgroup>`, sourced from `useCategorias()`,
never a hardcoded list) and call the `categorias-api` reclassify endpoint. `ReclasificarCategoriaControl`
MUST derive the destination bucket from the chosen categoría's own `bucket` field in the DTO, not a static
name→bucket map. When the chosen categoría's bucket differs from the transaction's current bucket, the
control MUST show a confirmation naming the exact money move (e.g. "Esto mueve $X de Deseos a Necesidades")
before committing; the `role="alertdialog"` element MUST carry `aria-describedby` pointing at the
money-move `<p>` message, focus MUST move to the Confirmar button on open, and focus MUST return to the
`<select>` on cancel or Escape (D-05). Same-bucket reclassification MUST commit immediately without a
confirmation step. On success, the page's group list AND the resumen (pie/traffic-light) MUST refresh; on a
cross-bucket move, the page-owned `role="status"` region (D-04) MUST announce «Movida a {bucket}.»
where `{bucket}` is the destination bucket's display label (`ETIQUETA_BUCKET[bucketNuevo]`, e.g. `Gustos` for `Deseos`); no announcement is made for same-bucket moves. The region text is visible to sighted users and screen readers from the same node (no separate sr-only span); it persists until replaced by a subsequent cross-bucket move or page unmount.
The SinCategoria "Clasificar" CTA MUST behave the same way via the same control. A categoría created,
renamed, or deleted through `/configuracion/categorias` MUST be reflected here with no code change.
(Previously: the offered set was "ALL of the caller's own categorías, grouped by bucket" — now restricted
to categorías in `BUCKETS_ASIGNABLES` only (D-02), removing the `agruparPorBucket` "Otros" catch-all group
from this render; and on a cross-bucket move no page-owned feedback region existed (D-04); and the
`alertdialog` had no `aria-describedby` (D-05).)

#### Scenario: A successful within-bucket reclassify updates the group counts (jsdom)

- GIVEN a transaction shown under "Delivery" in the Deseos page's group list
- WHEN the user reclassifies it to "Streaming" via the control
- THEN it commits immediately (no confirmation dialog), moves to the "Streaming" group, and both groups'
  counts/subtotals update, with no change to the Deseos pie slice

#### Scenario: A cross-bucket reclassify requires confirmation and then updates the resumen (jsdom)

- GIVEN a transaction shown under Deseos is being reclassified to a Necesidades categoría
- WHEN the user selects the target categoría
- THEN a confirmation naming the money move is shown before anything commits
- WHEN the user confirms
- THEN the transaction disappears from the Deseos page and the resumen/traffic-light reflects the updated
  bucket totals

#### Scenario: Cancelling a cross-bucket confirmation leaves the UI unchanged (jsdom)

- GIVEN the cross-bucket confirmation dialog is showing
- WHEN the user cancels (or presses Escape)
- THEN no request is sent, the transaction stays in its original group, and focus returns to the `<select>`

#### Scenario: A failed reclassify leaves the UI unchanged (jsdom)

- GIVEN the reclassify endpoint returns an error (e.g. cross-tenant/invalid categoría)
- WHEN the user attempts the reclassify
- THEN the transaction stays in its original group and an error is communicated to the user

#### Scenario: A just-created categoría is offered by the dropdown immediately (jsdom)

- GIVEN a user creates categoría "Mascotas" in Necesidades via `/configuracion/categorias`
- WHEN they open the reclassify control on any transaction
- THEN "Mascotas" appears under the "Necesidades" optgroup, via the existing `['categorias']` cache — no code change

#### Scenario: A deleted categoría is no longer offered (jsdom)

- GIVEN a user deletes categoría "Delivery" via `/configuracion/categorias`
- WHEN they return to the Detalle MES-BUCKET page and open the reclassify control
- THEN "Delivery" no longer appears in the dropdown

#### Scenario: A re-bucketed categoría triggers the confirmation correctly (jsdom)

- GIVEN a user moves categoría "Supermercado" from Necesidades to Deseos via the edit screen
- WHEN they reclassify a Necesidades transaction to "Supermercado" on the Detalle MES-BUCKET page
- THEN the cross-bucket confirmation fires (Necesidades→Deseos), because the dropdown derives the bucket
  from the live DTO, not a stale map

#### Scenario: The offered groups are exactly the 3 spend buckets — no "Otros" group (jsdom)

- GIVEN the user opens the reclassify `<select>` on any transaction row
- WHEN the rendered `<optgroup>` elements are enumerated
- THEN exactly three groups are present: `Necesidades`, `Deseos`, and `Ahorro` — no "Otros" group renders,
  and no Ingresos-bucket category is offered (D-02)

#### Scenario: Cross-bucket move announces the destination in the page-owned region (jsdom)

- GIVEN a transaction on the Necesidades page
- WHEN the user reclassifies it to a Deseos categoría and confirms
- THEN the page-owned `role="status"` region announces «Movida a Gustos.» (`ETIQUETA_BUCKET` display label — the non-trivial mapping: wire `Deseos` renders as `Gustos`, so a raw-key implementation fails this scenario) — a region that is NOT inside the row component and therefore survives the row's removal from the DOM; the text is visible to sighted users and to screen readers from the same node (D-04)

#### Scenario: Same-bucket reclassify does NOT trigger an announcement (jsdom)

- GIVEN a transaction on the Deseos page
- WHEN the user reclassifies it to a different Deseos categoría (same bucket)
- THEN the page-owned `role="status"` region does NOT announce «Movida a {bucket}.» — only cross-bucket moves
  produce an announcement; the region content remains unchanged (D-04)

#### Scenario: A subsequent cross-bucket move replaces the prior announcement (jsdom)

- GIVEN the page-owned region already holds «Movida a Necesidades.» from a prior move
- WHEN the user completes a second cross-bucket reclassify targeting Ahorro
- THEN the region content becomes «Movida a Ahorro.» — the prior announcement is replaced, not appended; persists until the next move or page unmount (D-04)

#### Scenario: alertdialog has aria-describedby pointing at the money-move message (jsdom)

- GIVEN the cross-bucket confirmation dialog is open
- WHEN the `alertdialog` element is inspected
- THEN it carries `aria-describedby` whose value resolves to the `<p>` element containing the money-move
  sentence (e.g. "Esto mueve $X de Deseos a Necesidades"), and focus is on the Confirmar button (D-05)

#### Scenario: Focus returns to the select after dialog close (jsdom)

- GIVEN the cross-bucket confirmation dialog was opened and then cancelled via Escape or the cancel button
- WHEN the dialog closes
- THEN focus is on the `<select>` that triggered the confirmation — not on the page body or any other element

#### Scenario: SinCategoria row reclassifies and its row leaves the destacado group (jsdom)

- GIVEN `/buckets/SinCategoria?periodo=2026-07&destacar=…` with one uncategorized transaction
- WHEN the user uses the "Clasificar" CTA to reclassify it to "Supermercado" (Necesidades)
- THEN the invalidation runs as defined by WDM-07, the page refetches, and the previously uncategorized row
  no longer appears in the Sin categoría group (CA-04; no new page is navigated to)

### Requirement: WDM-07 — Reclassify is ported per row with a complete 4-key invalidation set (decision 1, D-03)

The page MUST port `ReclasificarCategoriaControl` per transaction row with the WCAT-04/05 behavior
(including the US-055 refinements). `useReclasificarCategoria` MUST invalidate exactly 4 keys on success:
`['resumen', clave]`, `['detalle-bucket-mes', bucket, clave]`, `['resumen-anual']` (prefix — no period
segment appended), and `['ingresos-mes']` (prefix — no period segment appended, D-03). The
`['ingresos-mes']` key prefix-matches `useIngresosMes`'s query key `['ingresos-mes', periodo ?? 'actual']`
at position 0. A successful reclassify on the page MUST refresh the page's own query AND the ingresos cache.
(Previously: the invalidation set was 3 keys — `['resumen', clave]`, `['detalle-bucket-mes', bucket, clave]`,
`['resumen-anual']` — the `['ingresos-mes']` prefix was missing, leaving the ingresos page stale after a
reclassify that shifts a transaction into or out of an Ingresos-type classification path, D-03.)

#### Scenario: A successful reclassify invalidates all 4 keys — including ingresos-mes (jsdom)

- GIVEN a transaction row on `/buckets/Deseos`
- WHEN a reclassify mutation succeeds
- THEN exactly 4 cache invalidations fire: `['detalle-bucket-mes', 'Deseos', clave]`,
  `['resumen', clave]`, `['resumen-anual']`, and `['ingresos-mes']` — asserted as a count of 4 in the
  jsdom test; the pre-existing 3-key assertion MUST be updated RED-first to 4 (D-03, strict TDD)

## ADDED Requirements

### Requirement: WDM-09 — Category CRUD invalidation includes ingresos-mes (D-03)

`invalidarCatalogoYDashboard` in `categorias-invalidacion.ts` MUST invalidate exactly 5 keys when a
category mutation (create, rename, re-bucket, or delete) resolves: `['categorias']`, `['resumen']`,
`['resumen-anual']`, `['detalle-bucket-mes']`, and `['ingresos-mes']` (all prefix-form — no period or bucket
segment appended). A category re-bucket shifts which transactions count as income in the 50/30/20 grouping,
so `['ingresos-mes']` MUST be stale-marked. The existing WCTG-09 asymmetric invalidation rule (pattern
mutations invalidate only `['categorias']`, category mutations invalidate the broader set) is unchanged;
only the category-mutation set grows from 4 to 5 keys.
(New — the missing `['ingresos-mes']` key was identified as a correctness gap in the proposal, D-03. The
category-CRUD path was left at 4 keys by US-053/US-038; this requirement closes it.)

#### Scenario: A category mutation invalidates exactly 5 keys including ingresos-mes (jsdom)

- GIVEN a category is created, renamed, re-bucketed, or deleted
- WHEN the mutation resolves via `invalidarCatalogoYDashboard`
- THEN exactly 5 cache invalidations fire: `['categorias']`, `['resumen']`, `['resumen-anual']`,
  `['detalle-bucket-mes']`, and `['ingresos-mes']` — asserted as a count of 5 in
  `categorias-invalidacion.test.ts`; the existing "4 claves" assertion MUST be updated RED-first to 5
  (strict TDD, D-03)

#### Scenario: A pattern mutation still invalidates only categorias — not ingresos-mes (jsdom)

- GIVEN a pattern is added, edited, or deleted
- WHEN the mutation resolves
- THEN `['ingresos-mes']` is NOT invalidated — the pattern-mutation exclusion from WCTG-09 extends to this
  key; the test MUST assert this explicitly, not infer it from absence

#### Scenario: Anti-enumeration — no business logic on the client side of category CRUD (ADR-024)

- GIVEN `invalidarCatalogoYDashboard`'s implementation
- WHEN it is inspected
- THEN it contains no client-side classification, bucket-membership, or income-type computation — it
  invalidates by prefix, letting the server's next response determine correct data
