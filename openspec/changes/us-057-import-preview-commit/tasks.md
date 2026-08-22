# Tasks: US-057 — Import Preview + Commit (backend)

Strict TDD (`pnpm api test`): RED fails before GREEN.
Order: domain errors → shared helpers/pipeline → persistence-chain retype (atomic) → preview use case extension (atomic) → commit use case → infra/HTTP/DTO → composition + no-write test → OpenAPI + contract → integration tests → docs/closing.

Delivery strategy: ask-on-risk (user-confirmed before apply). Chain strategy: stacked-to-main.
Six force-chained PRs merge green to main; web/mobile untouched (US-059/US-061).

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~2 650 (approx. PR1 ~350 + PR2 ~400 + PR3 ~350 + PR4 ~500 + PR5 ~650 + PR6 ~400) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 domain+helpers → PR2 persistence-chain retype+preview extension → PR3 commit use case → PR4 infra/HTTP/DTO/composition → PR5 openapi+contract → PR6 integration tests+docs |
| Delivery strategy | ask-on-risk (user must confirm split before apply starts) |
| Chain strategy | stacked-to-main |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

### Atomic work units (un-splittable)

| Atomic unit | Items | Reason |
|---|---|---|
| **persistence-chain retype** | §6 items 8a + 9 + 9a + 9b + 9c | Re-typing `PersistTransactionsInput.transacciones` and updating the `ProcessIngestaUseCase` call-site in the same commit; splitting leaves compilation broken |
| **preview export removal** | §6 items 7 + 7a | Removing the `PREVIEW_SAMPLE_MAX` export and updating `preview-ingesta.use-case.spec.ts` import/assertion in the same commit; the export removal alone breaks spec compilation |

### Suggested Work Units

| Unit | Goal | PR | Est. lines |
|---|---|---|---|
| 1 | Domain errors + shared pure helpers + pipeline use case + detectar-duplicados refactor | PR 1 → main | ~350 |
| 2 | Persistence-chain retype (atomic: 8a+9+9a+9b+9c) + preview use case extension (atomic: 7+7a) + `IAccountReader` port + `PrismaAccountReader` | PR 2 → PR1 | ~400 |
| 3 | `CommitIngestaUseCase` (test-first) + `PersistTransactionsUseCase` regression | PR 3 → PR2 | ~350 |
| 4 | Infra HTTP/DTO + composition helpers + MANDATORY-BLOCKING no-write test | PR 4 → PR3 | ~500 |
| 5 | OpenAPI schemas + document + `openapi.json` regeneration + contract check | PR 5 → PR4 | ~650 |
| 6 | Integration tests (local ephemeral DB) + one-shot regression guard + ADR note + closing | PR 6 → PR5 | ~400 |

---

## Phase 0 — Pre-flight

- [ ] T-00 — Verify local ephemeral DB is available (`apps/api/docs/local-test-db.md`); confirm `pnpm api test:integration` baseline passes. Required before Phase 6. No code changes.

---

## Phase 1 — Domain errors + shared helpers + extracted pipeline [PR 1]

*Satisfies: PREV-EXT-02 (error contract), CMT-01 error (EdicionesInvalidasError), CMT-02 (shared dedup helpers), D-01/D-03/D-04/D-07/D-16; spec §Testing Emphasis.*

- [x] T-01 — (RED) Write unit tests for the three new domain error classes:
  `EdicionesInvalidasError` (D-03), `RowIndexFueraDeRangoError` (D-04), `CategoriaFueraDeCatalogoError` (D-10) — scrub-safe fixed messages, no amounts echoed, extend appropriate base class following the `ExtensionNoPermitidaError` precedent.
  **Files (tests first):** specs co-located with each file in `apps/api/src/domain/errors/`.

- [x] T-02 — (GREEN) Create the three domain error files:
  - `apps/api/src/domain/errors/ediciones-invalidas.error.ts` (§6 item 1)
  - `apps/api/src/domain/errors/row-index-fuera-de-rango.error.ts` (§6 item 2)
  - `apps/api/src/domain/errors/categoria-fuera-de-catalogo.error.ts` (§6 item 3)
  Verify: `pnpm api exec tsc --noEmit`.

