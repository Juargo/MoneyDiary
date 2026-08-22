# Tasks: US-059 — Web: Upload Cartola + Editable Review Preview

Strict TDD (`pnpm web test`): RED fails before GREEN.
Order: API layer (guard + client fn + types) → hook → CampoSelect srOnly → FilaRevision → PreviewMuestra rewrite → SubirCartola rewrite → eslint scoped block → a11y/responsive polish → final sweep.

Delivery strategy: ask-on-risk (Review Workload Forecast below; confirm split before apply starts). Chain strategy: stacked-to-main.
Three stacked PRs merge green to main; backend/mobile untouched.

---

## APPLY PRECONDITION (blocking — verify before writing any code)

**Apply starts from post-merge `main`, ONLY after the US-058 archive merge is confirmed.**

- [ ] T-00 — Verify precondition: run `git log origin/main --oneline | head -10` and confirm the US-058 archive commit is present. Then verify: `pnpm web test` passes (zero failures) and `pnpm web typecheck` exits 0. If either check fails: **STOP — do not write code until the baseline is green.**

---

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1 050 (PR1 ~280 + PR2 ~380 + PR3 ~390) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 = API layer + hook + CampoSelect + guard tests → PR2 = FilaRevision (new) + PreviewMuestra rewrite (+ their tests) → PR3 = SubirCartola rewrite + eslint block + a11y sweep + final typecheck/test/lint |
| Delivery strategy | ask-on-risk (user must confirm split before apply starts) |
| Chain strategy | stacked-to-main |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

### PR shippability contract

Every PR must compile (`pnpm web typecheck` exits 0) and pass tests (`pnpm web test` green) before merge.
The **legacy one-shot flow (`useIngesta`/`postIngesta`) remains live and untouched** until PR3 is merged and the new `SubirCartola` state machine is wired in. PR1 and PR2 add new code only — the existing `/subir` behavior is identical to `main` throughout those PRs. **PR3 is the single PR that flips the user-visible behavior.**

### Suggested Work Units

| Unit | Goal | PR | Est. lines |
|---|---|---|---|
| 1 | `types.ts` additions + `client.ts` guard hardening + `postCommitIngesta` + `use-commit-ingesta.ts` + guard/hook tests | PR 1 → main | ~280 |
| 2 | `FilaRevision.tsx` (new) + `FilaRevision.test.tsx` (new) + `PreviewMuestra.tsx` rewrite + `PreviewMuestra.test.tsx` rewrite | PR 2 → PR 1 | ~380 |
| 3 | `CampoSelect.tsx` srOnly + `SubirCartola.tsx` rewrite + `SubirCartola.test.tsx` rewrite + `eslint.config.js` block + a11y axe assertion + final sweep | PR 3 → PR 2 | ~390 |

---

## Phase 1 — API Layer: types + guards + client fn + hook [PR 1]

*Satisfies: WEB-PRV-03 (guard rejects legacy shape, accepts canonical), WEB-PRV-06 (commit sends file+edits, invalidates 4 keys), WEB-PRV-11 (legacy postIngesta/useIngesta unchanged); D-04, D-05, D-08.*

- [ ] T-01 — (RED) Write guard unit tests in a new `apps/web/src/api/client.guards.test.ts` (or co-locate in the existing test file if one exists for `client.ts`):
  - `esPreviewIngestaDto` REJECTS a payload missing `filas` (legacy shape with only `muestra`/`estructura`) → returns `false`.
  - `esPreviewIngestaDto` REJECTS a payload with `filas` present but `resumen` absent → returns `false`.
  - `esPreviewIngestaDto` REJECTS a row with `cargo: "12.5"` (decimal) → returns `false` (`esMontoStringValido` gate).
  - `esPreviewIngestaDto` REJECTS a row with `cargo: ""` (empty string) → returns `false`.
  - `esPreviewIngestaDto` REJECTS a row with malformed `sugerido` (missing `categoriaId`) → returns `false`.
  - `esPreviewIngestaDto` ACCEPTS a canonical payload with `filas[]` + `resumen.*` + well-formed rows → returns `true`.
  - `esCommitIngestaDto` REJECTS a payload missing `ingestaId` → returns `false`.
  - `esCommitIngestaDto` ACCEPTS a valid commit response with `ingestaId`, `totalTransacciones`, `duplicadosOmitidos`, `transacciones[]` → returns `true`.
  **File (test first):** `apps/web/src/api/client.guards.test.ts`.

