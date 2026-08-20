# Design: US-055 — Web: reclasificar transacción desde la página MES-BUCKET

> Scope: HOW at architecture level. Every path/symbol below read on the worktree `us-050-mobile-dashboard` (main @ cff13ddd, US-053 shipped). Binding inputs: `proposal.md` (D-01..D-05 PINNED), `sdd/us-055-web-reclasificar-mes-bucket/explore`, `specs/web-app/spec.md` (WCAT-04, WDM-07, +WDM-09). Format mirrors `archive/2026-08-20-us-054-web-detalle-mes-ingresos/design.md`. ONE PR, web-only. Design continues the proposal's decisions at **D-06**.

## 1. Overview + Design Principles

US-053 ported `ReclasificarCategoriaControl` unchanged (WDM-07: "control kept, UX unchanged"), deferring three refinements to US-055: (1) an `['ingresos-mes']` stale-cache gap on reclassify AND category CRUD; (2) no cross-bucket confirmation that survives the moved row's unmount; (3) the control never audited under an eslint a11y `error` gate. This change closes all three inside `apps/web` — no backend, no contract, no migration.

Principles: (1) **audit-then-touch** — the widget works; promote it to `error`, fix only what CI surfaces, do NOT rewrite (D-08); (2) **page-owned announcement via a NON-optional callback thread** — the per-row `aria-live` span unmounts *with the row it announced* (the documented `ListaIngestas`/`EliminarIngestaControl` bug class), so the destination announcement lives in a persistent `role="status"` region on `BucketDetalleMesPage` (D-07); (3) **local filter, not a global change** — restrict the offered groups to `BUCKETS_ASIGNABLES` at THIS call site; `agruparPorBucket` stays intact for Configuración (D-06); (4) **correctness, not feature creep** — the `['ingresos-mes']` key lands on BOTH mutation sites in the same PR (D-09); (5) **strict TDD RED-first** — every pinned invalidation count moves up before the source key is added.

## 2. Decisions (continuing D-06..)

