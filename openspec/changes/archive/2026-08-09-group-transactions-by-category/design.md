# Design — Group transactions by category

- **Change slug**: `group-transactions-by-category`
- **Phase**: sdd-design · **Store**: hybrid (Engram `sdd/group-transactions-by-category/design` + this file)
- **Reads**: proposal (`sdd/.../proposal`), spec (`specs/movimientos-api/spec.md`), exploration
- **Status**: done — ready for `sdd-tasks`

---

## 1. Architecture overview

The chosen approach is **frontend-first regrouping over the existing
`GET /api/movimientos` endpoint, plus a one-repository fold fix on the backend**.
No new endpoint, no server-side aggregation, no new domain/money logic on the API.

Data flow (one round trip per period):

```
 DB (Transaccion.bucketId: physical id | null)
   │
   │  PrismaMovimientosMesRepository.findByPeriodo   ← FOLD HERE (mirror resumen-mes)
   │     bucketId → Bucket via BUCKET_ID_TO_BUCKET (null/unrecognized → SinCategoria)
   ▼
 MovimientoMesRow { …, bucket: Bucket }             (application port — infra-agnostic)
   │  ObtenerMovimientosMesUseCase (pass-through; type flows, no logic change)
   ▼
 aMovimientosMesDto → { …, bucket: string }         (HTTP DTO — enum value, never a raw id)
   │  GET /api/movimientos?periodo=YYYY-MM  (userId-isolated, cargo/abono as decimal strings)
   ▼  ── network boundary ──
 fetchMovimientos (money-safe guard) → useMovimientos(periodo)   (apps/web/src/api)
   │
   │  agrupar-movimientos-por-bucket (PURE view-model)
   │     group by bucket · per-group subtotal (BigInt, exact) · count ·
   │     date-desc within group · canonical cross-group order · non-empty only
   ▼
 TransaccionesAgrupadas (owns hook + state switch + view-model + render + scroll/highlight)
   ▲
   │  bucketResaltado (highlight target)         ← ResumenScreen owns the selection state
 DistribucionPie / LeyendaGasto (click → setBucketElegido)
```

**Layering respected.** The API fold stays in infrastructure (repository), exactly
where `prisma-resumen-mes` already folds; the application port carries the domain
`Bucket`, never a physical id — the change *removes* a Clean-Architecture boundary
leak rather than adding one. `userId` isolation stays structural in the repo WHERE
(`account: { userId }`) — untouched. The web keeps its manual DTO mirror (ADR-008);
grouping is a pure client transform, isolated from React and I/O.

---

## 2. Decision D1 — Movimientos DTO contract change

**Decision: RENAME the per-row field `bucketId: string | null` → `bucket: string`
(the domain `Bucket` enum value), and FOLD in the repository (not the DTO mapper).**

### Where the fold happens

In `PrismaMovimientosMesRepository.findByPeriodo`, mirroring
`prisma-resumen-mes.repository.ts:52-55` verbatim in shape:

```ts
const bucket: Bucket =
  row.bucketId === null
    ? Bucket.SinCategoria
    : (BUCKET_ID_TO_BUCKET.get(row.bucketId) ?? Bucket.SinCategoria)
```

The port row then carries `bucket: Bucket`; the DTO mapper is a trivial
pass-through (`bucket: tx.bucket`). Folding in the **repository** (not the DTO)
keeps the application/port layer speaking the domain language and matches the
established sibling repositories (DRY of the fold *knowledge* — one place, reusing
`BUCKET_ID_TO_BUCKET`).

### Rationale

- **Honesty of the contract.** After the fold the value IS a domain category, not
  a physical id. Keeping the key `bucketId` while its value becomes `'Necesidades'`
  is a lie the next reader has to decode (DRY anti-pattern: docs/names that mislead).
- **`BUCKET_ID_TO_BUCKET` reuse** (`bucket-ids.ts`) is the single source of truth
  already used by `prisma-resumen-mes` / `prisma-resumen-anual` — no new mapping.
