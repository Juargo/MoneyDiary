# Resumen Semáforo Detail Specification (apps/api — domain/application/infrastructure)

## Purpose

Defines the observable contract of `GET /api/resumen/semaforo?periodo=` — a sibling detail
endpoint to `GET /api/resumen` (`resumen-mensual` spec) that exposes the semáforo classification's
WHY and WHAT-TO-DO: the zone-band edges used to classify each spend bucket, a backend-generated
Spanish diagnosis sentence naming the bucket driving the global state, and a CLP amount (with
direction) that would return each Amarillo/Rojo bucket to Verde. This spec covers what the
response MUST contain and how each value MUST be computed; it does not prescribe DTO field names
or JSON layout — those are design-phase decisions. Web rendering of this data is covered by the
`web-app` capability's `WSEM-*` family (a separate delta in this same change, US-049). This
endpoint does not modify `GET /api/resumen`'s own payload (out of scope, per the proposal).

Established by change us-049-semaforo-detalle (2026-08-16), US-049 / issue #283.

## Requirements

This archive contains the full spec with all SEM-01..SEM-10 requirements and their scenarios.
The specification has been merged into the living spec at `openspec/specs/resumen-semaforo/spec.md`.
