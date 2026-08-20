# Proposal: US-055 — Web: reclasificar transacción desde la página MES-BUCKET

## Intent

Issue #289: harden the per-row reclassify flow on the Detalle MES-BUCKET page (`/buckets/$bucket`). US-053 ported `ReclasificarCategoriaControl` to the page unchanged (WDM-07: "control kept, UX unchanged"), deferring refinement to this US. The machinery is fully live — the control works, the cross-bucket confirmation fires, the mutation invalidates the page's own key. But three real gaps remain: (1) a stale-cache correctness bug — a reclassify into an Ingresos-bucket category leaves `['ingresos-mes']` stale (never invalidated); (2) no positive confirmation that a cross-bucket move worked beyond a per-row `aria-live` span that unmounts *with the row it announced*; (3) the control is not in any eslint a11y `error` block, so its `role="alertdialog"` accessibility went unaudited. US-055 closes all three in one bounded, web-only change. No backend, no contract, no migration.

## What Changes

- **Cascade UX (CA-01):** keep the existing single `<select>` grouped by `<optgroup>` per bucket — it IS a bucket→category cascade already (the wireframe pencil flow is satisfied by the native grouped select; a two-step popover is disproportionate). One refinement: the offered groups MUST be restricted to `BUCKETS_ASIGNABLES` (Necesidades / Deseos / Ahorro). `agruparPorBucket` currently emits an "Otros" catch-all group for out-of-`BUCKETS_ASIGNABLES` buckets — with the group restriction, cross-type moves are removed from the UI (D-02).
- **Invalidation completeness (CA-02) — both mutation sites:** add `['ingresos-mes']` (prefix) to BOTH `use-reclasificar-categoria.ts` (reclassify) and `invalidarCatalogoYDashboard` in `categorias-invalidacion.ts` (category CRUD). Both currently omit it (D-03).
- **Cross-bucket feedback (CA-03):** a page-owned `role="status"` region («Movida a {bucket}.» — {bucket} = ETIQUETA_BUCKET display label) that survives the moved row's disappearance. NO undo, NO toast library (D-04).
- **A11y hardening (CA-05):** promote `ReclasificarCategoriaControl.tsx` into a scoped eslint `error` block and fix what that surfaces — `role="alertdialog"` needs `aria-describedby` pointing at the money-move message; verify focus-on-open (→ Confirmar) / focus-on-close (→ select) already covered by the existing `useEffect` (D-05).
- **Test cascade:** all pinned-count invalidation assertions move up (3→4 keys reclassify; "4 claves"→"5 claves" category CRUD). Strict TDD: RED first.

## Decisions pinned (user-approved)