- [x] T-03 — (RED) Write unit tests for the two pure helpers in `marcar-duplicados.helper.ts` (D-07):
  - `rangoFechas(transacciones): {desde, hasta}` — min/max `fecha`, empty array edge case.
  - `marcarDuplicados(existentes, transacciones): boolean[]` — correct per-row boolean mask via `construirClaveDuplicado`, order preserved, empty inputs.
  **File (test):** `apps/api/src/application/use-cases/marcar-duplicados.helper.spec.ts`.

- [x] T-04 — (GREEN) Create `apps/api/src/application/use-cases/marcar-duplicados.helper.ts` (§6 item 5) exporting `rangoFechas` and `marcarDuplicados`. Both are pure and stateless; `marcarDuplicados` receives pre-fetched `existentes` from the caller.

- [x] T-05 — Modify `apps/api/src/application/use-cases/detectar-duplicados.use-case.ts` (§6 item 5a): replace the inline fecha-range loop (lines 59-63) with a call to the shared `rangoFechas` helper. No behavior change; count semantics (`{nuevas, duplicadas}`) preserved. Verify existing `detectar-duplicados.use-case.spec.ts` stays green.

- [x] T-06 — (RED) Write unit tests for `EjecutarPipelineIngestaUseCase` (D-01/D-16):
  - Happy path per format (xlsx, pdf) — returns `{banco, estructura, transacciones, nombreArchivo}`.
  - Each pipeline error short-circuits (one test per: `ExtensionNoPermitidaError`, `BancoNoReconocidoError`, `EstructuraInvalidaError`, `NormalizacionInvalidaError`, plus one PDF error).
  - `ensure()` NOT called (pipeline has no write-port dependency by type).
  **File (test):** `apps/api/src/application/use-cases/ejecutar-pipeline-ingesta.use-case.spec.ts`.

- [x] T-07 — (GREEN) Create `apps/api/src/application/use-cases/ejecutar-pipeline-ingesta.use-case.ts` (§6 item 6): extracted shared front `ingest→detect→validate→normalize`, returns `{banco, estructura, transacciones, nombreArchivo}` or the shared pipeline error union. No `ensure()`, no dedup, no account-creation (D-01). `estructura` included for both `ProcessIngestaUseCase` discrimination and preview `totalFilasDatos` (D-16).

- [x] T-08 — Verify phase 1: `pnpm api test` (all suites green) + `pnpm api exec tsc --noEmit`.
  **Work-unit commit:** `feat(api): domain errors, dedup helpers, shared pipeline use case (US-057 PR1)`.

---

## Phase 2 — Persistence-chain retype + IAccountReader + preview extension [PR 2]

*Satisfies: PREV-EXT-01, PREV-EXT-02, PREV-EXT-03, DEP-01 (no-write); D-05/D-06/D-07/D-08/D-09/D-12/D-17; spec §Testing Emphasis (no-write unit).*

> **Two atomic work-unit commits inside this PR (cannot be split across PRs):**
> - **Atomic A (persistence-chain retype):** items 8a + 9 + 9a + 9b + 9c in ONE commit.
> - **Atomic A2 (preview extension):** items 7 + 7a in ONE commit (depends on Atomic A).

- [x] T-09 — Create `apps/api/src/application/ports/account-reader.port.ts` (§6 item 4): `IAccountReader` with `findByBanco(userId, banco: DetectedBank): Result<{accountId: string} | null, PersistenciaFallidaError>` and the injection token (D-05). Read-only port — no upsert, no create.

- [x] T-10 — (RED) Write unit tests for `PrismaAccountReader` (§6 item 10, D-05):
  - `findUnique` on the correct composite key (`userId_banco_tipoCuenta_numeroCuentaBlindIndex`), blind index computed via `IBlindIndexService`.
  - Returns `null` when the account does not exist.
  - No `upsert` call on any path.
  **File (test):** `apps/api/src/infrastructure/persistence/prisma-account-reader.repository.spec.ts`.

- [x] T-11 — (GREEN) Create `apps/api/src/infrastructure/persistence/prisma-account-reader.repository.ts` (§6 item 10): `PrismaAccountReader implements IAccountReader`. Pure read: `findUnique` + blind index. No write branches.

