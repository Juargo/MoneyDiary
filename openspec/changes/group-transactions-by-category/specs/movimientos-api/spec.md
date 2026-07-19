# Movimientos API Specification (apps/api)

## Purpose

Contract of `GET /api/movimientos`: returns a period's transactions as a flat,
`userId`-isolated, BigInt-safe list, each row tagged with its domain `Bucket`
category (folded from the physical DB bucket id).

## Requirements

### Requirement: MOV-01 — Each row exposes the domain `Bucket`, not the raw physical id

The DTO's per-row category field MUST be a domain `Bucket` enum value
(`Ingreso | Necesidades | Deseos | Ahorro | SinCategoria`), resolved via
`BUCKET_ID_TO_BUCKET` (mirroring `prisma-resumen-mes.repository.ts`), NOT the
raw physical `bucketId` string (e.g. `'bucket-necesidades'`). A `null` or
unrecognized physical id MUST fold to `Bucket.SinCategoria` and MUST NOT
overwrite a row that already resolves to a recognized bucket — the fold is a
per-row mapping, never a merge that can reclassify a known bucket.

#### Scenario: A recognized physical bucket id folds to its domain Bucket

- GIVEN a transaction whose physical `bucketId` is `'bucket-necesidades'`
- WHEN `GET /api/movimientos?periodo=2026-07` is called
- THEN the row's category field is `"Necesidades"`, not `"bucket-necesidades"`

#### Scenario: A null physical bucket id folds to SinCategoria

- GIVEN a transaction with `bucketId: null` (uncategorized, US-012 degradation)
- WHEN the endpoint is called
- THEN the row's category field is `"SinCategoria"`

#### Scenario: An unrecognized physical bucket id folds to SinCategoria

- GIVEN a transaction with a physical `bucketId` absent from `BUCKET_ID_TO_BUCKET`
- WHEN the endpoint is called
- THEN the row's category field is `"SinCategoria"`, not left as the raw id

#### Scenario: A known bucket is never reclassified into SinCategoria

- GIVEN one transaction resolves to `"Necesidades"` and another to
  `null` → `SinCategoria` in the same response
- WHEN the endpoint is called
- THEN each row keeps its own resolved category — the `SinCategoria` fold of
  one row MUST NOT change the category of the other

### Requirement: MOV-02 — Endpoint keeps `userId` isolation and money-string safety

`GET /api/movimientos?periodo=YYYY-MM` MUST continue returning only the
authenticated `userId`'s transactions (via the account join) and MUST continue
serializing `cargo`/`abono` as decimal strings, never `number`. This change
MUST NOT alter these existing guarantees.

#### Scenario: User A cannot see User B's transactions in the movimientos list

- GIVEN transactions exist for user B in the requested period
- WHEN user A's session requests `GET /api/movimientos?periodo=2026-07`
- THEN no user-B transaction appears in the response

#### Scenario: Amounts remain exact decimal strings after the fold change

- GIVEN a transaction with `abono` beyond `Number.MAX_SAFE_INTEGER`
- WHEN the endpoint is called
- THEN `abono` is returned as a string with every digit preserved

### Requirement: MOV-03 — The category field's contract change has no other breaking consumer

Before the physical-id-to-domain-Bucket field change ships, it MUST be
confirmed that no consumer other than this endpoint's own tests depends on the
raw physical id shape. `/api/buckets/:bucket` and its DTO are a separate
contract and MUST remain unchanged by this requirement.

#### Scenario: `/buckets/:bucket` is unaffected by the movimientos DTO change

- GIVEN the movimientos DTO's category field now carries the domain `Bucket`
- WHEN `GET /api/buckets/:bucket?periodo=YYYY-MM` is called
- THEN its response shape is identical to before this change
