# Exploration — sprint4-pdf-ingesta

> SDD explore phase. Read-only investigation grounding the Sprint 4 proposal:
> bring PDF bank-statement ingestion to parity with the existing `.xlsx` pipeline
> (US-008/009/010, mirrors of US-006/002/007). ADR-009: `pdfjs-dist`, no OCR.

## Executive summary

The `.xlsx` pipeline is fully traced (Extension VO → `IngestFileUseCase` →
`ProcessIngestaUseCase` orchestrator → per-stage ports/Excel adapters → 4 bank
strategies → `Result`/BigInt-safe persistence). Two gaps must be resolved before
proposing:

1. **No format-routing mechanism exists anywhere in the current DI graph.**
   `IngestaModule` wires one hardcoded Excel adapter per stage. The proposal must
   explicitly choose between ADR-009's original `IPdfReader`-in-`IngestFileUseCase`
   sketch vs. the sprint plan's per-stage PDF ports routed inside
   `ProcessIngestaUseCase`.
2. **`pdfjs-dist` is not yet a dependency and the ADR-009 spike script
   (`apps/api/scripts/spike-pdf.ts`) does not exist in the repo.** Its documented
   `(x,y)` findings are unverified against this codebase and must be re-established
   as real work, not assumed.

## Pipeline trace (all paths under `apps/api/src/`)

| Stage | File / class | Notes |
|-------|--------------|-------|
| Extension gate | `domain/value-objects/extension.ts` | `EXTENSIONES_PERMITIDAS = ['.xlsx']`; `Extension.desdeNombreArchivo()` throws `ExtensionNoPermitidaError`. Docstring stale ("solo .xls y .xlsx"). |
| Ingest | `application/use-cases/ingest-file.use-case.ts` | Validates extension + extracts buffer/metadata, no dispatch. `ingest-file.use-case.spec.ts:78-79` currently **asserts `.pdf` is rejected** → must change in Tarea 0.1. |
| Orchestrator | `application/use-cases/process-ingesta.use-case.ts` | IngestFile → DetectBank → AccountRepository.ensure → ValidateStructure → NormalizeTransactions → PersistTransactions → best-effort Categorizar (try/catch island, never fails the ingesta). Never throws; wraps errors in `PersistenciaFallidaError` without leaking amounts. |
| Composition root | `infrastructure/http/ingesta.module.ts` | `DetectBankUseCase`, `ValidateStructureUseCase`, `NormalizeTransactionsUseCase` each wired via `useFactory` with a single hardcoded `new Excel*Service()` — **no branching by format anywhere**. |
| Detect | `IBankDetector` → `ExcelBankDetectorService` | 4 ordered strategies: BancoEstado first/most specific, BCI last/most generic. |
| Validate | `IStructureValidator` → `ExcelStructureValidatorService` | `ValidatedStructure{banco, filaEncabezados, primeraFilaDatos, totalFilasDatos}`. |
| Normalize | `ITransactionNormalizer` → `ExcelTransactionNormalizerService` | Uses each strategy's `getMapeoCanonico(): MapeoCanonico`. |
| Strategies | `infrastructure/excel/strategies/{banco-chile,banco-estado,bci,santander}.strategy.ts` | Each exposes `matches()`, `extract()`, `getEstructura()`, `getMapeoCanonico()` — the trio the PDF strategies must mirror. |
| Canonical output | `domain/value-objects/transaccion.ts` | `{fecha:Date, descripcion:string, cargo:number, abono:number}` — **`number`, not bigint**, at domain layer. |
| Money boundary | `infrastructure/persistence/transaccion.mapper.ts` | `number ↔ BigInt` (`aBigIntEntero`/`aNumberSeguro`), guarded by `Number.MAX_SAFE_INTEGER`. Exact contract the PDF normalizer output must satisfy. |
| HTTP | `infrastructure/http/multer-file-reader.adapter.ts` + `ingesta.controller.ts` | `FileInterceptor` already has `limits: { fileSize: 10*1024*1024 }` (10 MB, matches ADR-009) and **no MIME `fileFilter`** — any MIME already passes Multer; the real gate is the Extension VO by filename suffix. Tarea 0.3 is mostly already satisfied structurally. |

## pdfjs-dist / spike gap

- `pdfjs-dist` is **absent** from `apps/api/package.json` (deps and devDeps).
- No `apps/api/scripts/` directory exists — the spike file ADR-009 cites as having
  already produced its findings table is **not in the repo**.
- The 4 PDF fixtures **do exist** and match ADR-009's per-bank description:
  `apps/api/test/fixtures/pdf/{bancoestado,bancochile,santander,bci}-cartola-test.pdf`.

## Testing pattern

- Vitest + `unplugin-swc` (Nest decorator metadata, ADR-016).
- Excel strategy/service specs mostly build **synthetic in-memory workbooks** via
  `new ExcelJS.Workbook()` rather than only real fixtures. **There is no equivalent
  easy synthetic-PDF builder**, so PDF tests will lean directly on the 4 real
  fixtures — a testing-pattern divergence worth naming in the proposal.
- e2e/integration gated by `ALLOW_DESTRUCTIVE_DB=1`.

## Reference test targets (source of truth — older US-009/010 notes are stale)

| Fixture | Period | Movements | Signals |
|---------|--------|-----------|---------|
| bancoestado-cartola-test.pdf | 01/04/2026–30/04/2026 | ~13 | Cargos $135.010 / Abonos $150.000; 2 pages; year 2026 inferred |
| bancochile-cartola-test.pdf | 01/04/2026–30/04/2026 | ~11 | SALDO INICIAL/FINAL excluded |
| santander-cartola-test.pdf | 01/03/2026–31/03/2026 | ~7 | token-merged descriptions; Resumen de Comisiones excluded |
| bci-cartola-test.pdf | 01/04/2026–30/04/2026 | ~18 (2 pages) | browser footer excluded; year explicit per row |

## Risks / open questions for the proposal

1. **Format-routing location is undecided and architecturally significant.**
   ADR-009 sketch: new `IPdfReader` port dispatched from `IngestFileUseCase`.
   Sprint plan: separate `IPdfBankDetector`/`IPdfStructureValidator`/
   `IPdfTransactionNormalizer` ports routed inside `ProcessIngestaUseCase`. Different
   blast radius (constructor size of `ProcessIngestaUseCase` doubling vs. composite
   router adapters behind the existing single-port interfaces). Resolve in propose/design.
2. **pdfjs-dist not installed + spike artifact missing** — do not assume the library
   choice is empirically validated in this repo; re-running/committing the spike (or
   building the adapter directly against the 4 fixtures) is in-scope.
3. **Santander word-by-word token merge and BCI browser-footer filter** are
   bank-specific, fragile-by-nature (ADR-009) — consider a shared X/Y-grouping helper
   to avoid 4× duplicated positional logic.
4. **Testing-pattern divergence** — no cheap synthetic-PDF path like
   `ExcelJS.Workbook()`; PDF unit tests lean on the 4 real fixtures.
5. **Track E stale-fixture doc debt is real** — the sprint plan's reference table is
   the source of truth going forward.

## Artifacts

- Engram: topic_key `sdd/sprint4-pdf-ingesta/explore` (observation id 170)
- File: this document

## Next recommended

`sdd-propose` — with the format-routing fork (#1) as the primary decision to resolve.