- [x] T-12 — **[ATOMIC A — persistence-chain retype: items 8a + 9 + 9a + 9b + 9c]**
  Implement in a SINGLE commit (splitting leaves compilation broken):

  **(RED first)** Update existing tests to assert the new shapes before changing production code:
  - `persist-transactions.use-case.spec.ts`: assert it forwards `ReadonlyArray<TransaccionAPersistir>` verbatim to `persistirProcesada`.
  - `process-ingesta.use-case.spec.ts` one-shot regression: assert `PersistTransactionsUseCase` receives every row as `{ transaccion, bucket: null, categoriaId: null }` (domain-layer boundary, §7 TDD constraint b unit level).
  - `transaccion.mapper.spec.ts` (existing or new): assert `aPersistencia` with `{transaccion, bucket: null, categoriaId: null}` produces `{bucketId: null, categoriaId: null}` — byte-for-byte identical to today.

  **(GREEN)** Apply all five file changes:
  - `apps/api/src/application/ports/ingesta-repository.port.ts` (9a): define `TransaccionAPersistir = { transaccion: Transaccion, bucket: Bucket | null, categoriaId: string | null }` in this file; change `CrearIngestaProcesadaInput.transacciones` from `ReadonlyArray<Transaccion>` to `ReadonlyArray<TransaccionAPersistir>`.
  - `apps/api/src/application/use-cases/persist-transactions.use-case.ts` (8a): `PersistTransactionsInput.transacciones` changes from `ReadonlyArray<Transaccion>` to `ReadonlyArray<TransaccionAPersistir>`; forwards verbatim (pass-through, no per-row logic).
  - `apps/api/src/infrastructure/persistence/transaccion.mapper.ts` (9b): `aPersistencia` input changes from `Transaccion` to `TransaccionAPersistir`; maps `entry.transaccion` for fecha/descripcion/cargo/abono; resolves `entry.bucket → BUCKET_IDS[entry.bucket]` (or `null`) for `bucketId`; maps `entry.categoriaId` directly. `TransaccionPersistencia` interface gains `categoriaId: string | null`. Keep `TransaccionPersistencia` scalar-only (Fix 2 — spread hazard).
  - `apps/api/src/infrastructure/persistence/prisma-ingesta.repository.ts` (9c): `createMany.data` map iterates `TransaccionAPersistir[]`; spread is `...aPersistencia(entry, crypto)`.
  - `apps/api/src/application/use-cases/process-ingesta.use-case.ts` (9): call `EjecutarPipelineIngestaUseCase` for the front; at call-site (lines 263-270) wrap each row as `{ transaccion: tx, bucket: null, categoriaId: null }` before `persistTransactionsUseCase.execute`. Post-persist `runCategorizacion` island UNCHANGED.

  Verify: `pnpm api test` (all suites green, one-shot regression passing) + `pnpm api exec tsc --noEmit`.
  **Atomic commit A:** `refactor(api): retype persistence chain to TransaccionAPersistir, preserve one-shot null path (US-057 PR2-atomic-A)`.

- [x] T-13 — **[ATOMIC A2 — preview extension: items 7 + 7a]**
  Implement in a SINGLE commit (removing the export without updating the spec breaks compilation):

  **(RED first)** Extend `preview-ingesta.use-case.spec.ts` (item 7a) with new cases BEFORE changing the implementation:
  - Remove the import of `PREVIEW_SAMPLE_MAX` (line 3) and the 50-cap assertion.
  - Add: `findByBanco→null` ⇒ all `esDuplicado: false`, reader not queried (D-06).
  - Add: per-row `esDuplicado` mask via `markarDuplicados` (D-07).
  - Add: `sugerido` from catalog — `null` on no-match; `Ingreso` ⇒ `{bucket:'Ingreso', categoriaId:null}`; `SinCategoria` ⇒ `sugerido: null` (D-09).
  - Add: catalog-down ⇒ Ingreso still classified, rest ⇒ `sugerido: null`, no 500 (D-09 degradation).
  - Add: `filas` = ALL rows (no 50-cap); `rowIndex` 0-based contiguous; `resumen` totals (D-08).

  **(GREEN)** Modify `apps/api/src/application/use-cases/preview-ingesta.use-case.ts` (item 7):
  - Remove `PREVIEW_SAMPLE_MAX` export and its 50-cap behaviour (D-08).
  - `PreviewIngestaInput` gains `userId` (required by dedup + catalog scope).
  - Delegates to `EjecutarPipelineIngestaUseCase` for the shared front (third caller, D-01).
  - Injects `IAccountReader` + `ITransaccionExistenteReader` (with `crypto` — D-17, load-bearing) + `ICatalogoClasificacion`.
  - Short-circuits to all-`esDuplicado:false` when `findByBanco` returns `null` (D-06).
  - Calls `rangoFechas` + `buscarPorCuentaYRango` + `marcarDuplicados` when account exists (D-07).
  - Maps `sugerido` by actively detecting `Bucket.SinCategoria → null` (D-09).
  - Returns `resumen + filas[]` with `rowIndex/esDuplicado/sugerido`; no write-capable port injected.

  Verify: `pnpm api test` (all suites green) + `pnpm api exec tsc --noEmit`.
  **Atomic commit A2:** `feat(api): extend preview use case — full rows, dedup status, suggestions (US-057 PR2-atomic-A2)`.

