# Design: US-039 — Delete a category that is in use, after a warning

- **Change**: `us-039-eliminar-categoria-en-uso`
- **Status**: Designed (2026-08-12)
- **Inputs**: `proposal.md` (binding decisions 1–3), `specs/catalogo-clasificacion-ownership/spec.md`
  (CAT039-01 added, CAT038-04 modified), canonical spec
  `openspec/specs/catalogo-clasificacion-ownership/spec.md`
- **Precedent**: `openspec/changes/archive/2026-08-12-us-038-catalogo-crud/design.md` (D-06, D-07, D-09)
- **New ADR**: **No.** ADR-036 (per-user catalog, demo read-only) and ADR-037 (identity is the owned
  row) both hold unchanged. This change executes what US-038's D-06 deferred by name.

## 0. Framing

This is a **net-subtractive** change with one additive field. The architecture is already correct;
the work is (a) removing a refusal that the domain no longer wants, (b) proving the removal cannot
reintroduce the hazard the removed machinery guarded, and (c) threading one count from SQL to the
wire.

There is no new layer, no new port, no new use case, no migration. Every decision below is either a
*deletion with a recorded reason* or a *reuse of an existing idiom in this same adapter*. Anything
that would add a mechanism (a confirm flag, an explicit nulling update, a second DTO, an impact
endpoint) is rejected in §2 with its reason.

The proposal is unusually concrete and its five open questions are the real work of this phase.
They are resolved first (§1), because three of them change what the code looks like.

---

## 1. Open questions resolved

### Q1 — Prisma filtered relation count on this version ⇒ **supported, verified against the installed client**

**Not an assumption.** Verified in the generated client for *this* schema at
`node_modules/.pnpm/@prisma+client@7.8.0_.../node_modules/.prisma/client/index.d.ts`:

```ts
export type CategoriaCountOutputTypeSelect<...> = {
  patrones?: boolean | CategoriaCountOutputTypeCountPatronesArgs
  transacciones?: boolean | CategoriaCountOutputTypeCountTransaccionesArgs   // line 1699
}
export type CategoriaCountOutputTypeCountTransaccionesArgs<...> = {
  where?: TransaccionWhereInput                                             // line 1723-1725
}
export type CategoriaInclude<...> = {
  user?: ...; bucket?: ...; patrones?: ...; transacciones?: ...
  _count?: boolean | CategoriaCountOutputTypeDefaultArgs<ExtArgs>           // line 7647
}
```

Three consequences that matter:

1. `_count: { select: { transacciones: { where } } }` is **typed**, not a cast — the `where` accepts
   a full `TransaccionWhereInput`, so `{ account: { userId } }` type-checks.
2. `_count` lives on `CategoriaInclude`, which is the include type used by `findMany`, `findFirst`,
   `create` **and** `update`. (It is absent from `CategoriaIncludeCreateManyAndReturn` /
   `...UpdateManyAndReturn`, which this adapter does not use.) So the same include helper works on
   all four read paths — this is what makes Q2's "one shape" answer cheap.
3. Prisma emits the count as a correlated subquery in the same round trip; no N+1.

**Fallback recorded but NOT taken**: a single
`transaccion.groupBy({ by: ['categoriaId'], where: { account: { userId } } })` merged in memory with
the list. It is strictly worse here (two round trips, an in-memory join, and `crear`/`actualizar`
would need their own path), and it is unnecessary because the primary mechanism is verified. Keep
this paragraph only as the escape hatch if a future Prisma major drops filtered `_count`.

### Q2 — `transaccionesCount` on `POST`/`PATCH` too ⇒ **one shared shape, produced by one include helper**

Confirmed as the proposal recommended, with the mechanism made explicit: `CATEGORIA_INCLUDE`
(currently a module-level `const`) becomes a **function of `userId`**, because the count's `where`
depends on the caller:

```ts
function categoriaInclude(userId: string) {
  return {
    bucket: true,
    patrones: true,
    // CAT039-01 + RNF-SEC-006: the count is scoped in the SQL WHERE, using the
    // SAME shape actualizar()'s re-stamp already uses (`account: { userId }`).
    _count: { select: { transacciones: { where: { account: { userId } } } } },
  } as const;
}
```

All four read paths (`listarConPatrones`, `buscarPorId`, `crear`, `actualizar`) use it, so
`aCategoriaConPatrones()` stays a **single total mapper** and `transaccionesCount` is a **required**
(non-optional) field on `CategoriaConPatrones`. A required field is the point: it makes "which
producer forgot the count?" a compile error rather than an `undefined` on the wire.

Rejected alternative — **fork the shape** ("list has the count, writes do not"): it would need a
second DTO, a second Zod response schema, a second OpenAPI response ref, a branching mapper, and it
would break `categoria.dto.ts`'s documented contract (`CategoriaDto` — "ÚNICA forma HTTP de una
categoría"). It buys one avoided subquery on two low-frequency write paths. That is complexity for
nothing (KISS), and it makes the `categorias.schema.spec.ts` sync guarantee ambiguous about *which*
DTO it pins.

Accepted micro-costs, recorded so they are decisions and not oversights:

- `POST /api/categorias` always returns `transaccionesCount: 0`. That is **true**, not special-cased.
- `buscarPorId` is used by `ActualizarCategoriaUseCase` and `CrearPatronUseCase` purely as an
  existence/read check; they pay one single-row subquery they do not read. Splitting a lighter
  `existePorId` for them is premature (YAGNI) — revisit only on a measured report.

