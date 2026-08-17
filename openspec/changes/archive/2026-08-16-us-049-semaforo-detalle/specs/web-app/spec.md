# Delta for web-app (US-049)

Source: `openspec/changes/us-049-semaforo-detalle/proposal.md` (US-049, issue #283). Every
requirement below traces to a CA-0N from the proposal (verbatim where quoted) or to a specific
proposal decision named in its own text. New requirements use a fresh family, **`WSEM-*`** (Web
Semáforo detail) — the proposal's own suggested `/semaforo` scope — rather than extending
`WG5-*` (dashboard main chart) or `WCAT-*` (bucket drill-down), because `/semaforo` is a
standalone detail page, not a modification to the dashboard's chart, legend, or panel.

## ADDED Requirements (WSEM-01..08)

The specifications for WSEM-01 through WSEM-08 have been merged into the living spec at
`openspec/specs/web-app/spec.md` under the new "Semáforo Detail Page (`/semaforo`)" section.

## REMOVED Requirements

### Requirement: WG5-09 — The `/semaforo` stub route renders an explicit "under construction" state, never blank or a 404 (CA-03 risk mitigation)

(Reason: US-049 fills `/semaforo` with real content — header, worst-of-3 explanation, per-bucket
rows, advice rows, a Sin categoría warning, a no-income state, and a period-preserving back-link.
The stub's "en construcción" placeholder and its two scenarios no longer describe the shipped
route; they are fully superseded by `WSEM-01..08` above.)

(Migration: the route itself, its position in the `_authenticated` route tree, and its
session-protection guard are UNCHANGED — only the rendered content changes. `WSEM-07` re-asserts
the session-guard regression explicitly so that guarantee is not silently dropped along with the
stub text. No URL or routing behavior is retired, only the placeholder content. Archiving this
change updated the canonical spec's cross-reference summary row
(`openspec/specs/web-app/spec.md` ~line 1440) — its `/semaforo` stub mention is stale once
`WG5-09` is removed and `WSEM-01..08` ship; the reference now points to the shipped `WSEM-*`
page or is split so `WG5-07`/`WG5-08` keep their own text and the `WG5-09` stub clause is dropped.)

This archive version documents the delta that was applied to create the living spec.
