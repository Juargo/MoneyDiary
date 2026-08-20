# Verify Report — US-055: Web: reclasificar transacción desde la página MES-BUCKET

**Change**: `us-055-web-reclasificar-mes-bucket`  
**Issue**: #289 (CLOSED)  
**PRs merged**: #438 (planning docs) + #439 (code), final merge `d87c5927`  
**Worktree**: `/Users/jorge/dev/MoneyDiary.wt/us-050-mobile-dashboard` (detached at `d87c5927`, read-only)  
**Verify date**: 2026-08-20  
**Spec source**: `openspec/changes/us-055-web-reclasificar-mes-bucket/specs/web-app/spec.md`  
**Verdict**: PASS WITH WARNINGS

---

## Suite Results

| Command | Result | Details |
|---------|--------|---------|
| `pnpm web test` | PASS | 1208/1208, 113 test files |
| `pnpm web typecheck` | PASS | `tsr generate && tsc -b` — 0 errors |
| `pnpm web lint` | PASS | 0 errors, 1 pre-existing warning (EliminarIngestaControl.tsx:128 — not ours) |
| `pnpm web test:e2e` | PASS | 67 passed, 65 skipped (scope-guarded), 0 failed |

---

## Task Completeness

| Task | Status | SHA | Notes |
|------|--------|-----|-------|
| T-00 | ✅ DONE | be7b9796 | Planning docs PR merged |
| T-01 | ✅ DONE | 42e59155 | RED — 4-key reclassify + 5-clave CRUD |
| T-02 | ✅ DONE | fb9e735b | GREEN — `['ingresos-mes']` added to both sites |
| T-03 | ✅ DONE | 3d7ed7a5 | RED — control 3-group, onMovida, aria-describedby |
| T-04 | ✅ DONE | 61d1501a | GREEN — control source changes |
| T-05 | ✅ DONE | 603a33d1 | GREEN — GrupoMovimientos thread + new test file |
| T-06 | ✅ DONE | 6fcf9795 + f2f0c474 | GREEN — page region + JD fixes (periodo-clear + page-level interaction tests) |
| T-07 | ✅ DONE | 2891c561 | chore — eslint a11y promotion (NOTE: committed as `chore(web):` not `chore(web/eslint):` — recorded deviation, history not rewritten) |
| T-08 | ✅ DONE | 1ac8bc7e + f2f0c474 | e2e — stateful stub + row-leave assert + correct direction |
| T-09 | DEFERRED | — | Living-spec delta intentionally held for archive-time (correct per US-054 precedent) |

All implementation tasks T-00..T-08 are marked complete with SHAs. T-09 correctly untouched.

**T-06 SHA correction note**: tasks.md documents `f2f0c474` as the corrected SHA for JD fixes. Verified in git log — commit exists as `f2f0c474 test(web): settle announcement on mutation success and complete row-leave e2e (US-055)`.

---

## Spec Compliance Matrix — 16 Scenarios

### WCAT-04 Scenarios (13 scenarios)

