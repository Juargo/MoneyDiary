# Proposal: Cartola upload — resumen + "Subir tal cual" / "Revisar y editar" (web + mobile)

## Intent

After processing a cartola, the user needs a summary of what was found and an explicit choice: upload as-is or review and edit first. Web (US-059) opens the editable table directly, with no choice step. Mobile runs the old US-003 flow: legacy `muestra` data, no duplicates, no suggested categoría, no editing, and commit through the deprecated one-shot `POST /api/ingestas`.

## Scope

### In Scope
- Web: a decision step (resumen + "Subir tal cual" + "Revisar y editar" + Descartar) in front of the existing editable table.
- Mobile: canonical `/api/ingestas/preview` (`resumen` + `filas`), the same decision step, a virtualized full list (FlatList), tap-row bottom sheet (bucket → categoría), and commit via `/api/ingestas/commit` with an `edits` overlay.
- Mobile: drop the 10/25/50 selector; delete `apps/mobile/src/api/post-ingesta.ts` and resulting dead code.
- Docs: fix ADR drift (see ADR Impact) and the stale "mobile not implemented" note.

### Out of Scope
- Inline "+ Nueva categoría" on mobile (deferred).
- Removing the backend `POST /api/ingestas` or the legacy shim (US-061).
- Any backend or contract change.

## Capabilities

### New Capabilities
- `mobile-import-preview`: mobile preview → decision → optional review/edit → commit flow (no live mobile upload spec exists; US-003's spec was never promoted).

### Modified Capabilities
- `web-import-preview`: WEB-PRV-02 gains the decision step; "Subir tal cual" commits with an empty overlay.
- `ingesta-preview-commit`: mobile is now a consumer; the one-shot endpoint no longer has a shipped caller.
- `mobile-app`: MAC-01 file list drops `post-ingesta.ts`.

## Approach

- **Web**: add a `decidiendo` state to `SubirCartola.tsx` between preview success and `preview-listo`. The table, cascade and inline creation stay unchanged.
- **Mobile**: rebuild the `app/subir.tsx` state machine: `idle → previsualizando → decidiendo → (revisando) → subiendo → exito | error`.
  - The sheet reuses the `Modal` pattern from `ReclasificarMobileControl` with `fetchCatalogo`, `agruparPorBucket` and `BUCKETS_ASIGNABLES`. No new dependency.
  - Duplicate rows cannot be tapped.
- **ADR-024**: `esDuplicado`, `sugerido`, `resumen` and amounts are rendered as received. `formatearMontoCLP` is display-only.

## ADR Impact

- In the ADR-038 file, rule 2 names **"reclasificar transacciones"** as out of scope, and rule 6 says the boundary widens "por ADR, nunca por PR".
- US-056 shipped mobile reclassification anyway. Its archived proposal and design never cite ADR-038.
- Old ADRs are never edited, so fixing only the CLAUDE.md row is not enough.
- **Proposed: new ADR-044.** It supersedes only that clause. It records US-056 after the fact and states that pre-commit classification is part of ingest (ADR-026). Editing amounts and deleting ingestas stay excluded.

## Affected Areas

| Area | Impact |
|------|--------|
| `apps/web/src/components/SubirCartola.tsx` (+tests, `e2e/preview-stress`, `e2e/crear-categoria-preview`) | Modified |
| `apps/mobile/app/subir.tsx`, `subir.spec.tsx`, `src/domain/preview-cartola.ts` | Modified |
| `apps/mobile/src/api/preview-ingesta.ts` (guard requires `filas` + `resumen`) | Modified |
| `apps/mobile/src/api/commit-ingesta.ts` | New |
| `apps/mobile/src/api/post-ingesta.ts` (+spec) | Removed |
| `apps/mobile/.maestro/subir*.yaml` | Modified |
| `docs/adr/ADR-044-*.md`, `docs/adr/README.md`, `CLAUDE.md`, `openspec/specs/ingesta-preview-commit/spec.md` | New/Modified |

## PR Slice Forecast (400-line budget)

| # | Slice | Risk |
|---|-------|------|
| 1 | Docs: ADR-044 + index + CLAUDE.md + spec note | Low |
| 2 | Mobile API: `commitIngesta` + hardened preview guard | Medium |
| 3 | Mobile screen: resumen, FlatList, badges, decision, as-is commit | **High** (708-line spec rewrite; may split) |
| 4 | Mobile sheet editor + overlay commit | **High** |
| 5 | Mobile cleanup: delete one-shot client + selector + Maestro | **High** (~450 deletions) |
| 6 | Web decision step + e2e updates | Medium |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| ADR-044 not accepted by the owner | Med | Slice 1 lands first; mobile editor waits for it |
| Web e2e breaks from the extra click | High | Update in slice 6; run all three viewports |
| Mobile sheet a11y is verified only manually (ADR-018) | Med | Row + field labels; VoiceOver/TalkBack check |
| Commit fails after edits | Med | Keep list + edits, allow retry (WEB-PRV-06 parity) |

## Rollback Plan

Changes are client-side only; revert slices in reverse order. The backend one-shot endpoint stays live, so reverting slices 2–4 restores the old mobile flow. Slice 5 (deletion) comes last to keep that path open. No data or schema impact.

## Dependencies

- Owner acceptance of ADR-044.
- Related GitHub issue not verified (no shell in this phase).

## Success Criteria

- [ ] Both platforms show the resumen and two actions after preview; "Subir tal cual" commits with zero edits.
- [ ] Mobile edits via sheet reach `/commit` as an overlay; duplicates are not editable.
- [ ] Mobile has no reference to `POST /api/ingestas`.
- [ ] `pnpm web test`, `pnpm web typecheck`, mobile jest, and web e2e (3 viewports) all pass.
