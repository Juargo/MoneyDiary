# Design: US-037 — Per-user classification catalog (copy-on-signup)

- **Change**: `us-037-catalogo-per-user`
- **Phase**: design (architecture-level HOW)
- **Input**: `openspec/changes/us-037-catalogo-per-user/proposal.md` (Proposed, 2026-08-11)
- **Records into**: ADR-036 (`docs/adr/ADR-036-catalogo-clasificacion-por-usuario.md`)
- **Status**: Designed (2026-08-11)

---

## 0. Scope recap and framing

This change moves `Categoria` + `PatronClasificacion` from a **single global row set** to a
**per-user owned row set**, materialised by copying a code-defined template at user-creation time.
It is an **ownership migration**, not a feature: no CRUD, no new endpoint, no UI, no frontend change.

The architectural shape is deliberately conservative:

- **Zero new layers, zero new ports, zero new use cases.** The change is a rewiring of existing
  persistence adapters plus one new infrastructure module.
- **`domain/` gains exactly one behavioural change** (the classification tie-break, §8 D-08) and
  nothing else. Everything else lands in `infrastructure/persistence` and in three existing port
  signatures.
- **The schema change and the code change are one deployable unit.** Neither half is correct alone.

Layer budget (ADR-005 dependency rule `domain ← application ← infrastructure` holds everywhere):

| Layer | Touched? | What |
|---|---|---|
| `domain/` | Yes, minimally | `CategorizarTransaccionUseCase` tie-break (it lives in `application/`, see §8); the `Categoria` enum and `CATEGORIA_BUCKET` are **untouched** |
| `application/ports/` | Yes, signatures only | `ICatalogoClasificacion.findAll(userId)`, `ITransaccionBucketWriter.asignarCategorizacion(userId, …)`, `ReclasificarCategoriaResult.categoriaId` |
| `application/use-cases/` | Yes, threading only | `ProcessIngestaUseCase` passes `input.userId` into `runCategorizacion` |
| `infrastructure/persistence/` | Yes, the bulk | new `catalogo-template.ts` + `fold-categoria.ts`; 5 repositories rewired; `categoria-ids.ts` demoted |
| `infrastructure/http/dto/` | Yes, one file | `reclasificar-categoria.dto.ts` stops importing `CATEGORIA_IDS` |
| `composition/container.ts` | No | No new dependency to wire (see D-03) |
| `apps/web`, `apps/mobile` | No | Names preserved; verification only |

---

## 1. Architecture decisions (ADR-style)

Each decision states the choice, the reasoning, and the alternatives that were rejected and why.
D-01…D-05 restate and sharpen proposal decisions; D-06…D-10 are new decisions this phase had to make.

### D-01 — Template as code, in a dedicated persistence module

**Decision.** The template lives in a new module
`apps/api/src/infrastructure/persistence/catalogo-template.ts` as module-level constants derived
from the domain `Categoria` enum + `CATEGORIA_BUCKET` + `BUCKET_IDS` + an explicit pattern list.
It is **not** a row set in the database and **not** owned by a sentinel user.

**Why.** CA-01 makes `userId` NOT NULL. Template rows would need either a nullable `userId`
(contradicts CA-01) or a fake "template user" that every user query, auth path, cleanup job and
future admin listing must remember to exclude, with nothing enforcing the exclusion. That is a
permanent tax on unrelated code in exchange for a flexibility (template editing at runtime) that no
current requirement asks for — YAGNI rule 1 and KISS rule 2 (the template already exists as code in
`seed.ts`; promoting it to its own module introduces zero new concepts).

**Rejected.**
- *Template rows owned by a system tenant* — deferred, with an explicit revisit trigger: US-038
  (per-user CRUD) or a real "sync suggested categories" requirement. At that point promoting the
  template to rows becomes a deliberate, isolated migration rather than a speculative one now.
- *Leaving the template inside `prisma/seed.ts`* — `seed.ts` is a script that imports `dotenv`,
  Prisma adapters and the db-safety gate; importing it from runtime persistence code (the demo
  repository) would drag that whole graph into the server bundle. The template must live in `src/`.

**Consequence accepted.** Each user's catalog is a point-in-time snapshot; later template edits do
not propagate to existing users. Acceptable while the catalog is a closed enum.

### D-02 — Copy hook is a plain transactional function, not a port

**Decision.** `copiarCatalogoTemplate(tx, userId)` is an exported function in
`catalogo-template.ts`. No `application/ports/` interface, no use case, no container registration.

