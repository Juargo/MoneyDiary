# Proposal — sprint4-pdf-ingesta

> SDD propose phase. Sprint 4 Sprint Goal: bring **PDF bank-statement ingestion**
> to full parity with the existing `.xlsx` pipeline for the 4 Chilean banks
> (BancoEstado, Banco de Chile, Santander, BCI). US-008/009/010 are the PDF
> mirrors of US-006/002/007. ADR-009: `pdfjs-dist` legacy build, no OCR.

## Why

Today a user can only consolidate bank movements by uploading `.xlsx` statements.
Several of the target Chilean banks export cartolas primarily (or only) as **PDF**,
so the current pipeline leaves those users unable to ingest their real data — the
statement they actually receive is unusable. This is a direct completeness gap in
the core value proposition (consolidate + analyze real movements), not a nice-to-have.

The `.xlsx` pipeline is already complete and traced end to end:
`Extension VO → IngestFileUseCase → ProcessIngestaUseCase → detect → validate →
normalize → persist → categorize → consolidate`, with money kept as exact integers
and `user_id` isolation enforced downstream. The persist/categorize/consolidate
stages are **format-agnostic**: they consume a canonical transaction shape and do
not care how it was produced.

The goal of this change is therefore narrow and well-defined: add a **second front
end** to the pipeline (detect → validate → normalize for PDF) that emits the SAME
canonical transaction shape, so everything from persistence onward is reused
untouched. Parity — same 4 banks, same downstream behavior, same money exactness —
is the Sprint Goal.

## What changes

Three new per-stage PDF ports plus their adapters/strategies, extension routing at
the orchestrator, and the Track E documentation reconciliation. Per track:

### Tarea 0 — enable `.pdf` at the boundary (blocks everything)
- **0.1** Extend the `Extension` value object to accept `.pdf` alongside `.xlsx`
  (mirror error + tests; fix the stale docstring). Note: `ingest-file.use-case.spec.ts:78`
  currently **asserts `.pdf` is REJECTED** — that assertion must be inverted.
- **0.2** Document the format-routing decision (Option B) at `ProcessIngestaUseCase`
  as an inline note or mini-ADR, since it touches the orchestration architecture.
- **0.3** Confirm the controller/Multer path accepts `application/pdf` with the 10 MB
  cap. Per exploration, `FileInterceptor` already carries `limits.fileSize = 10 MB`
  and no MIME `fileFilter`, so the real gate is the Extension VO by filename suffix;
  0.3 is mostly structural confirmation + an explicit reject-over-cap test.

### Track A / US-008 — PDF bank detection
- Errors: `PdfInvalidoError` (corrupt/unparseable PDF), `PdfSinTextoError`
  (no text layer, CA-07); reuse `BancoNoReconocidoError`.
- Port `IPdfBankDetector` (async, reusing the `BancoConocido` enum).
- `PdfjsBankDetectorService` reads page-1 `getTextContent()` via a hardened reader.
- 4 header-pattern strategies (anchors validated per bank, see table below).

### Track B / US-009 — PDF structure validation
- `EstructuraPdfBanco` interface (expected headers, period anchors, X column ranges).
- Errors: `EstructuraPdfInvalidaError` (groups ALL problems in one pass, CA-06),
  `RangoFechasInvalidoError` (CA-07).
- Port `IPdfStructureValidator` + `PdfjsStructureValidatorService`.
- Output `EstructuraPdfValidada` (period date range + table start page + X ranges).

### Track C / US-010 — normalization to the canonical schema
- Port `IPdfTransactionNormalizer`; adapter groups tokens by Y (row), merges by X
  range (critical for Santander word-by-word descriptions).
- Year inference from the period lower bound, incremented on month regression across
  a year boundary (BancoEstado / Banco de Chile / Santander); BCI carries explicit
  per-row year.
- Multiline continuation stitching (BCI); special-row filtering (SALDO INICIAL/FINAL,
  Resumen de Comisiones, browser footer with URL + print date).
- Amount parsing: strip thousands separators (`1.580.000 → 1580000`), drop `$`,
  integer CLP, cargo/abono by column; multipage concatenation (BancoEstado + BCI
  are 2 pages).
- **Canonical output contract:** `{ fecha: 'YYYY-MM-DD', descripcion, cargo, abono }`
  with `cargo`/`abono` as `number` at the domain layer (BigInt conversion happens
  only at the persistence mapper). This output MUST be shape-compatible with the
  Excel normalizer output so downstream stays untouched.

### Track D — end-to-end wiring
- `ProcessIngestaUseCase` routes by extension: `.pdf` → PDF ports, `.xlsx` → existing.
- DI wiring in `IngestaModule` (3 new services, typed tokens + `useFactory`).
- CLI: `pnpm api cli -- cartola.pdf`.
- e2e HTTP test (PDF → 200 + rows persisted; >10 MB → 400; non-bank PDF → controlled
  error).
