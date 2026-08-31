# Tasks: Create a categoría (with patrones) from the upload preview

## PR2 STATUS: DONE (2026-08-31)

All PR2 tasks (2.1.1–2.5.3) complete and committed locally on branch
`feat/web-catalogo-client-seam` (base: PR1's merged commit `acc97bad` on
`main`; 3 commits: `47b4a6ce`, `3c2b5a33`, `6d765e58` — see
`sdd/crear-categoria-desde-preview/apply-progress` for full detail). Web
types re-export the generated `PatronDto`/`CategoriaDto`/`CatalogoDto`;
`postCategoria` returns the parsed `CategoriaDto` (patrones-serialization
included); `ApiError.server.indice?: number` added and lifted;
`useCrearCategoria` is `useMutation<CategoriaDto, ApiError, CategoriaInput>`
and seeds `['categorias']` before invalidating. `NuevaCategoriaForm` is
untouched behaviorally (its test's mock updated only because
`postCategoria` now reads the response body). Verification: `pnpm web
test` 137/137 files, 1692/1692 tests green (full suite); `pnpm web
typecheck` clean; `pnpm web lint` clean; `pnpm api exec tsc --noEmit` and
`pnpm api test` untouched-green (no `apps/api`/`packages/api-client`
changes in this slice). Next: PR3 (preview UI), base = this PR2 branch.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~350 hand-written + ~large generated (openapi.json/types.gen.ts) · PR2 ~150 · PR3 ~300 · PR4 ~300 |
| 400-line budget risk | PR1 High (generated) · PR2 Low · PR3 Medium · PR4 Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 (feature-branch-chain) |
| Delivery strategy | ask-on-risk (default; confirm with user) |
| Chain strategy | feature-branch-chain (recommended — PR2 does not typecheck until PR1's regenerated api-client exists) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

`size:exception` requested for **PR1 only**, naming `apps/api/openapi.json` and `packages/api-client/src/types.gen.ts` as script-generated (`pnpm api openapi:emit`, `pnpm api-client generate`) — not reviewable prose. Hand-written PR1 diff (~350 lines) stays under budget on its own.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | API: atomic nested-patrones create + indexed errors + contract regen + T-01 | PR1 (base: tracker branch) | additive/optional field; size:exception for generated files |
| 2 | Web client seam: adopt generated catalog types, `postCategoria` returns DTO, cache seeding | PR2 (base: PR1 branch) | inert for UI; existing forms unaffected |
| 3 | Preview UI: "+" trigger, inline form, row adopts categoría (no re-run yet) | PR3 (base: PR2 branch) | coherent standalone increment |
| 4 | Orchestration: `previewData` hoist, re-run, diff announcement, e2e | PR4 (base: PR3 branch) | completes the loop |

---

## PR1 — API: atomic nested-patrones create + contract regen + T-01

**Start state**: `POST /api/categorias` creates a categoría only (no `patrones`); `crear()` is the only repository method; `apps/web/src/api/types.ts` still declares the stale ADR-008 exception.
**Finished state**: `POST /api/categorias` optionally accepts `patrones[]`, creates it atomically with the categoría, reports per-patrón failures by index; `openapi.json`/`api-client` regenerated; T-01 proves `rowIndex` stability.
**Verify**: `pnpm api exec tsc --noEmit` (⚠️ there is NO `typecheck` script in `apps/api`; this is the exact command CI runs — vitest transpiles without typechecking, so a port-signature change can leave stale test doubles that only `tsc` catches), `pnpm api test`, `pnpm api test:integration` (gated `ALLOW_DESTRUCTIVE_DB=1`, local Postgres), `pnpm api openapi:check`, `pnpm api-client typecheck`, `pnpm api lint:ci`, plus `pnpm web test` (⚠️ `apps/web/src/api/catalogo-constantes.mirror.spec.ts` greps backend sources, so moving a backend constant breaks a WEB test).
**Rollback boundary**: revert PR1 branch; field is additive/optional, no migration, no client sends it yet.

### Phase 1.1: Domain + shape validation (RED → GREEN)

- [x] 1.1.1 (RED) Write `apps/api/src/application/use-cases/validar-patron.spec.ts` covering length 1–200, `matchType` enum, REGEX compile, `prioridad` default/range (same checks as `crear-patron.use-case.spec.ts`)
- [x] 1.1.2 (GREEN) Create `apps/api/src/application/use-cases/validar-patron.ts` — pure `validarPatron()` extracted from `crear-patron.use-case.ts`
- [x] 1.1.3 Refactor `apps/api/src/application/use-cases/crear-patron.use-case.ts` to call `validarPatron()`; run `crear-patron.use-case.spec.ts` unchanged and green (behavior-preservation proof, no assertion edited)
- [x] 1.1.4 Create `apps/api/src/domain/errors/patron-en-lote-invalido.error.ts` — `PatronEnLoteInvalidoError(indice, causa)`

### Phase 1.2: Use case + port (RED → GREEN)

- [x] 1.2.1 (RED) Extend `apps/api/src/application/use-cases/crear-categoria.use-case.spec.ts`: absent `patrones` byte-identical to today; `[]` same; valid list ⇒ one `crearConPatrones` call; invalid patrón at index 1 ⇒ `PatronEnLoteInvalidoError{indice:1}` and repository never called; within-batch case-insensitive duplicate ⇒ error at second occurrence; pre-existing duplicate ⇒ wrapped with index; demo gate precedes patrón inspection; nombre/bucket failures precede patrón failures
- [x] 1.2.2 (GREEN) Add `crearConPatrones` to `apps/api/src/application/ports/categoria-repository.port.ts`
- [x] 1.2.3 (GREEN) Extend `apps/api/src/application/use-cases/crear-categoria.use-case.ts`: optional `patrones` input, validation order (demo → nombre → bucket → nombre único → per-patrón `validarPatron` → `existePatron` → within-batch `Set`) → single `crearConPatrones` write

### Phase 1.3: Persistence (RED → GREEN)

- [x] 1.3.1 (RED) Extend `apps/api/test/catalogo-crud.int-spec.ts`: a request whose 2nd patrón duplicates an existing one leaves zero new `Categoria` and zero new `PatronClasificacion` rows (gated `ALLOW_DESTRUCTIVE_DB=1`)
- [x] 1.3.2 (GREEN) Implement `crearConPatrones` in `apps/api/src/infrastructure/persistence/prisma-categoria.repository.ts` as one nested `prisma.categoria.create({ data: { …, patrones: { create: [...] } }, include: categoriaInclude(userId) })`; remove `crear()` (replaced, not kept alongside)

### Phase 1.4: HTTP wiring — error plumbing + schema (RED → GREEN)

- [x] 1.4.1 (RED) Extend `apps/api/src/infrastructure/http-express/routes/catalogo-http-error.ts` spec: `PatronEnLoteInvalidoError` maps to causa's status+code plus `indice`; `_exhaustive: never` still compiles
- [x] 1.4.2 (GREEN) Add the recursive branch in `catalogo-http-error.ts`
- [x] 1.4.3 Add `readonly indice?: number` to `ErrorTraducido` and forward it in `apps/api/src/infrastructure/http-express/routes/responder-error-traducido.ts`
- [x] 1.4.4 Add `indice: z.number().optional()` to `apps/api/src/infrastructure/http-express/schemas/catalogo-error.schema.ts`
- [x] 1.4.5 (RED) Extend `apps/api/src/infrastructure/http-express/schemas/categorias.schema.spec.ts` (response/DTO sync) and add a schema test for `patronEnCategoriaCreateSchema`: `.strict()`, `.max(20)`, no `prioridad` field accepted
- [x] 1.4.6 (GREEN) Add `patronEnCategoriaCreateSchema` + optional `patrones` to `categoriaCreateRequestSchema` in `apps/api/src/infrastructure/http-express/schemas/categorias.schema.ts`
- [x] 1.4.7 (RED) Extend `apps/api/src/infrastructure/http-express/routes/categorias.routes.spec.ts`: 201 nests created patrones; 400 body carries `indice`; body without `patrones` behaves exactly as before (mobile/back-compat pin); `>20` patrones and unknown patrón keys ⇒ `BODY_INVALIDO`
- [x] 1.4.8 (GREEN) Pass `parsed.data.patrones` through in `apps/api/src/infrastructure/http-express/routes/categorias.routes.ts`
- [x] 1.4.9 Update the 400 description in `apps/api/src/infrastructure/http-express/schemas/openapi-document.ts` to mention `indice`

### Phase 1.5: T-01 — rowIndex stability proof (blocks apply until green)

- [x] 1.5.1 (RED→GREEN, proof task) Create `apps/api/test/preview-rowindex-estable.spec.ts` (unit, stubbed readers, no DB): run `PreviewIngestaUseCase.execute` twice over the same fixture buffer with an empty catalog, assert `filas.map(f => [f.rowIndex, descripcion, cargo, abono])` deep-equal and `rowIndex === arrayPosition`; repeat with a different (non-empty) catalog on the 2nd run, assert tuples still identical while `sugerido` differs; run both assertions for `movimientos-test.xlsx` (Excel) and `bci-cartola-test.pdf` (PDF)

### Phase 1.6: Contract regeneration

- [x] 1.6.1 Run `pnpm contract:sync` (= `pnpm api openapi:emit && pnpm api-client generate`) to regenerate `apps/api/openapi.json` and `packages/api-client/src/types.gen.ts`
- [x] 1.6.2 Verify `pnpm api openapi:check` and `pnpm api-client typecheck` pass with zero drift
- [x] 1.6.3 Confirm `packages/api-client/src/index.ts` already exports `CategoriaDto`/`CatalogoDto`/`PatronDto` as one-line aliases of `S['CategoriaResponse']`/`S['CatalogoResponse']`/`S['PatronResponse']` (lines 116–123, verified at task-planning time) — **no new alias needed**; design's flagged apply-time risk is resolved, record this in the PR1 description

### Phase 1.7: Verification

- [x] 1.7.1 Run `pnpm api test` (all unit specs green, including 1.1–1.4)
- [x] 1.7.2 Run `pnpm api test:integration` (1.3.1 green)
- [x] 1.7.3 Run `pnpm api lint:ci`
- [ ] 1.7.4 Commit with `size:exception` note in the PR body naming `apps/api/openapi.json` + `packages/api-client/src/types.gen.ts` as generated (commit made locally; PR body/exception note is a PR-creation step, out of this apply run's scope — not pushed/opened per instructions)

---

## PR2 — Web client seam: adopt generated catalog types, typed `postCategoria`/`useCrearCategoria`

**Start state**: `apps/web/src/api/types.ts` hand-writes `CategoriaDto`/`PatronDto`/`CatalogoDto` behind a stale ADR-008 exception comment; `postCategoria` discards the 201 body; `useCrearCategoria` is untyped for its success value.
**Finished state**: web types re-export the generated shapes; `postCategoria` parses and returns `CategoriaDto`; `useCrearCategoria` is `useMutation<CategoriaDto, ApiError, CategoriaInput>` and seeds `['categorias']` before invalidating. UI unaffected (`NuevaCategoriaForm` keeps working, ignores the new resolved value).
**Verify**: `pnpm web test`, `pnpm web typecheck` (`tsr generate && tsc -b`), `pnpm web lint`, and `pnpm api exec tsc --noEmit` if anything under `packages/api-client` moved.
**Rollback boundary**: revert PR2 branch (retarget PR3 base back to PR1 branch if PR2 is dropped); no UI depends on the new return value yet.

### Phase 2.1: Adopt generated types (RED → GREEN)

- [x] 2.1.1 (RED) Extend `apps/web/src/api/categorias.test.ts`: `CategoriaDto`/`PatronDto`/`CatalogoDto` still satisfy `esCategoriaDto`/`esPatronDto` guards after the type source changes (compile-level regression via existing fixtures) — **deviation**: a pure type re-export with field-identical shapes cannot RED at the vitest layer (TS types are erased at runtime; no branch changes). Treated as approval-testing (existing `categorias.test.ts`, 26 tests, run as the pre-change safety net) + a genuine compile-time gate (`pnpm web typecheck`, run clean after 2.1.2) instead of a fabricated runtime failure.
- [x] 2.1.2 (GREEN) In `apps/web/src/api/types.ts`, re-export `PatronDto`/`CategoriaDto`/`CatalogoDto` from `@moneydiary/api-client` (matching the `export type { MeDto } from '@moneydiary/api-client'` idiom); delete the stale ADR-008 exception comment (F-6: the "openapi.json no documenta el catálogo" claim is false)

### Phase 2.2: `postCategoria` returns the DTO (RED → GREEN)

- [x] 2.2.1 (RED) Extend `apps/web/src/api/categorias.test.ts`: `postCategoria` returns the parsed `CategoriaDto` on success; malformed 201 body ⇒ `{ tag: 'parse' }`; `patrones` input is serialized in the request body
- [x] 2.2.2 (GREEN) In `apps/web/src/api/categorias.ts`: change `postCategoria` to `(input: CategoriaInput) => Promise<ApiResult<CategoriaDto>>`, add optional `patrones` to `CategoriaInput`, parse the 201 body through the existing `esCategoriaDto` guard, amend the docblock's blanket "los bodies de éxito se DESCARTAN" claim to name this one exception

### Phase 2.3: `ApiError.indice` (RED → GREEN)

- [x] 2.3.1 (RED) Extend `apps/web/src/api/client.ts` test coverage (or `categorias.test.ts`): a 400 response with `indice` is lifted onto `ApiError.server.indice`
- [x] 2.3.2 (GREEN) Add `readonly indice?: number` to `ApiError`'s `server` variant in `apps/web/src/api/client.ts`, lift it in `errorConCodigo`, with a doc comment naming its single producer (`POST /api/categorias` with `patrones[]`)

### Phase 2.4: `useCrearCategoria` typed + cache seeding (RED → GREEN)

- [x] 2.4.1 (RED) Extend `apps/web/src/api/use-crear-categoria.test.tsx`: on success, `['categorias']` cache is seeded with the appended categoría BEFORE `invalidarCatalogoYDashboard` runs; existing `NuevaCategoriaForm` call shape (`mutate({…}, { onSuccess: onCerrar })`) still compiles and behaves identically
- [x] 2.4.2 (GREEN) In `apps/web/src/api/use-crear-categoria.ts`: type as `useMutation<CategoriaDto, ApiError, CategoriaInput>`; in `onSuccess`, `queryClient.setQueryData(['categorias'], append)` then `invalidarCatalogoYDashboard(queryClient)`

### Phase 2.5: Verification

- [x] 2.5.1 Run `pnpm web test` (137 files / 1692 tests green, full suite)
- [x] 2.5.2 Run `pnpm web typecheck`
- [x] 2.5.3 Run `pnpm web lint`

---

## PR3 — Preview UI: "+" trigger, inline creation form, row adopts categoría (no re-run yet)

**Start state**: `FilaRevision` renders only bucket + categoría selects; no creation affordance in the preview.
**Finished state**: a "+" control (bucket-gated, hidden for duplicates, demo-disabled) opens an inline `<form>` in the row; on success the originating row's `edits` map is updated to the new categoría id; `SubirCartola` wires a minimal handler that does ONLY that (no preview re-run — PR4's scope).
**Verify**: `pnpm web test`, `pnpm web typecheck`, `pnpm web lint`, `pnpm exec vitest run --coverage` optional for axe checks (already inside `pnpm web test` via `vitest-axe`).
**Rollback boundary**: revert PR3 branch; the "+" disappears, preview flow returns to bucket→categoría selection only; no persisted state depends on this PR.

### Phase 3.0: Apply-time assumption check

- [ ] 3.0.1 Verify `crypto.randomUUID()` availability in the web's build/browser targets (check `apps/web/vite.config.ts` / `tsconfig` target and any documented supported-browsers list); if unavailable, use `useId()` per row instead — record the decision in the PR description before writing `NuevaCategoriaDesdeFilaForm.tsx`

### Phase 3.1: Form component (RED → GREEN)

- [ ] 3.1.1 (RED) Create `apps/web/src/components/preview/NuevaCategoriaDesdeFilaForm.test.tsx`: first patrón prefilled from row description as `CONTAINS`, editable/removable; add/remove keyed rows (never by array index); zero patrones submits; REGEX hint (`role="status"`) appears and never blocks submit; submitted payload shape `{ nombre, bucket, patrones: [{patron, matchType}] }`; blank-only patrón rows dropped before submit; `indice` error renders on the named row (`role="alert"`); non-indexed error renders form-level; `Crear` disabled while `mutation.isPending` or `esDemo`; `Cancelar` always enabled; Escape closes; focus lands on `Nombre` on open; axe clean while open
- [ ] 3.1.2 (GREEN) Create `apps/web/src/components/preview/NuevaCategoriaDesdeFilaForm.tsx` per D-08/D-09: shell `flex flex-col gap-4 rounded-md border border-border p-4`, `aria-labelledby` heading, `CampoTexto`/`CampoSelect` composition, bucket as static text via `ETIQUETA_BUCKET`, `useCrearCategoria()` owned here

### Phase 3.2: "+" trigger in `FilaRevision` (RED → GREEN)

- [ ] 3.2.1 (RED) Extend `apps/web/src/components/FilaRevision.test.tsx`: "+" not rendered without a bucket; rendered once a bucket is chosen; never rendered for `esDuplicado` rows; disabled with `aria-describedby="demo-catalogo-nota"` in demo; focus returns to the trigger on cancel and on success; form mounts inside the row's `<li>` when `filaCreando === fila.rowIndex`
- [ ] 3.2.2 (GREEN) Add the "+" trigger, trigger ref (for focus return), and form slot to `apps/web/src/components/FilaRevision.tsx`; accept new props `onCategoriaCreada`, `filaCreando`, `onAbrirCreacion`, `esDemo`; no business logic added (presentational only, D-10)

### Phase 3.3: `filaCreando` state in `PreviewMuestra` (RED → GREEN)

- [ ] 3.3.1 (RED) Extend `apps/web/src/components/PreviewMuestra.test.tsx`: at most one form open across the table; `onAbrirCreacion` toggles `filaCreando`; props pass through unchanged to `FilaRevision`
- [ ] 3.3.2 (GREEN) Add `filaCreando: number | null` state and `onAbrirCreacion` prop pass-through to `apps/web/src/components/PreviewMuestra.tsx`

### Phase 3.4: Minimal `SubirCartola` wiring (no re-run) (RED → GREEN)

- [ ] 3.4.1 (RED) Extend `apps/web/src/components/SubirCartola.test.tsx`: on `onCategoriaCreada(rowIndex, categoria)`, the originating row's `edits` map is set to `categoria.id`; no `previewMutation.mutate` call happens yet (explicitly asserted absent, to pin PR3's scope boundary); the demo note (`MENSAJE_DEMO_CATALOGO`, `id="demo-catalogo-nota"`) renders once inside the existing `esDemo &&` block
- [ ] 3.4.2 (GREEN) In `apps/web/src/components/SubirCartola.tsx`: add a minimal `handleCategoriaCreada(rowIndex, categoria)` that only updates `edits`; render the demo note once; pass `esDemo`, `onCategoriaCreada`, `filaCreando`/`onAbrirCreacion` through to `PreviewMuestra`

