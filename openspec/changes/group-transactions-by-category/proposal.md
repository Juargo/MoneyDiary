# Proposal — Group transactions by category

- **Change slug**: `group-transactions-by-category`
- **User request (verbatim)**: "quiero hacer que la sección de transacciones se agrupen por categorías."
- **Scope**: web only (`apps/web`) + one incidental backend contract fix (`apps/api`)
- **Status**: proposed — ready for spec + design

---

## Why / Problem

Today the dashboard's "transactions section" (the right-hand panel,
`apps/web/src/components/ResumenScreen.tsx:125-134`) shows **one category's
transactions at a time**. The user must click a pie slice or legend entry to
swap the panel to a single bucket via `BucketDetailList` →
`GET /api/buckets/:bucket`. There is no way to see the whole month's spending
as a categorized list in place — you can only inspect buckets one by one.

The product value: let the user read the month's transactions grouped by
category (the 50/30/20 `Bucket`s) in a single, always-visible list, so the
categorized shape of their spending is legible at a glance instead of behind a
click-through.

**Incidental correctness win**: the endpoint that already returns all of a
period's transactions, `GET /api/movimientos`, leaks the **raw physical DB
bucket id** (e.g. `'bucket-necesidades'`) straight through the HTTP DTO
(`prisma-movimientos-mes.repository.ts:54` → `movimiento-mes.dto.ts:19,52`).
Its sibling read repositories (`prisma-resumen-mes.repository.ts:52-55`,
`prisma-resumen-anual.repository.ts:70-76`) correctly fold that id to the domain
`Bucket` enum via `BUCKET_ID_TO_BUCKET` (`bucket-ids.ts:29`), mapping
null/unrecognized → `Bucket.SinCategoria`. `movimientos` does not, and
`movimientos.controller.spec.ts` has **zero assertions** on the bucket field
shape — a genuine, untested Clean Architecture boundary leak (an infra detail
reaching the client). Building the grouping on this endpoint is the natural
moment to close that gap.

---

## What changes

Concrete surface, front to back:

1. **API — fold the bucket id to the domain enum** (correctness fix):
   - In `PrismaMovimientosMesRepository.findByPeriodo`, resolve the raw
     `bucketId` to the domain `Bucket` via `BUCKET_ID_TO_BUCKET`, folding
     `null`/unrecognized → `Bucket.SinCategoria`, exactly as
     `prisma-resumen-mes` already does.
   - Propagate the type through the port (`MovimientosMes` reader row) and the
     HTTP DTO (`movimiento-mes.dto.ts`): the per-row field becomes the domain
     category (`bucket: Bucket`) instead of a raw physical `bucketId: string`.
   - Add the missing spec assertions on the folded category value.

2. **Web — consume the month's transactions**:
   - New query hook `apps/web/src/api/use-movimientos.ts` consuming
     `GET /api/movimientos?periodo=` (this endpoint is currently unused by the
     web), plus the hand-written DTO types in `apps/web/src/api/types.ts`.

3. **Web — pure grouping view-model**:
   - New `apps/web/src/domain/agrupar-movimientos-por-bucket.ts`, mirroring the
     existing `detalle-bucket-view-model.ts` pattern: group flat rows by
     `Bucket`, compute per-group subtotal + transaction count from the amounts
     already present, sort each group's rows **date descending**, and emit
     **only non-empty** groups. Pure function, no I/O.

4. **Web — dashboard panel behavior change**:
   - The right panel now renders **all** of the month's groups (grouped list),
     replacing the single-bucket-at-a-time `BucketDetailList` behavior in the
     dashboard. Each group shows a header of the form
     `Necesidades · $320.000 · 12 mov` (name · subtotal · count), computed
     client-side.

5. **Web — pie/legend becomes navigation**:
   - Clicking a pie slice or legend entry no longer swaps the panel to one
     bucket; it **scrolls to and highlights** that category's group in the
     always-visible list.

---

## Chosen approach

**Frontend-first regrouping on the existing `/api/movimientos` endpoint, with a
one-line backend fold fix.** Grouping is a pure client-side transform over a
field that is already present on every row — no new domain, money, or IA logic
is required server-side. Reuse the existing hook + view-model patterns
(`useDetalleBucket`, `aDetalleBucketViewModel`) rather than inventing new ones.

Rejected alternatives:

- **New/changed endpoint returning pre-grouped transactions server-side** —
  over-engineering (YAGNI). Grouping by an already-present per-row field is a
  presentation concern; pushing it into the API adds a new contract shape,
  server aggregation, and tests for logic the client can do in one pass.
- **Iterate the existing `/api/buckets/:bucket` five times client-side** — an
  N+1 request pattern (5 round trips per period), worse UX/perf, and it ignores
  `/api/movimientos` (which already returns everything in one call).

---

## Scope

### In-scope
- The API bucket-id → domain `Bucket` fold on `GET /api/movimientos` (+ its
  missing test assertion).
- Web hook + pure grouping view-model + grouped-list UI in the dashboard right
  panel.
- Pie/legend click → scroll-to + highlight the target group.
- Group headers with client-computed subtotal + count; per-group date-desc sort;
  only non-empty groups shown.

### Non-goals
- **No new endpoint or DTO reshape beyond the fold** (no pagination, no
  server-side grouping).
