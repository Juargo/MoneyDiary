# Tasks: US-055 — Web: reclasificar transacción desde la página MES-BUCKET (issue #289)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~150–220 across ~12 source + test files |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR — one cohesive reclassify-hardening slice |
| Delivery strategy | single-PR |

Decision needed before apply: No
Chained PRs recommended: No
400-line budget risk: Low

---

## T-00 — [x] Docs PR: commit planning artifacts (separate docs-only PR, before the code PR) ✅ (be7b9796)

**Pattern**: US-054 precedent — planning docs went into a separate `docs(openspec):` PR (#427) before the code PR. The `us-055-web-reclasificar-mes-bucket/` change directory (proposal, specs, design, tasks) is uncommitted on the worktree and must be committed and merged to `main` first, so the code PR's merge base is clean.

- **Action**: stage and commit all files under `openspec/changes/us-055-web-reclasificar-mes-bucket/` (proposal.md, design.md, specs/web-app/spec.md, tasks.md — this file).
- **Commit message**: `docs(openspec): US-055 planning artifacts post-design-gate`
- **PR title**: `docs(openspec): US-055 planning artifacts post-design-gate`
- **Deps**: none (docs-only, no source files touched)
- **AC**: PR merged to `main`; code PR branches off `main` with planning docs in history.

---

## Code PR — Single PR: reclassify hardening (D-03/D-06/D-07/D-08/D-09)

Branch off `main` after T-00 merges. Work-unit commit order follows design §7.

---

### T-01 — [x] RED: invalidation count tests (both sites) — `['ingresos-mes']` key missing ✅ (42e59155)

**Design refs**: D-03, D-09  
**Spec refs**: WDM-07 (4-key count), WDM-09 (5-clave count)  
**Files**:
- `apps/web/src/api/use-reclasificar-categoria.test.tsx` (modify)
- `apps/web/src/api/categorias-invalidacion.test.ts` (modify)

**RED-first test list (exact cases, both must fail before GREEN)**:

`use-reclasificar-categoria.test.tsx`:
- Case ~:93 — "invalidates 4 keys on success": add `expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ingresos-mes'] })`; bump count assertion to `4` (was `3`). Fails RED because `['ingresos-mes']` call is missing.
- Case ~:127 — "does not append a period segment to resumen-anual invalidation" (no-period case): likewise add `['ingresos-mes']` assertion; total invalidation count bumped to `4`. Fails RED because key absent.

`categorias-invalidacion.test.ts`:
- Case ~:47 — title rewritten "4 claves"→"5 claves"; exact-array assertion body extended: `[['categorias'],['resumen'],['resumen-anual'],['detalle-bucket-mes'],['ingresos-mes']]` (order pinned, `['ingresos-mes']` appended last). Fails RED because 5th element absent.

**Commit**: `test(web): RED — 4-key reclassify + 5-clave CRUD invalidation count (D-03)`  
**Deps**: none  
**AC**: `pnpm web test -- use-reclasificar-categoria` fails on count; `pnpm web test -- categorias-invalidacion` fails on exact-array. Both failures are intentional RED.

---

### T-02 — [x] GREEN: add `['ingresos-mes']` to both invalidation sites ✅ (fb9e735b)

**Design refs**: D-09  
**Spec refs**: WDM-07, WDM-09  
**Files**:
- `apps/web/src/api/use-reclasificar-categoria.ts` (modify)
- `apps/web/src/api/categorias-invalidacion.ts` (modify)

**Changes**:
- `use-reclasificar-categoria.ts` `onSuccess`: add `void queryClient.invalidateQueries({ queryKey: ['ingresos-mes'] })` (prefix — matches `useIngresosMes`'s key at position 0). Update JSDoc: "3 keys"→"4 keys".
- `categorias-invalidacion.ts` `invalidarCatalogoYDashboard`: append `void qc.invalidateQueries({ queryKey: ['ingresos-mes'] })` AFTER the `['detalle-bucket-mes']` invalidation (preserves order for the pinned exact-array test). Update JSDoc: "4 claves"→"5 claves".

**Commit**: `feat(web): add ['ingresos-mes'] prefix invalidation to reclassify + category CRUD (D-09)`  
**Deps**: T-01  
**AC**:
- `pnpm web test -- use-reclasificar-categoria` — 2 previously-RED cases now GREEN; full suite green (5/5).
- `pnpm web test -- categorias-invalidacion` — "5 claves" case GREEN; full suite green (3/3).
- `pnpm web typecheck` clean.

---

### T-03 — [x] RED: control tests — 3-group restriction + `onMovida` callback + `aria-describedby` ✅ (3d7ed7a5)

**Design refs**: D-06, D-07, D-08  
**Spec refs**: WCAT-04 (optgroup restriction, cross-bucket announcement, alertdialog aria-describedby, focus)  
**Files**:
- `apps/web/src/components/ReclasificarCategoriaControl.test.tsx` (modify)

**RED-first test list (all ~20 existing tests + new behavior cases)**:

Mechanical stub update (required for compilation once `onMovida` becomes required prop):
- ALL ~20 existing test cases must pass `onMovida={vi.fn()}` as a prop to every `render(<ReclasificarCategoriaControl ... />)` call. Without the stub, `tsc` rejects them once the prop is non-optional. These do NOT change behavior expectations — they are purely additive prop stubs.

Rewritten/new behavior cases (these fail RED before the source changes):
- "offers all 8 categorías grouped by bucket" (~:203) → rewritten to "offers exactly 3 spend-bucket optgroups — Necesidades, Deseos, Ahorro — no Otros group": assert `getAllByRole('group')` length is `3`; assert no group labelled "Otros"; assert no categoría from an Ingresos-bucket appears.
- Cross-bucket confirm case (~:345): assert `onMovida` called once with the destination LABEL (e.g. `'Gustos'` when `bucketNuevo === 'Deseos'` — pin the `ETIQUETA_BUCKET` label, NOT the raw key `'Deseos'`); assert call count is `1`.
- Sin-categoría confirm case (~:519): assert `onMovida` called once with the correct label on cross-bucket commit.
- NEW: same-bucket commit does NOT call `onMovida` — assert `onMovida` call count is `0` after a within-bucket reclassify.
- NEW: `aria-describedby` wiring — given the cross-bucket confirmation dialog is open, assert the `alertdialog` element has `aria-describedby` whose value resolves to the `<p>` containing the money-move sentence; assert focus is on the Confirmar button (`role="button"` / accessible name).

**Commit**: `test(web): RED — control 3-group restriction, onMovida label, aria-describedby (D-06/07/08)`  
**Deps**: T-02  
**AC**: the newly-added/rewritten assertions in `ReclasificarCategoriaControl.test.tsx` fail RED (the source file has none of those changes yet). Existing passing cases are unaffected only if their stub prop was already passed (they may now also fail to compile — that is expected RED; the source change in T-04 fixes compilation).

---

### T-04 — [x] GREEN: control — local `BUCKETS_ASIGNABLES` filter + required `onMovida` + `aria-describedby` + remove stale span ✅ (61d1501a)

**Design refs**: D-06, D-07, D-08  
**Spec refs**: WCAT-04  
**Files**:
- `apps/web/src/components/ReclasificarCategoriaControl.tsx` (modify)

**Changes**:
- Add required prop `onMovida: (bucketLabel: string) => void` to the component's props interface (no `?`).
- Local `BUCKETS_ASIGNABLES` filter: after calling `agruparPorBucket(...)`, filter result: `grupos.filter((g) => (BUCKETS_ASIGNABLES as ReadonlyArray<string>).includes(g.bucket))`. Import `BUCKETS_ASIGNABLES` from `catalogo-constantes` — do NOT redeclare inline.
- In `confirmar()` cross-bucket branch: call `onMovida(ETIQUETA_BUCKET[pendiente.bucketNuevo])` (the display label, e.g. `'Gustos'` for `Deseos`). Same-bucket path: no `onMovida` call.
- Remove the stale per-row `aria-live` span (control ~:213-217 "Categoría actualizada" announcement).
- `aria-describedby` wire: `const mensajeId = useId()`. Add `aria-describedby={mensajeId}` to the `<div role="alertdialog">` element (~:225). Add `id={mensajeId}` to the money-move `<p>` element (~:234-237).

**Commit**: `feat(web): control — BUCKETS_ASIGNABLES filter, onMovida callback, aria-describedby (D-06/07/08)`  
**Deps**: T-03  
**AC**:
- `pnpm web test -- ReclasificarCategoriaControl` — all ~20+ cases green including rewritten 3-group + `onMovida` label + `aria-describedby` cases.
- `pnpm web typecheck` clean.

---

### T-05 — [x] GREEN: thread `onMovida` through `GrupoMovimientos` + create `GrupoMovimientos.test.tsx` ✅ (603a33d1)

**Design refs**: D-07  
**Spec refs**: WCAT-04 (callback thread, WDM-07)  
**Files**:
- `apps/web/src/components/GrupoMovimientos.tsx` (modify)
- `apps/web/src/components/GrupoMovimientos.test.tsx` (CREATE — file does not exist)

**Changes** (GrupoMovimientos.tsx):
- Add required prop `onMovida: (bucketLabel: string) => void` to the component's props interface (no `?`).
- Pass `onMovida={onMovida}` through to every `<ReclasificarCategoriaControl>` rendered inside the component (passthrough — the component does not consume the value itself).

**New test file** (GrupoMovimientos.test.tsx — full harness scaffolded from scratch):
- QueryClient wrapper + catalog fetch mocks (same pattern as `BucketDetalleMesPage.test.tsx`).
- Case 1 — "threads onMovida to ReclasificarCategoriaControl and fires it on a cross-bucket confirm": render `<GrupoMovimientos>` with an `onMovida` spy; simulate a cross-bucket selection + confirm; assert the spy was called once with the correct label. This is the primary falsifiability check for the thread (proves the prop is forwarded, not silently dropped).

**Commit**: `feat(web): thread onMovida through GrupoMovimientos + GrupoMovimientos.test.tsx scaffold (D-07)`  
**Deps**: T-04  
**AC**:
- `pnpm web test -- GrupoMovimientos` — 1/1 green (new file).
- `pnpm web typecheck` clean.

---

### T-06 — [x] GREEN: page-owned `role="status"` region + `anuncio` state + `BucketDetalleMesPage` tests ✅ (6fcf9795; JD fixes: periodo-clear + T-06a/c page-level interaction tests in f35a4382)

**Design refs**: D-07  
**Spec refs**: WCAT-04 (announcement semantics, region visibility, persistence)  
**Files**:
- `apps/web/src/components/BucketDetalleMesPage.tsx` (modify)
- `apps/web/src/components/BucketDetalleMesPage.test.tsx` (modify)

**Changes** (BucketDetalleMesPage.tsx):
- Add `const [anuncio, setAnuncio] = useState('')`.
- Define `const alMovida = (bucketLabel: string) => setAnuncio(`Movida a ${bucketLabel}.`)`.
- Render ONE stable `<p role="status">{anuncio}</p>` (or equivalent block element) OUTSIDE the groups map — it is a page-level sibling, not nested inside any group. Visible text (no sr-only); survives the moved row's unmount.
- Pass `onMovida={alMovida}` to every `<GrupoMovimientos>` render call.

**RED-first test cases (these fail RED before the source change)**:

Add to `BucketDetalleMesPage.test.tsx`:
- Case (a) — "cross-bucket reclassify surfaces 'Movida a Gustos.' in the page-owned role=status region": render the page with a Deseos transaction → reclassify to a Necesidades categoría → confirm → assert `getByRole('status')` text is `'Movida a Gustos.'`; assert the status node is NOT a descendant of any `grupo-movimientos` element (i.e. `closest('[data-testid="grupo-movimientos"]')` returns `null`) — falsifies the bus unmount bug class. No `sr-only` class on the same node (sighted + AT read from same element). Literal: `'Movida a Gustos.'` with period.
- Case (b) — "same-bucket reclassify does NOT update the status region": render → within-bucket commit → assert `getByRole('status')` text is `''` (empty, unchanged from initial render).

Persistence semantics (tested via case (a) baseline + a subsequent move):
- Case (c) — "a subsequent cross-bucket move replaces the prior announcement": after case (a) succeeds, trigger a second cross-bucket reclassify targeting Ahorro → assert region text is `'Movida a Ahorro.'`, not appended. (Can be a separate test or an extension of case (a).)

**Commit**: `feat(web): BucketDetalleMesPage — anuncio state + role=status region + alMovida callback (D-07)`  
**Deps**: T-05  
**AC**:
- `pnpm web test -- BucketDetalleMesPage` — 2-3 new cases green; full suite green.
- `pnpm web typecheck` clean.
- `pnpm web test` — full web test suite green.

---

### T-07 — [x] chore: eslint a11y promotion — `ReclasificarCategoriaControl.tsx` to `error` block ✅ (2891c561)
<!-- Deviation: committed as `chore(web):` not `chore(web/eslint):` as the task specified. Recorded as a known deviation — history not rewritten. -->

**Design refs**: D-08  
**Spec refs**: WCAT-04 (a11y promotion; FILE-LIST, not a glob)  
**Files**:
- `apps/web/eslint.config.js` (modify)

**Change**: Add a new US-055 file-list `error` block (loose-sibling precedent — US-047/048/049/053/054):
```js
// US-055: ReclasificarCategoriaControl a11y promoted to error
{
  files: ['src/components/ReclasificarCategoriaControl.tsx'],
  rules: {
    // promote jsx-a11y rules to error for this file
    'jsx-a11y/...': 'error',
    // ... (mirror the existing US-053/054 file-list block shape)
  },
}
```
NOT a `src/components/**` glob (would absorb the app's a11y debt). Add ONLY `ReclasificarCategoriaControl.tsx`.

**Commit**: `chore(web/eslint): promote ReclasificarCategoriaControl.tsx to a11y error (D-08)`  
**Deps**: T-06 (source must be compliant before promotion; `aria-describedby` added in T-04)  
**AC**: `pnpm web lint` passes with no new lint errors (the `aria-describedby` fix from T-04 satisfies the promoted rule). `pnpm web typecheck` clean.

---

### T-08 — [x] test(e2e): extend bucket e2e — cross-bucket reclassify announces + row leaves + periodo persists ✅ (1ac8bc7e initial e2e stub; JD fixes: stateful stub + row-disappearance assert + correct direction in f35a4382)

**Design refs**: D-07, D-09  
**Spec refs**: WCAT-04, WDM-07 (e2e scenario: announce + row gone + periodo)  
**Files**:
- `apps/web/e2e/bucket-detalle-mes.e2e.ts` (modify — extend the EXISTING file, do NOT create a new file)

**Why extend, not new file**: the page + stubs already exist in `bucket-detalle-mes.e2e.ts`; a new file would re-scaffold the auth/stub harness for one flow (cost > benefit).

**New case**: "cross-bucket reclassify announces + row leaves + periodo survives":
1. Navigate to `/buckets/Necesidades?periodo=2026-07`.
2. Pick a Deseos categoría from the reclassify `<select>` on a transaction row.
3. Confirm the cross-bucket confirmation dialog.
4. Assert (i): `getByRole('status')` text equals `'Movida a Gustos.'` and is visible (not hidden by CSS — Playwright `isVisible()` check; not sr-only).
5. Assert (ii): the moved row is no longer in the Necesidades group after refetch (the stub echoes the reclassify PATCH and returns the row under Deseos on the next fetch).
6. Assert (iii): URL still carries `?periodo=2026-07` — periodo survives the reclassify flow.

Stub: extend `api-stubs.ts` or the existing bucket stub to echo the reclassify `PATCH /api/transacciones/:id/categoria` with 200 and return the updated transaction under Deseos on the subsequent `GET /api/buckets/Necesidades` refetch.

**Commit**: `test(web/e2e): cross-bucket reclassify announces + row leaves + periodo survives (WCAT-04)`  
**Deps**: T-06, T-07  
**AC**: `pnpm web test:e2e` — new case passes; existing `bucket-detalle-mes.e2e.ts` cases unchanged.

---

### T-09 — DEFERRED TO ARCHIVE: living-spec delta

**Design refs**: design §4 last row  
**Spec refs**: WCAT-04/WDM-07 deltas, WDM-09 (ADDED requirement)  
**Files**:
- `openspec/specs/web-app/spec.md` (modify — AT ARCHIVE TIME, not in the code PR)

**Note**: the living-spec delta is applied by the ARCHIVE phase, not the code PR — this is the actual US-044/US-054 precedent (us-054's WDI merge into `web-app/spec.md` landed in the archive PR #437, commit 9891796). The delta stays fully authored in `openspec/changes/us-055-web-reclasificar-mes-bucket/specs/web-app/spec.md` until then. This task is a placeholder marker only; do NOT touch the living spec during apply.

**Changes**:
- Merge WCAT-04 delta: tighten offered set to `BUCKETS_ASIGNABLES` only; add `['ingresos-mes']` refresh clause; add `aria-describedby` requirement; add cross-bucket announcement requirement; add new scenarios per the change-dir spec.
- Merge WDM-07 delta: invalidation set updated from 3 keys to 4 keys; jsdom scenario count updated.
- Add WDM-09 (new requirement): `invalidarCatalogoYDashboard` 5-clave invalidation set; scenarios for category mutation (5 keys), pattern mutation exclusion, and anti-enumeration.

**Commit**: `docs(spec): WCAT-04/WDM-07 tighten + WDM-09 add — US-055 living-spec delta`  
**Deps**: T-08 (last code commit; spec delta is the final commit in the PR)  
**AC**: `openspec/specs/web-app/spec.md` matches the change-dir spec verbatim for the three modified/added requirements. `pnpm web typecheck` clean (spec is markdown, no type impact).

---

## Scheduling

All tasks are **sequential** within the single PR. No parallel work units — each task's RED or GREEN state gates the next:

```
T-00 (docs PR) → merged to main → branch for code PR
T-01 (RED invalidation tests)
→ T-02 (GREEN invalidation sources)
→ T-03 (RED control tests — 3-group, onMovida, aria-describedby)
→ T-04 (GREEN control source)
→ T-05 (GREEN GrupoMovimientos thread + new test file)
→ T-06 (GREEN BucketDetalleMesPage region + tests)
→ T-07 (chore eslint promotion)
→ T-08 (e2e extension)
→ T-09 (spec delta)
```

Design §7 work-unit commit order (7 commits in the code PR):
1. `test:` + `feat:` — D-09 invalidation (T-01 + T-02, can be combined per TDD convention)
2. `test:` + `feat:` — D-06/07/08 control (T-03 + T-04)
3. `feat:` — D-07 thread + GrupoMovimientos.test.tsx (T-05)
4. `feat:` — D-07 page region + BucketDetalleMesPage tests (T-06)
5. `chore(eslint):` — D-08 promotion (T-07)
6. `test(e2e):` — e2e extension (T-08)
7. (archive-time) living-spec delta (T-09 — NOT in the code PR)

---

## Ledger cross-check (design §4 file + §5 test ledgers)

All §4 files covered:

| File | Task |
|------|------|
| `use-reclasificar-categoria.ts` | T-02 |
| `use-reclasificar-categoria.test.tsx` | T-01 (RED) / T-02 (GREEN) |
| `categorias-invalidacion.ts` | T-02 |
| `categorias-invalidacion.test.ts` | T-01 (RED) / T-02 (GREEN) |
| `ReclasificarCategoriaControl.tsx` | T-04 |
| `ReclasificarCategoriaControl.test.tsx` | T-03 (RED) / T-04 (GREEN) |
| `GrupoMovimientos.tsx` | T-05 |
| `GrupoMovimientos.test.tsx` | T-05 (CREATE) |
| `BucketDetalleMesPage.tsx` | T-06 |
| `BucketDetalleMesPage.test.tsx` | T-06 |
| `apps/web/eslint.config.js` | T-07 |
| `apps/web/e2e/bucket-detalle-mes.e2e.ts` | T-08 |
| `openspec/specs/web-app/spec.md` | T-09 (archive-time only) |

All §5 suites covered:
- `use-reclasificar-categoria.test.tsx`: 2 cases updated (T-01/T-02)
- `categorias-invalidacion.test.ts`: 1 case updated — "5 claves" (T-01/T-02)
- `ReclasificarCategoriaControl.test.tsx`: all ~20 stubs + ~4-5 behavior rewrites/adds (T-03/T-04)
- `GrupoMovimientos.test.tsx`: 1 case created (T-05)
- `BucketDetalleMesPage.test.tsx`: 2-3 cases added (T-06)
- `bucket-detalle-mes.e2e.ts`: 1 case added (T-08)

Requirements traced:
- **WDM-07** (4-key reclassify invalidation): T-01/T-02/T-08
- **WDM-09** (5-clave category CRUD invalidation): T-01/T-02
- **WCAT-04** (3-group restriction / onMovida / alertdialog aria / status region / announcement literal): T-03/T-04/T-05/T-06/T-07/T-08

Case-law constraints verified embedded above:
- **Falsifiability on ETIQUETA_BUCKET label**: T-03 and T-06 assert the exact label (`'Gustos'` for `Deseos`), not the raw key.
- **onMovida non-optional thread**: T-03/T-04/T-05/T-06 — no `?` on the prop at any level.
- **Exact invalidation counts**: T-01 pins 4 (reclassify) and 5 (CRUD) with order-locked exact-array for CRUD.
- **`GrupoMovimientos.test.tsx` CREATED with full harness**: T-05.
- **e2e extends `bucket-detalle-mes.e2e.ts`, no new file**: T-08.
- **Announcement literal `'Movida a Gustos.'` with period, no timer, visible (not sr-only)**: T-06/T-08.
- **Status region is a page-level sibling, NOT inside any group**: T-06 case (a) ancestry assertion.
- **All ~20 control tests get the stub `onMovida` prop**: T-03 mechanical update.
- **T-00 docs PR separate, before code PR**: mirrors US-054 PR #427 pattern.