- [ ] T-02 — (GREEN) Harden `esPreviewIngestaDto` in `apps/web/src/api/client.ts` (D-08):
  - Replace the existing body that validates only `muestra`/`estructura` with hardened checks:
    - Keep: `banco:string`, `tipoCuenta:string`, `numeroCuenta:string`.
    - Add: `Array.isArray(candidato.filas) && candidato.filas.every(esPreviewFilaDto)`.
    - Add: `esResumenPreviewDto(candidato.resumen)` where it checks `totalFilas/duplicadosDetectados/nuevas` are `number`.
    - `esPreviewFilaDto` validates: `rowIndex:number`, `fecha:string` + `esFechaValida`, `descripcion:string`, `cargo/abono:string` + `esMontoStringValido`, `esDuplicado:boolean`, `sugerido` is `null | { bucket:string, categoriaId: string|null }`.
    - Drop legacy `muestra`/`estructura` guard checks; add comment: `// muestra/estructura not validated — deprecated fields removed in US-061`.
  - Change return type to user-defined type predicate `value is PreviewIngestaDtoConCanonicos`.
  - Add `esCommitIngestaDto` guard: validates `ingestaId:string`, `totalTransacciones:number`, `duplicadosOmitidos:number`, `transacciones[]` with `bucket:string`, `categoriaId:string|null`, money strings via `esMontoStringValido`, `fecha` via `esFechaValida`.
  Verify: `pnpm web test` (guard tests green) + `pnpm web typecheck`.

- [ ] T-03 — Modify `apps/web/src/api/types.ts` (D-08):
  - Re-export `PreviewFilaDto` and `CommitIngestaDto` from `@moneydiary/api-client`.
  - Define and export locally `PreviewIngestaDtoConCanonicos` intersection alias:
    ```ts
    export type PreviewIngestaDtoConCanonicos =
      Omit<PreviewIngestaDto, 'filas' | 'resumen'> & {
        readonly filas: ReadonlyArray<PreviewFilaDto>;
        readonly resumen: NonNullable<PreviewIngestaDto['resumen']>;
      };
    ```
  - Define and export `CatalogoEstado` discriminated union:
    ```ts
    export type CatalogoEstado =
      | { readonly tag: 'cargando' }
      | { readonly tag: 'error' }
      | { readonly tag: 'listo'; readonly grupos: ReadonlyArray<GrupoCategoriaPorBucket> };
    ```
  Verify: `pnpm web typecheck`.

- [ ] T-04 — Modify `apps/web/src/api/use-preview-ingesta.ts` (D-08):
  - Re-type the `useMutation` generic to `PreviewIngestaDtoConCanonicos` (from `types.ts`).
  - No logic changes; the return-type narrowing flows from `client.ts`'s hardened `previewIngesta` return type.
  Verify: `pnpm web typecheck`.

- [ ] T-05 — Add `postCommitIngesta` to `apps/web/src/api/client.ts` (D-04):
  - Signature: `postCommitIngesta(file: File, edits: ReadonlyArray<{ rowIndex: number; categoriaId: string | null }>): Promise<ApiResult<CommitIngestaDto>>`.
  - Builds `FormData`: `append('file', file)` then `append('edits', JSON.stringify(edits))` (always send the field — empty array is valid).
  - No manual `Content-Type` header (browser sets the multipart boundary).
  - Status mapping identical to `postIngesta`: 400 → `body.message` verbatim; 401 → fixed `"Tu sesión expiró…"`; non-2xx → `server`; network throw → `network`; guard-fail on 2xx → `parse`.
  - Response validated by `esCommitIngestaDto` (T-02).
  Verify: `pnpm web typecheck`.

- [ ] T-06 — (RED) Write unit tests for `useCommitIngesta` in `apps/web/src/api/use-commit-ingesta.test.ts` (D-05):
  - `mutationFn` unwraps a successful `ApiResult<CommitIngestaDto>` and resolves the DTO.
  - `mutationFn` throws the tagged `ApiError` when `postCommitIngesta` returns `ok: false`.
  - `onSuccess` calls `queryClient.invalidateQueries` for `['resumen']`, `['resumen-anual']`, `['detalle-bucket-mes']`, and `['ingestas']` (spy on `invalidateQueries`; assert all 4 calls).
  - Navigation is NOT asserted here — it lives at the call site (`SubirCartola`), so the hook tests run without a router mock.
  **File (test first):** `apps/web/src/api/use-commit-ingesta.test.ts`.

