# Archive Report: categoria-iconografia

**Change:** `categoria-iconografia`  
**Issue:** #679 (US-067)  
**Archive Date:** 2026-09-16  
**Status:** COMPLETE  

## Executive Summary

The `categoria-iconografia` change has been successfully archived. All delta specs have been merged into their corresponding main specs, the `categoria-icono` capability has been established as a new spec, and the change folder has been moved to the archive. The change delivered 8 slices across 14 chained PRs (#680–#693), all merged into `main` as tracker merge #694 on 2026-09-16. Final verification: **PASS WITH WARNINGS** (19/19 requirements, 56 scenarios, 0 CRITICAL).

## Spec Merges Summary

### New Spec Created
- **`categoria-icono`** (CATICO-01 through CATICO-08): Defines curated icon allowlist, validation semantics on create/update, default seeding, ownership isolation, client fallback rendering, cross-client allowlist parity, and accessible-name requirements for icon pickers and badges.

### Specs Modified

#### 1. **bucket-detalle-mes**
- **MODIFIED MBD-02**: Added `icono` field to category groups + scenario for null icono rendering fallback

#### 2. **catalogo-clasificacion-ownership**
- **ADDED**: CategoriaDto and catalog create/update endpoints carry the optional icono field (3 scenarios)

#### 3. **mobile-configuracion**
- **MODIFIED MCTG-01**: Added bucket-colored icon badge + 2 new scenarios (icon present/absent rendering)
- **MODIFIED MCTG-06**: Updated to reference 13 codes (was 12); added ICONO_INVALIDO mapping scenario
- **ADDED**: Category create/edit screens include an accessible icon picker (3 scenarios)

#### 4. **mobile-detalle-mes**
- **MODIFIED MDET-03**: Added bucket-colored icon badge in group header + 2 new scenarios (icon present/absent rendering on mobile detail screen)

#### 5. **web-app** (most complex)
- **MODIFIED WCTG-02**: Added bucket-colored icon badge on category rows + 2 new scenarios
- **MODIFIED WDM-03**: Added bucket-colored icon badge on category group headings + 2 new scenarios
- **REMOVED** old WCTG-12 (11 codes) → **ADDED** new WCTG-12 (12 codes, now includes ICONO_INVALIDO) + new scenario for ICONO_INVALIDO mapping
- **ADDED**: Category create/edit forms include an accessible icon picker (3 scenarios)

## Requirement Landing Map

| Spec | Requirements |
|------|--------------|
| categoria-icono | CATICO-01, CATICO-02, CATICO-03, CATICO-04, CATICO-05, CATICO-06, CATICO-07, CATICO-08 |
| bucket-detalle-mes | MBD-02 (MODIFIED) |
| catalogo-clasificacion-ownership | CategoriaDto/icono field (ADDED, no ID prefix in original) |
| mobile-configuracion | MCTG-01 (MODIFIED), MCTG-06 (MODIFIED), Icon picker (ADDED, no ID prefix) |
| mobile-detalle-mes | MDET-03 (MODIFIED) |
| web-app | WCTG-02 (MODIFIED), WCTG-12 (REMOVED + ADDED: rename, 11→12 codes), WDM-03 (MODIFIED), Icon picker (ADDED, no ID prefix) |

## Composer Notes

- **WCTG-12 rename handled correctly**: The REMOVED old WCTG-12 (11 codes) + ADDED new WCTG-12 (12 codes) pattern was applied exactly as specified. The title change from "11 codes" to "12 codes" is expressed as a rename (REMOVED + ADDED), not MODIFIED, because the exact canonical title is used for matching.
- **All icon badge requirements** consistently reference `categoria-icono CATICO-06` for the fallback icon pattern.
- **Web-app** has the most complex delta with both MODIFIED (WCTG-02, WDM-03) and REMOVED/ADDED (WCTG-12) patterns.
- **No composer warnings** — all merges applied cleanly, no conflicting requirement titles, no silent drops.

## Final State

### Implementation Delivered
- **Slices:** 8 across 14 PRs (#680–#693)
- **Verification:** **PASS WITH WARNINGS** — 19/19 requirements, 56 scenarios total, 0 CRITICAL findings
  - API: 2734 tests
  - Web: 2173 tests
  - Mobile: 930 tests
  - All typechecks clean
  - `openapi:check` and `api-client typecheck` clean
- **PR #690 carries an approved `size:exception`** (412 lines)

### Outstanding Items

#### Completed Post-Archive
- **Task 1.10 (prod migration)** is **DONE**: `20260915000000_categoria_icono` was applied to prod Supabase on 2026-09-16 via `prisma migrate deploy` (verified pending status beforehand), **BEFORE** #694 merged. `tasks.md` still shows unticked — this archive report records it as completed.

#### Non-Blocking Deferrals
1. **Manual Maestro gate (ADR-017)** for mobile slices #690/#691/#692: Not a merge blocker (mobile ships on `mobile-v*` tags). Gate pending on-device before future mobile release tag creation.
2. **Known follow-up** (recorded in `apply-progress.md`): Mobile detail passes the DTO group as prop while MDET-03 names the view model as the source. `GrupoDetalleMesViewModel.icono` has no production reader. Behaviour matches spec, data path does not — accepted deferred harmonization.

## Artifact Movement

```
Source:      openspec/changes/categoria-iconografia/
Destination: openspec/changes/archive/2026-09-16-categoria-iconografia/
Status:      ✓ Moved (verified diff clean)
```

New specs created under `openspec/specs/`:
- `categoria-icono/spec.md` (CATICO-01..08)

## Traceability

- **Change name:** categoria-iconografia
- **Issue:** #679
- **Tracker PRs merged:** #694
- **Implementation PRs:** #680, #681, #682, #683, #684, #685, #686, #687, #688, #689, #690, #691, #692, #693
- **Verification:** sdd-verify PASS WITH WARNINGS (2026-09-16)
- **Archive date:** 2026-09-16
- **Archived by:** sdd-archive (haiku model)

---

**Archive Report Status:** READY FOR DELIVERY  
**All deltas merged:** ✓  
**Change folder archived:** ✓  
**Spec inventory updated:** ✓  