**Naming note (deliberate, not drift)**: the repo's other listing count is `totalTransacciones`
(`prisma-listar-ingestas.reader.ts`), but that is a **persisted denormalized column** on `Ingesta`.
This one is computed live per caller, so the different name is honest rather than inconsistent.
`transaccionesCount` is also what CAT039-01 names normatively and what US-043 will build against —
renaming it here would put the design in conflict with an already-written spec.

### Q3 — Where the CA-04 stability test lives ⇒ **a dedicated `catalogo-delete-en-uso.int-spec.ts`**, plus the flipped case stays in `catalogo-crud.int-spec.ts`

Two tests, two homes, two different jobs:

| Test | Home | Job |
|------|------|-----|
| "delete-in-use → 204, category+patterns gone, transaction survives detached" | `catalogo-crud.int-spec.ts` (the existing case at :192, **flipped in place**) | CRUD surface behaviour — belongs with the other CRUD cases it is a peer of |
| "deleting a category moves no money: `/api/resumen` identical before/after" | **new** `catalogo-delete-en-uso.int-spec.ts` | The money invariant — belongs next to its mirror image |

The dedicated file is chosen because `catalogo-rebucket.int-spec.ts` earns its keep *by being
findable by name*: it is the file you open when you ask "does re-bucketing move money?". The new file
is the answer to the opposite question, and the pair reads as a matched set — one proves a catalog
edit **does** move money, the other proves a catalog delete **does not**. Burying the second inside a
generic CRUD spec would lose exactly that.

Structure: copy `catalogo-rebucket.int-spec.ts`'s scaffold verbatim (per-run `USER_ID`, seeded
catalog via `crearCatalogoParaUsuario`, `AesGcmCryptoService` with the runtime key, mid-month UTC
dates, full `afterAll` teardown). Do not invent a new fixture idiom.

### Q4 — Sentinel removal ⇒ **safe, and the argument holds — with one invariant that must be written down**

The proposal's argument was checked against the actual code and schema. **It holds**, but it is
load-bearing on a detail the proposal states only implicitly, and that detail must survive into the
docblock or the hazard *does* come back.

**The hazard, precisely** (`prisma-categoria.repository.ts:181-222` today): "children deleted, parent
survives". A `deleteMany` matching 0 rows is a *success*, so an interactive `$transaction` commits
the pattern deletion even when the category is not deleted. `RollbackCategoriaEnUso` exists only to
force that rollback. It is the same failure mode `PrismaEliminarIngestaRepository` documents at
length (`prisma-eliminar-ingesta.repository.ts:17-23`).

**Why it disappears.** With `transacciones: { none: {} }` gone, `parent.count === 0` can only mean
*absent* or *not owned*. In both cases the child `deleteMany` also matched zero rows:

- `PatronClasificacion` carries a composite FK `(categoriaId, userId) → Categoria(id, userId)`
  (`schema.prisma:176`, backed by `Categoria @@unique([id, userId])` at `schema.prisma:153`).
- The child statement's `WHERE` is `{ categoriaId: id, userId }` — the **same** `userId` the parent
  statement gates on.
- Therefore a pattern row matching `(categoriaId = id, userId = caller)` cannot exist unless a
  `Categoria` row `(id, userId = caller)` exists — which is exactly the row the parent statement
  failed to find. **Zero parent ⇒ zero children, by database constraint.**

**The invariant this rests on** — and the sentence the proposal leaves implicit: *both statements
must carry the SAME `userId`*. If a future refactor "simplifies" the child `WHERE` to
`{ categoriaId: id }`, the composite FK proves nothing anymore, and user A deleting user B's category
id would delete B's patterns while returning a clean 404 — the precise
`PrismaEliminarIngestaRepository` attack, reintroduced. **This is what the docblock must say**, not
merely "the sentinel is no longer needed".

**Mandated docblock** for `eliminar()` (replaces the `RollbackCategoriaEnUso` docblock and the D-06
paragraph in the class docblock; wording may be tightened, the three claims may not be dropped):

```
eliminar — array-form $transaction, children FIRST (US-039, CAT038-04 as modified).

(1) Children first is MANDATORY, not stylistic: PatronClasificacion.categoria
    declares no onDelete (schema.prisma:176) ⇒ Prisma's default Restrict for a
    required relation ⇒ deleting a categoría that still has patrones raises an
    FK error. "Los patrones se borran con la categoría" es una necesidad
    estructural del delete, no una cortesía agregada.

(2) NO sentinel, and NO in-use predicate. US-038 needed RollbackCategoriaEnUso
    porque un deleteMany de 0 filas NO hace rollback de un $transaction
    interactivo — el usuario perdía sus patrones mientras la categoría
    sobrevivía. Ese peligro ya no puede ocurrir: parent.count === 0 solo puede
    significar ausente/ajena, y en ambos casos el deleteMany hijo también
    matcheó 0 filas, porque PatronClasificacion tiene un composite FK
    (categoriaId, userId) → Categoria(id, userId) (ADR-036 D-06): una fila
    (categoriaId = id, userId = caller) no puede existir si no existe la
    Categoria (id, userId = caller). Cero padre ⇒ cero hijos, por constraint
    de base de datos.

    INVARIANTE DEL QUE DEPENDE ESA PRUEBA: los DOS statements filtran por el
    MISMO userId. Sacar `userId` del WHERE hijo rompe el argumento y
    reintroduce el ataque documentado en PrismaEliminarIngestaRepository
    (A borra los patrones de B y recibe un 404 limpio). No lo saques.

(3) Transaccion.categoriaId lo NULea la FK (onDelete: SetNull,
    schema.prisma:199), no código de aplicación — ver design.md §2/D-03.
    bucketId NO se toca: sigue siendo la fuente de verdad del 50/30/20, así
    que borrar una categoría NO mueve dinero (CAT038-04, CA-04).

deleteMany (no delete) en el padre: el count ES el gate de ownership, así que
"no existe" y "no es tuya" quedan indistinguibles (anti-enumeration, CAT038-07).
```