- [ ] T-07 — (GREEN) Create `apps/web/src/api/use-commit-ingesta.ts` (D-05):
  - `useMutation<CommitIngestaDto, ApiError, { file: File; edits: ReadonlyArray<{ rowIndex: number; categoriaId: string | null }> }>`.
  - `mutationFn`: calls `postCommitIngesta(vars.file, vars.edits)`; unwraps `ApiResult` or throws `result.error` (mirror of `use-ingesta.ts:22-29`).
  - `onSuccess`: invalidates `['resumen']`, `['resumen-anual']`, `['detalle-bucket-mes']`, `['ingestas']`. Does NOT call `navigate` — navigation wired at the call site in `SubirCartola`.
  Verify: `pnpm web test` (hook tests green) + `pnpm web typecheck`.

- [ ] T-08 — Verify Phase 1: `pnpm web test` (all suites green) + `pnpm web typecheck` exits 0. Confirm `useIngesta` / `postIngesta` exports are still present and unmodified (WEB-PRV-11).
  **Work-unit commit:** `feat(web): API layer — guard hardening, postCommitIngesta, useCommitIngesta (US-059 PR1)`.

---

## Phase 2 — FilaRevision (new) + PreviewMuestra rewrite [PR 2]

*Satisfies: WEB-PRV-02 (resumen header + all rows rendered), WEB-PRV-04 (duplicate greyed+disabled), WEB-PRV-05 (bucket→categoría cascade, user catalog, empty-bucket-drop), WEB-PRV-09 (accessible per-row labels); D-06, D-09, D-10, D-12.*

> PR 2 targets PR 1 branch (stacked-to-main). The existing `SubirCartola` still uses the old `PreviewMuestra` props at this point — `PreviewMuestra` gets the new props signature here, but `SubirCartola` wiring happens in PR 3. The build stays green because `SubirCartola` is not yet modified.
>
> **Implementation note:** update `PreviewMuestra`'s props interface and body in this PR, but the call site in `SubirCartola.tsx` still passes the OLD props (which will produce a `tsc` error on PR 3 only). To keep PR 2 independently green, either (a) keep a temporary backward-compatible overload in `PreviewMuestra` or (b) coordinate the `SubirCartola` call site update into PR 2 as a stub. **Preferred approach:** update the call site in `SubirCartola.tsx` to pass the new props in this PR (as a stub that compiles but is not behaviorally activated — the state machine switch happens in PR 3). This keeps the type contract consistent across the PR.

- [ ] T-09 — (RED) Write `apps/web/src/components/FilaRevision.test.tsx` (new test file, D-12):
  - Renders row cells: `fecha` (`.slice(0,10)` of ISO string), `descripcion`, `formatearMontoCLP(cargo)`, `formatearMontoCLP(abono)`.
  - Duplicate row (`esDuplicado=true`): greyed container, `<Badge>Duplicado</Badge>` present, BOTH selects are `disabled` (query by label, assert `disabled` attribute).
  - Non-duplicate row (`esDuplicado=false`): selects are enabled and interactive.
  - Bucket select filters categoría options to the chosen bucket's group: select "Deseos" → only "Deseos" categories appear in the categoría `<select>` options.
  - Selecting a categoría fires `onEditChange(rowIndex, cat.id)`.
  - Selecting the "Sin categoría" sentinel fires `onEditChange(rowIndex, null)`.
  - Changing bucket resets the categoría select to the sentinel (the previously selected categoría is cleared).
  - Each select is reachable via `getByLabelText(/Fila 3: bucket/i)` and `getByLabelText(/Fila 3: categoría/i)` (D-10; `n = rowIndex + 1`).
  - `catalogo.tag === 'cargando'` → selects are disabled (no crash).
  - `catalogo.tag === 'error'` → selects are absent or disabled (no crash).
  **File (test first):** `apps/web/src/components/FilaRevision.test.tsx`.

