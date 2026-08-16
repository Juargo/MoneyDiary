# Design: US-045 — resumen mensual, 3 → 5 items

> Architectural design for the proposal in `./proposal.md`. Answers **HOW**; the
> ordered work breakdown lives in `./tasks.md` (next phase).
>
> Binding product decisions carried in from the proposal and **not reopened
> here**: Ingresos is amount-only (no percentage); Sin categoría carries
> count + total + % over ingresos; the count covers **cargos only**; all items
> are always present; the DTO extension is **additive** (no `items[]`
> restructure); the semáforo is untouched.

---

## 0. Executive summary

The endpoint already carries **four of the five** values the chart needs.
`totalIngreso` is Ingresos. `buckets[]` already contains a `SinCategoria` slice
with `total` and `porcentajeBp`. The only datum that does not exist anywhere on
the wire is the **transaction count** of uncategorized cargos.

So this change is: **one new integer, plumbed end to end** — a second scoped
`groupBy` in the monthly repository, one field on the port row, one field on the
domain VO, one top-level scalar on the DTO, and the contract regen. Everything
else is documentation, tests, and the mechanical fixture churn that a new
required contract field forces on `apps/web` and `apps/mobile`.

Nothing in `buckets[]` changes shape. Nothing in the semáforo changes. No DB
migration. No new port, no new use case, no new abstraction.

---

## 1. Architecture approach

### 1.1 Pattern and layering

No new pattern. This rides the existing seam exactly as ADR-005 lays it out:

```
Prisma groupBy  →  BucketSumRow           (infrastructure → application port)
BucketSumRow    →  ResumenMesInput        (construirResumenMesDesdeFilas, application)
ResumenMesInput →  ResumenMes             (domain VO, pure BigInt/integer math)
ResumenMes      →  ResumenMesDto          (aResumenMesDto, infrastructure/http)
ResumenMesDto   ≡  resumenResponseSchema  (Zod, the contract source of truth)
                →  openapi.json → @moneydiary/api-client → web / mobile
```

Every layer gains **exactly one field**. No layer gains a branch, a flag, or a
new collaborator. That is the whole design (KISS rule 2 — boring technology, the
established VO + port + adapter shape).

### 1.2 Boundaries that must NOT move

| Boundary | Rule | Why |
|---|---|---|
| `buckets[]` array | stays exactly 4 entries, exactly 4 fields per entry | ISP (binding). The 3 spend buckets must not carry an unused `cantidad`. Also keeps every positional assert (`toHaveLength(4)`, `buckets[0..3]`) valid. |
| `BucketResumenDto` | shape frozen | same as above; it is the shared element type of the annual response too |
| `estado-semaforo.ts` | zero edits | `calcularEstadoBucket` already returns `null` for `SinCategoria` and for `Ingreso`. CA-03 is satisfied **structurally**, not by a new rule. |
| `domain ← application ← infrastructure` | unchanged | the count enters through the existing port, never as a Prisma type |
| DB schema | zero migrations | the count is derived, not stored |

### 1.3 What is deliberately NOT built (YAGNI)

- No `items[]` unification of Ingresos + buckets (explicitly discarded in the proposal; breaking + speculative).
- No per-bucket count on `BucketSlice` / `BucketResumenDto` — only `SinCategoria` has a product need for it (see D-04).
- No `ingresos` DTO field mirroring `totalIngreso` (see D-01).
- No annual **aggregate** of the new value — that is US-046 (see D-07).
- No caching, no new index, no raw SQL (see D-05 alternatives).

---

## 2. Decisions (ADR-style)

### D-01 — Ingresos requires **zero** backend fields. `totalIngreso` *is* the Ingresos item.

**Decision.** No new DTO field for Ingresos. CA-01 is satisfied by the field
that already ships: `totalIngreso: string`, BigInt-safe, always present, `"0"`
on an empty month (guaranteed today by the repository pre-seeding all 5 buckets
plus `?? 0n` in `construirResumenMesDesdeFilas`).

**Rationale.** The proposal's open question was "how to expose Ingresos as a
chart item without duplicating `totalIngreso` semantics". The answer is: do not
expose it twice at all. Adding `ingresos: string` alongside `totalIngreso:
string` would put **the same number in two places on the wire** — the exact
drift class this repo fights (two sources of truth for one money value). The
translation "`totalIngreso` → a chart slice labelled *Ingresos*, rendered
without a percentage" is a **presentation** decision, and ADR-024 puts
presentation in the client: *if it affects how much money is shown → domain; if
it affects how it is presented → client.* The amount is domain (already there);
the slice is presentation (US-047).

**Consequence for this US.** CA-01 becomes a **test and spec obligation**, not a
code change: assert `totalIngreso` is always present, is a string, and is `"0"`
on an empty month. Two of those asserts already exist in
`resumen.e2e-spec.ts:303` and `resumen-mes.dto.spec.ts`.

**Rejected.**
- *`ingresos: { total, porcentajeBp: null }` object* — duplicates the amount and
  ships a field that is `null` by permanent design. A field that can only ever
  hold one value is dead weight (YAGNI rule 3).
- *A 5th entry in `buckets[]` with `bucket: "Ingreso"`* — breaks the "buckets are
  spend slices, Ingreso is the denominator" invariant documented on the VO,
  breaks every `toHaveLength(4)` assert and every client percentage sum, and
  would make `porcentajeBp` for Ingreso a nonsensical `10000`.

---

### D-02 — The Sin categoría count is a **top-level scalar**: `cantidadSinCategoria: number`.

