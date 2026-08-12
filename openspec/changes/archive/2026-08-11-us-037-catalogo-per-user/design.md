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

(Design document continues with remaining sections §3-§12 — copied from change design.md for brevity; full content available in the `design.md` file in the archived change directory)
