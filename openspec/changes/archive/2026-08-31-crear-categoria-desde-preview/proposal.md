# Proposal: Create a categoría (with patrones) from the upload preview

## Intent

Today the cartola preview (`/subir`) lets a user pick a bucket and then a categoría **from the catalog that already exists**. When a row's description belongs to a categoría the user has not created yet (the common case in the first months of use, and every time a new merchant appears), the only path is: abandon the preview, go to `/configuracion/categorias`, create the categoría, add a patrón, come back, re-upload the file, and re-do every override already made. In practice users don't do that — they leave the row uncategorized or force it into a categoría that does not really fit, which pollutes the 50/30/20 verdict that is the whole product promise (PRODUCT.md, principle 1).

This change closes that loop **in place**: a "+" control next to each row's categoría select opens a small form to create a categoría *with its patrones* in one atomic call; the originating row is set to the new categoría, and the preview is re-evaluated so every other row that matches the new patrones picks it up before the user commits. The outcome: the monthly import ritual becomes self-teaching — classifying one row teaches the catalog, and the catalog immediately pays it back on the rest of the file.

## Product decisions — locked (do NOT reopen in `spec` or `design`)

| # | Decision |
|---|----------|
| 1 | **Re-evaluation:** only untouched rows receive new suggestions (edits always win, existing merge rule `resolverCategoriaMerged`). The **originating row** gets the new categoría as an explicit edit even if no patrón matches it. |
| 2 | **Bucket is fixed** to the row's currently selected bucket — displayed, not editable. The "+" renders only when a bucket is chosen (same gate as the categoría select). |
| 3 | **Patrones:** the first patrón is prefilled with the row's description as `CONTAINS`, editable and removable; more can be added (`CONTAINS` / `STARTS_WITH` / `REGEX`); zero patrones is valid. |
| 4 | **One atomic save:** `POST /api/categorias` is extended to accept an optional `patrones[]` created in the **same transaction** — all or nothing. No two-call sequence, no partially created catalog. |

## Scope

### In scope

**API — `apps/api`**
- `POST /api/categorias` accepts an optional `patrones[]` (`{ patron, matchType }`), created atomically with the categoría in one transaction. Empty/absent array = today's behavior, unchanged.
- Error mapping: existing catalog domain errors (`NOMBRE_INVALIDO`, `BUCKET_NO_ASIGNABLE`, `NOMBRE_DUPLICADO`, `PATRON_INVALIDO`, `MATCH_TYPE_INVALIDO`, `REGEX_INVALIDA`, `PATRON_DUPLICADO`, `DEMO_SOLO_LECTURA`) keep their status codes; a per-patrón failure MUST carry an **index or patrón identifier** so the UI can point at the offending row instead of showing a generic message.
- `201` body is the created categoría **including its patrones** (`CategoriaResponse` already nests `patrones`).
- Contract: `apps/api/openapi.json` regenerated (`pnpm api openapi:emit`, gated by `openapi:check` in CI) and `@moneydiary/api-client` regenerated (`pnpm --filter @moneydiary/api-client generate`, precedent commit `chore(api-client): regenerate types`).

**Web — `apps/web`**
- `postCategoria` returns the created `CategoriaDto` instead of discarding the 201 body, and accepts optional `patrones`.
- A "+" control beside the categoría select in `FilaRevision`, rendered only when a bucket is selected; **disabled in demo** with the house `role="note"` message (`MENSAJE_DEMO_CATALOGO` pattern).
- A small creation surface: read-only bucket, `Nombre`, and a patrones editor reusing the existing `PatronesSection`/`PatronFila` shape, with the first patrón prefilled from the row description as `CONTAINS`.
- On success: set the originating row's edit to the new categoría id → invalidate `['categorias']` → re-run the preview with the **same `File`** already held in `SubirCartola` state, preserving `edits` → announce via `role="status"` how many rows changed suggestion.
- Focus returns to a stable, predictable target after the preview re-renders (the preview re-run passes through the loading state and the existing `previewHeadingRef` focus effect).

### Out of scope