**Residual edge, accepted**: if a concurrent writer inserts a pattern *between* the two statements
inside the transaction, statement (2) fails with an FK `Restrict` error, the whole transaction rolls
back, and the request surfaces as a 500 via `errorMiddleware`. This is (a) identical to today's
behaviour, (b) reachable only via the user's own `POST /api/patrones` racing their own delete, and
(c) fail-safe (nothing partially deleted). No mitigation; recorded so it is not rediscovered as a bug.

**Concurrent double-DELETE**: request B's child delete blocks on A's row locks, then sees the
committed deletion; both counts land at 0 ⇒ clean 404. No hazard.

### Q5 — Explicit nulling vs. the FK ⇒ **the FK, and the test pins behaviour, not mechanism**

Confirmed against the schema, not assumed:

- `datasource db { provider = "postgresql" }` — `relationMode` unset ⇒ default `foreignKeys` ⇒ real
  Postgres FKs, referential actions enforced by the database (`schema.prisma:1-3`).
- `Transaccion.categoriaId String?` + `categoria Categoria? @relation(fields: [categoriaId],
  references: [id], onDelete: SetNull)` (`schema.prisma:198-199`). Single-column FK — no composite
  variant here, unlike `PatronClasificacion`.

So deleting the `Categoria` row already nulls `categoriaId` on every referencing transaction,
whichever statement issues the DELETE. **Do not add `transaccion.updateMany({ categoriaId: null })`.**

The `actualizar()` precedent (explicit `bucketId` re-stamp, `prisma-categoria.repository.ts:172-177`)
genuinely does not transfer, and the reason is worth keeping: `bucketId` has **no relation** to
`Categoria`, so no database mechanism maintains it — explicit code is the only mechanism that exists.
Here a stronger mechanism already exists, and adding a second would be actively worse:

- Our isolation convention would force the explicit update to be `userId`-scoped, while the FK nulls
  **every** referencing row. Two mechanisms where one is a strict subset of the other, with no test
  able to observe the difference — the definition of a mechanism you cannot maintain.
- It is unfalsifiable: no test can distinguish "the FK nulled it" from "our update nulled it first".

**Pinned by**: the CA-02 integration assertion (`categoriaId IS NULL` **and** `bucketId` unchanged
after the delete), which asserts the guarantee and stays green under any future implementation. The
docblock clause (3) above carries the reliance forward for readers.

**Recorded asymmetry** (inherited from the proposal, unchanged): the count is `userId`-scoped, the
FK's nulling is necessarily global. A cross-tenant `Transaccion.categoriaId` is unproducible today
(every writer is `userId`-scoped) but, unlike `PatronClasificacion`, has no composite FK proving it.
Deferred with an explicit trigger: **if a cross-tenant reference is ever observed, add the composite
`(categoriaId, userId)` FK.** The old code's deliberately unscoped `transacciones: { none: {} }`
("rejecting is the safe side") loses its rationale together with the refusal; this paragraph replaces
it.

---

## 2. Architecture decisions (D-numbered, continuing US-038's series)

### D-01 — The impact count travels in the listing, produced and scoped in SQL

`GET /api/categorias` carries `transaccionesCount`; there is no
`GET /api/categorias/:id/impacto`. This is the `eliminar-ingesta` precedent verbatim: the client
renders the delete button from a list it already fetched, and warns with a number already in hand.
A second endpoint would be a second route to demo-gate, a second isolation surface to test, and a
second round trip — for data the first response can carry for free.

Scoping is `account: { userId }` — the **same idiom** `actualizar()`'s re-stamp already uses
(`prisma-categoria.repository.ts:173`), not a new isolation shape. RNF-SEC-006 is satisfied in the
`WHERE`, never in memory.

### D-02 — The delete is total; refusal machinery is deleted, not disabled

The `409` is not feature-flagged, not kept behind a parameter, not softened to a warning header. The
`transacciones: { none: {} }` predicate, `RollbackCategoriaEnUso`, the follow-up `findFirst`,
`CategoriaEnUsoError` (class + spec) and its HTTP mapping all go. Reintroducing the refusal must be
a visible, multi-file act — the same delete-don't-adapt tactic ADR-037 used.

**No `?confirm=true` / force flag / 409-carrying-the-count**: a server-side confirm gate is trivially
bypassable by any client, guarantees a stale number anyway (the count can change between preview and
confirm), and adds a state machine plus an error code to protect a *label*, not money. CA-01 is a
preview, not a two-phase commit.

**Accepted TOCTOU**: a concurrent ingesta can categorize a new transaction into the category between
preview and delete, so the user may lose the label on slightly more rows than the warning showed.
Blast radius is a display label; amounts, dates, buckets and the rows themselves are untouched.

### D-03 — The database owns the detachment; the application owns nothing about it