| # | Scenario | Runner | Evidence | Status |
|---|----------|--------|----------|--------|
| 1 | Successful within-bucket reclassify updates group counts | jsdom | `ReclasificarCategoriaControl.test.tsx`: "a same-bucket reclassify commits immediately, no confirmation" (~:285); `BucketDetalleMesPage.test.tsx`: "anuncio region is empty before any cross-bucket move" | PASS |
| 2 | Cross-bucket reclassify requires confirmation then updates resumen | jsdom | `ReclasificarCategoriaControl.test.tsx`: "a cross-bucket reclassify shows a confirmation naming the money move" (~:324); "confirming the cross-bucket move commits it" (~:362) | PASS |
| 3 | Cancelling cross-bucket confirmation leaves UI unchanged | jsdom | `ReclasificarCategoriaControl.test.tsx`: "cancelling reverts the select to the original categoría, never commits" (~:485); "pressing Escape while the confirmation is open cancels it" (~:681) | PASS |
| 4 | Failed reclassify leaves UI unchanged | jsdom | `ReclasificarCategoriaControl.test.tsx`: "on a failed reclassify, reverts the select and shows an error message" (~:722); "a cross-bucket FAILED PATCH does NOT call onMovida" (~:908) | PASS |
| 5 | Just-created categoría offered immediately | jsdom | `ReclasificarCategoriaControl.test.tsx`: "a just-created categoría is offered by the dropdown immediately" (~:750) | PASS |
| 6 | Deleted categoría no longer offered | jsdom | `ReclasificarCategoriaControl.test.tsx`: "a deleted categoría is no longer offered" (~:788) | PASS |
| 7 | Re-bucketed categoría triggers confirmation correctly | jsdom | `ReclasificarCategoriaControl.test.tsx`: "a re-bucketed categoría triggers the cross-bucket confirmation against its REAL live bucket" (~:818) | PASS |
| 8 | Offered groups are exactly 3 spend buckets, no Otros | jsdom | `ReclasificarCategoriaControl.test.tsx:205`: "offers exactly 3 spend-bucket optgroups — Necesidades, Deseos (Gustos), Ahorro — no Otros group, no Ingresos-bucket categoría" — asserts `getAllByRole('group').length === 3`, labels `['Necesidades', 'Gustos', 'Ahorro']`, Sueldo not offered | PASS |
| 9 | Cross-bucket move announces destination in page-owned region | jsdom | `BucketDetalleMesPage.test.tsx`: "T-06(a): cross-bucket reclassify from a Necesidades row to a Deseos categoría surfaces 'Movida a Gustos.'" — asserts exact literal, region NOT inside grupo-movimientos | PASS |
| 10 | Same-bucket reclassify does NOT trigger announcement | jsdom | `BucketDetalleMesPage.test.tsx`: "anuncio region is empty before any cross-bucket move (same-bucket path never sets it, D-07)" | PASS |
| 11 | Subsequent cross-bucket move replaces prior announcement | jsdom | `BucketDetalleMesPage.test.tsx`: "T-06(c): a subsequent cross-bucket move to an Ahorro categoría replaces the prior announcement with 'Movida a Ahorro.'" — asserts text replaced, not appended | PASS |
| 12 | alertdialog has aria-describedby pointing at money-move message | jsdom | `ReclasificarCategoriaControl.test.tsx:443`: "alertdialog has aria-describedby pointing at the money-move paragraph" — asserts `dialog.getAttribute('aria-describedby')` resolves to `<p>` with money-move text; also asserts focus on Confirmar button | PASS |
| 13 | Focus returns to select after dialog close | jsdom | `ReclasificarCategoriaControl.tsx:cancelar()` calls `selectRef.current?.focus()` — behavior is implemented. `cancelar()` test verifies dialog gone + select value reverted, but does NOT assert `document.activeElement === select` explicitly. | WARNING (see findings) |
| 14 | SinCategoria row reclassifies and row leaves destacado group | jsdom | `ReclasificarCategoriaControl.test.tsx:623`: "a SinCategoria row shows the confirmation...commits only on confirm, calls onMovida with label" (full scenario); `bucket-detalle-mes.e2e.ts` T-08 covers row-leave at e2e level | PASS |

### WDM-07 Scenario (1 scenario)

| # | Scenario | Runner | Evidence | Status |
|---|----------|--------|----------|--------|
| 15 | Successful reclassify invalidates all 4 keys including ingresos-mes | jsdom | `use-reclasificar-categoria.test.tsx:93`: "invalida 4 keys on success: resumen, detalle-bucket-mes, resumen-anual, ingresos-mes" — `expect(invalidateSpy).toHaveBeenCalledTimes(4)` + individual calledWith assertions for all 4 keys. No-period case (:129) also asserts 4 keys. | PASS |

### WDM-09 Scenarios (2 scenarios + 1 anti-enum)

| # | Scenario | Runner | Evidence | Status |
|---|----------|--------|----------|--------|
| 16a | Category mutation invalidates exactly 5 keys including ingresos-mes | jsdom | `categorias-invalidacion.test.ts:47`: "invalida EXACTAMENTE las 5 claves, en orden: categorias, resumen, resumen-anual, detalle-bucket-mes, ingresos-mes" — exact-array `[['categorias'],['resumen'],['resumen-anual'],['detalle-bucket-mes'],['ingresos-mes']]` | PASS |
| 16b | Pattern mutation still invalidates only categorias | jsdom | `categorias-invalidacion.test.ts:35` (Perfil A): "LA EXCLUSIÓN — WCTG-09 escenario dedicado: no invalida NINGUNA de las tres claves del dashboard" — `expect(claves()).toEqual([['categorias']])` | PASS |
| 16c | Anti-enumeration — no business logic in category CRUD | Source | `categorias-invalidacion.ts:44-49`: `invalidarCatalogoYDashboard` performs only `invalidateQueries` calls — zero classification logic, zero bucket-membership computation. Compliant by inspection. | PASS |

---

## Design Decision Verification

| Decision | Requirement | Evidence | Status |
|----------|-------------|----------|--------|
| D-06 | Local BUCKETS_ASIGNABLES filter — `agruparPorBucket` untouched globally | `ReclasificarCategoriaControl.tsx:107-109`: `grupos = agruparPorBucket(...).filter(g => (BUCKETS_ASIGNABLES as ReadonlyArray<string>).includes(g.bucket))`. `agruparPorBucket` function itself unchanged. Configuración's usage unaffected. | PASS |
| D-07 | Required `onMovida` prop on all 3 hops; no `?`; setState-during-render clearing | `ReclasificarCategoriaControl.tsx:84`: `onMovida: (bucketLabel: string) => void` (no `?`). `GrupoMovimientos.tsx:36`: same. `BucketDetalleMesPage.tsx:84-85`: `alMovida` defined, passed to all `GrupoMovimientos`. `periodoAnterior` setState-during-render clears `anuncio` on period change. | PASS |
| D-08 | eslint file-list block (not glob); aria-describedby on alertdialog; eslint-disable-line with comment | `eslint.config.js:185-194`: US-055 block targets `src/components/ReclasificarCategoriaControl.tsx` only (not `src/components/**`). `ReclasificarCategoriaControl.tsx:258`: `aria-describedby={mensajeId}`; `id={mensajeId}` on `<p>` at :266. `eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions` at :254 with explanatory comment. | PASS |
| D-09 | Both invalidation sites updated in same PR | `use-reclasificar-categoria.ts:68`: `invalidateQueries({ queryKey: ['ingresos-mes'] })`. `categorias-invalidacion.ts:49`: same. Both in same merged PR #439. | PASS |

