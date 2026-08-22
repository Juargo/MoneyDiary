# Tasks: US-060 — Web: formulario de ingreso manual

Strict TDD (`pnpm web test`): RED fails before GREEN.
Order: precondition gate → `hoyLocal` helper → API layer (client fn + guard + types + hook) → test fixtures → form component (test-first) → route + nav → eslint scoped block → final sweep.

Delivery strategy: ask-on-risk · Chain strategy: stacked-to-main.
Two stacked PRs; each merges green to `main`. Backend/mobile untouched.

---

## APPLY PRECONDITION (blocking — verify before writing any code)

- [x] T-00 — Verify precondition: run `git log origin/main --oneline | head -10` and confirm the US-058 archive commit and the US-059 archive commit are present in `main`. Then run `pnpm web test` (all suites green) and `pnpm web typecheck` (exits 0). If either check fails: **STOP — do not write code until the baseline is green.**

---

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~850 (PR1 ~310 + PR2 ~540) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 = `domain/fecha.ts` + `movimientos.ts` + `use-registrar-movimiento.ts` + `types.ts` + `movimiento-fixtures.ts` + tests (no UI change) → PR2 = `RegistrarMovimientoForm.tsx` + `registrar.tsx` + `nav-items.ts` + `eslint.config.js` + all form/a11y tests |
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
**PR1 adds new API-layer code only — no existing component or route is changed. The `/subir` upload flow and all existing nav items remain identical to `main` throughout PR1.** PR2 is the single PR that adds the user-visible `/registrar` surface.

### Suggested Work Units

| Unit | Goal | PR | Est. lines |
|---|---|---|---|
| 1 | `hoyLocal()` helper + `movimientos.ts` (client fn + guard + input alias) + `use-registrar-movimiento.ts` (hook) + `types.ts` re-export + `movimiento-fixtures.ts` + tests for all three | PR 1 → main | ~310 |
| 2 | `RegistrarMovimientoForm.tsx` + `RegistrarMovimientoForm.test.tsx` + `registrar.tsx` route + `nav-items.ts` "Registrar" entry + `eslint.config.js` scoped a11y block | PR 2 → PR 1 | ~540 |

---

## Phase 1 — Domain helper + API layer [PR 1]

*Satisfies: WEB-REG-02 (hoyLocal for fecha default + max + submit gate), WEB-REG-05 (esMontoManualValido guard), WEB-REG-06 (hook mutation fn), WEB-REG-07 (invalidate 4 keys), WEB-REG-10 (esRegistrarMovimientoManualDto response guard); D-04, D-05, D-06, D-07.*

