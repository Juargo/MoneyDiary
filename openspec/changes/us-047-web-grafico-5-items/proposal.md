# Proposal: US-047 — Web dashboard main chart, 5 items (#281)

## Intent

The web dashboard's main chart still shows only the 3 spend buckets, so the monthly picture is incomplete: **Ingresos** (the base every percentage is computed against) is invisible, and **Sin categoría** is a mute legend row with no percentage and no transaction count. US-045 already ships `cantidadSinCategoria` and `totalIngreso` on the wire; the web simply does not consume them. The user cannot answer "how much came in, and how much of my month is still unclassified?" without leaving the screen. This change makes the redesigned donut the single, complete monthly read, and introduces the TRANSVERSAL rule that the semáforo is a clickable entry point on any chart — not a decorative badge.

## Scope

### In Scope

- Donut (ring) rendering of the **4 spend items** — Necesidades, Deseos, Ahorro, **Sin categoría** — replacing today's filled 3-slice pie.
- Redesigned legend: `name · % · CLP` rows with color dot and chevron; a divider; then **Ingresos** (amount-only, signed `+`, no %) and **Sin categoría** (`N tx`).
- Client-side sign convention: spend items render `−`, Ingresos renders `+` (backend keeps unsigned magnitudes — presentation only, ADR-024).
- Semáforo becomes a clickable tag `Semáforo: {estado} ›` at the chart's top-right, navigating to a **new `/semaforo` stub route** that US-049 will fill this sprint.
- View-model consumes `cantidadSinCategoria` + `totalIngreso`; month header reuses `PeriodoSelector` verbatim (CA-01).
- T1 tablet layout variant at Tailwind's stock breakpoints; `eslint-jsx-a11y` scoped to `error` on the touched files (US-042/043 precedent).

### Out of Scope

- Annual table (US-048), semáforo detail page **content** (US-049), Detalle MES pages.
- Any backend or wire change (`apps/api`, `packages/api-client`) — zero.
- `apps/mobile` parity (web and mobile chart ports diverge for now; deferred, no trigger yet).
- Drill-down for Ingresos: the row is **not clickable** in the interim, documented in code. Spend items + Sin categoría keep today's inline `BucketDetailList` panel swap (the CA-04 "current behavior").
- Introducing a chart library — rejected below.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `web-app`: the dashboard's main chart requirements change — 4-wedge donut instead of a 3-slice pie, a 5-row legend with signed amounts and a Sin categoría count, and a clickable semáforo tag with a real navigation target. Suggested requirement prefix for the delta: `WG5-*`. `WPER-*`/`WMYP-*` (period selector) must be reused **unchanged** — CA-01 is satisfied by existing behavior, and the delta must say so explicitly rather than restating it.

## Approach