- [ ] T-10 — (GREEN) Create `apps/web/src/components/FilaRevision.tsx` (D-12):
  - Props per design §4 `FilaRevision` contract: `{ fila, categoriaId, catalogo, onEditChange }`.
  - Local state: `bucketUI: string` — seeds from `fila.sugerido?.bucket` only when that bucket value exists among `catalogo.grupos` (when `catalogo.tag === 'listo'`); otherwise empty string.
  - Renders: date cell (`fila.fecha.slice(0,10)`), description cell, amount cells (`formatearMontoCLP(fila.cargo)`, `formatearMontoCLP(fila.abono)`).
  - Duplicate branch (`fila.esDuplicado`): greyed container class + shadcn `<Badge>Duplicado</Badge>` + two `<CampoSelect disabled srOnly label="Fila N: bucket" />` and `<CampoSelect disabled srOnly label="Fila N: categoría" />` (no `onEditChange` wired).
  - Non-duplicate + catalog loaded branch: two `<CampoSelect srOnly>` — (1) bucket select with options from `catalogo.grupos.map(g => g.bucket)`; (2) categoría select filtered to `grupos.find(g => g.bucket === bucketUI)?.categorias`; leading sentinel `{ value: '', label: 'Sin categoría' }`. Selecting a categoría: `value === '' ? onEditChange(fila.rowIndex, null) : onEditChange(fila.rowIndex, value)`. Changing bucket: reset categoría to sentinel.
  - Label format: `"Fila ${fila.rowIndex + 1}: bucket"` / `"Fila ${fila.rowIndex + 1}: categoría"`.
  - Does NOT import `agruparPorBucket` (receives pre-computed `grupos` via `CatalogoEstado`; D-06/D-12).
  Verify: `pnpm web test` (FilaRevision tests green) + `pnpm web typecheck`.

- [ ] T-11 — (RED) Rewrite `apps/web/src/components/PreviewMuestra.test.tsx`:
  - Replace all `PreviewTransaccionDto`/`muestra`/`estructura` fixtures with `filas`/`resumen`/`edits`/`onEditChange`/`catalogo` prop shapes (use `unaFilaPreview(overrides)` factory).
  - Asserts: `resumen.totalFilas`, `resumen.duplicadosDetectados`, `resumen.nuevas` are displayed.
  - "nada se ha guardado aún" (or equivalent) affordance is visible (CA-02, WEB-PRV-02).
  - One `FilaRevision` rendered per `filas` entry (assert via unique cell text or row count).
  - When `edits` has an entry for a row, the merged display value (the edited categoriaId) is shown over `sugerido` (D-05).
  - `catalogo.tag === 'cargando'` → rows still render (the table is not blocked by catalog loading; D-07).
  - `catalogo.tag === 'error'` → rows still render; an inline catalog-error affordance is present (D-07).
  - No pagination controls exist (decision 4, WEB-PRV-02).
  **File (rewrite):** `apps/web/src/components/PreviewMuestra.test.tsx`.

- [ ] T-12 — (GREEN) Rewrite props and body of `apps/web/src/components/PreviewMuestra.tsx` (D-12):
  - New props per design §4 `PreviewMuestra` contract: `{ filas, resumen, edits, onEditChange, catalogo }`.
  - Remove old props: `cantidad`, `onCantidadChange`, `banco`, `totalFilasDatos`.
  - Remove the 10/25/50 quantity selector UI.
  - Render: resumen header (`totalFilas`, `duplicadosDetectados`, `nuevas`); "nada se ha guardado aún" affordance; full `filas.map(fila => <FilaRevision ... />)` — no slice, no pagination.
  - Display-merge prop to each `FilaRevision`: `categoriaId={edits.has(fila.rowIndex) ? edits.get(fila.rowIndex)! : (fila.sugerido?.categoriaId ?? null)}` (D-05).
  - Pass `catalogo` down to each `FilaRevision`.
  - When `catalogo.tag === 'cargando'` or `'error'`: render a non-blocking inline state alongside the table rows (degraded catalog, D-07).
  Verify: `pnpm web test` (PreviewMuestra tests green) + `pnpm web typecheck`.

- [ ] T-13 — Verify Phase 2: `pnpm web test` (all suites green) + `pnpm web typecheck` exits 0. Confirm `useIngesta`/`postIngesta`/`PreviewMuestra.test.tsx` existing snapshot/behavior tests are not broken.
  **Work-unit commit:** `feat(web): FilaRevision (new) + PreviewMuestra rewrite — review table (US-059 PR2)`.

---