- [x] T-01 — (RED) Write `apps/web/src/domain/fecha.test.ts` additions (add to existing file or sibling):
  - `hoyLocal()` returns a string matching `YYYY-MM-DD` (regex `/^\d{4}-\d{2}-\d{2}$/`).
  - `hoyLocal()` equals `new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())` for the local date (pin the expectation to today's `YYYY-MM-DD` from the same call in the test).
  - `hoyLocal()` does NOT equal `new Date().toISOString().slice(0,10)` when the runtime UTC hour ≥ 20 and Chile local day has not advanced (TZ-rationale comment: "Chile is UTC-4; aFechaCorta of UTC ISO yields TOMORROW for Chilean evenings — hoyLocal() uses Intl.DateTimeFormat with America/Santiago"). Note: this inequality test may be environment-dependent; at minimum assert the format + Intl equality above.

- [x] T-02 — (GREEN) Add `hoyLocal()` to `apps/web/src/domain/fecha.ts`:
  - `export function hoyLocal(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date()); }`
  - Do NOT modify `esFechaValida`, `aFechaCorta`, or any other existing export.
  - Verify: `pnpm web test` (fecha tests green) + `pnpm web typecheck`.

- [x] T-03 — (RED) Write `apps/web/src/api/movimientos.test.ts` (new pure test file, no DOM):
  - **`postMovimientoManual` — 201:** mocked `fetch` returns `{ ok: true, status: 201, json: () => Promise.resolve(<canonical 201 response>) }` → resolves to `{ ok: true, value: <RegistrarMovimientoManualDto> }`.
  - **`postMovimientoManual` — 400 (no body):** mocked `fetch` returns `{ ok: false, status: 400 }` → resolves to `{ ok: false, error: { tag: 'invalid', message: 'Datos inválidos. Revisá los campos y volvé a intentar.' } }`. Assert `res.json` is NEVER called on a 400 response (the endpoint sends no body — D-06 §0).
  - **`postMovimientoManual` — 401:** resolves to `{ ok: false, error: { tag: 'unauthorized', message: 'Tu sesión expiró. Iniciá sesión de nuevo.' } }`.
  - **`postMovimientoManual` — 500:** resolves to `{ ok: false, error: { tag: 'server', ... } }`.
  - **`postMovimientoManual` — network throw:** rejects with a network `Error` → resolves to `{ ok: false, error: { tag: 'network', ... } }`.
  - **`postMovimientoManual` — malformed 201:** 2xx response body fails guard → resolves to `{ ok: false, error: { tag: 'parse', ... } }`.
  - **`esRegistrarMovimientoManualDto` — accepts canonical 8-field 201:** all fields present + `origen: 'Manual'` → returns `true`.
  - **`esRegistrarMovimientoManualDto` — rejects missing `id`:** → returns `false`.
  - **`esRegistrarMovimientoManualDto` — rejects missing `origen`:** → returns `false`.
  - **`esRegistrarMovimientoManualDto` — rejects missing `cargo`:** → returns `false`.
  - **`esRegistrarMovimientoManualDto` — rejects missing `abono`:** → returns `false`.
  - **`esRegistrarMovimientoManualDto` — rejects `cargo: "12.5"` (decimal — not `esMontoStringValido`):** → returns `false`.
  - **`esRegistrarMovimientoManualDto` — rejects `cargo: ""` (empty):** → returns `false`.
  - **`esRegistrarMovimientoManualDto` — accepts `fecha` as a full ISO-8601 timestamp** (e.g. `"2026-08-22T14:30:00.000Z"`) — guard uses `esFechaValida` (parseability, not short-date format).

- [x] T-04 — (GREEN) Create `apps/web/src/api/movimientos.ts` (new file — D-06/D-07):
  - Define and export `RegistrarMovimientoManualInput` discriminated union (D-07):
    ```ts
    export type RegistrarMovimientoManualInput =
      | { readonly tipo: 'Ingreso'; readonly fecha: string; readonly descripcion: string; readonly monto: string }
      | { readonly tipo: 'Gasto'; readonly fecha: string; readonly descripcion: string; readonly monto: string;
          readonly bucket: BucketAsignable; readonly categoriaId: string };
    ```
    Import `BucketAsignable` from `@/api/catalogo-constantes`.
  - Define `esRegistrarMovimientoManualDto` (response guard — D-06): checks `id:string`, `fecha:string` + `esFechaValida`, `descripcion:string`, `cargo:string` + `esMontoStringValido`, `abono:string` + `esMontoStringValido`, `bucket:string`, `categoriaId: string | null`, `origen === 'Manual'`. Returns `value is RegistrarMovimientoManualDto`.
  - Define and export `postMovimientoManual(body: RegistrarMovimientoManualInput): Promise<ApiResult<RegistrarMovimientoManualDto>>`:
    ```ts
    fetch('/api/movimientos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    ```
    Status mapping: **400 → do NOT read body** → `{ tag: 'invalid', message: 'Datos inválidos. Revisá los campos y volvé a intentar.' }`; 401 → `{ tag: 'unauthorized', message: 'Tu sesión expiró. Iniciá sesión de nuevo.' }`; non-2xx → `{ tag: 'server', ... }`; network throw → `{ tag: 'network', ... }`; 2xx guard-fail → `{ tag: 'parse', ... }`. Mirror `postReclasificarCategoria` (`client.ts:761-825`) as the verb-agnostic JSON-body precedent.
  - Verify: `pnpm web test` (movimientos.test.ts green) + `pnpm web typecheck`.

- [x] T-05 — Modify `apps/web/src/api/types.ts`:
  - Re-export `RegistrarMovimientoManualDto` from `@moneydiary/api-client` (already exported at `packages/api-client/src/index.ts:126`).
  - Do NOT re-export `RegistrarMovimientoManualInput` — it lives in `movimientos.ts` only (the `CategoriaInput`/`PatronInput` co-location precedent: `categorias.ts:214-233` — neither is re-exported from `types.ts`).
  - Verify: `pnpm web typecheck`.

- [x] T-06 — (RED) Write `apps/web/src/api/use-registrar-movimiento.test.tsx` (new, no router — D-05):
  - `mutationFn` unwraps a successful `ApiResult<RegistrarMovimientoManualDto>` and resolves the typed DTO.
  - `mutationFn` throws the tagged `ApiError` when `postMovimientoManual` returns `ok: false`.
  - `onSuccess` spy on `queryClient.invalidateQueries` → called with `['resumen']`, `['resumen-anual']`, `['detalle-bucket-mes']`, `['ingresos-mes']` (all 4; assert each call).
  - `onSuccess` does NOT call `invalidateQueries` with `['ingestas']` (the wrong 4th key from `useCommitIngesta` — must not appear).
  - No `navigate` call anywhere in the hook.

- [x] T-07 — (GREEN) Create `apps/web/src/api/use-registrar-movimiento.ts` (new — D-05):
  - `useMutation<RegistrarMovimientoManualDto, ApiError, RegistrarMovimientoManualInput>`; `mutationFn` calls `postMovimientoManual(vars)` and unwraps `ApiResult` or throws `result.error`.
  - `onSuccess`: invalidates `['resumen']`, `['resumen-anual']`, `['detalle-bucket-mes']`, `['ingresos-mes']`. No navigation, no `onError` — both are the call site's responsibility.
  - Mirrors `use-commit-ingesta.ts:43-49` structure. Import `RegistrarMovimientoManualDto` from `@/api/types`; `RegistrarMovimientoManualInput` from `@/api/movimientos`.
  - Verify: `pnpm web test` (hook tests green) + `pnpm web typecheck`.

- [x] T-08 — Create `apps/web/src/test-utils/movimiento-fixtures.ts` (new — shared test factory):
  - Export `unMovimientoManualDto(overrides?: Partial<RegistrarMovimientoManualDto>): RegistrarMovimientoManualDto` — a valid 201 response with: `id: 'mov_abc'`, `fecha: '2026-08-22T12:00:00.000Z'`, `descripcion: 'Almuerzo'`, `cargo: '0'`, `abono: '5000'`, `bucket: 'Necesidades'`, `categoriaId: 'cat_xyz'`, `origen: 'Manual'`.
  - Reuse `unCatalogo` from `preview-fixtures.ts` (or add a small `unCatalogoDto(overrides?)` if a raw `CatalogoDto` is needed to feed a `useCategorias` mock — mirror `preview-fixtures.ts:1-63` DRY pattern).
  - Verify: import in a test file compiles (`pnpm web typecheck`).

- [x] T-09 — Verify Phase 1: `pnpm web test` (all suites green, zero skipped) + `pnpm web typecheck` exits 0. Confirm `useIngesta`/`postIngesta`/`SubirCartola` exports are still present and unmodified (WEB-REG-12).
  **Work-unit commit:** `feat(web): api layer — hoyLocal, postMovimientoManual, useRegistrarMovimiento (US-060 PR1)`.

---

## Phase 2 — Form component + route + nav + eslint [PR 2]

*Satisfies: WEB-REG-01 (route + nav), WEB-REG-02 (type-first, hoyLocal default), WEB-REG-03 (Ingreso branch — zeroing + no stray fields), WEB-REG-04 (Gasto cascade), WEB-REG-05 (pre-validation), WEB-REG-06 (double-submit guard), WEB-REG-07 (201 clear + confirm + invalidate), WEB-REG-08 (error preserves input), WEB-REG-09 (demo disabled), WEB-REG-10 (response guard), WEB-REG-11 (a11y + ESLint), WEB-REG-12 (/subir regression); D-01 through D-15.*

> PR2 targets PR1 branch (stacked-to-main). Adds the user-visible `/registrar` surface. Nothing existing changes.

- [ ] T-10 — (RED) Write `apps/web/src/components/RegistrarMovimientoForm.test.tsx` (new — test-first per §7 matrix):

  **Setup / mocks:** `vi.mock('@/api/use-registrar-movimiento')` (returns a `unaMutacion<RegistrarMovimientoManualDto>()` spy); `vi.mock('@/api/use-categorias')` (returns `{ isPending: false, isError: false, data: unCatalogo() }`); wrap renders in `<QueryClientProvider>`.

  - **CA-01 (WEB-REG-02 — fields + date defaults):** form renders with `tipo` selector, `fecha` input defaulting to `hoyLocal()` (compare `input.value === hoyLocal()`), `max` attr = `hoyLocal()`, `descripcion`, `monto`; all reachable via `getByLabelText` with their labels.
  - **CA-02 (WEB-REG-03 — Ingreso zeroing + wire-body assertion):** select Gasto → choose a bucket + categoría → switch back to Ingreso → fill valid fecha/descripción/monto → click submit → assert `mutate` spy called with **exactly** `{ tipo: 'Ingreso', fecha, descripcion, monto }` and `expect(body).not.toHaveProperty('bucket')` and `expect(body).not.toHaveProperty('categoriaId')` (D-01/D-02 load-bearing test).
  - **CA-03 (WEB-REG-04 — Gasto cascade):**
    - Selecting Gasto renders bucket select + disabled categoría select.
    - Selecting bucket "Deseos" enables the categoría select and lists only "Deseos" categories.
    - Changing bucket resets categoría selection (value back to `''`).
    - Valid Gasto submit → `mutate` called with `{ tipo: 'Gasto', fecha, descripcion, monto, bucket, categoriaId }`.
  - **CA-04 (WEB-REG-07 — 201 success clear):** simulate `mutate` resolving 201 via `onSuccess` callback → form clears (`fecha = hoyLocal()`, `descripcion = ''`, `monto = ''`, `tipo → 'Ingreso'`, bucket/categoriaId → `''`) → inline confirmation visible in `aria-live` region → "Ir al dashboard" link is present → no auto-navigation.
  - **CA-05 (WEB-REG-05/WEB-REG-08 — pre-validation + input preserved):**
    - Empty `descripcion` → no fetch, per-field error shown, input preserved.
    - `monto = '0'` → no fetch, error shown (fails `esMontoManualValido`), monto preserved as `'0'`.
    - `monto = '-5'` → no fetch, error shown, monto preserved as `'-5'`.
    - Future fecha (tomorrow in `YYYY-MM-DD`) → no fetch, error shown (`fecha <= hoyLocal()` fails).
    - Gasto with missing `categoriaId` (bucket chosen, no categoría) → no fetch, error shown.
    - Mutation error (simulated 400 `ApiError`) → fixed message in `role="alert"`, every field keeps its value (`expect(montoInput.value).toBe(...)`).
  - **CA-06 (WEB-REG-06 — double-submit):** two synchronous clicks on submit → `mutate` called exactly once.
  - **CA-07 (WEB-REG-09 — demo):** `esDemo=true` → all inputs and submit button have `disabled` attribute, `role="note"` notice visible, `mutate` never called on submit.
  - **CA-08 (WEB-REG-04 — catalog error, cascade incomplete):** `useCategorias` mocked as `{ isError: true, data: undefined }` → inline `role="alert"` message visible, cascade selects disabled, submit attempt with empty bucket/categoriaId is blocked.
  - **CA-09 (WEB-REG-04 — catalog error, cascade complete):** `useCategorias` mock errors AFTER bucket and categoría state are already set (pre-populate state) → cascade selects disabled, alert visible, submit proceeds (both values non-empty).
  - **CA-10 (WEB-REG-11 — a11y):** `vitest-axe` `expect(await axe(container)).toHaveNoViolations()` over Ingreso render AND over Gasto render (both branches tested). Focus moves to the bucket `<select>` (inside `cascadaRef`) when switching to Gasto — assert `document.activeElement` is the bucket `<select>` (enforces D-09 ordering invariant: if a different `<select>` is placed first inside `cascadaRef`, this test breaks loudly).

- [ ] T-11 — (GREEN) Create `apps/web/src/components/RegistrarMovimientoForm.tsx` (new stateful component — D-01 through D-15):
  - Props: `{ readonly esDemo: boolean }`.
  - State (per-field `useState` — D-01): `tipo: 'Ingreso'|'Gasto'` (default `'Ingreso'`), `fecha: string` (default `hoyLocal()`), `descripcion: string` (default `''`), `monto: string` (default `''`), `bucketUI: string` (default `''`), `categoriaId: string` (default `''`).
  - `handleTipoChange(nuevo: string)`: calls `setTipo`, `setBucketUI('')`, `setCategoriaId('')` unconditionally (D-02 zeroing — not a bare `setTipo`).
  - `esMontoManualValido(m: string)`: `esMontoStringValido(m) && !m.startsWith('-') && m !== '0'` (local helper, D-03).
  - `esBucketAsignable(v: string): v is BucketAsignable`: `BUCKETS_ASIGNABLES.includes(v as BucketAsignable)` (D-07 type predicate — no `as` assertions elsewhere).
  - `construirBody(): RegistrarMovimientoManualInput` (D-07): Ingreso arm = `{ tipo:'Ingreso', fecha, descripcion, monto }` with NO `bucket`/`categoriaId` keys; Gasto arm = `{ tipo:'Gasto', fecha, descripcion, monto, bucket: bucketUI as BucketAsignable, categoriaId }` (narrowed via `esBucketAsignable` in pre-validation branch before call).
  - Co-fetch `useCategorias()` on mount; derive `CatalogoEstado` from `isPending`/`isError`/`data` + `agruparPorBucket(data?.categorias ?? [])` (D-08, `SubirCartola.tsx:83-90` idiom).
  - `isSubmittingRef = useRef<boolean>(false)` (D-10/WEB-REG-06).
  - `handleEnviar(e)`: guard `if (esDemo || mutation.isPending || isSubmittingRef.current) return`; pre-validate and set `role="alert"` errors on failure; `isSubmittingRef.current = true`; call `construirBody()`; `mutation.mutate(body, { onSuccess, onError, onSettled: () => { isSubmittingRef.current = false } })`.
  - `onSuccess`: clear all state (fecha→`hoyLocal()`, descripcion→`''`, monto→`''`, bucketUI→`''`, categoriaId→`''`, tipo→`'Ingreso'`); set confirmation in the `aria-live` region (D-10).
  - `onError(err: ApiError)`: show `err.message` in `role="alert"` region; do NOT clear any field (WEB-REG-08).
  - Gasto cascade (D-08/D-09): wrap in `<div ref={cascadaRef} role="group" aria-label="Clasificación del gasto">`; `useEffect` keyed on `tipo`: `if (tipo === 'Gasto') cascadaRef.current?.querySelector('select')?.focus()`.
  - Fecha: raw `<label>Fecha<input type="date" value={fecha} max={hoyLocal()} onChange={...} required disabled={esDemo} /></label>`.
  - Monto: raw `<label>Monto<input type="text" inputMode="numeric" pattern="[0-9]*" value={monto} onChange={...} disabled={esDemo} /></label>`.
  - Descripcion: `<CampoTexto label="Descripción" type="text" ... disabled={esDemo} />`.
  - Tipo: `<CampoSelect label="Tipo" value={tipo} onChange={handleTipoChange} options={[{value:'Ingreso',label:'Ingreso'},{value:'Gasto',label:'Gasto'}]} disabled={esDemo} />`.
  - Bucket (Gasto only): `<CampoSelect label="Bucket" value={bucketUI} onChange={(v) => { setBucketUI(v); setCategoriaId(''); }} options={[{value:'',label:'Seleccioná un bucket'}, ...catalogo.grupos.map(g=>({value:g.bucket,label:g.bucket}))]} disabled={esDemo || catalogo.tag!=='listo'} />`.
  - Categoría (Gasto only): `<CampoSelect label="Categoría" value={categoriaId} onChange={setCategoriaId} options={[{value:'',label:'Seleccioná una categoría'}, ...categorias]} disabled={esDemo || catalogo.tag!=='listo' || !bucketUI} />`.
  - Submit button: `disabled={esDemo || mutation.isPending}` (D-11; `isSubmittingRef` is a ref, not reactive, stays in the handler).
  - Demo notice: `role="note"` with constant `MENSAJE_DEMO_REGISTRAR` when `esDemo` (D-11).
  - Success region: persistent `aria-live="polite"` (tono `'ok'`); "Ir al dashboard" `<a href="/">Ir al dashboard</a>` (plain anchor, NOT `<Link>` — D-10, avoids router mock).
  - Error region: `role="alert"` for mutation errors and pre-validation failures.
  - Catalog error: inline `role="alert"` when `catalogo.tag === 'error'`; cascade selects already disabled via the `disabled` prop above.
  - Verify: `pnpm web test` (CA-01 through CA-10 green) + `pnpm web typecheck`.

- [ ] T-12 — Create `apps/web/src/routes/_authenticated/registrar.tsx` (thin container — D-12):
  - `createFileRoute('/_authenticated/registrar')`, reads `esDemo` from `Route.useRouteContext()`, renders `<RegistrarMovimientoForm esDemo={esDemo} />`. No logic. Untested (needs live router context — D-12).
  - After file creation, run `pnpm web typecheck` — TanStack Router will regenerate `routeTree.gen.ts` and validate that `'/registrar'` is a recognized `FileRouteTypes['to']` (required for D-13 nav typecheck).

- [ ] T-13 — Modify `apps/web/src/components/app-shell/nav-items.ts` (D-13):
  - Import `PencilLine` from `lucide-react` (ADR-027).
  - Add `{ kind: 'link', label: 'Registrar', to: '/registrar', icon: PencilLine }` immediately AFTER the `/subir` "Subir nuevo archivo" item in `NAV_ITEMS`.
  - `to: '/registrar'` typechecks against `FileRouteTypes['to']` (fails `tsc` if T-12 route is absent — implement T-12 first).
  - If `Sidebar.test.tsx` or `BottomTabs.test.tsx` assert item count or label lists, update those assertions to include "Registrar".
  - Verify: `pnpm web typecheck` (nav type safe) + `pnpm web test`.

- [ ] T-14 — Modify `apps/web/eslint.config.js` (D-14):
  - Add a scoped `error`-level `jsx-a11y` block following the FILE-LIST + route-PATTERN form (alongside existing per-US blocks at lines 82-210, BEFORE the trailing prettier block):
    ```js
    {
      files: ['src/components/RegistrarMovimientoForm.tsx', 'src/routes/_authenticated/registrar*.tsx'],
      extends: [jsxA11y.flatConfigs.recommended],
    }
    ```
  - Verify: run `eslint apps/web/src/components/RegistrarMovimientoForm.tsx` → zero a11y errors (WEB-REG-11 CA-11).

- [ ] T-15 — Regression guard (WEB-REG-12):
  - Confirm `RegistrarMovimientoForm.tsx` and `registrar.tsx` do NOT import anything from `SubirCartola.tsx`, `FilaRevision.tsx`, `PreviewMuestra.tsx`, `use-ingesta.ts`, or `use-commit-ingesta.ts`.
  - Confirm `SubirCartola.tsx` and `use-commit-ingesta.ts` do NOT import from `movimientos.ts` or `use-registrar-movimiento.ts`.
  - Confirm `useIngesta` and `postIngesta` exports remain unchanged and unmodified.

- [ ] T-16 — Final sweep: `pnpm web test` (all suites green, zero skipped) + `pnpm web typecheck` exits 0 + `pnpm --filter @moneydiary/web exec eslint src/components/RegistrarMovimientoForm.tsx src/routes/_authenticated/registrar.tsx` exits 0 with zero a11y errors. Confirm no `!` assertions in `RegistrarMovimientoForm.tsx`, `movimientos.ts`, or `use-registrar-movimiento.ts`.
  **Work-unit commit:** `feat(web): RegistrarMovimientoForm, /registrar route, nav item, eslint a11y block (US-060 PR2)`.

---

## Parallel / sequential map

| Tasks | Relationship |
|---|---|
| T-00 | Precondition gate (blocking — verify before any code) |
| T-01 → T-02 | Sequential (RED then GREEN for `hoyLocal`) |
| T-03 → T-04 | Sequential (RED then GREEN for client fn + guard); can start in parallel with T-01/T-02 (different file) |
| T-05 | Can run in parallel with T-03/T-04 (types.ts re-export; depends only on api-client, not on T-04 output) |
| T-06 → T-07 | Sequential (RED then GREEN for hook); depends on T-04 (must import `postMovimientoManual`) |
| T-08 | Can start after T-04 (needs `RegistrarMovimientoManualDto` for type inference); parallel with T-06/T-07 |
| T-09 | Gate after T-01 through T-08 (PR1 sweep + commit) |
| T-10 | Must start AFTER T-09 (imports hook + fixtures from PR1) |
| T-11 | Follows T-10 (GREEN for all RED tests; depends on T-09 for imports) |
| T-12 | Follows T-11 (route uses the form; `routeTree.gen.ts` regenerates) |
| T-13 | Follows T-12 (nav `to:'/registrar'` requires the route to exist for `tsc`) |
| T-14 | Can run in parallel with T-12/T-13 (eslint config change is independent) |
| T-15 | Depends on T-11/T-12/T-13 (all new files exist for the regression check) |
| T-16 | Gate after T-10 through T-15 (PR2 final sweep + commit) |

---

## Requirement traceability

| Requirement | Tasks |
|---|---|
| WEB-REG-01 (route + nav) | T-12, T-13 |
| WEB-REG-02 (type-first + hoyLocal fecha default + max) | T-01, T-02, T-10 (CA-01), T-11 |
| WEB-REG-03 (Ingreso branch zeroing + no stray fields) | T-10 (CA-02), T-11 (handleTipoChange + construirBody) |
| WEB-REG-04 (Gasto cascade + catalog error scenarios) | T-10 (CA-03, CA-08, CA-09), T-11 |
| WEB-REG-05 (client-side pre-validation) | T-03 (esMontoManualValido), T-10 (CA-05), T-11 |
| WEB-REG-06 (double-submit guard isSubmittingRef) | T-10 (CA-06), T-11 |
| WEB-REG-07 (201 clear + confirm + invalidate 4 keys) | T-06, T-07, T-10 (CA-04), T-11 |
| WEB-REG-08 (error preserves input) | T-10 (CA-05), T-11 |
| WEB-REG-09 (demo disabled) | T-10 (CA-07), T-11 |
| WEB-REG-10 (esRegistrarMovimientoManualDto guard) | T-03, T-04 |
| WEB-REG-11 (a11y labels + cascade focus + jsx-a11y ESLint) | T-10 (CA-10), T-11 (D-09 focus effect), T-14 |
| WEB-REG-12 (/subir regression) | T-09, T-15 |
| ADR-024 boundary (no client business logic) | T-04 (builder D-07 — structural guarantee), T-11 |
| D-01 (per-field useState + construirBody builder) | T-11 |
| D-02 (handleTipoChange zeroing — synchronous, not useEffect) | T-10 (CA-02), T-11 |
| D-03 (monto: text+inputMode, esMontoManualValido) | T-03, T-04, T-10 (CA-05), T-11 |
| D-04 (hoyLocal via Intl.DateTimeFormat America/Santiago) | T-01, T-02, T-11 |
| D-05 (useRegistrarMovimiento — 4 keys, no nav) | T-06, T-07 |
| D-06 (postMovimientoManual — JSON-body, 400 no-body fixed msg) | T-03, T-04 |
| D-07 (RegistrarMovimientoManualInput union + esBucketAsignable predicate) | T-04, T-11 |
| D-08 (Gasto cascade — useCategorias co-fetch, FilaRevision pattern simpler) | T-10 (CA-03, CA-08, CA-09), T-11 |
| D-09 (cascade focus — cascadaRef + querySelector + tipo-keyed effect) | T-10 (CA-10 focus assert), T-11 |
| D-10 (dual feedback regions + 201 clears form + isSubmittingRef) | T-10 (CA-04, CA-06), T-11 |
| D-11 (demo proactively disabled — NuevaCategoriaForm idiom) | T-10 (CA-07), T-11 |
| D-12 (thin container — createFileRoute, logic-free, untested) | T-12 |
| D-13 (nav PencilLine after /subir) | T-13 |
| D-14 (ESLint scoped error-level jsx-a11y block) | T-14 |
| D-15 (single component, no sub-components, CampoTexto/CampoSelect reused as-is) | T-11 |