See Q5. `categoriaId` is nulled by `onDelete: SetNull`; `bucketId` is never touched by this change,
by anyone, at any layer. This is what makes CA-04 a *structural* guarantee instead of a behavioural
one: no money math anywhere reads `categoriaId` (`prisma-resumen-mes.repository.ts` groups by
`['bucketId']`; the movimientos/detalle-bucket readers fold on `bucketId` and pass the category
through as a display label; `estado-semaforo.ts` consumes bucket percentages only).

### D-04 — The exhaustiveness guard is the cleanup mechanism, not a risk

Removing `CategoriaEnUsoError` from `EliminarCategoriaError` narrows the `CatalogoError` union, and
`aCatalogoHttpError`'s `const _exhaustive: never = error` (`catalogo-http-error.ts:102`) turns every
lingering reference into a **compile error**. The cleanup order is therefore forced and mechanical:
narrow the port and the use-case error type first, then let `tsc --noEmit` enumerate the rest. The
tasks phase should sequence it that way rather than hunting references by grep.

### D-05 — The demo gate is verification-only

`EliminarCategoriaUseCase.execute()` returns `Result.fail(new CatalogoDemoSoloLecturaError())` before
it ever reaches the repository, and `esDemo` is a **required** input field, so the gate cannot be
skipped by omission. `catalogo-demo-gate.int-spec.ts` (`DELETE /api/categorias/:id → 403
DEMO_SOLO_LECTURA`) must pass **unmodified** and becomes this change's regression guard. Zero work
items; a modified demo-gate spec in the diff is a review red flag.

The one thing that *is* work: the use case's docblock currently declares US-039 an explicit non-goal
("el `409` es el deliverable de este use case"). That paragraph becomes false the moment this change
lands and must be rewritten, not left to rot.

### D-06 — One shape, one mapper, one schema

See Q2. `CategoriaConPatrones` → `CategoriaDto` → `categoriaResponseSchema` stay a 1:1:1 chain, which
is what makes `categorias.schema.spec.ts`'s sync guarantee (parse the **real** mapper output)
meaningful. The new field is threaded through all three or through none.

---

## 3. Module and layer map

Refines the proposal's Affected-areas table. **Bold rows are corrections** where the code disagreed
with the proposal or the proposal was silent.

### 3.1 `domain/`

| File | Action | Detail |
|------|--------|--------|
| `errors/categoria-en-uso.error.ts` | **Delete** | Sole consumer was the delete refusal |
| `errors/categoria-en-uso.error.spec.ts` | **Delete** | With its class |

No other domain change. No value object touched.

### 3.2 `application/`

| File | Action | Detail |
|------|--------|--------|
| `ports/categoria-repository.port.ts` | Modify | `CategoriaConPatrones` gains **required** `readonly transaccionesCount: number` (doc: all-history, caller-scoped, CAT039-01). `eliminar()` return narrows to `Promise<Result<void, CategoriaNoEncontradaError>>`. `eliminar`'s docblock ("el rechazo por 'en uso' es atómico…") rewritten to the children-first + composite-FK contract |
| `use-cases/eliminar-categoria.use-case.ts` | Modify | `EliminarCategoriaError = CatalogoDemoSoloLecturaError \| CategoriaNoEncontradaError`. Stale "US-039 non-goal / el `409` es el deliverable" paragraph rewritten (D-05). Body unchanged — it is already a pure demo-gate + delegate |
| `use-cases/listar-catalogo.use-case.ts` | **Unchanged** | Passes `CategoriaConPatrones[]` through; the new field rides along with zero code change |

### 3.3 `infrastructure/`

| File | Action | Detail |
|------|--------|--------|
| `persistence/prisma-categoria.repository.ts` | Modify | `CATEGORIA_INCLUDE` const → `categoriaInclude(userId)` helper (Q2). `CategoriaRow` gains `_count: { transacciones: number }`; `aCategoriaConPatrones` maps it. `eliminar()` rewritten to array-form `$transaction` (§4); `RollbackCategoriaEnUso`, the in-use predicate and the follow-up `findFirst` deleted; docblocks rewritten per Q4 |
| `http/dto/categoria.dto.ts` | Modify | `CategoriaDto` + `aCategoriaDto()` gain `transaccionesCount` |
| `http/dto/catalogo.dto.ts` | **Unchanged** | Delegates to `aCategoriaDto` — correction: the proposal did not list it, and it correctly needs nothing |
| `http-express/schemas/categorias.schema.ts` | Modify | `categoriaResponseSchema` gains `transaccionesCount: z.number()` (§5) |
| `http-express/schemas/openapi-document.ts` | Modify | `categoriasDeleteOperation`: drop the `409` response, rewrite the description. `categoriasListOperation`: description mentions the impact count (CAT039-01) |
| `http-express/routes/catalogo-http-error.ts` | Modify | `CategoriaEnUsoError` import + the `409 CATEGORIA_EN_USO` branch removed; the `never` guard enforces completeness |
| `http-express/routes/categorias.routes.ts` | **Unchanged** | Verified: the DELETE handler forwards whatever the use case returns and answers `204` on ok. Only its spec changes |
| `composition/` | **Unchanged** | No new dependency, no wiring change |

### 3.4 Generated / contract

| Artifact | Action |
|----------|--------|
| `apps/api/openapi.json` | Regenerated (`pnpm api openapi:emit`) |
| `packages/api-client/src/types.gen.ts` | Regenerated (`pnpm --filter @moneydiary/api-client generate`) |

### 3.5 Confirmed untouched

