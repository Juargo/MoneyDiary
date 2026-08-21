# Archive Report — us-056-mobile-detalle-mes

**Date**: 2026-08-20
**Change**: us-056-mobile-detalle-mes — Mobile: páginas de detalle MES con paridad web (M1 bucket detail + M2 ingresos)
**Issue**: #290 (closed)
**Status**: ARCHIVED & CLOSED

## Executive Summary

US-056 delivered two new drill-down screens for `apps/mobile` — M1 (`app/bucket/[bucket].tsx`) and M2 (`app/ingresos.tsx`) — closing the web↔mobile parity gap opened by US-050's read-only dashboard. 5 chained PRs (#443–#447, stacked-to-main) shipped 769/769 tests green, tsc clean, and 0 CRITICAL / 0 WARNING at verify. The living specs have been updated: `openspec/specs/mobile-detalle-mes/spec.md` created (MDET-01..07, 30 scenarios) and `openspec/specs/mobile-resumen-screen/spec.md` MOB-08 replaced with the pressable legend requirement (10 scenarios).

## What Shipped

### 5 Chained PRs (stacked-to-main)

| PR | Title | Content | Status |
|----|-------|---------|--------|
| #443 (PR1) | Legend pressability + navigation + stub routes | LeyendaGasto View→Pressable + unique testIDs + onNavegar thread + stub bucket/[bucket] and ingresos routes in _layout.tsx | Merged |
| #444 (PR2) | Plumbing + domain + SelectorPeriodoMes | fetchDetalleBucketMes/fetchIngresosMes, shape guards, reclasificarCategoria wrapper, VMs (aDetalleBucketMesViewModel/aIngresosMesViewModel), helpers (fecha-corta, porcentaje, detalle.types, mensajes-reclasificar), period helpers (mesAnterior/mesSiguiente/esMesActual), SelectorPeriodoMes component | Merged |
| #445 (PR3) | M1 read-only screen + accordion | BucketDetalleScreen + GrupoMovimientosMobile accordion + SinCategoria destacado dual mechanics + real bucket/[bucket].tsx route replacing PR1 stub | Merged |
| #446 (PR4) | Reclassify control wired into M1 | ReclasificarMobileControl (Modal + Alert guard + settled announcement) wired into GrupoMovimientosMobile and BucketDetalleScreen | Merged |
| #447 (PR5) | M2 ingresos screen + real ingresos route | IngresosMesLista + IngresosMesScreen (read-only, no reclassify) + real ingresos.tsx with useFocusEffect stale-guard + T-18 deferred placeholder | Merged |

### Code Quality

- **Tests**: 769/769 passing (69 suites) — all green
- **Type check**: `pnpm --filter @moneydiary/mobile exec tsc --noEmit` — zero errors
- **Verify verdict**: PASS — 0 CRITICAL, 0 WARNING, 1 SUGGESTION (S-01: encodeURIComponent no-op pin, cosmetic)

### Judgment-Day Reviews

All 5 PRs received two rounds of judgment-day adversarial review. All rounds approved.

## Key Gate Catches (Issues Caught and Resolved During Review)

| PR | Gate Finding | Resolution |
|----|-------------|------------|
| PR2 | CRITICAL: `metaLabel` in VM produced `'—'` but spec said `'Sin meta'`; display-label parity mismatch | ARTIFACT AUTHORITY RULE applied: design D-22 specified screen-layer 'Sin meta' from `sinMeta` flag; VM produces '—' for `metaBp: null`. Tests correctly pin screen behavior. Documented deviation. |
| PR3 | CRITICAL: vacuous "status-reclasificar outlives moved row" test asserted before reclassify control existed; optional `onReclasificado?`/`onMovida?` props were banned silent-noop variant (us-044 case-law) | Test restructured to assert ancestry (status region outside groups map) + presence-when-empty. Optional callback props removed from GrupoMovimientosMobile in PR3; added as required props in PR4 when real trigger landed. |
| PR4 | CRITICAL: `MDET-05 S7` (coverage gap for "status region outlives moved row" content-survival scenario) was missing from ReclasificarMobileControl spec | Test added to BucketDetalleScreen.spec.tsx exercising full refetch + row removal + status region persistence. |
| PR5 | CRITICAL: unscoped header assertion matched sibling routes; signed total `'+$1.500.000'` vs spec's `'$1.500.000'` | Header assertion scoped to IngresosMesScreen container. ARTIFACT AUTHORITY RULE: design D-22 uses `formatearMontoConSigno` producing `'+$1.500.000'`; design wins over spec text. Tests pin `'+$1.500.000'`. |

