# Design: Cartola upload — resumen + "Subir tal cual" / "Revisar y editar"

## Technical Approach

Client-only change on the shipped `preview`/`commit` contract. Web adds a `decidiendo` step to `SubirCartola`. Mobile evolves `app/subir.tsx` **in place**: the screen stays the container, and new presentational components live in `src/components/subir/`. Pure helpers stay in `src/domain/preview-cartola.ts`. Specs: `mobile-import-preview`, `web-import-preview`, `ingesta-preview-commit`, `mobile-app`. The backend is untouched.

## Architecture Decisions

| # | Decision | Rejected | Rationale |
|---|---|---|---|
| D-01 | Mobile flow state stays a `useState` discriminated union in `subir.tsx` | `useReducer` + pure reducer module | No reducer exists in mobile. It would also cost one more PR, while presentational extraction already keeps the screen small (KISS). |
| D-02 | `commit-ingesta.ts` is created by **`git mv post-ingesta.ts`** (same for the spec), then edited | New file plus a separate deletion PR (~460 deleted lines) | Commit is the one-shot's successor: same transport, plus `edits` and a guard. With rename detection, only the edited hunks count toward the budget. |
| D-03 | Multipart transport mirrors `preview-ingesta.ts`. No shared helper, no `enviarMutacion`. | Extract `enviarMultipart` | `enviarMutacion` is JSON-only. Once `post-ingesta` is gone, only 2 copies remain. Extract when a 3rd multipart endpoint appears (YAGNI rule of three). |
| D-04 | The edits map is `ReadonlyMap<rowIndex, categoriaId>` inside the `revisando`/`subiendo` state. Names are resolved from the catalog, never stored. | Store `{id, nombre}` | Single source of truth (DRY). The catalog is also needed to show the `sugerido` name. |
| D-05 | Ingreso rows (`sugerido.bucket === 'Ingreso'`) are **not tappable**, same as duplicates. They are excluded from the overlay. | Tappable per the literal wording of MOB-PRV-06 | `CommitIngestaUseCase` silently discards overlay entries for Ingreso rows (web `FilaRevision` precedent). The client only reads the server's bucket (ADR-024). **Needs a spec amendment**, see Open Questions. |
| D-06 | One `HojaClasificacion` Modal per screen (the `ReclasificarMobileControl` pattern): bucket radiogroup (buckets in `BUCKETS_ASIGNABLES` that have categorías), then a categoría radiogroup, then Confirmar/Cancelar | A modal per row; a new sheet dependency | One instance serves every row, with no new dependency. |
| D-07 | Web: `revisando: boolean` state; derived `estado` gains `'decidiendo'`. The draft write-through only runs while `revisando`. A matched draft restore sets `revisando = true`. | A separate stored state machine | Minimal delta to the derived-state pattern. With no draft saved at the decision step, "draft ⇒ review" holds by construction. |
| D-08 | Web: extract `ResumenCartola` from `PreviewMuestra` (the `data-resumen-cartola` block) and reuse it at the decision step | Duplicate the `<dl>` markup | One identical block with two callers. The extraction is a zero-behavior PR. |
| D-09 | A synchronous `useRef` double-submit guard on mobile commit | Rely on the re-render | Two taps before the re-render could duplicate money (SEC-01, web precedent). |

## Data Flow (mobile)

    idle ─pick→ previsualizando ─ok→ decidiendo{preview,archivo,error?}
      │                 └fail→ error{mensaje} (trigger re-enabled)
    decidiendo ─Subir tal cual→ subiendo{origen:'decidiendo',edits:∅} ─ok→ exito
    decidiendo ─Revisar y editar→ revisando{edits,filaAbierta,error?} (+catalog fetch once)
    revisando ─tap editable row→ filaAbierta=n ─confirm→ edits.set(n,id)
    revisando ─Subir→ subiendo{origen:'revisando',edits} ─fail→ back to origen + error
    decidiendo|revisando ─Descartar/Cancelar→ idle (archivo+edits dropped, no commit)

`archivo: DocumentPickerAsset` (a cache copy) stays in state until `exito` or `idle`. If `new File(uri)` throws, the error maps to `network`. On success the screen calls `solicitarRecargaResumen()`.

## File Changes

| File | Action |
|---|---|
| `docs/adr/ADR-044-*.md`, `docs/adr/README.md`, `CLAUDE.md`, `openspec/specs/ingesta-preview-commit/spec.md` (consumers note) | Create/Modify |
| `apps/mobile/src/api/preview-ingesta.ts` (+spec) | Modify: guard requires `filas[]` + `resumen`; exports `PreviewIngestaDtoConCanonicos` |
| `apps/mobile/src/api/post-ingesta.ts` → `commit-ingesta.ts` (+spec) | Rename + modify |
| `apps/mobile/src/domain/preview-cartola.ts` (+spec) | Remove selector; add `esFilaEditable`, `categoriaEfectiva`, `aOverlayEdits` |
| `apps/mobile/src/components/subir/{FilaRevisionMobile,ListaRevision,ResumenDecision,HojaClasificacion}.tsx` (+specs) | Create |
| `apps/mobile/app/subir.tsx`, `subir.spec.tsx` | Modify in place (no rewrite) |
| `apps/mobile/.maestro/subir.yaml`, `subir-cancelar.yaml`, new `subir-editar.yaml`, `docs/mobile-upload-gate-runbook.md` | Modify/Create |
| `apps/mobile/src/api/client.ts`, `domain/api-error.ts`, `api/resumen-refresh.ts` | Fix stale `post-ingesta` comments |
| `apps/web/src/components/ResumenCartola.tsx`, `PreviewMuestra.tsx`, `SubirCartola.tsx` (+test) | Create/Modify |
| `apps/web/e2e/preview-stress.e2e.ts`, `crear-categoria-preview.e2e.ts`, new `subir-tal-cual.e2e.ts` | Modify/Create |

