# Delta for mobile-detalle-mes

Source: `openspec/changes/categoria-unica-por-bucket/proposal.md` (ADR-042). Same identity-model change as
`web-app` WDM-10, applied to `ReclasificarMobileControl`. The bucket-sectioned Modal (MDET-05) stays the
sole disambiguator — no label change.

## ADDED Requirements

### Requirement: MDET-08 — Reclassify control is id-keyed end-to-end (ADR-042)

`ReclasificarMobileControl` MUST identify each categoría by its `id`, not its `nombre`: the
`esCategoriaActual` check (the "● actual" badge, MDET-05), each row's `testID` and `onPress` identity, and
the reclassify request body (`{ categoriaId }`) MUST all key on `id`. This MUST hold even when two of the
caller's categorías share the same `nombre` in different bucket sections — the bucket-sectioned Modal
(MDET-05) remains the sole visual disambiguator; no label suffix is introduced.

#### Scenario: Exactly one row shows the "actual" badge when two categorías share a nombre (RNTL)

- GIVEN the caller owns "Transporte" in `Necesidades` (the transaction's current categoría, id `A`) and
  "Transporte" in `Deseos` (id `B`)
- WHEN the reclassify Modal opens
- THEN only the `Necesidades` "Transporte" row (id `A`) renders the "● actual" badge; the `Deseos`
  "Transporte" row does not

#### Scenario: Selecting the duplicate-named row in the other bucket sends its exact id (RNTL)

- GIVEN the same fixture, with the transaction currently in `Necesidades`
- WHEN the user selects the `Deseos` "Transporte" row and confirms the cross-bucket Alert (MDET-05)
- THEN the API call is made with `{ categoriaId: "B" }`, and the money-move copy names `Deseos` as the
  destination
