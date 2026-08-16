# Delta for User Data Isolation — Sin Categoría Count Coverage (US-045)

## MODIFIED Requirements

### Requirement: ISO-02 — Cross-user isolation across all 4 data endpoints, for both clients

A user authenticated as A MUST NOT be able to read data belonging to user B
through any of the 4 data endpoints, regardless of request parameters or
transport (cookie or Bearer). This isolation MUST hold for every value the
`resumen` endpoint exposes, including the Sin categoría transaction count
introduced by US-045 — the count aggregation MUST filter by the
authenticated user's `userId` in the same WHERE clause as the existing
per-bucket sums, never in application memory.

#### Scenario: User A cannot read user B's resumen (web cookie session)

- GIVEN two seeded users A and B, each with their own transactions for the
  same period
- WHEN a client logged in as A calls `GET /api/resumen?periodo=<period>`
- THEN the response contains only A's data
- AND no field of the response reflects B's amounts or buckets

#### Scenario: User A cannot read user B's resumen (mobile Bearer session)

- GIVEN two seeded users A and B, each with their own transactions for the
  same period
- WHEN the mobile app authenticated as A (via `Authorization: Bearer`) calls
  `GET /api/resumen?periodo=<period>`
- THEN the response contains only A's data, identically to the web-cookie
  case

#### Scenario: User A cannot read user B's Sin categoría count

- GIVEN two seeded users A and B, each with uncategorized cargo transactions
  in the same period — A with a distinct count/total from B's
- WHEN a client logged in as A calls `GET /api/resumen?periodo=<period>`
- THEN A's Sin categoría count and total reflect only A's uncategorized
  cargo transactions
- AND B's Sin categoría count and total are never present or reflected in
  A's response, regardless of transport (cookie or Bearer)

#### Scenario: User A cannot read user B's movimientos

- GIVEN two seeded users A and B, each with their own transactions for the
  same period
- WHEN a client logged in as A calls `GET /api/movimientos?periodo=<period>`
- THEN only A's transactions are returned

#### Scenario: User A cannot read user B's bucket detail

- GIVEN two seeded users A and B with transactions in the same bucket
- WHEN a client logged in as A calls the bucket-detail endpoint for that
  bucket
- THEN only A's transactions for that bucket are returned

#### Scenario: User A cannot trigger or read user B's ingesta

- GIVEN two seeded users A and B
- WHEN a client logged in as A calls the ingesta endpoint
- THEN any created/read ingesta record is scoped to A, and B's ingesta
  records are never returned to A
