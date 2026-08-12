# Design: US-038 — Catalog CRUD API (categories + classification patterns)

- **Change**: `us-038-catalogo-crud`
- **Phase**: design (architecture-level HOW)
- **Input**: `openspec/changes/us-038-catalogo-crud/proposal.md` (authoritative on WHAT)
- **Builds on**: ADR-036 / US-037 (`openspec/changes/archive/2026-08-11-us-037-catalogo-per-user/`)
- **Binding constraints**: ADR-005 (layering + `Result<T,E>`), ADR-028 (Express + manual composition
  root), ADR-011/012 (contract-first `openapi.json` → `@moneydiary/api-client`), RNF-SEC-006
  (`userId` in the SQL `WHERE`), ADR-036 preconditions 1 (demo read-only catalog) and 2
  (`(prioridad, patron, id)` total, user-independent tie-break), strict TDD.

---

## 0. Framing

The proposal already settled the *what*: 7 endpoints, the enum retirement, the demo gate, delete
semantics, the re-stamp. This document settles the *how* at architecture level and answers the five
open questions. It also **corrects the proposal's Affected Areas table where the code disagrees**
(§4.4) — three concrete divergences were found by reading the code, all of them cost-increasing, and
all of them are cheaper to discover here than in apply.

The change is architecturally small but semantically load-bearing: it moves the answer to *"which
categories exist?"* from a compile-time closed type to a `userId`-scoped row set. Every design
decision below is downstream of that single move.

Non-goals are the proposal's non-goals verbatim. This design adds none.

---

## 1. Open questions resolved

### Q1 — ADR amendment vs. new ADR ⇒ **new ADR-037**, plus a forward pointer in ADR-036

**Decision.** Ship `docs/adr/ADR-037-identidad-de-categoria-como-fila-del-usuario.md` in **PR #1**,
and add one cross-reference line to ADR-036's *Consequences* section pointing forward to it. Do not
rewrite ADR-036's body.

**Rationale.**