- `apps/api/prisma/schema.prisma` + migrations — verified: `categoriaId String?`,
  `onDelete: SetNull`, `bucketId String?` all already in place. **No migration, no
  `ALLOW_DESTRUCTIVE_DB` dance.**
- `apps/web/**` — verified: the only category code is `src/domain/categoria.ts` (a hand-written
  mirror of the 8 seed names) and `ReclasificarCategoriaControl.tsx`. Nothing calls
  `GET /api/categorias`. Catalog UI is US-043.
- `apps/mobile/**` — verified: zero references to `categorias`.

---

## 4. The new `eliminar()` — transactional shape and ordering guarantees

```ts
async eliminar(
  userId: string,
  id: string,
): Promise<Result<void, CategoriaNoEncontradaError>> {
  const [, parent] = await this.prisma.$transaction([
    // (1) children FIRST — REQUIRED under the FK's default Restrict.
    this.prisma.patronClasificacion.deleteMany({ where: { categoriaId: id, userId } }),
    // (2) parent — its count IS the ownership gate; the FK nulls Transaccion.categoriaId.
    this.prisma.categoria.deleteMany({ where: { id, userId } }),
  ]);

  if (parent.count === 0) {
    return Result.fail(new CategoriaNoEncontradaError(id));
  }
  return Result.ok(undefined);
}
```

**Array form, not interactive.** Chosen because the two statements have **no interdependent reads** —
exactly the criterion `actualizar()`'s D-07 already uses for its re-stamp, and exactly what
`PrismaEliminarIngestaRepository` does. The interactive form existed only to host the sentinel throw;
with the sentinel gone it would be indirection with no purpose. This also converges the adapter on a
single `$transaction` style, which lets the unit-test mock drop its dual-mode branch.

**Ordering guarantees, in force:**

| # | Guarantee | Enforced by |
|---|-----------|-------------|
| G1 | Patterns are deleted before the category | Array order — Prisma issues array-form statements sequentially in one transaction |
| G2 | Deleting patterns first is mandatory, not stylistic | `PatronClasificacion.categoria` declares no `onDelete` ⇒ default `Restrict` for a required relation ⇒ (2) would raise an FK error otherwise |
| G3 | Both statements commit or neither does | Single `$transaction` |
| G4 | A zero-count parent implies a zero-count child ⇒ the commit is a no-op | Composite FK `(categoriaId, userId) → Categoria(id, userId)` + **both** `WHERE`s gating on the same `userId` (Q4) |
| G5 | `Transaccion.categoriaId` becomes `null`; the rows survive | FK `onDelete: SetNull`, applied by Postgres as part of statement (2) |
| G6 | `Transaccion.bucketId` is never written | No statement touches it — this is CA-04's *structural* proof |
| G7 | "absent" and "not yours" stay indistinguishable | `deleteMany` (not `delete`) on the parent; count is the gate (CAT038-07 anti-enumeration) |
| G8 | An infrastructure failure is not a domain error | No `try/catch`; a DB failure propagates to `errorMiddleware` → 500 (same as `PrismaEliminarIngestaRepository`) |

**Failure modes, enumerated:**

| Situation | Result |
|-----------|--------|
| Category exists and is owned, in use or not | Both statements commit; `204` |
| Category absent, or owned by someone else | Child 0, parent 0 (G4); commit is a no-op; `404` |
| Concurrent pattern INSERT between (1) and (2) | Statement (2) hits FK `Restrict`; whole transaction rolls back; `500`. Fail-safe, nothing partial (Q4) |
| Concurrent duplicate DELETE | Second request blocks, then sees the committed deletion; parent 0 ⇒ `404` |
| Demo session | Never reaches the repository — use case short-circuits with `403` (D-05) |

---

## 5. Contracts

### 5.1 Port

```ts
export interface CategoriaConPatrones {
  readonly id: string;
  readonly nombre: string;
  readonly bucket: Bucket;
  readonly patrones: Patron[];
  /**
   * CAT039-01 — all-history count of the CALLER's OWN transacciones
   * referencing this category. Produced in SQL, scoped in SQL
   * (RNF-SEC-006). 0 for a category created one moment ago.
   */
  readonly transaccionesCount: number;
}

eliminar(userId: string, id: string): Promise<Result<void, CategoriaNoEncontradaError>>;
```

### 5.2 HTTP surface

`GET /api/categorias` → `200 { categorias: [{ id, nombre, bucket, patrones[], transaccionesCount }] }`
`POST /api/categorias` → `201` same shape (`transaccionesCount: 0`)
`PATCH /api/categorias/:id` → `200` same shape

`DELETE /api/categorias/:id`:

| Status | Meaning | Change |
|--------|---------|--------|
| `204` | Deleted (in use or not). No body | Widened — now also covers the in-use case |
| `400` | Malformed path param | Unchanged |
| `403` | Demo session (`DEMO_SOLO_LECTURA`) | Unchanged |
| `404` | Not found / not yours (merged) | Unchanged |
| ~~`409`~~ | ~~`CATEGORIA_EN_USO`~~ | **Removed** |

### 5.3 Zod

```ts
export const categoriaResponseSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  bucket: z.string(),
  patrones: z.array(patronResponseInCategoriaSchema),
  transaccionesCount: z.number(),
}).meta({ id: 'CategoriaResponse', description: '... (US-038, US-039 CAT039-01).' });
```