- **Blast radius is provably tiny** (see below), so the rename cost is low now and
  never lower later.

### Consumer / blast-radius evidence (grep)

`rg bucketId` across the repo shows the only consumers of the movimientos
row/DTO's raw-id shape are the endpoint's **own tests**:

- `apps/api/test/movimientos.e2e-spec.ts:219` — `expect(tx.bucketId).toBeNull()`.
- `apps/api/test/movimientos-mes.int-spec.ts:288-295` — asserts `found!.bucketId`
  is null at the port level.

No web code consumes `/api/movimientos` today (`apps/web/src/api/` has only
`use-resumen`, `use-detalle-bucket`, `use-resumen-anual`). Mobile consumes
`/api/resumen`, not `/api/movimientos`. `/api/buckets/:bucket` is a **separate
DTO** (`detalle-bucket.dto.ts`, no `bucketId` field) and is out of scope (spec
MOV-03). Every other `bucketId` hit is `prisma-resumen-*`, `bucket-ids.ts`, the
schema, the seed, and unrelated specs — none read the movimientos DTO.

**Back-compat statement:** the field rename is a breaking change to
`/api/movimientos`'s contract, but the effective blast radius is the two tests
above (which this change updates) plus the brand-new web consumer. Ship as a
clean rename. `/api/buckets/:bucket` is unaffected.

### Rejected alternative

**Keep the `bucketId` key, change only its value to the enum.** Smaller textual
diff, but leaves a permanently misnamed field on a live contract for zero real
saving (the two tests change either way). Rejected — misleading name, violates the
DRY "names must not lie" rule for no benefit.

---

## 3. Decision D2 — Where grouping / reorder / subtotal live

**Decision: the API stays deterministic date-*asc* (unchanged); the WEB view-model
owns grouping, date-*desc* reorder, subtotal, count, non-empty filter, and
canonical group order.** Pure function, no React, no I/O — same discipline as
`detalle-bucket-view-model.ts`.

### Money type flowing through

The DTO serializes `cargo`/`abono` as **decimal strings** (`String(bigint)`,
BigInt-safe). The view-model MUST sum in **BigInt**, never `float`/`Number`:

```
subtotal(bucket) = bucket === 'Ingreso'
                     ? Σ BigInt(row.abono)      // Ingreso is measured by credits
                     : Σ BigInt(row.cargo)      // spending buckets by charges
```

This per-bucket "which side" rule mirrors `prisma-resumen-mes` /
`calcular-resumen-mes` semantics (Ingreso = `totalAbono`, spending =
`totalCargo`) so the group subtotal is consistent with the number the pie shows
for that bucket (DRY of the money *meaning*). Rows are validated money strings at
the fetch boundary (D3 guard), so `BigInt(row.cargo)` is safe; the label is
produced only for display via `formatearMontoCLP(String(sum))`.

### View-model output shape

```ts
// apps/web/src/domain/agrupar-movimientos-por-bucket.ts

export interface MovimientoAgrupadoRowViewModel {
  readonly id: string
  readonly fechaLabel: string    // YYYY-MM-DD (slice(0,10), same as detalle)
  readonly descripcion: string
  readonly cargoLabel: string    // formatearMontoCLP(cargo)
  readonly abonoLabel: string    // formatearMontoCLP(abono)
}

export interface GrupoMovimientosViewModel {
  readonly bucket: string        // canonical domain name — key for color/label/ref/highlight match
  readonly etiqueta: string      // ETIQUETA_BUCKET[bucket] ?? bucket (header display)
  readonly subtotalLabel: string // formatted per the side rule above
  readonly cantidad: number      // filas.length (the "· N mov" in the header)
  readonly filas: ReadonlyArray<MovimientoAgrupadoRowViewModel> // date DESC, id tiebreak
}

export interface MovimientosAgrupadosViewModel {
  readonly periodo: string
  readonly grupos: ReadonlyArray<GrupoMovimientosViewModel> // canonical order, non-empty only
}

export function aMovimientosAgrupadosViewModel(
  dto: MovimientosMesDto,
): MovimientosAgrupadosViewModel
```

