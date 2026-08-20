# Proposal: US-054 — Web: página Detalle MES-INGRESOS + drill-down real desde la leyenda

## Intent

Issue #288: the Ingresos drill-down is still the US-047 interim — an inert legend row whose code comment says "no Ingresos drill-down endpoint exists yet". US-052 shipped `GET /api/ingresos/mes` (2026-08-18), so the trigger is real. This change ships the dedicated page `/ingresos?periodo=` — breadcrumb, month navigation, "N ingresos" tag, positive total, and a semantic table with the Origen column — and flips the legend row (CA-04) from inert to navigable, replacing the interim (WG5-06).

## Scope

### In Scope
- Client plumbing: `IngresosMesDto` + nested tx alias (`packages/api-client/src/index.ts`, D-06 type-only, no regen), web types re-export (ADR-008), `esIngresosMesDto` guard (`esMontoStringValido` + `esFechaValida`), `fetchIngresosMes`, `useIngresosMes` (queryKey `['ingresos-mes', periodo ?? 'actual']`).
- Page: router-agnostic `IngresosMesPage` (CA-01 header, CA-02 table, CA-03 month nav, empty month, Loading/Error/retry) + thin route `ingresos.tsx` (validateSearch via `normalizarPeriodo`, WDI-03 functional search updater — US-053 D-04).
- Domain: `ingresos-mes-view-model.ts` — pure passthrough, labels only, no re-sort (MID-01 order authoritative).
- Dashboard wiring: `FilaIngreso` → navigable (new callback thread, mirror of `onSelectBucket` — D-05, US-053 D-06).
- a11y: `eslint.config.js` a11y ERROR scope for new files; semantic `<table>` (first in web app).
- e2e: `**/api/ingresos/mes*` stub (distinct prefix — no LIFO collision with `**/api/resumen*`) + `ingresos-mes.e2e.ts`.

### Out of Scope
- Edit/reclassify income from the page (backend auto-categorizes, US rule) · IngresoCard clickable · pie wedge (no Ingresos wedge exists) · primary nav entry (drill-down destination only, `nav-items.ts` docstring) · shared abstractions with the US-053 twin (2nd occurrence — YAGNI rule of 3).

## Business Rules & Decisions (pinned, user-approved)

1. **CA-02 = semantic `<table>`** — first in the web app (Fecha, Descripción, Origen, Monto; `<th scope>`, a11y). New precedent, deliberate.
2. **Route `/ingresos`** with `?periodo=YYYY-MM` (repo convention), thin-route pattern like `buckets.$bucket.tsx`.
3. **Total del mes positivo** via `formatearMontoConSigno(monto, '+')` (US-047).
4. **CA-04 dashboard entry = ONLY the legend row** (`FilaIngreso` navigable). Pie has no Ingresos wedge; IngresoCard untouched (yagni).

## Capabilities

