# Delta for User Data Isolation — Semáforo Detail Endpoint Coverage (US-049)

Source: `openspec/changes/us-049-semaforo-detalle/proposal.md` (US-049, issue #283).
`GET /api/resumen/semaforo` is a 5th data-bearing endpoint (`resumen-semaforo` capability, this
same change) that re-exposes user-scoped data (a diagnosis naming the user's own driving bucket,
CLP-to-Verde advice amounts computed from the user's own totals, and the user's own Sin categoría
count/total) — it MUST be held to the identical cross-user isolation guarantee already governing
the other 4 data endpoints.

## MODIFIED Requirements

### Requirement: ISO-01 — `userId` is derived from the session, not a fixed constant, for every client

(Previously: web-implicit. Revised: explicitly no keyless fallback for `/api/resumen` now that
mobile authenticates via session too. Revised again, US-049: the count of session-guarded
controllers grows from 4 to 5 with `resumen/semaforo`, which derives `userId` identically via the
SAME session middleware already covering `resumen` — the rule itself is unchanged, only the count
of controllers it applies to.)

## ADDED Requirements

### Requirement: ISO-02 — Cross-user isolation across all 5 data endpoints, for both clients

This delta adds the new scenario for user data isolation on the `/api/resumen/semaforo` endpoint,
ensuring that a user cannot read another user's semáforo diagnosis or advice.

The complete updated requirements have been merged into the living spec at
`openspec/specs/user-data-isolation/spec.md`, which now covers all 5 data-bearing endpoints:
`resumen`, `movimientos`, `detalle-bucket`, `ingesta`, and `resumen/semaforo`.

This archive version documents the delta that was applied to create the living spec.