**Canonical cross-group order** (product decision #4) is a local constant (web
cannot import the backend enum — ADR-008):

```ts
const ORDEN_GRUPOS = ['Ingreso', 'Necesidades', 'Deseos', 'Ahorro', 'SinCategoria'] as const
```

Groups are emitted in this fixed order, **only if non-empty** (product #3). Within
each group, rows sort **date descending** (product #4); reuse the incoming
`id`-asc tiebreak inverted for determinism on same-date rows.

### Rejected alternative

**Group/subtotal server-side (new response shape).** Over-engineering (YAGNI):
grouping an already-present per-row field is presentation, and it would add a new
contract + server aggregation + tests for logic the client does in one pass. The
API's only job here is the honest per-row category (D1).

---

## 4. Decision D3 — The `useMovimientos` hook + query ownership

**Decision: add `useMovimientos(periodo)` mirroring `useDetalleBucket`, and let the
new grouped panel OWN the query itself** (as `BucketDetailList` owns
`useDetalleBucket`). `ResumenScreen` keeps owning only the pie-selection state.

```ts
// apps/web/src/api/use-movimientos.ts
export function useMovimientos(periodo?: string) {
  return useQuery<MovimientosMesDto, ApiError>({
    queryKey: ['movimientos', periodo ?? 'actual'],
    queryFn: async () => {
      const result = await fetchMovimientos(periodo)
      if (!result.ok) throw result.error
      return result.value
    },
  })
}
```

`fetchMovimientos` is added to `api/client.ts` with the **same money-safe type
guard** discipline as `fetchDetalleBucket` (validate `cargo`/`abono` with
`esMontoStringValido`, `fecha` with `esFechaValida`, and `bucket` is a
non-empty string) so no malformed body reaches `formatearMontoCLP`/`BigInt` — it
maps to a typed `ApiError` (tag `parse`) instead (DRY: reuse the existing guard
helpers).

**Ownership rationale.** The pie-selection state (`bucketElegido`) lives in
`ResumenScreen` and drives the highlight *target*; the transactions data + the
per-group refs live in the panel. Splitting them the same way the codebase already
splits `BucketDetailList` (owns its query) vs `ResumenScreen` (owns selection)
keeps each concern local and avoids lifting a second query into the screen. The
screen passes the panel `periodo` + `bucketResaltado`; the panel never touches
selection logic, the screen never touches movimientos data. (KISS + the
established pattern; no new state-management layer — YAGNI.)

### Rejected alternative

**Lift `useMovimientos` into `ResumenScreen`/`HomePage`.** Would couple the screen
to a second data source and duplicate the state-switch it already delegates.
Rejected — breaks the one-query-per-component pattern for no gain.

---

## 5. Decision D4 — Component structure

**Decision: a NEW self-contained presentational-owning component
`TransaccionesAgrupadas` renders the grouped list. Do NOT reuse `BucketDetailList`
per group, and do NOT extract a shared row component yet.**

`TransaccionesAgrupadas` (new, `apps/web/src/components/`):
- owns `useMovimientos(periodo)`,
- handles the `{loading | error | empty}` switch with grouped-context copy (reuse
  shared `Loading`/`ErrorState`/`Empty` — DRY, do not reimplement),
- maps the DTO via `aMovimientosAgrupadosViewModel`,
- renders one section per group: header `etiqueta · subtotalLabel · cantidad mov`
  then the group's rows,
- owns the per-group refs + scroll/highlight effect (D5).

This mirrors `BucketDetailList`'s own documented reasoning (one component covers
fetch + states + render; no premature container/presentational split until a
second consumer needs the grouped view *without* the query — YAGNI).

### Why NOT reuse `BucketDetailList` per group

`BucketDetailList` **owns its own `useDetalleBucket` query** against
`/api/buckets/:bucket`. Rendering it once per group would fire the exact **N+1
request pattern the proposal rejected** (5 round trips), defeating the whole
single-fetch approach. It is structurally the wrong unit to reuse here.

### Why NOT extract a shared `MovimientoRow` yet

The row markup is similar to `BucketDetailList`'s, but the two feed from different
view-model row shapes (`DetalleBucketRowViewModel` vs
`MovimientoAgrupadoRowViewModel`) and `BucketDetailList` must keep working verbatim
for `/buckets/:bucket`. That is **2 occurrences of *similar-looking* code, not a
shared business rule** — the DRY/YAGNI "three strikes" rule says duplicate now,
extract when a third real consumer appears. Unifying now risks the wrong
abstraction across a live route. (Flag for a future refactor if a third list
appears.)

`BucketDetailList`, its route, and `useDetalleBucket` are **untouched**.

---

## 6. Decision D5 — Pie/legend → scroll + highlight mechanism

**Decision: repurpose the existing `bucketElegido`/`setBucketElegido` state from
"swap the panel" to "scroll-to + highlight the target group", passed to
`TransaccionesAgrupadas` as `bucketResaltado`.**

### State changes in `ResumenScreen.tsx`

- Keep `const [bucketElegido, setBucketElegido] = useState<string | null>(null)`
  and the `useEffect` that resets it to `null` on `viewModel.periodo` change
  (FIX 5 — a selection must not leak across months).
- **Drop** the `bucketSeleccionado = bucketElegido ?? viewModel.bucketPorDefecto`
  default. The whole grouped list is always visible now, so there is no
  "default bucket to show" — `bucketElegido === null` simply means "no highlight
  yet" (list rests at the top). `viewModel.bucketPorDefecto` becomes unused by this
  screen (leave the view-model field as-is; do not break other consumers/tests).
- Pass `bucketResaltado={bucketElegido}` to `TransaccionesAgrupadas`. The pie
  (`DistribucionPie`) and legend (`LeyendaGasto`) keep calling `setBucketElegido`
  — their `aria-pressed`/interactive contract is unchanged.

Note: the pie/legend surface only Necesidades/Deseos/Ahorro (slices) + SinCategoria
(legend). Ingreso still renders as a group in the list but is not a pie/legend
target — acceptable (income has its own `IngresoCard`); not a regression.

### Scroll + highlight inside `TransaccionesAgrupadas`

- Hold a `Map<string, HTMLElement>` (or a ref callback per group) keyed by the
  group's `bucket`.
- `useEffect([bucketResaltado])`: if non-null and the group exists, call
  `el.scrollIntoView({ block: 'nearest', behavior })` where
  `behavior = prefersReducedMotion ? 'auto' : 'smooth'` (read
  `window.matchMedia('(prefers-reduced-motion: reduce)').matches`), then move
  keyboard focus to the group heading (`tabIndex={-1}` + `el.focus()`).
- Highlight is applied to the targeted group's section (a ring/left-bar), driven
  by `bucket === bucketResaltado`.

### Accessibility (ADR-018 / WCAG 2.2 AA)

- **Keyboard-reachable:** pie slices (`role="button"`, Enter/Space) and legend
  (`<button>`) are already keyboard-operable — unchanged.
- **Focus lands on the group:** moving focus to the group heading (`tabIndex=-1`)
  is the accessible equivalent of the visual scroll — a SR user is taken to the
  group and its `<h3>` name is announced (WCAG 2.4.3).
- **Not color-only** (WCAG 1.4.1): the highlight is a **visible outline/ring + a
  left border bar**, plus `aria-current="true"` on the highlighted group's region
  — never color alone.
- **Reduced motion** (WCAG 2.3.3 / ADR-018): `behavior: 'auto'` when
  `prefers-reduced-motion: reduce`.
- **Heading levels:** groups use `<h3>` under `ResumenScreen`'s `<h2>`
  "Distribución del gasto" section, keeping the single page `<h1>` intact.

---

## 7. File-by-file change map

### Backend (`apps/api`)

| File | New/Mod | Change |
|------|---------|--------|
| `src/application/ports/movimientos-mes.port.ts` | Mod | `MovimientoMesRow.bucketId: string \| null` → `bucket: Bucket` (import `Bucket`) |
| `src/infrastructure/persistence/prisma-movimientos-mes.repository.ts` | Mod | import `Bucket` + `BUCKET_ID_TO_BUCKET`; fold `row.bucketId` → `bucket` (null/unrecognized → `SinCategoria`); return `bucket` |
| `src/infrastructure/http/dto/movimiento-mes.dto.ts` | Mod | DTO field `bucketId: string \| null` → `bucket: string`; mapper `bucket: tx.bucket` |
| `src/application/use-cases/obtener-movimientos-mes.use-case.ts` | — | No code change (type flows through `ReadonlyArray<MovimientoMesRow>`) |
| `src/infrastructure/persistence/prisma-movimientos-mes.repository.spec.ts` | New | Unit fold spec (mocked Prisma) — mirror `prisma-resumen-mes.repository.spec.ts` |
| `src/infrastructure/http/movimientos.controller.spec.ts` | Mod | Add assertion the DTO exposes folded `bucket` (enum value), no `bucketId` |
| `test/movimientos.e2e-spec.ts` | Mod | `tx.bucketId` null → `tx.bucket === 'SinCategoria'`; add a categorized row → `'Necesidades'` |
| `test/movimientos-mes.int-spec.ts` | Mod | `found!.bucketId` null → `found!.bucket === Bucket.SinCategoria`; add a categorized-row fold assertion |
| `src/infrastructure/persistence/bucket-ids.ts` | — | Reused as-is (no change) |

### Frontend (`apps/web`)

| File | New/Mod | Change |
|------|---------|--------|
| `src/api/types.ts` | Mod | Add `MovimientoMesItemDto` (`bucket: string`) + `MovimientosMesDto` |
| `src/api/client.ts` | Mod | Add `fetchMovimientos` + money-safe guards (reuse `esMontoStringValido`/`esFechaValida`) |
| `src/api/use-movimientos.ts` | New | `useMovimientos(periodo)` hook (mirror `useDetalleBucket`) |
| `src/domain/agrupar-movimientos-por-bucket.ts` | New | Pure view-model + `ORDEN_GRUPOS`; BigInt subtotals |
| `src/components/TransaccionesAgrupadas.tsx` | New | Grouped panel: hook + states + view-model + render + scroll/highlight |
| `src/components/ResumenScreen.tsx` | Mod | Swap `BucketDetailList` panel → `TransaccionesAgrupadas`; `bucketElegido` becomes highlight target; drop `bucketPorDefecto` default |
| `src/domain/agrupar-movimientos-por-bucket.spec.ts` | New | View-model unit tests |
| `src/components/TransaccionesAgrupadas.spec.tsx` | New | Component + a11y tests |
| `src/components/ResumenScreen.spec.tsx` | Mod (if exists) | Update panel expectation (grouped list, highlight wiring) |
| `src/components/BucketDetailList.tsx` + `routes/_authenticated/buckets.$bucket.tsx` | — | Untouched (deep-link route intact) |

---

## 8. Test plan (ADR-015 / ADR-016)

**Backend — the fold (unit, mocked Prisma):** recognized id → its `Bucket`; `null`
→ `SinCategoria`; unrecognized non-null id → `SinCategoria`; **per-row
independence** — a response mixing a `Necesidades` row and a `null` row keeps each
row's own category (the SC-03 concern here is that folding one row never
reclassifies another; movimientos is a per-row `map`, not a `groupBy` accumulator,
so there is no "add vs overwrite" merge — assert independence explicitly).