`z.number()`, **not** `z.number().int().nonnegative()`. The layer-honesty gate in this file's own
docblock says domain rules do not get duplicated into transport schemas, and the sibling `prioridad`
(an `Int` column) is already a plain `z.number()`. Emitting `type: integer` would be marginally nicer
in `openapi.json` but would make this field the only one of its kind in the file. Consistency wins;
recorded so a reviewer knows it was considered.

`catalogoResponseSchema` needs no edit — it is `z.array(categoriaResponseSchema)`.

### 5.4 OpenAPI (`openapi-document.ts`)

- `categoriasDeleteOperation`: delete the `'409'` response entry; rewrite `description` — remove
  "Rejected if any Transaccion (any period) still references the category" and state instead that
  the delete always succeeds, that referencing transactions survive with `categoriaId: null` and
  their original `bucketId`, and that no money moves (CAT038-04 as modified).
- `categoriasListOperation`: extend `description` to mention `transaccionesCount` as the caller-scoped
  all-history impact preview (CAT039-01).
- `categoriasCreateOperation` / `categoriasUpdateOperation`: **no edit** — they already `$ref`
  `categoriaResponseSchema`, so the field appears automatically.

**Additivity**: the response change is additive (new field) and safe for any consumer. Dropping the
`409` is a contract *narrowing*, technically breaking — and verified harmless: no web, mobile or
api-client consumer calls this endpoint today (§3.5). Recorded rather than glossed.

### 5.5 Regeneration commands (in order)

```bash
pnpm api openapi:emit                              # rewrites apps/api/openapi.json
pnpm --filter @moneydiary/api-client generate      # rewrites packages/api-client/src/types.gen.ts
pnpm api openapi:check                             # drift gate, must be green
pnpm --filter @moneydiary/api-client typecheck
```

Both artifacts are already CI drift-gated (CAT038-09) and must be committed **with** the code — a
stale `openapi.json` advertising a `409` the API no longer returns is exactly the mis-lead the gate
exists to prevent.

---

## 6. Testing strategy (strict TDD)

Order per slice: red unit → green → red integration → green. Runners: `pnpm api test` (Vitest, Oxc,
no DB) and `pnpm api test:integration` (real ephemeral Postgres — `apps/api/docs/local-test-db.md`,
`ALLOW_DESTRUCTIVE_DB=1`).

### 6.1 Existing tests whose meaning FLIPS (all named — none discovered mid-implementation)

Beyond the six the proposal listed, **four more** were found by reading the code. The proposal's list
was incomplete; this is the complete one.

| # | File · anchor | Today | Becomes |
|---|---------------|-------|---------|
| 1 | `test/catalogo-crud.int-spec.ts:192` | `delete-in-use → 409, NOTHING was deleted` | `204`; category **and** its pattern gone; the transaction survives with `categoriaId: null` and its **original `bucketId`** |
| 2 | `persistence/prisma-categoria.repository.spec.ts:257` | asserts interactive `$transaction` (`typeof txArg === 'function'`) + the in-use predicate in the parent `WHERE` | asserts array form (`Array.isArray(txArg)`), child `WHERE` `{ categoriaId, userId }`, parent `WHERE` deep-equals **exactly** `{ id, userId }` (pins predicate removal) |
| 3 | `persistence/prisma-categoria.repository.spec.ts:276` | `Result.fail(CategoriaEnUsoError)` when count 0 + follow-up finds the row | **Deleted** — branch no longer exists |
| 4 | `persistence/prisma-categoria.repository.spec.ts:292` | `404` via the follow-up `findFirst` | Kept, rewritten: `404` straight from `parent.count === 0`, no `findFirst` |
| 5 | `persistence/prisma-categoria.repository.spec.ts:304` | "follow-up lookup runs OUTSIDE the transaction" | Rewritten to `expect(prisma.categoria.findFirst).not.toHaveBeenCalled()` — the lookup is gone entirely |
| 6 | **`prisma-categoria.repository.spec.ts:61-65, 126-136, ~195-205, 218-252`** | four assertions of `include: { bucket: true, patrones: true }` (listar/buscarPorId/crear/actualizar) | **all four** gain `_count: { select: { transacciones: { where: { account: { userId: USER_ID } } } } }` — the RNF-SEC-006 assertion for CA-01 |
| 7 | **`prisma-categoria.repository.spec.ts:11-39`** (`makePrismaMock` docblock + interactive branch) | dual-mode `$transaction` fake | array-only; docblock updated (only one call style survives) |
| 8 | `use-cases/eliminar-categoria.use-case.spec.ts:70` | `propaga CategoriaEnUsoError (409)` | **Deleted**; demo-gate + 404 propagation + delegation cases stay |
| 9 | `routes/categorias.routes.spec.ts:211` | `409 CATEGORIA_EN_USO` | **Replaced** by `404 CATEGORIA_NO_ENCONTRADA` on DELETE. **Correction to the proposal**, which said "becomes 204": the 204 case already exists at :196, so a straight flip would leave the DELETE route's *error* path with zero coverage |
| 10 | `routes/catalogo-http-error.spec.ts` | maps `CategoriaEnUsoError → 409` | Case removed |
| 11 | `domain/errors/categoria-en-uso.error.spec.ts` | — | File deleted with its class |
| 12 | **`http/dto/categoria.dto.spec.ts`** · **`http-express/schemas/categorias.schema.spec.ts:83-97`** | build `CategoriaConPatrones` fixtures without the count | fixtures gain `transaccionesCount`; add assertions that a **non-zero** count survives mapper → schema |
| 13 | **`use-cases/{listar-catalogo,crear-categoria,actualizar-categoria,crear-patron}.use-case.spec.ts`** | `CategoriaConPatrones` fixtures | compile-only: add `transaccionesCount` to each fixture (required field) |

