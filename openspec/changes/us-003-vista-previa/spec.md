# Delta for Ingesta Preview (apps/api + apps/web + apps/mobile)

## Purpose

New capability: before a cartola is imported, the user sees a representative
sample of how the system read it (bank, canonical columns, row count) and
explicitly confirms or cancels. Preview is a **read-only, no-write** seam
inserted before the existing single-shot `POST /api/ingestas`. No existing
spec covers ingesta preview — all requirements below are additions.

## ADDED Requirements

### Requirement: PREV-01 — Preview endpoint returns a bank-detected, canonical sample without persisting anything

The system MUST expose a distinct preview endpoint (`POST /api/ingestas/preview`,
same multipart file-upload contract as `POST /api/ingestas`, behind the same
`apiKey → session → error` middleware chain) that runs `IngestFile → Detect →
Validate → Normalize` and returns, without persisting:

- `banco`: the detected bank code.
- `estructura.totalFilasDatos`: total data rows the file would contribute.
- `muestra`: an array of up to **50** transactions (`PREVIEW_SAMPLE_MAX`),
  each with canonical fields `fecha`, `descripcion`, `cargo`, `abono` —
  `cargo`/`abono` as BigInt-safe strings, mirroring `TransaccionResponseDto`.

The preview use case MUST be constructed with **zero
persistence/repository ports** (no `IIngestaRepository`, no
`PersistTransactionsUseCase`, no `IAccountRepository.ensure()` call) — nothing
it depends on can reach the database, by construction.

#### Scenario: Excel preview returns a capped sample with total row count

- GIVEN a valid BancoEstado `.xlsx` cartola with 120 data rows
- WHEN the user calls `POST /api/ingestas/preview` with that file
- THEN the response is 200 with `banco: "BancoEstado"`,
  `estructura.totalFilasDatos: 120`, and `muestra` containing exactly 50
  transactions, each with `fecha`/`descripcion`/`cargo`/`abono` as strings

#### Scenario: PDF preview returns the same canonical shape as Excel preview

- GIVEN a valid Banco de Chile `.pdf` cartola with 8 data rows
- WHEN the user calls `POST /api/ingestas/preview` with that file
- THEN the response is 200 with `banco: "BancoChile"`,
  `estructura.totalFilasDatos: 8`, and `muestra` containing exactly 8
  transactions in the same canonical shape as the Excel case (no PDF-specific
  fields such as page/coordinates leak into the DTO)

#### Scenario: A file with fewer than 50 rows returns all of them, uncapped by the sample max

- GIVEN a valid cartola with 7 data rows
- WHEN the user calls `POST /api/ingestas/preview`
- THEN `estructura.totalFilasDatos` is 7 and `muestra` contains exactly 7
  transactions

### Requirement: PREV-02 — Preview persists NOTHING on both success and failure (structural guarantee, CA-04)

A call to the preview endpoint — whether it succeeds, fails validation, or the
user never confirms — MUST NOT create any `Ingesta` row, any `Transaccion`
row, or any `Account` row (no upsert/`ensure()`). This MUST hold even for a
request that would otherwise detect a valid, previously-unseen bank/account
combination.

#### Scenario: A successful preview creates no database rows

- GIVEN a valid cartola for a bank/account combination that has never been
  ingested before (no existing `Account` row for it)
- WHEN the user calls `POST /api/ingestas/preview` and receives a 200
- THEN no `Account` row exists for that combination, and no `Ingesta` or
  `Transaccion` row exists anywhere attributable to this call

#### Scenario: A failed preview (invalid structure) creates no database rows

- GIVEN a cartola that fails structure validation
- WHEN the user calls `POST /api/ingestas/preview` and receives a 400
- THEN no `Account`, `Ingesta`, or `Transaccion` row is created

#### Scenario: Repeated preview calls on the same file never accumulate rows

- GIVEN a valid cartola
- WHEN the user calls `POST /api/ingestas/preview` three times with the same
  file (simulating re-opening the preview without confirming)
- THEN after all three calls, the database still has zero `Ingesta`,
  `Transaccion`, or new `Account` rows

### Requirement: PREV-03 — Preview shares the same file-validation error contract as confirm (400, scrubbed)

The preview endpoint MUST surface the same detect/validate/normalize domain
errors that `POST /api/ingestas` already produces — `ExtensionNoPermitidaError`,
`BancoNoReconocidoError`, `EstructuraInvalidaError`,
`NormalizacionInvalidaError`, `PdfInvalidoError`, `PdfSinTextoError`,
`EstructuraPdfInvalidaError`, `RangoFechasInvalidoError` — each mapped to HTTP
400 with a fixed, scrubbed message. Preview MUST NOT run or report
dedupe/business-rule errors (those live only past normalize, on confirm).