### Phase 3.5: Verification

- [ ] 3.5.1 Run `pnpm web test`
- [ ] 3.5.2 Run `pnpm web typecheck`
- [ ] 3.5.3 Run `pnpm web lint`

---

## PR4 — Orchestration: `previewData` hoist, re-run, diff announcement, e2e

**Start state**: `previewMutation.data` is the sole source of preview state (cleared on `.mutate()`, F-9); creating a categoría in PR3 updates `edits` but the review table shows stale suggestions until a manual re-upload.
**Finished state**: `previewData` is hoisted state, survives re-runs without unmounting the table; `handleCategoriaCreada` re-runs the preview with the same `File`, computes the D-12 diff, announces it via the existing `role="status"` region, focus returns to the row's "+" trigger; a failed re-run preserves the table and the already-created categoría (D-13).
**Verify**: `pnpm web test`, `pnpm web typecheck`, `pnpm web lint`, `pnpm web test:e2e` (Playwright, `crear-categoria-preview.e2e.ts`).
**Rollback boundary**: revert PR4 branch only; PR3's "create + adopt on the originating row" behavior still works standalone (row shows the new categoría even without a re-run).

### Phase 4.1: `previewData` hoist — its own commit, existing suite green first

- [ ] 4.1.1 (RED) Confirm `apps/web/src/components/SubirCartola.test.tsx`'s FULL existing suite (draft recovery, discard-confirm counts, exito landing, `previewMutation.data` reads) passes UNCHANGED as the regression gate before this task begins
- [ ] 4.1.2 (GREEN) In `apps/web/src/components/SubirCartola.tsx`: add `const [previewData, setPreviewData] = useState<PreviewIngestaDtoConCanonicos | null>(null)`; write it from `onSuccess` on both the initial preview and re-runs; replace every read of `previewMutation.data` (`mostrarPreview`, `<PreviewMuestra>` props, draft write-through effect deps, discard-confirm counts, `exito` banco line) with `previewData`; clear it in the same three reset paths that already clear `edits` (`procesarArchivoSeleccionado`, `handleDescartar`, `handleSubirOtra`); run the full existing suite green with NO new behavior added in this commit

