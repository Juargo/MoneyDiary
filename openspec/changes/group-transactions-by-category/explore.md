# Exploration — group-transactions-by-category

**Change**: `group-transactions-by-category`
**User request (verbatim)**: "quiero hacer que la sección de transacciones se agrupen por categorías."
**Phase**: sdd-explore · **Store**: hybrid (Engram `sdd/group-transactions-by-category/explore` + this file)
**Status**: done

## Domain framing

"Categorías" maps to the 50/30/20 **buckets** defined in
`apps/api/src/domain/value-objects/bucket.ts` — 5 values:
`Necesidades`, `Deseos`, `Ahorro`, `Ingreso`, `SinCategoria` (fallback).

## Current state (evidence)

- Web has **no "all transactions" screen** and **no `use-movimientos` hook**. `GET /api/movimientos`
  is currently unused by the frontend (`apps/web/src/api/` only has `use-resumen.ts`,
  `use-detalle-bucket.ts`, `use-resumen-anual.ts`).
- Today's "transactions section" = `apps/web/src/components/BucketDetailList.tsx`, embedded as a
  **single-bucket** panel in `ResumenScreen.tsx:125-134`, driven by click-to-select on a pie slice
  (`ResumenScreen.tsx:81-89`) → `GET /api/buckets/:bucket?periodo=`
  (`apps/api/src/infrastructure/http/detalle-bucket.controller.ts`).
- `GET /api/movimientos` already returns **all** transactions for a period, each tagged with a bucket —
  but it leaks the **raw physical DB id** instead of the folded domain enum.

## Verified architecture-boundary leak

- `prisma-movimientos-mes.repository.ts:54` returns `bucketId: row.bucketId` (raw physical id,
  e.g. `'bucket-necesidades'`), **unfolded**.
- `prisma-resumen-mes.repository.ts:52-55` and `prisma-resumen-anual.repository.ts` correctly fold
  via `BUCKET_ID_TO_BUCKET` (`bucket-ids.ts`), mapping `null`/unrecognized → `Bucket.SinCategoria`.
- `BUCKET_ID_TO_BUCKET` (`bucket-ids.ts:29`) is the shared single source of truth for the fold.
- `movimientos.controller.spec.ts` has **zero assertions** on `bucketId` shape → untested gap.

## Gap

To "group by category" we need per-transaction data carrying the **domain** category, then group it.
The data is already fetched per row; the missing pieces are (1) the DTO exposing the folded `Bucket`
instead of the raw id, (2) a web hook to consume `/api/movimientos`, (3) a grouping view-model + UI.

## Approach options

1. **(Recommended) Fix the DTO fold + client-side grouping.**
   Fold `bucketId → Bucket` in the movimientos DTO/mapper (reuse `BUCKET_ID_TO_BUCKET`, mirror the
   resumen-mes pattern), add a `useMovimientos` hook + a pure `agrupar-movimientos-por-bucket`
   view-model (same shape as `detalle-bucket-view-model.ts`), and a new grouped-list component.
   Low effort, low risk, single round trip. Respects Clean Architecture (fixes a boundary leak rather
   than creating one) and userId isolation (already structural in the repo WHERE).
2. **New/changed endpoint returning pre-grouped data.** Rejected — grouping by an already-present
   per-row field is a pure client transform, not new domain logic. Over-engineering (YAGNI).
3. **Iterate `useDetalleBucket` across all 5 buckets.** Rejected — N+1 requests, worse perf/UX,
   ignores the existing `/api/movimientos` endpoint.

## Open product questions

1. **Which screen owns this?** The dashboard panel (replacing single-bucket selection), a new
   dedicated "all transactions" screen, or the `/buckets/:bucket` route?
2. **Empty groups**: show all 5 category groups always, or only groups with transactions that period?
3. **Sort**: order within each group (date? amount?) and order across groups?
4. **`SinCategoria`**: stays a distinct, always-visible group (current convention elsewhere)?

## Scope boundaries / non-goals

- No new categorization logic, no IA (RES-ALC-003).
- No inline editing of a transaction's category (that is US-013, deferred).
- Grouping is per selected month/period; no cross-month grouping.
