# Exploration: cartola upload — resumen + "subir tal cual" vs "editar antes de subir" (web + mobile)

> Canonical copy of Engram `sdd/cartola-preview-confirmacion/explore` (hybrid store).

## Current State (verified from code, not memory)

### Backend (`apps/api`) — already fully supports the request

- `POST /api/ingestas/preview` (read-only, no writes by construction — `PreviewIngestaUseCase` has zero persistence ports) returns per-row `filas[]` with `rowIndex`, `fecha`, `descripcion`, `cargo`/`abono` (BigInt-safe strings), `esDuplicado`, `sugerido: {bucket, categoriaId}` plus an aggregate `resumen: {totalFilas, duplicadosDetectados, nuevas}`. Also carries a deprecated legacy shim (`estructura.totalFilasDatos` + `muestra` ≤50 rows, no per-row dedup/suggestion) kept only for the not-yet-migrated mobile client.
- `POST /api/ingestas/commit` (`multipart/form-data`: `file` + `edits: [{rowIndex, categoriaId}]`) re-parses the file server-side, re-runs dedup against current DB, applies the edits overlay, validates `categoriaId` belongs to the caller's own catalog, persists atomically, returns `{ingestaId, totalTransacciones, duplicadosOmitidos, transacciones[]}`.
- One-shot `POST /api/ingestas` (parse + persist + categorize in one call, no preview) is `deprecated: true` in `openapi.json` but still live and unchanged — mobile's only consumer today. Physical removal tracked by (never-shipped) US-061.
- Routes: `apps/api/src/infrastructure/http-express/routes/ingesta.routes.ts`. Spec: `openspec/specs/ingesta-preview-commit/spec.md`.

### Web (`apps/web`) — functionally satisfies almost all of the ask (US-059, live)

- Archived change `2026-08-22-us-059-import-preview-web`, spec `openspec/specs/web-import-preview/spec.md`.
- `SubirCartola.tsx` state machine: `idle → previsualizando → preview-listo → subiendo → exito` (+ `preview-error`).
- On preview success: `resumen` header (totalFilas / duplicadosDetectados / nuevas) + "nothing saved yet" affordance + a full editable table of every row (no pagination).
- Duplicate rows render greyed/disabled; non-duplicate rows get a bucket → categoría cascade select from the user's own catalog (`useCategorias` + `agruparPorBucket`); edits are optional.
- A single "Agregar transacciones" button commits (with whatever edits were made, possibly none) via `POST /api/ingestas/commit`; "Descartar" resets (preview wrote nothing).
- Inline "+ Nueva categoría" creation mid-review (`crear-categoria-desde-preview`, archived 2026-08-31).
- **Gap vs literal ask:** no explicit binary choice UI ("subir tal cual" button vs "editar antes de subir" button) — editing is simply available inline before the single commit action.

### Mobile (`apps/mobile`) — old pre-US-057 preview, no editing

- `app/subir.tsx` (US-003, archived `2026-08-09-us-003-vista-previa`, predates US-057/059): pick file → `previewIngesta()` reading only the deprecated legacy shape (`banco`, `estructura.totalFilasDatos`, `muestra` ≤50 rows; no `esDuplicado`, `sugerido`, `rowIndex`, `resumen`) → 10/25/50 client-side row selector (`sliceMuestra`) → **Confirmar** calls `postIngesta()` (deprecated one-shot `POST /api/ingestas`, full re-upload, not `/commit`) or **Cancelar**.
- US-003's proposal scoped editing as OUT, written before US-057 added per-row dedup/suggestion.
- Mobile does NOT show duplicate status, suggested classification, or a bucket/categoría editor. **This is the real gap.**
- Supporting infra already exists: `src/api/categorias.ts` (`fetchCatalogo`), `src/domain/agrupar-categorias-por-bucket.ts`, `src/domain/catalogo-constantes.ts` (`BUCKETS_ASIGNABLES`), `enviarMutacion`. Canonical DTOs already generated in `@moneydiary/api-client`; mobile's `preview-ingesta.ts` / `post-ingesta.ts` alias the old types only. No backend or codegen change needed.

### Correction to CLAUDE.md's ADR-038 summary