### 6.2 New unit coverage — target file → assertions

| Target file | Assertions |
|-------------|------------|
| `prisma-categoria.repository.spec.ts` · `listarConPatrones()` | (a) `_count` filter is `{ account: { userId: USER_ID } }` — count scoped in SQL (CA-05/RNF-SEC-006); (b) mapper maps `_count.transacciones` → `transaccionesCount` (feed a row with `_count: { transacciones: 12 }`, expect `12`); (c) a row with `_count: { transacciones: 0 }` maps to `0`, never `undefined` |
| `prisma-categoria.repository.spec.ts` · `crear()` | returned DTO carries `transaccionesCount: 0` from the include (not hard-coded) |
| `prisma-categoria.repository.spec.ts` · `actualizar()` | the include still carries `_count` on both branches (with and without a bucket change); the array-`$transaction` re-stamp assertions stay green |
| `prisma-categoria.repository.spec.ts` · `eliminar()` | (a) `$transaction` called once with an **array**; (b) `patronClasificacion.deleteMany` `WHERE` deep-equals `{ categoriaId: 'cat-1', userId: USER_ID }` — **the Q4 invariant guard**, comment it as such; (c) `categoria.deleteMany` `WHERE` deep-equals `{ id: 'cat-1', userId: USER_ID }` (no `transacciones` key); (d) parent count 1 ⇒ `Result.ok`; (e) parent count 0 ⇒ `Result.fail(CategoriaNoEncontradaError)`; (f) `categoria.findFirst` never called |
| `categoria.dto.spec.ts` | `aCategoriaDto` passes a non-zero `transaccionesCount` through unchanged |
| `categorias.schema.spec.ts` | `categoriaResponseSchema.parse(aCategoriaDto({... transaccionesCount: 7}))` keeps `7` (sync guarantee against the **real** mapper output, buckets precedent) |
| `catalogo-http-error.spec.ts` | the 12 remaining classes still map; no `CATEGORIA_EN_USO` |
| `categorias.routes.spec.ts` · DELETE | `204` on ok (existing); `404 CATEGORIA_NO_ENCONTRADA` when the use case fails (new, replaces the 409 case) |
| `eliminar-categoria.use-case.spec.ts` | demo ⇒ `403` error class and **the repository is never called**; non-demo ⇒ delegates with `(userId, id)`; repository `404` propagates unchanged |

### 6.3 Integration (real DB)

| Criterion | Spec · case |
|-----------|-------------|
| **CA-01** | `catalogo-crud.int-spec.ts` — after creating a category and attaching N transactions to it, `GET /api/categorias` reports `transaccionesCount: N` for it and `0` for an untouched sibling |
| **CA-02** | `catalogo-crud.int-spec.ts:192` (flipped) — DELETE in-use ⇒ `204`; `categoria` row null; `patronClasificacion` row null; **the transaction row still exists**, `categoriaId === null`, `bucketId === <the exact id it had before>` |
| **CA-03** | Same case: the pattern is gone. Ordering/atomicity is pinned by the unit assertions (6.2) — a DB-level partial-failure injection is not worth building |
| **CA-04** | **NEW `test/catalogo-delete-en-uso.int-spec.ts`** — see 6.4 |
| **CA-05** | `catalogo-isolation.int-spec.ts` (extended) — (a) A and B each own a same-named category with their own transactions; A's `GET /api/categorias` shows only A's counts; (b) A DELETEs B's real category id ⇒ `404`, and B's category, patterns and transactions are all still present with `categoriaId` intact |
| Demo gate | `catalogo-demo-gate.int-spec.ts` — **unmodified**, must stay green (D-05) |

### 6.4 The CA-04 spec, specified precisely

`test/catalogo-delete-en-uso.int-spec.ts`, scaffolded from `catalogo-rebucket.int-spec.ts`.

Fixture: user + seeded catalog; take the seed's `Delivery` (Deseos) category; one account, one
`PROCESADA` ingesta; **two** transactions dated mid-current-month with
`cargo: 15000n` / `8000n`, `descripcion` encrypted with the runtime key, `categoriaId = delivery.id`,
`bucketId = BUCKET_IDS[Bucket.Deseos]`. Plus **one income row** so `porcentajeBp` and
`estadoSemaforo` are non-null — otherwise `sinIngreso: true` makes every percentage `null` and the
comparison degenerates.

Three cases:

1. **before** — `GET /api/resumen?periodo=<current>` ⇒ `200`. Assert the **exact** values, not just
   the shape: `Deseos.total === '23000'` (string, BigInt-safe), `Deseos.porcentajeBp` is a number,
   `estadoGlobal` is a non-null string. Snapshot the whole `res.body` into a `const antes`.
2. **delete** — `DELETE /api/categorias/:deliveryId` ⇒ **`204`** (the in-use delete that US-038
   refused). Then assert directly in the DB: both transaction rows still exist,
   `categoriaId === null`, `bucketId === BUCKET_IDS[Bucket.Deseos]` (unchanged).
3. **after** — `GET /api/resumen?periodo=<current>` ⇒ `200`, and `expect(despues.body).toEqual(antes)`.
   **Then re-assert the same concrete values** (`Deseos.total === '23000'`, same `porcentajeBp`,
   same `estadoGlobal`).