| # | Decision | Alternatives | Choice + rationale |
|---|----------|--------------|--------------------|
| D-06 | **Optgroup cascade restriction (D-01/D-02)** | Change `agruparPorBucket` globally to drop "Otros" (breaks Configuración, which legitimately shows every group — WCTG-02); a new `agruparPorBucketAsignable` variant (duplicates the whole function for a one-group delta) | **Local filter at the control's render.** `agruparPorBucket` already emits only `BUCKETS_ASIGNABLES` groups + an "Otros" catch-all for buckets outside the three (unreachable via the deployed API, `agrupar-categorias-por-bucket.ts:40-46`). The control keeps calling it, then filters: `grupos.filter((g) => (BUCKETS_ASIGNABLES as ReadonlyArray<string>).includes(g.bucket))`. `BUCKETS_ASIGNABLES` is **IMPORTED from `catalogo-constantes`** — never redeclared inline. Result: an Ingresos-bucket (or "Otros") categoría can no longer be *picked* here. `agruparPorBucket` is untouched → Configuración forms keep the full list. **Current categoría preselection is unchanged** (`value={valor}`, initialized `categoriaActual ?? ''`); the current row's categoría lives in one of the three spend buckets by construction (the page renders spend buckets only), so it survives the filter. **"Sin categoría" row** keeps its `<option value="" disabled>` placeholder (control:196-200) — it renders OUTSIDE the `<optgroup>` elements and is unaffected by the filter on real groups. |
| D-07 | **Announcement thread (D-04)** | Keep the per-row `aria-live` span (the current bug: it unmounts with the `<li>` on a cross-bucket move — see `ListaIngestas.tsx:29-37`, `EliminarIngestaControl.tsx:19-27` — dropping focus to `<body>` and racing the announcement against its own removal); add a toast library (`sonner`/shadcn Toaster — a dependency for one line, D-04); an OPTIONAL `onMovida?:` callback with a silent no-op default (the `EliminarIngestaControl` `onEliminado?` shape — flagged by us-044 PR7 case law: a route-pinned/non-optional thread must not degrade to silent nothing; note: `EliminarIngestaControl` declares `onEliminado?` optional BUT `ListaIngestas` requires it at its boundary — the rejection targets the optional half, not the required-at-boundary pattern) | **ONE page-owned `role="status"` region (`aria-live="polite"` implied by `role="status"`) + a NON-optional `onMovida: (bucketLabel: string) => void` callback**, threaded `ReclasificarCategoriaControl` → `GrupoMovimientos` → `BucketDetalleMesPage`. The page holds `const [anuncio, setAnuncio] = useState('')` and renders **one stable** `<p role="status">{anuncio}</p>` (or equivalent block element) OUTSIDE the groups map — visible to sighted users AND read by screen readers from the same node (no separate `sr-only` twin span). `alMovida(bucketLabel)` sets `anuncio` to `Movida a ${bucketLabel}.`. The control fires `onMovida(etiqueta(pendiente.bucketNuevo))` from `confirmar()` on a **cross-bucket** commit only (same-bucket commits stay silent — the row does not disappear, no announcement needed). The callback is **required** on all three components (no `?`) — the only render site is this page, so there is no legitimate silent-noop caller (route-pinned per us-044 PR7). Literal: **`Movida a {bucketLabel}.`** where `bucketLabel = ETIQUETA_BUCKET[bucketNuevo]` → a move to `Deseos` announces **`Movida a Gustos.`** (the human label, `bucket-colors.ts:51`), NOT the raw bucket key. **Persistence semantics**: `anuncio` **persists** until replaced by a subsequent cross-bucket move, a period change, or page unmount — there is no timer, no auto-clear on inactivity, no `setTimeout` state machine (KISS). A `useEffect` on `periodo` calls `setAnuncio('')` so a stale announcement from a previous month does not persist into the new month's view. On a subsequent move, the region content is overwritten with the new literal (last-move-wins, `ListaIngestas` precedent); the `role="status"` region re-announces on every content change. The stale per-row span (control:213-217) is **removed** — its same-bucket "Categoría actualizada" announcement is redundant with the still-visible select value and was itself unmount-fragile. |
| D-08 | **A11y hardening (D-05)** | Rewrite the inline widget as a real `<dialog>`/focus-trap (over-engineering — the audit shows the existing shape is compliant once `aria-describedby` is wired); app-wide `error` glob (absorbs the app's a11y debt — every prior US rejected this) | **Audit result (control read line-by-line):** (a) `role="alertdialog"` (control:225) has `aria-label="Confirmar cambio de categoría"` but **no `aria-describedby`** → add `aria-describedby={mensajeId}` pointing at the money-move `<p>` (control:234-237), which gains `id={mensajeId}` (`const mensajeId = useId()`). This is the ONE fix the promotion mandates (spec-recommended over `aria-label` alone). (b) The **Escape handler on the `<div role="alertdialog">`** (control:227-231) is **jsx-a11y-acceptable**: `no-static-element-interactions`/`no-noninteractive-element-interactions` do not flag an element carrying an interactive ARIA role (`alertdialog`); the `onKeyDown` is on the role-bearing element, not a bare `<div>`. No restructure. (c) **Focus-on-open → Confirmar** (`useEffect` control:107-111) and **focus-on-close/cancel → select** (`cancelar()` control:166) are already present — the promotion pins them under CI, no code change. Minimal compliant shape = one `aria-describedby` wire + one `id`. The eslint block is a **FILE LIST** (loose-sibling precedent, US-047/048/049/053/054): add `src/components/ReclasificarCategoriaControl.tsx` — NOT a `src/components/**` glob. |
| D-09 | **Invalidation matrix (D-03)** | Add `['ingresos-mes']` only to the reclassify hook (leaves category CRUD stale — a re-bucket shifts income totals, same class of bug); split the two sites into two PRs (same matrix, same test files — artificial split) | **Both sites, this PR.** `use-reclasificar-categoria.ts` `onSuccess` gains `void queryClient.invalidateQueries({ queryKey: ['ingresos-mes'] })` → **4 keys**: `['resumen', clave]` (exact), `['detalle-bucket-mes', bucket, clave]` (exact), `['resumen-anual']` (prefix), `['ingresos-mes']` (**prefix** — matches `useIngresosMes`'s `['ingresos-mes', periodo ?? 'actual']` at position 0; the hook does not know which period the Ingresos page cached, same reasoning as its `['resumen-anual']` prefix). `categorias-invalidacion.ts` `invalidarCatalogoYDashboard` gains `void qc.invalidateQueries({ queryKey: ['ingresos-mes'] })` → **5 claves** (append AFTER `['detalle-bucket-mes']`, preserving order for the exact-array assertion). JSDoc on both updated ("3 keys"→"4 keys"; "4 claves"→"5 claves"). |

## 3. Architecture at a glance

```
BucketDetalleMesPage  [anuncio state + <p role="status"> region — persists until next move or unmount]
   │ onMovida={alMovida}                                  (stable, OUTSIDE groups map)
   ▼
GrupoMovimientos (per group)  ── onMovida ──▶  (passthrough, required prop)
   ▼
ReclasificarCategoriaControl (per row)
   ├─ grupos = agruparPorBucket(...).filter(g ∈ BUCKETS_ASIGNABLES)   [D-06]
   ├─ confirmar() cross-bucket → onMovida(etiqueta(bucketNuevo))       [D-07]
   ├─ <div role="alertdialog" aria-describedby={mensajeId}>            [D-08]
   │      <p id={mensajeId}>Esto mueve {monto} de {A} a {B}.</p>
   └─ mutation → useReclasificarCategoria  onSuccess invalidates 4 keys [D-09]
                                            └─ ['resumen'|'detalle-bucket-mes'|'resumen-anual'|'ingresos-mes']
categorias-invalidacion.invalidarCatalogoYDashboard → 5 claves (CRUD path) [D-09]
```

## 4. File ledger (single PR)

| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/api/use-reclasificar-categoria.ts` | Modify | +`['ingresos-mes']` prefix invalidation; JSDoc 3→4 keys (D-09). |
| `apps/web/src/api/use-reclasificar-categoria.test.tsx` | Modify | RED-first: 4-key + no-period cases assert the new key (D-09, §5). |
| `apps/web/src/api/categorias-invalidacion.ts` | Modify | +`['ingresos-mes']` in `invalidarCatalogoYDashboard`; JSDoc 4→5 claves (D-09). |
| `apps/web/src/api/categorias-invalidacion.test.ts` | Modify | RED-first: "4 claves"→"5 claves" exact-array (D-09, §5). |
| `apps/web/src/components/ReclasificarCategoriaControl.tsx` | Modify | Local `BUCKETS_ASIGNABLES` filter (D-06); required `onMovida` prop + fire on cross-bucket confirm; remove stale per-row `aria-live` span (D-07); `aria-describedby`+`id` on the alertdialog (D-08). |
| `apps/web/src/components/ReclasificarCategoriaControl.test.tsx` | Modify | Rewrite "offers all 8" → 3-group restriction; cross-bucket cases assert `onMovida` fires with the label; `aria-describedby` wiring (§5). |
| `apps/web/src/components/GrupoMovimientos.tsx` | Modify | Thread required `onMovida` prop through to the control (D-07). |
| `apps/web/src/components/GrupoMovimientos.test.tsx` | Create | `onMovida` threaded/forwarded assertion (§5). File does not exist — full test harness (QueryClient wrapper, catalog fetch mocks) must be scaffolded from scratch. |
| `apps/web/src/components/BucketDetalleMesPage.tsx` | Modify | `anuncio` state + stable `role="status"` region (visible text, persists until next move or unmount) + `alMovida` passed to every `GrupoMovimientos` (D-07). |
| `apps/web/src/components/BucketDetalleMesPage.test.tsx` | Modify | Cross-bucket move announces "Movida a {label}." via a region that survives the row's disappearance (§5). |
| `apps/web/eslint.config.js` | Modify | New US-055 FILE-LIST block: `ReclasificarCategoriaControl.tsx` (D-08). |
| `apps/web/e2e/bucket-detalle-mes.e2e.ts` | Modify | +1 case: cross-bucket reclassify announces + row leaves; periodo survives (§5). |
| `openspec/specs/web-app/spec.md` | Modify | WCAT-04 + WDM-07 deltas; ADDED WDM-09 (proposal §Spec impact). |

No new source files. Forecast ~150–220 LOC.

## 5. Test ledger (RED-first)

| Suite | Action | Cases | Notes |
|-------|--------|-------|-------|
| `use-reclasificar-categoria.test.tsx` (5 existing) | Modify | 2 updated | The WCAT-04 4-key case (:93) adds `expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ingresos-mes'] })`; the no-period case (:127) likewise. Load-bearing count bump, no structural change (D-09). |
| `categorias-invalidacion.test.ts` (3) | Modify | 1 updated | Perfil B exact-array (:47) → `[['categorias'],['resumen'],['resumen-anual'],['detalle-bucket-mes'],['ingresos-mes']]` (5 claves, order pinned). Test TITLE rewritten "4 claves"→"5 claves" AND the exact-array assertion body gains `['ingresos-mes']` as 5th element (D-09). |
| `ReclasificarCategoriaControl.test.tsx` (~20) | Modify | all ~20 (stub prop) + ~4 behavior | Making `onMovida` REQUIRED means ALL ~20 existing tests must pass a stub `onMovida` prop to compile (`tsc` enforces this mechanically). Beyond the stub update: rewrite "offers all 8 categorías grouped by bucket" (:203) → offers ONLY the 3 spend-bucket groups (Ingresos-bucket categoría NOT rendered); the cross-bucket confirm case (:345) + Sin-categoría confirm (:519) assert `onMovida` called once with the destination LABEL (`Gustos` for Deseos — pin the label mapping, not the raw key); ADD `aria-describedby` points at the money-move `<p>` (id match); ADD same-bucket commit does NOT call `onMovida`. Falsifiable: assert the exact label + call count, never `toHaveBeenCalled()` alone. |
| `GrupoMovimientos.test.tsx` | Create | 1 | **File does not exist — scaffold from scratch.** Full harness (QueryClient wrapper, catalog fetch mocks) must be set up; then: render with an `onMovida` spy, trigger a cross-bucket confirm, assert the page-level spy fired (thread is wired, not silently dropped). |
| `BucketDetalleMesPage.test.tsx` | Modify | 2 added | (a) a cross-bucket move surfaces `role="status"` text `Movida a Gustos.` and the region is a page-level sibling that is NOT inside any `grupo-movimientos` section (query the status node, assert its ancestry — proves it survives the row unmount, the ListaIngestas bug-class guard; no sr-only, both sighted and AT users read the same node); (b) a same-bucket commit does NOT update the status region — the region content remains unchanged (empty on first render). |
| `bucket-detalle-mes.e2e.ts` | Modify | 1 added | **Extend the existing bucket e2e, do NOT create a new file** (cost: the page + stubs already exist; a fresh file re-scaffolds the auth/stub harness for one flow). Case: on `/buckets/Necesidades?periodo=2026-07`, pick a Deseos categoría → confirm → assert (i) the `role="status"` region reads `Movida a Gustos.` and is visible (not sr-only), (ii) the moved row is gone from the Necesidades page after refetch, (iii) the URL still carries `?periodo=2026-07` (periodo survives the flow — CA-08-class N/A but periodo persistence is pinned). Stub echoes the reclassify PATCH + returns the row under Deseos on refetch. |

Gate: additive rule — suites not listed stay byte-unchanged; `tsc` clean; `pnpm web lint` passes with the control now under `error`.

## 6. Contracts

`onMovida: (bucketLabel: string) => void` — **required** (no `?`) on `ReclasificarCategoriaControl`, `GrupoMovimientos`, threaded from `BucketDetalleMesPage`. Called exactly once, only on a **cross-bucket** commit, with `ETIQUETA_BUCKET[bucketNuevo]` (human label). No return value; the page owns all announcement state.

`useReclasificarCategoria` `onSuccess` invalidation set: `['resumen', clave]`, `['detalle-bucket-mes', bucket, clave]`, `['resumen-anual']`, `['ingresos-mes']` — 4 keys (2 exact, 2 prefix).

`invalidarCatalogoYDashboard`: `['categorias']`, `['resumen']`, `['resumen-anual']`, `['detalle-bucket-mes']`, `['ingresos-mes']` — 5 claves (all prefix), order pinned by the exact-array test.

Announcement literal: **`Movida a {ETIQUETA_BUCKET[bucketNuevo]}.`** (e.g. `Movida a Gustos.`).

## 7. Review Workload Forecast

- **Estimated changed lines**: ~150–220 across ~12 files (source + tests + spec).
- **Decision needed before apply**: No.
- **Chained PRs recommended**: No.
- **400-line budget risk**: Low.
- **Delivery**: ONE bounded PR (single-PR), one cohesive slice (reclassify hardening), `apps/web` only. No `size:exception`. Work-unit commit order (RED-first): (1) `test:` invalidation counts RED → `feat:` add `['ingresos-mes']` both sites GREEN (D-09); (2) `test:` control 3-group + `onMovida` + `aria-describedby` RED → `feat:` control filter + callback + a11y wire GREEN (D-06/07/08); (3) `feat:` thread `GrupoMovimientos` + page region GREEN with its tests; (4) `chore(eslint):` promote control to `error`; (5) `test(e2e):` extend bucket e2e; (6) `docs(spec):` WCAT-04/WDM-07/WDM-09 deltas.

## 8. Rollback / Compatibility

Revert the PR — the control returns to its US-053 state (unfiltered cross-bucket select, 3-key invalidation, per-row `aria-live` span, no `error` gate). No backend/contract/migration to unwind (`PATCH /api/transacciones/:id/categoria` stays deployed, harmless). The required `onMovida` prop is internal to `apps/web` — no external consumer. The spec delta reconciles on revert.

## 9. Risks

- **A11y promotion surfacing more than `aria-describedby` (D-08)**: audit says only that one fix is required; if CI flags the Escape-on-`<div>` handler, the mitigation is `role`-bearing acceptability (documented above) — fix what the gate flags, do not rewrite the widget.
- **`onMovida` non-optional churn**: three components gain a required prop; every test that renders `ReclasificarCategoriaControl`/`GrupoMovimientos` in isolation must pass a spy — mechanical, RED-first.
- **Label vs key drift in the literal**: the announcement uses `ETIQUETA_BUCKET` (`Deseos`→`Gustos`); a test asserting the raw key would pass vacuously against a wrong impl — the ledger pins the LABEL, not the key.
- **Prefix `['ingresos-mes']` over-invalidation**: harmless (a refetch on a page not currently mounted is a no-op; distinct key at position 0 never collides with `['resumen', ...]`/`['detalle-bucket-mes', ...]`).
- **periodo persistence**: the reclassify flow and its refetch must not drop `?periodo=` (e2e assert (iii)); BotonVolver/CA-08 is N/A here but periodo survival is pinned across the flow.
