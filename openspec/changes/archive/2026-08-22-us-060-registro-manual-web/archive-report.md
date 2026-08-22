# Archive Report: US-060 — Web: formulario de ingreso manual

**Change**: `us-060-registro-manual-web`
**Issue**: #294 · Sprint-15 · epic:gestion-datos
**Status**: ARCHIVED — Complete and verified
**Archived on**: 2026-08-22

---

## Executive Summary

US-060 successfully delivered the web manual-entry form in 2 stacked PRs (#465–#466) merged to main (head `110407f3`). The web becomes the first consumer of the `POST /api/movimientos` backend contract shipped by US-058. All 12 requirements (WEB-REG-01..12) and 15 design decisions (D-01..D-15) are traced to passing tests; verify returned PASS with 0 CRITICAL, 0 WARNING, 0 SUGGESTION — the first perfect verify of the sprint. 4 binding product decisions are implemented as decided. The living specification is promoted to `openspec/specs/web-registro-manual/spec.md` and `openspec/specs/movimiento-manual/spec.md` is annotated with US-060 as the first client consumer.

---

## Delivery Trail

### 2 Chained PRs (stacked-to-main strategy)

| PR | Slice | Content | Main commit |
|----|-------|---------|-------------|
| #465 | PR1 — API layer | `hoyLocal()` (TZ-correct today — the naive UTC slice yields tomorrow for Chile evenings), `api/movimientos.ts` (discriminated input union, `postMovimientoManual` with 400-no-body handling, `esRegistrarMovimientoManualDto`), `useRegistrarMovimiento` (4-key invalidation, router-agnostic), fixtures | `608be8e9` |
| #466 | PR2 — The page | `RegistrarMovimientoForm` (type-first; predicate-narrowed `construirBody` — zero `as`/`!`; cascade disabled-in-DOM; triple submit guard; full success reset; demo-disabled), `/registrar` route + "Registrar" nav item, scoped jsx-a11y `error` block, `vitest-axe` adoption (closes the suggestion carried from US-059's verify) | `110407f3` |

---

## Judgment Day Rounds

| Phase | JD Rounds | Key findings |
|-------|-----------|--------------|
| Planning (design + spec) | 3 | 3 CRITICAL caught: false validator semantics (esMontoStringValido accepts negatives/zero), ISO-vs-short-date response format mismatch, fabricated precedent; + timezone bug (aFechaCorta yields tomorrow for Chile evenings) |
| PR1 | 2 | Cleanest PR of the sprint |
| PR2 | 3 | CRITICAL: design-rejected `as BucketAsignable` cast; vacuous/trivially-true test classes |

---

## Product Decisions (4 binding)

| # | Decision | Implementation |
|---|----------|----------------|
| 1 | New `/registrar` route (deep-linkable, own semantic home — not a tab/modal) | `apps/web/src/routes/_authenticated/registrar.tsx` using `createFileRoute('/_authenticated/registrar')` |
| 2 | Post-save: form CLEARS + inline confirmation + "Ir al dashboard" link always-present, no auto-navigation | `onSuccess` clears all 6 fields; `role="status"` confirmation; plain `<a href="/">` outside any conditional; no `router.navigate()` in hook or component |
| 3 | New "Registrar" main-nav item at same level as "Subir nuevo archivo" | `nav-items.ts`: `{ kind:'link', label:'Registrar', to:'/registrar', icon:PencilLine }` placed immediately after `/subir` entry |
| 4 | Demo proactively disabled with notice (no futile write requests) | `role="note"` `MENSAJE_DEMO_REGISTRAR`; all fields `disabled={esDemo || ...}`; submit guard early-returns on `esDemo` |

---

## Design Decisions (D-01..D-15)

| # | Decision |
|---|----------|
| D-01 | Per-field `useState` + discriminated request builder `construirBody()` — Ingreso arm structurally cannot include `bucket`/`categoriaId` |
| D-02 | `handleTipoChange` zeroes `bucketUI`/`categoriaId` synchronously on every tipo switch (not a bare `setTipo`, not a `useEffect`) |
| D-03 | Monto: `<input type="text" inputMode="numeric">` inside raw `<label>`; `esMontoManualValido` wraps `esMontoStringValido` + `!startsWith('-')` + `!== '0'` |
| D-04 | `hoyLocal()` via `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' })` — TZ-correct for Chile (aFechaCorta yields tomorrow during Chile evenings) |
| D-05 | `useRegistrarMovimiento`: invalidates `['resumen']`, `['resumen-anual']`, `['detalle-bucket-mes']`, `['ingresos-mes']`; router-agnostic (no navigation in hook) |
| D-06 | `postMovimientoManual` in `movimientos.ts`: JSON-body POST; 400 → fixed message WITHOUT reading body (endpoint sends `content?: never`); mirrors `postReclasificarCategoria` doctrine |
| D-07 | `RegistrarMovimientoManualInput` discriminated union; `esBucketAsignable` type predicate narrows `bucketUI` — zero `as`/`!` |
| D-08 | Gasto cascade reuses `FilaRevision` pattern at form level; `useCategorias` co-fetched on mount; catalog error KEEPS state if cascade was already complete |
| D-09 | Cascade focus: `cascadaRef` container + `useEffect([tipo])` → `querySelector('select')?.focus()` when `tipo==='Gasto'` |
| D-10 | Dual feedback regions: `aria-live="polite"` for success + `role="alert"` for error; success resets all 6 fields (tipo→Ingreso, fecha→hoyLocal()); triple guard `esDemo || mutation.isPending || isSubmittingRef.current` |
| D-11 | Demo: proactively disabled — every field `disabled={esDemo || ...}`; `MENSAJE_DEMO_REGISTRAR` notice; handler early-returns |
| D-12 | Route thin container: `createFileRoute`, reads `esDemo`, renders form; logic-free, untested (needs live router context) |
| D-13 | Nav: `PencilLine` icon (lucide, ADR-027) after `/subir` entry in `NAV_ITEMS` single-source |
| D-14 | ESLint: scoped `error`-level `jsx-a11y` block for `RegistrarMovimientoForm.tsx` + `registrar*.tsx` |
| D-15 | Single stateful component; no sub-components (YAGNI — form is one cohesive unit); `CampoTexto`/`CampoSelect` reused as-is |

---

## Verification Outcome

**Status: PASS — 0 CRITICAL · 0 WARNING · 0 SUGGESTION**

Verified on main at `110407f3` (PR2 #466 merged).

| Gate | Result |
|------|--------|
| `pnpm web test` | PASS — 119 suites / 1312 tests, 0 failures, 0 skipped |
| `pnpm web typecheck` | PASS — `tsr generate && tsc -b` exits 0 |
| `eslint RegistrarMovimientoForm.tsx registrar.tsx` | PASS — exit 0, zero a11y errors |
| Task completion | PASS — 16/16 tasks checked (T-00 through T-16) |
| T-00 precondition | PASS — US-058 + US-059 archive commits confirmed on main |

### Requirements Traced

| Requirement | Status |
|-------------|--------|
| WEB-REG-01 — `/registrar` route + nav item | PASS |
| WEB-REG-02 — type-first + `hoyLocal` fecha default + max | PASS |
| WEB-REG-03 — Ingreso branch zeroing + no stray fields | PASS |
| WEB-REG-04 — Gasto cascade + catalog error states | PASS |
| WEB-REG-05 — client-side pre-validation before fetch | PASS |
| WEB-REG-06 — double-submit guard (`isSubmittingRef`) | PASS |
| WEB-REG-07 — 201 success: form clears + confirmation + 4 keys invalidated | PASS |
| WEB-REG-08 — error preserves all input | PASS |
| WEB-REG-09 — demo session disables form completely | PASS |
| WEB-REG-10 — `esRegistrarMovimientoManualDto` response guard | PASS |
| WEB-REG-11 — accessible labels + cascade focus + jsx-a11y ESLint enforcement | PASS |
| WEB-REG-12 — `/subir` regression: upload flow untouched | PASS |

---

## Spec Reconciliation (this archive)

### Delta Specs → Living Specs

| Location | Action | Details |
|----------|--------|---------|
| `openspec/specs/web-registro-manual/spec.md` | **CREATED** | New canonical spec for the web manual-entry capability (WEB-REG-01..12, all scenarios, ADR-024 boundary). Requirements carried faithfully from the change's `spec.md`. |
| `openspec/specs/movimiento-manual/spec.md` | **UPDATED** | Added "Client Consumers" section: US-060 web is the first consumer of `POST /api/movimientos` (main `110407f3`). |

---

## Traceability (Engram Observations)

| Artifact | Topic Key | Observation ID |
|----------|-----------|----------------|
| Proposal | `sdd/us-060-registro-manual-web/proposal` | #971 |
| Spec | `sdd/us-060-registro-manual-web/spec` | #972 |
| Design | `sdd/us-060-registro-manual-web/design` | #973 |
| Tasks | `sdd/us-060-registro-manual-web/tasks` | #976 |
| Verify Report | `sdd/us-060-registro-manual-web/verify-report` | #985 |
| Archive Report | `sdd/us-060-registro-manual-web/archive-report` | (this save) |

---

## Artifact Movement

The entire change folder is relocated from:

```
openspec/changes/us-060-registro-manual-web/
```

to:

```
openspec/changes/archive/2026-08-22-us-060-registro-manual-web/
```

Contents archived with full structure (byte-identical copy; git mv handles the move semantics):
- `proposal.md`
- `spec.md`
- `design.md`
- `tasks.md`
- `archive-report.md` (this document)

### Canonical Specifications Created/Updated

**New spec**:
```
openspec/specs/web-registro-manual/spec.md
```

Describes the live web capability: type-first manual-entry form consuming the US-058 backend contract, with Ingreso/Gasto branch rendering, bucket→categoría cascade from the user's own catalog, double-submit guard, success form-clear + dashboard invalidation, demo-disabled, and strict ADR-024 boundary enforcement.

**Updated spec**:
```
openspec/specs/movimiento-manual/spec.md
```

"Client Consumers" section added at end. US-060 web recorded as the first consumer of `POST /api/movimientos`. Mobile manual entry remains a separate future story.

---

## Notable Technical Achievements

- **Timezone-correct `hoyLocal()`**: JD planning round caught the UTC timezone bug before any code was written. `aFechaCorta(new Date().toISOString())` yields tomorrow for Chilean users in the evening (UTC-4); the new `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' })` helper fixes this correctly.
- **Zero `as`/`!` assertions**: `esBucketAsignable(v): v is BucketAsignable` type predicate replaces the design-rejected `as BucketAsignable` cast. `construirBody()` is the sole state→wire seam and the Ingreso arm structurally cannot include `bucket`/`categoriaId` at the TypeScript type level.
- **`vitest-axe` adopted**: closes suggestion S-01 carried from US-059's verify. WCAG 2.2 AA automated checks now run on both the Ingreso and Gasto renders.
- **Perfect verify**: first change in the sprint to achieve 0 CRITICAL / 0 WARNING / 0 SUGGESTION on the first verify run.

---

## Push Note

PR pushes used `--no-verify` per the documented local mobile-flake policy (ADR-020: hooks are convenience; CI is the gate). CI ran the full matrix green on #466.

---

## Out of Scope (Deferred)

- **Mobile manual entry** — mobile form is a separate future story.
- **Edit / delete of movements** — this change is single-movement creation only.
- **`/subir` restructuring** — the upload route is untouched; only the nav gains a sibling item.

---

## SDD Cycle Complete

- Proposal reviewed and approved (4 product decisions locked; 3 JD planning criticals caught and fixed)
- Specification written (WEB-REG-01..12) and promoted to `openspec/specs/web-registro-manual/spec.md`
- Design decisions documented (D-01..D-15) and verified in code
- Tasks executed in 2 stacked PRs (16 tasks, all checked, strict TDD RED→GREEN)
- Implementation verified (PASS, 0 CRITICAL, 0 WARNING, 0 SUGGESTION, 1312 tests green)
- Canonical capability spec lives at `openspec/specs/web-registro-manual/spec.md`
- Backend consumer note added to `openspec/specs/movimiento-manual/spec.md`
- Archive persisted (main head `110407f3`, 2026-08-22)

**The us-060-registro-manual-web change is fully closed.**

All code is live. The web app now allows users to register manual Ingresos and Gastos via `/registrar`. Dashboard queries are invalidated on success. The form is proactively disabled in demo sessions. Mobile manual entry (future story) and movement editing (future story) can proceed without web changes.
