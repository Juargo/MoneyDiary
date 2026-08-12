# Proposal: US-039 — Delete a category that is in use, after a warning

- **Change**: `us-039-eliminar-categoria-en-uso`
- **Issue**: [#273](https://github.com/Juargo/MoneyDiary/issues/273) · Milestone `Sprint-12`
- **Status**: Proposed (2026-08-12)
- **Builds on**: US-037 / ADR-036 (per-user catalog) and US-038 / ADR-037 (catalog CRUD) — both
  merged, deployed and archived
- **Requires new ADR**: **No.** This change executes what US-038 explicitly deferred to it
  (`EliminarCategoriaUseCase`'s docblock names US-039 by name; the spec's Non-Goals list says
  "US-038 defines and rejects the case only"). No ADR is reversed. ADR-036's demo read-only
  precondition and ADR-037's "identity is a row" decision both hold unchanged.
- **⚠️ Action item on issue #273**: **CA-04 is being deliberately rewritten** (see
  [Success criteria](#success-criteria) and [Approach §2](#2-the-money-does-not-move-ca-04-rewritten)).
  The original wording was authored before the production evidence below and would be satisfied
  vacuously. Update the issue text so the acceptance criterion matches what the change actually
  guarantees.

## Intent

Today a user who wants to remove a category they no longer use hits a dead end: if a single
transaction — from any period, ever — points at it, the API refuses with `409 CATEGORIA_EN_USO`
and offers no way forward. The category is permanently undeletable in practice, because the one
thing that makes a category worth deleting (having been used and then abandoned) is exactly what
blocks the delete.

After this change:

- The catalog listing tells the user **how many of their transactions** each category holds, so
  the client can warn before the destructive action (**CA-01**).
- `DELETE /api/categorias/:id` **succeeds** on an in-use category. Its transactions survive
  untouched except for losing the category label (**CA-02**); its patterns are deleted with it,
  atomically (**CA-03**).
- **No money moves.** The month summary, the 50/30/20 subtotals and the semáforo are byte-identical
  before and after (**CA-04**, rewritten).
- Only the caller's own data is ever affected, enforced in the SQL `WHERE` (**CA-05**).

## Why now

1. **US-038 shipped a promise, not a feature.** The `409` was designed as a placeholder that names
   its own successor. Until US-039 lands, "delete a category" works only for categories nobody ever
   used — which is close to none.
2. **US-043 (the catalog web UI) needs the final contract.** Building a delete button against a
   `409` that is about to disappear means building it twice. The impact count this change adds to
   `GET /api/categorias` is the data US-043's confirm dialog renders.
3. **The refusal machinery is load-bearing complexity with a short remaining life.** The
   `RollbackCategoriaEnUso` sentinel exists purely to make a 0-row `deleteMany` roll back an
   interactive `$transaction`. It is subtle, well-commented, and about to become dead weight —
   better removed while the reasoning that produced it is still fresh.

## Scope

### In scope

**A. Impact count in the existing listing** (binding decision 1) — `GET /api/categorias` gains
`transaccionesCount` per category, scoped to the caller. No dedicated impact endpoint, no
two-phase confirm. Follows the `eliminar-ingesta` precedent (Approach §1).

**B. Delete succeeds on an in-use category** — the `transacciones: { none: {} }` predicate is
removed from the delete statement; `CategoriaEnUsoError` and the `409` on `DELETE` are retired
(Approach §3, §4).

**C. Transactions keep their `bucketId`; only `categoriaId` becomes null** (binding decision 2),
performed by the existing `onDelete: SetNull` FK, not by extra application code (Approach §2, §5).

**D. Repository simplification** — the interactive `$transaction` + sentinel is replaced by the
array-form `$transaction` used by `PrismaEliminarIngestaRepository`, with an explicit argument
(schema-backed) that the rollback hazard the sentinel guarded cannot reappear (Approach §3).

**E. Contract regeneration** — `openapi.json` + `@moneydiary/api-client` types, both already CI
drift-gated (ADR-011/012).

**F. Tests** — the five existing specs that assert the `409` invert their meaning, plus new
coverage for CA-02/CA-04/CA-05, including an integration test proving `/api/resumen` is **identical**
before and after deleting an in-use category (Approach §7).

### Non-goals (out of scope)

| Not doing | Why / owner |
|-----------|-------------|
| Bulk reassignment of the deleted category's transactions to **another** category | Explicit non-goal of US-039. It is a different product feature (a migration wizard), not a safety net for delete |
| Any web or mobile UI — the confirm dialog, the count display, the delete button | **US-043**. No `apps/web` file changes here (verified: no catalog CRUD UI exists today; the only category UI is the reclassify `<select>`) |
| Nulling `bucketId` along with `categoriaId` | Rejected with production evidence — see Approach §2 |
| A dedicated `GET /api/categorias/:id/impacto` endpoint | Rejected — binding decision 1, Approach §1 |
| A server-side `?confirm=true` / two-phase delete | Rejected — Approach §4 |
| Restoring a deleted category or undoing the un-labelling | Out of scope; the warning is the safeguard. See [Rollback plan](#rollback-plan) |
| A composite `(categoriaId, userId)` FK on `Transaccion` (the structural guarantee patterns already have) | Deferred — migration + no observed defect. Trigger recorded in [Risks](#risks-and-mitigations) |
| Demo-gate changes | None needed — already correct (Approach §6) |
| Any Prisma migration | Not required — the schema already supports this exactly as-is (Approach §5) |

## Approach

### 1. The impact count travels in the listing the client already fetched

`GET /api/categorias` — the endpoint US-043's screen must call anyway to render the list — returns
`transaccionesCount` per category. This is the **`eliminar-ingesta` precedent, verbatim**:
`GET /api/ingestas` returns `totalTransacciones` per row, and `EliminarIngestaControl.tsx` reads
the number straight from the already-fetched list to build its warning. No extra round trip, no
second endpoint to keep isolated, no new route to demo-gate.

**Where the number is produced.** A Prisma filtered relation count inside the existing query, so
the count is computed in SQL and scoped in SQL (**CA-05**, RNF-SEC-006):

```ts
_count: { select: { transacciones: { where: { account: { userId } } } } }
```

`account: { userId }` is the **same scope shape** `actualizar()`'s bucket re-stamp already uses
(`prisma-categoria.repository.ts:173`) — not a new isolation idiom.

**Cost.** One correlated subquery per returned row, in the same round trip, over ~8–40 rows per
user. The alternative (N+1 counts) is worse; the alternative of *not* counting means CA-01 cannot
exist. Measured optimisation is not warranted at this cardinality (YAGNI).

**Shape.** One DTO, not two. `CategoriaDto` is documented as "ÚNICA forma HTTP de una categoría",
reused by the `GET` list, the `POST` `201` and the `PATCH` `200`. `transaccionesCount` is added to
that single shape and therefore to `CategoriaConPatrones`, `categoriaResponseSchema` and the three
responses. On `POST` it is always `0` (a category one millisecond old has no transactions), which is
correct rather than special-cased. Forking the DTO into "list has the count, writes do not" would
buy nothing and would complicate the `categorias.schema.spec.ts` sync guarantee.

### 2. The money does not move (CA-04, rewritten)

**Binding decision 2**: the deleted category's transactions keep their `bucketId`. Only
`categoriaId` becomes null.

**Evidence, from production data:**

- **434 of 508 transaction rows (85%) are already `categoriaId IS NULL AND bucketId IS NOT NULL`**,
  and they already count toward the user's 50/30/20. The state US-039 produces is not exotic — it
  is the *majority* state of the live dataset.
- `bucketId` is the **documented** source of truth for the budget math. `schema.prisma:194-197`
  says so in as many words: *"onDelete SetNull: borrar una categoría NUNCA debe cascade-borrar
  transacciones (dato de dinero). bucketId sigue siendo la fuente de verdad del 50/30/20."*
- The read path agrees: `prisma-resumen-mes.repository.ts:31` groups by `['bucketId']`; the
  movimientos and detalle-bucket repositories fold on `bucketId` only and pass the category through
  as a display label; `estado-semaforo.ts` consumes bucket percentages exclusively. **No money math
  anywhere reads `categoriaId`.**

**Option (b) — nulling the bucket too — was explicitly rejected.** It would create two states that
look identical in the UI ("Sin categoría") but behave differently in the budget: one still counted
inside Necesidades/Deseos/Ahorro, the other moved to the neutral SinCategoria group with no semáforo
rule. A user could not tell them apart, and 85% of existing rows would be in the first state while
newly-deleted ones landed in the second. Deleting a *label* would silently rewrite the user's
budget history.

**Therefore CA-04 is rewritten**, from *"the month summary (subtotals and semáforo) reflects the
change"* to:

> **Deleting a category does not move money between buckets.** `/api/resumen`, the bucket subtotals
> and the semáforo are identical before and after the delete. Only the category label is lost.

Stated plainly: the original CA-04 was written before the evidence above. Under the chosen
behaviour it would be *vacuously* true — the resumen "reflects the change" by not changing — which
is not a criterion anyone can fail. The rewritten version is falsifiable and gets a real test
(§7). Issue #273 needs this edit.

### 3. The new transactional shape — and why the sentinel can go

**Today** (`prisma-categoria.repository.ts:181-222`): an interactive `$transaction` deletes the
patterns, then runs `categoria.deleteMany({ id, userId, transacciones: { none: {} } })`. A 0-row
`deleteMany` does **not** throw, so it would not roll back the pattern deletion — the user would
lose their patterns while the category survived. `RollbackCategoriaEnUso` exists solely to force
that rollback, and a follow-up `findFirst` then distinguishes `404` from `409`.

**After**: the `transacciones: { none: {} }` predicate disappears, and with it the entire reason for
the sentinel. The repository converges on the array-form `$transaction` of
`PrismaEliminarIngestaRepository`:

```ts
const [, parent] = await this.prisma.$transaction([
  this.prisma.patronClasificacion.deleteMany({ where: { categoriaId: id, userId } }),
  this.prisma.categoria.deleteMany({ where: { id, userId } }),
]);
if (parent.count === 0) return Result.fail(new CategoriaNoEncontradaError(id));
return Result.ok(undefined);
```

**Children first is mandatory, not stylistic**: `PatronClasificacion.categoria` declares no
`onDelete` (`schema.prisma:176`), so it takes Prisma's default `Restrict` for a required relation —
deleting a category that still has patterns raises a foreign-key error. **CA-03**'s "patterns are
deleted with it" is a structural necessity of the delete, not an added courtesy.

**The rollback hazard cannot reappear — and the argument is schema-enforced, not conventional.**
The hazard is "children deleted, parent survives". With the in-use predicate gone, `parent.count === 0`
can mean only *not found* or *not owned*. In either case the child `deleteMany` also matched zero
rows, because `PatronClasificacion` carries a **composite FK `(categoriaId, userId) → Categoria(id, userId)`**
(ADR-036 D-06): a pattern row with `(categoriaId = id, userId = caller)` cannot exist unless a
`Categoria` with `(id, userId = caller)` exists. Zero parent ⇒ zero children, by database
constraint. This is a strictly stronger version of the safety argument
`PrismaEliminarIngestaRepository` documents for its own two `userId`-scoped `WHERE`s. **This
reasoning must be carried into the repository docblock**, replacing the sentinel's — deleting the
sentinel without recording *why* it is no longer needed is how the hazard gets reintroduced by the
next refactor.

`deleteMany` (not `delete`) on the parent keeps the count as the ownership gate, so "does not exist"
and "is not yours" stay indistinguishable — the anti-enumeration `404` rule of CAT038-07, unchanged.

### 4. What `DELETE` returns now — and why there is no confirm parameter

| Status | Meaning | Change |
|--------|---------|--------|
| `204` | Deleted (in use or not). No body | Widened: now also covers the in-use case |
| `400` | Malformed path param | Unchanged |
| `403` | Demo session (`DEMO_SOLO_LECTURA`) | Unchanged |
| `404` | Not found / not yours | Unchanged |
| ~~`409`~~ | ~~`CATEGORIA_EN_USO`~~ | **Removed** |

**No `?confirm=true`, no force flag, no 409-carrying-the-count-then-retry.** CA-01 is a *preview*,
not a two-phase commit, and the distinction is deliberate:

- The count the client warns with comes from the listing it already rendered the delete button
  from — the same flow `eliminar-ingesta` ships today.
- A server-side confirm gate would be **trivially bypassable** (any client can send the flag) and so
  guarantees nothing it appears to guarantee.
- It would guarantee a **stale** number anyway: the count can change between preview and confirm.
- It adds a state machine, an error code and a round trip to protect a label, not money.

**Accepted consequence (TOCTOU), recorded rather than engineered around**: a concurrent ingesta can
categorize a new transaction into the category between the preview and the delete, so the user may
lose the label on slightly more rows than the warning showed. Blast radius is a display label —
amounts, dates, buckets and the transactions themselves are untouched.

### 5. The FK does the nulling; the application does not duplicate it

`Transaccion.categoriaId` is `String?` with `onDelete: SetNull` on a real Postgres foreign key
(`relationMode` is unset ⇒ default `foreignKeys`). Deleting the `Categoria` row **already** nulls
`categoriaId` on every referencing transaction, enforced by the database, whichever statement issues
the DELETE.

**Decision: rely on the FK. Do not add an explicit `updateMany({ categoriaId: null })`.**

The tempting counter-argument is the `actualizar()` precedent — that repository *does* explicitly
re-stamp `bucketId` inside the same transaction rather than trusting anything implicit. **That
precedent does not transfer**, and the reason matters: `bucketId` has no relation to `Categoria` at
all, so **no** database mechanism maintains it — explicit code is the only mechanism that exists.
Here the database mechanism exists and is stronger than the application one:

- An explicit update would have to be `userId`-scoped to respect our own isolation convention, while
  the FK nulls **every** referencing row. The explicit statement would therefore be a *partial*
  action shadowing a *total* one — two mechanisms, one of them a subset, with no way to observe the
  difference in a test. That is worse than one mechanism (KISS).
- It would be unfalsifiable: no test can distinguish "the FK nulled it" from "our update nulled it,
  then the FK nulled nothing".

Mitigation for the readability cost: the repository docblock states the reliance explicitly, and the
integration test asserts the **behaviour** (`categoriaId IS NULL` after the delete), not the
mechanism — so the guarantee is pinned regardless of how it is implemented later.

**No migration.** Confirmed against `schema.prisma:182-199`: `categoriaId String?` (nullable),
`onDelete: SetNull` (present), `bucketId String?` (nullable, untouched by this change). Nothing to
alter, nothing to backfill, no `ALLOW_DESTRUCTIVE_DB` dance.

**Known asymmetry, recorded**: the count is `userId`-scoped, the FK's nulling is necessarily global.
Today a cross-tenant `Transaccion.categoriaId` is unproducible (every writer is `userId`-scoped),
but unlike `PatronClasificacion` there is no composite FK proving it. The current code's deliberately
unscoped `transacciones: { none: {} }` ("rejecting is the safe side") loses its rationale together
with the refusal; its replacement is the sentence above. See [Risks](#risks-and-mitigations).

### 6. Demo gate — confirmed unchanged

`EliminarCategoriaUseCase.execute()` returns `Result.fail(new CatalogoDemoSoloLecturaError())`
before it ever reaches the repository, and `esDemo` is a **required** input field, so the gate
cannot be skipped by omission. `catalogo-demo-gate.int-spec.ts:109` (`DELETE /api/categorias/:id →
403 DEMO_SOLO_LECTURA`) passes unchanged and becomes a regression guard for this change. No work
item; verification only.

**One stale artifact must be fixed**: the use case's docblock declares US-039 an explicit non-goal
("el `409` es el deliverable de este use case"). That paragraph becomes false the moment this
change lands and must be rewritten, not left to rot.

### 7. Tests

**Existing specs whose meaning inverts** (all named, so none is discovered mid-implementation):

| File | Current assertion | Becomes |
|------|-------------------|---------|
| `test/catalogo-crud.int-spec.ts:192` | `delete-in-use → 409, and NOTHING was deleted` | `204`; category **and** patterns gone; the transaction survives with `categoriaId = null` and its **original `bucketId`** |
| `persistence/prisma-categoria.repository.spec.ts:276` | `Result.fail(CategoriaEnUsoError)` when count is 0 and a follow-up lookup finds the row | Deleted — the branch no longer exists; replaced by array-`$transaction` shape + `404`-on-zero-count assertions |
| `use-cases/eliminar-categoria.use-case.spec.ts:70` | `propaga CategoriaEnUsoError (409)` | Deleted; demo-gate and delegation cases stay |
| `routes/categorias.routes.spec.ts:211` | `409 CATEGORIA_EN_USO when referenced by a transaction` | `204` |
| `routes/catalogo-http-error.spec.ts` | maps `CategoriaEnUsoError → 409` | Case removed |
| `domain/errors/categoria-en-uso.error.spec.ts` | — | File deleted with its error class |

Removing `CategoriaEnUsoError` from the `CatalogoError` union makes
`aCatalogoHttpError`'s `const _exhaustive: never = error` guard a **forcing function**: every
lingering reference fails compilation. That is the cleanup mechanism, not a risk.

**New coverage:**

| Criterion | Test |
|-----------|------|
| **CA-01** | `GET /api/categorias` returns the correct `transaccionesCount` per category; schema/DTO sync spec updated (`categorias.schema.spec.ts`) |
| **CA-02** | Integration: after deleting an in-use category, its transactions still exist, with `categoriaId = null` and their **original `bucketId`** |
| **CA-03** | Integration: patterns are gone; unit: array-`$transaction` ordering (children first) |
| **CA-04** | **Integration: capture `/api/resumen` before the delete, delete an in-use category, capture again — the two payloads are identical** (bucket subtotals, percentages, semáforo). Mirror image of `catalogo-rebucket.int-spec.ts`, which proves a re-bucket *does* move money; this proves a delete *does not* |
| **CA-05** | Integration: user B's transactions in a same-named category are untouched, and `transaccionesCount` never counts another user's rows (`catalogo-isolation.int-spec.ts` family) |

Strict TDD applies (`pnpm api test`, `pnpm api test:integration` against the local/CI ephemeral
Postgres — `apps/api/docs/local-test-db.md`).

## Affected areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/prisma/schema.prisma` + migrations | **Unchanged** | Nullable `categoriaId`/`bucketId` + `onDelete: SetNull` already in place |
| `apps/api/src/domain/errors/categoria-en-uso.error.ts` (+ spec) | **Deleted** | Refusal retired; nothing else references it |
| `apps/api/src/infrastructure/persistence/prisma-categoria.repository.ts` | Modified | Sentinel + in-use predicate + follow-up `findFirst` removed; array-`$transaction`; `_count` in the read include; docblock rewritten |
| `apps/api/src/application/ports/categoria-repository.port.ts` | Modified | `transaccionesCount` on `CategoriaConPatrones`; `eliminar` error type narrows to `CategoriaNoEncontradaError`; docblocks corrected |
| `apps/api/src/application/use-cases/eliminar-categoria.use-case.ts` | Modified | `EliminarCategoriaError` narrows; the stale "US-039 non-goal" docblock rewritten |
| `apps/api/src/infrastructure/http-express/routes/catalogo-http-error.ts` | Modified | `CATEGORIA_EN_USO` branch removed (exhaustive guard enforces completeness) |
| `apps/api/src/infrastructure/http/dto/categoria.dto.ts` | Modified | `transaccionesCount` on the single category DTO |
| `apps/api/src/infrastructure/http-express/schemas/categorias.schema.ts` | Modified | `transaccionesCount` on `categoriaResponseSchema` |
| `apps/api/src/infrastructure/http-express/schemas/openapi-document.ts` | Modified | `categoriasDeleteOperation`: drop `409`, rewrite the description |
| `apps/api/src/infrastructure/http-express/routes/categorias.routes.ts` | **Unchanged** | The route already forwards whatever the use case returns; only its spec changes |
| `apps/api/openapi.json`, `packages/api-client` generated types | **Generated** | Regenerated; both already CI drift-gated |
| `apps/api/test/catalogo-crud.int-spec.ts` + a new CA-04 resumen-stability int-spec | Modified / New | See §7 |
| `openspec/specs/catalogo-clasificacion-ownership/spec.md` | Modified | `CAT038-04` replaced; `CAT038-02` extended with the count; the "delete in use is US-038's non-goal" line removed from Non-Goals |
| `apps/web/**`, `apps/mobile/**` | **Unchanged** | No catalog CRUD UI exists yet (US-043). Response change is additive |

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Irreversible label loss** — a user deletes a 500-transaction category by accident; `git revert` cannot restore the associations | Medium | Medium (labels, never money) | The warning is the safeguard (CA-01). Transactions, amounts and buckets survive; the user can re-create the category and reclassify. Supabase PITR is the last resort |
| **Removing the sentinel silently reintroduces the "patterns die, category survives" hazard** | Low | High | The composite-FK argument (§3) is recorded **in the docblock**, and the array-`$transaction` keeps both statements in one commit. A repository spec pins zero-parent ⇒ zero-children |
| **Someone later "restores" an in-use check** for safety and reverts the feature | Low | Medium | The removal of `CategoriaEnUsoError` (class + spec + HTTP mapping) makes reintroduction a visible, multi-file act rather than a one-line predicate — same delete-don't-adapt tactic as ADR-037 |
| **`categoriaId = null` + a *spend* `bucketId` is a combination the ingest pipeline never produces** (it produces `bucketId = null` or `bucket-sincategoria`) | High (by design) | Low | Every reader keys on `bucketId` alone and treats `categoria` as an optional label — verified. The CA-02/CA-04 integration tests pin exactly this state so it is covered, not merely assumed |
| **`transaccionesCount` slows `GET /api/categorias`** | Low | Low | Filtered relation count in the same query over ~8–40 rows. Optimise only on a measured report (YAGNI) |
| **Prisma filtered relation count (`_count` with `where`) unsupported/behaving differently on this version** | Low | Low | Design-phase verification, not an assumption. Fallback: a single `transaccion.groupBy({ by: ['categoriaId'], where: { account: { userId } } })` merged with the list — still `userId`-scoped in SQL |
| **Cross-tenant `Transaccion.categoriaId`** — the FK nulls globally while the count is user-scoped | Very low | Low | Unproducible today (every writer is `userId`-scoped). Deferred fix with trigger: **if a cross-tenant reference is ever observed, add the composite `(categoriaId, userId)` FK** that `PatronClasificacion` already has |
| **`openapi.json` / api-client drift** | Low | Low | Both are existing CI gates (`openapi:check`, api-client job) |
| **Scope creep into bulk reassignment** ("while we're here, let the user pick a target category") | Medium | Medium | Explicit non-goal. The deliverable is the un-labelling, not a migration wizard |
| **Issue #273's CA-04 stays stale**, and verification later checks the implementation against wording nobody updated | Medium | Low | Called out in the header as an action item; the spec phase writes the corrected criterion |

## Success criteria

| AC | Criterion |
|----|-----------|
| **CA-01** | `GET /api/categorias` returns `transaccionesCount` per category, counting only the caller's transactions across all periods, so a client can report the impact before confirming |
| **CA-02** | Deleting an in-use category returns `204`; its transactions still exist, with `categoriaId = null`. **No transaction is deleted and none is reassigned to another category** |
| **CA-03** | The category's patterns are deleted together with it, in one DB transaction — a failure leaves both intact |
| **CA-04** (**rewritten**) | **Deleting a category does not move money between buckets.** `/api/resumen` — bucket subtotals, percentages and semáforo — is **identical** before and after the delete; the affected transactions keep their original `bucketId`. Only the category label is lost |
| **CA-05** | Only the owner's transactions are affected: `userId` appears in the SQL `WHERE` of the impact count, and an integration test proves user B's identically-named category and its transactions are untouched |
| — | `DELETE /api/categorias/:id` no longer returns `409`; `CategoriaEnUsoError` no longer exists in the codebase |
| — | The demo gate still returns `403 DEMO_SOLO_LECTURA` on this path (`catalogo-demo-gate.int-spec.ts` green, unmodified) |
| — | No Prisma migration is added |
| — | `openapi.json` regenerated and `openapi:check` green; api-client types regenerated and its drift gate green |
| — | `pnpm api test`, `pnpm api test:integration`, `pnpm api exec tsc --noEmit`, `pnpm web test` all green |

## Delivery and size forecast

**Single PR recommended.** The change is net-subtractive in the interesting places: one error class
and its spec deleted, a sentinel and a predicate and a follow-up query removed, one HTTP mapping
branch gone. The additions are one field threaded through port → DTO → schema → OpenAPI, plus test
churn.

Rough shape: ~10 hand-written source files (several shrinking), ~6 spec files, 1 new integration
spec, plus regenerated `openapi.json` and api-client types. Generated files plus test churn could
push the diff toward the 400-line budget.

**If the budget trips, prefer `size:exception` over a split.** The only conceivable seam is
"PR1: add `transaccionesCount`; PR2: change the delete semantics" — and PR1 alone ships a field no
client reads, while PR2 alone ships a destructive action with no warning data behind it. Splitting
would produce two PRs neither of which is independently valuable, and would double the contract
regeneration. The tasks phase owns the final forecast and the chained-PR decision.

## Rollback plan

1. **No migration, no data transformation** — rollback is `git revert` + redeploy. The `409` refusal
   comes back for future deletes.
2. **Past deletes are not recoverable by revert.** A category deleted while the change was live is
   gone, and its transactions' `categoriaId` values are gone with it. This is the one genuinely
   irreversible aspect of the change and the reason CA-01's warning exists at all. Recovery, if ever
   needed, is a Supabase point-in-time restore — a database operation, not a deploy.
3. **Nothing is corrupted by a rollback**: transactions left with `categoriaId = null` and a real
   `bucketId` are already the majority state in production (85%) and are read correctly by every
   endpoint whether or not this change is deployed.
4. **The generated contract must be reverted with the code** — a stale `openapi.json` that omits the
   `409` while the API returns it again would mislead clients. The CI drift gate makes this
   automatic.

## Proposal question round

The three binding decisions (impact count in the listing · `bucketId` preserved · no migration) came
from the user and are settled. The questions below are **product** questions that remain open, all
**non-blocking** for the spec and design phases — they refine the UX contract, not the architecture.
Recorded here because this executor cannot ask the user directly.

1. **After** a delete, should the API tell the user how many transactions lost their label — e.g.
   `200 { transaccionesAfectadas: 12 }` instead of `204` — so the UI can show "12 movimientos
   quedaron sin categoría"? Assumption taken: **no**, `204` (symmetry with every other `DELETE` in
   the API; the pre-confirm warning is the moment that matters).
2. **What period should the warning count cover?** `transaccionesCount` is all-history. A user
   looking at August's dashboard may read "34 transactions" as "34 in August". Assumption taken:
   **all history**, because the delete itself is all-history; the UI wording carries the burden of
   being clear.
3. **Should deleting a heavily-used category be made deliberately harder** (type-the-name
   confirmation, as opposed to a single "Are you sure?")? Assumption taken: **no extra friction at
   the API level** — the API stays a single call; any escalation is US-043's UI decision.
4. **Does an abandoned category deserve a "hide" instead of a "delete"?** Archiving would preserve
   history and be reversible, but it is a different feature (a new column, a filtered listing,
   migration). Assumption taken: **out of scope**, recorded here so the option is a decision rather
   than an oversight.

## Open questions (technical, non-blocking — resolve in design)

1. **Verify Prisma's filtered relation count** (`_count.select.transacciones.where`) on this Prisma
   version; fallback recorded in Risks.
2. **`transaccionesCount` on `POST`/`PATCH` responses** — one shared DTO (recommended, §1) versus a
   list-only field.
3. **Where the CA-04 stability test lives** — extend `catalogo-crud.int-spec.ts` or add a dedicated
   `catalogo-delete-en-uso.int-spec.ts` mirroring `catalogo-rebucket.int-spec.ts`. Leaning
   dedicated: the rebucket spec's whole value is that it is findable by name.
4. **New spec requirement ids** — whether US-039 replaces `CAT038-04` in place or adds a
   `CAT039-*` family that supersedes it. Leaning: replace `CAT038-04` (the requirement is wrong now,
   not merely extended) and add `CAT039-01` for the impact count.

None of these block the spec or design phase.
