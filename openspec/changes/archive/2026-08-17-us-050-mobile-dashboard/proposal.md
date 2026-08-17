# Proposal: US-050 — Mobile dashboard with parity (5-item chart + annual table)

## Intent

Issue #284: "As a mobile user, I want the redesigned dashboard in the Expo app for the same month/year view as web (client parity, ADR-024/026)."

Today `apps/mobile` still renders the Sprint-3 resumen screen: a 3-bucket pie (`BUCKETS_GASTO`), no `SinCategoria`, no `Ingresos` legend row, no annual view, and a dead "Ver detalles ›" stub. Web moved on (US-045/046/047): a 4-item ring, a 5-row legend, and a 12-month annual grid. The gap makes the same data read differently on the two clients — the exact drift ADR-024 exists to prevent.

| CA | Delivered by |
|----|--------------|
| CA-01 | Donut + 5-row legend + static semáforo tag top-right (wireframe M1) |
| CA-02 | `Año YYYY` section, 12 mini-charts, selected month highlighted, tap switches the main chart |
| CA-03 | Presentation-only derivations in `apps/mobile/src/domain` + `src/components`, ported from web's sanctioned rules; CLP formatted over strings |
| CA-04 | jest-expo + RNTL specs (`pnpm --filter @moneydiary/mobile test`) |

## Scope

### In Scope
- Replace the resumen screen's content: donut (4-item ring, `SinCategoria` included and diluting percentages, per US-047 WG5-13) + 5-row legend (`Necesidades`, `Deseos`, `Ahorro`, `Ingresos`, `Sin categoría · N tx`).
- Static semáforo tag top-right of the chart card.
- Annual section: `GET /api/resumen/anual`, 12 cells (4×3), selected month highlighted, months without data non-tappable.
- Month selection as local state in `app/index.tsx`: defaults to current month, tap switches the main chart, resets on app restart.
- `fetchResumenAnual` in `src/api/client.ts` + mobile `periodo-anual` helpers + view-model extension, all unit-tested.

### Out of Scope (binding decisions — closed)
1. Semáforo tag is **not** tappable and carries **no chevron** (mobile detail page = future US).
2. Legend rows are **non-navigable**, no chevrons (bucket drill-down = future US).
3. Bottom tab bar `Resumen | Registrar | Historial` — navigation restructure is its own future US.
4. No deep links, no persisted period, no month/year picker, no year navigation (annual grid stays on the current year).
- Any backend change; `GET /api/resumen` and `/api/resumen/anual` are consumed as shipped.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `mobile-resumen-screen`: MOB-03's four states now compose the dashboard (5-item chart + annual grid) instead of the Sprint-3 breakdown; adds the annual fetch and the month-selection rule. MOB-05/MOB-06 (money and percentage discipline) stay unchanged and still apply.

## Approach

**Data source.** Extend the existing minimal fetch client (`src/api/client.ts`) with `fetchResumenAnual(anio?)`, mirroring `fetchResumen` byte-for-byte in shape (same `ApiResult`/`ApiError` tags, same `construirHeadersSesion`, never throws). Types come from `@moneydiary/api-client` (`ResumenAnualDto`, already generated from `openapi.json`) — ADR-011/012 are satisfied by the type layer, which mobile already consumes via `src/domain/resumen.types.ts`. No TanStack Query, no new HTTP abstraction: the platform-agnostic *runtime* client remains registered debt with an explicit trigger (ADR-012), and inventing it here would be speculative (YAGNI).

**Screen structure.** `app/index.tsx` keeps its `{loading|error|data}` switch and gains a `periodo` state (`undefined` → backend resolves current month). The chart card and the new `ResumenAnual` section are siblings inside the existing `ScrollView`. The annual section owns its own fetch/state, mirroring web's self-contained `ResumenAnual`, so an annual failure never blanks the main chart.