- **No inline category editing** (US-013 stays deferred).
- **No cross-month / multi-period grouping** — single selected period only.
- **Mobile is untouched** — web only.
- **The standalone `/buckets/:bucket` route and its DTO stay as-is** for deep
  links; this change does not touch `detalle-bucket.controller.ts` or
  `use-detalle-bucket.ts`.

---

## Impact

**Files / areas touched**

- `apps/api`:
  - `src/infrastructure/persistence/prisma-movimientos-mes.repository.ts` (fold)
  - `src/application/ports/movimientos-mes.port.ts` (row type: `bucket`)
  - `src/application/use-cases/obtener-movimientos-mes.use-case.ts` (result type)
  - `src/infrastructure/http/dto/movimiento-mes.dto.ts` (DTO field + mapper)
  - `src/infrastructure/http/movimientos.controller.spec.ts` (add category assertions)
  - `bucket-ids.ts` is **reused as-is** (no change) via `BUCKET_ID_TO_BUCKET`.
- `apps/web`:
  - `src/api/use-movimientos.ts` (new), `src/api/types.ts` (new DTO types)
  - `src/domain/agrupar-movimientos-por-bucket.ts` (new pure view-model)
  - `src/components/` grouped-list component (new) +
    `src/components/ResumenScreen.tsx` (wire panel + pie→scroll/highlight)

**Backward compatibility**

- The `/api/movimientos` per-row bucket field changes from the raw physical id
  (`'bucket-necesidades'`) to the domain enum value (`'Necesidades'`). This is a
  contract change, but the web does **not** consume this endpoint today and
  mobile consumes `/api/resumen`, not `/api/movimientos` — so the effective
  blast radius is the endpoint's own e2e/API tests plus the brand-new web
  consumer. **Spec must confirm no other consumer depends on the raw id** before
  finalizing the field rename.
- `/buckets/:bucket` (route, controller, DTO, `useDetalleBucket`) is untouched
  and keeps working for deep links.

---

## Risks & mitigations

- **SinCategoria fold must ADD, not overwrite** — same SC-03 caution as
  `resumen-mes`: `null`/unrecognized bucket ids fold **into** the `SinCategoria`
  group; recognized ids must never be silently reclassified. Mitigation: mirror
  the exact `BUCKET_ID_TO_BUCKET` + null-fallback logic already proven in
  `prisma-resumen-mes`, and assert it in the controller spec.
- **Money precision** — subtotals are computed from the exact string amounts
  (`cargo`/`abono` serialized as `String(bigint)`), never parsed to `float`.
  Aggregate as `BigInt`/integer minor units in the view-model and format for
  display only. (RF-VIS-001/008 discipline.)
- **Accessibility of scroll + highlight** (ADR-018, WCAG 2.2 AA) — the
  pie→group navigation must be keyboard-reachable, must not rely on color alone
  for the highlight, and should respect reduced-motion for the scroll. Flag for
  the design phase.
- **Field rename contract risk** — see backward-compat note; gate the rename on
  a consumer check in spec.
- **Panel behavior regression** — replacing single-bucket `BucketDetailList` in
  the dashboard could regress the existing pie-selection UX. Mitigation: keep
  the pie as navigation (scroll/highlight), don't remove the interaction.

---

## Open questions

1. **Field name on the DTO** — rename `bucketId` → `bucket` (honest: it is now a
   domain category, not an id), or keep the `bucketId` key with enum values for
   a smaller diff? Recommendation: rename, since the web consumer is new and
   blast radius is low; confirm in spec.
2. **Group order in the list** — the approved decisions fix within-group sort
   (date desc) and non-empty-only, but not the order of the groups themselves
   (e.g. Necesidades → Deseos → Ahorro → Ingreso → SinCategoria vs. by
   subtotal). Recommendation: fixed domain order matching the pie; confirm in
   spec/design.
3. **`BucketDetailList` reuse vs. replace** — does the new grouped list reuse
   `BucketDetailList` per group (composition) or a new row renderer? Design call.

---

## Acceptance at a glance

- `GET /api/movimientos` returns each row tagged with the domain `Bucket`
  (folded via `BUCKET_ID_TO_BUCKET`, null → `SinCategoria`), asserted by test.
- The dashboard right panel shows **all** non-empty category groups for the
  selected period at once.
- Each group header shows category name · subtotal · count, computed
  client-side from exact amounts.
- Rows within a group are sorted date descending.
- Clicking a pie slice/legend entry scrolls to and highlights that group
  (keyboard-accessible, not color-only).
- `/buckets/:bucket` deep-link route is unchanged.

---

## Review Workload / delivery

- **Delivery strategy**: `ask-on-risk`.
- **Rough size**: ~350–450 changed lines including tests (API fold + spec ~50;
  web hook + types ~40; view-model + tests ~120; grouped-list UI + wiring +
  tests ~200). **Borderline against the 400-line single-PR budget.**
- **Recommendation**: fits one PR if the UI stays lean; if it trends over
  budget, the natural split is two slices — (1) the backend fold + DTO contract
  fix (self-contained, testable, low risk), then (2) the web hook + view-model +
  grouped-list UI. Decide at `sdd-tasks` per the Review Workload Guard.