- **Persisted transactions** — no retroactive reclassification of already-committed movimientos (issue #331 / US-062 owns that).
- **Editing or deleting** categorías/patrones from the preview. Creation only.
- **Mobile.** `apps/mobile` catalog surfaces (ADR-038) are untouched.
- Changing commit semantics: `commit-ingesta` already re-classifies untouched rows against the live catalog (D-11), so the preview re-run is a **visibility/UX** improvement, not a correctness fix.
- Priority editing for the new patrones (server default `100`, as in the existing `PatronInput`).
- Any new modal/backdrop primitive as a general design-system component.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `catalogo-clasificacion-ownership`: `POST /api/categorias` gains atomic creation of nested `patrones[]` with indexed per-patrón error reporting; contract-sync requirement (CAT038-09) extends to the new body. Next free IDs: **CAT038-10+**.
- `web-import-preview`: per-row categoría creation from the preview, plus the re-evaluation/announce rules. Next free IDs: **WEB-PRV-12+**.

## Approach (component/contract level — `sdd-design` owns the detail)

| Layer | Change |
|-------|--------|
| **domain** | None expected. `PatronClasificacion` and the nombre/bucket rules already exist; this composes them, it does not extend them. |
| **application** | The categoría-creation use case accepts an optional patrones list and persists both through **one transactional port call**. Domain errors keep flowing as `Result.fail` — no throws (ADR-005). Patrón validation runs **before** any write, so an invalid patrón never leaves a stray categoría behind. |
| **infrastructure (api)** | `categorias.schema.ts` gains an optional `patrones[]` (transport shape only, still `.strict()`); the route maps the result via `catalogo-http-error.ts`, extended to carry the failing patrón index. Persistence uses a Prisma transaction. |
| **contract** | `openapi.json` + `@moneydiary/api-client` regenerated in the same PR as the API change, so `openapi:check` stays green. |
| **web (api layer)** | `postCategoria(input: CategoriaInput & { patrones?: PatronInput[] }) → ApiResult<CategoriaDto>`; `useCrearCategoria` becomes `useMutation<CategoriaDto, …>` so callers can consume the new id. Existing call sites keep working (they simply ignore the payload). |
| **web (UI)** | New popup component + a "+" trigger in `FilaRevision`; the "create → adopt → refresh → re-preview → announce" orchestration lives in one named place so `FilaRevision` stays presentational. Errors surface through the existing closed `mensajeDeErrorCatalogo` map. |

### Open design choices (hand-off to `sdd-design`)

| # | Choice |
|---|--------|
| 1 | **Popup primitive:** Radix `Popover` (`ui/popover.tsx`, currently unused, portal + `w-72`) vs. the house non-modal `InlineConfirm` (`role="alertdialog"`, `aria-modal=false`, no overlay). DESIGN.md's house rule favors inline; the form is taller than `w-72`. Decide and justify — this is the single largest UX risk. |
| 2 | **Where the orchestration lives:** inside `SubirCartola` (owns `archivo`, `edits`, mutations) vs. a dedicated hook. `FilaRevision` must not grow business responsibility (SRP). |
| 3 | **`rowIndex` stability across two preview calls of the same `File`** — assumed deterministic (parser is file-order) but **not independently verified**. Design MUST verify it, since the whole `edits` overlay is keyed by it. |
| 4 | **Error shape for per-patrón failures:** index vs. echoed patrón string, and how `mensajeDeErrorCatalogo` (a closed code map) renders a row-scoped error without becoming stringly-typed. |
| 5 | **Web catalog DTO types:** `CategoriaDto`/`PatronDto` are hand-written in `apps/web/src/api/types.ts` under a *declared ADR-008 exception* whose stated reason ("`openapi.json` no documenta el catálogo") is now **stale** — `CategoriaResponse` exists in `@moneydiary/api-client`. Decide: adopt the generated type, or restate the exception honestly. Do not silently leave a false comment. |
| 6 | **Announcement copy and timing** for the `role="status"` diff ("N filas cambiaron su sugerencia"), including the zero case. |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/application/**` (categoría creation use case + catalog port) | Modified | Optional patrones, one transactional write |
| `apps/api/src/infrastructure/http-express/schemas/categorias.schema.ts` | Modified | Optional `patrones[]` |
| `apps/api/src/infrastructure/http-express/routes/categorias.routes.ts`, `catalogo-http-error.ts` | Modified | 201 body + indexed patrón errors |
| `apps/api/src/infrastructure/persistence/**` (catalog repository) | Modified | Transactional create |
| `apps/api/openapi.json`, `packages/api-client/src/types.gen.ts` | Regenerated | Contract sync (CI gate) |
| `apps/web/src/api/categorias.ts`, `use-crear-categoria.ts` | Modified | Return the created DTO; accept patrones |
| `apps/web/src/components/FilaRevision.tsx` | Modified | "+" trigger (bucket-gated, demo-disabled) |
| `apps/web/src/components/SubirCartola.tsx` | Modified | Adopt id, re-run preview, announce diff |
| `apps/web/src/components/` (new popup component) | New | Categoría + patrones creation form |
| `openspec/specs/{catalogo-clasificacion-ownership,web-import-preview}/spec.md` | Modified (delta) | New requirements |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `rowIndex` shifts between preview runs → `edits` land on the wrong rows (**silently wrong money classification**) | Medium | Design task 3: verify determinism of the parser ordering with a test that previews the same fixture twice and asserts identical row identity before wiring the re-run |
| Partial catalog state (categoría created, patrón rejected) | **Eliminated by design** | Single atomic transaction; validate all patrones before writing (locked decision 4) |
| A greedy `CONTAINS` patrón re-labels many unrelated rows at once | Medium | Rows are only *suggested*, never committed, until the user presses "Agregar transacciones"; the `role="status"` diff announcement makes the blast radius visible immediately |
| Demo mode shows a broken control | Low | "+" rendered but disabled with the house `role="note"` message (PRODUCT.md principle 4); server still enforces `DEMO_SOLO_LECTURA` |
| Focus/scroll lost when the preview re-renders (WCAG 2.2 AA, ADR-018) | Medium | The re-run reuses the existing `preview-listo` focus effect; spec pins the expected focus target and the live-region announcement |
| Contract drift (`openapi.json` vs. routes) | Low | `openapi:check` already gates CI; regeneration ships in the same PR |
| **Review budget:** this change will exceed the 400-line budget | **High** | `sdd-tasks` MUST forecast chained PRs. Likely boundary: **(1) API + contract + api-client regeneration** (inert for the UI: web keeps sending no patrones), **(2) web `postCategoria`/hook return-value change**, **(3) preview UI + re-evaluation**. |

## Rollback Plan

- **No database migration, no backfill.** `Categoria` and `PatronClasificacion` schemas are unchanged; this only changes *how many rows are written in one request*.
- **Web:** revert the PR — the "+" disappears; the preview flow returns to bucket→categoría selection. No persisted state depends on the feature.
- **API:** the `patrones[]` field is **additive and optional**; reverting it restores the previous request contract, and any client that never sent it is unaffected. Regenerate `openapi.json` + `api-client` on revert to keep `openapi:check` green.
- **Data:** categorías/patrones created through this path are ordinary catalog rows — indistinguishable from ones created in `/configuracion/categorias` and manageable there. Nothing to clean up.

## Dependencies

- None external. No new npm dependency is anticipated (`.npmrc` `minimum-release-age=10080` would otherwise apply). If design picks Radix `Popover`, it is **already installed** (`ui/popover.tsx` exists).

## Success Criteria (BDD outline — `sdd-spec` owns the normative form)

- [ ] **Atomic create** — Given a valid nombre and two patrones, When the user saves, Then one request creates the categoría and both patrones; And when any patrón is invalid, Then nothing is persisted and the response names the failing patrón.
- [ ] **"+" visibility rule** — Given no bucket is selected on a row, Then the "+" is not rendered; And given a bucket is selected, Then it is.
- [ ] **Prefilled patrón** — Given the user opens the popup from a row, Then the first patrón is prefilled with that row's description as `CONTAINS`, editable and removable; And saving with zero patrones succeeds.
- [ ] **Originating row** — Given the categoría is created, Then that row shows the new categoría as an explicit edit, even when no patrón matches its description.
- [ ] **Untouched rows re-suggested** — Given other untouched rows whose description matches a new patrón, When the preview re-runs, Then they show the new categoría as `sugerido`.
- [ ] **Edited rows preserved** — Given a row the user had already overridden, When the preview re-runs, Then its override is preserved regardless of the new patrones.
- [ ] **Status announcement** — Given the preview re-ran, Then a `role="status"` region announces how many rows changed suggestion (including the zero case).
- [ ] **Demo read-only** — Given a demo session, Then the "+" is disabled with the house note; And a direct API call returns `403 DEMO_SOLO_LECTURA`.
- [ ] **Error display** — Given a duplicate nombre (409) or an invalid REGEX (400), Then the popup stays open, shows the mapped message from the closed catalog-error map, and nothing was persisted.
- [ ] **No regression** — the existing `/configuracion/categorias` creation flow and the commit path (`WEB-PRV-06`) behave exactly as before.

## Next step

Run **`sdd-spec`** and **`sdd-design`** in parallel against this proposal.
`spec` owns the requirement deltas (`CAT038-10+`, `WEB-PRV-12+`) in Given/When/Then with RFC 2119 keywords.
`design` owns open choices 1–6; **choice 3 (`rowIndex` stability) blocks `apply`**.