That last sentence is the point and must not be dropped in implementation: a bare deep-equal is
satisfiable by two identically-broken payloads (both empty, both `sinIngreso`). Asserting the
concrete BigInt total on **both** sides is what makes CA-04 falsifiable rather than vacuous — which
is the entire reason issue #273's original wording was rewritten.

Optional third assertion, cheap and worth it: `GET /api/buckets/Deseos?periodo=...` still returns
both transactions after the delete, now with `categoria: null` — proving the drill-down degrades to
"no label" rather than dropping the rows.

**Issue #273 action item stands**: its CA-04 text still says "the month summary reflects the change".
Update it to CAT038-04's wording before verification, or verification will check the implementation
against a criterion nobody updated.

### 6.5 Full green bar

```bash
pnpm api test
pnpm api exec tsc --noEmit
ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration
pnpm api openapi:check
pnpm --filter @moneydiary/api-client typecheck
pnpm web test          # untouched, run as a no-regression check
```

---

## 7. Delivery constraints for the tasks phase

**Single PR.** Confirmed after reading the code: the seam the proposal considered
("PR1: add the count; PR2: change delete semantics") produces two PRs neither of which is
independently valuable — PR1 ships a field no client reads, PR2 ships a destructive action with no
warning data behind it — and doubles the contract regeneration. Do not split.

**The 400-line budget will likely trip.** Refined forecast from the file map:

| Bucket | Files | Rough changed lines |
|--------|-------|---------------------|
| Source (7 modified, 1 deleted) | port, repository, use case, error mapper, DTO, Zod schema, openapi-document, `categoria-en-uso.error.ts` | ~120, several net-negative |
| Unit specs (10 modified, 1 deleted) | repository spec (largest), routes, http-error, dto, schema, 4 use-case fixture files, error spec | ~180 |
| Integration (2 modified, 1 new) | `catalogo-crud`, `catalogo-isolation`, **new** `catalogo-delete-en-uso` (~200 lines) | ~260 |
| Generated | `openapi.json`, `types.gen.ts` | ~40 |

⇒ **`size:exception` is the expected outcome, and it is the right one.** The bulk is test churn and
one new integration spec, i.e. the safest possible lines in the diff. The tasks phase owns the final
call and should record the exception up front rather than discovering it at PR time.

**Suggested slice order inside the single PR** (each slice ends on a green bar, so a bad slice is
revertable):

1. **S1 — count**: port field → repository include helper + mapper → DTO → Zod → openapi-document
   list description → regenerate. Unit + `catalogo-crud` CA-01. *Purely additive; nothing breaks.*
2. **S2 — delete semantics**: narrow the port and `EliminarCategoriaError`, then let `tsc --noEmit`
   enumerate the fallout (D-04). Rewrite `eliminar()` + docblocks; delete
   `CategoriaEnUsoError` (+ spec) and the mapper branch; flip the unit/route specs; regenerate the
   contract without the `409`.
3. **S3 — proof**: flip `catalogo-crud.int-spec.ts:192`, extend `catalogo-isolation.int-spec.ts`, add
   `catalogo-delete-en-uso.int-spec.ts`. Confirm `catalogo-demo-gate.int-spec.ts` untouched and green.
4. **S4 — spec sync**: apply the delta to
   `openspec/specs/catalogo-clasificacion-ownership/spec.md` (CAT039-01 added, CAT038-04 replaced,
   the "delete in use is US-038's non-goal" line removed from Non-Goals).

**Non-negotiables handed to `sdd-apply`:**

- The Q4 docblock ships **with** the sentinel removal, in the same commit. Deleting the sentinel
  without recording why it is no longer needed is exactly how the hazard returns.
- Both `WHERE`s in `eliminar()` keep `userId`. This is not style.
- `catalogo-demo-gate.int-spec.ts` is **not** edited. A diff touching it fails review.
- No `updateMany({ categoriaId: null })` anywhere (Q5).
- No Prisma migration. If one appears in the diff, the change went off-design.
- `openapi.json` + `types.gen.ts` are committed with the code, never in a follow-up.

---

## 8. Residual risks

| Risk | Mitigation / status |
|------|---------------------|
| A future refactor drops `userId` from the child `deleteMany` and silently reintroduces the cross-tenant pattern-deletion attack | The mandated docblock names the invariant explicitly, and unit assertion 6.2(b) fails if the `WHERE` changes shape |
| Cross-tenant `Transaccion.categoriaId` (count is user-scoped, the FK nulls globally) | Unproducible today; deferred with an explicit trigger — **if ever observed, add the composite `(categoriaId, userId)` FK** `PatronClasificacion` already has |
| Irreversible label loss on an accidental delete | CA-01's warning is the safeguard; money, dates, buckets and rows all survive; last resort is a Supabase PITR (a DB operation, not a deploy) |
| `transaccionesCount` slows `GET /api/categorias` | One correlated subquery over ~8–40 rows in the same round trip. Optimise only on a measured report (YAGNI) |
| Concurrent pattern INSERT during the delete ⇒ 500 | Accepted, fail-safe, identical to today's behaviour (Q4) |
| Issue #273's CA-04 wording stays stale and verification checks against it | Explicit action item in §6.4; CAT038-04 already carries the corrected criterion |
| Scope creep into bulk reassignment | Explicit non-goal in both proposal and spec. The deliverable is the un-labelling, not a migration wizard |
