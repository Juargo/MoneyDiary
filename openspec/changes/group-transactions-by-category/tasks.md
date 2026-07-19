# Tasks: Group transactions by category

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350-450 total (backend ~130-170, web ~220-280) |
| 400-line budget risk | High as single PR / Low per slice |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: backend fold → PR 2: web grouped panel |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — recommend stacked-to-main (PR 2 only needs PR 1 merged, not review-coupled) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Backend `bucket` fold (port + repo + DTO + tests) | PR 1 | Self-contained, deployable alone; base = main |
| 2 | Web grouped panel (hook + view-model + component + wiring) | PR 2 | Depends on PR 1's DTO contract; base = main (stacked) or PR 1 branch (feature-branch-chain) |

## Phase 1: Backend — Fold (Foundation)

- [x] 1.1 [TEST] `prisma-movimientos-mes.repository.spec.ts` (new): recognized id → its `Bucket`, `null` → `SinCategoria`, unrecognized → `SinCategoria`, per-row independence (MOV-01)
- [x] 1.2 `movimientos-mes.port.ts`: `MovimientoMesRow.bucketId: string|null` → `bucket: Bucket` (MOV-01)
- [x] 1.3 `prisma-movimientos-mes.repository.ts`: fold via `BUCKET_ID_TO_BUCKET`, mirroring `prisma-resumen-mes` — makes 1.1 pass (MOV-01)
- [x] 1.4 `movimiento-mes.dto.ts`: field `bucketId` → `bucket: string`, mapper pass-through (MOV-01)

## Phase 2: Backend — Controller & Consumer Audit

- [x] 2.1 Grep-confirm no consumer outside movimientos' own tests depends on raw `bucketId` shape (MOV-03)
- [x] 2.2 [TEST] `movimientos.controller.spec.ts`: DTO exposes folded `bucket`, no `bucketId` (MOV-01)
- [x] 2.3 Confirm `obtener-movimientos-mes.use-case.ts` needs no code change (type pass-through only)

## Phase 3: Backend — Integration/E2E

- [x] 3.1 [TEST] `test/movimientos-mes.int-spec.ts`: `found!.bucketId` null assertion → `found!.bucket === Bucket.SinCategoria`; add seeded categorized row asserting fold to `Necesidades` (MOV-01)
- [x] 3.2 [TEST] `test/movimientos.e2e-spec.ts`: `tx.bucketId` null → `tx.bucket === 'SinCategoria'`; add categorized-row case; keep userId isolation and `>MAX_SAFE_INTEGER` money-string exactness assertions (MOV-02)
- [x] 3.3 Run `pnpm api test` full green; confirm `/api/buckets/:bucket` DTO/tests unchanged (MOV-03)

## Phase 4: Web — API layer (Foundation)

- [x] 4.1 `src/api/types.ts`: add `MovimientoMesItemDto` (`bucket: string`) + `MovimientosMesDto`
- [x] 4.2 [TEST] client guard unit test: malformed `cargo`/`abono`/`fecha`/`bucket` → `ApiError` tag `parse`, never reaches `BigInt`/`formatearMontoCLP`
- [x] 4.3 `src/api/client.ts`: add `fetchMovimientos`, reusing `esMontoStringValido`/`esFechaValida` guards — makes 4.2 pass
- [x] 4.4 `src/api/use-movimientos.ts` (new): `useMovimientos(periodo)` mirroring `useDetalleBucket`

## Phase 5: Web — View-model (money-exact)

- [x] 5.1 [TEST] `agrupar-movimientos-por-bucket.spec.ts`: `ORDEN_GRUPOS` fixed order (WG-02), non-empty-only groups (WG-01), date-desc + tiebreak within group (WG-03), count + subtotal per header (WG-04), BigInt `>MAX_SAFE_INTEGER` exactness (WG-04), Ingreso subtotal = Σabono, spending = Σcargo
- [x] 5.2 `agrupar-movimientos-por-bucket.ts` (new): implement `aMovimientosAgrupadosViewModel` + view-model shapes per design §3 — makes 5.1 pass

## Phase 6: Web — Grouped panel + wiring

- [x] 6.1 [TEST] `TransaccionesAgrupadas.spec.tsx`: one section per non-empty group with `etiqueta · subtotal · N mov` header; loading/error/empty states (WG-01 empty scenario); scroll+highlight+focus-to-heading on `bucketResaltado` change; a11y — `aria-current` + ring not color-only, `prefers-reduced-motion` honored (WG-05, WG-06)
- [x] 6.2 `TransaccionesAgrupadas.tsx` (new): owns `useMovimientos`, loading/error/empty switch, view-model render, per-group refs, scroll/highlight effect respecting `prefers-reduced-motion` — makes 6.1 pass
- [x] 6.3 [TEST] `ResumenScreen.spec.tsx` (if exists): expect grouped panel rendered, `bucketResaltado` wiring, no single-bucket default (updated existing `ResumenScreen.test.tsx`; also updated `ResumenPage.test.tsx`, which shared the same `/api/buckets/:bucket` mock)
- [x] 6.4 `ResumenScreen.tsx`: swap `BucketDetailList` → `TransaccionesAgrupadas`; drop `bucketSeleccionado`/`bucketPorDefecto` default; pass `bucketResaltado={bucketElegido}`; keep the periodo-change reset effect — makes 6.3 pass
- [x] 6.5 Confirm `BucketDetailList.tsx` and `routes/_authenticated/buckets.$bucket.tsx` are untouched — deep link unaffected (W3-01)

## Phase 7: Verification

- [x] 7.1 Run `pnpm web test` + `pnpm build`/typecheck — all green (306/306 web tests; `pnpm api test` unaffected by Slice 2, already green from Slice 1/PR #73)
- [ ] 7.2 Manual check: keyboard-only legend activation (Enter/Space) reaches the same scroll+highlight target as a click (WG-06) — human/manual verification, not run in this session
