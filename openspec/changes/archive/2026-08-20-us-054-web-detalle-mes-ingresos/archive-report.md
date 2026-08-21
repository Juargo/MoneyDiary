# Archive Report — us-054-web-detalle-mes-ingresos

**Status**: ARCHIVED
**Date**: 2026-08-20
**Change**: us-054-web-detalle-mes-ingresos (US-054, issue #288, Sprint-15)
**Branch**: `docs/archive-us-054` (base: `main` @ f24c8452 — merge of PR #436, the verified state)
**Mode**: hybrid (openspec filesystem + Engram)

## What Was Archived

| Artifact | Path | Complete |
|----------|------|----------|
| Proposal | `proposal.md` | ✅ |
| Delta specs | `specs/web-app/spec.md` | ✅ |
| Design | `design.md` | ✅ |
| Tasks | `tasks.md` | ✅ 19/19 tasks complete |
| Verify report | `verify-report.md` | ✅ PASS — 0 findings |

---

## Verify Outcome

**Verdict**: PASS at `main` @ f24c8452 — 1199/1199 unit tests pass, 66/66 e2e tests pass, tsc clean, 0 CRITICAL findings, 0 WARNING findings, 0 SUGGESTION findings.

**Suite results at archive:**

| Suite | Result |
|-------|--------|
| Unit + integration | 112 files, 1199 tests — all passed |
| TypeScript | 0 errors |
| ESLint | 0 errors; 2 warnings (pre-existing, unrelated) |
| e2e (Playwright) | 66 passed, 63 skipped (pre-existing, unrelated to US-054) |

**US-054 e2e cases (all 5 PASSED):**

1. `[escritorio]` deep link header + table + Origen tags
2. `[escritorio]` prev arrow → URL 2026-06, refetches (WDI-03, network-level proof via `waitForResponse`)
3. `[escritorio]` empty month 2026-05 → $0 / 0 ingresos / Empty copy / operable arrows
4. `[escritorio]` legend Ingresos row → `/ingresos?periodo=2026-07`
5. `[tablet]` T2 header + table geometry at 880px (rendered boxes, never className)

**JD verdicts:**

- PR2 APPROVED after 3 JD rounds (obs #872):
  - **JD-PR2 vacuous-fallback-test fixed**: case 9 (undefined periodo fallback) was genuinely vacuous
    because `renderPagina`'s destructuring default swallowed `undefined`. Fixed by using `renderConRouter`
    directly with a September 2026 `vi.setSystemTime` clock (distinct from the July default), making the
    test properly falsifiable — the September clock cannot equal the July default.
- PR3 APPROVED after 2 JD rounds (obs #875):
  - **JD-PR3 e2e improvements**: case 2 gained `waitForResponse` armed before the click (network-level
    refetch proof, not just URL assertion); case 1 gained explicit assertions for all 3 Origen badges
    (BCI, Manual, BancoEstado); stub had a phantom `periodo` field removed from the fixture object;
    LIFO ordering comment was rewritten truthfully (stub order, not LIFO mechanics).

---

## Task Completion (19 / 19)

All 19 tasks checked `[x]` in `tasks.md`. No stale-checkbox reconciliation required.

| PR | Tasks | SHAs |
|----|-------|------|
| PR1 (#430) | T-01..T-08 | 3ba7bcf2 · 11536c2 · d44429b · bf0ec76 · 9a01337 · 6e7a00a · 8e4c518 |
| PR2 (#435) | T-09..T-12 | 2984b884 |
| PR3 (#436) | T-13..T-19 | 28ba8db |

---

## Spec Sync (delta → living)

| Capability | Action | Details |
|------------|--------|---------|
| `web-app` | MODIFIED — WG5-03 | Ingresos row updated from "not clickable" to clickable/navigating to `/ingresos`; added `(Previously: ...)` clause |
| `web-app` | MODIFIED — WG5-06 | Requirement renamed and rewritten: Ingresos now navigates to `/ingresos`; US-047 interim comment removal mandated; `(Previously: ...)` clauses preserved |
| `web-app` | MODIFIED — WG5-12 | Ingresos row added to keyboard-operable set; file list updated to `D-05`/`D-08`; "never reached by Tab" clause replaced with Tab-reachable behavior; `(Previously: ...)` clause added; US-054 WDI-07 cross-ref added |
| `web-app` | ADDED — WDI-01..WDI-08 | New `## Detalle MES-INGRESOS — Income detail page (/ingresos)` section inserted between WG5-13 and `## Web Tabla Anual`; 8 requirements + 20 scenarios total |

**Requirements preserved byte-identical (not mentioned in delta):**

All other requirements outside WG5-03/WG5-06/WG5-12 were left untouched:
WCAT-01..05, WDM-01..08, WCTG-01..14, WCTM-01..06, WCFG-* (referenced but not restated), WPER-01..07,
WMYP-01..08, WG5-01/WG5-02/WG5-04/WG5-05/WG5-07/WG5-08/WG5-09(removed note)/WG5-10/WG5-11/WG5-13,
WSEM-01..08, WTA-01..*, and all later sections.

**No destructive merge required** — WG5-03/WG5-06/WG5-12 were modified in-place with `(Previously: ...)`
clauses retained for audit traceability. WDI-01..08 is a purely additive section.

---

## Engram Traceability (project: moneydiary)

| Artifact | Observation ID |
|----------|----------------|
| proposal | (no separate engram artifact — openspec file) |
| spec (delta) | (no separate engram artifact — openspec file) |
| design | (no separate engram artifact — openspec file) |
| tasks | (no separate engram artifact — openspec file) |
| verify-report | (no separate engram artifact — openspec file) |
| archive-report | `sdd/us-054-web-detalle-mes-ingresos/archive-report` (this observation) |

Note: This change was managed in hybrid mode (openspec files + Engram final archive report only). All
proposal/spec/design/tasks/verify artifacts live in the archived openspec folder, not separately in Engram.

---

## Implementation Summary

**3 PRs merged to origin/main** (stacked-to-main chain):

1. **PR1** (#430) — Client plumbing + domain helpers (T-01..T-08)
   - api-client DTO aliases (`IngresosMesDto`, `TransaccionIngresosMesDto`)
   - web re-export + `esIngresosMesDto` guard + `fetchIngresosMes` fetcher
   - `useIngresosMes` hook (queryKey `['ingresos-mes', periodo ?? 'actual']`)
   - `periodoActual()` helper in `domain/periodo.ts`
   - `aFechaCorta` helper in `domain/fecha.ts`
   - `ingresos-mes-view-model.ts` (pure passthrough, 10-case suite)
   - Stale-docblock cleanup

2. **PR2** (#435) — The page (T-09..T-12) — after JD round 3
   - `IngresosMesTable.tsx`: semantic `<table>` + `<caption>` + `<th scope="col">` × 4 + Origen Badge
   - `IngresosMesPage.tsx`: router-agnostic page with loading/error/retry/empty/data states
   - `routes/_authenticated/ingresos.tsx`: thin route wiring with `validateSearch`
   - `eslint.config.js`: US-054 a11y scope block

3. **PR3** (#436) — Dashboard flip + e2e (T-13..T-19) — after JD round 2
   - `api-stubs.ts`: `INGRESOS_MES_FIXTURE` + stub ordering (WDI-08)
   - `LeyendaGasto.tsx`: `FilaIngreso` → `<button>` + `onSelectIngresos` prop
   - `ResumenScreen.tsx`: Ingresos added to `controlesEsperados` focusable set
   - `ResumenPage.tsx`: `onSelectIngresos` threaded
   - `routes/_authenticated/index.tsx`: `navigate({ to: '/ingresos', search: { periodo } })`
   - `PeriodoSelector.tsx`: local `periodoActual` renamed to `mesActual` (D-01 footgun)
   - `e2e/ingresos-mes.e2e.ts`: 5-case e2e suite

**Final test count**: 1199/1199 unit + 66/66 e2e (56 unit/integration net new + 5 e2e net new)
**Scope boundary**: 3 PRs touch only `apps/web`, `packages/api-client`. Zero changes to `apps/api`,
`apps/mobile`, `openapi.json`, or Prisma schema.

---

## Design Decisions Spot-Check

| Decision | Evidence | Status |
|---|---|---|
| D-01 `periodoActual()` | Thin zero-arg helper in `domain/periodo.ts` delegating to `periodoActualUTC(new Date())` | PASS |
| D-02 `aFechaCorta` | `fechaIso.slice(0, 10)` — TZ-safe, guarded by `esFechaValida` upstream | PASS |
| D-03 conteoLabel | `conteo === 1 ? '1 ingreso' : \`${conteo} ingresos\``; `0` → plural | PASS |
| D-04 Semantic table | `<table>` + `<caption className="sr-only">` + 4×`<th scope="col">` + rows keyed by `tx.id` | PASS |
| D-05 WG5-06 flip | `onSelectIngresos: () => void` on `LeyendaGasto`; `FilaIngreso` is `<button>`; threaded through ResumenScreen → ResumenPage → index.tsx | PASS |
| D-06 Client plumbing | Type aliases in `packages/api-client`; re-export in `types.ts`; guard + fetch; queryKey `['ingresos-mes', periodo ?? 'actual']` | PASS |
| D-07 Non-change | No `categorias-invalidacion.ts`/`use-ingesta.ts`/`use-eliminar-ingesta.ts` touches | PASS |
| D-08 a11y lint gate | Scoped ESLint ERROR block for US-054 files; `LeyendaGasto`/`ResumenScreen` already in US-047 block | PASS |
| D-09 No vitest-axe | a11y proof via scoped eslint-jsx-a11y + role/scope/accname assertions + Playwright T2 geometry | PASS |
| D-10 Back control LOCKED | `Link to="/" search={{ periodo }}` "Volver al resumen"; `px-2 py-1` + focus classes; NOT BotonVolver | PASS |

---

## Scope Verification

- No files under `apps/api/**` were modified.
- No files under `apps/mobile/**` were modified.
- No `openapi.json` changes.
- No Prisma migrations introduced.
- `packages/api-client/src/index.ts` — +2 additive type aliases (`IngresosMesDto`, `TransaccionIngresosMesDto`).
- No new runtime dependencies introduced (all helpers are pure TypeScript in existing modules).

---

## Known Debts (Recorded, Not Blocking)

1. **Pre-existing lint warnings**: 2 warnings from `EliminarIngestaControl.tsx:128` and
   `ReclasificarCategoriaControl.tsx:224` (`jsx-a11y/no-noninteractive-element-interactions`) — pre-existing,
   not in US-054 scope.
2. **GrupoMovimientos.tsx raw-ISO display**: The US-053 twin bucket page renders raw ISO timestamps without
   `aFechaCorta` — registered as a separate display-consistency follow-up (D-02 migration note, 3 legacy
   slice sites). Out of scope for US-054.
3. **Tablet geometry tolerance**: e2e case 5 uses `≤5px` tolerance for breadcrumb/back-control vertical
   alignment at 880px (4px observed in practice). Accepted as an implementation artifact within WCAG's
   bounding-box measurement conventions.
4. **JD-PR2 vacuous-fallback-test**: Fixed in JD round 2 using September 2026 clock (distinct from July
   default). The fix is a stronger test — the debt is now closed, not carried forward.

---

## Notes

- This change completes the web income drill-down: clicking the Ingresos legend row on the dashboard now
  navigates to `/ingresos`, which renders the full income detail for the selected month.
- All 3 PR slices landed on `main` and are in production at `main` @ f24c8452.
- Issue #288 closed linking the PR chain (#430 / #435 / #436).
- WG5-03, WG5-06, and WG5-12 in the living `openspec/specs/web-app/spec.md` now reflect the final state.
- WDI-01..08 added as a new living section in `openspec/specs/web-app/spec.md`.

---

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived.
Ready for the next change.