- [x] T-14 — Verify phase 2: `pnpm api test` (all suites green) + `pnpm api exec tsc --noEmit`.
  **PR 2 targets PR 1 branch (stacked-to-main).**

---

## Phase 3 — CommitIngestaUseCase (test-first) [PR 3]

*Satisfies: CMT-01 through CMT-05; D-01/D-03/D-04/D-10/D-11/D-11a/D-13/D-15/D-16/D-17/D-18.*

- [x] T-15 — (RED) Write `commit-ingesta.use-case.spec.ts` with all unit cases (fakes for every port; spy `PersistTransactionsUseCase` OR fake `IIngestaRepository`):
  - (a) Overlay applied PRE-PERSIST: `PersistTransactionsUseCase` receives `ReadonlyArray<TransaccionAPersistir>` with `bucket: Bucket | null` (domain enum, not FK); spy at `persistirProcesada` level asserts `bucketId` is a physical id (`'bucket-necesidades'` etc.) proving `aPersistencia` resolved correctly (D-11/D-15).
  - (b) Overlay bucket from `listarConPatrones` `Map<categoriaId, Bucket>`, NOT re-classification (D-15).
  - (c) ALL overlay `rowIndex` values validated against pre-dedup `filas.length` BEFORE classification — any out-of-range ⇒ `RowIndexFueraDeRangoError`, nothing persisted (D-04/5a); in-range index on omitted-duplicate row silently dropped (D-11a).
  - (d) `categoriaId` not in `listarConPatrones` id set ⇒ `CategoriaFueraDeCatalogoError`; pattern-less own category IS accepted (D-10 uses `listarConPatrones`, not `findAll`).
  - (e-catalog-down) `findAll` fails OR `listarConPatrones` throws ⇒ commit returns error, `persistirProcesada` NOT called, nothing persisted (D-10/D-18).
  - (f) New duplicates at commit omitted + counted in `duplicadosOmitidos`; commit never aborts (D-13).
  - (g) `ensure()` called by `CommitIngestaUseCase` itself, outside the extracted front (D-01/7b); FALLIDA registered on pipeline failure using `nombreArchivo` from shared pipeline; FALLIDA NOT registered on overlay-validation 400 or catalog-down (D-11/D-18).
  - (h) Never throws; `Result<CommitIngestaResult, CommitIngestaError>` (D-18).
  - (i) `CommitIngestaResult.transacciones` built from the pre-persist retained array, NOT from a post-persist DB query (D-11/5.2b).
  - (j) `SinCategoria` rows (no overlay, no match) persist `bucket: Bucket.SinCategoria` → `aPersistencia` resolves to `'bucket-sincategoria'` FK (D-11/D-15). `bucketId: null` reserved for one-shot degradable-island state.
  **File:** `apps/api/src/application/use-cases/commit-ingesta.use-case.spec.ts`.

