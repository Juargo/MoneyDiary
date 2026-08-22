# Proposal: US-059 — Web: upload cartola + editable review preview

- **Change**: `us-059-import-preview-web`
- **Issue**: [#293](https://github.com/Juargo/MoneyDiary/issues/293) · Milestone `Sprint-15` · `epic:gestion-datos`
- **Status**: Proposed (2026-08-22)
- **Requires new ADR**: No. This is a **frontend-only** change under ADR-003/008/011/024. It consumes the already-shipped US-057 backend contract (`openspec/specs/ingesta-preview-commit/spec.md`) — no new endpoint, no schema, no backend code. ADR-024 governs: the client carries **zero** business logic; suggestions, dedup, and validation all come from the backend, and the UI only collects the classification-edits overlay.

## Intent

Replace the legacy **one-shot** upload flow on web (`/subir` → `POST /api/ingestas` → straight to DB) with the **US-057 preview → review → commit** flow, so that **only what the user approves enters the database**.

Today the web `/subir` route uploads a cartola and imports it in a single action, consuming the DEPRECATED preview shapes (`muestra` first-50 sample + `estructura`) and committing via the one-shot deprecated endpoint. The user never sees per-row dedup status, never sees the suggested classification, and cannot correct a category before the rows land. US-059 turns that into a two-phase interaction:

1. **Upload** a `.xlsx`/`.pdf` → the backend previews (`POST /api/ingestas/preview`) and **writes nothing**.
2. **Review**: the user sees the `resumen` (total / duplicates / new) and a **full editable table** over the canonical `filas`, with each row's suggested bucket + categoría and its duplicate status. **Nothing is saved yet — this is visible to the user.**
3. **Edit** classifications via a bucket → categoría cascade drawn from the user's **own** catalog (ADR-036/037).
4. **"Agregar transacciones"** → commit (`POST /api/ingestas/commit`) with `file` + the `edits` overlay → the dashboard updates. **"Descartar"** → nothing added, back to dashboard.

The move is a UI switch to the **canonical** contract (`filas` / `resumen` for preview; multipart `file` + `edits` for commit). The web stops using `muestra`/`estructura`/one-shot `POST /api/ingestas` — but the deprecated hook and endpoint are **not removed** (that is US-061).

## Why now

1. **The backend contract is already live and unused by web.** US-057 shipped `POST /api/ingestas/preview` (canonical `filas` + `resumen`) and `POST /api/ingestas/commit` (`file` + `edits` overlay) — the web still consumes only the deprecated `muestra`/`estructura`/one-shot shapes. The reshape is additive (backward-compat shim, spec §PREV-EXT-01), so the UI can switch with no backend change.
2. **"Blind import" is a real product gap.** Users cannot see duplicates or fix a wrong category before rows land; they discover mistakes only afterward from the dashboard. The preview→review→commit flow makes the import auditable and correctable at the moment of import.
3. **The per-user catalog makes editable classification safe.** ADR-036/037 gave every user their own `Categoria` set with a fixed `(categoria, bucket)` binding; the web already fetches it via `useCategorias` and groups it with `agruparCategoriasPorBucket`. The cascade selects reuse that machinery — no new client logic.
4. **It unblocks the epic's client stories.** US-059 (web) is the first client to adopt the US-057 flow; US-061 (mobile + one-shot removal) follows.

## Scope

### In scope — acceptance criteria mapped to capabilities

| AC | Capability |
|----|------------|
| **CA-01** | **Upload `.xlsx`/`.pdf` with loading state.** The existing `/subir` upload path keeps `expo`-free file input; the state machine gains an explicit `previsualizando` loading state while `POST /api/ingestas/preview` runs. |
| **CA-02** | **Preview shows `resumen` + full editable review table.** Render `resumen.totalFilas` / `duplicadosDetectados` / `nuevas`, then a table over **every** `filas[]` entry (fecha, descripción, cargo/abono as BigInt-safe strings, suggested classification, duplicate badge). A "nada se ha guardado aún" affordance is visible to the user (nothing persisted at preview). |
| **CA-03** | **Bucket + categoría cascade editing.** Per non-duplicate row: a bucket select, then a categoría select filtered to that bucket's categories from the **user's own** catalog (`useCategorias` + `agruparCategoriasPorBucket`). Selecting a bucket restricts the categoría options to that bucket. |
| **CA-04** | **"Agregar transacciones" → commit with edits → dashboard updated.** `POST /api/ingestas/commit` (multipart `file` + `edits` overlay) → on success, invalidate the dashboard queries and navigate to `/`. |
| **CA-05** | **"Descartar" → nothing added, back to dashboard.** Discard resets the state machine (clears `File` + `edits`) and navigates to `/`; because preview writes nothing, no cleanup is needed. |
| **CA-06** | **Import errors show a descriptive message + retry.** Unrecognized bank / invalid structure return 400 with a backend-generated scrubbed Spanish `body.message`; the UI shows it and lets the user pick another file (retry) without a page reload. |
| **CA-07** | **Tablet variants T1–T2 + a11y checks pass.** Responsive layout for the review table on tablet; `eslint-plugin-jsx-a11y` clean; each per-row select has an accessible label. |

### Binding product decisions (resolved 2026-08-22 — embedded, not open)

1. **Duplicados** → duplicate rows (`esDuplicado: true`) render **greyed-out with a "Duplicado" badge**, and their bucket/categoría selects are **disabled** (no editing). The backend omits them at commit anyway (spec §CMT-02), so this is transparency without wasted effort.
2. **Rows without a categoría** → commit is **allowed** with unassigned rows; they enter as `categoriaId: null` (Sin categoría) like the classic import, to be reclassified later from the dashboard. **No blocking gate, no warning.**
3. **Post-commit** → navigate **straight to the dashboard `/`** (CA-04 literal) with query invalidation. **No intermediate success panel.**
4. **Large cartolas** → **full simple list render, no pagination/virtualization** (YAGNI — typical Chilean cartolas < 300 rows).

### Non-goals (out of scope)

- **Manual entry form (US-060).** No hand-typed movement UI here.
- **Mobile (US-061).** No mobile preview/commit; mobile keeps its own path.
- **Removing the legacy one-shot flow.** `useIngesta`, `postIngesta`, `POST /api/ingestas`, and the deprecated `muestra`/`estructura` fields stay live and untouched — physical removal is **US-061**. The web simply stops *using* the one-shot commit.
- **New backend endpoints or backend changes.** US-059 consumes the existing US-057 contract; zero server code.
- **Pagination / virtualization** of the review table (decision 4).
- **Row exclusion / editing amounts, dates, descriptions.** The overlay is classification-only (spec §CMT-01 out-of-scope); server-parsed fields are authoritative and read-only in the UI.
- **Reclassifying already-persisted transactions.** That happens later from the dashboard, not in this flow.

## Approach (exploration Approach A — extend in place)

Extend the existing `SubirCartola` state machine in place; make `PreviewMuestra` the editable review table over canonical `filas`, extracting a `FilaRevision` row sub-component; add a `postCommitIngesta` client fn + `useCommitIngesta` hook. Rationale (from exploration): the `File` object must stay in memory for the commit step (a browser cannot re-read it from disk without a fresh user interaction), and `SubirCartola`'s state machine already owns the `File` — Approaches B (split components, prop-drills the `File`) and C (route handoff, needs a Zustand store for the `File`) add indirection with no testing benefit.

### 1. State machine (`apps/web/src/components/SubirCartola.tsx`)

- Keep the discriminated-union `EstadoSubida` pattern; states cover `idle → previsualizando → preview-listo → committing → exito` (naming pinned in design). `preview-listo` holds the `PreviewIngestaDto` + the `File` + an `edits` state.
- **Edits state**: `Map<number, string | null>` keyed by `rowIndex` (local to `SubirCartola`, passed down as controlled props). It is **reset to empty** whenever the machine returns to `idle` (retry / discard) so edits never survive a reset (exploration risk: edits drift).
- Preview via `usePreviewIngesta` (unchanged hook signature; caller now reads canonical `data.filas` / `data.resumen`). Commit via the new `useCommitIngesta`.
- On commit success: navigate `{ to: '/' }` via `useNavigate()` (@tanstack/react-router). On "Descartar": reset + navigate `/`.

### 2. Editable review table (`PreviewMuestra.tsx` + new `FilaRevision`)

- `PreviewMuestra` accepts `filas: PreviewFilaDto[]`, `resumen`, the `edits` map, and an `onEditChange(rowIndex, categoriaId | null)` callback. It renders the `resumen` header (total / duplicates / new) and the "nothing saved yet" affordance, then maps `filas` to a **new `FilaRevision` row sub-component** (SRP — one testable row unit).
- `FilaRevision` renders the row's fecha / descripción / cargo / abono (strings, rendered as-is — no client money math, ADR-024), the suggested classification, and — for **non-duplicate** rows — the bucket → categoría cascade. Duplicate rows render greyed with a "Duplicado" badge and **disabled** selects (decision 1).
- Native HTML table/list consistent with the current `PreviewMuestra` approach (no shadcn `table`/`select` exist — exploration §7). Cascade uses the existing `CampoSelect` (native `<select>`) — two per editable row.
- **a11y** (CA-07): each per-row `<select>` gets an accessible label composed from the row identity + field (e.g. visually-hidden `"Fila {n} — bucket"` / `"— categoría"`), so `jsx-a11y` passes and screen readers disambiguate rows.

### 3. API layer (client fn + hook + types + guard)

- **`postCommitIngesta`** — new fn in `apps/web/src/api/client.ts`, mirroring `postIngesta`: never-throw `ApiResult<CommitIngestaDto>`, `FormData` with `file` + `edits` (JSON string, no manual `Content-Type` — proxy handles multipart), 400 passes `body.message` verbatim (scrubbed backend message), 401 fixed message.
- **`useCommitIngesta`** — new hook in `apps/web/src/api/use-commit-ingesta.ts`, mirroring `useIngesta`: `useMutation`, throws `result.error` on failure, and on `onSuccess` **invalidates** `['resumen']`, `['resumen-anual']`, `['detalle-bucket-mes']`, `['ingestas']` so the dashboard reflects the new import (CA-04). The old `useIngesta` stays untouched (US-061 removes it).
- **Types** — re-export `PreviewFilaDto` and `CommitIngestaDto` from `@moneydiary/api-client` in `apps/web/src/api/types.ts` (currently missing).
- **Guard hardening** — `esPreviewIngestaDto` in `client.ts` currently validates only the legacy `muestra`/`estructura` shape (the canonical fields are optional in the generated types and pass silently). US-059 **hardens the guard to REQUIRE the canonical `filas` + `resumen`**, so a regression that drops them fails loudly at the boundary instead of rendering an empty table. The UI then treats `filas`/`resumen` as present (non-null) — satisfying `tsc` for the optional-typed generated fields.
- **Catalog cascade** — bucket→categoría options come from `useCategorias` (`CATEGORIAS_QUERY_KEY`) + the existing domain fn `agruparCategoriasPorBucket`. The catalog must be available before the review table renders; `/subir` co-fetches/preloads `useCategorias` so the selects are not stuck loading (exploration risk: catalog fetch timing).

### 4. ADR-024 boundary (non-negotiable)

The client contributes **no** business logic: the suggested classification, the duplicate flags, the `resumen` counts, and the final persisted classification all come from the backend. The UI only (a) renders backend-computed fields and (b) collects the `edits` overlay (`[{ rowIndex, categoriaId }]`) to send at commit. No client-side money math, no client-side dedup, no client-side Ingreso rule.

## Affected areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/src/components/SubirCartola.tsx` | **Modified** | State machine reads canonical `filas`/`resumen`, holds `edits` map, commits via `useCommitIngesta`, navigates `/` on success/discard |
| `apps/web/src/components/PreviewMuestra.tsx` | **Modified** | Presentational → editable review table over `filas` + `resumen`; controlled `edits`/`onEditChange` props |
| `apps/web/src/components/FilaRevision.tsx` | **New** | Per-row sub-component: cells + duplicate badge/greyed + bucket→categoría cascade with a11y labels |
| `apps/web/src/api/client.ts` | **Modified** | New `postCommitIngesta` (multipart `file`+`edits`); harden `esPreviewIngestaDto` to require `filas`+`resumen` |
| `apps/web/src/api/use-commit-ingesta.ts` | **New** | `useCommitIngesta` hook; invalidates resumen/anual/detalle/ingestas; success = navigate `/` |
| `apps/web/src/api/types.ts` | **Modified** | Re-export `PreviewFilaDto` + `CommitIngestaDto` from `@moneydiary/api-client` |
| `apps/web/src/api/use-preview-ingesta.ts` | **Unchanged (consumer switches)** | Hook signature stays; caller now reads canonical `filas`/`resumen` |
| `apps/web/src/components/PreviewMuestra.test.tsx` | **Rewritten** | Legacy `muestra`/`PreviewTransaccionDto` fixtures → new per-row props over `filas` |
| `apps/web/src/components/SubirCartola.test.tsx` | **Rewritten** | Legacy `validPreviewDto` (muestra/estructura) → canonical shape + commit mock |
| `apps/web/src/api/use-ingesta.ts`, `postIngesta`, `POST /api/ingestas` | **Unchanged** | One-shot path stays live for mobile until US-061 |
| `apps/web/src/routes/_authenticated/subir.tsx` | **Unchanged** | Thin container; only `SubirCartola` changes (may add `useCategorias` preload — design pins) |
| `apps/api/**`, `apps/mobile/**` | **Unchanged** | Backend contract already shipped (US-057); mobile is US-061 |

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Canonical `filas`/`resumen` are optional in generated types** (`readonly … \| undefined`) → `tsc` requires non-null handling | High | Medium | Harden `esPreviewIngestaDto` to REQUIRE them (§3); UI asserts present after the guard, so `tsc` is satisfied and a malformed response fails loudly, not silently |
| **Catalog fetch timing** — cascade selects need `useCategorias` before the review table renders | Medium | Medium | `/subir` co-fetches/preloads `useCategorias`; the review table shows a loading state for selects until the catalog resolves; design pins preload vs co-fetch |
| **Test suite rewrite for legacy fixtures** — `PreviewMuestra.test.tsx` / `SubirCartola.test.tsx` use the deprecated shape | High | Medium | Rewrite fixtures to canonical `filas`/`resumen` + a commit mutation mock (`vi.mock` + `unaMutacion<T>()` factory pattern, exploration §6); strict-TDD: tests land with the component changes |
| **a11y for per-row selects** — up to ~300 `<select>` each needing a label | Medium | Medium (CA-07) | Compound visually-hidden label per row (`Fila {n} — bucket/categoría`); `jsx-a11y` at error level for new files; verify with the project's a11y lint |
| **Edits state drift on reset** — a preview error or discard leaving stale `edits` | Medium | Low | State machine resets `edits` to empty on every return to `idle` (§1) |
| **Full render of large cartolas** (~300 rows × 2 selects) | Low | Low | Accepted constraint (decision 4 — YAGNI, no pagination); typical cartolas < 300 rows |
| **Duplicate-row edits leak into overlay** | Low | Low | Duplicate rows have disabled selects (decision 1); overlay only carries edits for non-duplicate rows; backend omits duplicates at commit regardless (spec §CMT-02) |
| **Proxy multipart with second field** (`edits`) | Low | Low | Standard `FormData.append('edits', json)`; the proxy already forwards multipart for `previewIngesta`/`postIngesta` unchanged (exploration risk resolved) |

## Success criteria

| AC | Criterion |
|----|-----------|
| CA-01 | Uploading a `.xlsx`/`.pdf` shows a loading state while preview runs; a valid file reaches the review step |
| CA-02 | The review step shows `resumen` (total/duplicates/new) + the full editable table over all `filas`, with a visible "nothing saved yet" affordance |
| CA-03 | Each non-duplicate row edits bucket → categoría via a cascade restricted to that bucket's categories from the user's own catalog; duplicate rows are greyed with a "Duplicado" badge and disabled selects |
| CA-04 | "Agregar transacciones" commits (`file` + `edits`) via `POST /api/ingestas/commit`, invalidates the dashboard queries, and navigates to `/`; rows without a categoría commit as `null` |
| CA-05 | "Descartar" clears the flow (File + edits) and returns to `/` with nothing persisted |
| CA-06 | Unrecognized-bank / invalid-structure errors show the backend's descriptive scrubbed message and allow retry with another file without reload |
| CA-07 | Tablet layout (T1–T2) works and `eslint-plugin-jsx-a11y` is clean, including per-row select labels |
| — | `pnpm web test` (vitest + Testing Library) green · `pnpm web typecheck` green · `jsx-a11y` clean |

## Open questions (non-blocking — resolve in design)

1. **State names** (`committing`/`subiendo`, `exito` vs no success panel given decision 3 navigates straight away) — naming only.
2. **`useCategorias` preload vs co-fetch** on `/subir` — timing detail; both satisfy CA-03.
3. **`FilaRevision` in its own file vs colocated** — SRP is fixed; file layout is a structure detail.
4. **Exact a11y label composition** for per-row selects — labeling strategy is fixed (compound per-row label); wording is a detail.

None blocks the spec or design phase.