## Interfaces / Contracts

```ts
// commit-ingesta.ts — response aliased from @moneydiary/api-client (MAC-01)
export type { CommitIngestaDto };
// The generated schema types `edits` as a JSON string, so no element type exists to alias.
export type EdicionFila = { readonly rowIndex: number; readonly categoriaId: string };
export async function commitIngesta(
  archivo: DocumentPickerAsset, edits: readonly EdicionFila[],
): Promise<{ ok: true; value: CommitIngestaDto } | { ok: false; error: CommitIngestaError }>;
// FormData: file (Blob via expo-file-system File) + edits = JSON.stringify(edits), always sent (even []).
// Guard: ingestaId:string, totalTransacciones:number, duplicadosOmitidos:number.
```

Stable testIDs kept: `subir-archivo-trigger`, `preview-cargando`, `preview-resultado` (decision container), `subir-cargando`, `subir-resultado`, `subir-error`, `volver-al-resumen`. New testIDs: `decision-{subir-tal-cual|revisar|descartar}`, `revision-lista`, `revision-fila-{rowIndex}`, `revision-{subir|cancelar}`, `hoja-{bucket-X|categoria-id|confirmar|cancelar}`.

## Testing Strategy (Strict TDD, RED first)

| Layer | What | How |
|---|---|---|
| Unit (jest) | Preview guard accepts canonical and rejects legacy-only; commit multipart sends `edits` `[]`/sparse; 400/401/network/parse; helpers exclude duplicate and Ingreso rows | `fetch` + `expo-file-system` mocks (existing spec style) |
| Component (RNTL) | Decision labels and callbacks; the row is a Pressable only when editable; the list gets **all** rows (`props.data.length`, since FlatList renders only about 10 in jest); the sheet filters by bucket and confirm emits `{rowIndex, categoriaId}` | Render the component in isolation |
| Screen (RNTL) | As-is commit with `[]`; review overlay; commit failure keeps decision / list+edits; discard never commits; announcements | Module-boundary mocks, `subir.spec.tsx` evolved in place |
| Web (Vitest) | No table at `decidiendo`; "Subir tal cual" sends `edits: []`; error keeps the decision step; demo disables "Subir tal cual"; restored draft skips the decision; no draft is written while deciding | Add a `elegirRevisarYEditar()` helper to about 25 existing tests |
| E2E (Playwright, 3 viewports) | Stubbed commit body contains `edits` `[]` and lands on exito; existing specs click "Revisar y editar" | `page.route` stubs |
| Manual (ADR-018) | VoiceOver/TalkBack on the decision actions, rows and sheet; Maestro on device | `subir*.yaml`, runbook |

## Threat Matrix

N/A: no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout — PR chain (≤400 changed lines each, all green)

Mobile only ships on a `mobile-v*` tag, so partial mobile states on `main` are never released. **Do not cut a mobile release mid-chain.** Web deploys on merge, so each web PR must be complete.

| PR | Scope | Est. | Risk | Rollback |
|---|---|---|---|---|
| 1 | Docs: ADR-044, README, CLAUDE.md, spec consumers note | ~100 | Low | revert |
| 2 | Mobile: canonical preview guard + drop the 10/25/50 selector (legacy list shows the full `muestra`), subir.spec fixtures, Maestro selector step | ~330 | Low | revert |
| 3 | Mobile: `git mv` to `commit-ingesta` + `edits`; Confirmar calls `commitIngesta(archivo, [])`; exito shows `duplicadosOmitidos`; stale comments | ~250 | Med | revert (one-shot endpoint still live) |
| 4 | `FilaRevisionMobile` + domain helpers (no consumer yet) | ~310 | Low | revert |
| 5 | `ListaRevision` + `ResumenDecision` (no consumer yet) | ~380 | Low | revert |
| 6 | Screen swap: `decidiendo` + read-only `revisando`; delete `PreviewCartola`; subir.spec edited in place; Maestro IDs | ~370 | High | revert to PR 5 state |
| 7 | `HojaClasificacion` | ~330 | Med | revert |
| 8 | Screen: catalog fetch, sheet wiring, overlay commit, failure preservation, `subir-editar.yaml`, runbook | ~380 | High | revert to read-only review |
| 9 | Web: extract `ResumenCartola` (zero behavior change) | ~120 | Low | revert |
| 10 | Web: decision step + tests + e2e | ~340 | Med | revert (restores the direct table) |

This resolves the proposal's over-budget slices. The **708-line spec is never rewritten**: selector tests are deleted in PR 2, and the rest is edited in PRs 6 and 8. The **~450 lines of deletions disappear** into the PR 3 rename. Fallback: if GitHub does not detect the rename (similarity below 50%), split PR 3 into 3a (add commit client) and 3b (switch + delete, about 460 lines, pure deletion). 3b would then need `size:exception`, which is the owner's call under ask-on-risk. Make the `git mv` its own commit first.

## Open Questions

- [ ] **Blocking for tasks:** amend MOB-PRV-06/08 so Ingreso rows are also non-editable (D-05).
- [ ] Non-blocking: the delta WEB-PRV-06 (and the canonical spec) say "navigate to `/`, no success panel", but the shipped code has the peak-end exito landing. This design keeps the shipped behavior. Correct the delta text.
- [ ] Non-blocking: MAC-01 wording vs `EdicionFila`. The schema types `edits` as a string, so a local element type is unavoidable (web precedent).