- [x] T-16 — (GREEN) Create `apps/api/src/application/use-cases/commit-ingesta.use-case.ts` (§6 item 8):
  - `CommitIngestaUseCase.execute({fileReader, userId, edits: CommitEdit[]})`.
  - Full algorithm per D-11: shared pipeline → `ensure` → dedup → load categories + patterns (REQUIRED, fail-closed) → build `Map<categoriaId, Bucket>` → validate ALL overlay `rowIndex` in range → validate overlay `categoriaId` ∈ `listarConPatrones` id set → auto-classify per row via `CategorizarTransaccionUseCase` → apply overlay in-memory (bucket from map) → retain `TransaccionAPersistir[]` array → `PersistTransactionsUseCase.execute` → build `CommitIngestaResult`.
  - Two-layer try/catch (D-18): inner wraps `listarConPatrones` throw → `PersistenciaFallidaError`, no FALLIDA; outer backstop catches mid-flight post-pipeline throws, registers FALLIDA.
  - `CommitIngestaError` union exhaustive per D-18.
  - Injects: `EjecutarPipelineIngestaUseCase`, `IAccountRepository`, `DetectarDuplicadosUseCase`, `ICatalogoClasificacion`, `ICategoriaRepository`, `CategorizarTransaccionUseCase`, `PersistTransactionsUseCase`, `IRegistrarIngestaFallidaWriter`, `ILogger`. No `Record<Bucket,string>` in the use case (D-15, ADR-005).
  - **Overlay-application semantics pinned (product decisions, 2026-08-21 — see D-11):** overlay `categoriaId: null` = DES-CLASIFICAR (persist `{SinCategoria, null}`, auto discarded); the Ingreso rule is IMMUTABLE (Ingreso rows persist `{Ingreso, null}`, any overlay silently ignored, checked first); cross-tenant validation (D-10) runs globally before per-row application. Pinned by spec describe block `(k)` (5 tests).
  - **Post-apply refinements (judgment-day review + product rulings, PR3 follow-up commits):** rowIndex validation hoisted before catalog loads; `CategoriaFueraDeCatalogoError` fixed message; KISS on the overlay branch; overlay-null/Ingreso-immutable semantics (above).

- [x] T-17 — (RED+GREEN) `PersistTransactionsUseCase` regression test: assert it forwards `ReadonlyArray<TransaccionAPersistir>` untouched to `persistirProcesada` (fake `IIngestaRepository`; Fix 1). (pulled forward to PR2 — `persist-transactions.use-case.spec.ts` "pasa TODOS los campos... sin transformarlos" asserts `transacciones: TXS` verbatim, Atomic A `75fda805`.)

- [x] T-18 — Verify phase 3: `pnpm api test` (all suites green) + `pnpm api exec tsc --noEmit`.
  **Work-unit commit:** `feat(api): CommitIngestaUseCase test-first, persist-transactions regression (US-057 PR3)`.

---

## Phase 4 — Infra HTTP/DTO + composition helpers + MANDATORY-BLOCKING no-write test [PR 4]

*Satisfies: CMT-01 (edits parsing, D-02/D-03), CMT-05 (response DTO, D-13), PREV-EXT-02 (no-write guarantee, D-12), DEP-01; §6 items 11–15 + container.*

- [x] T-19 — Modify `apps/api/src/infrastructure/http/dto/preview-ingesta.dto.ts` (§6 item 11): add `resumen: {totalFilas, duplicadosDetectados, nuevas}`, rename `muestra` → `filas`, add `PreviewFilaDto` with `rowIndex`, `esDuplicado`, `sugerido` (D-08). Amounts stay BigInt-safe strings. Verify existing usage not broken. (pulled forward to PR2 — DTO shape changed alongside the `PreviewIngestaResult` retype to keep compilation green; Atomic A2 + review fixes.)

- [x] T-19a — **Backward-compat shim (product decision 2026-08-21, D-08a; removed by US-061).** The preview reshape MUST be ADDITIVE, not a rename: shipped clients (deployed mobile APK, pre-migration web/mobile via `@moneydiary/api-client`) still read `estructura`/`muestra`. Restore both deprecated fields as a pure projection in `aPreviewIngestaDto` (`estructura.totalFilasDatos === resumen.totalFilas`; `muestra` = first 50 rows in the old 4-field shape `{fecha, descripcion, cargo, abono}`); mark `resumen`/`filas` `.optional()` and `estructura`/`muestra` required in `ingesta-preview.schema.ts` so legacy client literals stay assignable. Add mapper unit tests (`preview-ingesta.dto.spec.ts`) + schema legacy-mirror test + e2e assertions for BOTH shapes. Update `openapi-document.ts` preview description to note the deprecation. Acceptance gate: `pnpm web typecheck` + `pnpm --filter @moneydiary/mobile exec tsc --noEmit` pass with ZERO changes under `apps/web`/`apps/mobile`. Commit: `fix(api): backward-compatible preview response — legacy estructura/muestra until US-061 (US-057 PR2)`.