- **New**: None (`ingresos-detalle-mes` is the backend contract; page requirements land in `web-app`).
- **Modified**: `web-app` — ADDED requirements for `/ingresos` (fresh family, WDM-style: CA-01 header + back-link carrying `search={{ periodo }}` — NOT BotonVolver, typed `to` can't carry search, US-053 D-09; CA-02 semantic table; CA-03 deep-linkable month nav; empty month = 200 zeros → header + Empty, no sinIngreso branch; CA-05 ADR-024 thin client); MODIFIED WG5-06 (Ingresos MUST NOT be clickable → navigable, interim comment removed), WG5-03 "not clickable" scenario, WG5-12 keyboard scenario. Backend `ingresos-detalle-mes` + `user-data-isolation`: NO delta.

## Approach

US-053 twin (the exact template — D-01..10, PR slicing). `/ingresos` thin route; `IngresosMesPage` router-agnostic: breadcrumb + hand-rolled `Link to="/" search={{ periodo }}`, reused `PeriodoSelector` (undefined → current month), "N ingresos" tag from `conteo`, positive total, note "Sin meta ni semáforo: los ingresos no participan del 50/30/20 como gasto" (MID-03 structural), semantic table (Origen tag: bank verbatim or 'Manual'), Empty with custom copy. `FilaIngreso` becomes a clickable row reporting a bucket-less navigation intent; the route threads the callback (D-05). Reuse: `Empty` custom title/description, states, `mesCompletoLabel`, `formatearMontoCLP`/`formatearMontoConSigno`. No backend changes.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/api-client/src/index.ts` | Modified | `IngresosMesDto` + nested tx alias (D-06) |
| `apps/web/src/api/{types,client}.ts` | Modified | Re-export; `esIngresosMesDto` + `fetchIngresosMes` |
| `apps/web/src/api/use-ingresos-mes.ts` | New | Query hook |
| `apps/web/src/domain/ingresos-mes-view-model.ts` | New | Pure view-model (labels, passthrough) |
| `apps/web/src/domain/fecha.ts` | Modified | `aFechaCorta` (date-label decision, see Risks) |
| `apps/web/src/components/IngresosMesPage.tsx` | New | Router-agnostic page |
| `apps/web/src/components/IngresosMesTable.tsx` | New | Semantic table + Origen tag (if warranted) |
| `apps/web/src/routes/_authenticated/ingresos.tsx` | New | Thin route |
| `{LeyendaGasto,ResumenScreen,ResumenPage}.tsx` + `routes/_authenticated/index.tsx` | Modified | FilaIngreso → navigation callback thread |
| `eslint.config.js` | Modified | a11y `error` scope list |
| `apps/web/e2e/fixtures/api-stubs.ts` + `e2e/ingresos-mes.e2e.ts` | Modified/New | Stub + flows |
| `{LeyendaGasto,ResumenScreen}.test.tsx` | Modified | :77-86, :479-513 flip inert→navigable |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| No `periodo` echo on wire → month label must derive from search param | Med | `mesCompletoLabel(periodo ?? periodoActual())`; pinned D-01: `periodoActual()` in `domain/periodo.ts` (docblock re-scoped to normalizers; `PeriodoSelector` local-shadowing footgun noted in design §9) |
| `aFechaLabel` deleted in US-053 (US-053 D-08) → date-label for Fecha column | Low | Pinned D-02: `aFechaCorta` in `domain/fecha.ts` (4th `.slice(0,10)` occurrence — DRY rule of 3); guard via `esFechaValida`; legacy 3 sites migrate on next touch (out of scope) |
| Empty month = 200 zeros (no `sinIngreso` flag) | Low | View-model maps conteo 0/`[]` → header + Empty, never the dashboard branch |
| WG5-06 flip churns 2 component suites + spec scenarios | Med | US-053 precedent: deliberate per-file updates, spec delta reconciles |
| First semantic table: a11y regression surface | Med | a11y lint ERROR gate (US-042/053) + role/accname suite assertions + Playwright T2 (D-09 resolved: `vitest-axe` is not a dependency — WDI-07 updated to the repo precedent) |

## Rollback Plan

Web-only: revert the PR(s). Inert legend row, comment trigger, and dashboard behavior return intact — no backend/contract change, no migration (endpoint stays deployed, harmless).

## Dependencies

- `GET /api/ingresos/mes` (US-052, shipped) · `IngresosMesResponse` in `types.gen.ts` (shipped) · US-053 patterns (PeriodoSelector, Empty custom copy, US-053 D-09 back-link, US-053 D-04 updater).

## Success Criteria

- [ ] CA-01: breadcrumb, month + arrows, "N ingresos" tag, positive total, "Sin meta ni semáforo" note render (Playwright T2 geometry).
- [ ] CA-02: semantic `<table>` with `<th scope>`; Origen tag (bank verbatim | "Manual"); Monto `+` sign.
- [ ] CA-03: arrows change month in-page; URL `periodo` updates (deep-linkable); page never leaves `/ingresos`.
- [ ] CA-04: legend Ingresos row navigates to `/ingresos?periodo=`; US-047 interim comment removed; pie/IngresoCard unchanged.
- [ ] CA-05: no client business logic beyond labels (ADR-024); typed route; `pnpm web lint`/`typecheck`/`test` + a11y gate green.