**Decision.** The wire gains exactly one field, at the root of
`ResumenMesResponse`:

```jsonc
{
  "periodo": "2026-07",
  "totalIngreso": "1500000",        // ← Ingresos item (D-01), unchanged
  "sinIngreso": false,
  "cantidadSinCategoria": 7,        // ← THE ONLY NEW FIELD
  "buckets": [
    { "bucket": "Necesidades",  "total": "750000", "porcentajeBp": 5000, "estadoSemaforo": "verde" },
    { "bucket": "Deseos",       "total": "360000", "porcentajeBp": 2400, "estadoSemaforo": "verde" },
    { "bucket": "Ahorro",       "total": "300000", "porcentajeBp": 2000, "estadoSemaforo": "verde" },
    { "bucket": "SinCategoria", "total":  "90000", "porcentajeBp":  600, "estadoSemaforo": null    }
  ],
  "targets": { "Necesidades": 50, "Deseos": 30, "Ahorro": 20 },
  "estadoGlobal": "verde"
}
```

The Sin categoría **total** and **percentage** are read from the existing
`buckets[]` slice — they are not repeated at the root.

**Rationale.** Same argument as D-01, applied to the other item: the total and
the percentage already have a home, and it is the home every client already
reads. The count is the only genuinely new datum, so it is the only new field.
Placement at the root (rather than inside `buckets[]`) is forced by the binding
ISP constraint: `BucketResumenDto` must stay uniform across all four slices.

**Rejected.**
- *`sinCategoria: { cantidad, total, porcentajeBp }` object at the root* — the
  proposal's alternative. Rejected because `total` and `porcentajeBp` would then
  exist in **two** places (`buckets[3]` and this object) with no mechanism
  keeping them equal. Today `aResumenMesDto` maps `buckets[]` from the VO's
  slice array; a sibling object would be a second mapping path over the same VO
  data — one refactor away from silently diverging. Grouping is only worth it
  when it removes a lookup; here it adds a duplicate.
- *`cantidad: number | null` on `BucketResumenDto`* — violates the binding ISP
  constraint. Necesidades/Deseos/Ahorro would carry a permanently-`null` field,
  and every client type would gain a nullable it must defensively handle. It
  also widens `BucketResumenDto` for the **annual** response, where it is even
  less meaningful.

**Naming.** Spanish, matching the established wire vocabulary of this endpoint
(`totalIngreso`, `sinIngreso`, `porcentajeBp`, `estadoGlobal`). `cantidad*`
reads as a count; `transaccionesSinCategoria` was considered and rejected as
longer without being clearer.

---

### D-03 — The count is a JS `number`, not a BigInt-as-string.

**Decision.** `number` in the port row, the VO, and the DTO. No string
serialization, no BigInt.

**Rationale.** DR-02 / ADR-015 mandate exact integer types **for money**. A row
count is not money: it is bounded by the user's monthly transaction volume
(hundreds), Prisma's `_count` already returns a `number`, and the only
arithmetic performed on it is addition of small integers during the
`SinCategoria` fold. This is the same reasoning that already makes
`porcentajeBp` a `number` at the DTO boundary and `ResumenAnualInvalidoError
.cantidadRecibida` a `number`.

**Guard for reviewers.** The "no float / no `Number()` in the money path" rule
still holds — `cantidadSinCategoria` never participates in a monetary
expression. A reviewer seeing `number` here should check that, not reject it.

---

### D-04 — The port row carries the count for **every** bucket; the domain narrows it to `SinCategoria`.

**Decision.**

```ts
// application/ports/resumen-mes.port.ts
export interface BucketSumRow {
  readonly bucket: Bucket;
  readonly totalCargo: bigint;
  readonly totalAbono: bigint;
  readonly cantidadCargos: number; // NEW — rows with cargo > 0 in this bucket
}
```

```ts
// domain/value-objects/resumen-mes.ts
export interface ResumenMesInput {
  readonly totalIngreso: bigint;
  readonly necesidades: bigint;
  readonly deseos: bigint;
  readonly ahorro: bigint;
  readonly sinCategoria: bigint;
  readonly cantidadSinCategoria: number; // NEW — required, not optional
}

export class ResumenMes {
  readonly cantidadSinCategoria: number; // NEW
  // BucketSlice is UNCHANGED — no count per slice
}
```

**Rationale (the asymmetry is deliberate).** The port is a *raw aggregation
row*: it reports what the query measured, uniformly, for all five buckets.
Emitting a real count for `SinCategoria` and a fake `0` for the others would be
a lie in the port contract that the next reader would trip on. The count comes
back per-bucket from the same `groupBy` anyway — filtering it down inside the
repository would be arbitrary special-casing in infrastructure.

