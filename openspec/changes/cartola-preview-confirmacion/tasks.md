# Tasks: Cartola Upload — Resumen + "Subir tal cual" / "Revisar y editar" (web + mobile)

Tracking issue: #295 (US-061, preview portion only). ADR-044 (owner-accepted) authorizes mobile's
pre-commit classification write scope, amending ADR-038 rule 2.

## Review Workload Forecast

| PR | Scope | Est. lines | Risk |
|---|---|---|---|
| 1 | Docs: ADR-044, README, CLAUDE.md, spec consumers note | ~100 | Low |
| 2 | Mobile: canonical preview guard + drop 10/25/50 selector | ~330 | Low |
| 3 | Mobile: `git mv` → `commit-ingesta.ts` + edits + as-is commit | ~250 | Med |
| 4 | `FilaRevisionMobile` + domain helpers | ~310 | Low |
| 5 | `ListaRevision` + `ResumenDecision` | ~380 | Low |
| 6 | Screen swap: `decidiendo` + read-only `revisando` | ~370 | **High** |
| 7 | `HojaClasificacion` | ~330 | Med |
| 8 | Screen: sheet wiring + overlay commit + failure preservation | ~380 | **High** |
| 9 | Web: extract `ResumenCartola` (zero behavior change) | ~120 | Low |
| 10 | Web: decision step + tests + e2e | ~340 | Med |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

`chain_strategy` is not yet chosen — the orchestrator asks the owner after this forecast. Every
work unit below is scoped to a single deliverable with an independent test/rollback boundary, so
it works unmodified under **stacked-to-main** (each PR merges to `main` in order 1→10) or
**feature-branch-chain** (tracker branch `cartola-preview-confirmacion`; PR1 bases on the tracker,
PR2 bases on PR1, …, PR10 bases on PR9; only the tracker merges to `main`). Mobile ships only on a
`mobile-v*` tag — see the reminder task below. Web deploys on merge, so PR9/PR10 must each stay
independently deployable.

**Fallback split:** if PR3's `git mv` similarity is below 50% and GitHub does not detect the
rename, split PR3 into **3a** (add `commit-ingesta.ts`, ~250 lines, no `size:exception`) and **3b**
(switch callers + delete `post-ingesta.ts`, ~460 lines, pure deletion — **needs owner-approved
`size:exception`** under `ask-on-risk`).

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | ADR-044 + doc index rows, no code | PR1 | N/A — docs-only | N/A — docs-only | Revert PR1 |
| 2 | Canonical preview guard; drop 10/25/50 selector | PR2 | `pnpm --filter @moneydiary/mobile test -- preview-ingesta subir` | `apps/mobile/.maestro/subir.yaml` (selector step removed) | Revert PR2; legacy paginated selector returns |
| 3 | `commit-ingesta.ts` (renamed) + as-is commit | PR3 | `pnpm --filter @moneydiary/mobile test -- commit-ingesta subir` | Manual `expo start` upload smoke (no device automation yet) | Revert PR3; one-shot endpoint still live |
| 4 | `FilaRevisionMobile` + domain helpers | PR4 | `pnpm --filter @moneydiary/mobile test -- preview-cartola FilaRevisionMobile` | N/A — component has no screen consumer yet | Revert PR4; no consumer wired |
| 5 | `ListaRevision` + `ResumenDecision` | PR5 | `pnpm --filter @moneydiary/mobile test -- ListaRevision ResumenDecision` | N/A — no screen consumer yet | Revert PR5; no consumer wired |
| 6 | Screen swap: `decidiendo` + read-only `revisando` | PR6 | `pnpm --filter @moneydiary/mobile test -- subir` | `apps/mobile/.maestro/subir.yaml`, `subir-cancelar.yaml` | Revert PR6 to PR5 state |
| 7 | `HojaClasificacion` sheet | PR7 | `pnpm --filter @moneydiary/mobile test -- HojaClasificacion` | N/A — not wired to the screen yet | Revert PR7; no consumer wired |
| 8 | Sheet wiring + overlay commit + failure preservation | PR8 | `pnpm --filter @moneydiary/mobile test -- subir` | `apps/mobile/.maestro/subir-editar.yaml` (new) | Revert PR8 to read-only review (PR6 state) |
| 9 | Web: extract `ResumenCartola` | PR9 | `pnpm web test -- ResumenCartola PreviewMuestra` | Manual `pnpm web dev` — confirm zero visual diff | Revert PR9; markup re-inlines |
| 10 | Web: decision step + e2e | PR10 | `pnpm web test -- SubirCartola` | `pnpm --filter @moneydiary/web exec playwright test e2e/subir-tal-cual.e2e.ts e2e/preview-stress.e2e.ts e2e/crear-categoria-preview.e2e.ts` (movil/tablet/escritorio) | Revert PR10; direct table restored |

