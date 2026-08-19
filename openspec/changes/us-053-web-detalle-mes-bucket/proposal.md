# Proposal: US-053 — Web: página Detalle MES-BUCKET + drill-down real desde el dashboard

## Intent

Issue #287: the bucket drill-down is still the US-047 interim — an inline panel inside `ResumenScreen` fed by the flat US-017 endpoint, grouped client-side. This change ships the real page: `/buckets/$bucket` evolves into Detalle MES-BUCKET (breadcrumb, month navigation, %/meta + usage bar, category groups with expand and "ver N más"), consuming the US-051 grouped endpoint (`bucket-detalle-mes` MBD-01..08). CA-05 retires the interim panel: pie/legend taps navigate instead of swapping the panel. Wireframe: `C2hidB23uiSHhf4Bt3dyPo` (frame 1 + tablet T1).

## Scope

### In Scope
- PR1 — client plumbing: `DetalleBucketMesDto` alias (`packages/api-client/src/index.ts`), web types re-export, `fetchDetalleBucketMes` (money-safety guard), `useDetalleBucketMes` hook (queryKey `['detalle-bucket-mes', bucket, periodo ?? 'actual']`).
- PR2 — page: breadcrumb `Dashboard / {bucket}`, reused `PeriodoSelector` (CA-02), %/meta tag + simple usage bar (markers at `porcentajeBp`/`metaBp`; ZonaBar NOT reusable — DTO lacks `bandas`), totals line, grouped list (expand/collapse + "ver N más", 3 visible rows), explicit empty month, SinCategoria highlight.
- PR3 — dashboard wiring: panel removed; pie/legend navigate; invalidation key added; tests + e2e updated.

### Out of Scope
- US-054 (Ingresos page) · US-055 (reclassify refinement — control kept, UX unchanged) · backend changes (endpoint untouched; flat endpoint stays but loses its only web consumer) · shared abstractions for the future Ingresos twin (2nd occurrence — DRY rule of 3 / YAGNI).

## Business Rules & Decisions (pinned, user-approved)

1. **Reclasificar se conserva**: port `ReclasificarCategoriaControl` per row (lápiz + bucket→categoría cascade). Dropping it regresses US-013 — `BucketDetailList` is its only render site. `useReclasificarCategoria` MUST add invalidation `['detalle-bucket-mes', bucket, clave]`.
2. **Sin categoría destacado**: entry from the Sin categoría chart item highlights the group via `?destacar=` search param, PLUS the structural absence of %/meta (MBD-03).
3. **"Ver N más…"**: 3 visible rows per group by default — client-side slice (MBD-02: backend sends all transactions).
4. **Estado vacío explícito**: empty month renders header with zeros + copy "Sin movimientos en {mes}", month navigation preserved.
5. **ADR-024**: no % arithmetic beyond `aPorcentajeLabel`; marker positions are presentation; no client-side business-rule duplication.

## Capabilities

- **New**: None (`bucket-detalle-mes` spec already assigns web rendering to `web-app`).
- **Modified**: `web-app` — ADDED family for the `/buckets/$bucket` page (CA-01 header, CA-02 in-page month nav, CA-03 groups, CA-04 highlight/empty); MODIFIED WCAT-01 (click navigates, not panel swap), WCAT-03 (explicit month empty state); MODIFIED dashboard wiring (WG5-03 clickable rows navigate; US-047 panel retired; WPER-05 selection-reset becomes inert — spec phase MUST reconcile).

## Approach

Evolve `/buckets/$bucket` in place (exploration Approach 1). Thin route keeps `validateSearch` (adds `destacar`), gains header + `PeriodoSelector`. `BucketDetailList` switches flat→grouped endpoint via its own new query hook, keeps `ReclasificarCategoriaControl`, adds expand/"ver N más"/empty/highlight. `ResumenScreen` drops selection state + panel; `LeyendaGasto`/`DistribucionPie` navigate with `periodo` + `destacar?` search. Reuse: breadcrumb from `EditarCategoria`, `BotonVolver`, `aPorcentajeLabel`/`SIN_PORCENTAJE_LABEL`, `formatearMontoCLP`, `ETIQUETA_BUCKET`, `DASHBOARD_CARD_CLASS`, states. Expand: hand-rolled button + `aria-expanded` (KISS — no shadcn collapsible dependency).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/api-client/src/index.ts` | Modified | `DetalleBucketMesDto` alias |
| `apps/web/src/api/{types,client}.ts` | Modified | Re-export; `fetchDetalleBucketMes` + guard |
| `apps/web/src/api/use-detalle-bucket-mes.ts` | New | Query hook (use-semaforo-detalle pattern) |
| `apps/web/src/api/use-reclasificar-categoria.ts` | Modified | + `['detalle-bucket-mes', bucket, clave]` |
| `apps/web/src/routes/_authenticated/buckets.$bucket.tsx` | Modified | Header; `destacar` search |
| `apps/web/src/components/{BucketDetailList,ResumenScreen,LeyendaGasto,DistribucionPie}.tsx` | Modified | Page body; panel→navigation |
| `apps/web/src/components/states/Empty.tsx` | Modified | Month-scoped copy |
| `{BucketDetailList,ResumenScreen,LeyendaGasto,DistribucionPie}.test.tsx` + `apps/web/e2e/` | Modified | Drill-down flows → navigation |
| `eslint.config.js` | Modified | jsx-a11y `error` scope list |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Reclassify dropped or regressed (US-013) | Med | Pinned decision 1 + dedicated tests + new invalidation key |
| Test churn (panel→page rewrites, e2e) | Med | US-047 precedent: deliberate per-file updates, sliced per PR |
| Wireframe not accessible (Whimsical link) | Med | Design phase may correct layout from CA-01..06 text (accepted) |
| Client % drift (ADR-024) | Low | Only `aPorcentajeLabel`; markers presentation-only |
| Premature abstraction for US-054 twin | Low | YAGNI — no shared abstraction at 2 occurrences |

## Rollback Plan

Web-only: revert the PR(s). Interim panel and flat-endpoint consumer return intact — no backend/contract change, no migration.

## Dependencies

- `GET /api/buckets/:bucket/detalle` (US-051, shipped) · `BucketDetalleMesResponse` generated type (shipped) · TanStack Router typed route (exists on `$bucket`).

## Success Criteria

- [ ] CA-01: breadcrumb, month + arrows, %/meta tag, usage bar, totals line render (Playwright for T1 geometry).
- [ ] CA-02: arrows change month in-page; URL `periodo` updates (deep-linkable).
- [ ] CA-03: groups show nombre/"N tx"/subtotal; expand/collapse; "ver N más…" after 3 rows.
- [ ] CA-04: SinCategoria entry highlights group (`?destacar=`) and shows no %/meta.
- [ ] CA-05: dashboard pie/legend navigate to the page; US-047 panel removed.
- [ ] CA-06: no client % math beyond `aPorcentajeLabel`; typed route; `pnpm web lint` / `typecheck` / `test` green.