1. **Repo precedent points at a new ADR, not an amendment.** ADR-035 exists precisely because mobile
   Google login *deviated from a scope sentence in ADR-034* ("Desviación explícita de 'termina en
   `apps/api`' de ADR-034 — por eso ADR propio"). The enum retirement is a stronger deviation than
   that one: `openspec/specs/catalogo-clasificacion-ownership/spec.md` lists *"Dismantling the closed
   `Categoria` TypeScript enum or the `CATEGORIA_BUCKET` total map — both remain untouched"* as an
   explicit **Non-Goal**. Reversing a published Non-Goal inside an amendment note to the same
   document is how ADRs stop being trustworthy.
2. **It is a separate decision with its own alternatives.** ADR-036 decides *ownership* (whose rows
   these are). ADR-037 decides *identity* (what makes a category valid). The second has rejected
   alternatives ADR-036 never considered: keep the enum as a "known names" hint alongside free-form
   rows; a branded `string` type; runtime validation against a per-user name set. Those belong in a
   decision record, and folding them into an already-✅-Decided-and-implemented ADR would either
   bloat it or under-record them.
3. **ADR-036 is `✅ Decidido e implementado`.** Mutating the substance of a decided-and-implemented
   ADR is exactly what supersession and new records exist to avoid.

**Rejected alternative.** Amendment note on ADR-036 (the proposal's leaning). Cheaper by one file and
defensible on the grounds that ADR-036 pre-assigned the change to US-038 ("US-038 es dueño de
cualquier cambio ahí"). Rejected: that sentence assigns *ownership of the work*, not *authority to
reverse a published invariant without its own record*.

**ADR-037 content obligations** (the tasks phase owns the file, this design owns its skeleton):
title *"La identidad de una categoría es una fila propiedad del usuario, no un tipo de
compilación"*; the traded-away guarantee stated explicitly (`Record<Categoria, Bucket>` was **total**
— the compiler proved no category was bucket-less; that proof is replaced by the `NOT NULL`
`Categoria.bucketId` FK and retained by the compiler only for the template, via
`CategoriaTemplateNombre`); the three rejected alternatives above; and the consequence that
`prisma/backfill-categorias.ts` loses its last runtime dependency on `CATEGORIA_IDS` (§3.5).

### Q2 — Error-body `code` scope ⇒ **new endpoints only**, and it is registered in the contract

**Decision.** The 4 new paths return `{ message, code }` on every non-2xx. The ~13 pre-existing
operations keep `{ message }` and are not touched. `code` is **additive and MUST be treated as
optional by clients**.

Confirmed as proposed, with one addition the proposal left implicit: the shape is **registered in
`openapi.json`** as a shared `CatalogoErrorResponse` schema, not merely described in prose. Today the
document declares error responses with a `description` and no `content` schema. Leaving the new ones
prose-only would defeat decision 2's entire purpose — `DEMO_SOLO_LECTURA` must be machine-readable by
US-043's UI, and "machine-readable" means *in the contract that generates `types.gen.ts`*, not in a
sentence. This is a deliberate, scoped first precedent; §7.3 states its boundary.

**Rejected alternative.** Retrofit `code` across all existing endpoints for consistency. That is a
cross-cutting contract change touching every route, every route spec, both clients and the generated
types, with zero consumer today — textbook scope creep, and the proposal already scoped it out. The
inconsistency is real and is accepted as recorded debt with an explicit trigger: **the first time a
second resource family needs a machine-readable code**, promote `CatalogoErrorResponse` to a shared
`ErrorResponse` and retrofit in one dedicated change.

### Q3 — One error class per condition ⇒ **keep them separate**, with a sharpened definition of "condition"

**Decision.** One class per condition, where **"condition" = a distinct user-facing remediation**,
not a distinct code branch. `NombreCategoriaInvalidoError` and `BucketNoAsignableError` stay separate.

**Rationale.**

- **House style, verified.** The ingesta family already has 8 sibling error classes that all map to
  `400` (`ExtensionNoPermitidaError`, `BancoNoReconocidoError`, `EstructuraInvalidaError`,
  `NormalizacionInvalidaError`, `PdfInvalidoError`, `PdfSinTextoError`,
  `EstructuraPdfInvalidaError`, `RangoFechasInvalidoError`) and are mapped by one `instanceof`
  OR-chain in `aHttpError` (`ingesta.routes.ts`). Merging into one class with a `motivo` field would
  invent a second convention for the same problem the repo already solved.
- **DRY skill, applied correctly.** These two rules answer to different authorities and *will*
  diverge: name validity is about user input, bucket assignability is about the global 50/30/20
  taxonomy that ADR-036 froze. Unifying concepts that merely share an HTTP status is the "wrong DRY".
- **A merged class silently loses the `code`.** With `{message, code}` (Q2), one class per
  remediation *is* the code enum. A merged class would need a `motivo` field that maps 1:1 to the
  code anyway — the same information with one more indirection.

**Cost accepted.** 13 small error classes (§5.3). Each is ~8 lines, each is exercised by a real
response path in CA-01/CA-02/CA-05 or the demo gate — none is speculative (YAGNI holds). The mapping
cost is contained by **one** shared `aCatalogoHttpError(error)` translator (§7.4) that owns the
single `const _exhaustive: never = error` guard for the whole family.

### Q4 — `PATCH /api/categorias/:id` body ⇒ **partial (at least one field), not both-required**

**Decision.** `{ nombre?: string; bucket?: string }`, at least one present; neither present ⇒ `400`.
Same rule for `PATCH /api/patrones/:id` (`{ patron?, matchType?, prioridad? }`).

**Rationale — "require both" is not actually simpler, and it is less safe.**

1. **It does not simplify the re-stamp.** §7 of the proposal requires re-stamping *"when and only
   when the bucket actually changes"*. With a required `bucket`, the server must still compare the
   submitted value against stored state to avoid a pointless full-history `updateMany`. Requiring the
   field moves zero logic.
2. **It creates a money-adjacent lost-update hazard.** A client renaming a category has to echo the
   bucket. Echo a stale one and the server silently re-buckets **and re-stamps every historical
   transaction** of that category. That is the single most destructive operation this API exposes,
   triggered by a field the caller never intended to change. Partial bodies make that unreachable.
3. **PATCH is partial by definition** (RFC 5789). "Require all fields" is PUT semantics under a PATCH
   verb.

**Where the "at least one field" rule lives.** In the **Zod schema**, as a `.refine()` — this is a
presence constraint on the request document, i.e. transport shape, which is exactly what the
`buckets.schema.ts` layer-honesty gate allows schemas to own. It therefore produces the generic
`400 BODY_INVALIDO` (§7.2) and needs no 14th domain error.

**Rejected alternatives.** (a) Require both — see above. (b) Sub-resources
(`PATCH /api/categorias/:id/bucket`) — no nested-route precedent in this API, doubles the surface,
and the proposal already rejected nesting for patterns. (c) Treat an empty body as a `200` no-op —
hides client bugs behind a success status.

### Q5 — Categorization path ⇒ **confirmed: carry `categoriaId`**, and the freed `userId` parameter becomes load-bearing

**Decision.** Take the recommended path. `CategorizarTransaccionResult.categoria` becomes
`{ id: string; nombre: string } | null`. Verified against the real blast radius:

| Consumer | Effect of carrying `categoriaId` | Verdict |
|---|---|---|
| `prisma-transaccion-bucket.repository.ts` | **Deletes** `categoria.findMany({where:{userId}})`, the name→id `Map`, and the `throw new Error('categoría … no encontrada')` (≈22 lines, one query, one failure mode) | Strictly better |
| `agrupar-por-categoria-bucket.ts` | Key becomes `categoriaId ?? ' '`; grouping semantics identical (two categories sharing a bucket still group separately, now by id instead of by name) | Neutral |
| `prisma/backfill-categorias.ts` (frozen, D-10) | Writes `categoria?.id ?? null` and **drops the `CATEGORIA_IDS` import entirely** | Strictly better — see below |
| `process-ingesta.use-case.ts` | Pure threading, no change beyond the type | Neutral |

The backfill result is the decisive one. D-10's own docblock warns the script *"must NEVER be
generalized to run for an arbitrary `userId` without re-deriving `categoriaId` through that user's
own catalog … not through `CATEGORIA_IDS`"*. Carrying the id **is** that re-derivation: the id comes
from the matched pattern's own row, which the composite FK proves belongs to the pattern's owner.
The frozen script gets shorter and structurally safer at the same time.

**The fallback is rejected.** Widening the existing name-based path to `string` keeps a name→id
lookup that this very change makes **racy**: names became mutable, so a rename landing between
pattern load and write would resolve nothing and fail an ingesta.

**Consequential decision — do not orphan `userId` in the writer port.** After the lookup is deleted,
`ITransaccionBucketWriter.asignarCategorizacion(userId, ingestaId, …)`'s first parameter has no
remaining use. A parameter that stops being used must either be deleted or made load-bearing.
**Make it load-bearing**: add `account: { userId }` to the `updateMany` `WHERE`, giving a triple lock
`id IN (…) AND ingestaId = ? AND account.userId = ?`. This closes, at the exact statement that stamps
money rows, the residual ADR-036 recorded (*"la FK compuesta cierra el catálogo, no el lado de
`Transaccion.categoriaId` — riesgo residual aceptado"*). Observable behaviour is unchanged (the
ingesta already belongs to that user); the guarantee is not. Cost: one join in one `WHERE`, one
assertion in the adapter spec.

---

## 2. Architecture decisions (ADR-style, D-numbered)

### D-01 — Ownership is the authority; the compiler keeps only the guarantee it can still prove

`foldCategoria` drops the `CATEGORIA_NOMBRES.has()` guard and becomes total over non-null rows:

```ts
export function foldCategoria(
  categoria: { id: string; nombre: string } | null | undefined,
): { id: string; nombre: string } | null
```

The removed check was never the isolation mechanism — the row arrives from a query whose `WHERE`
already carried `userId` (verified in `prisma-movimientos-mes.repository.ts` and
`prisma-detalle-bucket.repository.ts`). Keeping it would make every user-created category vanish from
the dashboard **without an error**: the exact defect ADR-036 D-09 fixed, re-armed through a different
vector. What the compiler still proves is scoped to the template (`CategoriaTemplateNombre`, D-02).

### D-02 — The template keeps a compile-time consistency proof; user data does not get one

`CATEGORIA_TEMPLATE` becomes a literal `as const` list and exports
`CategoriaTemplateNombre = (typeof CATEGORIA_TEMPLATE)[number]['nombre']`. `PATRON_TEMPLATE.categoria`
and `CATEGORIA_IDS` re-key to that union, so the compiler still refuses a template pattern pointing at
a category the template does not define — the one guarantee worth keeping, at zero cost, over data
this repo authors. User-authored names get no compile-time story by definition; their integrity comes
from `NOT NULL bucketId` + `@@unique([userId, nombre])` + the composite FK.

`CATEGORIA_TEMPLATE` currently derives `bucketId` via `BUCKET_IDS[CATEGORIA_BUCKET[c]]`. After the
enum dies the literal list carries `bucket: Bucket` and resolves `BUCKET_IDS[bucket]` at the two write
sites, or carries `bucketId` directly. **Carry `bucket: Bucket`** and resolve at the write site: it
keeps the template readable as domain vocabulary and keeps `BUCKET_IDS` the single id authority.

### D-03 — `PatronClasificacion` nests its category; bucket is a projection, never a sibling

```ts
interface PatronClasificacionProps {
  readonly id: string;
  readonly patron: string;
  readonly matchType: MatchType;
  readonly categoria: { id: string; nombre: string; bucket: Bucket }; // nested
  readonly prioridad: number;
}
get bucket(): Bucket { return this.categoria.bucket; }
```

The nesting *is* the invariant. CAT-02 ("bucket is DERIVED from the category, never accepted
independently") is today held by a name-keyed lookup; a loose sibling `bucket` field would let a
caller pass a mismatched pair and silently corrupt the 50/30/20 math. Nested, the sentence "the bucket
comes from the category" stays true at the type level.

`coincide()` — including the REGEX `try/catch` that satisfies **CA-05** — is **untouched**. This is a
guardrail: the write-time regex check (§5.2) is an *earlier, friendlier* gate, never a replacement.

Single production construction site: `PrismaCatalogoClasificacionRepository`, whose `include` widens
to `{ categoria: { include: { bucket: true } } }`. Its spec asserts the nesting.

### D-04 — Two ports, grained by resource; the demo rule is a required input, not a middleware

`ICategoriaRepository` and `IPatronRepository` (`application/ports/`), both backed by one Prisma
adapter each. Not one god port (ISP), not seven single-method ports (fragmentation, not segregation).
Mirrors `IIngestaRepository` / `ISessionRepository`.

The demo rule stays in `application`: `esDemo: boolean` is a **required, non-optional** field on every
mutation use case input, so a route that forgets to thread it **fails to compile** instead of
defaulting to permissive.

**Rejected:** a `demoGuardMiddleware` on the catalog router. DRY-er per route, but it puts a business
rule in HTTP infrastructure, is unit-testable only through HTTP, and is forgettable exactly when it
matters — the day a second catalog router appears.

### D-05 — The demo guard is duplicated on purpose (KISS over DRY)

Each of the 6 mutation use cases starts with:

```ts
if (input.esDemo) return Result.fail(new CatalogoDemoSoloLecturaError());
```

Six identical two-line guards crosses the DRY "three strikes" threshold, and extraction was
considered. It is **rejected**: a shared `verificarCatalogoEditable(): Result<void, E>` helper does
not compose cleanly with each use case's own error union (the caller must re-wrap anyway), so the
indirection buys a re-wrap, not a deletion. The *knowledge* — which sessions may edit the catalog —
stays single-sourced in the error class and in the required input field; only the two-line expression
repeats. This is the KISS skill's explicit allowance ("a veces duplicar 3 líneas es más simple").

### D-06 — Delete evaluates "in use" **inside** the write statement, not before it

The in-use rule is evaluated by the adapter, inside the deleting statement's own `WHERE`:

```
tx.patronClasificacion.deleteMany({ where: { categoriaId, userId } })
tx.categoria.deleteMany({ where: { id, userId, transacciones: { none: {} } } })
  → count === 0 ⇒ throw a rollback sentinel (patterns must survive a refusal)
```

both inside one interactive `$transaction`; on `count === 0` a follow-up `userId`-scoped `findUnique`
outside the transaction distinguishes `404` (absent/not yours) from `409` (in use).

**Why not "use case asks, then use case deletes".** That is a genuine TOCTOU: a concurrent ingesta can
categorize into the category between the two calls, and `onDelete: SetNull` then leaves a transaction
with a stale `bucketId` and no category — a silently lost categorization on a money row.

**Honest limit, correcting the proposal's §8 wording.** Wrapping check-and-delete in a `$transaction`
alone does **not** close that race under Postgres READ COMMITTED — a row committed by a concurrent
writer between the count and the delete is still visible to the delete's FK action. What closes it is
putting the predicate **in the deleting statement** (`transacciones: { none: {} }` compiles to a
`NOT EXISTS` subquery evaluated atomically with the delete). The `$transaction` is there for a
different reason: to make "delete the patterns, then the category" all-or-nothing so a refusal never
costs the user their patterns. Both reasons must be stated, because they are different guarantees.

The relation filter is **deliberately not scoped by user**: any `Transaccion` row pointing at the
category — even a hypothetical cross-tenant stray — blocks the delete. Refusing is the safe side.

Port shape follows the `PrismaReclasificarCategoriaRepository` precedent: the adapter returns
`Result<void, CategoriaNoEncontradaError | CategoriaEnUsoError>`; the *rule* is named by a domain
error even though it is *evaluated* next to the write.

### D-07 — A bucket change re-stamps history, and the patch's shape is what triggers it

`Transaccion.bucketId` is denormalized and written atomically with `categoriaId` precisely so the two
can never disagree. Re-bucketing without re-stamping would leave the 50/30/20 percentages and the
semáforo disagreeing with the category list, with nothing flagging it.

**Mechanism, chosen to avoid a boolean flag:** the use case includes `bucketId` in the patch **only
when it actually changed**; the port documents that *`bucketId` present ⇒ the adapter MUST re-stamp in
the same transaction*. One rule, expressed by the shape of the patch, no `reStamp: boolean` parameter
whose two call sites would need their own tests.

```
prisma.$transaction([
  categoria.update({ where: { id }, data: patch }),
  transaccion.updateMany({
    where: { categoriaId: id, account: { userId } },   // RNF-SEC-006 in SQL
    data: { bucketId: nuevoBucketId },
  }),
])
```

Array form (not interactive): the two statements have no interdependent reads. The use case already
loaded the current row for the `404` and the duplicate-name check, so the comparison costs nothing
extra.

**Rejected:** forbid bucket edits (rename-only). Cheaper, but strands any user who picks the wrong
bucket at creation behind a delete-and-recreate that destroys their patterns.

### D-08 — ADR-036 precondition 2 is *strengthened*, and the listing exposes the same order

The tie-break stays `(prioridad, patron, id)` — total and user-independent. Because `patron` becomes
unique per user (§5.2), the `id` term can no longer decide the outcome *inside one user's catalog*,
which is exactly where cuid ids would have made ordering arbitrary. Default `prioridad = 100` sits
above every template priority (max 25), so a new user pattern never silently outranks the curated
Chilean rules unless the user deliberately lowers it. Duplicate `prioridad` values stay legal and
deterministic.

`GET /api/categorias` returns patterns ordered by the **same** `(prioridad, patron, id)`, so the UI
shows the real resolution order. That tie-break knowledge now exists in two representations (an
in-memory comparator in `CategorizarTransaccionUseCase`, a Prisma `orderBy` in the listing adapter).
They are **not** extracted into a shared abstraction: two occurrences is below the three-strikes
threshold, and the two representations are structurally different (comparator over VOs vs. SQL
ordering). Instead: a cross-reference comment in both, and a test on each side pinning the same order.
The categorization tie-break spec is a **guardrail — it must not be weakened by this change**.

### D-09 — New routes validate at the boundary with `.safeParse()`; existing ones stay contract-only

Pre-existing write endpoints are registered in `openapi-document.ts` as *contract-only* (documented,
not enforced) to avoid changing legacy behaviour. New endpoints have no legacy behaviour to preserve,
so they **do** run `.safeParse()` at the boundary. Failure ⇒ `400 { message: 'Cuerpo de la petición
inválido.', code: 'BODY_INVALIDO' }` — a fixed, scrubbed message that **never echoes Zod's issue list
or any submitted value** (the issue list contains the raw input; echoing it would breach the scrubbing
convention that already governs amounts and auth).

Request bodies are `.strict()`. A typo'd or unsupported field (notably `categoriaId` on
`PATCH /api/patrones/:id`, which is a non-goal) must fail loudly rather than be silently ignored.
This surfaces in the contract as `additionalProperties: false`.

### D-10 — Composition follows the `crearAuth` pattern, not a 7-line container append

`composition/crear-catalogo.ts` returns a `CatalogoGraph` (7 use cases, 2 adapters wired inside);
`container.ts` gains one field, `readonly catalogo: CatalogoGraph`, and one `crearCatalogo(prisma)`
call. Mirrors `crearAuth` / `crearAuthGoogle` / `crearProcessIngesta` and keeps `container.ts`
readable, which is its stated purpose.

---

## 3. Data flow

### 3.1 Read — `GET /api/categorias`

```
apiKeyMiddleware → sessionMiddleware (req.userId, req.esDemo)
  → registrarCategorias GET handler
    → ListarCatalogoUseCase.execute({ userId })
      → ICategoriaRepository.listarConPatrones(userId)
        → prisma.categoria.findMany({
            where: { userId },                                  // RNF-SEC-006
            include: { bucket: true, patrones: true },
            orderBy: { nombre: 'asc' },
          })                                                    // patterns re-ordered per D-08
    → aCatalogoDto(...) → 200
```

No fold, no name validation: rows returned by a `userId`-scoped query are valid by construction (D-01).

### 3.2 Write — `PATCH /api/categorias/:id` with a bucket change

```
route .safeParse(body) → { nombre?, bucket? }
  → ActualizarCategoriaUseCase.execute({ userId, esDemo, id, nombre?, bucket? })
     1. esDemo ⇒ 403 CatalogoDemoSoloLecturaError                      (D-05)
     2. repo.buscarPorId(userId, id) → null ⇒ 404 CategoriaNoEncontradaError
     3. nombre? ⇒ trim + length ⇒ NombreCategoriaInvalidoError (400)
                ⇒ case-insensitive uniqueness excluding self ⇒ NombreCategoriaDuplicadoError (409)
     4. bucket? ⇒ assignable? ⇒ BucketNoAsignableError (400)
     5. patch = { nombre?, bucketId? }  // bucketId included ONLY if it changed (D-07)
     6. repo.actualizar(userId, id, patch)  → $transaction[update, restamp?]
  → aCategoriaDto → 200
```

### 3.3 Categorization write path after Q5

```
ProcessIngestaUseCase.runCategorizacion(ingestaId, userId)
  → ICatalogoClasificacion.findAll(userId)      // include categoria.bucket now (D-03)
  → CategorizarTransaccionUseCase.execute(tx, patrones)
       → { categoria: { id, nombre } | null, bucket }
  → ITransaccionBucketWriter.asignarCategorizacion(userId, ingestaId, [{ transaccionId, categoriaId, bucket }])
       → agruparPorCategoriaBucket (keys on categoriaId)
       → one updateMany per group inside $transaction,
         WHERE id IN (…) AND ingestaId = ? AND account.userId = ?      // triple lock (Q5)
```

`nombre` survives in the result solely for logging (`logDecision` already logs the category name and
must keep doing so — it is configuration vocabulary, never transaction data, per ADR-013).

### 3.4 Demo flag propagation

```
Session lookup (one query, no extra round trip):
  prisma.session.findUnique({
    where: { tokenHash },
    select: { userId: true, expiresAt: true, user: { select: { esDemo: true } } },
  })
→ SesionPersistida gains esDemo
→ ValidarSesionResult gains esDemo
→ sessionMiddleware writes req.esDemo alongside req.userId
→ each mutation route threads req.esDemo! into the use case input
```

Cost: one to-one join on an already-unique lookup, on every authenticated request. Measured against
the alternative (a second query per mutation) this is the cheaper side; it is noted, not optimized.

### 3.5 Frozen backfill script

`prisma/backfill-categorias.ts` writes `categoriaId: categoria?.id ?? null` and **drops the
`CATEGORIA_IDS` import**. Its `BackfillClient` include widens to
`{ categoria: { include: { bucket: true } } }` to build the nested VO. It stays frozen and pinned to
`USER_ID_FIJO` on both the read and the write side (D-10 of ADR-036, including the hardening from PR
#301). **This is more than the "mechanical import fix" the proposal predicted** — see §4.4.

---

## 4. Module and layer map

Layer rule (ADR-005) holds throughout: no new `domain → application → infrastructure` edge is
created; `domain` gains only VOs and error classes, `application` gains only ports and use cases.

### 4.1 `domain/`

| File | Action | Contract |
|---|---|---|
| `value-objects/categoria.ts` | **Deleted** | `Categoria`, `CATEGORIA_BUCKET`, `bucketDeCategoria` disappear from `domain/`; `tsc` enumerates all 41 referencing files |
| `value-objects/patron-clasificacion.ts` | Modified | Nested `categoria: {id, nombre, bucket}`; `get bucket()` projects it; `coincide()` byte-identical |
| `value-objects/bucket.ts` | **Unchanged** | Bucket stays the global fixed taxonomy (ADR-036) |
| `errors/categoria-invalida.error.ts` | **Deleted** | Its enumerated message dies with it (D-09 tactic) |
| `errors/*` | New ×13 | §5.3 |

### 4.2 `application/`

| File | Action | Contract |
|---|---|---|
| `ports/categoria-repository.port.ts` | New | §5.4 |
| `ports/patron-repository.port.ts` | New | §5.4 |
| `ports/session-repository.port.ts` | Modified | `SesionPersistida.esDemo: boolean` |
| `ports/transaccion-bucket-writer.port.ts` | Modified | `categoriaId: string \| null` in the assignment tuple; `userId` retained and now load-bearing (Q5) |
| `ports/reclasificar-categoria.port.ts` | Modified | `reasignar(userId, transaccionId, nombre)` — the writer resolves and returns both `categoriaId` and `bucket`; error union gains `CategoriaDesconocidaError` |
| `ports/movimientos-mes.port.ts`, `ports/detalle-bucket.port.ts` | Modified | `categoria.nombre: string` |
| `use-cases/listar-catalogo.use-case.ts` | New | Read; **no** `esDemo` |
| `use-cases/{crear,actualizar,eliminar}-categoria.use-case.ts` | New ×3 | Mutations; `esDemo` required |
| `use-cases/{crear,actualizar,eliminar}-patron.use-case.ts` | New ×3 | Mutations; `esDemo` required |
| `use-cases/categorizar-transaccion.use-case.ts` | Modified | Result carries `{id, nombre}`; **tie-break sort untouched** |
| `use-cases/reclasificar-transaccion.use-case.ts` | Modified | Drops `CATEGORIAS_VALIDAS` + `CATEGORIA_BUCKET`; shrinks to delegation + error mapping |
| `use-cases/validar-sesion.use-case.ts` | Modified | `ValidarSesionResult.esDemo` |
| `services/agrupar-por-categoria-bucket.ts` | Modified | Keys on `categoriaId` |

### 4.3 `infrastructure/`

| File | Action | Contract |
|---|---|---|
| `persistence/catalogo-template.ts` | Modified | Literal `as const` list + `CategoriaTemplateNombre`; `copiarCatalogoTemplate` contract (caller owns the transaction, throws, non-idempotent) **unchanged** |
| `persistence/categoria-ids.ts` | Modified | Re-keyed to `CategoriaTemplateNombre`; still seed/migration-only |
| `persistence/fold-categoria.ts` | Modified | D-01 |
| `persistence/prisma-catalogo-clasificacion.repository.ts` | Modified | `include: { categoria: { include: { bucket: true } } }`; builds the nested VO |
| `persistence/prisma-transaccion-bucket.repository.ts` | Modified | Writes the given `categoriaId`; lookup+map+throw deleted; triple-lock `WHERE` |
| `persistence/prisma-reclasificar-categoria.repository.ts` | Modified | Resolves `(userId, nombre)` → returns id **and** bucket; missing row ⇒ `Result.fail(CategoriaDesconocidaError)` instead of `throw` |
| `persistence/prisma-categoria.repository.ts` | New | List/create/update/delete, `userId` in every `WHERE`, D-06 + D-07 transactions |
| `persistence/prisma-patron.repository.ts` | New | Create/update/delete, `userId` in every `WHERE` |
| `persistence/prisma-session.repository.ts` | Modified | Selects `user: { select: { esDemo: true } }` |
| `http-express/routes/categorias.routes.ts` | New | `registrarCategorias(router, catalogo)` |
| `http-express/routes/patrones.routes.ts` | New | `registrarPatrones(router, catalogo)` |
| `http-express/routes/transacciones.routes.ts` | Modified | Maps `CategoriaDesconocidaError` → 400 with a non-enumerating message |
| `http-express/middleware/session.middleware.ts` | Modified | Writes `req.esDemo` |
| `http-express/schemas/{categorias,patrones,catalogo-error}.schema.ts` | New ×3 | §7.2/§7.3 |
| `http-express/schemas/openapi-document.ts` | Modified | 4 paths **appended** (never reordered) |
| `http/dto/{catalogo,categoria,patron}.dto.ts` | New | Mappers + sync specs |
| `http/auth/express-request.d.ts` | Modified | `esDemo?: boolean` |
| `composition/crear-catalogo.ts` | New | D-10 |
| `composition/container.ts` | Modified | One field, one call |
| `http-express/app.ts` | Modified | Two `registrar*` calls on `protectedApi` |
| `prisma/backfill-categorias.ts` | Modified | §3.5 — **more than an import fix** |
| `prisma/seed.ts` | Modified | Template typing follow-through |
| `prisma/schema.prisma` + migrations | **Unchanged** | Confirmed: `userId`, `bucketId`, `@@unique([userId, nombre])`, `@@unique([id, userId])`, composite FK and `onDelete: SetNull` all already exist |
| `apps/web/**`, `apps/mobile/**` | **Unchanged** | Additive contract; `pnpm web test` is a verification step |

### 4.4 Corrections to the proposal's Affected Areas table

Three divergences found by reading the code. All are cost-increasing; none changes scope.

1. **`express-request.d.ts` is at `infrastructure/http/auth/express-request.d.ts`**, not
   `http-express/`. (It is one of the framework-agnostic `http/` survivors of ADR-028.)
2. **`prisma/backfill-categorias.ts` needs more than a mechanical import fix.** Because the VO now
   nests `bucket`, the script's hand-written `BackfillClient` interface must widen its `include` to
   fetch `categoria.bucket`, which also touches `backfill-categorias.spec.ts`'s fake client and
   `backfill-categorias.int-spec.ts`. The write side simultaneously *simplifies* (drops
   `CATEGORIA_IDS`). Net: still small, but it is a real edit to a frozen script and its two test
   files — the tasks phase must budget it.
3. **`prisma-catalogo-clasificacion.repository.ts` must widen its `include`**, not just "build the
   nested VO": it currently loads `include: { categoria: true }`, which returns `bucketId` but not the
   bucket's `nombre`. `{ categoria: { include: { bucket: true } } }` is required for the VO's
   `bucket: Bucket`. Same for the backfill script.

Additionally, `seed.ts` and `seed-catalog.spec.ts` are affected (they consume the template types) and
were not listed.

---

## 5. Contracts

### 5.1 Use case contracts

All return `Promise<Result<T, E>>`; none throws; Spanish names; `esDemo` required on mutations.

| Use case | Input | Ok | Error union |
|---|---|---|---|
| `ListarCatalogoUseCase` | `{ userId }` | `CategoriaConPatrones[]` | `never` |
| `CrearCategoriaUseCase` | `{ userId, esDemo, nombre, bucket }` | `CategoriaConPatrones` | `CatalogoDemoSoloLecturaError \| NombreCategoriaInvalidoError \| BucketNoAsignableError \| NombreCategoriaDuplicadoError` |
| `ActualizarCategoriaUseCase` | `{ userId, esDemo, id, nombre?, bucket? }` | `CategoriaConPatrones` | + `CategoriaNoEncontradaError` |
| `EliminarCategoriaUseCase` | `{ userId, esDemo, id }` | `void` | `CatalogoDemoSoloLecturaError \| CategoriaNoEncontradaError \| CategoriaEnUsoError` |
| `CrearPatronUseCase` | `{ userId, esDemo, categoriaId, patron, matchType, prioridad? }` | `Patron` | `CatalogoDemoSoloLecturaError \| CategoriaNoEncontradaError \| PatronInvalidoError \| MatchTypeInvalidoError \| RegexInvalidaError \| PrioridadInvalidaError \| PatronDuplicadoError` |
| `ActualizarPatronUseCase` | `{ userId, esDemo, id, patron?, matchType?, prioridad? }` | `Patron` | `CatalogoDemoSoloLecturaError \| PatronNoEncontradoError \| PatronInvalidoError \| MatchTypeInvalidoError \| RegexInvalidaError \| PrioridadInvalidaError \| PatronDuplicadoError` |
| `EliminarPatronUseCase` | `{ userId, esDemo, id }` | `void` | `CatalogoDemoSoloLecturaError \| PatronNoEncontradoError` |

`CategoriaConPatrones = { id, nombre, bucket: Bucket, patrones: Patron[] }`;
`Patron = { id, categoriaId, patron, matchType: MatchType, prioridad: number }`.

`bucket` travels as a **name**, resolved to `BUCKET_IDS[bucket]` in infrastructure. `Ingreso` and
`SinCategoria` are computed states and are **not assignable** — naming them yields the same `400` as a
missing bucket (**CA-01**).

### 5.2 Validation rules (all in the use case, none in Zod beyond shape)

| Field | Rule | Error on violation |
|---|---|---|
| `nombre` | trim; 1–40 chars; stored **as typed** | `NombreCategoriaInvalidoError` (400) |
| `nombre` uniqueness | per user, **case-insensitive**; on PATCH excludes self | `NombreCategoriaDuplicadoError` (409) |
| `bucket` | required on create; ∈ `{Necesidades, Deseos, Ahorro}` | `BucketNoAsignableError` (400) |
| `patron` | trim; 1–200 chars | `PatronInvalidoError` (400) |
| `patron` uniqueness | per user, **case-insensitive** | `PatronDuplicadoError` (409) |
| `matchType` | ∈ `{CONTAINS, STARTS_WITH, REGEX}` — first write path in the repo that validates it | `MatchTypeInvalidoError` (400) |
| `patron` when `matchType = REGEX` | `new RegExp(patron)` must compile | `RegexInvalidaError` (400) |
| `prioridad` | optional integer `1..999`, **default 100** | `PrioridadInvalidaError` (400) |

**Enum-membership checks belong in the use case, not the schema.** This is not a preference — it is
the documented `buckets.schema.ts` gate: *"the valid-bucket enum check is a DOMAIN rule … and MUST NOT
be duplicated here"*. Therefore `bucket` and `matchType` are `z.string()` in Zod, and lengths/ranges
are use-case rules too (mirroring `resumen.schema.ts`, where the `YYYY-MM` format is a domain rule).

**MUST-VERIFY before relying on case-insensitive SQL uniqueness.** The rule is implemented as a
`userId`-scoped `findFirst({ where: { userId, nombre: { equals: n, mode: 'insensitive' } } })`.
Prisma's insensitive `equals` on PostgreSQL is implemented with `ILIKE`, whose wildcards are `%` and
`_`. If the value is not escaped by the driver, a name or pattern containing `%`/`_` (entirely
plausible in a REGEX pattern) would match too broadly and produce a **false 409**. The tasks phase
MUST include an integration test creating `a_b` and then `axb` and asserting the second is accepted.
**Trigger-gated fallback if that test fails:** compare in memory over the `userId`-scoped fetch of
that user's 8–30 names using `toLocaleLowerCase()`. This does **not** breach RNF-SEC-006 — that rule
governs *tenant isolation* (the `WHERE` still carries `userId`), not where a business comparison is
evaluated.

**Accepted race, unchanged from the proposal:** two concurrent creates of `Mascotas`/`mascotas` can
both pass the check because the DB unique index is case-*sensitive*. Degrades to two similarly-named
categories, never corruption. A `citext`/functional-index migration is the trigger-gated fix.

### 5.3 Error family (13 classes, one status each)

| Error | Status | `code` | Notes |
|---|---|---|---|
| `NombreCategoriaInvalidoError` | 400 | `NOMBRE_INVALIDO` | |
| `BucketNoAsignableError` | 400 | `BUCKET_NO_ASIGNABLE` | Covers missing, unknown, `Ingreso`, `SinCategoria` |
| `PatronInvalidoError` | 400 | `PATRON_INVALIDO` | Text shape |
| `MatchTypeInvalidoError` | 400 | `MATCH_TYPE_INVALIDO` | |
| `RegexInvalidaError` | 400 | `REGEX_INVALIDA` | Write-time gate only (CA-05) |
| `PrioridadInvalidaError` | 400 | `PRIORIDAD_INVALIDA` | |
| `CategoriaDesconocidaError` | 400 | `CATEGORIA_DESCONOCIDA` | A **name in a body** that does not resolve (reclassify). Enumerates nothing |
| `CatalogoDemoSoloLecturaError` | 403 | `DEMO_SOLO_LECTURA` | |
| `CategoriaNoEncontradaError` | 404 | `CATEGORIA_NO_ENCONTRADA` | An **addressed/referenced category resource**; merges "absent" and "not yours" |
| `PatronNoEncontradoError` | 404 | `PATRON_NO_ENCONTRADO` | Same merge |
| `NombreCategoriaDuplicadoError` | 409 | `NOMBRE_DUPLICADO` | |
| `PatronDuplicadoError` | 409 | `PATRON_DUPLICADO` | |
| `CategoriaEnUsoError` | 409 | `CATEGORIA_EN_USO` | Message points at reassigning first; **the migration flow is US-039** |

**Why `CategoriaDesconocidaError` exists separately from `CategoriaNoEncontradaError`.** The invariant
"each error maps to exactly one status" would break if one class had to be `404` on
`/api/categorias/:id` and `400` on `PATCH /api/transacciones/:id/categoria` (where a `404` would be
ambiguous with "transaction not found"). Two classes, two meanings, two statuses — the invariant holds
and the exhaustive switch keeps working.

`CatalogoDemoSoloLecturaError`'s message is the UX family of `DemoUploadNudge.tsx`: *"Las categorías
de la cuenta demo son de solo lectura. Creá una cuenta para personalizar tu catálogo."*

### 5.4 Port signatures

```ts
interface ICategoriaRepository {
  listarConPatrones(userId: string): Promise<CategoriaConPatrones[]>;
  buscarPorId(userId: string, id: string): Promise<CategoriaConPatrones | null>;
  /** Case-insensitive, userId-scoped; `excluirId` supports PATCH self-exclusion. */
  existeNombre(userId: string, nombre: string, excluirId?: string): Promise<boolean>;
  crear(userId: string, data: { nombre: string; bucketId: string }): Promise<CategoriaConPatrones>;
  /** `bucketId` present ⇒ MUST re-stamp Transaccion.bucketId in the same transaction (D-07). */
  actualizar(userId: string, id: string,
             patch: { nombre?: string; bucketId?: string }): Promise<CategoriaConPatrones>;
  /** Patterns cascade; refusal is atomic with the in-use predicate (D-06). */
  eliminar(userId: string, id: string):
    Promise<Result<void, CategoriaNoEncontradaError | CategoriaEnUsoError>>;
}

interface IPatronRepository {
  buscarPorId(userId: string, id: string): Promise<Patron | null>;
  existePatron(userId: string, patron: string, excluirId?: string): Promise<boolean>;
  crear(userId: string, data: { categoriaId: string; patron: string;
                                matchType: MatchType; prioridad: number }): Promise<Patron>;
  actualizar(userId: string, id: string,
             patch: { patron?: string; matchType?: MatchType; prioridad?: number }): Promise<Patron>;
  eliminar(userId: string, id: string): Promise<boolean>;  // false ⇒ absent or not owned
}
```

Every method takes `userId` as a **method parameter**, never constructor state — repositories are
request-shared singletons and must stay tenant-stateless (ADR-036 D-03).

`crear` on `IPatronRepository` relies on the composite FK `(categoriaId, userId) → Categoria(id,
userId)` for cross-tenant refusal at the database level; the use case still checks ownership first so
the client gets a clean `404` instead of a `500`.

---

## 6. Transactional boundaries — summary

| Operation | Boundary | Why |
|---|---|---|
| `POST /api/categorias` | None (check, then insert) | Nothing to make atomic; the check→insert race is benign (two similar names) and is not preventable at READ COMMITTED anyway |
| `PATCH /api/categorias/:id` **without** bucket change | Single `update` | — |
| `PATCH /api/categorias/:id` **with** bucket change | `$transaction([update, updateMany])` (array form) | The two columns of the CAT-02 invariant must move together |
| `DELETE /api/categorias/:id` | Interactive `$transaction`, predicate inside the delete statement | Patterns must survive a refusal (transaction); the in-use rule must be atomic with the delete (predicate) — two distinct guarantees, D-06 |
| `POST/PATCH/DELETE /api/patrones` | None | Single-row writes |
| Ingesta categorization | Existing `$transaction` over grouped `updateMany`s | Unchanged, plus the triple-lock `WHERE` |

The asymmetry between create (no transaction) and delete (transaction + atomic predicate) is
principled, not arbitrary: create's worst case is cosmetic, delete's worst case touches money rows.

---

## 7. HTTP surface

### 7.1 Routes

| Method | Path | Success | Errors |
|---|---|---|---|
| `GET` | `/api/categorias` | 200 | 401 |
| `POST` | `/api/categorias` | 201 | 400, 403, 409 |
| `PATCH` | `/api/categorias/:id` | 200 | 400, 403, 404, 409 |
| `DELETE` | `/api/categorias/:id` | 204 | 403, 404, 409 |
| `POST` | `/api/patrones` | 201 | 400, 403, 404, 409 |
| `PATCH` | `/api/patrones/:id` | 200 | 400, 403, 404, 409 |
| `DELETE` | `/api/patrones/:id` | 204 | 403, 404 |

Flat resources, one `registrar*` function per resource, closure-DI, mounted on `protectedApi` in
`app.ts` (so `apiKeyMiddleware` + `sessionMiddleware` both apply — **CA-04**). No nested
`/categorias/:id/patrones`: no nested-resource precedent exists in this API, and a nested create buys
nothing the ownership check must do anyway.

`404` merges "does not exist" and "is not yours" — the anti-enumeration rule already used by
`IngestaNoEncontradaError` / `TransaccionNoEncontradaError`.

**Response bodies.** One `CategoriaDto` shape is reused by the `GET` list entries, `POST` 201 and
`PATCH` 200 (`{ id, nombre, bucket, patrones: [...] }` — `patrones: []` on create, which is how
**CA-03** is observable). One `PatronDto` shape (`{ id, categoriaId, patron, matchType, prioridad }`)
is reused by the nested list entries and by the pattern write responses; `categoriaId` is redundant
when nested and is kept anyway so there is exactly one pattern shape (one schema, one mapper, one sync
spec). `DELETE` returns `204` with no body.

### 7.2 Zod schemas — transport shape only

`categorias.schema.ts`, `patrones.schema.ts`. Bodies are `.strict()` (D-09); PATCH bodies carry a
`.refine()` for "at least one field" (Q4). Path params are `z.object({ id: z.string() })`. Types and
presence only — no enums, no lengths, no ranges (§5.2).

Boundary behaviour: new routes call `.safeParse()`; failure ⇒ `400 { message: 'Cuerpo de la petición
inválido.', code: 'BODY_INVALIDO' }`, never echoing the issue list.

### 7.3 `openapi.json` and `types.gen.ts`

- `catalogo-error.schema.ts` exports `catalogoErrorResponseSchema` (`{ message: string, code: string }`,
  `meta.id: 'CatalogoErrorResponse'`), referenced by every non-2xx of the 4 new paths. **Boundary:**
  existing operations keep description-only error responses; this schema is not retrofitted (Q2).
- Registration in `openapi-document.ts` **appends** to the fixed-order `paths` object:
  `'/api/categorias'` (get, post), `'/api/categorias/{id}'` (patch, delete), `'/api/patrones'` (post),
  `'/api/patrones/{id}'` (patch, delete). **Never reorder existing entries** — the order is part of
  the determinism contract that keeps `openapi:check` diffing only genuine changes.
- Regeneration: `pnpm api openapi:emit` → commit `apps/api/openapi.json`; `pnpm api-client generate`
  → commit `packages/api-client/src/types.gen.ts`. Both are already CI gates (`ci.yml:185`
  `pnpm api openapi:check`; the `api-client` job at `ci.yml:482-504` regenerates and runs
  `git diff --exit-code`) — verified in the workflow, not assumed.
- Amounts are absent from this surface entirely, so the BigInt-as-string rule (**CA-06**) is satisfied
  vacuously; the sync specs still assert no numeric money field appears.

### 7.4 Error mapping

One shared translator, `aCatalogoHttpError(error): { status, code, message }`, used by both routers —
the single site of the `const _exhaustive: never = error` guard for the 13-class family. Adding a
variant without mapping it **fails compilation** rather than falling through to a wrong status. This
mirrors `aHttpError` in `ingesta.routes.ts`.

`transacciones.routes.ts` keeps its own inline switch (2 variants) and loses the hardcoded
8-name message, which is replaced by *"La categoría indicada no existe en tu catálogo."*

---

## 8. Testing strategy (strict TDD)

Test-first, per slice, per layer: a failing unit spec precedes every production edit. Runner: `pnpm
api test` (Vitest, Oxc transform). Integration: `pnpm api test:integration` — requires a real
Postgres (`apps/api/docs/local-test-db.md` locally, the ephemeral CI DB per PR #149,
`ALLOW_DESTRUCTIVE_DB=1`).

### 8.1 Unit — target file → assertions

| Target | Assertions |
|---|---|
| `patron-clasificacion.spec.ts` | Nested category accepted; `bucket` getter projects `categoria.bucket`; **`coincide()` behaviour byte-identical, including malformed-REGEX ⇒ `false`** (CA-05 guardrail) |
| `fold-categoria.spec.ts` | `null`/`undefined` ⇒ `null`; **an arbitrary owned name passes through verbatim** (the inverted test); ids are the row's real ids |
| `catalogo-template.spec.ts` | 8 literal categories pinned by name+bucket; 20 patterns; every `PATRON_TEMPLATE.categoria` ∈ template names; `CATEGORIA_IDS` keys ≡ template names |
| `categorizar-transaccion.use-case.spec.ts` | Result carries `{id, nombre}`; Ingreso rule unchanged; **`(prioridad, patron, id)` tie-break unchanged** (ADR-036 precondition 2 guardrail) |
| `agrupar-por-categoria-bucket.spec.ts` | Keys on `categoriaId`; two categories sharing a bucket still group separately; `null` groups |
| `prisma-transaccion-bucket.repository.spec.ts` | Writes the handed `categoriaId`; **no `categoria.findMany` is issued**; `WHERE` contains `id IN`, `ingestaId` **and** `account.userId` |
| `prisma-catalogo-clasificacion.repository.spec.ts` | `include` fetches `categoria.bucket`; VO nesting built correctly |
| `prisma-reclasificar-categoria.repository.spec.ts` | Resolves `(userId, nombre)`; returns real id **and** bucket; missing row ⇒ `Result.fail(CategoriaDesconocidaError)` (no longer a throw) |
| `reclasificar-transaccion.use-case.spec.ts` | Delegates without enum gating; maps `CategoriaDesconocidaError` |
| `validar-sesion.use-case.spec.ts`, `prisma-session.repository.spec.ts`, `session.middleware.spec.ts` | `esDemo` flows through; `select` includes `user.esDemo`; `req.esDemo` written |
| `{crear,actualizar,eliminar}-categoria.use-case.spec.ts` | Demo gate first (before any repo call — assert the repo fake was **not** called); each validation rule → its own error; PATCH partial (nombre-only, bucket-only); **`bucketId` omitted from the patch when the bucket did not change** (D-07); self-exclusion on uniqueness |
| `{crear,actualizar,eliminar}-patron.use-case.spec.ts` | Demo gate first; `matchType`/regex/prioridad rules; default `prioridad = 100`; category ownership ⇒ `404` |
| `listar-catalogo.use-case.spec.ts` | No `esDemo` in the input type (compile-level); zero-pattern category returns `patrones: []` (CA-03) |
| `prisma-categoria.repository.spec.ts` | `userId` in every `WHERE`; re-stamp `updateMany` present iff `bucketId` in patch; delete issues patterns-then-category inside a transaction with the `transacciones: { none: {} }` predicate; ordering `(prioridad, patron, id)` on nested patterns |
| `prisma-patron.repository.spec.ts` | `userId` in every `WHERE`; `eliminar` false when count 0 |
| `categorias.routes.spec.ts`, `patrones.routes.spec.ts` | Status per error class; `{message, code}` body; `.safeParse()` failure ⇒ `BODY_INVALIDO` and **no** echo of input; `req.esDemo` threaded |
| `{categorias,patrones}.schema.spec.ts` | Schema ↔ DTO sync (the `buckets.schema.spec.ts` precedent); `.strict()` rejects unknown keys; PATCH refine rejects `{}` |
| `backfill-categorias.spec.ts` | Fake client's widened include; `categoriaId` comes from pattern rows, not `CATEGORIA_IDS` |
| `transacciones.routes.spec.ts` | 400 body no longer enumerates the 8 names |

### 8.2 Integration (real DB)

| Spec | Proves |
|---|---|
| `catalogo-isolation.int-spec.ts` (**extended**, not replaced) | **CA-04**: user B gets `404` — not `403` — when reading, renaming, re-bucketing or deleting user A's category, and when creating/updating/deleting a pattern under A's `categoriaId`. Existing US-037 assertions stay green |
| `catalogo-crud.int-spec.ts` (new) | Create → list → rename → re-bucket → delete round trip; zero-pattern category (**CA-03**); delete-with-patterns-no-transactions ⇒ `204` + patterns gone; delete-in-use ⇒ `409` **and nothing deleted, patterns intact**; case-insensitive duplicate ⇒ `409`; **the `a_b` / `axb` wildcard test** of §5.2 |
| `catalogo-demo-gate.int-spec.ts` (new) | All 6 mutations from an `esDemo` session ⇒ `403` + `DEMO_SOLO_LECTURA`; `GET /api/categorias` still `200` for the same session |
| `catalogo-rebucket.int-spec.ts` (new) | **Bucket integrity end-to-end**: categorize transactions into `Delivery` (Deseos), re-bucket to Necesidades, then assert `/api/resumen` **and** the bucket drill-down both report the new bucket for those historical rows |
| `reclasificar-categoria.int-spec.ts` (modified) | Reclassifying to a user-created category succeeds (binding decision 4); reclassifying to a name absent from the caller's catalog ⇒ clean `400` |
| `categorizacion.int-spec.ts`, `movimientos-mes.int-spec.ts`, `detalle-bucket.int-spec.ts`, `backfill-categorias.int-spec.ts` | Regression under the widened types |

### 8.3 US-037 tests whose meaning changes — and how the guarantee is preserved

| Test | Change | Replacement guarantee |
|---|---|---|
| `fold-categoria.spec.ts` → *"unknown nombre folds to null (defensive)"* | **Inverted** to *"any owned category name passes through"* | The isolation the check never provided is provided — and now proven — by CAT037-05: the extended `catalogo-isolation.int-spec.ts` shows a row can only reach the fold from a `userId`-scoped query. The inversion **is** the point of the test |
| `catalogo-template.spec.ts` → *derived from `Object.values(Categoria)`* | Becomes a **pinning** test over the literal list | Stronger, not weaker: a template edit now requires editing the test, i.e. it must be deliberate. The internal-consistency proof (patterns ⊆ categories) survives at compile time via `CategoriaTemplateNombre` |
| `prisma-transaccion-bucket.repository.spec.ts` → name→id map + "categoría no encontrada" throw | **Deleted** (the code path is gone) | Replaced by "writes the handed id" + the triple-lock `WHERE` assertion — a stronger tenant guarantee than the deleted one |
| `reclasificar-transaccion.use-case.spec.ts` → enum rejection | Becomes delegation + `CategoriaDesconocidaError` mapping | The rejection still happens, one layer down, against the caller's real catalog instead of a global enum |
| `categorizar-transaccion.use-case.spec.ts` tie-break cases | Assertion **shape** changes only | ADR-036 precondition 2 guardrail — **must not be weakened**; the sort itself is untouched |

---

## 9. Delivery — the two-PR seam and PR #1's proof obligation

`feature-branch-chain` (US-037's precedent): PR #1 alone ships no user value, so a tracker branch
accumulates and only it merges to `main`.

### PR #1 — Domain widening (behaviour-preserving for every previously-valid input)

Contents: `ADR-037`; delete `domain/value-objects/categoria.ts` and
`domain/errors/categoria-invalida.error.ts`; add `CategoriaNoEncontradaError` +
`CategoriaDesconocidaError`; `patron-clasificacion.ts`; `catalogo-template.ts`; `categoria-ids.ts`;
`fold-categoria.ts`; `prisma-catalogo-clasificacion.repository.ts`;
`categorizar-transaccion.use-case.ts`; `agrupar-por-categoria-bucket.ts`;
`prisma-transaccion-bucket.repository.ts` + its port; `reclasificar-transaccion.use-case.ts` + its
port + adapter; `transacciones.routes.ts`; `movimientos-mes.port.ts`; `detalle-bucket.port.ts`;
`seed.ts`; `prisma/backfill-categorias.ts`; **all affected specs**.

**Proof obligation — stated precisely, because the proposal's "byte-identical" slogan is not
achievable and pretending otherwise would hide a real behaviour delta:**

1. `pnpm api test`, `pnpm api test:integration`, `pnpm api exec tsc --noEmit`, `pnpm web test` all
   green. **A green suite is the acceptance criterion** for this PR.
2. The **only** `openapi.json` diff is the `description` string of the `400` on
   `PATCH /api/transacciones/{id}/categoria` (it currently names `CategoriaInvalidaError` and "the
   domain enum", both of which cease to exist). **No path, operation, status, or schema changes.**
   `types.gen.ts` is regenerated accordingly. Reviewers verify this by reading the diff, not by
   trusting the claim.
3. **The two intentional behaviour deltas**, both on
   `PATCH /api/transacciones/:id/categoria`, both stated up front:
   (a) the `400` body text changes from the enumerated 8-name message to *"La categoría indicada no
   existe en tu catálogo."*; (b) a category name that is absent from the caller's catalog now returns
   `400` instead of `500` — a path that was previously **unreachable**, because the enum gate rejected
   every name before the adapter's `throw` could fire. Every input that was valid before is still
   valid and still produces the same result.
4. No new endpoint, no `esDemo`, no CRUD.

Independently revertable.

### PR #2 — CRUD surface

`esDemo` threading (session port/adapter/use case/middleware/`express-request.d.ts`); 13 error
classes minus the 2 landed in PR #1; 7 use cases; 2 ports; 2 adapters; 2 routers + the shared
`aCatalogoHttpError`; 3 Zod schemas + `openapi-document.ts`; 3 DTO mappers; `crear-catalogo.ts` +
`container.ts` + `app.ts`; `openapi.json` + `types.gen.ts` regeneration; the 3 new integration specs
and the extended isolation spec.

Revertable only while PR #1 stays; reverting #1 alone breaks compilation.

### Constraints handed to the tasks phase

1. **Both PRs will exceed 400 changed lines.** Generated files (`openapi.json`, `types.gen.ts`)
   dominate PR #2's count and must be flagged to reviewers as read-once, not line-by-line. The tasks
   phase owns the real forecast and the `chained-pr` decision.
2. **PR #1's slice order is compiler-driven, not file-list-driven.** Delete
   `domain/value-objects/categoria.ts` first and let `tsc` enumerate the ~41 referencing files; work
   the red list **by layer** (domain → application → infrastructure → prisma scripts → specs). Do not
   grep. This is ADR-036 D-09's proven tactic applied to a larger surface.
3. **Strict TDD per slice**: a failing spec precedes every production edit, including the inverted and
   deleted tests of §8.3 — an inverted test is written in its new form *first*, red, then made green.
4. **Guardrail tests that must not be weakened**: the `(prioridad, patron, id)` tie-break specs
   (ADR-036 precondition 2) and `coincide()`'s malformed-REGEX ⇒ `false` (CA-05).
5. **`schema.prisma` is not touched.** Any task proposing a migration is out of scope by construction
   and must be escalated, not absorbed.
6. **The §5.2 wildcard verification is a task, not a note.** Its outcome selects between the SQL and
   in-memory uniqueness comparison.
7. **Verify the ADR-036 deployment assumption before apply.** `docs/adr/ADR-036` still carries a
   *"Pendiente antes de producción"* section (task 6.9, the prod-snapshot migration rehearsal), while
   this change's proposal states US-037 is merged **and deployed**. The change SDD is archived at
   `openspec/changes/archive/2026-08-11-us-037-catalogo-per-user/`, which suggests the ADR text is
   stale — but "suggests" is not "verified". Confirm against the deploy notes and, if US-037 is
   deployed, update that ADR-036 section as part of PR #1's documentation.

---

## 10. Residual risks the tasks/apply phases must watch

| Risk | Handling |
|---|---|
| The 41-file compiler cascade of the enum deletion drifts into "fix it to compile" edits that change behaviour | Layer-by-layer slicing + strict TDD; every red file gets its spec updated *before* its source |
| Case-insensitive `ILIKE` wildcard false-positive (§5.2) | Named integration test + trigger-gated in-memory fallback |
| `onDelete: SetNull` residual: if the in-use predicate is ever loosened, a delete silently strips `categoriaId` while `bucketId` survives | The predicate is inside the delete statement (D-06); its adapter spec asserts the `WHERE` shape |
| Re-stamp `updateMany` on a very large history is a single unbounded statement | Bounded by one user's transactions for one category; no pagination today. Recorded, with the trigger "first re-bucket that visibly blocks a request" |
| User-supplied REGEX blocks the single-threaded event loop | 200-char cap + write-time compile check now; `re2`/execution timeout is the deferred fix with an explicit trigger (first slow-ingesta report) |
| `apps/web`'s hardcoded 8-name reclassify `<select>` goes stale after a rename | Accepted and documented (proposal §11): clean `400`, no data damage, closed by US-043 |
| Scope creep into US-039 ("just add reassignment to the delete path") | The `409` is the deliverable; the migration is not. Explicit non-goal, restated in the delete use case's docblock |
| `code` inconsistency between new and old endpoints | Accepted debt with a named trigger (Q2) |
| ADR-036 §"Pendiente antes de producción" staleness | §9 constraint 7 |