## Arbitrated Decisions Now Canonical

| Decision | Canonical Resolution |
|----------|---------------------|
| Screen-owned state machines | BucketDetalleScreen and IngresosMesScreen own fetch lifecycle (three-tag machine, `cargar`, `useFocusEffect`); route files (`bucket/[bucket].tsx`, `ingresos.tsx`) are thin wrappers. Pattern matches `categoria/[id].tsx`. |
| VM raw wire keys, display labels at component layer | `aDetalleBucketMesViewModel` produces `bucket` (raw wire key, e.g. `"Deseos"`); `ETIQUETA_BUCKET` resolution to display label (e.g. `"Gustos"`) happens at the component layer. No `etiquetaBucket` field in the VM. |
| Screen-owned announcements | `ReclasificarMobileControl` never calls `AccessibilityInfo` directly. It calls `onMovida(ETIQUETA_BUCKET[bucketNuevo])`. The screen (`BucketDetalleScreen`) owns the `AccessibilityInfo.announceForAccessibility` call and the `status-reclasificar` region. |
| Settled announcements (us-055 D-04 lesson carried forward) | `announceForAccessibility` fires only AFTER the PATCH settles ok — not optimistically. Asserted as "not called before PATCH resolves". |
| Signed totals web parity | M2 total displayed as `'+$1.500.000'` via `formatearMontoConSigno` (design D-22 wins over spec's unsigned literal). Pinned in tests. |
| Focus stale-guard placement | `useFocusEffect` lives in the screen component (not the route); RNTL verifies mount-load; blur→refocus stale-guard is Maestro-only (per D-18 and ADR-017). |

## T-18 Living-Spec Disposition

T-18 was correctly deferred to archive-time (per US-054/US-055 precedent). Executed at archive (2026-08-20):

- **CREATED** `openspec/specs/mobile-detalle-mes/spec.md` — full living spec from delta (MDET-01..07, 30 scenarios). Purpose section added covering M1 + M2 screens, web parity references, and change provenance.
- **MODIFIED** `openspec/specs/mobile-resumen-screen/spec.md` — MOB-08 replaced: inert legend rows (US-050 binding decision 2) superseded by pressable Pressable rows with three navigation targets (spend-bucket → M1, SinCategoria → M1 with destacar param, Ingresos → M2). 10 new scenarios added (navigation path pins, wire-key routing, donut SVG remains decorative, accessibilityRole="button" on all 5 rows). Provenance note added inline.

## Archive Contents

- `proposal.md` — present
- `specs/mobile-detalle-mes/spec.md` — present (new domain delta)
- `specs/mobile-resumen-screen/spec.md` — present (MOB-08 delta)
- `design.md` — present
- `tasks.md` — present (T-00..T-17 all ✅; T-18 correctly marked DEFERRED, now resolved)
- `archive-report.md` — this file

## Task Ledger

All 17 code tasks (T-00..T-17) marked ✅. T-18 deferred to archive per design §3 — resolved in this archive step. No stale unchecked implementation tasks remain.

## Source of Truth Updated

- `openspec/specs/mobile-detalle-mes/spec.md` — NEW capability (M1 bucket detail + M2 ingresos for mobile)
- `openspec/specs/mobile-resumen-screen/spec.md` — MOB-08 now reflects pressable legend rows with navigation
