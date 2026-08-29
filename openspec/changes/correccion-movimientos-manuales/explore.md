# Exploration: Correction path for committed manual movements

> SDD change `correccion-movimientos-manuales` — explore phase (2026-08-29).
> Canonical copy also in Engram: `sdd/correccion-movimientos-manuales/explore`.
> Persisted by the orchestrator from the engram artifact (the explore agent
> lacked file-write tooling; content unchanged).

## Current State

**Data model (`apps/api/prisma/schema.prisma:182-216`).** `Transaccion.ingestaId` is nullable (`String?`), relation `ingesta Ingesta? @relation(onDelete: Restrict)` (explicitly pinned, not Prisma's default `SetNull`). `origen String?` holds `null` (ingesta-born) or `'Manual'` (ADR-039 C-a semantics). DB-level CHECK `Transaccion_origen_ingesta_consistency` enforces `(ingestaId IS NULL) = (origen IS NOT DISTINCT FROM 'Manual')` — a manual row structurally cannot have an `ingestaId`, and vice versa. `accountId` is NOT NULL always; manual rows point to a per-user sentinel `Account(banco='Manual', tipoCuenta='Manual')` created via idempotent upsert on `@@unique([userId, banco, tipoCuenta, numeroCuentaBlindIndex])` (never null blind index, ADR-039). No `onDelete: Cascade` from `Transaccion` to anything else — a `Transaccion` is a leaf node; deleting one row has zero cascade blast radius elsewhere in the schema.

**Computation model — no cache, no denormalization.** `ObtenerMovimientosMesUseCase`, `ObtenerDetalleBucketUseCase`, and the resumen/semáforo readers all query `Transaccion` fresh per request. No Redis, no cache layer found anywhere in `apps/api/src`. Deleting or editing a manual movement takes effect on the very next read with zero invalidation logic — the semáforo/resumen just recompute.

## Affected Areas

- `apps/api/prisma/schema.prisma` — `Transaccion` model; no migration needed to identify manual rows (origen/CHECK already exist from ADR-039); a migration WOULD be needed only if a correction feature needs new state (e.g., an audit/undo-window table).
- `apps/api/src/application/use-cases/eliminar-ingesta.use-case.ts` + `apps/api/src/infrastructure/persistence/prisma-eliminar-ingesta.repository.ts` + `apps/api/src/application/ports/eliminar-ingesta.port.ts` — direct structural template for a single-movement delete: demo gate before touching the writer, `deleteMany`-based ownership gate (`count === 0` → 404, anti-enumeration).
- `apps/api/src/application/use-cases/reclasificar-transaccion.use-case.ts` + its port/repository — the ONLY existing edit precedent, and it is narrow: `updateMany` mutates ONLY `categoriaId`/`bucketId`. Zero precedent for mutating `monto`/`fecha`/`descripcion` anywhere in the codebase today.
- `apps/api/src/domain/errors/transaccion-no-encontrada.error.ts` — already exists, reusable as-is (same anti-enumeration contract).
- `apps/api/src/infrastructure/http-express/routes/movimientos.routes.ts` — today only `GET`/`POST /movimientos`; a `DELETE`/`PATCH /movimientos/:id` would be a new sibling handler in the same file (established pattern, D-12/T-19).
- `apps/api/src/infrastructure/http-express/routes/ingesta.routes.ts:218-257` — `DELETE /ingestas/:id` is the exact HTTP-layer template (demo gate → use case → 404 → `responderErrorTraducido` chokepoint, issue #507).
- `apps/web/src/components/RegistrarMovimientoForm.tsx` (lines ~55-56, 617-626, 706) — `MENSAJE_PERMANENCIA` ("no se puede editar ni eliminar después") is hardcoded and rendered in two sites (always-visible note + confirm dialog); becomes factually wrong the moment any correction path ships and MUST be rewritten in both.
- `apps/web/src/components/EliminarIngestaControl.tsx` — the InlineConfirm-based per-row delete trigger to mirror (destructive variant, per-row aria-label, error stays open in dialog for retry, success announced by the parent list because the control unmounts with the row).
- `apps/web/src/components/ReclasificarCategoriaControl.tsx` — the second InlineConfirm consumer; diverges from EliminarIngestaControl on error handling (closes/resets on error) — read both before choosing behavior for a new control.
- `apps/web/src/components/IngresosMesTable.tsx` — the ONLY UI surface today visibly badging `origen` ('Manual' vs bank) as a `<Badge variant="secondary">` column (US-052/US-054).
- `apps/web/src/components/BucketDetalleMesPage.tsx` + `GrupoMovimientos` — the gasto-side movement list does NOT currently render an origen badge; `DetalleBucketRow.banco` (detalle-bucket port) already carries the raw signal (`row.account.banco || 'Manual'`, ADR-039 D-06) but whether it survives to the DTO/view-model (`detalle-bucket-mes.dto.ts` → `detalle-bucket-mes-view-model.ts`) is UNCONFIRMED — verify, do not assume.
- `apps/mobile/src/components/detalle/IngresosMesScreen.tsx`, `BucketDetalleScreen.tsx`, `GrupoMovimientosMobile.tsx` — mobile renders the same read model (shows manual rows, no origen badge in the inspected paths), has NO registration form and NO correction affordance; per ADR-038 mobile writes are perfil + catalog CRUD + ingesta upload only.
- `apps/api/openapi.json` — generated via `pnpm openapi:emit`; CI-gated `openapi:check` (ADR-011); any new route needs a Zod schema + regen or CI fails.
- `apps/web/src/api/movimientos.ts` — hand-written fetch client (no generated `@moneydiary/api-client`; ADR-012 stays YAGNI-deferred); a new endpoint needs a hand-written sibling fn following `postMovimientoManual`'s exact `ApiResult`/response-guard pattern.

## Solution Space (facts only — for the proposal phase to weigh)

1. **Hard DELETE scoped to `origen='Manual'`** (mirror of EliminarIngesta end to end):
   - Layers: no new domain error (`TransaccionNoEncontradaError` reused) · 1 new ISP-narrow port · 1 thin use case (demo-gate-first) · 1 Prisma repository (`deleteMany({ where: { id, origen: 'Manual', account: { userId } } })`, single statement, no `$transaction` — leaf row) · 1 route handler (`DELETE /movimientos/:id`) · 1 web control (mirrors EliminarIngestaControl) · openapi regen · rewrite `MENSAJE_PERMANENCIA`.
   - The `origen: 'Manual'` WHERE clause makes the scoping airtight against ingesta-born rows (same CHECK invariant) — cannot become a backdoor for cartola-derived transactions.
   - Constraints: demo gate (`esDemoDeSesion` pattern) · ADR-038 gap (new write surface → needs its own ADR).
   - Size: smallest of the three; near-verbatim mirror of an already-reviewed pattern.

2. **Short-window undo post-commit**:
   - No TTL/expiry/scheduler machinery exists for movements. Client-side-only variant = option 1's DELETE + a UI timer (not a distinct backend approach; redundant once a plain delete exists — UNLESS product wants deletion deliberately RESTRICTED to a short window, which is a product decision, not engineering). Server-tracked variant = new state (column/table + expiry) for little gain over option 1 + the already-shipped confirm dialog.

3. **Full edit (`monto`/`fecha`/`descripcion` PATCH)**:
   - Same shape as option 1 but `updateMany` + the ENTIRE creation-time validation surface reopened (`MovimientoManualInvalidoError`, `CategoriaFueraDeCatalogoError`, `BucketCategoriaNoConcuerdaError`: money positivity/overflow, fecha ≤ today, bucket/categoría membership) + partial-update Zod schema + response DTO.
   - First-ever mutation of money fields post-persist in the codebase — hardest-constrained by "exact money always" (ADR-024, plan de pruebas): needs creation-grade test rigor, not a lighter touch.
   - Size: medium-high; highest product value (actually fixes the fat-finger instead of delete-and-retype).

## Contract & Cross-Client Evidence

- ADR-011: CI `openapi:check` blocks on drift; new route ⇒ Zod schema + `openapi:emit` in the same PR. No generated client to regen (ADR-012 deferred); web and mobile hand-write fetch fns.
- ADR-038 / mobile: zero movement-write affordance on mobile today; web-only v1 is technically safe (readers are transparent to the row disappearing/mutating) — whether it's the right product call is a scope question for the proposal.

## Recommendation

Option 1 (hard DELETE scoped to `origen='Manual'`) has the strongest evidence: near-verbatim mirror of an already-reviewed, battle-tested pattern; the ADR-039 CHECK makes the scoping airtight; leaf row + per-request computation = zero cascade/cache concern. Option 3 (edit) is highest-value but highest-risk (first money-field mutation post-persist; creation-grade validation rigor required). Treat delete and edit as SEPARABLE, independently-shippable slices. Option 2 collapses into option 1 + a UI timer unless product explicitly wants deletion time-boxed — ask, don't assume.

Proposal phase must decide: (a) delete-only v1 vs delete+edit; (b) time-boxed deletion or not; (c) web-only vs web+mobile v1; (d) the new ADR amending ADR-038's write-surface boundary (enmienda pattern per ADR-026/038/039 precedent).

## Risks

- New write surface not covered by ADR-038 — needs its own scope-amendment ADR before any route ships.
- `MENSAJE_PERMANENCIA` hardcoded + rendered twice — ship the correction path without updating both and the UI actively lies.
- If edit is chosen: money-exactness test rigor must match `RegistrarMovimientoManualUseCase`'s creation-time validation.
- Mobile parity gap (see-but-can't-fix) — explicit product decision for v1, not a default.
- Gasto/bucket-detail origen visibility through the DTO/view-model chain is UNCONFIRMED — verify in spec/design if the affordance must appear there, not just on Ingresos.

## Ready for Proposal

Yes — facts gathered across all six requested investigation areas.
