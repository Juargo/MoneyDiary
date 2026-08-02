# Design — US-003: Vista previa de datos antes de confirmar la carga

> SDD design phase for change `us-003-vista-previa` (issue #155). Architectural
> HOW, not task steps. The big rocks are LOCKED by the proposal
> (`sdd/us-003-vista-previa/proposal`): Approach A stateless re-upload, a new
> `PreviewIngestaUseCase` with **no write ports**, preview seam stops after
> normalize, canonical BigInt-safe DTO capped at 50, confirm reuses the existing
> `POST /api/ingestas` unchanged, web + mobile. This document designs the details
> and locks the non-obvious decisions the proposal deferred (§6 open questions).

## 1. Scope recap (from proposal, verified against code)

Verified against the codebase (not assumed):

- `ProcessIngestaUseCase.runPipeline` (process-ingesta.use-case.ts:135) runs:
  `ingest → esPdf branch → detect → accountRepository.ensure (WRITE, line 163)
  → validate → normalize → detectarDuplicados → persist → categorizar`. The
  preview must reuse **only** `ingest → detect → validate → normalize` and stop.
  The `accountRepository.ensure()` upsert (line 163) and everything after it are
  **absent** from the preview graph.
- The dual-format routing is a single `const esPdf = archivo.extension === '.pdf'`
  branch (line 147) selecting one of two trios: `DetectBank/DetectPdfBank`,
  `ValidateStructure/ValidatePdfStructure`, `NormalizeTransactions/NormalizePdfTransactions`.
  `IngestFileUseCase` is format-agnostic (runs first, produces `archivo.extension`).
- `Transaccion` (transaccion.ts) carries `fecha: Date`, `descripcion: string`,
  `cargo: bigint`, `abono: bigint` — money is **BigInt in the whole domain**.
  The canonical schema is bank-agnostic (US-007): normalize already erases raw
  bank column names, so CA-02 ("as the system will interpret it") maps directly
  to Fecha / Descripción / Cargo / Abono with **no new port** to surface raw
  headers (surfacing them would in fact contradict CA-02).
- `TransaccionResponseDto` (ingesta-response.dto.ts:19) already serializes money
  as **string** via `String(tx.cargo)` at the HTTP boundary — the preview DTO
  mirrors this exact discipline.
- The route factory `registrarIngestas(router, deps)` (ingesta.routes.ts:50)
  already takes a **deps object** (`processIngesta`, `eliminarIngesta`,
  `listarIngestas`) after US-018 — adding `previewIngesta` is a fourth field, not
  a signature reshape. `subirArchivo()` (line 127) is the reusable in-memory
  multer + 10 MB gate. `aHttpError` (line 155) is the reusable domain-error→HTTP
  mapper.

## 2. Architecture approach

Clean Architecture, dependency rule `domain ← application ← infrastructure`
(ADR-005), `Result<T,E>` in domain/application (never throw). Mirror
`ProcessIngestaUseCase` as a **sibling orchestrator**, not a refactor: the
existing confirm pipeline is untouched (honoring the proposal lock "confirm
reuses existing `POST /api/ingestas` unchanged").

| Layer | Element | New? |
|---|---|---|
| Domain | — nothing new | — |
| Application | `PreviewIngestaUseCase` + `PreviewIngestaResult` (read model) + `PreviewIngestaError` (union) + `PREVIEW_SAMPLE_MAX` | new |
| Infrastructure (API) | `POST /api/ingestas/preview` handler · `preview-ingesta.dto.ts` · `crear-preview-ingesta.ts` · container/app.ts wiring | new + 2 edits |
| Infrastructure (web) | `usePreviewIngesta` hook · `previewIngesta` client fn · `PreviewIngestaDto` type · `SubirCartola.tsx` two-phase | new + edits |
| Infrastructure (mobile) | `preview-ingesta.ts` client · preview view-model (pure) · `subir.tsx` two-phase | new + edits |

**No new domain VO, no new port, no new Prisma adapter.** This is the single most
important structural fact of the change: preview is pure re-composition of
existing, already-tested, no-write collaborators plus one boundary DTO. Contrast
US-018, which needed new ports, adapters and a DB isolation integration test —
preview needs **none of that** because it touches no database.

## 3. THE key design decision — CA-04 as a compile-time guarantee

CA-04 ("on preview or cancel, **nothing is persisted**") is not enforced by a
runtime check or a test that could regress. It is enforced by **construction**:
`PreviewIngestaUseCase` is built with **zero** ports that can reach the database.

### 3.1 The constructor is the proof

```ts
export class PreviewIngestaUseCase {
  constructor(
    private readonly ingestFileUseCase: IngestFileUseCase,
    private readonly detectBankUseCase: DetectBankUseCase,
    private readonly detectPdfBankUseCase: DetectPdfBankUseCase,
    private readonly validateStructureUseCase: ValidateStructureUseCase,
    private readonly validatePdfStructureUseCase: ValidatePdfStructureUseCase,
    private readonly normalizeTransactionsUseCase: NormalizeTransactionsUseCase,
    private readonly normalizePdfTransactionsUseCase: NormalizePdfTransactionsUseCase,
  ) {}
}
```

Compare to `ProcessIngestaUseCase`'s constructor (process-ingesta.use-case.ts:98)
which additionally injects `accountRepository` (write: `ensure()` upsert),
`persistTransactionsUseCase`, `transaccionBucketWriter`, `catalogoClasificacion`,
`txParaClasificarReader`, `detectarDuplicadosUseCase`. **None of those seven are
in the preview constructor.** The class literally has no reference through which
to persist, upsert an account, dedupe, or categorize. "Nothing is persisted on
preview" is therefore **structurally impossible to violate** — a stronger
guarantee than any test, and the reason preview is a separate use case rather
than a `dryRun` flag on the existing pipeline (a flag would keep the write ports
in scope and reduce CA-04 to a runtime branch that a future edit could break).

### 3.2 `accountRepository.ensure()` MUST NOT be in the preview path

The subtle trap: `ensure(userId, banco)` (process-ingesta.use-case.ts:163) is an
**upsert** — a WRITE that fires mid-pipeline in the confirm flow to guarantee the
account row exists. It runs **before** validate/normalize. A naive "just skip
persist" preview that still called `ensure()` would create an `Account` row on
every preview of a never-before-seen bank — a silent write on a supposedly
read-only path, breaking CA-04. The design forbids this at the type level:
`IAccountRepository` is **not injected**, so `ensure()` is unreachable. The
preview seam goes `detect → validate` directly, with **no account resolution
step** between them.

### 3.3 The preview seam (execute body)

```ts
async execute(
  input: PreviewIngestaInput,           // { fileReader: IFileReader } — NO userId
): Promise<Result<PreviewIngestaResult, PreviewIngestaError>> {
  const ingest = this.ingestFileUseCase.execute(input.fileReader);
  if (ingest.isFail()) return Result.fail(ingest.getError());
  const archivo = ingest.getValue();

  // Faithful mirror of the confirm pipeline's single esPdf branch (see §4).
  const esPdf = archivo.extension === '.pdf';

  const detect = esPdf
    ? await this.detectPdfBankUseCase.execute(archivo.buffer, archivo.originalName)
    : await this.detectBankUseCase.execute(archivo.buffer, archivo.originalName);
  if (detect.isFail()) return Result.fail(detect.getError());
  const banco = detect.getValue();

  // NO accountRepository.ensure() here — the write is structurally absent (§3.2).

  const validate = esPdf
    ? await this.validatePdfStructureUseCase.execute(archivo.buffer, banco.banco)
    : await this.validateStructureUseCase.execute(archivo.buffer, banco.banco);
  if (validate.isFail()) return Result.fail(validate.getError());
  // validate runs for its error side-effects (estructura/rango-fechas); its
  // structural return value is NOT used for the count (see §5, decision D5).

  const normalize = esPdf
    ? await this.normalizePdfTransactionsUseCase.execute(archivo.buffer, banco.banco)
    : await this.normalizeTransactionsUseCase.execute(archivo.buffer, banco.banco);
  if (normalize.isFail()) return Result.fail(normalize.getError());
  const transacciones = normalize.getValue();

  return Result.ok({
    banco,
    estructura: { totalFilasDatos: transacciones.length },
    muestra: transacciones.slice(0, PREVIEW_SAMPLE_MAX),
  });
}
```

Input is `{ fileReader }` only — **no `userId`**. The preview use case never
scopes by tenant because it touches no tenant data; the route has `userId`
available (session middleware) but does not forward it. This reinforces the
no-write nature at the signature level.

## 4. PDF/Excel routing — duplicate the branch (accepted DRY concession)

The `esPdf` trio-selection branch now lives in **two** orchestrators. Per the
proposal (§5) and YAGNI/three-strikes, this is a **conscious, accepted
duplication**, not a refactor target for this slice:

- **Rejected: extract a shared `detectarYNormalizar` step now.** With exactly two
  consumers, extraction is premature (YAGNI rule "three strikes, then abstract").
  The branch is ~12 lines of trio selection; the extracted abstraction would need
  to thread `archivo`, `banco`, and the format flag through a new seam for no
  present benefit.
- **Divergence risk (the real cost, flagged for apply + review):** the two copies
  MUST stay a **faithful mirror**. Both select the *same* pairs
  (`DetectBank`↔`DetectPdfBank`, etc.) off the *same* `archivo.extension === '.pdf'`
  predicate. A divergence (e.g. preview using a different normalizer, or a
  different extension predicate) would make the preview **lie** about what confirm
  will do — a correctness bug, not a cosmetic one. The apply phase must copy the
  branch verbatim; a reviewer must diff the two `esPdf` blocks.

The same reasoning applies to the **composition factory** (§7): the 7 parsing-service
`new` lines are duplicated between `crearProcessIngesta` and `crearPreviewIngesta`.
Accepted (2 sites); a `crearPasosParseo()` extraction is a valid *later* move at
the third consumer, registered here as deferred debt with an explicit trigger.

## 5. Preview DTO + sample result shape

### 5.1 Application read model (`preview-ingesta.use-case.ts`)

```ts
export const PREVIEW_SAMPLE_MAX = 50;   // server cap = max selectable value (CA-01)

export interface PreviewIngestaInput {
  fileReader: IFileReader;              // no userId — no tenant scope on preview
}

export interface PreviewIngestaResult {
  banco: DetectedBank;                  // banco / tipoCuenta / numeroCuenta
  estructura: { totalFilasDatos: number };
  muestra: ReadonlyArray<Transaccion>;  // ≤ PREVIEW_SAMPLE_MAX
}

export type PreviewIngestaError =
  | ExtensionNoPermitidaError
  | BancoNoReconocidoError
  | EstructuraInvalidaError
  | NormalizacionInvalidaError
  | PdfInvalidoError
  | PdfSinTextoError
  | EstructuraPdfInvalidaError
  | RangoFechasInvalidoError
  | PersistenciaFallidaError;           // ONLY as the defensive catch-all (§6)
```

`PreviewIngestaResult` is an **application read model** colocated in the use-case
file (same convention as `ProcessIngestaResult`), **not a domain VO** — it has no
invariant to protect, so a `crear`-guarded VO would be empty ceremony (KISS/YAGNI).
The `muestra` carries `Transaccion` domain VOs directly (already valid by
construction).

**D5 — `totalFilasDatos` = normalized `transacciones.length`, uniformly for
Excel and PDF.** This *diverges* from `ProcessIngestaUseCase`'s `estructuraResumen`
(process-ingesta.use-case.ts:236), which discriminates `'paginaInicioTabla' in
estructura` and uses the Excel validate row-count for Excel. Rationale:
- CA-03 asks for "the total row count the file **will contribute**." The most
  truthful number is the count that will actually be imported (pre-dedupe) =
  **normalized** count, not the raw sheet-row count (which can include rows the
  normalizer drops).
- It removes the `estructura`-shape discrimination from preview entirely — the
  validate result value is discarded (validate still runs for its *errors*),
  which is simpler (KISS) and shrinks the mirrored surface from §4.
- Confirm does **not** expose `estructura` over HTTP anyway (it is CLI-cosmetic —
  see the comment at ingesta-response.dto.ts, `estructura` never travels in the
  DTO), so there is no cross-endpoint contract to keep identical here.
- Consequence to document: `totalFilasDatos` is the **pre-dedupe** count. On
  confirm, dedupe (US-005) may import fewer (the confirm response's
  `duplicadosOmitidos` reports that). Preview is honest about scope: dedupe is a
  confirm-time business step, explicitly OUT of preview (proposal §3).

### 5.2 HTTP DTO (`infrastructure/http/dto/preview-ingesta.dto.ts`, new)

```ts
export interface PreviewTransaccionDto {
  fecha: string;          // ISO-8601
  descripcion: string;
  cargo: string;          // BigInt-safe — String(tx.cargo)
  abono: string;          // BigInt-safe — String(tx.abono)
}

export interface PreviewIngestaDto {
  banco: string;                          // banco.banco
  tipoCuenta: string;                     // banco.tipoCuenta
  numeroCuenta: string;                   // banco.numeroCuenta
  estructura: { totalFilasDatos: number };
  muestra: ReadonlyArray<PreviewTransaccionDto>;   // already ≤50 from the use case
}

export function aPreviewIngestaDto(data: PreviewIngestaResult): PreviewIngestaDto {
  return {
    banco: data.banco.banco,
    tipoCuenta: data.banco.tipoCuenta,
    numeroCuenta: data.banco.numeroCuenta,
    estructura: { totalFilasDatos: data.estructura.totalFilasDatos },
    muestra: data.muestra.map((tx) => ({
      fecha: tx.fecha.toISOString(),
      descripcion: tx.descripcion,
      cargo: String(tx.cargo),
      abono: String(tx.abono),
    })),
  };
}
```

**D6 — include `tipoCuenta`/`numeroCuenta` in the DTO (free from `DetectedBank`).**
They reinforce CA-02 ("this is the account/bank the system detected") and match
the header the user will see on the confirm success panel, so the preview and the
final result read consistently. Trivial cost, real trust benefit.

**D7 — duplicate the 4-field row mapping; do NOT touch `ingesta-response.dto.ts`.**
`PreviewTransaccionDto` is structurally identical to `TransaccionResponseDto`, so
an extraction (`aTransaccionResponseDto(tx)`) shared by both files was considered.
**Rejected** to honor the proposal lock "confirm reuses the existing
`POST /api/ingestas` unchanged": extracting would edit the confirm response path
(behavior-preserving, but still an edit to locked-unchanged code and a new
cross-feature coupling). KISS: 4 trivial `String()`/`toISOString()` lines
duplicated beat coupling two features + widening the confirm blast radius. This is
the same sanctioned cross-boundary duplication as the hand-written client DTOs
(ADR-008/011). The money-string contract is enforced by the `cargo: string` type,
not by sharing the function.

**D8 — the DTO does NOT re-cap `muestra`.** The ≤50 cap is a use-case decision
(applied in `execute` via `PREVIEW_SAMPLE_MAX`); the DTO just serializes what it
receives (SRP — one owner of the cap).

## 6. Preview error contract

The preview error union is a **subset** of `ProcessIngestaError`: the same 8
file-validation errors, plus `PersistenciaFallidaError` used **only** as the
defensive catch-all wrapper (never from a persist step — there is no persist).
Every business error is absent by construction (no dedupe → no duplicate error;
no categorize → no catalog error).

**Route mapping reuses the existing `aHttpError`** (ingesta.routes.ts:155). Every
member of `PreviewIngestaError` is a member of `ProcessIngestaError`, so a
`PreviewIngestaError` value is assignable to `aHttpError(error:
ProcessIngestaError)` — no new mapper. This is a real DRY win: domain-error→HTTP-status
stays single-sourced. Result:

| Failure | Error | HTTP |
|---|---|---|
| Bad/unsupported extension | `ExtensionNoPermitidaError` | 400 (scrubbed) |
| Bank not recognized | `BancoNoReconocidoError` | 400 |
| Excel structure invalid | `EstructuraInvalidaError` | 400 |
| Normalization invalid | `NormalizacionInvalidaError` | 400 |
| PDF corrupt / no text / bad structure | `PdfInvalidoError` / `PdfSinTextoError` / `EstructuraPdfInvalidaError` | 400 |
| Date range invalid | `RangoFechasInvalidoError` | 400 |
| Missing `file` field | (route guard, no domain error) | 400 |
| File > 10 MB | multer `LIMIT_FILE_SIZE` (`subirArchivo`) | 400 |
| Unexpected adapter throw | `PersistenciaFallidaError` (defensive wrap) | 500 |

**D9 — defensive catch wraps unexpected throws in `PersistenciaFallidaError`
with a preview-specific fixed message.** Like `ProcessIngestaUseCase` (lines
118-133), the ExcelJS/pdfjs adapters can throw instead of returning `Result`
(e.g. a corrupt file crashing the parser). The preview use case wraps any such
throw:
`Result.fail(new PersistenciaFallidaError('fallo inesperado durante la vista previa de ingesta', cause))`.
The **money-scrub guarantee is the reason** for this catch: the raw error may
contain sensitive amounts read from a cell; the fixed message never interpolates
it, and the cause is preserved separately (not in the message). Rejected
alternatives:
- *Let the throw propagate to `errorMiddleware`* — risks leaking the raw error
  message unless errorMiddleware also scrubs; wrapping at the use case keeps the
  scrub local and proven, exactly as the confirm pipeline already does.
- *Introduce a new `PreviewFallidaError`* — YAGNI for one call site; `PersistenciaFallidaError`
  is already the established "unexpected infra/parse failure → 500 with fixed
  scrubbed message" carrier. Its name reads slightly broader than literal
  "persistencia," which is documented here as an accepted, minor naming stretch
  in exchange for keeping the error union small and reusing `aHttpError` verbatim.

## 7. Composition

### 7.1 `apps/api/src/composition/crear-preview-ingesta.ts` (new)

```ts
export function crearPreviewIngesta(): PreviewIngestaUseCase {
  return new PreviewIngestaUseCase(
    new IngestFileUseCase(),
    new DetectBankUseCase(new ExcelBankDetectorService()),
    new DetectPdfBankUseCase(new PdfjsBankDetectorService()),
    new ValidateStructureUseCase(new ExcelStructureValidatorService()),
    new ValidatePdfStructureUseCase(new PdfjsStructureValidatorService()),
    new NormalizeTransactionsUseCase(new ExcelTransactionNormalizerService()),
    new NormalizePdfTransactionsUseCase(new PdfjsTransactionNormalizerService()),
  );
}
```

**The factory takes NO arguments** — no `prisma`, no `crypto`. This is the
composition-level echo of §3: the preview graph cannot be handed a DB handle or a
crypto key because it has nowhere to put one. Contrast `crearProcessIngesta(prisma,
crypto)` (crear-process-ingesta.ts:46). A reviewer seeing `crearPreviewIngesta()`
with an empty parameter list can conclude "this path cannot write" without reading
the use case.

### 7.2 `container.ts` + `app.ts` (edit)

- `container.ts`: add `readonly previewIngesta: PreviewIngestaUseCase` to the
  `Container` interface; `const previewIngesta = crearPreviewIngesta();` in
  `createContainer`; include it in the returned object. It needs neither `prisma`
  nor the shared `crypto` instance (both already constructed for the confirm/read
  graph) — a visible signal of its no-write nature.
- `app.ts`: add `previewIngesta: container.previewIngesta` to the
  `registrarIngestas(protectedApi, { ... })` deps object. Preview mounts on the
  **same `protectedApi`** router as POST/GET/DELETE ingestas (behind
  `apiKey → session → error`).

## 8. Endpoint + middleware

**D1 — `POST /api/ingestas/preview` (distinct sub-path, not `?dryRun=true`).**
Chosen over a query flag on the persisting endpoint: a sub-path keeps the
no-side-effect path **visibly distinct** and avoids a boolean that flips whether a
call has side effects (a `dryRun=false` typo must never silently persist). Locked
per proposal §6.1 recommendation.

Handler (extends `registrarIngestas`, reusing `subirArchivo()` + `aHttpError`):

```ts
router.post('/ingestas/preview', subirArchivo(), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'No se recibió ningún archivo. Envía el archivo en el campo "file".' });
      return;
    }
    const fileReader = new MulterFileReaderAdapter(file);
    const result = await deps.previewIngesta.execute({ fileReader });
    if (result.isFail()) {
      const { status, message } = aHttpError(result.getError());
      res.status(status).json({ message });
      return;
    }
    res.status(200).json(aPreviewIngestaDto(result.getValue()));
  } catch (err) {
    next(err);
  }
});
```

`IngestaRoutesDeps` gains `previewIngesta: PreviewIngestaUseCase` (a 4th field).
Same multipart contract as confirm (field `file`, 10 MB, in-memory), same
`MulterFileReaderAdapter`, same error shape — a client can reuse its upload
transport wholesale, only swapping the URL.

**D2 — keep the `apiKey → session → error` middleware chain on preview, even
though the use case ignores `userId`.** Justification (proposal §6.4 confirmed):
- **Consistency** — every other `/api/*` route is authenticated; a lone public
  route is a special-case divergence with no benefit.
- **Non-speculative security** — an unauthenticated preview would let anyone burn
  server CPU parsing arbitrary 10 MB files (a cheap parse-DoS). Requiring a valid
  session is a real, present mitigation, not future-proofing.
- **`userId` availability** — it is present on `req.userId!` if a future
  requirement needs it, but the preview use case deliberately does not consume it
  (the input type has no `userId` field), so tenant scoping cannot accidentally
  creep in.

## 9. Web two-phase UI (`SubirCartola.tsx`)

Today `SubirCartola` is single-shot: pick → `useIngesta.mutate` → success panel
shows a **post-persist** 5-row preview (too late to be a confirmation). US-003
moves the preview **before** persist.

### 9.1 State machine (expanded)

```
idle
  └─(pick + validarArchivoWeb ok)→ previsualizando   [POST /api/ingestas/preview]
        ├─(ok)→ preview-listo   { archivo: File, dto: PreviewIngestaDto }
        │         ├─(Confirmar)→ subiendo  [useIngesta.mutate(archivo) → existing POST]
        │         │                 ├─(ok)→ exito   (final import summary)
        │         │                 └─(fail)→ error
        │         └─(Cancelar)→ idle   (release file, mutation.reset, re-enable picker — NOTHING persisted)
        └─(fail)→ preview-error   (scrubbed message; re-pick allowed)
```

- `validarArchivoWeb` (client gate) stays and runs first, unchanged — a rejected
  extension never even reaches the preview request.
- On a valid pick, the new `usePreviewIngesta` mutation fires automatically.
- **Confirmar re-uploads the SAME `File`** held in state to the **existing**
  `useIngesta` / `POST /api/ingestas` — zero new server state (Approach A).
- **Cancelar** clears the held file and the preview; nothing was ever persisted.

### 9.2 The "same file on confirm" soft guarantee (client-side)

Approach A cannot prove server-side that confirm re-uploads the previewed bytes.
Mitigation (proposal §4): once `preview-listo`, **gate the file picker** — the
`<input type="file">` is disabled/hidden. The user's only moves are **Confirmar**
(re-upload the held file) or **Cancelar** (release it, re-enable the picker, pick
again). They cannot swap the file underneath a preview. This keeps the guarantee
simple and local; it is a UX-consistency guard, not a data-integrity one (confirm
still fully re-validates whatever bytes it receives via the hardened
`POST /api/ingestas`).

### 9.3 Row-count selector (CA-01)

10 / 25 / 50 as a `<label>`+`<select>` (default 10). The backend already capped
`muestra` at 50; the selector **slices the same in-memory array** —
`preview.muestra.slice(0, cantidad)` — with **no re-request** per change. If a
file has fewer than the selected count, show what exists (`Math.min` implicit in
slice). `totalFilasDatos` is shown separately as "N movimientos en total" (CA-03).

### 9.4 Files + a11y (ADR-018)

- `apps/web/src/api/types.ts` — add `PreviewIngestaDto` + `PreviewTransaccionDto`
  (hand-written mirror, ADR-011/012 debt, `readonly` fields, money as string).
- `apps/web/src/api/client.ts` — add
  `previewIngesta(file: File): Promise<ApiResult<PreviewIngestaDto>>`, a faithful
  mirror of `postIngesta` (client.ts:424): same-origin multipart POST, never
  throws, `esPreviewIngestaDto` type guard (validate `banco`/`totalFilasDatos`
  and, for the money that renders, that `muestra` entries have string
  `cargo`/`abono` — mirror `esIngestaResponseDto`), 400→`invalid`, 401→`unauthorized`,
  parse→`parse`.
- `apps/web/src/api/use-preview-ingesta.ts` — `usePreviewIngesta()`:
  `useMutation<PreviewIngestaDto, ApiError, File>`, `mutationFn` unwraps-or-throws
  like `useIngesta`. **No `onSuccess` cache invalidation** — preview mutates
  nothing (contrast `useIngesta`, which invalidates 3 caches). This absence is the
  hook-level echo of CA-04.
- `apps/web/src/components/SubirCartola.tsx` — reordered to the §9.1 machine.
- **Optional `apps/web/src/components/PreviewMuestra.tsx`** (recommended, SRP):
  presentational sample table + selector `(muestra, banco, totalFilasDatos,
  cantidad, onCantidadChange)`, keeping `SubirCartola` readable. Reuses
  `formatearMontoCLP` over the string amounts (never format money by hand). Tasks
  phase decides whether to split or inline.
- a11y: on `preview-listo`, move focus to the preview heading (mirror the current
  `headingRef` focus on éxito) and announce via the existing `aria-live="polite"`
  region ("Vista previa lista: banco {banco}, {totalFilasDatos} movimientos.
  Revisa y confirma."). The sample renders as a list/table with per-row semantics
  matching the current preview `<ul>`. Confirmar/Cancelar are real `<button>`s;
  the selector has an associated `<label>`.

## 10. Mobile two-phase UI (`subir.tsx`) — greenfield

Mobile has **no per-row preview today** (subir.tsx shows only banco/cuenta/count
on success). This is the heaviest slice (proposal §5) and a candidate for its own
PR.

### 10.1 State machine

```ts
type Estado =
  | { fase: 'idle' }
  | { fase: 'previsualizando' }
  | { fase: 'preview'; dto: PreviewIngestaDto; archivo: DocumentPickerAsset }
  | { fase: 'subiendo' }
  | { fase: 'exito'; dto: IngestaResponseDto }
  | { fase: 'error'; mensaje: string };
```

Flow: pick (`DocumentPicker`, `.xlsx`/`.pdf`, unchanged) → `previsualizando`
(call new `previewIngesta`) → `preview` (hold the `DocumentPickerAsset` + dto) →
render per-row list + banco header + `totalFilasDatos` + selector + **Confirmar**
/ **Cancelar** → Confirmar re-posts the **held asset** via the existing
`postIngesta` → `exito`; Cancelar → `idle`. The "same file" guarantee is
**structural** on mobile: the asset is held in state and the picker is not
re-opened until Cancelar.

### 10.2 Files

- `apps/mobile/src/api/preview-ingesta.ts` (new) — `previewIngesta(asset):
  Promise<PreviewIngestaResult>` mirroring `post-ingesta.ts` transport exactly:
  RN `Blob` file-part via `expo-file-system` `File` (the new-architecture
  requirement fixed in US-033, commit 041da28), `construirHeadersSesion()`, the
  never-throws discipline, and a local `PreviewIngestaError` union (same shape as
  `PostIngestaError`: `unauthorized | network | parse | http{status,message?}`).
  Hand-written `PreviewIngestaDto`/`PreviewTransaccionDto` mirror. Light shape
  guard validating `banco`/`totalFilasDatos` + that `muestra` rows carry string
  `cargo`/`abono` (mobile DOES render per-row money now, so — unlike
  `post-ingesta.ts` which skips `transacciones` — the guard must cover the sample
  rows it displays).
- `apps/mobile/src/domain/preview-cartola.ts` (new) — **pure** view-model (no
  ports, per the SOLID skill's note that mobile domain is pure functions):
  `sliceMuestra(muestra, cantidad)` and `formatearFilaPreview(row)` (CLP over the
  string amount using the existing mobile money formatter — never parse to
  `number`). Unit-testable without RN.
- `apps/mobile/app/subir.tsx` (edit) — the §10.1 machine + a per-row list
  (inline or a small `MuestraCartola` component).

### 10.3 a11y (ADR-018, mirroring existing `subir.tsx` conventions)

- On entering `preview`: `AccessibilityInfo.announceForAccessibility('Vista previa
  lista. Banco {banco}, {totalFilasDatos} movimientos. Revisa y confirma.')`
  (mirror the existing `mensajeDeExito` announcement pattern, subir.tsx:103).
- The sample list container carries an `accessibilityLabel` + `accessibilityLiveRegion="polite"`;
  each row exposes a coherent label (fecha + descripción + cargo/abono) so an AT
  user hears the row as one unit rather than four disconnected texts.
- Selector 10 / 25 / 50 as a segmented row of `Pressable`s, each
  `accessibilityRole="button"` with `accessibilityState={{ selected }}`
  (client-side slice, no re-request) — CA-01 parity with web.
- Confirmar / Cancelar `Pressable`s with `accessibilityRole="button"` + labels;
  `accessibilityState.disabled/busy` while `subiendo` (mirror the existing trigger).

## 11. Testing design (strict TDD — test-first; `pnpm api test` / `pnpm web test` / mobile jest)

**Notable simplification vs US-018: no integration test, no `ALLOW_DESTRUCTIVE_DB`
gate, no local Postgres.** Preview touches zero DB surface, so the entire
verification is fast unit + component tests. This is a direct dividend of the
no-write design.

### 11.1 Backend (`pnpm api test`, mocked collaborators — no DB)

`preview-ingesta.use-case.spec.ts`:
- **Happy Excel:** stub ingest→`{extension:'.xlsx'}`, detect/validate/normalize →
  ok. Assert `Result.ok` with `banco`, `estructura.totalFilasDatos ===
  normalized.length`, `muestra` = first ≤50.
- **Happy PDF:** stub `{extension:'.pdf'}`. Assert the **PDF trio** is invoked and
  the **Excel trio is NOT** (guards the §4 faithful-mirror branch).
- **Cap:** normalize returns 120 → `muestra.length === 50`, `totalFilasDatos === 120`.
- **Each error stage propagates + halts:** extension / banco / estructura /
  normalizacion / pdf-invalido / pdf-sin-texto / estructura-pdf / rango-fechas →
  `Result.fail(thatError)` and **no later collaborator is called**.
- **CA-04 structural (the signature test):** the use case is constructed with the
  7 no-write collaborators only; assert no account-ensure / persist / dedupe /
  categorize collaborator exists to be called (there is nothing to stub) — the
  compile-time guarantee is the constructor arity itself.
- **Defensive catch (D9):** a collaborator throws → `Result.fail(PersistenciaFallidaError)`
  with the fixed message and **no raw amount** interpolated; cause preserved.

`preview-ingesta.dto.spec.ts`: `aPreviewIngestaDto` maps `Transaccion[]` →
strings (`cargo`/`abono` via `String`, `fecha` ISO), `estructura.totalFilasDatos`,
banco/tipoCuenta/numeroCuenta.

Route test (stubbed use case, fast, no DB): `POST /api/ingestas/preview` → 200 +
`PreviewIngestaDto` shape on ok; 400 on a representative validation error (proves
`aHttpError` reuse); missing `file` → 400; multer 10 MB → 400; thrown/`PersistenciaFallidaError`
→ 500.

### 11.2 Web (`pnpm web test`, vitest + RTL, jsdom)

- `client` test: `previewIngesta` type-guard + status mapping (400 `invalid` with
  backend message, 401, parse), never throws.
- `SubirCartola` component: valid pick fires preview → preview panel renders
  (banco, `totalFilasDatos`, sample rows); selector 10/25/50 slices visible rows
  with **no new request**; **file picker gated** once preview shown; **Confirmar**
  → `useIngesta.mutate(sameFile)` → success summary; **Cancelar** → back to idle,
  picker re-enabled, **`useIngesta` never called** (CA-04 at the UI); preview
  error → scrubbed message + re-pick; a11y: preview announced + focus to heading.

### 11.3 Mobile (jest-expo + RNTL)

- `preview-ingesta` client: Blob FormData, never-throws, 200/400/401/parse mapping,
  sample-row guard.
- `preview-cartola` view-model (pure): `sliceMuestra` 10/25/50; `formatearFilaPreview`
  CLP over string (no `number` parse).
- `subir.tsx`: pick → `preview` state renders per-row list + banco + total;
  selector; **Confirmar** → `postIngesta` → `exito`; **Cancelar** → `idle`
  (postIngesta not called); a11y announcements on preview-ready / éxito / error +
  live regions.

## 12. US-004 contact point (merge-awareness, not a blocker)

US-003 branches off `main`. It reuses only `detect`/`validate`/`normalize`
(unchanged by US-004) and touches **none** of the persist/failure path US-004
refactors. The **one overlap is the composition root**: US-003 adds
`crearPreviewIngesta` + a `previewIngesta` field to the `Container` interface +
one deps-object line in `app.ts`/`ingesta.routes.ts`. If US-004 also edits
`container.ts` / the ingesta route deps, expect a **trivial additive conflict**
(two new fields side by side), resolved by keeping both. No semantic entanglement.

## 13. Files summary

**Backend (new):** `application/use-cases/preview-ingesta.use-case.ts` (+ spec) ·
`infrastructure/http/dto/preview-ingesta.dto.ts` (+ spec) ·
`composition/crear-preview-ingesta.ts`.
**Backend (edit):** `infrastructure/http-express/routes/ingesta.routes.ts`
(add handler + `previewIngesta` dep; reuse `subirArchivo`/`aHttpError`) ·
`composition/container.ts` · `infrastructure/http-express/app.ts`.

**Web (new):** `api/use-preview-ingesta.ts` · (optional) `components/PreviewMuestra.tsx`
(+ tests).
**Web (edit):** `api/client.ts` (add `previewIngesta`) · `api/types.ts`
(add `PreviewIngestaDto`/`PreviewTransaccionDto`) · `components/SubirCartola.tsx`
(two-phase).

**Mobile (new):** `src/api/preview-ingesta.ts` · `src/domain/preview-cartola.ts`
(+ tests).
**Mobile (edit):** `app/subir.tsx` (two-phase + per-row list + a11y).

**Schema:** none.

## 14. Slicing (informs sdd-tasks; likely chained PRs, combined > 400 LOC)

- **Slice 1 — Backend preview:** use case (+ spec), DTO (+ spec),
  `crear-preview-ingesta`, container/app.ts/route wiring, route test. Lands the
  contract first; no DB, no integration test.
- **Slice 2 — Web two-phase:** client fn, hook, `SubirCartola` reorder (+ optional
  `PreviewMuestra`), types, tests. Consumes Slice 1's contract.
- **Slice 3 — Mobile two-phase (heaviest, own PR):** client, pure view-model,
  `subir.tsx` preview list + confirm/cancel + a11y, tests.

Delivery strategy and exact task breakdown are decided at `sdd-tasks`.

## 15. ADR-style decision log

- **D1 — `POST /api/ingestas/preview` (sub-path), not `?dryRun=true`.** Keeps the
  no-side-effect path visibly distinct; avoids a boolean that flips side effects.
- **D2 — Keep `apiKey → session` middleware on preview** despite the use case
  ignoring `userId`. Consistency + a real parse-DoS mitigation; `userId` available
  but unconsumed (structurally, via the input type).
- **D3 — CA-04 as a compile-time guarantee.** `PreviewIngestaUseCase` is
  constructed with zero write ports and **never** injects `IAccountRepository`
  (so `ensure()` is unreachable); `crearPreviewIngesta()` takes no `prisma`/`crypto`.
  "Nothing persists on preview" is structurally impossible to violate, not a
  runtime check. Rejected: a `dryRun` flag on `ProcessIngestaUseCase` (keeps write
  ports in scope; downgrades CA-04 to a breakable branch).
- **D4 — Duplicate the `esPdf` trio-selection branch (and the parsing-service
  factory wiring), do not extract yet.** YAGNI/three-strikes at 2 consumers.
  Flagged risk: the copies MUST stay a faithful mirror; a divergence is a
  correctness bug. Deferred `detectarYNormalizar` / `crearPasosParseo` extraction
  registered with an explicit third-consumer trigger.
- **D5 — `totalFilasDatos` = normalized `transacciones.length`, uniform Excel/PDF.**
  Truthful "rows that will contribute" (pre-dedupe), removes the `estructura`-shape
  discrimination, and confirm never exposes `estructura` over HTTP anyway.
  Documented: it is the pre-dedupe count; dedupe is confirm-time.
- **D6 — DTO includes banco/tipoCuenta/numeroCuenta.** Free from `DetectedBank`;
  reinforces CA-02 trust and matches the confirm header.
- **D7 — Duplicate the 4-field row mapping; leave `ingesta-response.dto.ts`
  untouched.** Honors the "confirm unchanged" lock; KISS over cross-feature
  coupling. Rejected: shared `aTransaccionResponseDto` extraction.
- **D8 — The ≤50 cap lives in the use case (`PREVIEW_SAMPLE_MAX`), not the DTO.**
  SRP: one owner of the cap; the DTO serializes what it gets. Client selectors
  hardcode 10/25/50 independently (accepted cross-boundary duplication, ADR-008/011).
- **D9 — Defensive catch wraps unexpected throws in `PersistenciaFallidaError`
  with a preview-specific fixed message → 500.** Preserves the money-scrub
  guarantee locally (mirrors the confirm pipeline). Rejected: propagate raw to
  errorMiddleware (leak risk); new `PreviewFallidaError` (YAGNI for one site).
- **D10 — `usePreviewIngesta` performs NO cache invalidation.** The hook-level
  echo of CA-04; preview mutates nothing.
- **D11 — No integration test / no DB gate.** Preview has zero DB surface;
  verification is fast unit + component tests only.
</content>
</invoke>