**Backend — controller/DTO:** assert `aMovimientosMesDto` exposes `bucket` (enum
value string) and no `bucketId`. Keep the existing ISO-01/02 `@CurrentUser`
derivation tests.

**Backend — integration/e2e (gated `ALLOW_DESTRUCTIVE_DB=1`):** update the two
`bucketId`-null assertions to the folded `bucket`; add one seeded categorized row
asserting the fold to `'Necesidades'`; **userId isolation** stays covered by the
existing `AC-10` int-spec + e2e (user B rows never appear). **Money exactness**:
the `> MAX_SAFE_INTEGER` amount still returns as an exact decimal string
(unchanged by the fold).

**Web — view-model (unit, pure):** grouping by bucket; **canonical cross-group
order** (Ingreso→Necesidades→Deseos→Ahorro→SinCategoria); **non-empty groups
only**; **date-desc** within group (+ same-date determinism); per-group **count**;
per-group **subtotal in BigInt** with a `> MAX_SAFE_INTEGER` amount preserved
exactly (no float); Ingreso subtotal uses abono, spending uses cargo.

**Web — client guard (unit):** a 2xx body with a malformed `cargo`/`abono`/`fecha`
maps to `ApiError` (tag `parse`), never reaches `BigInt`/`formatearMontoCLP`.

