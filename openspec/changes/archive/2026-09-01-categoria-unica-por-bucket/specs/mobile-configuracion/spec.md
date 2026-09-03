# Delta for mobile-configuracion

Source: `openspec/changes/categoria-unica-por-bucket/proposal.md` (ADR-042). The proposal's Affected Areas
list names `apps/mobile/src/domain/mensajes-catalogo.ts` as modified, but its Capabilities table omits
this domain — this delta closes that gap so the copy pin (settled decision 6) is testable. See `risks` in
the sdd-spec return envelope.

> **Archive-time note (sdd-archive, 2026-09-01):** this delta labeled its requirement `MCTG-07`, which
> collided with a pre-existing, unrelated canonical requirement also named `MCTG-07` ("Dashboard refresh
> after a bucket change", added by an earlier change). When merging into `openspec/specs/mobile-configuracion/spec.md`,
> `sdd-archive` renumbered this requirement to `MCTG-09` to avoid the collision. No requirement content was
> altered by the rename — see the canonical spec and the archive report for details.

## ADDED Requirements

### Requirement: MCTG-07 — NOMBRE_DUPLICADO copy is bucket-aware (ADR-042)

The mobile `mensajes-catalogo.ts` closed code map's `NOMBRE_DUPLICADO` row (part of the MCTG-06 12-code
table) MUST render the exact literal `'Ya tienes una categoría con ese nombre en ese bucket.'`, replacing
the prior bucket-blind wording. The mapping selection mechanism (by `code` alone) is unchanged from
MCTG-06.
(Previously: `NOMBRE_DUPLICADO` rendered `'Ya tienes una categoría con ese nombre.'`.)

#### Scenario: The exact bucket-aware string renders on a 409 (RNTL)

- GIVEN a `409` response with `code: "NOMBRE_DUPLICADO"`
- WHEN the client maps it to copy
- THEN the rendered string is exactly `'Ya tienes una categoría con ese nombre en ese bucket.'`, never
  `body.message`
