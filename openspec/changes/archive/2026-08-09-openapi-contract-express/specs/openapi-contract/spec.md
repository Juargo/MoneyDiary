# OpenAPI Contract Specification

## Purpose

The Express API MUST expose its HTTP boundary as a single, machine-verifiable contract: a Zod-sourced,
committed `openapi.json` kept in sync with runtime behavior by CI. This spec is mechanism-light — it
does not name the generator library or pin the OpenAPI version (design phase owns that); it defines the
OBSERVABLE contract every endpoint must satisfy and the guarantees that keep the artifact trustworthy.

## Requirements

### Requirement: Single Contract Source

The system MUST derive both runtime request validation and the emitted OpenAPI document from the same
schema definitions, co-located in `infrastructure/http-express/` (never in `domain` or `application`).

#### Scenario: Schema drives both validation and docs

- GIVEN a route with a defined request/response schema
- WHEN the emit script runs
- THEN the generated `openapi.json` entry for that route matches the schema used by the handler at runtime

### Requirement: Committed, Deterministic Artifact

The system MUST produce a committed `openapi.json` via a build-time emit script. Emission MUST be
deterministic (stable key order, identical output across runs with no code changes) so the drift-check
never produces false positives.

#### Scenario: Re-running emit with no code changes

- GIVEN the current `openapi.json` is committed and no route/schema code changed
- WHEN the emit script runs again
- THEN the output is byte-identical to the committed file

### Requirement: CI Drift-Check

CI MUST fail the `api` job when the committed `openapi.json` diverges from what the current code emits.

#### Scenario: Contract changed without regenerating

- GIVEN a PR changes a route's request or response schema
- WHEN CI regenerates `openapi.json` and diffs it against the committed file
- THEN the diff is non-empty and the build fails

#### Scenario: Contract regenerated correctly

- GIVEN a PR changes a schema and regenerates `openapi.json` as part of the same commit
- WHEN CI regenerates and diffs
- THEN the diff is empty and the build passes

### Requirement: `GET /version` Contract

The documented and runtime response for `GET /version` MUST be `{ version: string, commit: string,
ref: string, builtAt: string }`, status 200, no request parameters, no auth required.

#### Scenario: Version contract matches build info

- GIVEN the server is running
- WHEN a client calls `GET /version`
- THEN the response matches the schema and equals the current `buildInfo` object

### Requirement: `GET /api/resumen` Request Contract

The `periodo` query parameter MUST be optional. When absent, the system MUST default to the current
month. When present, it MUST match `YYYY-MM`; any other value MUST be rejected per the boundary
validation requirement below.

#### Scenario: Omitted periodo defaults to current month

- GIVEN an authenticated user calls `GET /api/resumen` with no `periodo`
- WHEN the request is validated
- THEN it is accepted and resolved against the current month

#### Scenario: Malformed periodo rejected

- GIVEN a request with `periodo=not-a-date`
- WHEN the request is validated
- THEN it is rejected before reaching the use case

### Requirement: `GET /api/resumen` Response Contract

The response schema MUST express, without loss of precision: `totalIngreso` and each bucket `total` as
decimal strings (never JSON numbers); `porcentajeBp` as `number | null` (basis points, ≤ 10000);
`estadoSemaforo` and `estadoGlobal` as lowercase wire enums `'verde' | 'amarillo' | 'rojo' | null`;
`buckets` as an array of bucket entries; `targets` as the fixed 50/30/20 reference object.

#### Scenario: Response parses against schema

- GIVEN a real `aResumenMesDto(...)` output from the use case
- WHEN it is validated against the response schema
- THEN validation succeeds with no coercion of money fields to numbers

#### Scenario: Money precision preserved

- GIVEN a `totalIngreso` value exceeding `Number.MAX_SAFE_INTEGER`
- WHEN the response is serialized and validated against the schema
- THEN the value remains a string and is unchanged

### Requirement: Boundary Validation Preserves Error Contract

Runtime request validation MUST reject invalid input with the existing scrubbed 400 shape
(`{ message: string }`, no raw/rejected input echoed) — the error CONTRACT does not change, only its
enforcement mechanism (schema-based instead of hand-rolled).

#### Scenario: Invalid periodo returns scrubbed 400

- GIVEN a request with an invalid `periodo`
- WHEN the boundary rejects it
- THEN the response is `400` with `{ message: "..." }` and does not include the raw `periodo` value

### Requirement: Response Schema Sync Guarantee

Each endpoint in scope MUST have a strict-TDD test that `.parse()`s real handler output (not a hand-built
fixture) against its response schema, so the schema cannot silently diverge from actual behavior.

#### Scenario: Handler output validated by its own schema

- GIVEN the `GET /api/resumen` handler executes against seeded data
- WHEN the raw JSON response is parsed with the response schema
- THEN parsing succeeds without any field being dropped, renamed, or coerced

## Non-Goals

| Excluded | Reason |
|----------|--------|
| `packages/api-client` (ADR-012) | Separate tracked debt; not built here |
| DAST wiring (ZAP/Schemathesis, ADR-021) | Follow-up change; this spec only produces its input artifact |
| Changes to `apps/web`/mobile hand-written types | Still hand-authored after this change |
| Public prod docs/spec endpoint | Committed file only, matching ADR-011 posture |
| `domain`/`application` changes | Infra-only per ADR-005 |