## Phase 3 — CampoSelect srOnly + SubirCartola rewrite + eslint + a11y + final sweep [PR 3]

*Satisfies: WEB-PRV-01 (upload triggers preview + loading), WEB-PRV-02 (review renders), WEB-PRV-03 (guard gate), WEB-PRV-04 (duplicate disabled), WEB-PRV-05 (cascade catalog), WEB-PRV-06 (commit + invalidate + navigate /), WEB-PRV-07 (discard resets + navigate /), WEB-PRV-08 (preview errors, retry without reload), WEB-PRV-09 (a11y clean), WEB-PRV-10 (tablet T1/T2), WEB-PRV-11 (legacy unchanged); D-01 through D-12.*

> PR 3 targets PR 2 branch (stacked-to-main). **This is the PR that switches the user-visible behavior.** After merge, `/subir` runs the new preview→review→commit flow. `useIngesta`/`postIngesta` remain exported and importable (WEB-PRV-11 regression guard).

- [ ] T-14 — Modify `apps/web/src/components/configuracion/categorias/CampoSelect.tsx` (D-10):
  - Add optional `srOnly?: boolean` prop.
  - When `srOnly={true}`: wrap label text in `<span className="sr-only">{label}</span>` instead of rendering the plain text node.
  - When `srOnly` is absent or `false`: behavior is identical to current (no change for existing callers — `NuevaCategoriaForm`, `EditarCategoria`, etc.).
  Verify: `pnpm web typecheck` (existing callers must not require prop).

- [ ] T-15 — (RED) Rewrite `apps/web/src/components/SubirCartola.test.tsx`:
  - Replace `validPreviewDto` fixture (legacy `muestra`/`estructura` shape) with canonical `filas`/`resumen` shape using `unaFilaPreview()` factory.
  - Add `vi.mock('@/api/use-commit-ingesta')` alongside the existing `vi.mock('@/api/use-preview-ingesta')` and `vi.mock('@/api/use-categorias')`.
  - State machine transitions:
    - Pick file → `previewMutation.mutate(file)` called; state shows loading indicator.
    - Preview resolves (canonical shape) → review table renders (`PreviewMuestra`).
    - Edit row 3 → `edits.set(3, 'cat_abc')` → commit button enabled.
    - "Agregar transacciones" → `commitMutation.mutate` called with `{ file, edits: [{ rowIndex: 3, categoriaId: 'cat_abc' }] }` **sparse** (only touched row; D-03/D-04).
    - Commit success → `navigate` mock called with `{ to: '/' }` (D-05).
    - "Descartar" → `handleDescartar`: both mutations reset, edits cleared, `navigate({ to: '/' })` called; no commit call (WEB-PRV-07, CA-05).
    - Preview 400 → `role="alert"` shows backend `body.message`; file input re-enabled (WEB-PRV-08, D-11).
    - Commit 400 → `role="alert"` shows backend `body.message`; review table REMAINS rendered; edits preserved (all row edits still present); "Agregar transacciones" accessible for retry; file input re-enabled (WEB-PRV-06, D-11).
    - New file picked after commit error → `handleFileChange` clears edits Map and resets both mutations; previous edits NOT present in the new flow (D-02/D-11).
    - Duplicate rows never appear in the committed `edits` overlay (D-10).
    - Double-submit guard: `isSubmittingRef` prevents duplicate commit calls (D-02, SEC-01).
    - Discard then re-upload: edits are empty after re-upload (WEB-PRV-07).
  **File (rewrite):** `apps/web/src/components/SubirCartola.test.tsx`.

