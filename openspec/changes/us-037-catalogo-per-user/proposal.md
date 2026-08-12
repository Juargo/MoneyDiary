# Proposal: US-037 — Per-user classification catalog (copy-on-signup)

- **Change**: `us-037-catalogo-per-user`
- **Issue**: [#271](https://github.com/Juargo/MoneyDiary/issues/271) · Milestone `Sprint-12`
- **Status**: Proposed (2026-08-11)
- **Requires new ADR**: ADR-036 (next free number after ADR-035)

## Intent

Turn the classification catalog (`Categoria` + `PatronClasificacion`) from a **single global row
set shared by every user** into a **per-user owned row set**, created by copying a template at
account creation time (option A, decided 2026-08-11).

After this change, every `Categoria` and `PatronClasificacion` row belongs to exactly one user,
every read and write of the catalog is scoped by `userId` in the SQL `WHERE` clause, and a new
user (including every demo user) starts with their own private copy of the 8 Chilean template
categories and their ~19 template patterns.

This change is **ownership only**. It is the data-model foundation that makes per-user catalog
editing possible; it does not build the editing itself.

## Why now

1. **The MVP assumption is now false.** The catalog was seeded once for a mono-user MVP. Demo mode
   (multi-user by construction) and Google login shipped since then, so several real users already
   share one physical catalog. Any future edit by one user would mutate everyone's classification.
2. **RNF-SEC-006 has a hole.** Every other user-owned entity (`Ingesta` direct `userId`,
   `Transaccion` via `Account`) is isolated structurally. The catalog is the only user-facing data
   that is not — it is currently readable and (in a future CRUD) writable across tenants by design.
3. **It blocks US-038 (catalog CRUD).** Editing categories/patterns cannot be built on a shared
   global table without either breaking every other user or inventing per-user overrides. Doing the
   ownership migration first keeps US-038 a pure feature change.
4. **The cost only grows.** Every demo user created before this ships adds transactions pointing at
   the shared catalog rows, making the eventual backfill more expensive.

## Scope

### In scope

- **Schema**: mandatory `userId` on `Categoria` and `PatronClasificacion`; `Categoria.nombre`
  global `@unique` replaced by `@@unique([userId, nombre])`; back-relations on `User`; indexes.
- **Template**: an explicit, single-sourced template definition (categories + patterns) that is not
  itself a user-owned row set.
- **Copy hook**: template → per-user rows, executed atomically at the two existing user-creation
  points (`prisma/seed.ts` bootstrap user, `PrismaDemoRepository.crear` demo transaction).
- **Backfill migration**: existing global catalog rows become owned by the existing mono-user
  without repointing any `Transaccion.categoriaId` FK; the template is defined separately.
- **Categorization by owner (CA-03)**: `ICatalogoClasificacion.findAll` gains `userId`;
  `ProcessIngestaUseCase.runCategorizacion` threads the ingesta owner's `userId`; the degradable-
  island behaviour is preserved byte-for-byte.
- **Cascada / reclasificar (CA-04)**: the reclasificar writer and its response DTO resolve the real
  per-user `Categoria` row instead of the static global id map.
- **All existing read paths kept correct** under per-user physical ids (movimientos, detalle-bucket,
  transaction-bucket writer) — see Approach §6. This is not optional: leaving them on the global id
  map silently blanks categories for every user that is not the seed user.
- **Demo cleanup**: `DemoCleanupService.borrarExpirados()` delete chain extended (Patron before
  Categoria) so expiring a demo user neither FK-violates nor leaks orphan catalog rows.
- **Isolation test (CA-05)**: integration test following the `auth-isolation.int-spec.ts` pattern —
  user B never reads, matches against, or writes user A's catalog rows.
- **ADR-036** in `docs/adr/` + index row in `docs/adr/README.md` + row in the `CLAUDE.md` ADR table.

### Non-goals (out of scope)

- **Catalog CRUD** — create / rename / delete categories or patterns, and any endpoint or UI for it.
  That is **US-038**. The closed `Categoria` TypeScript enum survives US-037 untouched (decision 1).
- **Dismantling the `Categoria` enum / `CATEGORIA_BUCKET` total map.** Copies keep the exact 8
  template `nombre` values, so the enum, its validation, and the frontend mirror stay valid.
- **"Import suggested categories" / template-merge into an existing user** — deferred, YAGNI.
- **A new signup flow.** The hook lands in the two creation points that exist today. Google login is
  find-only (ADR-034) and creates no users.
- **Any frontend change.** `apps/web/src/domain/categoria.ts` and its mirror test remain valid
  because names are preserved. No new "list my categories" endpoint.
- **Per-user `BucketPresupuesto`.** Buckets stay a global fixed taxonomy of 5. The asymmetry is
  deliberate: buckets are the 50/30/20 method itself, categories are the user's vocabulary.
- **Template versioning / propagating template edits to existing users.**

## Approach

### 1. Template representation — template as CODE, not as rows (recommended)

The template stays a **module-level TypeScript constant set**, promoted out of `prisma/seed.ts`
into a dedicated shared module (e.g. `apps/api/src/infrastructure/persistence/catalogo-template.ts`)
consumed by both the seed and the copy hook. It is derived, as today, from the domain
`Categoria` enum + `CATEGORIA_BUCKET` + the existing pattern list — so there is still exactly one
source of truth for "what a new user starts with".

Why this over template rows in the database:

- CA-01 makes `userId` **NOT NULL**. Template rows in the same table would therefore need either a
  nullable `userId` (contradicts CA-01) or a **sentinel template `User`** — a fake user row that
  every user query, every auth path, every cleanup job and every future admin listing would have to
  remember to exclude, with nothing enforcing it. That is a permanent tax paid by unrelated code.
- The template **already exists as code** (`CATEGORIA_CATALOG` / `PATRON_CATALOG` in `seed.ts`).
  Keeping it there introduces zero new concepts — KISS rule 2 (boring technology, reuse the
  established repo pattern) and no new ADR-level pattern to justify.
- Decision 2 requires a template **independent** of the existing global rows. Code constants are
  independent for free; template rows would mean materialising a shadow 8+19-row set in the DB whose
  only consumer is the copy hook.

Tradeoff accepted: the template can only change via deploy + migration, and each user's copy is a
point-in-time snapshot — later template changes do **not** propagate to existing users. Both are
acceptable while the catalog is a closed enum. **Trigger to revisit**: US-038 (per-user CRUD) or a
real "sync suggested categories" requirement, at which point promoting the template to rows owned by
a system tenant becomes a deliberate, isolated migration.

### 2. Schema change

```
Categoria
  + userId String                      (NOT NULL)
  + user   User @relation(...)
  - nombre String @unique              (drop global unique)
  + @@unique([userId, nombre])         (id resolution moves to (userId, nombre))
  + @@index([userId])
    id String @id @default(cuid())     (generated for copies; existing fixed ids preserved)

PatronClasificacion
  + userId String                      (NOT NULL — direct column, not only via categoria)
  + user   User @relation(...)
  + @@index([userId])

User
  + categorias Categoria[]
  + patrones   PatronClasificacion[]
```

`PatronClasificacion.userId` is a **direct column**, mirroring the `Ingesta` precedent
("authoritative isolation lives on the row itself"), and required by CA-03 so the categorization
query filters patterns without a join hop.

That denormalisation creates one invariant to defend: `Patron.userId` must equal
`Patron.categoria.userId`. Preferred enforcement is a **composite foreign key**
(`Categoria @@unique([id, userId])` + `Patron @relation(fields: [categoriaId, userId], references:
[id, userId])`) — DB-enforced, zero runtime cost, no trigger. The design phase validates that
Prisma 7 emits this cleanly; fallback is a plain FK plus an integration test asserting the invariant.

### 3. Copy hook — one infrastructure function, two call sites

A single transactional helper, e.g.
`copiarCatalogoTemplate(tx: Prisma.TransactionClient, userId: string): Promise<Map<Categoria, string>>`,
living in `infrastructure/persistence/`:

1. `createMany` the 8 `Categoria` rows for `userId` from the template.
2. Build the local `nombre → newId` map (this is the answer to the template→copy FK problem: the
   copy never reuses the template's fixed ids).
3. `createMany` the pattern rows, resolving `categoriaId` through that map.

Call sites:

- `prisma/seed.ts` — idempotent upsert path for the bootstrap mono-user, preserving the existing
  fixed ids (`categoria-supermercado`, …) so prod row ids never move.
- `PrismaDemoRepository.crear` — **inside the existing `$transaction`**, so demo creation stays
  all-or-nothing (the documented judgment-day fix that prevents orphaned demo users still holds).

Deliberately **not** a new application port or use case: there is no application-layer consumer, the
operation carries no business rule beyond "copy the template", and both callers are already
persistence code. Adding a port here would be an abstraction with one implementation and zero
alternate consumers (YAGNI rule 4; SOLID skill: a port is justified by a layer crossing or real
testability, neither of which applies). When a real signup use case appears, its repository adapter
calls the same function — ADR-036 records that anchor.

### 4. Backfill migration (decision 2 — no repointing)

Single migration directory, raw SQL where Prisma cannot express it (existing repo convention,
cf. `add_cargo_abono_check`):

1. **Guard**: `DO $$ ... RAISE EXCEPTION` if the database contains more than one non-demo `User`.
   A silent mis-assignment of the whole catalog is far worse than a failed migration.
2. Add `userId` **nullable** to both tables.
3. `UPDATE` both tables setting `userId` to the existing bootstrap user's id. All
   `Transaccion.categoriaId` and `PatronClasificacion.categoriaId` FKs stay intact — nothing is
   repointed, nothing is renumbered.
4. Handle pre-existing demo users (see Open question 1 — proposed: purge them in the same migration;
   they are ephemeral by contract with a 7-day TTL and an existing cleanup job).
5. `SET NOT NULL`, drop `Categoria.nombre` unique, add `@@unique([userId, nombre])`, add indexes and
   (if validated) the composite FK.

Runs against the ephemeral local Postgres per `apps/api/docs/local-test-db.md`; the db-safety gate
keeps it away from Supabase during development.

### 5. Categorization by ingesta owner (CA-03)

- `ICatalogoClasificacion.findAll(userId: string)` — the port keeps returning
  `Result<PatronClasificacion[], …>` and still never throws.
- `PrismaCatalogoClasificacionRepository` adds `where: { userId }` (structural isolation, not an
  in-memory filter).
- `ProcessIngestaUseCase.runCategorizacion(ingestaId, userId)` receives `input.userId`, already
  available in `runPipeline`. The degradable island is untouched: catalog failure ⇒ only `Ingreso`
  rows written, the rest stay `null` (never `SinCategoria`), retry-safe.
- `ITransaccionBucketWriter` (the write half of categorization) gains `userId` and resolves
  `Categoria` enum → physical id by a single `(userId, nombre)` query per call, replacing the static
  `CATEGORIA_IDS` lookup.

### 6. Cascada and read paths under per-user ids

- **Reclasificar (CA-04)**: `ReclasificarTransaccionUseCase` keeps its cheap enum-membership
  validation (no DB round-trip, no behaviour change). The writer
  `PrismaReclasificarCategoriaRepository.reasignar` stops using `CATEGORIA_IDS[categoria]` and
  resolves/connects the row via the `userId_nombre` composite unique, then **returns the persisted
  row id**; `aReclasificarCategoriaDto` consumes that real id instead of the global map.
- **Read paths**: `foldCategoriaId` folds a raw `categoriaId` back to the domain enum through the
  global id map. With per-user `cuid` ids, every non-seed user's rows fold to `null` — categories
  would silently vanish from the dashboard for **every demo user**, with no error anywhere. Fix:
  read repositories (`prisma-movimientos-mes`, `prisma-detalle-bucket`) select
  `categoria: { id, nombre }` and fold **by `nombre`** (the enum value equals the stored `nombre`
  verbatim, verified), returning the real row id. This is the single highest-risk surface of the
  change and is explicitly in scope.
- Net effect: `CATEGORIA_IDS` survives **only** as the template/seed-user id constant. No runtime
  resolution path may depend on it after this change.

### 7. Demo cleanup

`DemoCleanupService.borrarExpirados()` ordered chain becomes:
`Session → Transaccion → Ingesta → PatronClasificacion (by userId) → Categoria (by userId) →
Account → User`. `Transaccion` must precede `Categoria` (it already does) and `Patron` must precede
`Categoria` (required FK). Every fresh demo user gets a full template copy (decision 4).

### 8. ADR-036

`docs/adr/ADR-036-catalogo-clasificacion-por-usuario.md` — records: copy-on-creation over shared
global catalog; template-as-code over template rows (with the revisit trigger); direct `userId` on
`PatronClasificacion`; buckets stay global; the closed enum survives and CRUD is deferred to US-038;
the no-repointing backfill. Plus the `docs/adr/README.md` index row and the `CLAUDE.md` ADR table row.

## Affected areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/prisma/schema.prisma` | Modified | `userId` on Categoria/Patron, composite unique/index, User back-relations |
| `apps/api/prisma/migrations/<new>/migration.sql` | New | Guarded backfill + constraint tightening |
| `apps/api/prisma/seed.ts` | Modified | Template extracted; seeds the bootstrap user via the copy hook, idempotent, ids preserved |
| `apps/api/src/infrastructure/persistence/catalogo-template.ts` | New | Template constants + `copiarCatalogoTemplate` |
| `apps/api/src/infrastructure/persistence/categoria-ids.ts` | Modified | Demoted to template/seed ids; `foldCategoriaId` folds by `nombre` |
| `apps/api/src/application/ports/catalogo-clasificacion.port.ts` | Modified | `findAll(userId)` |
| `apps/api/src/infrastructure/persistence/prisma-catalogo-clasificacion.repository.ts` | Modified | `where: { userId }` |
| `apps/api/src/application/use-cases/process-ingesta.use-case.ts` | Modified | Thread `input.userId` into `runCategorizacion` |
| `apps/api/src/application/ports/transaccion-bucket-writer.port.ts` + repo | Modified | `userId`-scoped categoria id resolution |
| `apps/api/src/infrastructure/persistence/prisma-reclasificar-categoria.repository.ts` | Modified | Resolve by `(userId, nombre)`, return real id |
| `apps/api/src/infrastructure/http/dto/reclasificar-categoria.dto.ts` | Modified | Use the persisted id, drop `CATEGORIA_IDS` |
| `apps/api/src/infrastructure/persistence/prisma-movimientos-mes.repository.ts` | Modified | Fold categoria by `nombre` |
| `apps/api/src/infrastructure/persistence/prisma-detalle-bucket.repository.ts` | Modified | Fold categoria by `nombre` |
| `apps/api/src/infrastructure/persistence/prisma-demo.repository.ts` | Modified | Copy hook inside the demo `$transaction` |
| `apps/api/src/infrastructure/http/auth/demo-cleanup.service.ts` | Modified | Extended ordered delete chain |
| `apps/api/test/*.int-spec.ts` | New/Modified | Catalog isolation test + seed/categorizacion/reclasificar/demo-cleanup updates |
| `docs/adr/ADR-036-*.md`, `docs/adr/README.md`, `CLAUDE.md` | New/Modified | ADR + index + table row |
| `apps/web/**` | **Unchanged** | Names preserved; mirror test must still pass (verification only) |

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Silent fold-to-null on read paths** — `foldCategoriaId` maps physical id → enum globally; per-user `cuid`s fold to `null`, blanking categories on every non-seed user's dashboard with no error | High if missed | Critical | Fold by `nombre` (§6); integration test that a **second** user sees categories in `/api/resumen` and detalle-bucket |
| **`CATEGORIA_IDS` breakage surface is wide** (write path, reclasificar writer, reclasificar DTO, two read folds, seed, backfill script, plus specs) | High | High | Tasks phase carries a grep-derived call-site checklist; rule: no runtime path may resolve ids through the constant after this change; one test per converted path |
| `Patron.userId` drifting from `categoria.userId` | Low | High (cross-tenant classification) | Composite FK enforced by the DB; fallback plain FK + invariant integration test |
| Pre-existing demo users' transactions reference the mono-user's catalog rows after backfill | Medium | Medium | Purge demo users in the migration (ephemeral by contract) — Open question 1 |
| Migration mis-assigns the catalog if prod has >1 real user | Low | Critical | `RAISE EXCEPTION` pre-flight guard in the migration; abort rather than guess |
| Demo cleanup starts FK-violating or leaking orphans on the first expiry after ship | High if missed | Medium | Extended ordered chain + integration test asserting zero orphan catalog rows after `borrarExpirados()` |
| Seed no longer idempotent / row ids move for the mono-user | Medium | High (prod FKs) | Extend `seed.int-spec.ts` to run the seed twice and assert stable ids and no duplicates |
| Frontend mirror test breaks | Low | Low | Names preserved by construction; run `pnpm web test` as an explicit acceptance step |
| Scope creep into CRUD/rename (US-038) | Medium | Medium | Explicit non-goal; enum stays closed; no new endpoints in this change |
| Copy adds ~27 inserts inside the demo `$transaction` (latency / lock window) | Medium | Low | Two `createMany` statements, not 27 round-trips; measure during apply |
| Migration cannot be exercised against prod-like data | Medium | Medium | Ephemeral local Postgres per `local-test-db.md`; db-safety gate; rehearse the backfill on a restored snapshot before the prod run |

## Success criteria

| AC | Criterion |
|----|-----------|
| CA-01 | `Categoria` and `PatronClasificacion` both carry a NOT NULL `userId`; `Categoria` is unique per `(userId, nombre)`; the old global `nombre` unique is gone; existing prod rows are owned by the bootstrap user with no `Transaccion` FK repointed |
| CA-02 | A newly created user — including every demo user — has exactly 8 own `Categoria` rows and the full template pattern set, created atomically with the user; re-running the seed is idempotent and does not move ids |
| CA-03 | `ProcessIngestaUseCase` classifies an ingesta using only the patterns owned by the ingesta's user; the degradable-island behaviour on catalog failure is unchanged (only `Ingreso` written, rest `null`) |
| CA-04 | Reclasificar resolves and persists the caller's own `Categoria` row and returns its real id in the response DTO; no runtime path resolves ids through `CATEGORIA_IDS` |
| CA-05 | Every catalog query filters by `userId` in SQL; an integration test in the `auth-isolation.int-spec.ts` style proves user B cannot read, match against, or write user A's catalog (RNF-SEC-006) |
| CA-06 | `docs/adr/ADR-036-*.md` exists with status `Aceptado`, is listed in `docs/adr/README.md`, and has a row in the `CLAUDE.md` ADR table |
| — | Regression guard: expiring a demo user leaves zero orphan `Categoria`/`PatronClasificacion` rows and raises no FK error |
| — | Regression guard: a second (non-seed) user sees categories on the dashboard and detalle-bucket views |
| — | `pnpm api test`, `pnpm api test:integration` (local ephemeral DB), `pnpm web test`, `pnpm api exec tsc --noEmit` all green |

## Rollback plan

1. The migration is not reversible by data (constraint tightening + optional demo purge) — take a
   Supabase snapshot immediately before the prod run; rollback = restore.
2. Code-only rollback (schema already applied) is unsafe: reverting to `CATEGORIA_IDS` resolution
   would mis-resolve every non-seed user. Treat code+migration as one deployable unit.
3. If the composite FK proves unworkable in Prisma 7, drop it and ship the invariant as an
   integration test — no other part of the plan changes.

## Open questions (non-blocking — resolve in design)

1. **Pre-existing demo users at migration time.** Proposed: purge them in the migration (ephemeral,
   7-day TTL, an automatic cleanup job already deletes them). Fallback if a live demo must survive:
   give each existing demo user their own copy and repoint only that user's `Transaccion.categoriaId`
   — narrower than a global repoint and still compatible with decision 2's intent.
2. **Composite FK `(categoriaId, userId) → Categoria(id, userId)` in Prisma 7.** Validate during
   design; fallback is a plain FK plus an invariant integration test.

Neither blocks the spec or design phase.