The root `CLAUDE.md` says mobile write scope excludes "reclasificar transacciones", but US-056 already shipped mobile reclassification of persisted transactions (`PATCH /api/transacciones/:id/categoria`, `apps/mobile/src/api/categorias.ts::reclasificarCategoria`, `apps/mobile/src/components/detalle/ReclasificarMobileControl.tsx`). Editing classification of not-yet-persisted preview rows via the `/commit` overlay is a smaller-scoped variant; likely a doc correction, not a new ADR — to be confirmed explicitly.

## Affected Areas

- `apps/mobile/app/subir.tsx` — canonical `resumen`/`filas` render + edit UI + `/commit` call.
- `apps/mobile/src/api/preview-ingesta.ts` — switch to canonical types; guard requires `filas`/`resumen`.
- `apps/mobile/src/api/commit-ingesta.ts` (new) — multipart `file` + `edits` JSON.
- `apps/mobile/src/api/post-ingesta.ts` — retire or keep (open question).
- `apps/mobile/src/domain/preview-cartola.ts` — adapt view-model to per-row shape (dedup badge, sugerido).
- `apps/web/src/components/SubirCartola.tsx` — only if an explicit two-choice step is wanted.
- `docs/adr/ADR-038-*.md` / CLAUDE.md row — wording correction (pre-existing drift).
- `openspec/specs/ingesta-preview-commit/spec.md` "Client Consumers" — stale "mobile not implemented" note.

## Approaches

1. **Mobile: adopt canonical preview + commit, mirror web's edit UX (recommended).**
   - Pros: full parity, zero backend change, reuses catálogo infra, retires deprecated one-shot, respects ADR-024.
   - Cons: heaviest slice; per-row editing on small screens is a real UX design problem.
   - Effort: Medium-High (mobile); web none-to-Low.
2. **Mobile minimal: canonical data + `/commit` with empty overlay, no editing UI.**
   - Pros: ~150-250 lines, low risk.
   - Cons: does not satisfy "editar antes de subir" on mobile.
   - Effort: Low-Medium.
3. **Explicit two-button gate ("Subir tal cual" / "Revisar y editar") on both platforms.**
   - Pros: most literal match; lighter path for the no-edit case.
   - Cons: new step on web of unproven value (YAGNI/KISS tension).
   - Effort: Low; folds into 1 or 2.

## Recommendation

Approach 1 for mobile; Approach 3 as an explicit product decision (lean against). Tentative chain for the 400-line budget: (1) mobile API client swap → (2) mobile resumen/dedup UI → (3) mobile bucket/categoría editor + `/commit` → (4) optional web explicit-choice UI → docs slice (ADR-038 row, stale spec note).

## Constraints Checked

- **ADR-024:** clients render `esDuplicado`/`sugerido` as given, never re-derive.
- **ADR-026/038:** pre-commit classification edits are a smaller extension of shipped US-056; confirm no ADR needed.
- **ADR-039/040:** not implicated.
- **ADR-018:** mobile per-row editors need accessible labels; mobile a11y verification is manual.
- **E2E three viewports:** only if web UI changes; Maestro flows (`.maestro/subir*.yaml`) need updates.
- **400-line budget:** mobile editor slice is highest risk.

## Risks

- No existing mobile precedent for a multi-row inline editor (closest: single-record `EditarCategoria.tsx` / `CategoriaFila.tsx`).
- Stable `rowIndex` across re-preview matters only if mobile adds inline categoría creation.
- ADR-038 doc drift may confuse scope review.
- Stale `ingesta-preview-commit` client-consumers note.

## Open Product Questions

1. Explicit two-button up-front choice, or is the single review screen with one commit button acceptable on both platforms?
2. Mobile editor: full bucket → categoría cascade per row, or tap-a-row picker sheet?
3. Mobile: keep 10/25/50 row selector or full scrollable list?
4. Inline "+ Nueva categoría" on mobile review: in scope or deferred?
5. ADR-038 row + stale spec note: fixed in this change or tracked separately?
6. Retiring mobile's use of deprecated one-shot `POST /api/ingestas` (US-061): in scope?

## Ready for Proposal

Yes, once questions 1 and 2 (which shape the mobile slice) are confirmed.