- [ ] T-16 — (GREEN) Rewrite `apps/web/src/components/SubirCartola.tsx` (D-01/D-02/D-03/D-07/D-11):
  - **State rename:** `subiendo → committing` throughout the `EstadoSubida` type and all references; update `MENSAJE_POR_ESTADO` map to stay exhaustive.
  - **New states:** add `preview-listo` and `preview-error`; derived `estado` logic covers: `previsualizando`, `preview-error` (when `previewMutation.isError`), `preview-listo` (when `previewMutation.isSuccess && !commitMutation.*`), `committing`, `error` (when `commitMutation.isError`), `exito` (transient).
  - **`File` state:** `archivo: File | null` (existing at `:85`). **NEW** `edits: Map<number, string | null>` state (initialized as `new Map()`).
  - **`useCommitIngesta()`** wired alongside the existing `usePreviewIngesta()`.
  - **`useCategorias()`** co-fetched on mount (D-07); compute `CatalogoEstado` from its `isPending`/`isError`/`data` + `agruparPorBucket(data?.categorias ?? [])`.
  - **`handleFileChange`:** resets `previewMutation`, `commitMutation`, and `setEdits(new Map())` before calling `previewMutation.mutate(file)`.
  - **`handleDescartar`:** resets both mutations, clears edits, calls `navigate({ to: '/' })` (no commit).
  - **`handleConfirmar`:** double-submit guard → `commitMutation.mutate({ file: archivo!, edits: Array.from(edits, ([rowIndex, categoriaId]) => ({ rowIndex, categoriaId })) }, { onSuccess: () => navigate({ to: '/' }) })`.
  - **`handleEditChange(rowIndex, categoriaId)`:** `setEdits(prev => new Map(prev).set(rowIndex, categoriaId))`.
  - **`pickerGateado` fix (two simultaneous changes — D-11):** (1) REMOVE `error` from the gate expression so the file input re-enables after commit error; (2) RENAME `subiendo` reference to `committing`.
  - **`preview-listo` render:** `<PreviewMuestra filas={previewMutation.data.filas} resumen={previewMutation.data.resumen} edits={edits} onEditChange={handleEditChange} catalogo={catalogoEstado} />` + "Agregar transacciones" / "Descartar" action buttons.
  - **`exito` render:** replace the large success `<section>` with a minimal render: `<p>Importación completada.</p><Link to="/">Ir al dashboard</Link>` (D-01 — no blank screen on slow navigate).
  - **`useNavigate()`** from `@tanstack/react-router` called inside the component (pattern: `LoginForm.tsx:3,19`).
  - **`usePreviewIngesta`** remains wired; its `data` type is now `PreviewIngestaDtoConCanonicos` (no `!` assertions; D-08/§5).
  Verify: `pnpm web test` (SubirCartola tests green) + `pnpm web typecheck`.

- [ ] T-17 — Modify `apps/web/eslint.config.js` (D-10, §7):
  - Add a scoped `error`-level `jsx-a11y` block covering:
    `src/components/FilaRevision.tsx`, `src/components/PreviewMuestra.tsx`, `src/components/SubirCartola.tsx`.
  - Follow the existing per-US FILE-LIST block pattern (same form as the US-047/054 blocks — loose siblings under `src/components/`, not a subdirectory; pattern at lines 114–184 of the current config).
  Verify: running `pnpm web lint` (or `eslint apps/web/src/components/FilaRevision.tsx`) reports zero a11y errors.

- [ ] T-18 — A11y assertion + responsive check (WEB-PRV-09, WEB-PRV-10):
  - In `FilaRevision.test.tsx` (or a dedicated `a11y.test.tsx`), add a `vitest-axe` assertion:
    `expect(await axe(container)).toHaveNoViolations()` over the rendered review table with ~3 rows (including 1 duplicate).
  - Verify the existing `PreviewMuestra` stacked `flex-col` list layout is preserved (no horizontal scroll trap at narrow widths); add a comment referencing WEB-PRV-10 and the T1 (768px) / T2 (1024px) viewport requirement.
  - Confirm the `<CampoSelect srOnly>` pair stacks under row cells on narrow widths (`flex-col sm:flex-row` pattern per design §8).
  Verify: `pnpm web test` (axe assertion passes).

- [ ] T-19 — Regression guard check (WEB-PRV-11):
  - Confirm `useIngesta` and `postIngesta` are NOT imported anywhere in `SubirCartola.tsx`, `use-commit-ingesta.ts`, `PreviewMuestra.tsx`, or `FilaRevision.tsx`.
  - Confirm `useIngesta` and `postIngesta` exports still exist in `use-ingesta.ts` / `client.ts`.
  - In `SubirCartola.test.tsx`, assert that the commit mutation is the only one called on the "Agregar transacciones" path; the one-shot `postIngesta` is never invoked.

- [ ] T-20 — Final sweep: `pnpm web test` (all suites green, zero skipped) + `pnpm web typecheck` exits 0 + `pnpm web lint` (or equivalent) exits 0 with zero a11y errors. Confirm no `!` assertions in `SubirCartola.tsx`, `PreviewMuestra.tsx`, or `FilaRevision.tsx` on `previewMutation.data.filas` / `.resumen`.
  **Work-unit commit:** `feat(web): SubirCartola rewrite, CampoSelect srOnly, eslint a11y block, final sweep (US-059 PR3)`.