- **Parity test D.5:** the same logical movement ingested via PDF vs XLSX yields
  equivalent canonical transactions.

### Track E — documentation reconciliation
- Reconcile the stale test values in US-009 / US-010 against the reference targets
  below, and **remove the real personal name (PII)** still cited in US-010 CA-04.

## Chosen approach (fixed decisions)

These five decisions are settled inputs to this change, stated here as the chosen
approach with rationale:

1. **Format routing = Option B (per-stage PDF ports routed inside
   `ProcessIngestaUseCase`).** Three new ports — `IPdfBankDetector`,
   `IPdfStructureValidator`, `IPdfTransactionNormalizer` — mirror the Excel port
   design. Routing by file extension lives inside `ProcessIngestaUseCase`; the Excel
   path is unchanged. *Rationale:* keeps each format's detect/validate/normalize
   fully isolated and independently testable, mirrors the shape the team already
   knows from Excel, and confines the branch to one orchestrator decision point.
   Chosen over ADR-009's original `IPdfReader`-in-`IngestFileUseCase` sketch, which
   would blur format concerns into the ingest stage.
2. **No separate spike script.** Install `pdfjs-dist` (legacy build, hardened:
   `isEvalSupported:false`, `disableFontFace:true`) and build each PDF adapter via
   STRICT TDD directly against the 4 real fixtures. The tests ARE the empirical
   verification. *Rationale:* a throwaway `scripts/spike-pdf.ts` would produce
   findings that rot; encoding the same positional discoveries as executable tests
   makes them durable and regression-proof.
3. **All 4 banks in this sprint.** Full parity against the 4 fixtures is the Sprint
   Goal; no bank is descoped. PR chaining/splitting is decided later at the tasks
   phase per the review-line forecast (delivery strategy: ask-on-risk).
4. **Track E doc debt is IN scope.** Reconciling the stale US-009/US-010 test values
   and removing the PII name are part of this change, not deferred.
5. **Normalizer implementation order: Santander first, then the year-crossing
   inference, before the "easy" banks.** *Rationale:* Santander's word-by-word token
   merge and the year-boundary inference are the plan's primary technical risk;
   proving them first de-risks the sprint instead of leaving the hardest logic last.

## In scope

- Extension VO accepts `.pdf`; controller/Multer confirmed for `application/pdf` + 10 MB cap.
- 3 new PDF ports + 3 pdfjs adapters + 4 per-bank PDF strategies.
- New PDF-specific errors (`PdfInvalidoError`, `PdfSinTextoError`,
  `EstructuraPdfInvalidaError`, `RangoFechasInvalidoError`).
- Extension routing inside `ProcessIngestaUseCase` + DI wiring in `IngestaModule`.
- CLI + e2e HTTP support for PDF, plus the XLSX↔PDF parity test.
- `pdfjs-dist` legacy build added as an `apps/api` dependency, hardened reader.
- Track E doc reconciliation + PII removal.

## Out of scope (deferred)

- OCR for scanned/image-only PDFs (no text layer → controlled `PdfSinTextoError`).
- US-003 preview-before-confirm.
- US-005 deduplication.
- Persisting `saldo` / `N° documento` columns.
- Web UI of US-015/016/017.

## Impact

**Touched (new or modified):**
- `apps/api/src/domain/value-objects/extension.ts` (+ its spec) — accept `.pdf`.
- `apps/api/src/application/use-cases/ingest-file.use-case.spec.ts` — invert the
  `.pdf`-rejected assertion.
- `apps/api/src/application/ports/` — 3 new PDF ports.
- New `apps/api/src/domain/errors/` PDF error types.
- New `apps/api/src/infrastructure/pdf/` adapters + `strategies/` (4 banks) + hardened reader.
- `apps/api/src/application/use-cases/process-ingesta.use-case.ts` — extension routing.
- `apps/api/src/infrastructure/http/ingesta.module.ts` — DI wiring for 3 new services.
- `apps/api/src/infrastructure/cli/` — accept `.pdf` argument.
- `apps/api/package.json` — add `pdfjs-dist`.
- Test suites (unit strategy/service specs against the 4 fixtures + e2e + parity).
- US-009 / US-010 docs (vault) — stale values + PII.

**Explicitly NOT touched (parity guarantee):**
- `PersistTransactionsUseCase`, the categorization use case, and the consolidation /
  resumen use cases and repositories.
- `transaccion.mapper.ts` (`number ↔ BigInt` boundary) — the PDF normalizer output
  is engineered to satisfy the exact existing contract.
- The entire Excel path (detect/validate/normalize adapters + strategies) stays
  byte-for-byte behavior-compatible; the extension router only adds a branch.
- `user_id` isolation logic in the query layer — untouched and still enforced.

## Risks & mitigations

