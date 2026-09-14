# Delta for Ingesta Preview + Commit — Mobile Becomes a Canonical Consumer

**Change**: `cartola-preview-confirmacion`
**Capability**: `ingesta-preview-commit` (extends `openspec/specs/ingesta-preview-commit/spec.md`)

## Purpose

Mobile adopts the canonical `preview`/`commit` contract (see the new
`mobile-import-preview` spec), retiring its exclusive dependency on the deprecated
one-shot `POST /api/ingestas`. No backend or contract change — the endpoint's own
behavior (DEP-01) stays live and unchanged; only its shipped-consumer status changes,
and the stale "mobile not implemented" documentation note is corrected.

## MODIFIED Requirements

### Requirement: DEP-01 — One-shot `POST /api/ingestas` is deprecated in openapi.json but behaviorally unchanged; no shipped caller remains (CA-05)

`POST /api/ingestas` MUST be annotated `deprecated: true` in `openapi.json`. Its
request/response contract, routing, middleware chain, and pipeline behavior MUST remain
identical to today. After this change, mobile no longer calls it — mobile adopts the
canonical `preview`/`commit` flow (see `mobile-import-preview` spec) — so **no client in
this repo ships a caller** of the one-shot endpoint. The endpoint itself MUST stay live
and unchanged; only its shipped-consumer status changes. No feature flag, env toggle, or
dual-write logic branch is introduced.

A transition note MUST be recorded (in the ADR table row for ADR-026 or the ingesta
runbook) stating: deprecated at US-057, mobile migrated off it at this change
(`cartola-preview-confirmacion`), physical removal tracked by US-061.

(Previously: "Mobile callers (ADR-026) continue to use it until US-061.")

#### Scenario: Deprecated one-shot still works for a direct caller (regression guard)

- GIVEN an authenticated caller with a valid session and API key calls the endpoint directly (no shipped client does this anymore)
- WHEN the caller calls `POST /api/ingestas` with a valid cartola (unchanged flow)
- THEN the response is the existing `IngestaResponseDto` shape with persisted
  `ingestaId`, `totalTransacciones`, `duplicadosOmitidos`, and categorization
- AND the `Ingesta` + `Transaccion` rows exist in the DB

#### Scenario: openapi.json marks the one-shot as deprecated

- GIVEN the current `openapi.json`
- WHEN the spec file is inspected for `POST /api/ingestas`
- THEN the operation object includes `"deprecated": true`
- AND `POST /api/ingestas/preview` and `POST /api/ingestas/commit` are present as
  non-deprecated operations

#### Scenario: No shipped client imports the one-shot path after this change

- GIVEN the mobile app after this change (`post-ingesta.ts` deleted)
- WHEN the mobile and web source trees are inspected for imports of the one-shot
  endpoint's client function
- THEN no import exists in `apps/mobile` or `apps/web`

## Client Consumers — MODIFIED

- **Web UI (US-059)** — `SubirCartola` state machine
  (`apps/web/src/components/SubirCartola.tsx`) is the first consumer of the
  preview+commit endpoints; deployed at main `74dafdd0` (2026-08-22). Specification at
  `openspec/specs/web-import-preview/spec.md` (extended by `cartola-preview-confirmacion`
  with an explicit decision step).
- **Mobile UI** — Second consumer, added by `cartola-preview-confirmacion`. Adopts the
  canonical preview+commit flow with a decision step and a tap-row classification sheet
  (see `openspec/specs/mobile-import-preview/spec.md`). Mobile no longer calls the
  deprecated one-shot `POST /api/ingestas`.

(Previously: "Mobile UI — not yet implemented; tracked by US-061. The deprecated
one-shot `POST /api/ingestas` (ADR-026) remains the mobile path until US-061.")