**Web — component (`TransaccionesAgrupadas.spec.tsx`):** renders one section per
non-empty group with the `etiqueta · subtotal · N mov` header; loading/error/empty
states; on `bucketResaltado` change it highlights the matching group and moves
focus to its heading; **a11y** — highlight is not color-only (`aria-current` +
ring/border present), heading focus target exists, group headings are `<h3>`.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| **SC-03 / mis-fold** (a `null` row silently reclassifying a real bucket) | Fold is a per-row `map` reusing `BUCKET_ID_TO_BUCKET` + null-fallback proven in `prisma-resumen-mes`; unit test asserts per-row independence + null/unrecognized → `SinCategoria` |
| **Contract rename breaks a hidden consumer** | Grep evidence shows only this endpoint's own 2 tests + the new web consumer read the shape; `/buckets/:bucket` is a separate DTO (spec MOV-03). Update both tests in the same change |
| **Money precision** | Sum in **BigInt** from decimal strings; `formatearMontoCLP` only at display; guard rejects malformed money at the fetch boundary; explicit `> MAX_SAFE_INTEGER` test |
| **A11y regression** on the new pie→scroll/highlight | Focus moves to group heading (not just visual scroll); highlight = ring/border + `aria-current` (not color-only); `prefers-reduced-motion` honored; pie/legend keyboard contract unchanged |
| **Panel UX regression** (replacing single-bucket panel) | Pie/legend stay interactive; instead of swapping, they scroll+highlight — the interaction is preserved, only its effect changes |

---

## 10. Residual open questions (for `sdd-tasks` / PO)

1. **Subtotal semantics.** Design fixes: Ingreso group → Σabono, spending groups →
   Σcargo (consistent with the pie/resumen). If the PO instead wants both a
   charges and a credits subtotal shown per group, the view-model already computes
   from exact amounts — it is a display tweak, not a re-architecture. **Recommend
   the single per-bucket subtotal above.**
2. **SinCategoria "Clasificar" CTA parity.** `BucketDetailList` shows a disabled
   `Clasificar`/`Editar categoría` placeholder (CA-03/US-013 deferred). The grouped
   list is a read view; **recommend NOT porting the disabled CTAs here** (YAGNI —
   the classify flow lives on `/buckets/:bucket`). Confirm at tasks.
3. **Delivery split.** ~350–450 lines incl. tests — borderline vs the 400-line
   single-PR budget. Natural slice boundary if it trends over: (1) backend fold +
   DTO rename + tests (self-contained, low risk), then (2) web hook + view-model +
   grouped UI. Decide at `sdd-tasks` per the Review Workload Guard.
</content>
</invoke>