1. **Santander word-by-word token merge (fragile positional logic).** Descriptions
   arrive as separate X-positioned tokens on one Y row and must merge (e.g.
   `Transf a Tercero Maria Ejemplo`). *Mitigation:* implement Santander FIRST under
   strict TDD; consider a shared X/Y grouping helper so the four strategies do not
   duplicate positional logic 4×.
2. **Year inference across a month regression at the year boundary.** Banks that omit
   the year (BancoEstado / Banco de Chile / Santander) require inferring it from the
   period lower bound and incrementing when the month rolls back. *Mitigation:* build
   and prove this immediately after Santander, with explicit boundary-crossing tests;
   BCI (explicit per-row year) acts as a control case.
3. **`pdfjs-dist` legacy import under NestJS + SWC (ADR-016).** The legacy build's
   module/ESM interop can misbehave with the decorator-metadata SWC transpile.
   *Mitigation:* validate the import path early (it gates every adapter); keep pdfjs
   confined to the infrastructure layer behind the ports, and harden the reader
   (`isEvalSupported:false`, `disableFontFace:true`, no network, no OCR).
4. **Fragile X-column ranges / special-row filtering.** Amount-column boundaries and
   junk rows (SALDO INICIAL/FINAL, Resumen de Comisiones, BCI browser footer) are
   layout-dependent. *Mitigation:* encode ranges + filters per strategy, verified
   against the real fixture text; the reference table below is the source of truth
   for expected counts and totals.
5. **Testing-pattern divergence.** There is no cheap synthetic-PDF builder analogous
   to `new ExcelJS.Workbook()`, so PDF unit tests lean directly on the 4 real
   fixtures. *Mitigation:* accept this deliberately; the fixtures are anonymized and
   committed, and they double as the parity/regression baseline.

## Acceptance framing

- **Parity against the 4 fixtures** — each PDF parses to its expected period,
  movement count, and totals (reference table below), with the documented junk rows
  excluded.
- **Parity test D.5** — the same logical movement via PDF vs XLSX produces equivalent
  canonical transactions.
- **Money exactness** — amounts are exact integer CLP end to end, never `float`;
  thousands separators and `$` stripped correctly.
- **`user_id` isolation preserved** — downstream query isolation (RNF-SEC-006) is
  untouched and still verified.
- **Security (ADR-009/013)** — hardened reader, 10 MB cap rejected before parsing,
  no OCR / no network during parse, raw data (name/RUT/descriptions) scrubbed from
  error messages and logs (same criterion as the US-011 HTTP 400 boundary).

### Reference test targets (source of truth — older US notes are stale)

| Fixture | Period | Movements | Signals |
|---------|--------|-----------|---------|
| bancoestado-cartola-test.pdf | 01/04/2026–30/04/2026 | ~13 | Cargos $135.010 / Abonos $150.000; 2 pages; year 2026 inferred |
| bancochile-cartola-test.pdf | 01/04/2026–30/04/2026 | ~11 | SALDO INICIAL/FINAL excluded |
| santander-cartola-test.pdf | 01/03/2026–31/03/2026 | ~7 | token-merged descriptions; Resumen de Comisiones excluded |
| bci-cartola-test.pdf | 01/04/2026–30/04/2026 | ~18 (2 pages) | browser footer excluded; year explicit per row |

### Header detection patterns (validated per bank)

| Bank | Page-1 anchor(s) | Date format | Year source | Notes |
|------|------------------|-------------|-------------|-------|
| BancoEstado | `CARTOLA CUENTARUT N°` | `DD/Mmm` (no year) | infer from `Fecha Inicio/Final` | 2 pages; amounts with `$` |
| Banco de Chile | `Estado de Cuenta` + `CUENTA CORRIENTE` | `DD/MM` (no year) | infer from `DESDE/HASTA` | filter SALDO INICIAL/FINAL |
| Santander | `BANCO SANTANDER CHILE` + `CARTOLA` | `DD/MM` (no year) | infer from `DESDE/HASTA` | description tokenized word-by-word → merge by X; filter Resumen de Comisiones |
| BCI | `CARTOLA DE CUENTA CORRIENTE` + `BCI` | `DD/MM/YYYY` (with year) | explicit per row | 2 pages; multiline continuations; filter browser footer (URL + time) |

## Conventions honored

Clean Architecture dependency rule `domain ← application ← infrastructure`;
`Result<T,E>` in domain/application (never throw); Spanish names for domain/application
(`Extension`, `PdfInvalidoError`, `EstructuraPdfValidada`, …), English for NestJS infra
(`PdfjsBankDetectorService`, `IngestaModule`, …); money as exact integers; strict TDD
(`pnpm api test` = vitest, ADR-016). ADR-015 emphasis: money exactness + `user_id`
isolation preserved.

## Next recommended

`sdd-spec` (and `sdd-design` in parallel — design reads this proposal). The routing
location is settled (Option B), so design focuses on the port/adapter/strategy
boundaries and the optional shared X/Y grouping helper.