- [x] T-20 — (RED+GREEN) Create `apps/api/src/infrastructure/http/dto/commit-ingesta.dto.ts` (§6 item 12):
  - `parseEdits(raw: string | undefined): Result<CommitEdit[], EdicionesInvalidasError>`: valid JSON → typed array; malformed JSON / non-array / bad element / bad `rowIndex` type / bad `categoriaId` type ⇒ `EdicionesInvalidasError`, message never echoes raw field; absent/empty ⇒ `[]`.
  - `CommitTransaccionResponseDto` interface (fecha, descripcion, cargo/abono as strings, bucket: string, categoriaId: string | null).
  - `CommitIngestaResponseDto` interface (ingestaId, totalTransacciones, duplicadosOmitidos, transacciones: CommitTransaccionResponseDto[]).
  - `aCommitIngestaResponseDto(result: CommitIngestaResult): CommitIngestaResponseDto` — fully independent mapper, does NOT delegate to `aIngestaResponseDto` (D-13); maps BigInt → string, domain `Bucket` enum → string (D-09 enum values).
  Write spec first: `commit-ingesta.dto.spec.ts` — covers all `parseEdits` branches + mapper correctness (D-13) + `TransaccionResponseDto`/`aIngestaResponseDto` unchanged (regression guard).

- [x] T-21 — Modify `apps/api/src/infrastructure/http-express/routes/ingesta.routes.ts` (§6 item 13):
  - Add `commitIngesta: CommitIngestaUseCase` to `IngestaRoutesDeps`.
  - Add `subirArchivoConEdits()` helper in this module (own multer instance, `.single('file')`, `limits: { fileSize: MAX_FILE_SIZE, fieldSize: 256 * 1024 }`); shared `subirArchivo()` NOT modified (D-02).
  - Add `POST /api/ingestas/commit` handler: `parseEdits(req.body.edits)` → 400 on fail; `deps.commitIngesta.execute({fileReader, userId: req.userId!, edits})`.
  - Add `aCommitHttpError` mapping the full `CommitIngestaError` union (D-18) with exhaustive `never` guard: `EdicionesInvalidasError` + `RowIndexFueraDeRangoError` + `CategoriaFueraDeCatalogoError` + pipeline errors ⇒ 400; `PersistenciaFallidaError` + `CategorizacionFallidaError` ⇒ 500.
  - Preview handler: forward `req.userId!`; remove the "NO forwarda userId" comment at lines 88-89 (D-07).

- [x] T-22 — Modify `apps/api/src/infrastructure/http-express/app.ts` (§6 item 13a): the `IngestaRoutesDeps` object passed to `registrarIngestas` gains `commitIngesta` (compile error otherwise).

- [x] T-23 — Create `apps/api/src/composition/crear-commit-ingesta.ts` (§6 item 15): signature `(prisma, crypto, blindIndex, logger)`. Wires `EjecutarPipelineIngestaUseCase`, `PrismaAccountRepository` (write, for `ensure`), `DetectarDuplicadosUseCase(new PrismaTransaccionExistenteReader(prisma, crypto))` (crypto MANDATORY — D-17), `PrismaCatalogoClasificacionRepository`, `PrismaCategoriaRepository` (D-10/D-15 membership + bucket map), `CategorizarTransaccionUseCase`, `PersistTransactionsUseCase(new PrismaIngestaRepository(prisma, crypto))`, `PrismaRegistrarIngestaFallidaRepository`. No `BUCKET_IDS` value passed to `CommitIngestaUseCase` (FK resolution lives in `aPersistencia`, D-15).

- [x] T-24 — Modify `apps/api/src/composition/crear-preview-ingesta.ts` (§6 item 14): new signature `(prisma, crypto, blindIndex, logger)`. Wire ONLY read adapters: `PrismaAccountReader(prisma, blindIndex)` (D-05), `PrismaTransaccionExistenteReader(prisma, crypto)` (crypto MANDATORY — D-17), `PrismaCatalogoClasificacionRepository(prisma)`. MUST NOT import or construct `PrismaAccountRepository`, `PrismaIngestaRepository`, `PersistTransactionsUseCase`, or `PrismaTransaccionBucketRepository`. (pulled forward to PR2 — required to wire the extended preview use case; read-only adapters only, verified no write repos imported. Note: `CategorizarTransaccionUseCase` also wired per PR2 review fix 4.)

