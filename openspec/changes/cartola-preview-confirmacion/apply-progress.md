# Apply Progress: cartola-preview-confirmacion

> File copy of Engram `sdd/cartola-preview-confirmacion/apply-progress` (hybrid store), final state
> after all implementation phases.

**Mode:** Strict TDD (RED → GREEN → REFACTOR). **Delivery:** feature-branch-chain, 12 PRs, all open
and unmerged. Tracker branch: `feat/cartola-preview-confirmacion`. Tracking issue: #295.

## Delivered PRs

| PR | Branch | Base | Scope | Changed lines | Notes |
|---|---|---|---|---|---|
| #655 | `feat/cartola-adr-docs` | tracker | ADR-044, ADR index, CLAUDE.md rows, spec consumers note | 241 | Docs only |
| #656 | `feat/cartola-mobile-preview-canonico` | #655 | Canonical preview guard, drop 10/25/50 selector | 440 | `size:exception` |
| #657 | `feat/cartola-mobile-commit-ingesta` | #656 | `commitIngesta` via `/api/ingestas/commit`, as-is commit, delete `post-ingesta.ts` | 669 | `size:exception`; rename credit lost (38% similarity) |
| #658 | `feat/cartola-mobile-preview-cartola-helpers` | #657 | `esFilaEditable`, `categoriaEfectiva`, `aOverlayEdits` | 245 | |
| #659 | `feat/cartola-mobile-fila-revision` | #658 | `FilaRevisionMobile` | 297 | |
| #660 | `feat/cartola-mobile-lista-resumen` | #659 | `ListaRevision`, `ResumenDecision` | 348 | |
| #661 | `feat/cartola-mobile-decision-revision` | #660 | Screen: decision step + read-only review | 627 | `size:exception` |
| #662 | `feat/cartola-mobile-hoja-clasificacion` | #661 | `HojaClasificacion` (effect-free initial selection) | 563 | `size:exception` |
| #663 | `feat/cartola-mobile-edicion-hoja` | #662 | Catalog fetch + retry, sheet wiring, edits map, `ListaRevision` `extraData` | 442 | `size:exception` |
| #664 | `feat/cartola-mobile-edicion-commit` | #663 | `aOverlayEdits` commit, failure preserves edits, `useRef` guard, Maestro, runbook | 325 | |
| #665 | `feat/cartola-web-resumen-cartola` | #664 | Web: extract `ResumenCartola` (zero behavior change) | 227 | Attribution trailers removed by force-push |
| #666 | `feat/cartola-web-paso-decision` | #665 | Web: decision step + e2e | 640 | `size:exception`; independent verifier PASS |

## Final verification evidence

- Mobile (at PR8b): `pnpm --filter @moneydiary/mobile test` 865/865; `tsc --noEmit` clean; lint 0 errors.
- Web (at PR10): `pnpm web test` 2123/2123; `pnpm web typecheck` clean; `pnpm web lint` clean;
  Playwright `subir-tal-cual`, `preview-stress`, `crear-categoria-preview`: 6 passed, 3 skipped
  (`tablet`, explicit pre-existing convention). Re-run by an independent verifier because
  `gentle-ai review assess` rated PR10 high risk.
- CI green on #655–#665; #666 green except web unit job still running at last check.

## Deviations and decisions recorded during apply

- Mobile test files use `*.spec.tsx` (tasks.md said `.test.tsx`).
- `HojaClasificacion` is presentational; the screen fetches the catalog once on entering review
  (design.md over tasks.md 7.2). Reuses `SelectorChips`.
- Spec gap: catalog loading/failure UX (MOB-PRV-06/07/10 silent) resolved as list visible, sheet
  disabled until catalog ready, inline retryable error — sync into `mobile-import-preview` at archive.
- Commit failure returns to the originating phase with an embedded `error` (no standalone error phase).
- Banco renders in the mobile decision screen, not in `ResumenDecision`.
- Web: shared `confirmarDescarteDialog`; draft written only while reviewing; restored draft skips the
  decision step.

## Pending (owner)

- Pre-release gate, NOT yet run: Maestro (`subir`, `subir-cancelar`, `subir-editar`) on device and
  VoiceOver/TalkBack pass. Blocks the first `mobile-v*` tag.
- `size:exception` labels on #656, #657, #661, #662, #663, #666.
- Review and merge the chain into the tracker, then the tracker into `main`.