---

## Parallel / sequential map

| Tasks | Relationship |
|---|---|
| T-00 | Pre-flight gate (must verify before any code) |
| T-01 → T-02 | Sequential (test first, then implementation) |
| T-03, T-04, T-05 | Can run in parallel after T-02 (types, use-preview re-type, postCommitIngesta are independent) |
| T-06 → T-07 | Sequential (test first, then hook); depends on T-05 (client fn must exist for mutationFn import) |
| T-08 | Gate after T-01 through T-07 (PR 1 verify + commit) |
| T-09 → T-10 | Sequential (FilaRevision test first, then component); depends on T-08 (types must exist) |
| T-11 → T-12 | Sequential (PreviewMuestra test first, then rewrite); can start in parallel with T-09/T-10 (different files) |
| T-13 | Gate after T-09 through T-12 (PR 2 verify + commit) |
| T-14 | Can start as soon as PR 2 merges; independent of T-15/T-16 |
| T-15 → T-16 | Sequential (SubirCartola test rewrite first, then implementation); depends on T-13 (PR 2 types + components) |
| T-17 | Can start as soon as PR 2 merges; independent of T-15/T-16 |
| T-18 | Depends on T-10 (FilaRevision must exist for axe render) and T-16 (SubirCartola must be wired) |
| T-19 | Depends on T-16 (SubirCartola rewrite complete) |
| T-20 | Gate after T-14 through T-19 (PR 3 final sweep + commit) |

---

## Requirement traceability

| Requirement | Tasks |
|---|---|
| WEB-PRV-01 (upload triggers preview + loading state) | T-15, T-16 |
| WEB-PRV-02 (resumen header + all rows, "nada guardado" affordance) | T-11, T-12, T-15, T-16 |
| WEB-PRV-03 (guard rejects legacy shape, accepts canonical) | T-01, T-02 |
| WEB-PRV-04 (duplicate greyed + badge + disabled selects) | T-09, T-10, T-15, T-16 |
| WEB-PRV-05 (bucket→categoría cascade, user catalog, empty-bucket-drop) | T-09, T-10, T-11, T-12 |
| WEB-PRV-06 (commit: file+edits overlay, invalidate 4 keys, navigate /) | T-05, T-06, T-07, T-15, T-16 |
| WEB-PRV-07 (discard resets state, navigate /, edits cleared) | T-15, T-16 |
| WEB-PRV-08 (preview 400/401 shows message, retry without reload) | T-15, T-16 |
| WEB-PRV-09 (per-row selects have accessible labels, jsx-a11y clean) | T-09, T-10, T-14, T-17, T-18 |
| WEB-PRV-10 (responsive T1/T2 tablet) | T-18 |
| WEB-PRV-11 (legacy useIngesta/postIngesta unchanged) | T-08, T-19 |
| ADR-024 boundary (no client money math / dedup / classification) | T-10, T-12, T-16 (no re-computation in render) |
| D-01 (state rename, exito minimal render) | T-15, T-16 |
| D-02 (File + edits in component state; cleared on handleFileChange/handleDescartar) | T-15, T-16 |
| D-03 (edits as Map<number, string\|null>; sparse serialization) | T-15, T-16 |
| D-04 (postCommitIngesta: multipart, always-send edits field) | T-05 |
| D-05 (useCommitIngesta: invalidate 4 keys; navigate at call site) | T-06, T-07, T-16 |
| D-06 (cascade: bucket UI-only filter; only categoriaId to overlay) | T-09, T-10 |
| D-07 (catalog co-fetched on mount; table renders even if catalog pending/error) | T-11, T-12, T-16 |
| D-08 (hardened guard → intersection type → no ! assertions) | T-01, T-02, T-03, T-04 |
| D-09 (no new npm deps, no new shadcn components) | T-10 (native table), T-12 |
| D-10 (srOnly labels; duplicate selects disabled; eslint error-level block) | T-09, T-10, T-14, T-17 |
| D-11 (commit error preserves preview+edits; pickerGateado fix — two changes) | T-15, T-16 |
| D-12 (container/presentational split; FilaRevision own file) | T-09, T-10, T-11, T-12 |
