# Design: sprint4-pdf-ingesta (PDF ingestion at parity)

## Technical Approach

Add a **second front end** (detect → validate → normalize) for `.pdf`, mirroring the
Excel port/adapter/strategy shape, emitting the SAME canonical `Transaccion[]` so
persistence/categorization/consolidation stay untouched. Routing is a single
extension branch inside `ProcessIngestaUseCase` (Option B, fixed). pdfjs-dist is
confined to `infrastructure/pdf/` behind the 3 new ports.

## Architecture Decisions

| # | Decision | Choice | Rejected | Rationale |
|---|----------|--------|----------|-----------|
| 1 | Routing | Branch on `archivo.extension` inside `ProcessIngestaUseCase`; select the PDF vs Excel trio into locals once | Option A (`IPdfReader` in `IngestFileUseCase`); composite adapter behind existing ports | `validate/normalize` ports carry no filename, so a composite router can't branch — orchestrator owns the one decision point (fixed #1). Excel path unchanged |
| 2 | PDF load seam | ONE shared `PdfTextExtractor` in `infrastructure/pdf/` returns positioned tokens; all 3 services consume it | Each adapter reimplements pdfjs glue (3× hardened-config + token logic) | DRY logic seam, SRP-clean (only extracts), infra-only (no layer crossed). 3 real consumers day-one satisfies rule-of-three |
| 3 | Re-parse per stage | Accept 3× parse across stages (ports stay stateless, buffer-in) | Thread tokens through ports (breaks the buffer+banco mirror) | Mirrors Excel's existing 3× `workbook.xlsx.load`. Cross-stage token cache deferred (YAGNI) with a profiling trigger |
| 4 | X/Y grouping | ONE shared `agruparTokens` helper (rows by Y tolerance, columns by X range) in `infrastructure/pdf/` | Per-strategy positional logic (4× dup) | 4 consumers day-one. Santander's "word-by-word merge" is just column-range concatenation — no special case once ranges exist (KISS+DRY) |
| 5 | Year inference | Pure isolated helper `inferirAnios(meses[], anioInicial)` in `application/services/` | Inline in each strategy | Pure business rule, no pdfjs — testable in isolation, DIP-clean |
| 6 | Bank strategies | Mirror Excel order: BancoEstado→Chile→Santander→BCI (specific→generic) | Re-order | Keep the known ordering; BCI (most generic anchor) stays last |
| 7 | Error scrub | Reuse the existing **convention** (never interpolate raw token text into messages) | New shared util | No scrub helper exists in the repo; `EstructuraInvalidaError` already encodes the convention. Outer catch wraps throws in `PersistenciaFallidaError` |

## Data Flow

    buffer + extension
       │  (.pdf → PDF trio | .xlsx → Excel trio, chosen once)
       ▼
    DetectPdfBank ─→ ValidatePdfStructure ─→ NormalizePdfTransactions ─→ Transaccion[]
       │                 │                        │                          │
       └──── all call ───┴── PdfTextExtractor ────┘        (identical shape) ─┴─→ Persist → Categorize (UNTOUCHED)

`PdfTextExtractor.extract(buffer)` → `Result<PagedTokens, PdfInvalidoError | PdfSinTextoError>`
where `PagedTokens = ReadonlyArray<{ str: string; x: number; y: number; page: number }>`.

## Interfaces / Contracts

```ts
// application/ports/pdf-bank-detector.port.ts
export interface IPdfBankDetector {
  detect(buffer: Buffer, originalName: string):
    Promise<Result<DetectedBank, BancoNoReconocidoError | PdfInvalidoError | PdfSinTextoError>>;
}
// application/ports/pdf-structure-validator.port.ts
export interface IPdfStructureValidator {
  validate(buffer: Buffer, banco: BancoConocido):
    Promise<Result<EstructuraPdfValidada, EstructuraPdfInvalidaError | RangoFechasInvalidoError>>;
}
// application/ports/pdf-transaction-normalizer.port.ts
export interface IPdfTransactionNormalizer {
  normalize(buffer: Buffer, banco: BancoConocido):
    Promise<Result<ReadonlyArray<Transaccion>, EstructuraPdfInvalidaError | RangoFechasInvalidoError>>;
}
// infrastructure/pdf/strategies/estructura-pdf-banco.ts
export interface RangoX { readonly col: 'fecha'|'descripcion'|'cargo'|'abono'; readonly xMin: number; readonly xMax: number; }
export interface EstructuraPdfBanco {
  readonly banco: BancoConocido;
  readonly anclasEncabezado: ReadonlyArray<string>;   // page-1 header anchors
  readonly anclasPeriodo: { desde: RegExp; hasta: RegExp };
  readonly rangosX: ReadonlyArray<RangoX>;
  readonly toleranciaY: number;
  readonly formatoFecha: 'DD/Mmm'|'DD/MM'|'DD/MM/YYYY';
  readonly fuenteAnio: { kind: 'inferido'; desde: 'periodo-inicio' } | { kind: 'explicito' };
  readonly filasIgnoradas: ReadonlyArray<RegExp>;      // SALDO INICIAL/FINAL, Resumen Comisiones, footer
}
```