### Phase 4.2: Re-run trigger + busy state (RED → GREEN)

- [ ] 4.2.1 (RED) Extend `SubirCartola.test.tsx`: `handleCategoriaCreada` calls `previewMutation.mutate(archivo, {...})` with the SAME `File` instance; the review table stays mounted during the re-run (no `[data-skeleton-preview]`); `aria-busy="true"` set on the preview `<section>`; "Agregar transacciones"/"Descartar" disabled while it runs; status message shows `'Actualizando la vista previa con la nueva categoría…'`
- [ ] 4.2.2 (GREEN) Implement the re-run call in `handleCategoriaCreada`; add the `mensajeOverride` layer on top of `MENSAJE_POR_ESTADO`; gate skeleton rendering on `previewData === null` only

### Phase 4.3: Focus management on re-run (RED → GREEN)

- [ ] 4.3.1 (RED) Extend `SubirCartola.test.tsx`/`FilaRevision.test.tsx`: `previewHeadingRef` is NOT focused after a re-run (only after a first preview); focus returns to the originating row's "+" trigger on both success and cancel, managed by `FilaRevision`'s trigger ref; `key={fila.rowIndex}` stability confirmed across the re-run
- [ ] 4.3.2 (GREEN) Add the `reevaluandoRef` flag in `SubirCartola.tsx` to suppress the `preview-listo` focus effect during re-runs