- [x] T-25 — **[MANDATORY-BLOCKING]** Create `apps/api/src/composition/crear-preview-ingesta.spec.ts` (§6 item 14a): the no-write composition test. Mechanism:
  - Build a Prisma stub (partial `PrismaClient`) with write-surface traps: `account.upsert`, `ingesta.create`, `transaccion.createMany`, `transaccion.updateMany`, `$transaction` — each assigned to `vi.fn(() => { throw new Error('WRITE FORBIDDEN in preview'); })`.
  - Read surfaces preview legitimately uses return empty/null: `account.findUnique → null`, `transaccion.findMany → []`, `patronClasificacion.findMany → []`.
  - Call `crearPreviewIngesta(stubPrisma, crypto, blindIndex, logger)` then `await previewIngesta.execute({fileReader: fakeFileReaderWithValidCartola, userId})`.
  - Assert `Result.isOk` AND each write trap was NOT called (`expect(stub.account.upsert).not.toHaveBeenCalled()` etc.).
  **This test is a merge blocker.** Apply MUST NOT merge PR 4 (or any subsequent PR) without this test passing.

- [ ] T-26 — Modify `apps/api/src/composition/container.ts` (§6 item 16): (PARTIAL — first bullet done in PR2, rest blocked on PR3 `CommitIngestaUseCase`; stays unchecked.)
  - [x] Update `previewIngesta` call to `crearPreviewIngesta(prisma, crypto, blindIndex, logger)` (D-12). (done in PR2.)
  - [x] Add `Container.commitIngesta: CommitIngestaUseCase` field via `crearCommitIngesta(prisma, crypto, blindIndex, logger)`. (done in PR4.)
  - [x] Expose `commitIngesta` so `app.ts` can pass it to `registrarIngestas`. (done in PR4.)

- [x] T-27 — Verify phase 4: `pnpm api test` (all suites green, including MANDATORY-BLOCKING T-25) + `pnpm api exec tsc --noEmit`.
  **Work-unit commit:** `feat(api): commit DTO/routes, composition helpers, MANDATORY no-write test (US-057 PR4)`.

---

## Phase 5 — OpenAPI schemas + document + contract [PR 5]

*Satisfies: CONTRACT-01, DEP-01 (deprecated annotation); §6 items 17–21.*

- [x] T-28 — (RED+GREEN) Modify `apps/api/src/infrastructure/http-express/schemas/ingesta-preview.schema.ts` (§6 item 17): extend response schema — `resumen` object + `filas` array with per-row `rowIndex`, `esDuplicado`, `sugerido`. Update `ingesta-preview.schema.spec.ts` with cases for the new fields. (pulled forward to PR2 — schema and spec already fully updated; verified passing in PR5 full suite.)

- [x] T-29 — (RED+GREEN) Create `apps/api/src/infrastructure/http-express/schemas/ingesta-commit.schema.ts` (§6 item 18): `commitIngestaRequestSchema` (multipart file + `edits` string) + `commitIngestaResponseSchema` (mirrors `CommitIngestaResponseDto` with `bucket` + `categoriaId` per row). Create `ingesta-commit.schema.spec.ts` with sync-guarantee cases (real `aCommitIngestaResponseDto` output parses; `.strict()` rejects stray keys).

- [x] T-30 — (RED+GREEN) Modify `apps/api/src/infrastructure/http-express/schemas/openapi-document.ts` (§6 item 19):
  - Add `ingestaCommitOperation` + `'/api/ingestas/commit': {post}` (APPEND at end of `paths` — never reorder).
  - Set `deprecated: true` on `ingestaUploadOperation` (D-14).
  - Extend preview operation description to reflect full-row `filas` + `resumen`.
  Update `openapi-document.spec.ts` (§6 item 20) with +cases: commit path registered; upload marked `deprecated: true`; preview schema extended. Write specs before the document change.

- [x] T-31 — Regenerate `apps/api/openapi.json` (§6 item 21) via `pnpm api openapi:emit`. Run `pnpm api openapi:check` — exits 0. Verify: commit path present, upload `deprecated: true`, preview response extended.

- [x] T-32 — Verify phase 5: `pnpm api test` (all suites green) + `pnpm api exec tsc --noEmit` + `pnpm api openapi:check` exit 0.
  **Work-unit commit:** `feat(api): openapi schemas + document update, deprecated one-shot, commit path (US-057 PR5)`.

---

## Phase 6 — Integration tests + one-shot regression guard + docs/closing [PR 6]

*Satisfies: spec §Testing Emphasis (integration test matrix), DEP-01 (transition note); §6 items 22–23; §7 TDD constraint b two-level regression guard.*