Threat matrix: N/A per design.md — no routing, shell, subprocess, VCS/PR automation, executable
classification, or process-integration boundary in this change.

## Phase 1: Docs (PR1, base: tracker/main)

- [x] 1.1 Create `docs/adr/ADR-044-mobile-clasificacion-precommit.md` (owner-accepted; supersedes
      only ADR-038 rule 2's mobile-reclassification exclusion; records that US-056 already shipped
      mobile reclassification and that pre-commit classification is part of ingest per ADR-026).
- [x] 1.2 Add the ADR-044 row to `docs/adr/README.md`.
- [x] 1.3 Add the ADR-044 summary row to the root `CLAUDE.md` ADR table.
- [x] 1.4 Correct the stale "mobile not implemented" note in
      `openspec/specs/ingesta-preview-commit/spec.md` Client Consumers section (prose carry-over
      from the delta — flag at archive time for manual sync into the canonical spec).
- Verify: `pnpm exec prettier --check docs/adr/ADR-044-*.md CLAUDE.md` (or equivalent lint-staged
  formatting check); no code, no test command applies.

## Phase 2: Mobile canonical preview guard + drop selector (PR2, base: PR1)

- [x] 2.1 [RED] In `apps/mobile/src/api/preview-ingesta.spec.ts`, add failing cases: guard rejects
      a response with only legacy `estructura`/`muestra` (MOB-PRV-02), accepts `filas[]` +
      `resumen.{totalFilas,duplicadosDetectados,nuevas}`.
- [x] 2.2 [GREEN] Update `apps/mobile/src/api/preview-ingesta.ts` guard to require both `filas` and
      `resumen`; export `PreviewIngestaDtoConCanonicos`.
- [x] 2.3 [RED] In `apps/mobile/app/subir.spec.tsx`, replace legacy `muestra`/`estructura`
      fixtures with canonical `filas`/`resumen`; add a failing assertion that no 10/25/50
      row-count control renders (MOB-PRV-05).
- [x] 2.4 [GREEN] In `apps/mobile/app/subir.tsx`, remove the 10/25/50 selector and its supporting
      code; render the full `filas` list (interim, pre-redesign).
- [x] 2.5 [REFACTOR] Update `apps/mobile/.maestro/subir.yaml` to drop the selector step.
- Verify: `pnpm --filter @moneydiary/mobile test`; `pnpm --filter @moneydiary/mobile exec tsc --noEmit`.

## Phase 3: `commit-ingesta.ts` + as-is commit (PR3, base: PR2)

- [x] 3.0 First commit, standalone: `git mv apps/mobile/src/api/post-ingesta.ts
      apps/mobile/src/api/commit-ingesta.ts` and `git mv apps/mobile/src/api/post-ingesta.spec.ts
      apps/mobile/src/api/commit-ingesta.spec.ts` (no content edits in this commit, to maximize
      rename-detection similarity).
- [x] 3.1 [RED] Rewrite `apps/mobile/src/api/commit-ingesta.spec.ts`: multipart `edits: []` and a
      sparse overlay, 400/401/network/parse failure cases (MOB-PRV-04, MOB-PRV-10).
- [x] 3.2 [GREEN] Rewrite `apps/mobile/src/api/commit-ingesta.ts` per design's `commitIngesta`
      contract: `EdicionFila` local type, `CommitIngestaDto` alias from `@moneydiary/api-client`
      (MAC-01), guard on `ingestaId`/`totalTransacciones`/`duplicadosOmitidos`.
- [x] 3.3 [RED] In `apps/mobile/app/subir.spec.tsx`, add a failing case: Confirmar calls
      `commitIngesta(archivo, [])` and success shows `duplicadosOmitidos` (MOB-PRV-04).