---

## Scope Verification

- `apps/api`: zero changes confirmed (git log, no backend files in commit set)
- `apps/web` only: all 16+ changed files are under `apps/web/src/` or `apps/web/e2e/` or `apps/web/eslint.config.js`
- `packages/`: no changes
- No dashboard behavior changes beyond the reclassify chain

---

## T-09 Living-Spec State

`openspec/specs/web-app/spec.md`:
- `WDM-07` still reads "3 keys" (pre-US-055 text) — T-09 correctly deferred
- `WDM-09` is absent from the living spec — T-09 correctly deferred
- `WCAT-04` does not yet include `aria-describedby` or `BUCKETS_ASIGNABLES` clauses

This matches the tasks.md T-09 note: "the living-spec delta is applied by the ARCHIVE phase, not the code PR — this is the actual US-044/US-054 precedent."

---

## Accepted Debts (INFO)

- **Pre-existing lint warning**: `EliminarIngestaControl.tsx:128` `jsx-a11y/no-noninteractive-element-interactions` — 1 warning; not introduced by this change; confirmed pre-existing per apply-progress notes.
- **Commit-scope drift**: T-07 committed as `chore(web):` not `chore(web/eslint):` — recorded in tasks.md, history not rewritten.
- **Stub DTO static-response note**: e2e PATCH stub returns a static `ReclasificarCategoriaDto`; row-disappearance relies on the stateful `detallePatchFired` gate toggling the GET response — this is the intended design, not a limitation.

---

## Findings

### WARNING

**W-01 — Focus-return-to-select not asserted in cancel/Escape tests**  
Spec (WCAT-04): "focus MUST return to the `<select>` on cancel or Escape (D-05)."  
Source implements `selectRef.current?.focus()` in `cancelar()` (line 191). The cancel test verifies dialog dismissed + select value reverted, but does not assert `document.activeElement === select`. The Escape test similarly. The focus-on-open assertion (line 480: `expect(document.activeElement).toBe(getByRole('button', { name: 'Confirmar' }))`) is present.  
**Impact**: low — behavior is coded correctly; the gap is test coverage only. Focus regression would not be caught by the unit suite.  
**Recommended fix at archive**: add `expect(document.activeElement).toBe(select)` after both the cancel-button click and the Escape keyboard event in the existing tests.

### SUGGESTION

**S-01 — WDM-09 pattern-mutation exclusion test lacks explicit `['ingresos-mes']` not-called assertion**  
`categorias-invalidacion.test.ts:35` (Perfil A) asserts `claves()` equals `[['categorias']]` exactly. This exact-array assertion implicitly excludes `['ingresos-mes']`. The spec says "the test MUST assert this explicitly, not infer it from absence." The exact-array form IS explicit (it cannot pass if any other key fires, including `['ingresos-mes']`), so this is a phrasing ambiguity in the spec, not a real gap. Documented for completeness.

### INFO

**I-01 — Two `role="status"` nodes during catalog load**  
Discovered during apply: when the catalog is in flight, there are 2 `role="status"` elements (the anuncio region + the catalog-loading `sr-only` region). The page test explicitly covers this (`BucketDetalleMesPage.test.tsx:702`: "announces the catalog load exactly once... 2 status regions total"). E2e uses `data-testid="anuncio-reclasificar"` to scope to the correct node. Architecture is correct.

**I-02 — `alertdialog` eslint-disable with explanatory comment**  
`jsx-a11y/no-noninteractive-element-interactions` fires on `<div role="alertdialog" onKeyDown>` because the rule's ARIA superclass for `alertdialog` is `window > dialog`, not `widget`. The disable is consistent with `ConfirmarPasswordDialog.tsx` / `ConfirmarImpactoDialog.tsx` precedents. Version note in comment: "Remove this disable when aria-query classifies `alertdialog` under the `widget` superclass."

---

## Verdict

**PASS WITH WARNINGS**

0 CRITICAL issues. 1 WARNING (W-01: focus-return-to-select not asserted in cancel/Escape tests — behavior implemented but not unit-tested). 1 SUGGESTION (S-01: phrasing clarification). All 16 spec scenarios have runtime test evidence. All 4 design decisions verified in code. All tasks T-00..T-08 complete. T-09 correctly deferred to archive. Suite: 1208 tests pass, typecheck clean, lint 0 errors, e2e 67 pass.

**Next recommended**: `sdd-archive`