Extend the existing hand-rolled SVG in place (exploration's recommended option). No chart library: the repo deliberately hand-rolls the pie in `domain/pie-geometry.ts` (pure math) + `components/DistribucionPie.tsx` (presentation), the geometry is already slice-count-agnostic, and adding a dependency for a shape the codebase already draws violates YAGNI and desyncs the web/mobile port pattern.

| Concern | Change |
|---|---|
| Ring geometry | Add inner-radius support to `pie-geometry.ts` (two-arc path per wedge). Pure function, unit-testable, no component knowledge. |
| Item set | Add `SinCategoria` to the ring's item allowlist in `distribucion-gasto.ts`; Ingresos stays **out** of the ring by construction, not by a runtime filter. |
| Item shape | `resumen-view-model.ts` maps three legend kinds — *has %* (3 spend buckets), *amount-only* (Ingresos), *count-bearing* (Sin categoría). One shape with an explicit discriminant beats three parallel lists. |
| Sign | `formatear-monto.ts` gains an opt-in `+` prefix; the sign is chosen by the view-model from the item kind, never read off the wire. |
| Legend | `LeyendaGasto.tsx` gains chevron, divider, tx-count and the amount-only row. Ingresos renders as a non-interactive row, not a disabled button. |
| Semáforo | `SemaforoBadge.tsx` becomes a `<Link>`-based tag; new `routes/_authenticated/semaforo.tsx` stub, following the `buckets.$bucket.tsx` thin-container precedent. |
| Tablet | T1 variant expressed as literal `md:` utilities on the chart card, mirroring how `WCTM-01` scoped the tier to Configuración — no `layout.ts` constant, no `AppShell` change. |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `apps/web/src/domain/pie-geometry.ts` | Modified | Donut inner radius |
| `apps/web/src/domain/distribucion-gasto.ts` | Modified | 4-item ring allowlist |
| `apps/web/src/domain/resumen-view-model.ts` | Modified | Consume `cantidadSinCategoria`/`totalIngreso`; 3 legend kinds |
| `apps/web/src/domain/formatear-monto.ts` | Modified | Explicit `+` prefix |
| `apps/web/src/components/DistribucionPie.tsx` | Modified | Ring render |
| `apps/web/src/components/LeyendaGasto.tsx` | Modified | 5 rows, chevrons, divider, count |
| `apps/web/src/components/SemaforoBadge.tsx` | Modified | Static span → clickable tag |
| `apps/web/src/components/ResumenScreen.tsx` | Modified | Drop hardcoded SinCategoria row; tag placement; T1 |
| `apps/web/src/routes/_authenticated/semaforo.tsx` | New | US-049 stub target |
| `apps/web/eslint.config.js` | Modified | Scope touched files to a11y `error` |
| `apps/web/**/*.test.{ts,tsx}` | Modified | 5 known suites shift 3 → 5 items (`DistribucionPie`, `LeyendaGasto`, `ResumenScreen`, `resumen-view-model`, `distribucion-gasto`); `SemaforoBadge.test.tsx` stays zero-diff per design D-06 (see addendum below) |
| `apps/api`, `packages/api-client`, `apps/mobile` | Untouched | Zero changes — any task touching these is scope creep |

> **Design addendum (post-`design.md` D-06).** The `SemaforoBadge.tsx` row above, and the "Static span →
> clickable tag" line in the Approach table, predate the design phase's resolution. Design decided
> `SemaforoBadge.tsx` stays **intact, zero behavioral diff** — it renders 12 more times inside
> `ResumenAnual`'s month grid, which must not gain navigation. The clickable tag ships as a **new**
> `apps/web/src/components/SemaforoTag.tsx` component instead. This proposal's approved text is left
> unmodified above; treat `SemaforoTag.tsx` (new) as the true target of that Approach/Affected Areas
> intent.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| The `/semaforo` stub ships and US-049 slips, leaving a dead-end page in production | Med | Stub renders an explicit "en construcción" state, never a blank/404; registered as debt with US-049 as its trigger |
| Test churn hides a real regression while suites are rewritten 3 → 5 | Med | Update suites deliberately per file with the new expectation stated, never a blind snapshot re-record |
| Percentage/estado math creeps client-side while adding the Sin categoría row | Low | ADR-024 guard: the only client derivations allowed are sign prefix, CLP formatting and labels; review rejects any bp/threshold arithmetic in `apps/web` |
| Donut arc math regresses the 0%/100%/single-item edge cases | Low | Inner radius lands as a pure-function change in `pie-geometry.ts` with its own unit tests before any component work |
| T1 asserted by className presence rather than rendered geometry (the exact gap that shipped `WCTG-14` false) | Med | Spec/tasks must require real-viewport verification for the tablet variant, not markup-literal assertions |
| `vitest-axe` is absent despite ADR-018 | Low | Pre-existing gap, explicitly **not** this US's job; CA-06 is met by the scoped `eslint-jsx-a11y` gate |

## Rollback Plan

Revert the PR(s). The change is confined to `apps/web` presentation plus one new route file; there is no migration, no wire change, and no persisted state. Reverting restores the 3-slice pie and the static badge with no data cleanup. If only the semáforo tag is problematic, the tag can be reverted to a static `SemaforoBadge` independently of the donut/legend work.

## Dependencies

- US-045 (shipped): `cantidadSinCategoria` + `totalIngreso` on `GET /api/resumen`.
- US-049 (same sprint) consumes the `/semaforo` stub route this change creates.

## Success Criteria

- [ ] **CA-01** — Month header renders via the existing `PeriodoSelector` (no rebuild) and the chart renders as a donut per the wireframe.
- [ ] **CA-02** — Legend shows 5 rows: 3 spend buckets with `name · % · CLP` and chevron, a divider, Ingresos amount-only signed `+`, Sin categoría with its tx count.
- [ ] **CA-03** — The semáforo renders as a clickable tag at the chart's top-right and navigates to `/semaforo` (TRANSVERSAL rule stated so it binds future charts, not just this one).
- [ ] **CA-04** — Spend items and Sin categoría keep today's inline drill-down; Ingresos is non-interactive, with the interim decision documented in the route/component code.
- [ ] **CA-05** — The T1 tablet variant renders correctly, verified at a real viewport width.
- [ ] **CA-06** — No percentage or estado arithmetic exists in `apps/web` (ADR-024), and `pnpm web lint` passes with `eslint-jsx-a11y` at `error` on every file this change touches.
- [ ] `pnpm web test` and `pnpm web typecheck` are green; `apps/api` and `packages/api-client` show zero diff.

## Next step

`sdd-spec` (delta on `web-app`, prefix `WG5-*`) and `sdd-design` may run in parallel. Design owns the donut geometry contract, the legend item discriminant, and the T1 breakpoint mechanism.