### Phase 4.4: Diff computation + announcement (RED → GREEN)

- [ ] 4.4.1 (RED) Extend `SubirCartola.test.tsx`: the status region announces `«{nombre}» se aplicó a {N} filas más.` (N>1), `«{nombre}» se aplicó a 1 fila más.` (N=1), `«{nombre}» se creó. Ninguna otra fila coincide con sus patrones.` (N=0); diff excludes the originating row and any row present in `editsDespues`; keyed by `rowIndex` via a `Map`, not array position
- [ ] 4.4.2 (GREEN) Implement the D-12 diff in `handleCategoriaCreada`'s `onSuccess`, snapshotting `previewDataAnterior` before the re-run

### Phase 4.5: Failed re-run handling (RED → GREEN)

- [ ] 4.5.1 (RED) Extend `SubirCartola.test.tsx`: `mostrarPreview = previewData !== null && estado !== 'exito'`; a failed re-run keeps the last good table and shows the inline notice `'No se pudo actualizar la vista previa. Tu categoría se creó y esta fila ya la usa; las demás filas conservan su sugerencia anterior.'`; the full-width `preview-error` block only renders when `previewData === null`
- [ ] 4.5.2 (GREEN) Implement the D-13 guard change and the inline re-run-failure notice

### Phase 4.6: e2e

- [ ] 4.6.1 Create `apps/web/e2e/crear-categoria-preview.e2e.ts` (Playwright, `stubApi` doctrine, no real backend): small 6-row fixture; stub `POST /api/categorias` → 201; stub `POST /api/ingestas/preview` to return a second, different body on the second call; assert the announcement text, the new categoría shown on matching rows, and that a pre-existing manual override is untouched

### Phase 4.7: Verification

- [ ] 4.7.1 Run `pnpm web test` (full suite, including 4.1's regression gate)
- [ ] 4.7.2 Run `pnpm web typecheck`
- [ ] 4.7.3 Run `pnpm web lint`
- [ ] 4.7.4 Run `pnpm web test:e2e`

---

## Cross-cutting: spec sync

- [ ] X.1 Confirm `openspec/specs/catalogo-clasificacion-ownership/spec.md` (CAT038-10..12) and `openspec/specs/web-import-preview/spec.md` (WEB-PRV-12..18) deltas are folded into the canonical spec files at archive time (owned by `sdd-archive`, not this phase)
