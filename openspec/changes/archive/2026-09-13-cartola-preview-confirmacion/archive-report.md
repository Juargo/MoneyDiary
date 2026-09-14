# Archive Report: cartola-preview-confirmacion

**Change**: `cartola-preview-confirmacion` (issue #295, preview portion only)
**Archived**: 2026-09-13 (merged to `main` at 2026-09-14T02:22:34Z UTC)
**Status**: Complete — 12 chain PRs merged to `main` through tracker PR #667

---

## Executive Summary

After processing a cartola, web and mobile show a summary and ask the user to choose
"Subir tal cual" or "Revisar y editar". Web gained a decision step in front of its existing
editable table. Mobile moved to the canonical preview + commit contract with a decision step,
a full virtualized row list, a tap-row classification sheet, and an `edits` overlay commit.
ADR-044 supersedes only ADR-038 rule 2 to authorize mobile pre-commit classification.

42/42 tasks complete. Verify: pass-with-warnings, 18/18 requirements, 48/48 scenarios
(45 compliant, 3 partial pending the manual device gate), 0 critical. Web is deployed to
production; mobile is not released.

---

## Specs Synced to Canonical

| Spec | Action | Requirements before → after | Notes |
|------|--------|------------------------------|-------|
| `mobile-import-preview` | Created | 0 → 13 | MOB-PRV-01..12 from the delta, plus MOB-PRV-13 added at archive (see spec gap below) |
| `web-import-preview` | Updated | 18 → 19 | MODIFIED WEB-PRV-02, WEB-PRV-06, WEB-PRV-07 (bodies and headings); ADDED WEB-PRV-19 |
| `ingesta-preview-commit` | Updated | 10 → 10 | MODIFIED DEP-01; "Client Consumers" prose and the mobile "Out of Scope" bullet updated by hand (not Requirement blocks) |
| `mobile-app` | Updated | 3 → 3 | MODIFIED MAC-01 (`commit-ingesta.ts` replaces `post-ingesta.ts`) |

**Composer note:** the web MODIFIED blocks used new titles, which `gentle-ai sdd-archive-compose`
cannot match (it matches the exact canonical heading). They were composed against the old
headings and the headings were then updated to the delta titles in the canonical spec. The
composer also inserted the prose "Client Consumers — MODIFIED" block in the middle of the
requirements; it was removed and the original "Client Consumers" section was rewritten instead.

**Spec gap synced at archive:** MOB-PRV-06/07/10 did not define catalog loading or failure on
mobile. MOB-PRV-13 records the shipped behavior: the list stays visible, the sheet cannot open
until the catalog is ready, and a failure shows an inline "Reintentar" error
(`apps/mobile/app/subir.tsx`, `apps/mobile/app/subir.spec.tsx`).

---

## Delivered Chain

| PR | Branch | Scope | Changed lines | Notes |
|----|--------|-------|---------------|-------|
| #655 | `feat/cartola-adr-docs` | ADR-044, ADR index, CLAUDE.md rows, spec consumers note | 241 | |
| #656 | `feat/cartola-mobile-preview-canonico` | Canonical preview guard, drop 10/25/50 selector | 440 | `size:exception` |
| #657 | `feat/cartola-mobile-commit-ingesta` | `commitIngesta`, as-is commit, delete `post-ingesta.ts` | 669 | `size:exception` |
| #658 | `feat/cartola-mobile-preview-cartola-helpers` | `esFilaEditable`, `categoriaEfectiva`, `aOverlayEdits` | 245 | |
| #659 | `feat/cartola-mobile-fila-revision` | `FilaRevisionMobile` | 297 | |
| #660 | `feat/cartola-mobile-lista-resumen` | `ListaRevision`, `ResumenDecision` | 348 | |
| #661 | `feat/cartola-mobile-decision-revision` | Screen: decision step + read-only review | 627 | `size:exception` |
| #662 | `feat/cartola-mobile-hoja-clasificacion` | `HojaClasificacion` (effect-free initial selection) | 563 | `size:exception` |
| #663 | `feat/cartola-mobile-edicion-hoja` | Catalog fetch + retry, sheet wiring, edits map | 442 | `size:exception` |
| #664 | `feat/cartola-mobile-edicion-commit` | Overlay commit, failure preserves edits, `useRef` guard, Maestro | 325 | |
| #665 | `feat/cartola-web-resumen-cartola` | Web: extract `ResumenCartola` | 227 | |
| #666 | `feat/cartola-web-paso-decision` | Web: decision step + e2e | 640 | `size:exception` |
| #667 | `feat/cartola-preview-confirmacion` | Tracker → `main` | — | Merge commit `4e011342` |

All 13 branches were deleted after the merge.

---

## Verification Evidence

- Mobile: `pnpm --filter @moneydiary/mobile test` 865/865, `tsc --noEmit` clean, lint 0 errors.
- Web: `pnpm web test` 2123/2123, `pnpm web typecheck` clean, `pnpm web lint` clean.
- Playwright (`subir-tal-cual`, `preview-stress`, `crear-categoria-preview`): 6 passed, 3 skipped
  (`tablet`, explicit pre-existing convention).
- CI green on #667 (web, mobile, E2E, CodeQL, Semgrep, security, Commitlint).
- No AI attribution in any commit of the chain.

---

## Deferred Follow-ups

1. **Pre-release manual gate — NOT yet run.** Maestro on device (`subir.yaml`,
   `subir-cancelar.yaml`, `subir-editar.yaml`) and VoiceOver/TalkBack over decision actions, row
   list and sheet. Blocks the first `mobile-v*` tag (do not merge the mobile release-please PR
   before it passes).
2. **Issue #295 (US-061) stays open:** mobile manual registration and mobile ingesta history.
3. **Backend one-shot `POST /api/ingestas`:** no shipped client calls it; physical removal is
   not scheduled.

---

## Lessons

1. Design line estimates undercounted test-heavy UI slices by roughly 1.5–2x; six PRs needed
   `size:exception` and two phases were split (4a/4b, 8a/8b).
2. `git mv` followed by a full rewrite loses rename credit (38% similarity), so deletions count
   toward the review budget.
3. The native attempt ledger counts a whole phase; its cap and the 400-line PR budget are separate
   axes (cap raised to 800 per phase by owner decision).
4. Delegated writers can add harness attribution trailers despite instructions; every PR's
   commits must be checked (PR #665 needed a force-push).
5. Delta specs that retitle a requirement must be composed against the canonical heading and
   retitled afterwards; archive output must be read back, not trusted.