1. **D-01 — Evolve the control in place, keep the grouped `<select>`.** Its only render site is this page (via `GrupoMovimientos`). The native `<optgroup>`-grouped select already realizes the "bucket → that bucket's categories" cascade the wireframe pencil implies; a two-step popover/dialog would add state and a11y surface for zero user-visible gain (KISS). Rejected: replacing the select with a custom two-step widget.
2. **D-02 — Cascade offers ONLY the 3 spend buckets (`BUCKETS_ASIGNABLES`).** No cross-type moves via the UI. This scopes the control to the three assignable buckets already used by the Configuración forms, and removes the `agruparPorBucket` "Otros" catch-all path from this render (an Ingresos-bucket category can no longer be *picked* here). Why it still needs D-03: the backend imposes no such restriction and category CRUD can re-bucket a category, so the `['ingresos-mes']` cache can still go stale by other paths.
3. **D-03 — The sibling `['ingresos-mes']` gap is in scope, both sites.** `use-reclasificar-categoria.ts` (D-07 of US-054 assumed "no mutation co-mounts with `/ingresos`" — false once reclassify exists) AND `invalidarCatalogoYDashboard` (category re-bucket shifts income totals). Prefix key `['ingresos-mes']` matches `useIngresosMes`'s `['ingresos-mes', periodo ?? 'actual']` at position 0. Same matrix, same test files — fixed together, not split (correctness, not feature creep).
4. **D-04 — Feedback = a page-owned `aria-live` region, NOT a library.** The app has NO toast primitive (no `sonner`, no shadcn Toaster) — it uses `aria-live` regions everywhere (`SubirCartola`, `ListaIngestas`, `PatronesSection`). The existing per-row `aria-live` span inside the control unmounts *with the row* on a cross-bucket move (the exact `EliminarIngestaControl`/`ListaIngestas` bug class, already documented in-repo), so the destination announcement + visual toast MUST be owned by a component that outlives the row — the page (`BucketDetalleMesPage`), reached via a callback thread from the control. Message: «Movida a {ETIQUETA_BUCKET[bucketNuevo]}.» — display label, so wire `Deseos` announces «Movida a Gustos.». NO undo (YAGNI — refetch latency is acceptable, backend is authoritative). Rejected: adding `sonner`/shadcn Toaster (library for one line), optimistic updates (rollback state, client-side re-grouping — disproportionate).
5. **D-05 — A11y promotion to eslint `error` + fix the surfaced issues.** Add `ReclasificarCategoriaControl.tsx` to a scoped `error` file-list block (US-047/048/049/053/054 precedent — loose sibling, NOT a `src/components/**` glob that would absorb the app's a11y debt). Surfaced fix: `role="alertdialog"` gains `aria-describedby` → the money-move `<p>` (spec-recommended over the current `aria-label` alone). Focus management (open → Confirmar, cancel → select) already present; the promotion pins it under CI.

## Out of scope

- Bulk / multi-select reclassification (#289 explicit non-goal).
- Optimistic updates / row-move animation (D-04: refetch is authoritative; complexity disproportionate).
- Undo of a reclassify (D-04).
- Any backend, endpoint, contract, or migration change — `PATCH /api/transacciones/:id/categoria` and `PrismaReclasificarCategoriaRepository` are correct (ADR-024: no business rule in the client; the client only labels and invalidates).
- A new "Sin categoría" page — CA-04 reuses the existing `?destacar=SinCategoria` highlighted group on the bucket page (`BucketDetalleMesPage` L168: `destacar && grupo.categoriaId === null`); after a Sin-categoría row is classified, the reclassify invalidation refreshes the group and the dashboard, dropping the row from the destacado group.
- Backend guard against reclassifying into an Ingresos-bucket category (D-02 removes the path from the UI; a server-side guard is a separate backend US if ever wanted).

## Spec impact

Living spec: `openspec/specs/web-app/spec.md`. There is NO `openspec/specs/bucket-detalle-mes/spec.md` — the MES-BUCKET reclassify requirements live in `web-app` (WCAT-04, WDM-07).

- **MODIFIED — WCAT-04** ("Reclassify control is active, data-driven, and updates data on success"): tighten the offered set from "ALL of the caller's own categorías" to "the caller's own categorías in `BUCKETS_ASIGNABLES` only" (D-02); add the `['ingresos-mes']` refresh target to the "on success … MUST refresh" clause; add the `aria-describedby` requirement on the confirmation `alertdialog` (D-05); add the cross-bucket «Movida a {bucket}.» (ETIQUETA_BUCKET label) page-owned announcement (D-04). New scenarios: (a) a cross-bucket move announces the destination via a region that survives the row's disappearance; (b) the offered groups are exactly the 3 spend buckets.
- **MODIFIED — WDM-07** ("Reclassify is ported per row with a new invalidation key"): the invalidation set becomes `['resumen', clave]`, `['detalle-bucket-mes', bucket, clave]`, `['resumen-anual']`, `['ingresos-mes']` (net: 4 keys) — update the "set becomes … (net: 3 keys)" text and the jsdom scenario's asserted count (D-03).
- **ADDED — a new requirement** (WDM-09) for the category-CRUD invalidation completeness: `invalidarCatalogoYDashboard` MUST also invalidate `['ingresos-mes']` (a re-bucket can shift income totals) — "4 claves" → "5 claves", with the dedicated `categorias-invalidacion.test.ts` scenario (D-03).
- No delta to backend specs (`categorias-api`, `user-data-isolation`, `ingresos-detalle-mes`).

## Delivery forecast

- **Estimated changed lines: ~150–220** across ~12 files (see design §4 ledger): `use-reclasificar-categoria.ts` (+test), `categorias-invalidacion.ts` (+test), `ReclasificarCategoriaControl.tsx` (+test — `aria-describedby`, `BUCKETS_ASIGNABLES` restriction, callback for cross-bucket announcement), `BucketDetalleMesPage.tsx` (+test — owns the toast/`aria-live` region + `onMovida` callback), `eslint.config.js` (one file-list block), and the `web-app/spec.md` delta. One new file: `GrupoMovimientos.test.tsx` (created — no existing suite; harness scaffolded).
- **Recommendation: ONE bounded PR (single-PR).** Well under the 400-line chained-PR threshold; all changes are one cohesive slice (reclassify hardening) touching only `apps/web`. No chain, no `size:exception` needed.
- **Strict TDD applies** (project mode active, Vitest jsdom): every invalidation-count change and a11y assertion goes RED first. The 5 existing tests in `use-reclasificar-categoria.test.tsx` (2 of which pin the invalidation set) and the "4 claves" CRUD test are mechanical but must be RED-driven.
- **Rollback:** revert the PR — the control returns to its US-053 state (flat cross-bucket select, 3-key invalidation), no backend/contract/migration to unwind.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Per-row `aria-live` unmounts with the moved row → cross-bucket announcement is lost | High (it's the current behavior) | D-04: page-owned region via callback thread; mirror `ListaIngestas`'s documented pattern |
| A11y `error` promotion surfaces more than `aria-describedby` (e.g. Escape handler on `<div>` wrapper, not a dialog element) | Med | Fix what the gate flags; the wrapper `onKeyDown` Escape already works — audit, don't rewrite the widget |
| Pinned invalidation-count tests are load-bearing (4 reclassify cases + CRUD "4 claves") | Med | Strict TDD RED-first, mechanical count bump; no structural change |
| Restricting `agruparPorBucket` to `BUCKETS_ASIGNABLES` at THIS call site vs globally | Low | Scope the restriction to the control's render (do not change `agruparPorBucket` for Configuración, which legitimately shows all groups) — decide at design time |