- [ ] T-33 — (RED+GREEN) Write and run integration tests against the local ephemeral DB (`pnpm api test:integration`). Each test must be in a named group:

  - **CA-01 no-write:** `POST /api/ingestas/preview` with a valid cartola; assert `Account`, `Ingesta`, `Transaccion` row counts unchanged after the call. Repeat three times (idempotency).
  - **CA-06 user isolation (preview):** user B's `findByBanco` does NOT see user A's transactions (dedup scoped to B); user A's rows are not read or modified by B's preview.
  - **CA-06 user isolation (commit):** user B cannot commit an overlay `categoriaId` belonging to user A → `CategoriaFueraDeCatalogoError`; user B's commit does not write into user A's `Account/Ingesta/Transaccion`.
  - **CA-03 dedup-at-commit:** import the same cartola twice; the second commit omits duplicates, reports correct `duplicadosOmitidos`, does NOT abort.
  - **CA-02 overlay persistence:** committed row carries the overlaid `categoriaId`/`bucketId` — verify `Transaccion` column in DB matches overlay, not auto-classification.
  - **Catalog-down at commit:** simulate `ICatalogoClasificacion.findAll` failure; assert `persistirProcesada` not called, no `Ingesta/Transaccion` rows created (D-10/Fix 4).
  - **One-shot regression guard (two-level, §7 TDD constraint b):** (unit level — covered in T-12 RED) integration level: `POST /api/ingestas` writes `Transaccion` rows with `bucketId: null` AND `categoriaId: null` — verify both columns are `null` in the DB after the `TransaccionAPersistir` change. Confirms the mapping gap is caught at the DB level.
  - **D-17 decrypt regression:** preview after a real prior import detects the correct duplicates — proves `buscarPorCuentaYRango` is wired with `crypto` and decrypts `descripcion`.

  **File:** `apps/api/test/` (follow existing integration file naming convention).

- [ ] T-34 — Modify `docs/adr/README.md` (§6 item 22): add transition note to the ADR-026 row: "deprecated at US-057, physical removal tracked by US-061" (D-14/CA-05).

- [ ] T-35 — Full sweep: `pnpm api test` + `pnpm api test:integration` + `pnpm api exec tsc --noEmit` + `pnpm api openapi:check` exit 0 + `pnpm api lint:ci` (if available in workspace).

- [ ] T-36 — Verify phase 6: confirm T-25 (MANDATORY-BLOCKING no-write composition test) is green in the final CI run.
  **Work-unit commit:** `feat(api): integration tests, one-shot regression guard, ADR-026 deprecation note (US-057 PR6)`.

---

## Parallel / sequential map

| Tasks | Relationship |
|---|---|
| T-01 → T-08 | Sequential (domain errors before helpers before pipeline) |
| T-09, T-10, T-11 | Can start as soon as PR 1 merges; T-10/T-11 depend on T-09 (port) |
| T-12 (Atomic A) | Depends on T-07 (pipeline use case) |
| T-13 (Atomic A2) | Depends on T-12 (pipeline extracted, port defined) |
| T-14 | Gate after T-12 + T-13 |
| T-15 → T-18 | Sequential after PR 2 merges |
| T-19 → T-27 | Sequential after PR 3 merges; T-25 (MANDATORY-BLOCKING) gates PR 4 |
| T-28 → T-32 | Sequential after PR 4 merges |
| T-33 → T-36 | Sequential after PR 5 merges; T-33 needs ephemeral DB (T-00) |

---

## Requirement traceability

| Requirement | Tasks |
|---|---|
| PREV-EXT-01 (full rows, dedup status, suggestions) | T-13, T-19, T-28, T-33 |
| PREV-EXT-02 (read-only port, no-write by construction) | T-09, T-11, T-24, T-25 (BLOCKING) |
| PREV-EXT-03 (error contract, scrubbed amounts) | T-01, T-02, T-13 |
| CMT-01 (edits overlay, re-parse) | T-15, T-16, T-20, T-21 |
| CMT-02 (dedup at commit, never aborts) | T-15, T-16, T-33 |
| CMT-03 (cross-tenant categoriaId rejection) | T-15, T-16, T-33 |
| CMT-04 (atomic persist, historial) | T-12, T-15, T-16, T-33 |
| CMT-05 (commit response fields) | T-20, T-29, T-33 |
| DEP-01 (one-shot deprecated, behaviorally unchanged) | T-12, T-30, T-31, T-34 |
| CONTRACT-01 (openapi.json updated) | T-28, T-29, T-30, T-31 |