`EstructuraPdfInvalidaError` mirrors `EstructuraInvalidaError`: takes `banco` +
`ReadonlyArray<ProblemaEstructuraPdf>`, aggregating ALL problems in one pass; message
never interpolates raw token values.

**Year algorithm:** walk rows in statement order; `anio = anioInicial`; when
`mesActual < mesPrevio`, `anio++` (Jan crossing). BancoEstado/Chile/Santander use it;
BCI (`fuenteAnio.kind==='explicito'`) bypasses and reads the per-row year.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `domain/value-objects/extension.ts` (+spec) | Modify | Accept `.pdf`; fix stale docstring |
| `application/use-cases/ingest-file.use-case.spec.ts` | Modify | Invert `.pdf`-rejected assertion (:78) |
| `application/ports/pdf-*.port.ts` | Create | 3 new PDF ports |
| `domain/errors/{pdf-invalido,pdf-sin-texto,estructura-pdf-invalida,rango-fechas-invalido}.error.ts` | Create | PDF error taxonomy |
| `infrastructure/pdf/pdf-text-extractor.ts` | Create | Hardened single load + tokens |
| `infrastructure/pdf/token-grouping.ts` | Create | Shared `agruparTokens` |
| `infrastructure/pdf/pdfjs-*.service.ts` + `strategies/*.strategy.ts` | Create | 3 adapters + 4 strategies |
| `application/services/inferir-anio.ts` | Create | Pure year helper |
| `application/use-cases/{detect,validate,normalize}-pdf-*.use-case.ts` | Create | 3 thin wrappers mirroring Excel |
| `application/use-cases/process-ingesta.use-case.ts` | Modify | Extension branch + PDF error union |
| `infrastructure/http/ingesta.module.ts` | Modify | 3 PDF providers + constructor params |
| `infrastructure/cli/` | Modify | Accept `.pdf` |
| `apps/api/package.json` | Modify | Add `pdfjs-dist` |

## pdfjs-dist under NestJS + SWC

Import the **legacy** build, isolated to `pdf-text-extractor.ts` (one file = one place
for any ESM/CJS interop workaround). No worker thread (node legacy); harden the load:
`getDocument({ data, isEvalSupported:false, disableFontFace:true, useSystemFonts:false })`.
Validate the import path FIRST — it gates every adapter (proposal risk #3). Zero text
tokens after load → `PdfSinTextoError` (no OCR).

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Unit (pure) | `agruparTokens`, `inferirAnios` | Hand-built token/month fixtures, no PDF — fast |
| Unit (adapters) | period, count, totals, junk-row exclusion per bank | Load the 4 real `test/fixtures/pdf/*.pdf` buffers (no synthetic builder) |
| Parity D.5 | same movement PDF vs XLSX → equal `Transaccion` | Normalize both paths, assert `{fecha,descripcion,cargo,abono}` equal |
| E2E | PDF→200+rows; >10 MB→400; non-bank→controlled error | HTTP, gated `ALLOW_DESTRUCTIVE_DB=1` |

## Security

Hardened reader config lives ONLY in `PdfTextExtractor`. 10 MB cap stays at the
existing Multer `FileInterceptor` boundary (confirmed) + explicit reject-over-cap test.
Error messages never carry token text (names/RUT/amounts) — same convention as the
US-011 HTTP 400 boundary.

## Migration / Rollout

Pure addition. Excel path byte-for-byte unchanged; the only orchestrator change is the
extension branch. No DB migration, no feature flag. Rollback = revert (Excel unaffected).

## Open Questions

- [ ] None blocking. Cross-stage token cache intentionally deferred (YAGNI, profiling trigger).