The **domain** is where the product decision lives, and the product decided that
only Sin categoría exposes a count. `construirResumenMesDesdeFilas` is exactly
the seam that narrows raw rows to modelled facts — it already does the same
narrowing for `totalAbono` (only `Ingreso`'s is read) and `totalCargo` (only the
four spend buckets'). Adding `cantidadCargos` to `BucketSlice` would create dead
domain data the mapper must then drop, or leak it into `BucketResumenDto` and
violate D-02's ISP constraint.

**Required, not optional.** `cantidadSinCategoria` is non-optional in
`ResumenMesInput`. `tsc` then forces every construction site to state a value —
the ADR-036/ADR-037 precedent in this repo ("`tsc` fuerza a migrar cada call
site"). An optional-with-default-`0` would let a forgotten wiring path ship a
silent, permanent `0` on the wire.

---

### D-05 — Cargos-only counting: a **second scoped `groupBy`**, both queries in one `$transaction`, folded through **one** shared helper.

**The constraint.** "Cargos only" cannot be expressed inside the existing
`groupBy`. Prisma's `_count: { _all: true }` counts every row in the group
(including pure-abono rows); `_count: { cargo: true }` counts non-`NULL` values
and `Transaccion.cargo` is `BigInt` **NOT NULL** (`schema.prisma:190`), so it is
identical to `_all`. Adding `cargo: { gt: 0 }` to the existing `where` is
**forbidden** — it would silently corrupt `totalAbono`, which is the income base
for the entire 50/30/20 calculation.

**Decision.** Two aggregations over the same base `where`, issued as one batch
transaction, folded into one accumulator by one shared resolver:

```ts
async sumarPorBucket(userId, periodo): Promise<ReadonlyArray<BucketSumRow>> {
  // ONE where object, built once and reused — the two queries must never diverge
  // on user isolation or period bounds.
  const where = {
    account: { userId },                            // USER ISOLATION — structural
    fecha: { gte: periodo.desde, lt: periodo.hasta } // half-open [desde, hasta)
  };

  const [gruposSuma, gruposCargo] = await this.prisma.$transaction([
    this.prisma.transaccion.groupBy({ by: ['bucketId'], where, _sum: { cargo: true, abono: true } }),
    this.prisma.transaccion.groupBy({
      by: ['bucketId'],
      where: { ...where, cargo: { gt: 0 } },        // CARGOS ONLY — count scope
      _count: { _all: true },
    }),
  ]);

  // accum: Map<Bucket, { totalCargo; totalAbono; cantidadCargos }>, pre-seeded
  // with all 5 buckets at zero (SC-05 unchanged).

  for (const g of gruposSuma)  add(resolverBucket(g.bucketId), { cargo, abono });
  for (const g of gruposCargo) add(resolverBucket(g.bucketId), { cantidad: g._count._all });
}
```

**`resolverBucket` is extracted** from the existing inline expression into a
single private function/module-level helper:

```ts
// null bucketId → SinCategoria (US-012 degradation)
// unrecognized non-null bucketId → SinCategoria (defensive)
const resolverBucket = (id: string | null): Bucket =>
  id === null ? Bucket.SinCategoria : (BUCKET_ID_TO_BUCKET.get(id) ?? Bucket.SinCategoria);
```

**This is the mitigation for the proposal's highest risk (SC-03).** The fold
rule — *a null-bucket group and a real `SinCategoria` group can coexist and must
be **ADDED**, never overwritten* — now applies to counts too. Rather than
restating it in a second loop (where it could be written as an assignment by
accident), both loops go through the same resolver and the same
`accum.set(bucket, { ...current, X: current.X + delta })` add-shape. The
accumulator is initialized to `0`/`0n` for all five buckets, so both loops are
pure accumulation.

**Why `$transaction([q1, q2])` and not `Promise.all`.** Two separate reads could
straddle a concurrent write and return a count inconsistent with the sums.
Prisma's array-form `$transaction` gives both queries one snapshot for
essentially the same cost, and it is already the established shape in this
repo (`prisma-categoria.repository.ts`, D-07 of the US-039 change). If the
array form causes friction with the `@prisma/adapter-pg` setup, `Promise.all`
is an acceptable fallback — the inconsistency window is a single user's own
concurrent ingest, not a correctness invariant — but it must be documented in
the code if taken.

**Cost.** One extra aggregate round-trip on a per-user, per-month scope. The
second query has the same shape and the same predicate family as the first, so
it uses the same plan and the same `@@index([accountId, fecha])` path. No
measurement suggests `/api/resumen` is latency-bound today (and the YAGNI skill
explicitly names "cachear `/api/resumen` sin haber medido" as an anti-pattern).
Trigger to revisit: a measured p95 regression on `GET /api/resumen`.

**Rejected.**
- *`$queryRaw` with `COUNT(*) FILTER (WHERE cargo > 0)`* — one query, but
  reintroduces hand-written SQL with BigInt driver-serialization risk and loses
  Prisma's type safety. `prisma-resumen-anual.repository.ts` already rejected
  raw SQL for exactly this reason ("simpler and safer (KISS) than hand-rolled
  raw SQL with BigInt driver-serialization risk"). Consistency wins.
- *A separate `prisma.transaccion.count()` with the fold replicated in the
  `WHERE`* — would need `OR: [{ bucketId: null }, { bucketId: { notIn: [...] } }]`
  to reproduce the "unrecognized id folds to SinCategoria" rule. That is a
  **second copy** of the fold logic in a different language (SQL predicate vs.
  TS map lookup), which is precisely the SC-03 drift risk the proposal flagged.
- *Counting in the application layer from a `findMany`* — pulls every row of the
  month into memory to compute one integer, and drops the single-query property
  the monthly repo was built around.

---

### D-06 — The contract field is **required**, and the resulting `apps/web` / `apps/mobile` fixture churn is **in scope for this PR**.

**Decision.** `cantidadSinCategoria` is non-optional in the Zod schema →
`required` in `openapi.json` → non-optional in the generated
`@moneydiary/api-client` type.

**The consequence the proposal did not surface.** Both clients re-export the
**generated** type — `apps/web/src/api/types.ts:27` and
`apps/mobile/src/domain/resumen.types.ts:11` — and both build full
`ResumenMesDto` object literals in tests. A new required property breaks
`tsc` at every one of them:

| Workspace | Literal construction sites |
|---|---|
| `apps/web` | `api/client.test.ts:24`, `api/client.test.ts:223` (spread of `validDto` — no edit needed, compiles once the source fixture carries the field), `api/use-resumen.test.tsx:8`, `api/use-resumen-anual.test.tsx:8`, `components/ResumenPage.test.tsx:17`, `components/ResumenPage.test.tsx:51` (spread of `dataDto` — no edit needed, same reason), `components/ResumenAnual.test.tsx:21`, `components/ResumenAnual.test.tsx:57`, `domain/resumen-view-model.test.ts:5` |
| `apps/mobile` | `domain/resumen-view-model.spec.ts:4`, `api/client.spec.ts:4` |

**Spread-derived sites need no edit.** Two of the sites above are not object
literals — they spread an already-typed source (`{ ...validDto, periodo }` at
`api/client.test.ts:223`; `{ ...dataDto, sinIngreso: true }` at
`components/ResumenPage.test.tsx:51`). Once the source fixture (`validDto`,
`dataDto`) carries `cantidadSinCategoria`, both spreads compile with zero
edits. They stay listed for traceability (they are real construction sites a
reviewer should check), but the apply phase must not budget an edit for them.

**This will not land silently.** The CI path filters put `packages/**` in the
trigger set for both the `web` job (`ci.yml:538`) and the `mobile` job
(`ci.yml:654`), and this PR necessarily commits
`packages/api-client/src/types.gen.ts`. Both jobs run; both go red until the
fixtures are updated. So the fix is **mandatory in the same PR** — add
`cantidadSinCategoria: 0` (or a meaningful value) to each literal. Purely
mechanical, compiler-enumerated.

**Rationale for keeping it required.** CA-02 says the value is *always present*.
An optional field would encode "may be absent" in the contract forever, forcing
US-047 and US-046 to write defensive `?? 0` at every read and losing the ability
to distinguish "no data" from "field not implemented". Trading a permanent
contract weakness for ~11 mechanical fixture lines is a bad trade.

**Runtime guards stay as they are.** `esResumenMesDto` in both clients
deliberately validates only what flows to render (`totalIngreso` + `buckets`).
Nothing renders the count yet, so the guards are **not** touched here.
**Downstream constraint for US-047:** when the count starts driving UI, extend
the guard in the same change — a stale deployed API would otherwise deliver
`undefined` through a `number`-typed field.

---

### D-07 — The annual response widens with **correct** counts, not zeros. No new annual aggregate.

**The situation.** The annual path is not optional to consider — it is
structurally coupled at three points:

1. `CalcularResumenAnualUseCase` calls the shared
   `construirResumenMesDesdeFilas(rows)`, passing `BucketSumRowAnual[]`. That
   compiles today only because `BucketSumRowAnual` is **structurally assignable**
   to `BucketSumRow`. Adding a required field to `BucketSumRow` and not to
   `BucketSumRowAnual` breaks `tsc` immediately.
2. `aResumenAnualDto` maps each month through `aResumenMesDto` (DRY).
3. `resumenAnualResponseSchema` embeds `resumenResponseSchema` for `meses[]`.

So `meses[i].cantidadSinCategoria` **will** appear on the annual wire no matter
what. The only real choice is whether it carries the truth or a zero.

**Decision.** Add `cantidadCargos: number` to `BucketSumRowAnual` too, and
populate it in `PrismaResumenAnualRepository`'s existing in-memory reduce:

```ts
// inside the existing `for (const t of transacciones)` loop — no new query
accum.set(key, {
  ...current,
  totalCargo:     current.totalCargo + t.cargo,
  totalAbono:     current.totalAbono + t.abono,
  cantidadCargos: current.cantidadCargos + (t.cargo > 0n ? 1 : 0),
});
```

The annual repository already does a `findMany` and folds in memory, so the
count is three tokens of work and **zero** extra queries.

**Why not keep the annual wire frozen.** Freezing it would require either
(a) making the field optional/`0` in the annual path — shipping a field that is
present and provably wrong, which US-046 would then have to un-break, or
(b) forking `ResumenMesDto`/`resumenResponseSchema` into a monthly and an annual
variant — deleting the DRY property those two files were explicitly built for
(see their header comments), to avoid a purely **additive** widening. Both cost
more than the 3-line reduce.

**Scope discipline.** This is *per-month field parity*, not annual aggregation.
US-046 owns the actual annual roll-up (a year-level Sin categoría total/count,
year-level percentages, whatever the annual chart needs). This US adds no
year-level field, no new annual endpoint behaviour, and no new annual query.
The success criterion stays as written: `/api/resumen/anual` keeps passing its
existing tests, with `meses[i]` widened truthfully.

---

### D-08 — Percentage arithmetic: **nothing new is computed**.

**Decision.** The Sin categoría percentage is the `porcentajeBp` already present
on the `SinCategoria` `BucketSlice`. `ResumenMes.crear` computes it today via
`porcentajeBasisPoints(total, input.totalIngreso)` — BigInt, round-half-up,
`(total * 10000n + base / 2n) / base`, no float, no `Math.*`. CA-04 is satisfied
by code that already exists and is already tested.

**Degenerate cases — the semantics that must be locked and tested.**

| Case | `totalIngreso` | SinCategoria `porcentajeBp` | `cantidadSinCategoria` |
|---|---|---|---|
| Normal | `> 0n` | integer bp over ingresos | real count |
| **No income, uncategorized cargos exist** | `0n` | **`null`** (no base — existing `porcentajeBasisPoints` contract) | **real count, e.g. `7`** |
| No income, no data | `0n` | `null` | `0` |
| Income, nothing uncategorized | `> 0n` | `0` | `0` |

The critical semantic: **the count is income-independent.** `porcentajeBp: null`
means "there is no base to compare against", *not* "there is nothing to report".
A month with zero income and seven unclassified charges must report
`cantidadSinCategoria: 7`, `sinIngreso: true`, `porcentajeBp: null`. Nulling the
count alongside the percentage would hide exactly the failure mode this US
exists to expose.

**Downstream note for US-047:** the Sin categoría chart item must render its
count even when its percentage is `null`.

---

### D-09 — Semáforo: zero edits, and a regression test to keep it that way.

`calcularEstadoBucket` returns `null` for `Bucket.SinCategoria` (explicit case
in its documented rules) and `null` for anything that is not
Necesidades/Deseos/Ahorro. `calcularEstadoGlobal` skips nulls. CA-03 therefore
holds **structurally** — no code change is needed or wanted in
`estado-semaforo.ts`.

The design obligation is a **guard test**: adding a count must not perturb
`estadoGlobal`. Cheap insurance against a future refactor that starts feeding
counts into the aggregation.

---

### D-10 — Logging.

`CalcularResumenMesUseCase` already logs counts only, never amounts (ADR-013).
`cantidadSinCategoria` is a count and is therefore safe to add to the existing
`'calcular-resumen-mes: computed'` debug payload. Optional and low value — take
it only if it costs nothing; **never** log the count next to a monetary field in
a way that lets the two be correlated back into an amount.

---

## 3. Data flow, end to end

```
                  ┌──────────────────────── apps/api ─────────────────────────┐

PostgreSQL
  Transaccion(accountId → Account.userId, fecha, cargo, abono, bucketId)
        │
        │  $transaction([
        │    groupBy(by: bucketId, where: {account:{userId}, fecha:[d,h)}, _sum:{cargo,abono}),
        │    groupBy(by: bucketId, where: {…same…, cargo:{gt:0}},          _count:{_all})
        │  ])                                            ▲ USER ISOLATION in BOTH
        ▼
PrismaResumenMesRepository                        (infrastructure/persistence)
  resolverBucket(bucketId) ──► null | unknown id ──► Bucket.SinCategoria
  accumulate (ADD, never overwrite) into 5 pre-seeded buckets
        │
        ▼
BucketSumRow[]  { bucket, totalCargo, totalAbono, cantidadCargos }   (application/ports)
        │
        ▼
construirResumenMesDesdeFilas                     (application/use-cases)
  totalIngreso         = rowMap[Ingreso].totalAbono        ?? 0n
  necesidades/deseos/ahorro/sinCategoria = …totalCargo     ?? 0n
  cantidadSinCategoria = rowMap[SinCategoria].cantidadCargos ?? 0     ← NEW
        │
        ▼
ResumenMes.crear(input)                           (domain/value-objects)
  buckets[4]  (unchanged: total + porcentajeBp + estadoSemaforo)
  cantidadSinCategoria  (carried verbatim — no computation)           ← NEW
  estadoGlobal (unchanged)
        │
        ▼
aResumenMesDto(periodo, resumen)                  (infrastructure/http/dto)
  cantidadSinCategoria: resumen.cantidadSinCategoria                  ← NEW
        │
        ├─► GET /api/resumen        (resumen.routes.ts — unchanged)
        └─► GET /api/resumen/anual  via aResumenAnualDto → meses[i]   (D-07)

                  └───────────────────────────────────────────────────────────┘
        │
        ▼
resumenResponseSchema (Zod, contract source of truth)
        │  pnpm api openapi:emit
        ▼
apps/api/openapi.json  ──► pnpm api-client generate ──► packages/api-client/src/types.gen.ts
        │                                                        │
        └─────────────► apps/web/src/api/types.ts ───────────────┤ (re-export)
                        apps/mobile/src/domain/resumen.types.ts ─┘
```

**Annual variant:** `PrismaResumenAnualRepository` keeps its single `findMany`
and increments `cantidadCargos` inside the existing reduce when `t.cargo > 0n`
(D-07). It never issues a second query.

---

## 4. Integration points (exact touch list)

> **Delivery note (PR-A boundary).** This document describes the FULL US-045
> scope. The change ships as 2 chained PRs (stacked-to-main): **PR-A** covers
> items 1-6 of this table plus input-side spec-fixture compile-fixes; items
> 7-12 (DTO/schema output, contract regen, client fixtures, e2e) land in
> **PR-B**. Rows in §8 that assume the contract regen has landed apply to the
> change as a whole, not to PR-A alone.

| # | File | Change |
|---|---|---|
| 1 | `apps/api/src/application/ports/resumen-mes.port.ts` | `BucketSumRow.cantidadCargos: number` (required) + doc of the cargos-only rule |
| 2 | `apps/api/src/application/ports/resumen-anual.port.ts` | `BucketSumRowAnual.cantidadCargos: number` — keeps structural assignability to `BucketSumRow` (D-07) |
| 3 | `apps/api/src/infrastructure/persistence/prisma-resumen-mes.repository.ts` | extract `resolverBucket`; second scoped `groupBy` inside `$transaction`; accumulator gains `cantidadCargos` (D-05) |
| 4 | `apps/api/src/infrastructure/persistence/prisma-resumen-anual.repository.ts` | `cantidadCargos` in the existing in-memory reduce; pre-seed `0` |
| 5 | `apps/api/src/domain/value-objects/resumen-mes.ts` | `ResumenMesInput.cantidadSinCategoria` + `ResumenMes.cantidadSinCategoria`. **`BucketSlice` untouched.** |
| 6 | `apps/api/src/application/use-cases/resumen-mes-assembly.ts` | read `rowMap.get(Bucket.SinCategoria)?.cantidadCargos ?? 0` and pass it through |
| 7 | `apps/api/src/infrastructure/http/dto/resumen-mes.dto.ts` | `ResumenMesDto.cantidadSinCategoria: number` + one mapper line. **`BucketResumenDto` untouched.** |
| 8 | `apps/api/src/infrastructure/http-express/schemas/resumen.schema.ts` | `cantidadSinCategoria: z.number().int().nonnegative().describe(...)` on `resumenResponseSchema` |
| 9 | `apps/api/openapi.json` | regenerated (`pnpm api openapi:emit`) — `ResumenMesResponse` gains the property + `required` entry; `ResumenAnualResponse` follows via its reference |
| 10 | `packages/api-client/src/types.gen.ts` | regenerated (`pnpm api-client generate`) |
| 11 | `apps/web` — 9 test fixture sites (D-06) | add `cantidadSinCategoria` to each `ResumenMesDto` literal |
| 12 | `apps/mobile` — 2 test fixture sites (D-06) | same |
| 13 | api-side specs (§6) | new + extended cases |

**Not touched, by design:** `estado-semaforo.ts`, `bucket.ts`,
`resumen.routes.ts`, `resumen-anual.schema.ts`, `calcular-resumen-mes.use-case.ts`
(beyond the optional log of D-10), `calcular-resumen-anual.use-case.ts`,
`prisma/schema.prisma`, any migration, both clients' runtime type guards, both
clients' view-models.

---

## 5. Contract regeneration chain

```
resumen.schema.ts  (Zod — the source of truth)
   │  pnpm api openapi:emit          # scripts/emit-openapi.ts, pure, no DB/app boot
   ▼
apps/api/openapi.json                # COMMITTED
   │  pnpm api-client generate       # openapi-typescript --immutable
   ▼
packages/api-client/src/types.gen.ts # COMMITTED
```

From the repo root, both steps are one command: **`pnpm contract:sync`**.

**Files that MUST be committed together** (a partial commit fails CI):

1. `apps/api/src/infrastructure/http-express/schemas/resumen.schema.ts`
2. `apps/api/openapi.json`
3. `packages/api-client/src/types.gen.ts`
4. the `apps/web` + `apps/mobile` fixture updates (D-06)

**The gates that enforce it:**

| Gate | Job | Command | Fails when |
|---|---|---|---|
| OpenAPI drift | `api` (`ci.yml:210`) | `pnpm api openapi:check` | `openapi.json` not regenerated after the Zod edit |
| Client type drift | `api-client` (`ci.yml:524-530`) | `pnpm api-client generate` + `git diff --exit-code` | `types.gen.ts` not regenerated |
| Client compile | `web` / `mobile` (triggered by `packages/**`) | `pnpm web typecheck`, mobile typecheck | fixtures missing the new required field |
| Contract conformance | `dast` (advisory) | Schemathesis `response_schema_conformance` | a live response omits the required field |

**Schema authoring note.** `.int()` is already used on `porcentajeBp` and
renders fine; `.nonnegative()` adds `minimum: 0`. If the deterministic JSON
renderer produces unexpected output for `.nonnegative()`, drop to plain `.int()`
— the constraint is documentation, not a validation the server needs (the value
is a `_count`).

---

## 6. Test design

### 6.1 Compiler-forced updates (no new assertions, just fixture completion)

- `resumen-mes.spec.ts`, `resumen.schema.spec.ts` (`makeResumen`),
  `resumen-mes.dto.spec.ts` — every `ResumenMes.crear({...})` call gains
  `cantidadSinCategoria`. Where a local helper exists (`makeResumen`), default
  it there so only the helper changes.
- `calcular-resumen-mes.use-case.spec.ts`, `calcular-resumen-anual.use-case.spec.ts`
  — fake readers must return `cantidadCargos` on every row. **No destructuring
  change**: the use-case result shape (`{ periodo, resumen }` /
  `{ anio, resumenAnual }`) is unchanged.
- `prisma-resumen-anual.repository.spec.ts` — expected row objects gain the field.
- `apps/web` (9 sites) + `apps/mobile` (2 sites) per D-06.

### 6.2 Asserts that must survive **unchanged** (design win — verify, don't edit)

`buckets` stays 4 entries with 4 fields, so these keep passing as-is and act as
regression guards that the additive design held:

- `resumen-mes.spec.ts:84` `toHaveLength(4)` and every positional
  `buckets[0]` / `buckets[3]` assert (lines 85-119, 176-179, 218)
- `resumen-mes.dto.spec.ts:198` `expect(dto.buckets).toHaveLength(4)`
- `resumen.e2e-spec.ts:262,304` `expect(res.body.buckets).toHaveLength(4)`

> If a task ends up needing to change any of these, the additive constraint has
> been violated — stop and re-read D-02.

### 6.3 New unit cases — domain (`resumen-mes.spec.ts`)

| Case | Assertion |
|---|---|
| Count carried verbatim | `crear({..., cantidadSinCategoria: 7}).cantidadSinCategoria === 7` |
| Default zero | input `0` → `0`, field present (not `undefined`) |
| **0-income, count > 0** (D-08) | `totalIngreso: 0n, sinCategoria: 90_000n, cantidadSinCategoria: 7` → `sinIngreso === true`, SinCategoria slice `porcentajeBp === null`, `cantidadSinCategoria === 7` |
| Count does not touch the semáforo (D-09) | two `ResumenMes` identical but for the count → same `estadoGlobal`, same per-slice `estadoSemaforo` |
| Percentage still exact | existing round-half-up cases unchanged; assert `buckets[3].porcentajeBp` for a `.5` remainder case rounds up (guard that no float crept in) |
| `BucketSlice` has no count | type-level check: `expectTypeOf<BucketSlice>().not.toHaveProperty('cantidadCargos')` (vitest `expectTypeOf`) — a runtime `'cantidadCargos' in buckets[3]` assert is tautologically true today and would not catch a differently-named leak. Note: `not.toMatchTypeOf<'cantidadCargos'>()` on `keyof BucketSlice` was tried first and rejected — union-to-literal assignability makes it tautologically pass regardless of whether the key exists (mutation-tested); `not.toHaveProperty(key)` genuinely fails `tsc` when the key is present and locks the ISP boundary of D-04 |

### 6.4 New unit cases — DTO (`resumen-mes.dto.spec.ts`)

- `cantidadSinCategoria` is always present as a key, even when `0` (mirrors the
  existing `'estadoGlobal' in dto` invariant test, `'estadoGlobal field is
  always present (key exists even when null)'`, at line 189).
- It is a JS `number`, never a string (mirrors the "money is a string" invariant
  from the other direction — this one is the *only* non-money integer besides
  `porcentajeBp` and `targets`).
- It equals the VO value.
- `BucketResumenDto` entries still have exactly the 4 known keys.

### 6.5 New unit cases — Zod (`resumen.schema.spec.ts`)

The existing "sync guarantee" tests parse the **real** `aResumenMesDto` output,
so they cover the happy path automatically once the mapper emits the field. Add:

- rejects a payload where `cantidadSinCategoria` is a string
- rejects a payload missing `cantidadSinCategoria` (proves it is required, D-06)
- accepts `0`

### 6.6 Integration — `prisma-resumen-mes.repository.spec.ts` (the risk-carrying suite)

Extend the existing scenarios; add one new one. All require a real DB
(`pnpm api test:integration`, `ALLOW_DESTRUCTIVE_DB=1`).

| Scenario | What it must prove |
|---|---|
| **SC-03 extended (HIGHEST RISK)** | seed 1 null-bucket cargo row **and** 1 explicit `SinCategoria` cargo row → `cantidadCargos === 2` **and** `totalCargo === 200_000n`. Counts must **ADD**, never overwrite — the same rule the sums already prove. |
| **SC-10 NEW — cargos only** | seed an uncategorized **abono** row (`bucketId: null, cargo: 0n, abono: 50_000n`) alongside an uncategorized cargo row. Assert `cantidadCargos === 1` (the abono is not counted) **and** `SinCategoria.totalAbono === 50_000n` (proving the `cargo: { gt: 0 }` filter did **not** leak into the sums query). This second assert is the one that catches the worst possible implementation mistake. |
| SC-01 extended | per-bucket counts match the seeded cargo rows for Necesidades/Deseos/Ahorro/SinCategoria; `Ingreso.cantidadCargos === 0` (its rows are abonos) |
| SC-05 extended | empty month → all 5 buckets return `cantidadCargos === 0` |
| **SC-09 extended (RNF-SEC-006, mandatory)** | user B seeds uncategorized cargos in the same period; A's query returns **only A's** `cantidadCargos`. Follow the existing SC-09 shape exactly: seed both users, query as A, assert A's number and that it is *not* the A+B sum. |

### 6.7 Integration — HTTP level (`auth-isolation.int-spec.ts`, ISO-02)

The proposal marks `user-data-isolation` ISO-02 as a modified capability. Extend
the existing `GET /api/resumen` isolation test (around line 269, which already
asserts `res.body.totalIngreso` and a bucket total) with
`expect(res.body.cantidadSinCategoria).toBe(<A's count>)` — proving isolation at
the endpoint boundary, not just the repository.

### 6.8 E2E — `resumen.e2e-spec.ts`

Extend the SC-01 DTO-shape test (line 190) with
`expect(typeof res.body.cantidadSinCategoria).toBe('number')`, and the empty-month
test (line 303, which already asserts `totalIngreso === '0'`) with
`expect(res.body.cantidadSinCategoria).toBe(0)` — this is also the CA-01
"Ingresos always present, 0 when empty" evidence (D-01).

### 6.8b E2E — annual, `resumen-anual.e2e-spec.ts` (D-07 coverage)

D-07 widens `meses[i]` with a truthful (non-zero-by-default) count, but §6
had no explicit assertion for it. Extend the two existing tests:

- **DTO shape test** (`'DTO shape — 12 months, Jan→Dec periodo labels, reused
  ResumenMesDto shape'`, currently asserting `totalIngreso`/`sinIngreso`/
  `buckets` per month) — seed at least one uncategorized cargo row in a known
  month first (the shared `loginAsSeededUser` fixture is NOT guaranteed to
  contain one for the current UTC year — do not rely on it), then add
  `expect(mes.cantidadSinCategoria).toBeGreaterThan(0)` for that month, proving
  the annual reduce carries the real count through (not a placeholder `0`
  that a zero-default assertion would fail to catch).
- **CA-08 isolation test** (`'CA-08: user A does NOT see user B annual
  data'`) — seed at least one uncategorized cargo row for user A distinct
  from user B's, and add
  `expect(resA.body.meses[<march index>].cantidadSinCategoria).toBe(<A's
  count>)`, proving `cantidadSinCategoria` is isolated by `userId` at the
  annual endpoint boundary, not just `totalIngreso`/bucket totals.

### 6.9 Strict TDD

The repo runs Strict TDD. Order per slice: failing test → minimal implementation
→ refactor. The natural slicing is bottom-up along §3's data flow (port + domain
→ assembly → repositories → DTO + schema → contract regen → client fixtures), so
every layer has a red test before it has code.

---

## 7. Risks and open items

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | The second `groupBy`'s fold overwrites instead of adding (SC-03 for counts) | **High** | one shared `resolverBucket`, one accumulator with add-only mutation, SC-03 extended to counts (§6.6) |
| R-2 | `cargo: { gt: 0 }` accidentally applied to the **sums** query, corrupting `totalAbono` and thus every percentage in the app | **High** | the `where` object is built once and spread; SC-10's `totalAbono` assert is designed specifically to catch this |
| R-3 | `web`/`mobile` red on the new required field | Med | known and enumerated (D-06); fixture updates are in scope for the same PR |
| R-4 | Contract drift (openapi/api-client not regenerated) | Med | `pnpm contract:sync` + two CI gates already block merge (§5) |
| R-5 | Annual path breaks `tsc` via the shared assembly | Med | `BucketSumRowAnual` widened in lockstep (D-07); annual use-case + repo specs in the verification set |
| R-6 | Count leaks across users | Low | both queries carry `account: { userId }`; SC-09 + ISO-02 extended (§6.6, §6.7) |
| R-7 | Reviewer rejects `number` as a DR-02 "no float in the money path" violation | Low | D-03 states the boundary explicitly; the count never enters a monetary expression |
| R-8 | Second query measurably slows `/api/resumen` | Low | same predicate family, same index path; revisit trigger = measured p95 regression (§D-05) |

**Assumptions to validate during apply:**

- ~~`prisma.$transaction([groupBy, groupBy])` types cleanly under Prisma 7 with
  the `@prisma/adapter-pg` driver adapter. If not → `Promise.all` fallback,
  documented in code (D-05).~~ **RESOLVED**: it types cleanly. The initial
  friction was an inline-array-literal inference issue, not an incompatibility
  between the `_sum` and `_count` groupBy shapes — binding each `groupBy()`
  call to its own `const` before the `$transaction([...])` array lets TS
  resolve each call's own result type first, so the tuple overload resolves.
  The `Promise.all` fallback is no longer needed and has been removed from
  `prisma-resumen-mes.repository.ts`; the array-form `$transaction` (one
  snapshot for both queries) is in place.
- Zod `.nonnegative()` renders deterministically through the repo's
  `renderOpenApiJson`. If not → plain `.int()` (§5).
- The integration suite needs a local Postgres (`pnpm api db:up` +
  `test:db:setup`, see `apps/api/docs/local-test-db.md`); this is the
  pre-existing ADR-028/ADR-029 constraint, not new to this US.

**Explicitly deferred (registered, with triggers — YAGNI rule 5):**

- Year-level Sin categoría aggregation → **US-046**.
- Rendering the 5 items, and extending the clients' runtime `esResumenMesDto`
  guards to cover the count → **US-047**.
- Any semáforo rule for Ingresos or Sin categoría → no trigger, no owner today.

**Residual gap — NOT closed by this US (deliberate, candidate for backlog).**
`process-ingesta.use-case.ts` (~line 339) documents that when the writer
fails after classification, an Ingreso-shaped row (`abono>0, cargo===0`) can
be persisted with `bucketId: null`. Because RES-02's count scope is cargos
only (`cargo > 0`), such a row is invisible to Sin categoría's count *and*,
being unresolved to `Bucket.Ingreso`, it is also excluded from
`totalIngreso` (which sums only rows resolved to the Ingreso bucket). The
money is silently missing from both places a user would look for it — not a
regression introduced by this US (the gap predates it), but this US does not
close it either. No trigger or owner assigned yet; flagged here so it is not
mistaken for something RES-02/RES-03 already cover.

---

## 8. Compliance check

| Constraint | Status |
|---|---|
| ADR-005 dependency rule `domain ← application ← infrastructure` | ✅ the count enters via the port; the VO stays free of Prisma/HTTP |
| ADR-011 contract-first (`openapi.json` is the single HTTP contract) | ✅ Zod → openapi → client, regenerated and committed |
| ADR-012 additive, platform-agnostic client | ✅ purely additive; no existing field changes shape or meaning |
| ADR-013 no amounts/PII in logs | ✅ only a count is logged, and only if D-10 is taken |
| ADR-015 money-critical verification | ✅ no new money arithmetic; existing BigInt round-half-up reused; count is not money (D-03) |
| ADR-024 backend rich / clients thin | ✅ the count is computed once in the backend; the "Ingresos slice, no %" framing stays a client concern (D-01) |
| RNF-SEC-006 user isolation in the WHERE | ✅ both queries carry `account: { userId }`; tested at repo and HTTP level |
| SOLID — ISP | ✅ `BucketResumenDto` stays uniform; the port stays narrow (one method) |
| SOLID — SRP | ✅ the repository aggregates, the assembly narrows, the VO models, the mapper serializes — no responsibility moves |
| KISS | ✅ no new pattern; the only added indirection (`resolverBucket`) removes a duplication the second query would otherwise create |
| YAGNI | ✅ one field, no `items[]`, no per-bucket counts, no annual aggregate, no cache |
