# Archive Report: US-059 — Web: Upload Cartola + Editable Review Preview

**Change**: `us-059-import-preview-web`
**Issue**: #293 · Sprint-15 · epic:gestion-datos
**Status**: ARCHIVED — Complete and verified
**Archived on**: 2026-08-22

---

## Executive Summary

US-059 successfully delivered the web preview→review→commit import flow in 3 stacked PRs (#461–#463) merged to main (head `74dafdd0`). The web becomes the first consumer of the canonical `POST /api/ingestas/preview` + `POST /api/ingestas/commit` backend contract shipped by US-057. All 11 requirements (WEB-PRV-01..11) and 12 design decisions (D-01..D-12) are traced to passing tests; verify returned PASS with 0 CRITICAL and 0 WARNING. 5 binding product decisions are implemented as decided. The living specification is promoted to `openspec/specs/web-import-preview/spec.md` and `openspec/specs/ingesta-preview-commit/spec.md` is annotated with US-059 as the first client consumer.

---

## Delivery Trail

### 3 Chained PRs (stacked-to-main strategy)

| PR | Slice | Content | Main commit |
|----|-------|---------|-------------|
| #461 | PR1 — API layer | Hardened canonical guard (`esPreviewIngestaDto` requires `filas`+`resumen`), `postCommitIngesta`, `useCommitIngesta` (router-agnostic), `PreviewIngestaDtoConCanonicos` + `CatalogoEstado` types | `2d27c5f7` |
| #462 | PR2 — Components | `FilaRevision` (new UI-only bucket component, sparse overlay discipline), `PreviewMuestra` rewrite (canonical props, banco header, valid `<dl>`, catalog affordances), `CampoSelect.srOnly`, shared test fixtures; non-behavioral `SubirCartola` stub | `0513581b` |
| #463 | PR3 — Flow switch | `SubirCartola` state-machine rewrite (controlled edits Map, D-11 commit-error preserves, call-site navigation, exito focus), scoped jsx-a11y error ESLint block, suite rewrite + coverage restoration | `74dafdd0` |

---

## Judgment Day Rounds

| Phase | JD Rounds |
|-------|-----------|
| Planning (design + spec) | 3 |
| PR1 | 2 |
| PR2 | 3 |
| PR3 | 2 |

---

## Product Decisions (5 binding)

| # | Decision | Implementation |
|---|----------|----------------|
| 1 | Duplicate rows greyed + badge + DISABLED selects | `FilaRevision.tsx:L121-158` — `opacity-50` + `<Badge>Duplicado</Badge>` + both `<CampoSelect disabled>` |
| 2 | Commit allowed with unassigned rows (no blocking gate) | `handleConfirmar` in `SubirCartola.tsx:L164-187` — no guard on empty categoriaId; sparse overlay allows null |
| 3 | Straight-to-dashboard post-commit (no success panel) | `navigate({to:'/'})` in `onSuccess` callback at call site (L179); D-01 exito is minimal transient render |
| 4 | Full list, no pagination | `PreviewMuestra.tsx:L87-103` — `filas.map(FilaRevision)` unsliced; test confirms no pagination controls |
| 5 | Commit error preserves preview + edits | `error` removed from `pickerGateado` gate; `mostrarPreview` logic keeps section rendered on commit error (D-11) |

---

## Design Decisions (D-01..D-12)

| # | Decision |
|---|----------|
| D-01 | `EstadoSubida` union renamed `subiendo→committing`; `exito` minimal render (no blank screen on slow navigate) |
| D-02 | `File` + `edits: Map<number, string|null>` in component state; both cleared on `handleFileChange` and `handleDescartar` |
| D-03 | `edits` as `Map<number, string|null>`; sparse serialization via `Array.from(edits, ...)` (only touched rows) |
| D-04 | `postCommitIngesta`: `FormData` with `file` + always-present `edits` JSON string (even if empty array); mirrors `postIngesta` status mapping |
| D-05 | `useCommitIngesta`: invalidates 4 query keys (`['resumen']`, `['resumen-anual']`, `['detalle-bucket-mes']`, `['ingestas']`); `navigate` wired at the `SubirCartola` call site, not inside the hook |
| D-06 | Bucket select is UI-filter only; only `categoriaId` reaches the overlay (bucket derived server-side) |
| D-07 | `useCategorias` co-fetched on mount; table renders even if catalog is pending/error (degraded catalog affordance) |
| D-08 | Hardened `esPreviewIngestaDto` → `PreviewIngestaDtoConCanonicos` intersection type → zero `!` assertions on `.filas`/`.resumen` |
| D-09 | No new npm deps, no new shadcn components (only existing `<Badge>` and `CampoSelect`) |
| D-10 | Accessible compound sr-only labels (`"Fila N: bucket"` / `"Fila N: categoría"`); duplicate selects `disabled`; scoped eslint jsx-a11y error-level block |
| D-11 | Commit error preserves preview+edits; `error` removed from `pickerGateado` (two simultaneous changes) |
| D-12 | Container-presentational decomposition: `SubirCartola` (stateful) → `PreviewMuestra` (presentational) → `FilaRevision` (row, local `bucketUI` only) |

---

## Verification Outcome

**Status: PASS — 0 CRITICAL · 0 WARNING · 2 SUGGESTION**

Verified on main at `74dafdd0` (PR3 #463 merged).

| Gate | Result |
|------|--------|
| `pnpm web test` | PASS — 116 test files, 1268 tests, 0 failures |
| `pnpm web typecheck` | PASS — `tsr generate && tsc -b` exits 0 |
| `pnpm web lint` | PASS — 0 errors (1 pre-existing warning in unrelated file) |
| Playwright E2E (CI) | PASS — full CI green including E2E for the new flow |
| Task completion | PASS — 21/21 tasks checked |
| T-00 precondition | PASS — US-058 archive at `5e7a87b1` confirmed on main |

### Requirements Traced

| Requirement | Status |
|-------------|--------|
| WEB-PRV-01 — file upload + loading state | PASS |
| WEB-PRV-02 — resumen header + full editable row table | PASS |
| WEB-PRV-03 — guard rejects legacy shape | PASS |
| WEB-PRV-04 — duplicate rows greyed + badge + disabled selects | PASS |
| WEB-PRV-05 — bucket→categoría cascade from user's own catalog | PASS |
| WEB-PRV-06 — "Agregar transacciones" commits with sparse edits overlay | PASS |
| WEB-PRV-07 — "Descartar" resets state and navigates to / | PASS |
| WEB-PRV-08 — preview errors with descriptive message + retry | PASS |
| WEB-PRV-09 — per-row accessible labels, jsx-a11y clean | PASS |
| WEB-PRV-10 — responsive tablet layout T1/T2 | PASS |
| WEB-PRV-11 — legacy one-shot flow untouched | PASS |

### Carried Suggestions (non-blocking, for future work)

- **S-01**: T-18 a11y assertion uses structural `getByLabelText` checks rather than `vitest-axe` (not installed). Installing `vitest-axe` in a future sprint would elevate coverage to automated WCAG 2.2 AA checks per ADR-018.
- **S-02**: `PreviewMuestra.test.tsx` tests the full list at 5 rows (not the 250-row scenario from WEB-PRV-02). A scale test at ~250 rows would confirm the no-virtualization decision (product decision 4) under realistic load.

---

## Spec Reconciliation (this archive)

### Delta Specs → Living Specs

| Location | Action | Details |
|----------|--------|---------|
| `openspec/specs/web-import-preview/spec.md` | **CREATED** | New canonical spec for the web import preview capability (WEB-PRV-01..11, all scenarios). Requirements carried verbatim from the change's `spec.md`. |
| `openspec/specs/ingesta-preview-commit/spec.md` | **UPDATED** | Added "Client Consumers" section: US-059 web is now the first consumer (main `74dafdd0`); mobile path remains deprecated one-shot until US-061. "Out of Scope" text revised to drop US-059 and retain only mobile/US-061. |

---

## Traceability (Engram Observations)

| Artifact | Topic Key | Observation ID |
|----------|-----------|----------------|
| Proposal | `sdd/us-059-import-preview-web/proposal` | (search by topic key) |
| Spec | `sdd/us-059-import-preview-web/spec` | (search by topic key) |
| Design | `sdd/us-059-import-preview-web/design` | (search by topic key) |
| Tasks | `sdd/us-059-import-preview-web/tasks` | #956 |
| Verify Report | `sdd/us-059-import-preview-web/verify-report` | #966 |
| Archive Report | `sdd/us-059-import-preview-web/archive-report` | #967 (updated by this archive) |

---

## Artifact Movement

The entire change folder is relocated from:

```
openspec/changes/us-059-import-preview-web/
```

to:

```
openspec/changes/archive/2026-08-22-us-059-import-preview-web/
```

Contents archived with full structure (byte-identical move via git):
- `proposal.md`
- `spec.md`
- `design.md`
- `tasks.md`
- `archive-report.md` (this document)

### Canonical Specifications Created/Updated

**New spec**:
```
openspec/specs/web-import-preview/spec.md
```

Describes the live web capability: two-phase preview→review→commit import flow consuming the US-057 backend contract, with editable classification overlay, accessible per-row selects, commit-error preservation, and strict ADR-024 boundary enforcement.

**Updated spec**:
```
openspec/specs/ingesta-preview-commit/spec.md
```

"Client Consumers" section added above "Out of Scope". US-059 web recorded as the first consumer of the canonical preview+commit endpoints. Mobile path remains on the deprecated one-shot until US-061.

---

## Out of Scope (Deferred)

- **Physical removal of `POST /api/ingestas`** — deprecated endpoint stays live; removal tracked by US-061.
- **Mobile import preview** — mobile still uses the one-shot flow (ADR-026); tracked by US-061.
- **Row exclusion** — the edits overlay can only reassign classification, not skip a row.
- **vitest-axe WCAG integration** — carried as S-01 suggestion for a future sprint.
- **250-row scale test** — carried as S-02 suggestion; product decision 4 (no pagination) holds.

---

## SDD Cycle Complete

- Proposal reviewed and approved (product decisions 1–5 locked)
- Specification written (WEB-PRV-01..11) and promoted to `openspec/specs/web-import-preview/spec.md`
- Design decisions documented (D-01..D-12) and verified in code
- Tasks executed in 3 stacked PRs (21 tasks, all checked, strict TDD RED→GREEN)
- Implementation verified (PASS, 0 CRITICAL, 0 WARNING, 1268 tests green)
- Canonical capability spec lives at `openspec/specs/web-import-preview/spec.md`
- Backend consumer note added to `openspec/specs/ingesta-preview-commit/spec.md`
- Archive persisted (main head `74dafdd0`, 2026-08-22)

**The us-059-import-preview-web change is fully closed.**

All code is live in production. The web import flow now uses the two-phase preview→review→commit interaction with per-row editable classification, full accessibility compliance, and strict ADR-024 boundary enforcement. Mobile import (US-061) and legacy endpoint removal (US-061) can proceed without web changes.
