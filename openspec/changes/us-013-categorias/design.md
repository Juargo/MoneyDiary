# Design — US-013: Categorías por transacción

- Slug: `us-013-categorias`
- Phase: DESIGN (the HOW at architectural level — no tasks/code)
- Artifact store: hybrid (Engram `sdd/us-013-categorias/design` + this file)
- Reads: proposal (`sdd/us-013-categorias/proposal`, Engram #289 = FINAL product decisions), exploration (#288)
- Language: English (neutral). Domain identifiers in Spanish (project convention).

---

## 0. Architecture overview

MoneyDiary is a modular monolith on Clean Architecture (ADR-005): `domain ← application ←
infrastructure`, functional errors via `Result<T,E>` (never throw in domain/application),
money as `BigInt` (never float), and structural `userId` isolation in the WHERE clause
(RNF-SEC-006). US-013 inserts a **`Categoria`** layer *between* `PatronClasificacion` and
`BucketPresupuesto` and lets the user **reclassify** a transaction, which can move money
between the 50/30/20 buckets.

The single most important design idea that makes the whole feature safe:

> **Bucket is always DERIVED from categoría on every write path; it is never accepted from
> a client and never set independently of the categoría that produced it.** Because the
> map `Categoria → Bucket` lives in pure domain and the write use cases *derive* the bucket
> from the chosen categoría, the invariant `Transaccion.bucket === categoria.bucket`
> (whenever a categoría is set) holds **by construction** — no DB trigger, no cross-table
> CHECK, no reconciliation job needed on the happy path.

The second load-bearing fact:

> **The resumen 50/30/20 is COMPUTED on read** (`CalcularResumenMesUseCase` →
> `prisma.transaccion.groupBy({ by: ['bucketId'] })`). There is **no materialized resumen**
> to invalidate server-side. A reclassify only updates two columns on ONE row
> (`categoriaId` + derived `bucketId`) atomically; the next `/api/resumen` read recomputes
> automatically. The only thing that must be invalidated is the **web's TanStack Query
> cache**, on the client, after a successful PATCH.

Component map (new pieces in **bold**):

```
domain/
  value-objects/
    bucket.ts                         (unchanged enum)
    categoria.ts                      **Categoria enum + CATEGORIA_BUCKET map (invariant SoT)**
    patron-clasificacion.ts           (VO: bucket→categoria; derived `get bucket()`)
  errors/
    categoria-invalida.error.ts       **new (unknown categoría in reclassify)**
    transaccion-no-encontrada.error.ts **new (not found OR not owned — merged)**
application/
  ports/
    catalogo-clasificacion.port.ts    (findAll now yields patterns carrying categoría)
    transaccion-bucket-writer.port.ts (asignarBuckets → **asignarCategorizacion**)
    reclasificar-categoria.port.ts    **new (userId-isolated single-row write)**
    movimientos-mes.port.ts           (row gains `categoria`)
    detalle-bucket.port.ts            (row gains `categoria`)
  use-cases/
    categorizar-transaccion.use-case.ts   ({bucket} → **{categoria, bucket}**)
    process-ingesta.use-case.ts           (persists categoría + bucket together)
    reclasificar-transaccion.use-case.ts  **new**
infrastructure/
  persistence/
    categoria-ids.ts                  **CATEGORIA_IDS + CATEGORIA_ID_TO_CATEGORIA (mirror bucket-ids.ts)**
    prisma-catalogo-clasificacion.repository.ts   (include categoria)
    prisma-transaccion-bucket.repository.ts       (write categoriaId + bucketId)
    prisma-reclasificar-categoria.repository.ts   **new**
    prisma-movimientos-mes.repository.ts          (select+fold categoriaId)
    prisma-detalle-bucket.repository.ts           (select+fold categoriaId)
  http/
    transacciones.controller.ts       **new (PATCH /api/transacciones/:id/categoria)**
    transacciones.module.ts           **new (composition root for reclassify)**
    dto/movimiento-mes.dto.ts         (add categoria)
    dto/detalle-bucket.dto.ts         (add categoria)
    dto/reclasificar-categoria.dto.ts **new**
prisma/
  schema.prisma                       (Categoria model; Transaccion/Patron .categoriaId)
  seed.ts                             (CATEGORIA_CATALOG; patterns → categoría)
  backfill-categorias.ts             **new (dry-run, gated, idempotent)**
apps/web/
  domain/agrupar-detalle-por-categoria.ts   **new (group + BigInt subtotal + count)**
  api/use-reclasificar-categoria.ts         **new (useMutation + invalidation)**
  api/types.ts                              (DTO mirrors gain categoria)
  components/BucketCategoriasList.tsx        **new (single bucket, grouped by categoría, per-row select)**
  components/ResumenScreen.tsx               (revert panel to single-bucket-on-click)
```

---

## 1. Decision — Schema, ids, migration ordering

### 1.1 `Categoria` model (Prisma)

```prisma
model Categoria {
  id            String                @id            // fixed seed id, e.g. "categoria-supermercado"
  nombre        String                @unique        // == Categoria enum value, e.g. "Supermercado"
  bucketId      String
  bucket        BucketPresupuesto     @relation(fields: [bucketId], references: [id])
  patrones      PatronClasificacion[]
  transacciones Transaccion[]

  @@index([bucketId])
}
```

`BucketPresupuesto` gains `categorias Categoria[]`. `PatronClasificacion` gains
`categoriaId String` + relation; `Transaccion` gains `categoriaId String?` + relation.

```prisma
model PatronClasificacion {
  id          String            @id @default(cuid())
  patron      String
  matchType   String
  categoriaId String                                  // NOT NULL after S2 (seed-owned)
  categoria   Categoria         @relation(fields: [categoriaId], references: [id])
  prioridad   Int
  // bucketId  — DROPPED in S2 (was redundant; bucket derives via categoria)
}

model Transaccion {
  // ...existing fields...
  bucketId    String?           // STAYS NOT-nullable-semantics-wise the 50/30/20 source of truth
  bucket      BucketPresupuesto? @relation(fields: [bucketId], references: [id])
  categoriaId String?           // NULLABLE forever (Ingreso / SinCategoría / unmatched)
  categoria   Categoria?        @relation(fields: [categoriaId], references: [id], onDelete: SetNull)
}
```

**Decision: `PatronClasificacion.bucketId` is REPLACED by `categoriaId` (dropped, not kept
alongside).** The pattern points at a categoría; its bucket is `categoria.bucket`. Keeping
both would re-introduce the exact "pattern and bucket can disagree" drift the proposal
rejected in Option B. Rejected alternative: keep `bucketId` as a denormalized cache on the
pattern — no, patterns are seed-owned and tiny; a JOIN/`include` on categoría is free and
removes a whole class of drift.

**Decision: `Transaccion.categoriaId` is NULLABLE with `onDelete: SetNull`.** Nullable is
mandated by the FINAL model (Ingreso, SinCategoría, and unmatched rows are legitimately
category-less). `SetNull` (never `Cascade`) is a safety choice: deleting a categoría must
NEVER cascade-delete transactions — that would destroy money data. In practice categorías
are fixed seed rows and are never deleted, so this is defensive.

**Decision: `bucketId` STAYS as the 50/30/20 source of truth** (FINAL). It is a *derived
cache* of `categoria.bucket` for rows that have a categoría, and the *only* home for the
bucket of category-less rows (Ingreso, SinCategoría). Rejected alternative (proposal Q4:
drop `bucketId`, always derive via `categoria.bucket`): rejected because (a) Ingreso and
SinCategoría rows have **no** categoría yet still need a bucket for the resumen — dropping
`bucketId` would force an awkward "null categoría means Ingreso-or-SinCategoría, but which?"
disambiguation; (b) the resumen aggregation is a single `groupBy(['bucketId'])` today —
deriving via categoría would add a JOIN to the hottest read; (c) the write path keeps the
cache consistent atomically (§3, §4), so the denormalization is cheap to maintain.

### 1.2 Fixed ids (mirror `bucket-ids.ts`)

`infrastructure/persistence/categoria-ids.ts`:

```ts
import { Categoria } from '../../domain/value-objects/categoria';

export const CATEGORIA_IDS: Record<Categoria, string> = {
  [Categoria.Supermercado]: 'categoria-supermercado',
  [Categoria.Combustible]:  'categoria-combustible',
  [Categoria.Farmacia]:     'categoria-farmacia',
  [Categoria.Salud]:        'categoria-salud',
  [Categoria.Transporte]:   'categoria-transporte',
  [Categoria.Streaming]:    'categoria-streaming',
  [Categoria.Delivery]:     'categoria-delivery',
  [Categoria.Ahorro]:       'categoria-ahorro',
};

// Inverse map, built once at module load (single source of truth, DRY) — mirrors
// BUCKET_ID_TO_BUCKET. Used to fold a physical categoriaId back to the domain enum.
export const CATEGORIA_ID_TO_CATEGORIA: ReadonlyMap<string, Categoria> = new Map(
  (Object.entries(CATEGORIA_IDS) as [Categoria, string][]).map(([c, id]) => [id, c]),
);
```

Same rationale as `BUCKET_IDS`: fixed ids make the seed idempotent (upsert-by-id) and
single-source the enum↔row mapping. This is the `CATEGORIA_IDS` + `CATEGORIA_ID_TO_CATEGORIA`
pair the task asks for.

### 1.3 Migration ordering (non-breaking, then tighten)

| Slice | Migration | Effect |
|-------|-----------|--------|
| S1 | `add_categoria` | CREATE TABLE `Categoria`; ADD `Transaccion.categoriaId` (nullable FK, SetNull); ADD `PatronClasificacion.categoriaId` (**nullable** FK). `PatronClasificacion.bucketId` kept. Structural only — **no data**. |
| S1 | (seed) | Upsert 8 `Categoria` rows (fixed ids); rewire each pattern to set **both** `bucketId` (as today) AND `categoriaId`. Keeps S1 behavior-preserving: current code still reads `bucketId`. |
| S2 | `drop_patron_bucketid` | Make `PatronClasificacion.categoriaId` **NOT NULL** (safe — S1 seed populated all); DROP `PatronClasificacion.bucketId`. Ships together with the code flip that reads `categoria`. |

`Transaccion.categoriaId` is **never** made NOT NULL. Data migration for `Transaccion` (the
real backfill of existing rows) is a **separate gated script**, not a Prisma migration (§6) —
consistent with the repo's posture that schema migrations are structural and data mutation is
seed/script under `ALLOW_DESTRUCTIVE_DB`.

No interaction with the existing `add_cargo_abono_check` CHECK (that constraint is on
`Transaccion.cargo/abono`, untouched here).

---

## 2. Decision — Where the consistency invariant lives

Invariant: **when `Transaccion.categoriaId` is set, `Transaccion.bucketId === categoria.bucketId`.**

**Recommendation: enforce it in the DOMAIN (a total `Categoria → Bucket` map) + the
APPLICATION write use cases (derive-don't-accept). No DB CHECK, no trigger.**

```ts
// domain/value-objects/categoria.ts
export enum Categoria {
  Supermercado = 'Supermercado',
  Combustible  = 'Combustible',
  Farmacia     = 'Farmacia',
  Salud        = 'Salud',
  Transporte   = 'Transporte',
  Streaming    = 'Streaming',
  Delivery     = 'Delivery',
  Ahorro       = 'Ahorro',
}

// The belongs-to-bucket invariant, as pure data. Total over the enum → the type
// checker guarantees every categoría has exactly one bucket (no orphan categoría).
export const CATEGORIA_BUCKET: Record<Categoria, Bucket> = {
  [Categoria.Supermercado]: Bucket.Necesidades,
  [Categoria.Combustible]:  Bucket.Necesidades,
  [Categoria.Farmacia]:     Bucket.Necesidades,
  [Categoria.Salud]:        Bucket.Necesidades,
  [Categoria.Transporte]:   Bucket.Necesidades,
  [Categoria.Streaming]:    Bucket.Deseos,
  [Categoria.Delivery]:     Bucket.Deseos,
  [Categoria.Ahorro]:       Bucket.Ahorro,
};

export function bucketDeCategoria(c: Categoria): Bucket {
  return CATEGORIA_BUCKET[c];
}
```

Why domain + application, not DB:
- **Domain** owns the *fact* that a categoría belongs to a bucket. `CATEGORIA_BUCKET` is a
  `Record<Categoria, Bucket>` — total by construction, so a categoría can never be
  bucket-less, and the map is trivially unit-testable without a DB (matches how `Bucket` and
  `PatronClasificacion.coincide` already live in pure domain).
- **Application** (the reclassify + categorización use cases) *derives* the bucket from the
  chosen categoría. The write API surface **never accepts a bucket** — only a categoría — so
  the invariant is unbreakable on the write path. This is the LSP/DIP-clean version:
  extend the return shape, no `switch`, no `instanceof`.
- **DB CHECK/trigger rejected**: Postgres cannot express "row.bucketId equals the bucketId
  of the referenced categoría" without a trigger; Prisma does not model triggers; and the
  derive-don't-accept design makes the DB guard redundant. It would be pure ceremony (KISS).

Two *test* safety nets replace the DB guard:
1. **Seed-integrity test**: each seeded `Categoria.bucketId === BUCKET_IDS[CATEGORIA_BUCKET[nombre]]`.
   Guarantees the DB table agrees with the domain map (they are two representations of one
   fact; the test keeps them from drifting).
2. **Reclassify integration test**: after a reclassify, `categoriaId` and `bucketId` on the
   row are consistent, and the resumen delta is exact (§8).

`PatronClasificacion` VO reconciliation — the VO stops carrying an independent `bucket`
field and instead carries `categoria`, exposing bucket as a **derived getter** (DRY: one
source):

```ts
// domain/value-objects/patron-clasificacion.ts
constructor(props: { id; patron; matchType; categoria: Categoria; prioridad }) { ... }
get bucket(): Bucket { return CATEGORIA_BUCKET[this.categoria]; }  // derived, never stored
```

This keeps the existing `patron.bucket` read sites working while making bucket un-settable
independently of categoría.

---

## 3. Decision — Categorización use case change (automatic path)

`CategorizarTransaccionUseCase.execute` return shape: `{ bucket }` → **`{ categoria: Categoria | null, bucket }`**.

```ts
interface CategorizarTransaccionResult {
  readonly categoria: Categoria | null;   // null for Ingreso and unmatched
  readonly bucket: Bucket;                // derived: CATEGORIA_BUCKET[categoria] | Ingreso | SinCategoria
}
```

- Ingreso rule (`abono>0 && cargo===0`) → `{ categoria: null, bucket: Ingreso }`.
- Pattern match (priority asc, id asc — **unchanged**) → `{ categoria: patron.categoria,
  bucket: patron.bucket }` (bucket is the VO's derived getter).
- No match → `{ categoria: null, bucket: SinCategoria }`.

The "never throws, always `Result.ok`, degrade to SinCategoría" contract is preserved — we
only widen the return object (OCP: extend, don't rewrite).

**Catalog port** — `ICatalogoClasificacion.findAll()` still returns
`ReadonlyArray<PatronClasificacion>`; the only change is that each VO now carries `categoria`
(and derives `bucket`). `PrismaCatalogoClasificacionRepository` swaps `include: { bucket: true }`
→ `include: { categoria: true }` and maps `row.categoria.nombre as Categoria`.

**Persist path** — the writer port renames to reflect it now writes both columns:

```ts
// application/ports/transaccion-bucket-writer.port.ts  (ITransaccionBucketWriter)
asignarCategorizacion(
  ingestaId: string,
  asignaciones: ReadonlyArray<{ transaccionId: string; categoria: Categoria | null; bucket: Bucket }>,
): Promise<Result<{ actualizadas: number }, CategorizacionFallidaError>>;
```

`PrismaTransaccionBucketRepository` groups by `(categoria, bucket)` and emits one
`updateMany` per group inside the existing `$transaction`, setting
`{ categoriaId: categoria ? CATEGORIA_IDS[categoria] : null, bucketId: BUCKET_IDS[bucket] }`,
keeping the **double-lock scope isolation** (`WHERE id IN (...) AND ingestaId = ?`).

**`ProcessIngestaUseCase` wiring is unaffected structurally** — same collaborators, same
token graph in `IngestaModule`. `runCategorizacion` maps each classified row to
`{ transaccionId, categoria, bucket }` (was `{ transaccionId, bucket }`) and the degradation
island is unchanged: catalog down → only Ingreso rows written (`categoria null, bucket Ingreso`),
the rest stay `null/null` (pending, distinguishable from a real SinCategoría). The
`asignadas/sinCategoria` counters keep their current meaning.

Rejected alternative: a second writer method / a new port for categoría. Rejected — the
bucket write and the categoría write are one atomic fact about a row; splitting them invites
partial writes where `bucketId` and `categoriaId` disagree (KISS + the invariant argument).

---

## 4. Decision — Manual reclassify endpoint

### 4.1 Contract

```
PATCH /api/transacciones/:id/categoria
Auth:  ApiKeyGuard (shared key) + SessionGuard (per-user)  — same chain as the 4 data controllers
Body:  { "categoria": "Transporte" }          // domain nombre, validated against the Categoria enum
200:   { "id": "...", "categoria": { "id": "categoria-transporte", "nombre": "Transporte" }, "bucket": "Necesidades" }
400:   categoría unknown            → CategoriaInvalidaError (scrubbed message, raw value never reflected)
404:   not found OR not owned       → TransaccionNoEncontradaError (merged — anti-enumeration)
```

**Request carries the categoría `nombre`, not the physical id.** Rationale: mirrors exactly
how `DetalleBucketController` validates `:bucket` against the `Bucket` enum, and keeps
physical ids (`CATEGORIA_IDS`) inside infrastructure (consistent with the `bucketId`-never-
exposed convention, MOV-01). The backend maps `nombre → CATEGORIA_IDS → categoriaId` and
`nombre → CATEGORIA_BUCKET → bucketId`. Rejected alternative: accept `categoriaId` (physical
id) in the body — works, but leaks the physical key into the write contract; the read DTO
already gives the web everything it needs (see §5) without the write needing the raw id.

**No un-classify (categoría → null) in the request.** The FINAL UI only *assigns* or *moves*
to a real categoría (the "Clasificar" CTA on SinCategoría rows assigns a categoría; reclassify
moves between categorías). A nullable request path is YAGNI — not built until a real
"remove categoría" requirement appears.

### 4.2 Use case + port

```ts
// application/use-cases/reclasificar-transaccion.use-case.ts
class ReclasificarTransaccionUseCase {
  constructor(private readonly writer: IReclasificarCategoriaWriter) {}
  async execute(input: { userId: string; transaccionId: string; categoria: string /* raw */ }):
    Promise<Result<ReclasificarResult, CategoriaInvalidaError | TransaccionNoEncontradaError>> {
    // 1. Validate categoría against the enum (mirrors ObtenerDetalleBucket's :bucket guard).
    if (!CATEGORIAS_VALIDAS.has(input.categoria)) return Result.fail(new CategoriaInvalidaError(input.categoria));
    const categoria = input.categoria as Categoria;
    // 2. DERIVE the bucket — never accept it. Invariant holds by construction.
    const bucket = CATEGORIA_BUCKET[categoria];
    // 3. userId-isolated single-row write; count===0 → not found/not owned.
    return this.writer.reasignar(input.userId, input.transaccionId, categoria, bucket);
  }
}

// application/ports/reclasificar-categoria.port.ts  (IReclasificarCategoriaWriter)
reasignar(userId: string, transaccionId: string, categoria: Categoria, bucket: Bucket):
  Promise<Result<{ id: string; categoria: Categoria; bucket: Bucket }, TransaccionNoEncontradaError>>;
```

`PrismaReclasificarCategoriaRepository`:

```ts
const { count } = await this.prisma.transaccion.updateMany({
  where: { id: transaccionId, account: { userId } },   // STRUCTURAL isolation (RNF-SEC-006)
  data:  { categoriaId: CATEGORIA_IDS[categoria], bucketId: BUCKET_IDS[bucket] },  // atomic dual-column write
});
if (count === 0) return Result.fail(new TransaccionNoEncontradaError(transaccionId));  // not found OR not yours
return Result.ok({ id: transaccionId, categoria, bucket });
```

The `account: { userId }` predicate is the same structural cross-tenant defense used by every
existing read repo; `count === 0` **merges** "not found" and "not owned" into a single 404 so
a user cannot probe for the existence of another user's transaction (anti-enumeration, mirrors
the auth dummy-hash posture). `categoriaId` + `bucketId` are written in the **same** row
update → the derived cache can never be left half-updated.

### 4.3 Resumen / query invalidation story

- **Backend just persists.** No materialized resumen exists (`/api/resumen` recomputes via
  `groupBy(['bucketId'])` on every read), so there is nothing to invalidate server-side and
  no recompute job to trigger. The moved money is reflected the instant the next resumen read
  runs, because `bucketId` was updated in the PATCH.
- **Web invalidates** on `onSuccess` of the mutation: `['resumen', periodo]`,
  `['detalle-bucket', bucket, periodo]` (and/or `['movimientos', periodo]`),
  `['resumen-anual', anio]`. This makes the pie + traffic light re-fetch and visibly shift
  when the reclassify crossed a bucket boundary — the intended, visible money-move.

New controller/module: `TransacciónController` (`api/transacciones`) + `TransaccionesModule`
(composition root wiring `ReclasificarTransaccionUseCase` + `PrismaReclasificarCategoriaRepository`
behind its token, `inject: [PrismaService]`), registered in `AppModule` alongside the others.

---

## 5. Decision — Expose `categoria` in the read DTOs

Add to the movimientos AND detalle-bucket per-row DTO:

```ts
// before
{ id, fecha, descripcion, cargo, abono, banco, tipoCuenta, numeroCuenta, bucket }
// after (additive — existing consumers unaffected)
{ ..., bucket, categoria: { id: string; nombre: string } | null }
```

`categoria` is `null` for Ingreso, SinCategoría, and unmatched rows. `id` is the **stable
seed id** (`categoria-transporte`), `nombre` is the display label (`Transporte`).

**Why `{ id, nombre }` here (and not nombre-only like `bucket`)**: this is the deliberate
asymmetry — `bucket` is read-only in this UI (you never PATCH a bucket; it derives), so it
folds to a bare `nombre` (MOV-01). `categoria` is the **write target**: the web needs a stable
machine key to (a) key the per-categoría groups and (b) render `<option value=...>` for the
reclassify control, decoupled from the display label. Exposing the fixed seed id (a stable
public slug, not an opaque physical key) serves that. Rejected alternative: fold categoría to
nombre-only and reclassify by nombre — viable and slightly more consistent with the
bucket-hiding convention, but couples the write key to the display string; recorded as the
residual open question Q1.

Both `PrismaMovimientosMesRepository` and `PrismaDetalleBucketRepository` add `categoriaId`
to their `select` and fold it:
`categoria = row.categoriaId == null ? null : { id: row.categoriaId, nombre: CATEGORIA_ID_TO_CATEGORIA.get(row.categoriaId)! }`
(unrecognized non-null id → `null`, defensive, mirrors the bucket fold). Ports
`MovimientoMesRow` / `DetalleBucketRow` gain `categoria: { id: string; nombre: Categoria } | null`.

The detalle read stays a **flat list** — grouping by categoría is done on the web (§7, DRY:
one read path feeds both the standalone `/buckets/:bucket` route and the dashboard panel).

---

## 6. Decision — Backfill migration

`apps/api/prisma/backfill-categorias.ts`, structured like `seed.ts` (own `main()` guarded by
`require.main === module`, `assertDestructiveDbAllowed` at the top, `PrismaPg` adapter).

Algorithm (idempotent, pure recompute):
1. Load the categoría-aware catalog (patterns carrying `categoria`).
2. Select transactions **where `categoriaId IS NULL`** (see scope decision below).
3. For each, run `CategorizarTransaccionUseCase.execute({ descripcion, cargo, abono }, patrones)`
   → `{ categoria, bucket }`.
4. Write `{ categoriaId: categoria ? CATEGORIA_IDS[categoria] : null, bucketId: BUCKET_IDS[bucket] }`
   grouped by `(categoria, bucket)` via `updateMany` in a `$transaction`.

**Scope = `categoriaId IS NULL` (the "never manually touched" set).** This single predicate
delivers all three required properties at once:
- **Idempotent**: the classification is a deterministic function of `(descripcion, cargo,
  abono, catalog)`; re-running yields identical DB state. Rows that resolve to `null`
  (Ingreso/unmatched) simply get recomputed to the same `null` each run — harmless.
- **Preserves manual edits**: after S4 ships, a manually reclassified row has a **non-null**
  `categoriaId`, so the backfill skips it — a later re-run cannot clobber a user's correction.
- **Honest**: a previously-bucketed-but-now-unmatched row lands on `categoriaId = null` +
  `bucketId = SinCategoria`. This CAN move money in the resumen (a row leaves e.g.
  Necesidades). Per proposal §7.4 this is an intended data-quality signal, not a silent
  change — and the **dry-run surfaces it first**.

**Dry-run** (`--dry-run`): compute everything, write nothing, print a summary — total rows,
counts per resulting categoría, and specifically the count of rows whose `bucketId` would
**change** (the money-movement preview) so the operator sees the resumen impact before
committing.

**Safety**: `ALLOW_DESTRUCTIVE_DB=1` gate + prod-connection-string rejection (reused verbatim
from `db-safety.ts`), same posture as `seed.ts`. This change does **not** auto-run the
backfill on deploy — it is a manual, gated operation, dry-run first (residual Q4).

---

## 7. Decision — Web drill-down + reclassify UX

### 7.1 Revert the dashboard panel

`ResumenScreen` currently (PR #75 / US-030 Slice 2) renders `TransaccionesAgrupadas` — **all**
buckets visible at once, pie-click only scroll-highlights. Revert to: **pie/legend click →
right panel shows ONLY that bucket, its transactions grouped by categoría**. `bucketElegido`
reverts from "highlight target" to "selected bucket" (its original US-017 meaning); the panel
renders `<BucketCategoriasList bucket={bucketElegido} periodo=... />`. `null` → a neutral
"elegí un bucket del gráfico" prompt (or default to the largest-spend bucket — pick the prompt,
KISS, no guessing). Retire `TransaccionesAgrupadas` from this screen.

### 7.2 New pieces (reuse vs new)

- **`domain/agrupar-detalle-por-categoria.ts`** (new, pure): groups a
  `DetalleBucketViewModel.filas`-style list by `categoria.nombre` (null → a "Sin categoría"
  group), computing per-group **subtotal via `BigInt`** (sum of `cargo` strings → `BigInt` →
  format CLP) and **count**. Money stays exact (reuses the web's existing BigInt-safe money
  handling; no float). Output: `{ categoria: {id,nombre} | null, subtotalLabel, count, filas[] }[]`.
- **`components/BucketCategoriasList.tsx`** (new): owns `useDetalleBucket(bucket, periodo)`
  (the read path already exists; S5 adds `categoria` to its rows), renders group `<h3>`
  headers (nombre + subtotal + count) and rows, each row with the reclassify control. Reuses
  the shared `Loading/ErrorState/Empty` states (DRY). Can also replace the flat
  `BucketDetailList` on the standalone `/buckets/:bucket` route for consistency (optional
  consolidation inside S6).
- **`api/use-reclasificar-categoria.ts`** (new): `useMutation` → PATCH; `onSuccess`
  invalidates `['resumen', periodo]`, `['detalle-bucket', bucket, periodo]`,
  `['resumen-anual', anio]`. Disables the control while `isPending`.
- **`api/types.ts`**: DTO mirrors gain `categoria: { id, nombre } | null`.

### 7.3 The reclassify control — scope & a11y

**A native `<select>` per row, offering ALL categorías grouped by bucket via `<optgroup>`.**
Rationale: the core value of manual reclassify is fixing **cross-bucket** misclassifications
("Uber Eats" Deseos→Necesidades) — restricting the dropdown to same-bucket categorías would
defeat the feature. `<optgroup label="Necesidades">…</optgroup>` makes the money-move
consequence visible (the user sees the target categoría sits under a *different* bucket). A
native `<select>` is the most accessible and KISS choice (no custom-dropdown ARIA to get
wrong). This single control **replaces both** disabled placeholders — "Editar categoría"
(reclassify) and "Clasificar" on SinCategoría rows (assign) collapse into one control (DRY).

a11y (ADR-018, WCAG 2.2 AA): visually-hidden `<label htmlFor>` per select
("Cambiar categoría de {descripcion}"); group headings are `<h3>` so the dashboard's page
`<h1>` stays unique; an `aria-live="polite"` status announces the change on success; the
control is disabled (not removed) while the mutation is pending. Reuse the existing
`ETIQUETA_BUCKET` label map.

Rejected alternative: same-bucket-only dropdown (safer-feeling but blocks the primary use
case); custom popover dropdown (unnecessary a11y risk).

---

## 8. Test plan (ADR-015/016 — Vitest; money & isolation emphasis)

Domain (unit, pure):
- `CATEGORIA_BUCKET` is total over the `Categoria` enum; `bucketDeCategoria` returns the
  expected bucket for each of the 8 categorías.
- `PatronClasificacion.get bucket()` derives correctly from `categoria`.
- `CategorizarTransaccionUseCase`: Ingreso → `{null, Ingreso}`; matched pattern →
  `{categoria, categoria.bucket}`; no match → `{null, SinCategoria}`; priority/id tiebreak
  unchanged.

Seed integrity (unit):
- Every seeded `Categoria.bucketId === BUCKET_IDS[CATEGORIA_BUCKET[nombre]]`.
- `CATEGORIA_IDS` covers the enum; `CATEGORIA_CATALOG_SIZE` matches (mirror `PATRON_CATALOG_SIZE`).
- Every `PATRON_CATALOG` entry references a valid `Categoria`.

Reclassify (unit + integration):
- Use case derives bucket from categoría; unknown categoría → `CategoriaInvalidaError`.
- **Integration (money exactness)** — gate `ALLOW_DESTRUCTIVE_DB=1`: seed a Deseos-Delivery
  row, PATCH it to a Necesidades categoría, re-read `/api/resumen`, assert the **exact** BigInt
  deltas — Deseos total ↓, Necesidades total ↑ by the same amount; `porcentajeBp` and
  `estadoSemaforo` recomputed; no float drift.
- **Integration (userId isolation)** — user A cannot reclassify user B's transaction
  (`count===0` → 404); mirror the existing ISO integration pattern in `test/`.

Backfill (integration, gated):
- Idempotency: run twice → identical DB state.
- Dry-run writes nothing but reports the change/money-movement summary.
- Scope: a row with a non-null (manually set) `categoriaId` is left untouched.
- Prod-connection-string rejection fires.

API exposure (unit):
- Movimientos + detalle DTOs include `categoria: {id,nombre}|null`; `null` for
  Ingreso/SinCategoría/unmatched; recognized id folds to the right nombre.

Web (unit, jsdom + Testing Library):
- `agrupar-detalle-por-categoria`: grouping correctness, BigInt subtotal exactness, count,
  null→"Sin categoría" group.
- `use-reclasificar-categoria`: `onSuccess` invalidates the expected query keys (mock
  `QueryClient`).
- `BucketCategoriasList`: renders groups + a `<select>` with categorías grouped by bucket;
  accessible label present; disabled while pending.
- `ResumenScreen`: pie click swaps the panel to the single selected bucket (revert assertion).

---

## 9. Slice / PR-chain breakdown (for `sdd-tasks`)

Chained PRs (`ask-on-risk` → surface at tasks time; `feature-branch-chain` recommended for
rollback control on a money-moving feature). Dependency order:

| Slice | Scope | Depends on | Notes |
|-------|-------|-----------|-------|
| **S1** | Domain (`Categoria` enum + `CATEGORIA_BUCKET`; `PatronClasificacion` VO → categoría + derived bucket) + `add_categoria` migration (nullable) + `categoria-ids.ts` + seed `CATEGORIA_CATALOG` (dual-write `bucketId`+`categoriaId`) | — | **No behavior change.** Tests: domain invariant + seed integrity. |
| **S2** | `CategorizarTransaccionUseCase` → `{categoria,bucket}`; catalog repo `include: categoria`; writer `asignarCategorizacion` (dual-column write); `ProcessIngesta` mapping; `drop_patron_bucketid` migration (categoriaId NOT NULL, drop bucketId) | S1 | Unit + e2e green. |
| **S3** | `backfill-categorias.ts` (gate, dry-run, idempotent, `categoriaId IS NULL` scope) | S2 | Gated integration tests. |
| **S4** | `ReclasificarTransaccionUseCase` + `IReclasificarCategoriaWriter` + Prisma repo + `TransaccionController` (`PATCH /api/transacciones/:id/categoria`) + `TransaccionesModule` | S1 | Integration: money delta + userId isolation. |
| **S5** | Add `categoria` to movimientos + detalle DTOs (repos select+fold) | S1 | DTO/fold tests. |
| **S6** | Web: revert `ResumenScreen` panel; `agrupar-detalle-por-categoria`; `BucketCategoriasList` + reclassify `<select>`; `use-reclasificar-categoria` (invalidation); `types.ts` mirrors; a11y | S4 + S5 | View-model + mutation + UX tests. |

S1→S5 are backend and chain linearly; S6 is the only web slice and lands last. **Alternative
(raise at tasks time):** split into two SDD changes — backend `us-013-categorias` (S1–S5) and
web `us-013-categorias-web` (S6) — if the team prefers smaller review units (residual Q5). S6
depends on the PR #75 decision (already resolved in the proposal: PR #75 closed, panel rebuilt
here).

---

## 10. Risks + mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Reclassify corrupts the resumen (money moves wrong) | High | Resumen is computed-on-read (no stale server cache); atomic dual-column write keeps `bucketId` cache consistent; integration test asserts **exact** BigInt deltas after a cross-bucket move. |
| Cross-tenant write (reclassify another user's row) | High | Structural `account: { userId }` WHERE + `count===1` check + merged 404 (anti-enumeration); userId-isolation integration test. |
| Backfill mutates prod / by accident | High | `ALLOW_DESTRUCTIVE_DB` gate + prod-string rejection + idempotent + dry-run first; NOT run automatically on deploy. |
| Backfill clobbers manual edits | Med | Scope = `categoriaId IS NULL`; non-null (manual) rows skipped. |
| `bucketId` cache drifts from `categoria.bucket` | Med | Bucket is **derived, never independently set** on writes; seed-integrity + reclassify-consistency tests; backfill reconciles legacy rows. |
| Dropping `PatronClasificacion.bucketId` too early | Med | S1 dual-writes both columns; drop happens in S2 **with** the code flip that reads `categoria`. |
| Taxonomy churn after build | Low | Fixed-id seed makes renames cheap; the FINAL taxonomy is locked (Q1/Q2/Q3 resolved in #289). |
| Return-shape change breaks the ingesta pipeline | Med | Extend, don't rewrite; existing US-012 unit + e2e cover the degradation island. |
| Money-move surprises the user | Low | Dry-run previews bucket changes for the backfill; the reclassify `<optgroup>` labels + the pie shift make the live move visible. |

---

## 11. Residual open questions (for tasks/apply)

- **Q1** — DTO exposes categoría as `{ id, nombre }` (recommended, needs a stable write key)
  vs nombre-only (more consistent with the `bucketId`-hidden convention). Design recommends
  `{ id, nombre }`.
- **Q2** — Reclassify `<select>` offers ALL categorías grouped by bucket (recommended) vs
  same-bucket-only. Design recommends all-buckets (`<optgroup>`).
- **Q3** — Upgrade the standalone `/buckets/:bucket` route to the grouped `BucketCategoriasList`
  (DRY) or keep the flat `BucketDetailList`. Design recommends upgrade; optional inside S6.
- **Q4** — Does the backfill run in this change's deploy window (gated, dry-run first) or is
  it deferred to a separate ops step? Design recommends manual + gated, dry-run first.
- **Q5** — One SDD change (S1–S6) or split backend/web into two. Design recommends one; raise
  at tasks time per `ask-on-risk`.
