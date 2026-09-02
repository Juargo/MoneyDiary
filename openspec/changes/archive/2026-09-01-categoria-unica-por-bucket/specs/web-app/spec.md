# Delta for web-app

Source: `openspec/changes/categoria-unica-por-bucket/proposal.md` (ADR-042). Category name uniqueness
becomes per-bucket, so `nombre` alone no longer identifies one row. `ReclasificarCategoriaControl` must
carry `categoria.id` through local state instead of `nombre`. No label changes in any selector — the
existing `<optgroup>` grouping (WCAT-04) stays the sole disambiguator.

## ADDED Requirements

### Requirement: WDM-10 — Reclassify control is id-keyed end-to-end (ADR-042)

`ReclasificarCategoriaControl` MUST identify each categoría by its `id`, not its `nombre`, throughout
local state, the `<select>`'s `value`/`onChange`, each `<option>`'s `key` and `value`, and the request
body sent to `PATCH /api/transacciones/:id/categoria` (`{ categoriaId }`). This MUST hold even when two of
the caller's categorías share the same `nombre` in different buckets — the `<optgroup>` grouping (WCAT-04)
remains the sole visual disambiguator; no label suffix (e.g. `"Transporte (Gustos)"`) is introduced. The
cross-bucket confirmation dialog (WCAT-04, D-05) MUST derive its money-move copy from the SELECTED row's
own `bucket` field, never from a name-based lookup of local state.

#### Scenario: Duplicate-named categorías in different buckets each get a distinct, correct option (jsdom)

- GIVEN the caller owns "Transporte" in `Necesidades` and "Transporte" in `Deseos`
- WHEN the reclassify `<select>` is rendered
- THEN each `<option>` has a distinct `key` and `value` (its own id), and both appear under their
  respective `<optgroup>` with no suffix added to either label

#### Scenario: Selecting a duplicate-named categoría sends its exact id and shows the correct confirmation (jsdom)

- GIVEN the two same-named categorías above, and the transaction is currently in `Necesidades`
- WHEN the user selects the `Deseos` "Transporte" option
- THEN the cross-bucket confirmation names `Deseos` as the destination
- WHEN the user confirms
- THEN the `PATCH` request body is `{ categoriaId: <Deseos "Transporte" id> }` — never the `Necesidades`
  id, and never a `nombre` field

### Requirement: WDM-11 — NOMBRE_DUPLICADO copy is bucket-aware (ADR-042)

The `mensajes-catalogo.ts` closed code map's `NOMBRE_DUPLICADO` row (part of the WCTG-12 12-code table)
MUST render the exact literal `'Ya tienes una categoría con ese nombre en ese bucket.'`, replacing the
prior bucket-blind wording. The mapping selection mechanism (by `code` alone, `Record<CodigoCatalogo,
string>` totality) is unchanged from WCTG-12.
(Previously: `NOMBRE_DUPLICADO` rendered `'Ya tienes una categoría con ese nombre.'`.)

#### Scenario: The exact bucket-aware string renders on a 409 (jsdom)

- GIVEN a `409` response with `code: "NOMBRE_DUPLICADO"`, from either the category-create path or the
  re-bucket-only PATCH path (CAT038-03)
- WHEN the client maps it to copy
- THEN the rendered string is exactly `'Ya tienes una categoría con ese nombre en ese bucket.'`, never
  `body.message`