- [x] 3.4 [GREEN] Wire `apps/mobile/app/subir.tsx` Confirmar action to `commitIngesta`.
- [x] 3.5 [REFACTOR] Fix stale `post-ingesta` references in `apps/mobile/src/api/client.ts`,
      `src/domain/api-error.ts`, `src/api/resumen-refresh.ts` comments.
      **Delivered as a single PR under owner-approved `size:exception` (~653 changed lines).** The
      `git mv` rename credit did not survive the content rewrite (measured similarity 38%, below
      the 50% threshold `git diff -M` and GitHub use), and the 3a/3b fallback below also exceeded
      400 lines once the fully-tested `commit-ingesta.spec.ts` was counted.
- Verify: `pnpm --filter @moneydiary/mobile test`; `pnpm --filter @moneydiary/mobile exec tsc --noEmit`;
  `rg post-ingesta apps/mobile/src apps/mobile/app` returns no import (only this task's own rename).
- Fallback: if rename similarity <50%, split into 3a (add `commit-ingesta.ts`, tasks 3.1-3.2) and
  3b (tasks 3.3-3.5 + delete `post-ingesta.ts`, ~460 lines — owner-approved `size:exception`
  required under `ask-on-risk`).

## Phase 4: `FilaRevisionMobile` + domain helpers (PR4, base: PR3)

- [x] 4.1 [RED] Rewrite `apps/mobile/src/domain/preview-cartola.spec.ts`: remove selector tests;
      add failing cases for `esFilaEditable` (false for `esDuplicado` and
      `sugerido.bucket === 'Ingreso'`, MOB-PRV-06), `categoriaEfectiva`, `aOverlayEdits` (excludes
      duplicate and Ingreso rows, MOB-PRV-08).
- [x] 4.2 [GREEN] Rewrite `apps/mobile/src/domain/preview-cartola.ts`: drop the selector, add
      `esFilaEditable`, `categoriaEfectiva`, `aOverlayEdits`.
- [x] 4.3 [RED] Create `apps/mobile/src/components/subir/FilaRevisionMobile.spec.tsx` (naming
      deviation from the `.test.tsx` name below: this repo's mobile tests use `*.spec.tsx`, matching
      every existing file under `src/components/`): duplicate and Ingreso rows render non-Pressable
      with no accessible button role (MOB-PRV-06); editable rows are Pressable and open on tap.
- [x] 4.4 [GREEN] Create `apps/mobile/src/components/subir/FilaRevisionMobile.tsx`.
- [x] 4.5 [REFACTOR] `pnpm --filter @moneydiary/mobile lint`.
      **Delivered as two chained PRs (4a/4b), same fallback shape as Phase 3's 3a/3b:** the combined
      diff measured 519 changed lines (`git diff -M --shortstat` against PR3's head), over the
      400-line budget, and — unlike Phase 3 — a cohesive split brings BOTH slices under budget with
      no `size:exception` needed. **PR4a** (tasks 4.1-4.2, domain helpers only): 245 changed lines,
      branch `feat/cartola-mobile-preview-cartola-helpers`, base `feat/cartola-mobile-commit-ingesta`.
      **PR4b** (tasks 4.3-4.5, `FilaRevisionMobile` only): 274 changed lines, branch
      `feat/cartola-mobile-fila-revision`, base `feat/cartola-mobile-preview-cartola-helpers`
      (feature-branch-chain).
- Verify: `pnpm --filter @moneydiary/mobile test -- preview-cartola FilaRevisionMobile`;
  `pnpm --filter @moneydiary/mobile exec tsc --noEmit`.

## Phase 5: `ListaRevision` + `ResumenDecision` (PR5, base: PR4)

- [x] 5.1 [RED] Create `apps/mobile/src/components/subir/ListaRevision.test.tsx`: asserts
      `FlatList` `props.data.length` equals the full `filas.length` (MOB-PRV-05; jest renders only
      ~10 rows, so assert the prop, not rendered DOM nodes).
      **Naming deviation** (same as PR4's `FilaRevisionMobile.spec.tsx`): created as
      `ListaRevision.spec.tsx`, matching every existing file under `src/components/`.
- [x] 5.2 [GREEN] Create `apps/mobile/src/components/subir/ListaRevision.tsx`.
- [x] 5.3 [RED] Create `apps/mobile/src/components/subir/ResumenDecision.test.tsx`: resumen values
      render, "Subir tal cual"/"Revisar y editar"/"Descartar" all present and accessibly labeled
      (MOB-PRV-03, MOB-PRV-11).
      **Naming deviation** (same as above): created as `ResumenDecision.spec.tsx`.
- [x] 5.4 [GREEN] Create `apps/mobile/src/components/subir/ResumenDecision.tsx`.
- [x] 5.5 [REFACTOR] `pnpm --filter @moneydiary/mobile lint`.
- Verify: `pnpm --filter @moneydiary/mobile test -- ListaRevision ResumenDecision`.

## Phase 6: Screen swap — `decidiendo` + read-only `revisando` (PR6, base: PR5)

- [x] 6.1 [RED] Evolve `apps/mobile/app/subir.spec.tsx` in place: `decidiendo` renders
      `ResumenDecision` with no row list (MOB-PRV-03); "Revisar y editar" renders `ListaRevision`
      read-only (no sheet yet); "Descartar"/"Cancelar" return to `idle` without committing
      (MOB-PRV-09).
- [x] 6.2 [GREEN] Rewrite the `subir.tsx` state machine per design's data-flow diagram:
      `idle → previsualizando → decidiendo → revisando | subiendo → exito | error`; delete any
      now-superseded `PreviewCartola` presentational leftovers.
- [x] 6.3 [REFACTOR] Update stable/new testIDs in `subir.tsx`
      (`decision-*`, `revision-lista`) and `apps/mobile/.maestro/subir.yaml`,
      `subir-cancelar.yaml` to match.
      **Delivered as PR6** (base PR5 `feat/cartola-mobile-lista-resumen`, branch
      `feat/cartola-mobile-decision-revision`). `decidiendo{dto,archivo,error?}` and
      `revisando{dto,archivo,error?}` carry an embedded `error` so a commit failure returns to the
      originating phase with the held file/list intact (MOB-PRV-10), instead of the design's bare
      "back to origen + error" note; only a preview failure still uses the standalone `error` fase.
      `revisando` is read-only this PR (`ListaRevision`'s `categoriaNombrePorFila` is an empty
      `Map`, `onAbrirFila` is a no-op) — the classification sheet, catalog fetch, and D-09's
      synchronous `useRef` double-submit guard are Phase 7/8's explicit tasks (7.1-7.2, 8.2); PR6
      already gets structural single-fire protection since `setEstado({fase:'subiendo', ...})` runs
      synchronously before `commitIngesta`, unmounting the decision/review actions before any
      second tap could reach them (asserted by a dedicated test). Banco renders as its own row
      inside the `preview-resultado` container (not added to `ResumenDecision`'s props, keeping
      PR5's component contract unchanged) per that component's own PR5 deviation note.
- Verify: `pnpm --filter @moneydiary/mobile test -- subir`; `pnpm --filter @moneydiary/mobile exec tsc --noEmit`.
- Manual (deferred to Phase 8's gate): Maestro `subir.yaml`/`subir-cancelar.yaml` on device.

## Phase 7: `HojaClasificacion` (PR7, base: PR6)

- [x] 7.1 [RED] Create `apps/mobile/src/components/subir/HojaClasificacion.spec.tsx` (naming
      deviation from `.test.tsx`, same as PR4/PR5 — this repo's mobile tests use `*.spec.tsx`):
      bucket radiogroup (`BUCKETS_ASIGNABLES` with categorías) filters the categoría radiogroup
      (MOB-PRV-07); Confirmar emits `{rowIndex, categoriaId}`; Cancelar closes without emitting;
      plus Confirmar-disabled, preselection from the current categoría, and reopening-for-a-
      different-row (no stale selection leak) as triangulation. Confirmed RED: module not found.
- [x] 7.2 [GREEN] Create `apps/mobile/src/components/subir/HojaClasificacion.tsx`. **Design
      conflict resolved in favor of design.md** (recorded here per the launch instruction): the
      sheet does **not** call `fetchCatalogo` itself — it is presentational, receiving `grupos`
      (already `agruparPorBucket`-shaped), the target `fila`, `categoriaActualId`, `visible`,
      `onConfirmar(edicion)`, `onCancelar`. design.md's data-flow diagram annotates the catalog
      fetch on `revisando` entry (the SCREEN), and task 8.2 explicitly assigns "fetch the catalog
      once on entering `revisando`" to Phase 8 — this task's own `fetchCatalogo` wording is the
      stale one. **DRY**: reuses `SelectorChips` (`configuracion/`, US-044) for both radiogroups
      instead of `ReclasificarMobileControl`'s `Modal` pattern — `SelectorChips` is already the
      generic bucket/categoría radiogroup primitive (backs `NuevaCategoriaForm`, `EditarCategoria`,
      `PatronFila`) and matches MOB-PRV-07's real shape (bucket selection filters categoría
      options), whereas `ReclasificarMobileControl` shows every bucket's categorías at once with
      no selection step and is entangled with its own PATCH/Alert commit flow this sheet doesn't
      need. `ReclasificarMobileControl` itself is untouched.
- [x] 7.3 [REFACTOR] `pnpm --filter @moneydiary/mobile lint`: 1 real error
      (`react-hooks/set-state-in-effect` on the open-only reset effect), fixed with the same
      `eslint-disable-next-line` precedent `ReclasificarMobileControl` already uses; remaining
      findings were prettier, auto-fixed. 0 errors after, same 1 pre-existing unrelated warning as
      PR3–PR6 (`BucketDetalleScreen.spec.tsx`).
- **Scoped correction (owner-approved, same PR7, no new tasks)**: removed the open-only reset
  `useEffect` and its two `eslint-disable-next-line` suppressions (syncing state from props in an
  effect with suppressed deps risks reading stale props). Split `HojaClasificacion` into the outer
  `Modal`-driven component and an inner `HojaClasificacionContenido`, rendered only while
  `visible` and `key`ed by `fila.rowIndex`, so it mounts fresh per opening; the selection state now
  initializes with lazy `useState(() => ...)` derived from `grupos`/`categoriaActualId` at mount,
  no effect involved. Also dropped the `grupoActual?.bucket as BucketAsignable` cast via a
  `esBucketAsignable` type predicate that narrows `gruposAsignables` directly. Props contract
  unchanged; all 10 existing tests pass unmodified (10/10), full mobile suite 858/858, `tsc
  --noEmit` clean, lint 0 errors/0 `eslint-disable` in the file (same 1 pre-existing unrelated
  warning). Commit `refactor(mobile): inicializa la selección de HojaClasificacion sin efecto`.
- Verify: `pnpm --filter @moneydiary/mobile test -- HojaClasificacion`.

## Phase 8: Sheet wiring + overlay commit + failure preservation (PR8, base: PR7)

**Delivered as two chained PRs (chain now 12 PRs):** PR8a `feat/cartola-mobile-edicion-hoja`
(base PR7; catalog fetch once on entering `revisando` with loading + retryable failure, sheet
open/confirm/cancel, `edits` map, `ListaRevision` `extraData` fix; commit from review still sends
`[]`) — 442 changed lines under owner-approved `size:exception`; PR8b
`feat/cartola-mobile-edicion-commit` (base PR8a; `aOverlayEdits` commit, failure preserves edits,
synchronous `useRef` double-submit guard on both commit actions, `subir-editar.yaml`, runbook) —
303 changed lines. Spec gap: MOB-PRV-06/07/10 are silent on catalog loading/failure UX; resolved
as list visible, sheet disabled until the catalog is ready, inline retryable error — sync into
`mobile-import-preview` at archive.

- [x] 8.1 [RED] Extend `apps/mobile/app/subir.spec.tsx`: tapping an editable row opens
      `HojaClasificacion`; duplicate/Ingreso rows do not open it (MOB-PRV-06); confirming the
      sheet updates the row's pending edit and the list reflects it (MOB-PRV-07); "Subir" from
      `revisando` calls `commitIngesta(archivo, aOverlayEdits(edits))` (MOB-PRV-08); a commit
      failure from `revisando` preserves the list and pending edits (MOB-PRV-10); a second tap on
      the commit action before the first resolves is a no-op (D-09 double-submit guard, SEC-01
      precedent).
- [x] 8.2 [GREEN] Wire `HojaClasificacion` into `subir.tsx`: fetch the catalog once on entering
      `revisando`; maintain the `edits: ReadonlyMap<rowIndex, categoriaId>`; add the synchronous
      `useRef` double-submit guard on the commit action.
- [x] 8.3 [REFACTOR] Create `apps/mobile/.maestro/subir-editar.yaml`; update
      `docs/mobile-upload-gate-runbook.md` for the review/edit flow.
- Verify: `pnpm --filter @moneydiary/mobile test -- subir`; `pnpm --filter @moneydiary/mobile exec tsc --noEmit`.
- [ ] **PENDING (owner, manual):** Manual verification (not CI): run `apps/mobile/.maestro/subir.yaml`, `subir-cancelar.yaml`,
  `subir-editar.yaml` on device via `pnpm --filter @moneydiary/mobile e2e`; VoiceOver (iOS) and
  TalkBack (Android) pass over decision actions, row list, and sheet controls (ADR-018,
  MOB-PRV-11 — decision actions and sheet controls expose accessible labels; MOB-PRV-06 —
  non-interactive rows expose no button role).

**Reminder:** do not cut a `mobile-v*` release tag until PR2 through PR8b (the overlay-commit PR)
are all merged — mobile only ships on that tag, and a partial mid-chain state must never reach it.

## Phase 9: Web — extract `ResumenCartola` (PR9, base: PR8 or PR1, zero behavior change)

- [x] 9.1 [RED] Create `apps/web/src/components/ResumenCartola.test.tsx` asserting the
      `data-resumen-cartola` block's current rendered output (resumen counts) unchanged.
- [x] 9.2 [GREEN] Create `apps/web/src/components/ResumenCartola.tsx` (extracted from
      `PreviewMuestra.tsx`'s `data-resumen-cartola` block, D-08); update `PreviewMuestra.tsx` to
      consume it with no visual change.
- [x] 9.3 [REFACTOR] `pnpm web lint`.
      **Delivered as PR9** (base PR8b `feat/cartola-mobile-edicion-commit`, branch
      `feat/cartola-web-resumen-cartola`). 215 changed lines (148 insertions + 67 deletions),
      comfortably under budget. Zero behavior change confirmed: no existing test file
      (`PreviewMuestra.test.tsx`, `SubirCartola.test.tsx`, e2e) was modified — only the new
      `ResumenCartola.test.tsx` was added, and it asserts the exact same rendered output the
      pre-existing `PreviewMuestra.test.tsx` cases already covered for that block.
- Verify: `pnpm web test -- ResumenCartola PreviewMuestra`; `pnpm web typecheck`.

## Phase 10: Web — decision step + e2e (PR10, base: PR9)

- [x] 10.1 [RED] Extend `apps/web/src/components/SubirCartola.test.tsx`: preview success renders
      `decidiendo` (resumen + "Subir tal cual"/"Revisar y editar"/"Descartar", no table,
      WEB-PRV-02); "Subir tal cual" sends `edits: []` and lands on `exito` (WEB-PRV-06); "Revisar
      y editar" reaches the existing editable table (WEB-PRV-19); "Descartar" from `decidiendo`
      resets to `idle` and navigates to `/` (WEB-PRV-07); a restored `sessionStorage` draft skips
      `decidiendo` straight to the table (WEB-PRV-02); no draft is written while `decidiendo`.
- [x] 10.2 [GREEN] Add `revisando: boolean` state to `SubirCartola.tsx`; derive `estado` with the
      new `'decidiendo'` value (D-07); reuse `ResumenCartola` (PR9) at the decision step.
- [x] 10.3 [REFACTOR] Add an `elegirRevisarYEditar()` test helper and apply it to the existing
      `SubirCartola` tests that assumed the table rendered directly.
      **Delivered as PR10**, branch `feat/cartola-web-paso-decision` (base PR9
      `feat/cartola-web-resumen-cartola`). Measured 24 existing tests needed the helper (the
      forecast's "~25" estimate held) — one call each, prepended at the point each test first
      reaches `preview-listo`/the table. Also extracted the discard `InlineConfirm` into one shared
      `confirmarDescarteDialog` element reused by both the decision step and the review table
      (DRY) since only one of the two ever mounts at a time.
- [x] 10.4 Update `apps/web/e2e/preview-stress.e2e.ts` and `apps/web/e2e/crear-categoria-preview.e2e.ts`
      to click "Revisar y editar" before reaching the table.
- [x] 10.5 Create `apps/web/e2e/subir-tal-cual.e2e.ts`: stubbed commit body contains `edits: []`
      and the flow lands on `exito`.
- Verify: `pnpm web test`; `pnpm web typecheck`;
  `pnpm --filter @moneydiary/web exec playwright test e2e/subir-tal-cual.e2e.ts
  e2e/preview-stress.e2e.ts e2e/crear-categoria-preview.e2e.ts` (all three viewports —
  movil/tablet/escritorio — run by default per `playwright.config.ts`).