#### Scenario: An unrecognized bank returns 400 with a safe message

- GIVEN a file whose layout does not match any known bank strategy
- WHEN the user calls `POST /api/ingestas/preview`
- THEN the response is 400 with a fixed message identifying the failure
  category (bank not recognized) and no raw file content or amounts in the
  body

#### Scenario: A disallowed extension returns 400 before any parsing

- GIVEN a file with an extension other than `.xlsx` or `.pdf`
- WHEN the user calls `POST /api/ingestas/preview`
- THEN the response is 400 (`ExtensionNoPermitidaError`) and no bank
  detection/validation/normalization step runs

#### Scenario: A PDF with no extractable text returns 400 with a safe message

- GIVEN a `.pdf` file with no extractable text layer
- WHEN the user calls `POST /api/ingestas/preview`
- THEN the response is 400 (`PdfSinTextoError`) with a fixed, scrubbed
  message

### Requirement: PREV-04 — Preview error messages and sample data never leak raw amounts beyond the BigInt-safe string contract

Any error message or DTO field returned by the preview endpoint MUST NOT
contain a raw numeric amount read from the uploaded file that bypasses the
BigInt-safe string representation used elsewhere in the ingesta contract
(mirrors ADR-013 scrub discipline already enforced on `POST /api/ingestas`).

#### Scenario: A structure-validation failure does not echo a raw cell amount

- GIVEN a cartola with a malformed amount cell that triggers
  `EstructuraInvalidaError` or `NormalizacionInvalidaError`
- WHEN the user calls `POST /api/ingestas/preview`
- THEN the 400 response body contains only the fixed error message — no raw
  cell value or amount fragment from the file

#### Scenario: Successful preview amounts are always strings, never raw numbers

- GIVEN a valid cartola
- WHEN the user calls `POST /api/ingestas/preview` and receives a 200
- THEN every `cargo` and `abono` value in `muestra` is a string (never a JSON
  number), matching `TransaccionResponseDto`'s convention

### Requirement: PREV-05 — Confirm is the existing, unchanged `POST /api/ingestas` endpoint (stateless re-upload)

Confirming a preview MUST re-upload the same file bytes to the existing,
unmodified `POST /api/ingestas` endpoint. The full pipeline — dedupe,
persistence, account upsert, categorization — MUST run only on this call,
never during preview. No new server-side state (token/TTL staging) is
introduced to link a preview call to a subsequent confirm call.

#### Scenario: Confirming after preview runs the full existing pipeline

- GIVEN the user has successfully previewed a valid cartola
- WHEN they confirm and the client re-uploads the same file to
  `POST /api/ingestas`
- THEN the response is the existing `IngestaResponseDto` (persisted
  `ingestaId`, `totalTransacciones`, `duplicadosOmitidos`, categorization) and
  an `Ingesta` + its `Transaccion` rows now exist

#### Scenario: Canceling after preview leaves the file unconfirmed and nothing persisted

- GIVEN the user has successfully previewed a valid cartola
- WHEN they cancel instead of confirming
- THEN no request is sent to `POST /api/ingestas`, no `Ingesta`/`Transaccion`
  row exists, and the user can select a different file

### Requirement: PREV-06 — Client-side row-count selector slices the same in-memory sample (CA-01)

The web and mobile clients MUST let the user choose to view 10, 25, or 50 rows
of the returned `muestra`, defaulting to 10, by slicing the single preview
response client-side — no additional request is sent when the selector
changes.

#### Scenario: Changing the selector from 10 to 50 does not re-request the server

- GIVEN a successful preview response with a 50-row `muestra`
- WHEN the user changes the row-count selector from 10 to 50
- THEN the displayed rows update to show 50 and no new HTTP call is made

#### Scenario: Selecting 25 on a sample smaller than 25 shows all available rows

- GIVEN a successful preview response with a 12-row `muestra`
  (`totalFilasDatos: 12`)
- WHEN the user selects 25 rows
- THEN all 12 available rows are shown, with no error and no padding

## Non-Goals

- Editing rows/columns/bank in preview — read-only.
- Full-file / paginated view of the cartola — preview is a capped
  representative sample (≤50 rows), never the complete file.
- Filtering, searching, or sorting preview rows.
- Business-rule validation at preview: no dedupe, no categorization, no
  semáforo/50-30-20 computation. Preview stops at normalize.
- Server-side staging (token/TTL temp store) linking preview to confirm.
- Client-submitted parsed rows — confirm always re-sends file bytes, never
  parsed `cargo`/`abono` values (ADR-024).
- Configurable sample cap — 50 is a hardcoded server constant.
- CLI preview — the CLI keeps its single-shot flow.