**Why.** A port is justified by a layer crossing or by real testability (SOLID skill, "Límites — no
sobre-aplicar"). Neither applies: both call sites (`prisma/seed.ts`, `PrismaDemoRepository`) are
already persistence code, there is no application-layer consumer, and the operation carries no
business rule beyond "materialise the template". An interface with one implementation and zero
alternate consumers is the textbook YAGNI rule 4 violation.

**Rejected.** *`ICatalogoTemplateWriter` port + `CrearCatalogoUsuarioUseCase`* — pure ceremony
today. ADR-036 records the anchor: when a real signup **use case** appears, its repository adapter
calls this same function, and only then does a port become justified.

### D-03 — No composition-root change

**Decision.** `composition/container.ts` and the `crear-*` helpers are untouched.

**Why.** The copy hook is a function called by an already-wired adapter (`PrismaDemoRepository`),
not an injected collaborator. The rewired repositories keep their existing constructor signatures —
`userId` travels as a **method parameter**, never as constructor state, because a repository
instance is a singleton shared across requests and must stay stateless per tenant.

**Rejected.** *Injecting the copy hook into `PrismaDemoRepository` as a collaborator* — an extra
constructor parameter to enable a test double that a plain fake Prisma client already provides.

### D-04 — `PatronClasificacion.userId` is a real column, integrity via composite FK

**Decision.** `PatronClasificacion` gets a direct `userId` column. The invariant
`Patron.userId = Patron.categoria.userId` is enforced by a **composite foreign key**
`(categoriaId, userId) → Categoria(id, userId)`, backed by `Categoria @@unique([id, userId])`.

**Why the denormalised column.** CA-03 requires the categorization query to filter patterns by owner
without a join hop, and it mirrors the `Ingesta.userId` precedent already established in this repo:
*authoritative isolation lives on the row itself*. A join-based filter (`categoria: { userId }`) is
one relation away from being silently dropped in a refactor; a `WHERE "userId" = $1` on the row is
not.

**Why the composite FK over a trigger or app-level check.** DB-enforced, zero runtime cost, no new
concept. See D-06 for the Prisma-emission decision and its fallback.

### D-05 — Backfill without repointing any `Transaccion.categoriaId`

**Decision.** The existing global catalog rows keep their ids (`categoria-supermercado`, …) and
simply gain `userId = <bootstrap user>`. Nothing is renumbered; no `Transaccion` FK moves.

**Why.** Repointing money-adjacent FKs is the highest-risk operation available and buys nothing:
the bootstrap user is the legitimate owner of those rows. The template is defined independently
(D-01), so "the seed user's rows are also the template" is no longer true — that coupling is exactly
what this change breaks.

### D-06 — Composite FK: primary shape, validation gate, and fallback (Open question 2)

**Decision.** Model the composite FK in `schema.prisma` as a Prisma **multi-field relation**, and
deliberately shape it to avoid the one Prisma construct that is genuinely risky:

```prisma
model Categoria {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id])
  // …
  @@unique([userId, nombre])   // id resolution moves here
  @@unique([id, userId])       // FK target — required by Postgres, redundant for lookups
}

model PatronClasificacion {
  categoriaId String
  userId      String
  categoria   Categoria @relation(fields: [categoriaId, userId], references: [id, userId])
  // …
  @@index([userId])
}
```

**`PatronClasificacion` deliberately has NO direct `user User @relation(...)` field**, and therefore
`User` gains `categorias Categoria[]` but **not** `patrones PatronClasificacion[]`.

**Why that shape.** Multi-field relations (`@relation(fields: [a, b], references: [x, y])` against an
`@@unique`) are a core, long-stable Prisma feature and emit a plain composite `FOREIGN KEY` in
Postgres. The construct that carries real risk is a **scalar field participating in two relations at
once** (`userId` used by both a `user` relation and the `categoria` composite relation) — Prisma's
relation validator has historically been strict about that. By not declaring a `user` relation on
`PatronClasificacion`, the risky construct never appears:

- Referential integrity to `User` is still total, transitively:
  `Patron.(categoriaId,userId) → Categoria.(id,userId) → Categoria.userId → User.id`.
- Every query the code needs still works: `userId` is a relation scalar field, so
  `where: { userId }` and `deleteMany({ where: { userId: { in: ids } } })` are generated normally.
  The only thing lost is the `user.patrones` navigation convenience, which no call site uses.

**Validation gate (must run before any code is written against it).** The first implementation step
runs `pnpm api exec prisma validate` and `pnpm api exec prisma migrate dev --create-only`, then
inspects the generated SQL for
`ALTER TABLE "PatronClasificacion" ADD CONSTRAINT … FOREIGN KEY ("categoriaId","userId") REFERENCES "Categoria"("id","userId")`.
This could not be executed during the design phase (no shell in this context), so it is an explicit
gate, not an assumption.

**Fallback if the gate fails.** Plain single-column FK `categoriaId → Categoria(id)` plus the
invariant integration test of §9. Nothing else in this design changes: the `userId` column, all
queries, the copy hook and the cleanup chain are identical either way. `@@unique([id, userId])` is
dropped in that case.

**Rejected.** *Composite FK added by raw SQL while the Prisma schema keeps a plain relation.* Unlike
the `CHECK` constraint precedent (`add_cargo_abono_check`), foreign keys **are** part of Prisma's
model, so the extra constraint is drift: the next `prisma migrate dev` would generate a migration
nobody asked for to drop it. Raw SQL is the right tool for what Prisma cannot model, not for what
Prisma models differently.

### D-07 — Two write strategies for one template: `copiar` (new users) vs `sembrar` (bootstrap user)

**Decision.** The template constants are single-sourced, but there are **two** writers:

| Writer | Callers | Ids | Semantics |
|---|---|---|---|
| `copiarCatalogoTemplate(tx, userId)` | `PrismaDemoRepository.crear`, future signup | generated `cuid()` | `createMany`, not idempotent, one shot per new user |
| `runSeed`'s inline catalog block | `prisma/seed.ts` only | fixed `CATEGORIA_IDS` / `PATRON` ids | `upsert` by fixed id, idempotent, ids never move |

**Why not one function with a flag.** The seed needs upsert-by-fixed-id (idempotency + prod FK
stability, CA-02); a new user needs insert-with-generated-ids. Unifying them means one function with
an `ids?` parameter and two internal write strategies — exactly the "5 parameters and 3 flags"
unification the DRY skill warns is worse than the duplication. The **knowledge** that must not
diverge is the template *content* (which categories, which patterns, which priorities), and that is
single-sourced in `catalogo-template.ts` and consumed by both writers. The write *strategy* is not
shared knowledge.

### D-08 — Classification tie-break moves off the surrogate id (new, required)

**Decision.** `CategorizarTransaccionUseCase` sorts patterns by `(prioridad asc, patron asc, id asc)`
instead of `(prioridad asc, id asc)`.

**Why this is required, not scope creep.** The current tie-break sorts by `PatronClasificacion.id`.
That is only deterministic because today every pattern id is a hand-authored slug (`pat-farmacia`)
shared by all users. Under per-user copies the ids become `cuid()`s, so **two users with identical
catalogs would resolve an equal-priority collision differently, and differently on every re-copy**.
CA-03 requires classification behaviour to be preserved; a surrogate key that silently steers
business behaviour is the defect that per-user ids exposes. `patron` (the pattern text) is stable,
user-independent, business-meaningful, and unique within the template; `id` is retained as a final
tie-break purely to guarantee a total order.

**Behaviour impact.** Nil in practice: an equal-priority collision requires one description matching
two distinct merchant patterns. In the priority-20 group the id order and the text order are
identical anyway (`cuenta ahorro < farmacia < isapre < transantiago`).

**Rejected.** *Deriving copied pattern ids deterministically as `${userId}:${templateKey}`* — it
would preserve the current tie-break exactly and even make the copy idempotent, but it re-encodes
behaviour into a surrogate key (the very problem), and it puts a `userId` inside a primary key. It
was seriously considered and set aside because it preserves the defect instead of fixing it.

### D-09 — `foldCategoriaId` is deleted, not adapted (compiler-enforced migration)

**Decision.** `CATEGORIA_ID_TO_CATEGORIA` and `foldCategoriaId` are **removed** from
`categoria-ids.ts`. A new `fold-categoria.ts` exports `foldCategoria(row)` which folds by `nombre`.
`categoria-ids.ts` keeps only `CATEGORIA_IDS`, re-documented as *seed/bootstrap ids, not a runtime
resolution mechanism*.

**Why deletion instead of a rewrite in place.** CA-04 says "no runtime path resolves ids through
`CATEGORIA_IDS`". Deleting the reverse map makes that mechanically true: the module no longer
exposes any way to go id → enum, so `tsc` — not a reviewer's grep — finds every leftover call site.
This is the cheapest possible enforcement and it is exactly the risk the proposal ranks highest
("silent fold-to-null on read paths": no error, categories just vanish for every non-seed user).

### D-10 — `prisma/backfill-categorias.ts` must be scoped or frozen (new, safety-critical)

**Decision.** The one-off US-013 backfill script currently selects
`transaccion.findMany({ where: { categoriaId: null } })` **globally** and writes
`CATEGORIA_IDS[categoria]`. After this change, running it would stamp the bootstrap user's category
ids onto **other users' transactions** — a cross-tenant data corruption, and the exact inverse of
RNF-SEC-006. It must gain an explicit `account: { userId: USER_ID_FIJO }` filter plus a docblock
marking it frozen and bootstrap-user-only.

**Rejected.** *Delete the script.* Cleaner in the abstract, but removing a script plus its unit and
integration specs is a separate cleanup that this change did not propose. Scoping is the
minimum-risk, in-scope fix; deletion is recorded as a follow-up.

---

## 2. Data model

### 2.1 Target schema

```prisma
model User {
  // …unchanged…
  categorias Categoria[]        // NEW back-relation
  // NO `patrones` back-relation — see D-06
}

model Categoria {
  id            String                @id @default(cuid())   // + @default (was bare @id)
  userId        String                                        // NEW, NOT NULL
  user          User                  @relation(fields: [userId], references: [id])
  nombre        String                                        // global @unique DROPPED
  bucketId      String
  bucket        BucketPresupuesto     @relation(fields: [bucketId], references: [id])
  patrones      PatronClasificacion[]
  transacciones Transaccion[]

  @@unique([userId, nombre])   // id resolution key for every writer
  @@unique([id, userId])       // composite-FK target (D-06); redundant for lookups
  @@index([bucketId])
  // NO @@index([userId]) — @@unique([userId, nombre]) already leads with userId
}

model PatronClasificacion {
  id          String    @id @default(cuid())
  patron      String
  matchType   String
  categoriaId String
  userId      String                                          // NEW, NOT NULL
  categoria   Categoria @relation(fields: [categoriaId, userId], references: [id, userId])
  prioridad   Int

  @@index([userId])            // serves the per-call catalog read (CA-03)
}
```

`BucketPresupuesto` is **unchanged and stays global** — 5 fixed rows. That asymmetry is deliberate
and recorded in ADR-036: buckets *are* the 50/30/20 method, categories are the user's vocabulary.

### 2.2 Integrity boundary that this change does NOT close

`Transaccion.categoriaId` remains a single-column FK to `Categoria(id)`, and `Transaccion` has no
`userId` column (its isolation is via `Account`). So the **database** does not prevent a transaction
from pointing at another user's category row. The **application** does: after this change every
writer resolves the category through `(userId, nombre)` or through the user's own id set, so such a
row cannot be produced. Closing it at the DB level would require adding `userId` to `Transaccion` —
a money-table schema change well outside this scope. Recorded as an accepted residual risk, covered
by the isolation integration test (§9).

### 2.3 Migration — single directory, guarded, raw SQL where Prisma cannot express it

Repo convention precedent: `add_cargo_abono_check`, `backfill_patron_categoria`.

**Step 0 — Guard and fresh-database branch.** This is the step the proposal did not fully specify,
and it is load-bearing:

```sql
DO $$
DECLARE n_reales integer; n_cat integer;
BEGIN
  SELECT count(*) INTO n_reales FROM "User" WHERE "esDemo" = false;
  SELECT count(*) INTO n_cat    FROM "Categoria";

  IF n_reales > 1 THEN
    RAISE EXCEPTION 'us-037: % non-demo users found — the global catalog cannot be assigned unambiguously. Aborting.', n_reales;
  END IF;

  IF n_reales = 0 THEN
    -- Fresh/CI database: migration 20260719005000 self-provisions 8 owner-less
    -- Categoria rows before any user exists. Zero users ⇒ zero accounts ⇒ zero
    -- Transaccion rows, so dropping them is safe; prisma/seed.ts recreates them
    -- owned by USER_ID_FIJO with the same fixed ids immediately afterwards.
    DELETE FROM "PatronClasificacion";
    DELETE FROM "Categoria";
  END IF;
END $$;
```

Without the `n_reales = 0` branch every fresh database (CI integration runs, local ephemeral
Postgres per `apps/api/docs/local-test-db.md`, any restored-from-scratch environment) would either
abort on the guard or fail `SET NOT NULL` on 8 owner-less rows. This is the single most likely way
the migration breaks CI while working perfectly on prod.

**Step 1 — Purge pre-existing demo users** (Open question 1, resolved in §10.1). Delete order
mirrors `DemoCleanupService`: `Session → Transaccion → Ingesta → Account → User`, filtered by
`esDemo = true`. No `Categoria`/`PatronClasificacion` deletes are needed here — demo users own no
catalog rows *yet*.

**Step 2 — Add nullable columns.** `ALTER TABLE … ADD COLUMN "userId" TEXT;` on both tables.

**Step 3 — Backfill.**
```sql
UPDATE "Categoria" SET "userId" = (SELECT "id" FROM "User" WHERE "esDemo" = false LIMIT 1)
  WHERE "userId" IS NULL;
UPDATE "PatronClasificacion" p SET "userId" = c."userId"
  FROM "Categoria" c WHERE c."id" = p."categoriaId" AND p."userId" IS NULL;
```
Patterns inherit from their category, which is what makes the invariant true by construction at
migration time. No `Transaccion.categoriaId` is touched (D-05).

**Step 4 — Tighten.** `SET NOT NULL` on both columns; `DROP INDEX "Categoria_nombre_key"`; create
`Categoria_userId_nombre_key`, `Categoria_id_userId_key`, `PatronClasificacion_userId_idx`; add the
`Categoria.userId → User.id` FK; drop `PatronClasificacion_categoriaId_fkey` and add the composite
`PatronClasificacion_categoriaId_userId_fkey` (or keep the single-column FK under the D-06 fallback).

**Reversibility.** Not reversible by data (constraint tightening + demo purge). Prod runbook: take a
Supabase snapshot immediately before; rollback = restore. Code-only rollback is unsafe (§ proposal
Rollback plan) — treat code + migration as one deployable unit.

---

## 3. `catalogo-template.ts` — shape and transactional contract

**Location.** `apps/api/src/infrastructure/persistence/catalogo-template.ts`.

**Template constants** (id-free — this is the point of the module):

```ts
export const CATEGORIA_TEMPLATE: ReadonlyArray<{
  readonly nombre: Categoria;      // domain enum value == stored `nombre`, verbatim
  readonly bucketId: string;       // BUCKET_IDS[CATEGORIA_BUCKET[nombre]] — derived, never literal
}>;

export const PATRON_TEMPLATE: ReadonlyArray<{
  readonly patron: string;
  readonly matchType: MatchType;
  readonly categoria: Categoria;   // enum, NOT a physical categoriaId — the whole point
  readonly prioridad: number;
}>;

export const CATEGORIA_TEMPLATE_SIZE: number;  // = 8, derived from the array
export const PATRON_TEMPLATE_SIZE: number;     // = 20, derived from the array
```

`CATEGORIA_TEMPLATE` is derived from `Object.values(Categoria)` + `CATEGORIA_BUCKET` + `BUCKET_IDS`
exactly as `seed.ts` does today, so the CAT-01 invariant (a category's bucket comes from the domain
map, never a literal) survives untouched. `PATRON_TEMPLATE` is the current `PATRON_CATALOG` with
`categoriaId: CATEGORIA_IDS[X]` replaced by `categoria: X` and the fixed `id` removed.

*(Note: the array has **20** patterns, not the "~19" the proposal estimated. `PATRON_TEMPLATE_SIZE`
is derived from the array, so the count can never drift from the tests.)*

**The copy hook:**

```ts
/** Minimal structural client — accepts a PrismaClient or a $transaction tx alike. */
export type CatalogoTemplateClient = Pick<PrismaClient, 'categoria' | 'patronClasificacion'>;

export async function copiarCatalogoTemplate(
  tx: CatalogoTemplateClient,
  userId: string,
): Promise<void>;
```

Body: `createMany` the 8 categories (generated cuids) → read back `{ id, nombre }` for that `userId`
→ build the local `nombre → id` map → `createMany` the 20 patterns resolving `categoriaId` through
the map and stamping the same `userId`. Two round-trips of writes plus one read, not 28 statements.

**Contract — four rules the apply phase must not violate:**

1. **The caller owns the transaction boundary.** The function never calls `$transaction` itself.
   Prisma forbids nesting an interactive transaction inside another, and the demo call site *needs*
   the copy enrolled in its existing transaction. Hence the structural `Pick<>` type: it accepts a
   `tx` and a bare client with no casts.
2. **It throws on failure; it does not return `Result`.** The `Result<T,E>` rule governs
   `domain`/`application` (ADR-005). This is a persistence helper whose failure must **roll back the
   enclosing transaction**, and the only mechanism that does that in Prisma is a thrown error.
   Wrapping it in a `Result` would silently convert an all-or-nothing demo creation into a demo user
   with no catalog — the exact class of bug the judgment-day fix closed for sessions.
3. **It is not idempotent.** One call per newly created user. The bootstrap user is served by the
   seed's own upsert path (D-07).
4. **Signature choice: `Pick<PrismaClient, …>` over `Prisma.TransactionClient`.** Narrower (ISP), and
   a hand-written fake in a unit test satisfies it without stubbing the whole client.

**Type-only note.** `CatalogoTemplateClient` is a `type` import of `PrismaClient` — the same
`import type { PrismaClient }` convention every repository in `persistence/` already uses.

---

## 4. Component map and data flow

```
                       catalogo-template.ts  (CATEGORIA_TEMPLATE, PATRON_TEMPLATE,
                                              copiarCatalogoTemplate)
                          │                     │
        ┌─────────────────┘                     └──────────────────┐
        │ (upsert, fixed ids)                                      │ (createMany, cuid)
  prisma/seed.ts                                    PrismaDemoRepository.crear
  bootstrap user                                    inside the existing $transaction
        │                                                          │
        └───────────────── writes Categoria/Patron rows owned by ONE userId ─────┘

WRITE PATHS (enum → physical id) — all now resolve through (userId, nombre):
  ProcessIngestaUseCase.runCategorizacion(ingestaId, userId)
    ├─ ICatalogoClasificacion.findAll(userId)      → PrismaCatalogoClasificacion  WHERE userId
    ├─ CategorizarTransaccionUseCase (pure)        → (prioridad, patron, id) order  [D-08]
    └─ ITransaccionBucketWriter.asignarCategorizacion(userId, ingestaId, …)
                                                   → one findMany WHERE userId → Map<Categoria,id>
  ReclasificarTransaccionUseCase (validation unchanged, no DB round-trip)
    └─ IReclasificarCategoriaWriter.reasignar(userId, txId, categoria, bucket)
                                                   → findUnique userId_nombre → updateMany
                                                   → returns the REAL categoriaId

READ PATHS (physical id → enum) — all now fold by nombre:
  PrismaMovimientosMesRepository   ─┐
  PrismaDetalleBucketRepository    ─┴→ select categoria:{id,nombre} → foldCategoria()  [D-09]

DTO:
  aReclasificarCategoriaDto(data) → { id: data.categoriaId, nombre: data.categoria }
```

### 4.1 Port signature changes (three, all additive in meaning)

| Port | Before | After |
|---|---|---|
| `ICatalogoClasificacion` | `findAll()` | `findAll(userId: string)` — still `Result`, still never throws, empty catalog still `ok([])` |
| `ITransaccionBucketWriter` | `asignarCategorizacion(ingestaId, asignaciones)` | `asignarCategorizacion(userId, ingestaId, asignaciones)` — still `Result`, still never throws |
| `IReclasificarCategoriaWriter` | result `{ id, categoria, bucket }` | result `{ id, categoriaId, categoria, bucket }` |

`userId` is a **parameter**, never constructor state (D-03).

### 4.2 Categorization write path in detail (CA-03)

`ProcessIngestaUseCase.runCategorizacion(ingestaId, userId)` — `userId` is already in scope as
`input.userId`, so this is pure threading. **The degradable island is unchanged**: catalog failure ⇒
only `Ingreso` rows written, everything else stays `null` (never `SinCategoria`), retry-safe.

`PrismaTransaccionBucketRepository.asignarCategorizacion`:

1. Early return `ok({ actualizadas: 0 })` on an empty array — unchanged.
2. Inside the existing `try`: if any assignment has a non-null `categoria`, issue **one**
   `categoria.findMany({ where: { userId }, select: { id: true, nombre: true } })` and build
   `Map<Categoria, string>`. If a needed category is absent, `throw` — the existing `catch` converts
   it to `Result.fail(CategorizacionFallidaError)` and the island degrades and logs. No new error
   path, no new branch in the orchestrator.
3. The grouped `updateMany` per `(categoria, bucket)` and the `id IN (…) AND ingestaId = ?`
   double-lock are unchanged; only the id source changes from `CATEGORIA_IDS[c]` to `map.get(c)`.

`PrismaCatalogoClasificacionRepository.findAll(userId)` adds `where: { userId }` on the direct
column (structural isolation in SQL, not an in-memory filter — RNF-SEC-006), keeping
`include: { categoria: true }` and `orderBy: { prioridad: 'asc' }`.

### 4.3 Reclasificar write path in detail (CA-04)

`ReclasificarTransaccionUseCase` keeps its cheap enum-membership validation — no DB round-trip, no
behaviour change.

`PrismaReclasificarCategoriaRepository.reasignar(userId, transaccionId, categoria, bucket)`:

1. `categoria.findUnique({ where: { userId_nombre: { userId, nombre: categoria } }, select: { id: true } })`.
   This is itself an isolation guarantee: a caller can only ever resolve their own row.
2. Missing row ⇒ **throw** (broken copy-on-creation invariant ⇒ 500 via the error middleware).
   Deliberately *not* mapped to `TransaccionNoEncontradaError`: reporting "transaction not found"
   when the real fault is a corrupted catalog would send a debugging effort in exactly the wrong
   direction. This repository already propagates Prisma throws today, so this introduces no new
   failure mode at the boundary.
3. `updateMany({ where: { id, account: { userId } }, data: { categoriaId: <resolved>, bucketId } })`
   — the structural isolation WHERE and the atomic two-column write are unchanged. `count === 0`
   still merges "not found" and "not owned" into one `TransaccionNoEncontradaError`
   (anti-enumeration).
4. Returns `{ id, categoriaId, categoria, bucket }`.

No transaction wraps steps 1 and 3: the category row is stable, and the worst case of a concurrent
delete is an FK error → 500, which is the correct outcome anyway. KISS over a defensive transaction.

`aReclasificarCategoriaDto` consumes `data.categoriaId` and drops the `CATEGORIA_IDS` import.

---

## 5. `foldCategoriaId` fix (highest-risk surface)

**The failure mode being designed against.** `foldCategoriaId` maps a physical id to the domain enum
through a hard-coded global map. Under per-user `cuid`s, every non-seed user's rows fold to `null`,
so categories silently disappear from the dashboard and the bucket drill-down for **every demo user**
— with no exception, no log, and no failing test unless one is written for a *second* user.

**Fix.**

```ts
// apps/api/src/infrastructure/persistence/fold-categoria.ts
const CATEGORIA_NOMBRES: ReadonlySet<string> = new Set(Object.values(Categoria));

export function foldCategoria(
  categoria: { id: string; nombre: string } | null | undefined,
): { id: string; nombre: Categoria } | null;
```

- `null`/`undefined` → `null` (Ingreso / SinCategoria / no match) — unchanged semantics.
- `nombre` not a `Categoria` enum value → `null` (defensive, mirrors the current behaviour and the
  bucket fold).
- otherwise `{ id: categoria.id, nombre: categoria.nombre as Categoria }` — the **real row id**.

Both read repositories change their Prisma `select` from `categoriaId: true` to
`categoria: { select: { id: true, nombre: true } }`. That is one extra join per read query on an
indexed PK; the alternative (a second query plus an in-memory map) is more code for less clarity.

The enum value equals the stored `nombre` verbatim by construction — `CATEGORIA_TEMPLATE` derives
`nombre` from `Object.values(Categoria)`, the seed upserts those exact strings, and the copy hook
copies them. This is the property that lets the frontend mirror (`apps/web/src/domain/categoria.ts`)
stay untouched.

**Enforcement (D-09):** `foldCategoriaId` and `CATEGORIA_ID_TO_CATEGORIA` are deleted, so `tsc`
enumerates every remaining call site. `CATEGORIA_IDS` survives with a rewritten docblock: *fixed ids
for the bootstrap user's seeded rows and for historical migrations only — never a runtime id
resolution mechanism.*

---

## 6. Demo lifecycle integration

**Creation** — `PrismaDemoRepository.crear`, inside the existing `$transaction`, immediately after
`tx.user.create`:

```
tx.user.create → copiarCatalogoTemplate(tx, user.id) → tx.account.create → tx.ingesta.create
              → tx.transaccion.createMany → tx.session.create
```

Placement right after the user keeps the "everything a user needs to exist" block together and
guarantees the copy is inside the rollback boundary. Demo seed transactions carry `bucketId` only
(`seedDemoTransacciones` never sets `categoriaId`), so the copy has no ordering dependency on them —
it is placed early for readability, not for correctness.

**Latency.** Three extra statements (2 × `createMany` + 1 `findMany`) covering 28 rows inside a
transaction whose default Prisma timeout is 5 s. Negligible; measure during apply per the proposal's
risk table.

**Expiry** — `DemoCleanupService.borrarExpirados()` delete chain becomes:

```
Session → Transaccion → Ingesta → PatronClasificacion (userId) → Categoria (userId) → Account → User
```

- `PatronClasificacion` **must** precede `Categoria` (composite FK, `RESTRICT`).
- `Transaccion` must precede `Categoria` (it already does). Note `Transaccion.categoriaId` is
  `onDelete: SetNull`, so this ordering is about not leaving dangling nulls, not about FK failure.
- Both new deletes use `deleteMany({ where: { userId: { in: ids } } })` — a plain scalar filter,
  which Prisma generates for a relation scalar field even without a `User` back-relation (D-06).

**Failure mode if missed:** the first expiry after ship either FK-violates (aborting the whole
cleanup transaction, so *no* demo user is ever cleaned again) or leaks 28 orphan rows per demo user.
Hence the explicit regression test in §9.

**Demo catalog is read-only (product decision, 2026-08-11).** A demo user receives the full
template copy for classification purposes only and MUST NOT be able to modify categories or
patterns. This change ships no catalog-modification endpoint, so there is nothing to enforce at
runtime here; the constraint binds **US-038**: every catalog mutation endpoint it introduces must
gate on `esDemo` sessions, rejecting the mutation with guidance to register an account (same UX
family as the existing demo-upgrade prompt). ADR-036 records this as a US-038 precondition
alongside the D-06 fallback note (§10.2).

---

## 7. Seed integration (CA-02)

`prisma/seed.ts` keeps its structure and its idempotency guarantee:

- `CATEGORIA_CATALOG` / `PATRON_CATALOG` are rebuilt from `CATEGORIA_TEMPLATE` / `PATRON_TEMPLATE`
  plus the fixed id maps, so the template content is single-sourced (D-01) while the ids stay fixed
  (D-07).
- Both upsert loops gain `userId: USER_ID_FIJO` in `create` (and leave it out of `update` — an
  existing row's owner must never be rewritten by a seed run).
- `CATEGORIA_CATALOG_SIZE` / `PATRON_CATALOG_SIZE` are re-exported from the template module so the
  existing test imports keep working while the source of truth moves.
- `SeedClient` and the `runSeed(prisma)` signature are unchanged, so `seed-catalog.spec.ts`'s fake
  client keeps working.

Ordering inside `runSeed` is already correct: the user upsert precedes the catalog loops.

---

## 8. Where the domain does and does not change

**Unchanged:** the `Categoria` enum (still closed, still 8 values), `CATEGORIA_BUCKET` (still a total
map), `PatronClasificacion` VO (`coincide()`, `bucket` getter), `Bucket`, the Ingreso rule, the
50/30/20 arithmetic, `EstadoSemaforo`. US-038 owns any of that.

**Changed (one line + docblock):** `CategorizarTransaccionUseCase`'s sort comparator (D-08). It lives
in `application/use-cases/`, is a pure function over its arguments, has no infrastructure
dependency, and is fully covered by existing unit tests.

---

## 9. Testing strategy (Strict TDD is active)

The TDD loop applies cleanly to every TypeScript unit below: each one has a red test that fails for
the *right* reason before the implementation exists. The migration is the exception — its "test" is
the rehearsal described in §9.3, written before the SQL is finalised.

### 9.1 Unit (`pnpm api test`, no DB)

| Target | Assertions |
|---|---|
| `catalogo-template.spec.ts` (new) | template covers exactly the 8 enum values; each `bucketId` equals `BUCKET_IDS[CATEGORIA_BUCKET[nombre]]`; every pattern's `categoria` is a valid enum member; pattern texts are unique (D-08 depends on it); sizes derived from the arrays |
| `copiarCatalogoTemplate` (same file or its own) | with a fake `CatalogoTemplateClient`: exactly 2 `createMany` calls; **every** row carries the passed `userId`; pattern `categoriaId`s all resolve to ids returned by the category read; **no `$transaction` is opened**; a rejecting client causes the promise to reject (contract rule 2) |
| `fold-categoria.spec.ts` (new) | `null` → `null`; unknown `nombre` → `null`; known `nombre` with an arbitrary cuid id → `{ id: <that cuid>, nombre }` — the test that would have caught the fold-to-null defect |
| `categorizar-transaccion.use-case.spec.ts` | new tie-break: two equal-`prioridad` patterns with cuid ids resolve by `patron` text, deterministically, in both input orders |
| `prisma-catalogo-clasificacion.repository.spec.ts` | the emitted `findMany` args contain `where: { userId }` |
| `prisma-transaccion-bucket.repository.spec.ts` | category lookup is `where: { userId }`; ids written come from that lookup, not from `CATEGORIA_IDS`; a missing category degrades to `Result.fail(CategorizacionFallidaError)` (never throws) |
| `prisma-reclasificar-categoria.repository.spec.ts` | lookup by `userId_nombre`; the returned `categoriaId` is the persisted row id; a `null` lookup rejects |
| `reclasificar-categoria.dto.spec.ts` | DTO emits `data.categoriaId`; no `CATEGORIA_IDS` import remains |
| `seed-catalog.spec.ts` | catalog rows carry `userId: USER_ID_FIJO`; fixed ids unchanged; idempotency preserved |

### 9.2 Integration (`ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration`, ephemeral local Postgres)

**New shared fixture** — `test/support/catalogo.fixture.ts` exporting
`crearCatalogoParaUsuario(prisma, userId)`, a thin wrapper over `copiarCatalogoTemplate`. This is
**mandatory**, not a convenience: every existing `*.int-spec.ts` creates its users with a direct
`prisma.user.create` (there is no signup path to go through), so without it, every test user has an
empty catalog and every categorization/reclassification assertion breaks. Expect this to be the
single largest source of test churn in the apply phase.

| Spec | Covers |
|---|---|
| `catalogo-isolation.int-spec.ts` (new) | **CA-05**, `auth-isolation.int-spec.ts` style: A and B each own 8 + 20 rows with disjoint ids; A's `findAll(userId)` returns only A's patterns; B reclassifying writes B's own category id; A's descriptions never match B's patterns |
| same file — invariant | **primary (D-06 gate passes):** a raw `INSERT` of a pattern with A's `categoriaId` and B's `userId` is rejected by the composite FK. **fallback:** a full pipeline run for both users leaves zero rows where `p.userId <> c.userId` |
| `seed.int-spec.ts` (extended) | **CA-02** seed run twice ⇒ 8 + 20 rows, ids stable, all owned by `USER_ID_FIJO`, no duplicates |
| demo lifecycle (extended/new) | a new demo user gets exactly 8 + 20 rows created atomically with the user; a forced transaction failure leaves **zero** rows (user, account, catalog, session) |
| demo cleanup (extended/new) | after `borrarExpirados()` on an expired demo user: no FK error and **zero** orphan `Categoria`/`PatronClasificacion` rows |
| `categorizacion.int-spec.ts` (extended) | **CA-03** a non-seed user's ingesta is classified using only their own patterns; catalog-failure degradation still writes only `Ingreso` and leaves the rest `null` |
| `movimientos-mes.int-spec.ts` + `detalle-bucket.int-spec.ts` (extended) | **regression guard** — a *second, non-seed* user sees categories on both endpoints. This is the assertion that fails loudly if the fold regresses |
| `reclasificar-categoria.int-spec.ts` (extended) | **CA-04** response `categoria.id` equals the caller's own persisted row id, and differs between two users reclassifying to the same category name |

### 9.3 Migration rehearsal (not automated in CI)

On the ephemeral local Postgres, seeded to look like prod: one bootstrap user with categorized
transactions **plus** one demo user with its own categorized ingesta. Apply the migration and assert:
bootstrap catalog owned and intact, all `Transaccion.categoriaId` unchanged, demo user and its rows
gone, constraints present. Then a second rehearsal with two non-demo users asserting the guard
raises. Then re-run against a restored prod snapshot before the production deploy.

### 9.4 Cross-workspace verification

`pnpm web test` must stay green with **zero** frontend edits — the proof that names were genuinely
preserved. Plus `pnpm api test`, `pnpm api test:integration`, `pnpm api exec tsc --noEmit`.

---

## 10. Resolved open questions

### 10.1 Pre-existing demo users — **purge them in the migration**

**Decision.** Step 1 of the migration deletes every `esDemo = true` user and its dependent rows,
using the same ordered chain as `DemoCleanupService`.

**Rationale.**
1. **Demo users are ephemeral by contract.** 7-day TTL, an automatic cleanup job already deletes
   them on a schedule and lazily on every new demo creation. Deleting them early is the system's own
   normal behaviour, executed once at a chosen moment instead of an arbitrary one.
2. **The alternative doubles the backfill surface.** Giving each demo user their own copy and
   repointing only that user's `Transaccion.categoriaId` means writing a second, per-user backfill —
   a loop with id remapping over money rows — to preserve data that is disposable by design. That is
   the most complex code in the change serving the least valuable data.
3. **It makes the guard's invariant simple and true.** After the purge the database is provably
   mono-user, which is exactly the precondition the "assign the whole catalog to the one user" step
   needs. Purging *before* the guard's backfill branch removes an entire class of "what about demo
   rows?" edge cases from steps 2–4.
4. **Blast radius is one click.** A demo user mid-session loses their session and gets a 401; the
   web recovers with a new `GET /api/auth/demo`. No real user data exists in a demo tenant by
   definition.

**Mitigation.** Deploy during low traffic; the prod snapshot taken for the rollback plan also covers
this. If a live demo genuinely must survive a future run, the proposal's per-user copy + narrow
repoint remains available as a documented fallback — it is compatible with everything else here.

### 10.2 Composite FK in Prisma 7 — **model it, gate it, fall back cleanly**

**Decision.** Ship the multi-field relation as specified in D-06, in the shape that avoids sharing a
scalar field across two relations (no `user` relation on `PatronClasificacion`, no `User.patrones`
back-relation). Validate by `prisma validate` + `migrate dev --create-only` **before** writing code
against it. If the emitted SQL lacks the composite FK, drop to a plain `categoriaId → Categoria(id)`
FK plus the §9.2 invariant test and remove `@@unique([id, userId])`; nothing else changes.

**Honest limitation.** This phase had no shell, so the emission could not be executed and verified.
The design therefore (a) picks the lowest-risk expressible shape, (b) makes the check an explicit
first step rather than an assumption, and (c) makes the fallback a two-line schema edit with no
ripple. The raw-SQL-only variant was evaluated and rejected as permanent Prisma drift (D-06).

**Tradeoff of the fallback.** Losing the composite FK moves the invariant from "impossible" to
"tested". Given that the only writer of `PatronClasificacion` rows is `copiarCatalogoTemplate` (plus
the seed), which stamps a single `userId` across both `createMany` calls, the practical exposure is
small — but it becomes a real constraint on US-038, which will add user-driven pattern writes. If
the fallback is taken, ADR-036 must record it as a US-038 precondition.

---

## 11. Deliberate deviations from the proposal

Recorded explicitly so they read as decisions, not drift:

| # | Proposal said | Design says | Why |
|---|---|---|---|
| 1 | `User + patrones PatronClasificacion[]` | no `patrones` back-relation on `User` | avoids a scalar shared by two Prisma relations — the only genuinely risky part of the composite FK (D-06). No call site needs the navigation; scalar filters still work |
| 2 | `copiarCatalogoTemplate` returns `Map<Categoria, string>` | returns `Promise<void>` | no caller consumes the map; tests assert against the DB or the fake client's recorded calls. Widening the return type later is a one-line change (YAGNI rule 3) |
| 3 | `asignarCategorizacion` "gains userId" (unspecified) | `userId` is a leading **method parameter**; the id map is resolved in one query per call | repositories are singletons — per-tenant state must never live in a constructor (D-03) |
| 4 | `foldCategoriaId` folds by `nombre` | `foldCategoriaId` is **deleted**; new `foldCategoria(row)` in `fold-categoria.ts` | deletion makes `tsc` enumerate every call site — mechanical enforcement of CA-04 instead of grep discipline (D-09) |
| 5 | "~19 template patterns" | 20 | counted from `PATRON_CATALOG`; sizes are derived from the arrays so tests cannot drift |
| 6 | migration guard = "abort if >1 non-demo user" | plus an explicit `n_reales = 0` branch that clears the owner-less rows self-provisioned by `20260719005000` | without it every fresh/CI database aborts or fails `SET NOT NULL` (§2.3) |
| 7 | (not mentioned) | tie-break `(prioridad, patron, id)` (D-08) | required to keep CA-03's classification behaviour deterministic once pattern ids become per-user cuids |
| 8 | (not mentioned) | `prisma/backfill-categorias.ts` scoped to `USER_ID_FIJO` (D-10) | it currently writes globally with bootstrap ids — post-change that is cross-tenant corruption |

Items 7 and 8 are additions in service of existing acceptance criteria (CA-03 and RNF-SEC-006
respectively), not new scope. They must be reflected in the spec/tasks.

---

## 12. Delivery constraints (for the tasks phase, not a task list)

- **Atomic deployable unit.** Migration and code ship together. A code-only rollback with the schema
  applied mis-resolves every non-seed user; a schema-only deploy blanks categories everywhere.
- **Hard ordering.** The D-06 validation gate runs first — the schema shape it confirms or rejects
  is an input to the copy hook, the repositories and the tests.
- **Natural seams**, in dependency order: (1) schema + migration + FK gate, (2) template module +
  copy hook, (3) seed + demo creation + cleanup chain, (4) write paths (catalog port, bucket writer,
  reclasificar writer, DTO), (5) read paths + fold deletion, (6) isolation and regression tests,
  (7) ADR-036 + index + `CLAUDE.md` row. Seams 4 and 5 cannot land without 1.
- **Size.** Roughly 20 source/test files across schema, persistence, application ports and docs.
  Expect the changed-line budget to be a live question at tasks time.
- **The riskiest reviewable moment** is seam 5: it has no compile-time consumer outside the two read
  repositories and, if botched, fails silently rather than loudly. Its regression test (a *second*
  user seeing categories) is the gate.
