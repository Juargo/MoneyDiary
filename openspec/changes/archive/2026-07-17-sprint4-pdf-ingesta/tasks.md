# Tasks: sprint4-pdf-ingesta — PDF bank-statement ingestion at parity

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~3200–4500 (≈35–40 files: 3 ports, 4 error types, extractor, token-grouping, inferir-anio, 3 adapters, ~12–16 strategy files, 3 use-case wrappers, wiring diffs, ~15–20 test files) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 → PR5 (see Work Units) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — orchestrator must ask the user |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Phase 0 (extension boundary) + Phase 1 (`PdfTextExtractor`) + Phase 2 (`agruparTokens`, `inferirAnios`) | PR 1 | Foundational seam; gates every other unit; independently green (extractor loads 1 real fixture) |
| 2 | Phase 3 — Track A bank detection (4 strategies + service + port + use case) | PR 2 | Depends on PR 1; independently green against all 4 fixtures |
| 3 | Phase 4 — Track B structure validation (4 configs + service + port + use case) | PR 3 | Depends on PR 1 (and PR 2's `BancoConocido` flow conceptually, not code) |
| 4 | Phase 5 — Track C normalization, Santander + year inference first, then BancoEstado/Chile/BCI | PR 4 | Largest slice — highest risk (positional logic); split into PR 4a (Santander+year) / PR 4b (remaining 3 banks) if it exceeds budget alone |
| 5 | Phase 6 (wiring + e2e + parity D.5) + Phase 7 (docs) | PR 5 | Depends on PR 1–4; only slice that touches `process-ingesta.use-case.ts` / `ingesta.module.ts` |

Each unit must be independently green (`pnpm api test` passing) before the next starts.

---

## Phase 0: Extension boundary (blocks everything — Tarea 0) — ✅ done (PR1, `feat/sprint4-pdf-pr1-base`)

- [x] 0.1 [RED] Invert the `.pdf`-rejected assertion in `apps/api/src/application/use-cases/ingest-file.use-case.spec.ts:78` to expect `.pdf` accepted (PDF-00 scenario 1).
- [x] 0.2 [GREEN] Add `.pdf` to `EXTENSIONES_PERMITIDAS` in `apps/api/src/domain/value-objects/extension.ts`; fix stale docstring (currently says "solo .xlsx").
- [x] 0.3 [RED→GREEN] `.pdf` → ok / `.docx`,`.csv` → `Result.fail`/throw `ExtensionNoPermitidaError` — covered via the existing `ingest-file.use-case.spec.ts` (which already exercises the Extension VO end-to-end); no separate `extension.spec.ts` added (YAGNI — would duplicate the same assertions). Also fixed `process-ingesta.use-case.spec.ts`'s "extensión inválida" case, which hardcoded `.pdf` as the unsupported example — swapped to `.csv`.
- [x] 0.4 [RED→GREEN] Added a fast supertest-level spec (`ingesta.controller.upload-limits.spec.ts`, no DB, not the ALLOW_DESTRUCTIVE_DB e2e) instead of an e2e test: `.pdf` >10 MB → 400 before parsing. **Real gap found**: the existing `FileInterceptor limits.fileSize` cap was already correct, but NestJS maps Multer's `LIMIT_FILE_SIZE` to `PayloadTooLargeException` (413) by default — inconsistent with every other file-validation error on this endpoint (400). Added `UploadTooLargeFilter` (`@Catch(PayloadTooLargeException)`, `@UseFilters` on the route) to normalize to 400. Also confirmed no MIME/content-type filter exists (a `.pdf` reaches the orchestrator unblocked).
- [x] 0.5 Add a short inline note at `process-ingesta.use-case.ts` documenting the Option B extension-routing decision (design decision #1) — **deferred to PR5**: PR1 does not touch `process-ingesta.use-case.ts`'s implementation (out of scope per apply instructions); the note belongs next to the actual routing branch, not as an orphan comment.

## Phase 1: `PdfTextExtractor` seam (validates the pdfjs-dist import path FIRST — design risk #3) — ✅ done (PR1)

- [x] 1.1 Added `pdfjs-dist@^6.1.200` (legacy build) to `apps/api/package.json`. No `pnpm approve-builds` prompt was needed (no native postinstall scripts); `pnpm audit --audit-level=high` shows no pdfjs-dist vulnerabilities.
- [x] 1.2 [RED] `pdf-text-extractor.spec.ts`: load `bancoestado-cartola-test.pdf` buffer → `Result.ok` with non-empty positioned tokens `{str,x,y,page}` — proves the legacy import works under NestJS+SWC/vitest.
- [x] 1.3 [GREEN] Implemented `infrastructure/pdf/pdf-text-extractor.ts`. **Deviation from design**: `getDocument({data, disableFontFace:true, useSystemFonts:false})` — `isEvalSupported` was DROPPED because it no longer exists in pdfjs-dist 6.x (present through 4.x, removed along with the internal eval codepath it used to guard; confirmed by diffing the shipped `.d.ts` across versions). Walks pages via `getTextContent()`.
- [x] 1.4 [RED→GREEN] Corrupt/unparseable buffer → `Result.fail(PdfInvalidoError)`, no throw/hang (rejects in ~tens of ms, no hang observed).
- [x] 1.5 [RED→GREEN] Zero-token PDF → `Result.fail(PdfSinTextoError)` — used a hand-built minimal valid PDF with no content stream as the deterministic fixture (`test/fixtures/pdf/sin-texto-test.pdf`), since no real scanned/image-only fixture was available.
- [x] 1.6 Created `domain/errors/pdf-invalido.error.ts` and `pdf-sin-texto.error.ts` (never interpolate raw token text — convention #7).

## Phase 2: Shared pure helpers (fast unit tests, no PDF — design decisions #4, #5) — ✅ done (PR1)

- [x] 2.1 [RED→GREEN] `token-grouping.spec.ts` + `infrastructure/pdf/token-grouping.ts`: `agruparTokens(tokens, rangosX, toleranciaY)` groups rows by Y tolerance, columns by X range, with hand-built fixtures (includes a synthetic Santander-style word-by-word row).
- [x] 2.2 [RED→GREEN] `inferir-anio.spec.ts` + `application/services/inferir-anio.ts`: `inferirAnios(meses[], anioInicial)` — no regression keeps year; Dec→Jan regression increments year for that row and all following (PDF-03 "month regression" scenario).

## Phase 3: Track A / US-008 — PDF bank detection

- [x] 3.1 Create `application/ports/pdf-bank-detector.port.ts` (`IPdfBankDetector`).
- [x] 3.2 [RED→GREEN] BancoEstado strategy against real fixture: anchor `CARTOLA CUENTARUT N°` → `Result.ok(BancoEstado)` (PDF-01 scenario, fixture row 1).
- [x] 3.3 [RED→GREEN] Banco de Chile strategy: anchors `Estado de Cuenta` + `CUENTA CORRIENTE`.
- [x] 3.4 [RED→GREEN] Santander strategy: anchors `BANCO SANTANDER CHILE` + `CARTOLA`.
- [x] 3.5 [RED→GREEN] BCI strategy: anchors `CARTOLA DE CUENTA CORRIENTE` + `BCI`.
- [x] 3.6 [RED→GREEN] Non-bank PDF (no anchors matched) → `Result.fail(BancoNoReconocidoError)` (reuse existing error; PDF-01 scenario "non-bank PDF").
- [x] 3.7 [GREEN] Implement `pdfjs-bank-detector.service.ts` orchestrating the 4 strategies via `PdfTextExtractor`, same order as Excel (BancoEstado→Chile→Santander→BCI, design decision #6).
- [x] 3.8 Create `application/use-cases/detect-pdf-bank.use-case.ts` — thin wrapper mirroring the Excel `DetectBankUseCase`.

## Phase 4: Track B / US-009 — PDF structure validation

- [x] 4.1 Create `infrastructure/pdf/strategies/estructura-pdf-banco.ts` interface + `RangoX`.
- [x] 4.2 Create `domain/errors/estructura-pdf-invalida.error.ts` (aggregates ALL problems in one pass) and `rango-fechas-invalido.error.ts`.
- [x] 4.3 Create `application/ports/pdf-structure-validator.port.ts` (`IPdfStructureValidator`).
- [x] 4.4 [RED→GREEN] Per-bank config validated against its real fixture: period, table-start page, column X ranges match the reference table (PDF-02 scenario 1) — 4 cases (bancoestado/bancochile/bci 01/04–30/04, santander 01/03–31/03).
- [x] 4.5 [RED→GREEN] Mutated header + missing period anchor on one fixture (mock/mutate the loaded text) → `EstructuraPdfInvalidaError` lists both problems together (PDF-02 scenario "multiple problems"). Implemented via synthetic `PagedTokens` against the pure `evaluarEstructura` core (`pdf-structure-extraction.spec.ts`) instead of a mutated real PDF.
- [x] 4.6 [RED→GREEN] BancoEstado/Chile/Santander fixture with no `Fecha Inicio/Final` or `DESDE/HASTA` anchor → `RangoFechasInvalidoError`; BCI exempt (`fuenteAnio.kind==='explicito'`) (PDF-02 scenario "missing period anchor"). Also via synthetic tokens on the pure core.
- [x] 4.7 [GREEN] Implement `pdfjs-structure-validator.service.ts` producing `EstructuraPdfValidada`.
- [x] 4.8 Create `application/use-cases/validate-pdf-structure.use-case.ts` — thin wrapper.

## Phase 5: Track C / US-010 — Normalization (Santander + year inference FIRST — proposal decision #5)

- [x] 5.1 [RED→GREEN] Santander: real fixture → descriptions merged via `agruparTokens` X-range concat (e.g. `Transf a Tercero Maria Ejemplo`); `Resumen de Comisiones` excluded; period 01/03–31/03/2026, **7 movements verified against the real fixture** (PDF-03 santander row). Done in PR4a (`feat/sprint4-pdf-pr4a-normalize-santander`, not yet opened as PR).
- [x] 5.2 [RED→GREEN] Year-crossing: month regression → year increments via `inferirAnios`, wired end-to-end in the pure normalization core (`infrastructure/pdf/pdf-normalization.ts`). Santander's real fixture is single-month (no real crossing to test), so this is proven with a **synthetic Nov→Dec→Jan→Feb token set** at the pure-core level instead (PDF-03 "month regression" scenario, control case). BCI's explicit-per-row-year bypass is also implemented and unit-tested (`'DD/MM/YYYY'` format), though not yet exercised against BCI's real fixture (PR4b). Done in PR4a.
- [x] 5.3 [RED→GREEN] Amount parser (`infrastructure/pdf/parse-monto.ts`, `parsearMontoPdf`): exact integer CLP, no floating-point arithmetic, `$` prefix + thousands separator stripped, cargo/abono selected by column via `agruparTokens`' X-range assignment (PDF-03 "exact integer CLP" scenario). Done in PR4a.
- [x] 5.4 [RED→GREEN] BancoEstado: 2-page concatenation (real fixture: 8 rows page1 + 5 rows page2), 13 movements, year 2026 inferred, `'DD/Mmm'` implemented in `parsearFechaFila` (Spanish month map, case-insensitive, all 12 months tested). **PR4b**. Money total note: the fixture's OWN printed header totals ("Total Cargos $135.010"/"Total Abonos $150.000") do NOT reconcile with the itemized rows — verified row-by-row against each row's printed running balance (saldo corrido: 15.000→35.000→20.000→…→20.000, fully self-consistent). The real, verifiable sum is Cargos=$125.000 / Abonos=$130.000 (pinned in `pdfjs-transaction-normalizer.service.spec.ts`) — flagged as a fixture data-quality quirk (synthetic/anonymized data), not a parsing bug.
- [x] 5.5 [RED→GREEN] Banco de Chile: `SALDO INICIAL`/`SALDO FINAL` rows excluded via the existing `filasIgnoradas` (no `anclaFinTabla` needed/added — confirmed against the real 1-page fixture), 11 movements (all of 02/04..30/04 except the 2 SALDO rows). **PR4b** — no strategy changes needed, PR3's config was already correct; only the core (`normalizarTransaccionesPdf`) needed the general hardening below.
- [x] 5.6 [RED→GREEN] BCI: explicit per-row year (`'DD/MM/YYYY'`, unchanged from PR4a), multiline continuations stitched via new opt-in `EstructuraPdfBanco.fusionarContinuaciones` (BCI only — orphan rows with no date/no cargo/no abono but description text are appended as a suffix to the most recent candidate), browser footer (URL/timestamp/page-indicator) + 2 NEW `filasIgnoradas` guards discovered against the real fixture (repeated table header `^FECHA\s+DESCRIPCION` and repeated document title `CARTOLA DE CUENTA CORRIENTE`, both partially land inside the `descripcion` x-range on page 2 and would otherwise contaminate the last transaction's description), 2-page concatenation, **18 movements exactly** (11 page1 + 7 page2) matching the spec's `~18` estimate. **PR4b**.
- [x] 5.7 Create `application/ports/pdf-transaction-normalizer.port.ts` (`IPdfTransactionNormalizer`) and `application/use-cases/normalize-pdf-transactions.use-case.ts`. Done in PR4a.
- [x] 5.8 Verify canonical output `{fecha, descripcion, cargo, abono}` (numbers, not BigInt) is shape-compatible with the Excel normalizer — money-exactness check (ADR-015). Confirmed for Santander in PR4a; re-verified for BancoEstado/Chile/BCI in PR4b (`PdfjsTransactionNormalizerService` returns `ReadonlyArray<Transaccion>` uniformly for all 4 banks).
- [x] 5.9 (NEW, PR4b hardening — deferred from PR4a) `parsearMontoPdf` no longer silently returns 0 for a malformed non-empty amount: signature changed to `number | null` (mirrors Excel's `parseMontoEntero`). `normalizarTransaccionesPdf`'s core now returns `Result<Transaccion[], EstructuraPdfInvalidaError>` (was a plain array) and accumulates a NEW `MontoIleeible` problem (fila + columna, never the raw value) for any non-empty cargo/abono text that fails to parse, grouping ALL problems in one pass (same UX convention as Excel's `NormalizacionInvalidaError`). Tested for each malformed shape (trailing minus, decimal comma, bad thousands-groups, non-numeric) — legitimately empty columns still resolve to 0 with no error. Santander (7) and the 3 new banks' real fixtures unaffected.
- [x] 5.10 (NEW, PR4b hardening) `tokensSinAsignar` consulted in the core: a recognized transaction row (valid date) whose cargo AND abono are BOTH textually empty, but has an unassigned token shaped like an amount (`$` prefix or thousands-separator group — deliberately excludes bare digit strings like operation/document numbers), now reports a NEW `TokenSinAsignarSospechoso` problem instead of silently becoming a $0/$0 transaction. Verified this does NOT false-positive against any of the 4 real fixtures' deliberately-excluded columns (Saldo/N° Operación/N° Documento/Sucursal) — every real transaction row has at least one of cargo/abono populated, so the gate condition never fires for real data; only synthetic tests exercise the positive case.
- [x] 5.11 (NEW, PR4b hardening) Confirmed `anclaFinTabla` page-safety: none of BancoEstado/Chile/BCI set it — only Santander does (PR4a), unchanged. BancoEstado and BCI are both real 2-page fixtures and both normalize correctly across the page boundary using only `filasIgnoradas` (per-row skip, never a global break), so no multipage/terminator interaction risk was introduced.

## Phase 6: Track D — End-to-end wiring — ✅ done (PR5, `feat/sprint4-pdf-pr5-wiring`)

- [x] 6.1 [Modify] `application/use-cases/process-ingesta.use-case.ts`: extension branch selecting the PDF vs Excel port trio once; extend error union with PDF errors. Also mapped the 4 new PDF error types in `ingesta.controller.ts`'s exhaustive `aHttpException` switch (all → 400, same convention as the Excel validation errors) — required for `tsc` to keep passing the `const exhaustivo: never = error` check once `ProcessIngestaError` grew 4 new variants (not called out explicitly in design.md's File Changes table, but load-bearing).
- [x] 6.2 [Modify] `infrastructure/http/ingesta.module.ts`: register 3 PDF providers (typed tokens + `useFactory`) + constructor params.
- [x] 6.3 [Modify] `infrastructure/cli/`: accept a `.pdf` path argument, mirroring the existing `.xlsx` flow (PDF-04 "CLI ingests a PDF path"). No dedicated CLI test added (YAGNI — the CLI is a thin composition root identical in shape to `IngestaModule`; the routing logic itself is covered by `process-ingesta.use-case.spec.ts`'s new "routing .pdf vs .xlsx" describe block).
- [x] 6.4 [RED→GREEN] e2e (`ALLOW_DESTRUCTIVE_DB=1`): valid PDF → 200, transactions persisted under correct `userId`/`accountId` (PDF-04 scenario 1). `test/ingesta-pdf.e2e-spec.ts`, mirrors `test/ingesta.e2e-spec.ts`. **Written but NOT run to green** — no working DB credentials in the apply sandbox (`Authentication failed against the database server` — confirmed this is an environment limitation, not a regression, by running the pre-existing `.xlsx` e2e file with the same gate: it fails identically on the same DB-touching assertions).
- [x] 6.5 [RED→GREEN] e2e: non-bank PDF → controlled error, no raw PDF text (name/RUT/descriptions) in response or logs (PDF-04 scenario 2). Same file — this scenario (and the >10MB reject) DID run green in the sandbox (they fail before touching the DB).
- [x] 6.6 [RED→GREEN] Parity test D.5: same logical movement via PDF vs XLSX fixtures → equal `{fecha,descripcion,cargo,abono}` (PDF-04 scenario "parity"). `pdf-xlsx-normalization-parity.spec.ts` — 2 tests: (a) structural parity against the 2 REAL normalizer services + real fixtures (Santander PDF, BCI xlsx — different movements, asserts same runtime shape); (b) crafted-movement parity — the identical BancoEstado movement expressed as hand-built PDF tokens (via the pure `normalizarTransaccionesPdf` core, same pattern as `pdf-normalization.spec.ts` — avoids fabricating real PDF binary bytes) vs an in-memory ExcelJS workbook (via the real `ExcelTransactionNormalizerService`), asserting exact `Transaccion` equality.
- [x] 6.7 Verify `user_id` isolation (RNF-SEC-006) unaffected — no new query path bypasses existing repositories (ADR-015 emphasis). Confirmed: `AccountRepository.ensure(input.userId, banco)` and all persistence/categorization calls are UNBRANCHED and identical for both trios — PDF only replaces the detect/validate/normalize calls, never touches `accountRepository`/`persistTransactionsUseCase`/`catalogoClasificacion`/`transaccionBucketWriter`/`txParaClasificarReader`.

## Phase 7: Track E — Documentation reconciliation

- [x] 7.1 Update vault US-009 test values (periods/anchors) to match the reference targets table in the spec. **Done 2026-07-17 (Track E):** 4 periods reconciled (BancoEstado/BancoChile/BCI `2026-04-01`→`2026-04-30`, Santander `2026-03-01`→`2026-03-31`) + dated decision note.
- [x] 7.2 Update vault US-010 test values (movement counts, totals, signals) to match the reference targets; remove the real personal name from CA-04. **Done 2026-07-17 (Track E):** counts corrected to 13/11/7/18, real name → `Transf a Tercero Maria Ejemplo`, real credit doc number → anonymized, BancoEstado header-vs-rows total discrepancy documented. PII grep-confirmed removed from the whole vault (also from Sprint-4.md's debt table); only the ADR-005 author signature remains (legitimate, out of scope).