**View model.** Port web's sanctioned derivations rather than re-deriving them: `BUCKETS_ANILLO` (4-item apportionment), the `ItemLeyenda` discriminated union with `leyendaPrincipal`/`leyendaComplemento`, `montoSeguro`, signed CLP formatting, and largest-remainder rounding. Mobile's `distribucion-gasto.ts` was web's original source; this brings it back into sync. Backend values (`estadoGlobal`, `estadoSemaforo`, `porcentajeBp`, `cantidadSinCategoria`) pass through verbatim — never recomputed (ADR-024).

**Tests (ADR-017).** Pure-domain specs for the ring, legend projection, and period helpers; RNTL specs for the legend rows, the highlighted cell, the tap-to-switch interaction, and the non-tappable semáforo tag. Maestro stays manual, out of CI.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/mobile/app/index.tsx` | Modified | Month state + annual section composition |
| `apps/mobile/src/api/client.ts` | Modified | `fetchResumenAnual` + guard |
| `apps/mobile/src/domain/distribucion-gasto.ts` | Modified | `BUCKETS_5030` / `BUCKETS_ANILLO` split |
| `apps/mobile/src/domain/resumen-view-model.ts` | Modified | `ItemLeyenda`, legend projections |
| `apps/mobile/src/domain/periodo-anual.ts` | New | `mesAbreviado`, `anioDePeriodo`, `periodoActualUTC` |
| `apps/mobile/src/components/` | New/Modified | `LeyendaGasto`, `DistribucionPie`, `ResumenAnual`, `MiniDistribucionPie`, `SemaforoTag` |
| `apps/mobile/src/theme/colors.ts` | Modified | `SinCategoria` slice color (ring member today has none) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Ring math drifts from web (two copies of the same rules) | Med | Port verbatim + mirror web's unit tests; no `packages/shared` (ADR-008) |
| 12 SVG mini-donuts hurt scroll performance on low-end Android | Med | Fixed-size, label-less minis; measure on the EAS internal build (ADR-022) |
| Second network call widens the failure surface | Low | Annual section owns its own states; main chart unaffected |
| PR exceeds the 400-line review budget | High | Slice at tasks time (client+domain → chart card → annual grid) |
| Wireframe copy diverges from web copy (e.g. "Gustos") | Low | Reuse `ETIQUETA_BUCKET`, already aligned |

## Rollback Plan

Single feature branch, mobile-only, no backend/schema/contract change: revert the merge commit. The previous resumen screen returns intact. No data migration, no released build to roll back until an EAS build is cut.

## Dependencies

- `GET /api/resumen` with `cantidadSinCategoria` (US-045) and `GET /api/resumen/anual` (US-046/US-030 Slice C) — both shipped.
- `@moneydiary/api-client` types already expose `ResumenMesDto` and `ResumenAnualDto`.

## Success Criteria

- [ ] Dashboard shows the 4-item donut with a 5-row legend and a non-interactive semáforo tag (CA-01).
- [ ] Annual section renders 12 cells; tapping a month with data switches the main chart; the selected cell is visually marked (CA-02).
- [ ] No money math or semáforo state is computed on the client beyond web's sanctioned derivations; CLP amounts formatted over strings (CA-03).
- [ ] `pnpm --filter @moneydiary/mobile test` green, covering ring, legend, period helpers, and the tap interaction (CA-04).
- [ ] No new dependency added to `apps/mobile`.

## Closed Questions (decided at the proposal gate, 2026-08-16 — binding)

1. **`sinIngreso` month with the annual grid.** `Empty` replaces only the chart card; the annual section still renders. This is a DELIBERATE divergence from web's whole-screen short-circuit: on mobile the annual grid is the only month navigation, so blanking it would strand the user on an empty current month.
2. **IDEAL 50/30/20 inset.** Dropped — neither wireframe M1 nor the redesigned web dashboard renders it.
3. **Per-month mini semáforo tag.** No tag on mobile annual cells in US-050 (consistent with binding decision 1: no non-interactive semáforo affordances beyond the main tag).
4. **"Ver detalles ›" button.** Removed — no destination exists once navigation is out of scope.
