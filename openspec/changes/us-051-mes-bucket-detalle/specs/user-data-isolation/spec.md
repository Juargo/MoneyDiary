# Delta for User Data Isolation — Bucket Detalle Mes Endpoint Coverage (US-051)

Source: `openspec/changes/us-051-mes-bucket-detalle/proposal.md` (US-051, issue #285).
`GET /api/buckets/:bucket/detalle` is a 6th data-bearing endpoint (`bucket-detalle-mes` capability,
this same change) that re-exposes user-scoped data (the bucket's month header: total, counts and %
vs meta; the category groups with their transactions) — it MUST be held to the identical
cross-user isolation guarantee already governing the other 5 data endpoints.

**Archive/migration note (staleness):** the proposal and exploration describe this change as
growing the endpoint set "4→5", but that count predates the US-049 archive: the canonical spec's
Purpose prose and ISO-01/ISO-02 already list 5 data-bearing endpoints (`resumen/semaforo` merged in
US-049). Applying this change MUST therefore grow the canonical spec from 5 to 6: the Purpose
prose MUST read "the 6 data-bearing endpoints" and list the new endpoint alongside the current
five; `ISO-01` and `ISO-02` below carry explicit MODIFIED blocks for the matching "5 controllers /
5 data endpoints" → "6" counts so the merged spec stays internally consistent — the archive step
MUST NOT merge only `ISO-02` and leave the Purpose prose and `ISO-01` stale at "5".

## MODIFIED Requirements

### Requirement: ISO-01 — `userId` is derived from the session, not a fixed constant, for every client

(Previously: web-implicit. Revised: explicitly no keyless fallback for `/api/resumen` now that
mobile authenticates via session too. Revised again, US-049: the count of session-guarded
controllers grows from 4 to 5 with `resumen/semaforo`, which derives `userId` identically via the
SAME session middleware already covering `resumen` — the rule itself is unchanged, only the count
of controllers it applies to. Revised again, US-051: the count grows from 5 to 6 with the
`detalle-bucket-mes` controller serving `GET /api/buckets/:bucket/detalle` — the rule remains
unchanged, only the count of controllers it applies to.)

Each of the 6 controllers (`resumen`, `movimientos`, `detalle-bucket`, `ingesta`,
`resumen/semaforo`, `detalle-bucket-mes`) MUST resolve `userId` from the request's validated
session (as exposed by `SessionGuard`, from either the cookie or `Authorization: Bearer`
transport). None of them MUST inject or fall back to a hardcoded user id, and none MUST accept
`x-api-key` alone as sufficient identity — a valid session is required on top of it, for both web
and mobile callers.

#### Scenario: Data endpoint uses the session's userId

- GIVEN a user is logged in with a valid session
- WHEN they call any of the 6 data endpoints
- THEN the data returned belongs to the session's `userId`, not to any hardcoded constant

#### Scenario: Mobile `/api/resumen` call has no keyless fallback

- GIVEN the mobile app has a valid `x-api-key` but no stored session token
- WHEN it calls `GET /api/resumen`
- THEN the response status is 401
- AND no data is returned under a fallback/default `userId`

### Requirement: ISO-02 — Cross-user isolation across all 6 data endpoints, for both clients

A user authenticated as A MUST NOT be able to read data belonging to user B through any of the 6
data endpoints — `resumen`, `movimientos`, `detalle-bucket`, `ingesta`, `resumen/semaforo`
(US-049), and `detalle-bucket-mes` (US-051) — regardless of request parameters or transport
(cookie or Bearer). This isolation MUST hold for every value the `resumen` endpoint exposes,
including the Sin categoría transaction count introduced by US-045 — the count aggregation MUST
filter by the authenticated user's `userId` in the same WHERE clause as the existing per-bucket
sums, never in application memory. This isolation MUST also hold for every value `resumen/semaforo`
exposes (US-049) — the diagnosis sentence, the per-bucket CLP-to-Verde advice amounts and
directions, the zone-band edges, and the Sin categoría count/total it re-exposes — and for every
value `detalle-bucket-mes` exposes (US-051): the header's `total`, `totalTransacciones`,
`totalCategorias`, `porcentajeBp` and `metaBp`, and each category group's `subtotal`, `conteo` and
transactions — none of which MUST ever be derived from, or reflect, another user's transactions.

#### Scenario: User A cannot read user B's resumen (web cookie session)

- GIVEN two seeded users A and B, each with their own transactions for the same period
- WHEN a client logged in as A calls `GET /api/resumen?periodo=<period>`
- THEN the response contains only A's data
- AND no field of the response reflects B's amounts or buckets

#### Scenario: User A cannot read user B's resumen (mobile Bearer session)

- GIVEN two seeded users A and B, each with their own transactions for the same period
- WHEN the mobile app authenticated as A (via `Authorization: Bearer`) calls
  `GET /api/resumen?periodo=<period>`
- THEN the response contains only A's data, identically to the web-cookie case

#### Scenario: User A cannot read user B's Sin categoría count

- GIVEN two seeded users A and B, each with uncategorized cargo transactions in the same period —
  A with a distinct count/total from B's
- WHEN a client logged in as A calls `GET /api/resumen?periodo=<period>`
- THEN A's Sin categoría count and total reflect only A's uncategorized cargo transactions
- AND B's Sin categoría count and total are never present or reflected in A's response, regardless
  of transport (cookie or Bearer)

#### Scenario: User A cannot read user B's movimientos

- GIVEN two seeded users A and B, each with their own transactions for the same period
- WHEN a client logged in as A calls `GET /api/movimientos?periodo=<period>`
- THEN only A's transactions are returned

#### Scenario: User A cannot read user B's bucket detail

- GIVEN two seeded users A and B with transactions in the same bucket
- WHEN a client logged in as A calls the bucket-detail endpoint for that bucket
- THEN only A's transactions for that bucket are returned

#### Scenario: User A cannot trigger or read user B's ingesta

- GIVEN two seeded users A and B
- WHEN a client logged in as A calls the ingesta endpoint
- THEN any created/read ingesta record is scoped to A, and B's ingesta records are never returned
  to A

#### Scenario: User A cannot read user B's semáforo diagnosis or advice

- GIVEN two seeded users A and B, each with their own transactions for the same period, positioned
  in different semáforo states (e.g. A's Necesidades is Rojo, B's Necesidades is Verde)
- WHEN a client logged in as A calls `GET /api/resumen/semaforo?periodo=<period>`
- THEN A's diagnosis names only A's own driving bucket, and A's CLP-to-Verde advice amounts are
  computed only from A's own totals
- AND none of B's bucket states, diagnosis wording, advice amounts, or Sin categoría numbers are
  present or reflected in A's response, regardless of transport (cookie or Bearer)

#### Scenario: User A cannot read user B's bucket detalle mes (new, US-051)

- GIVEN two seeded users A and B, each with their own transactions in the same bucket for the same
  period
- WHEN a client logged in as A calls `GET /api/buckets/Necesidades/detalle?periodo=<period>`
- THEN the response header (total, counts, `porcentajeBp`, `metaBp`) and every category group
  (`subtotal`, `conteo`, transactions) reflect only A's transactions
- AND none of B's transactions, group totals, or header values are present or reflected in A's
  response, regardless of transport (cookie or Bearer)
