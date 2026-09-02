# Design: Categoría name uniqueness becomes per-bucket

Change: `categoria-unica-por-bucket` · Store: hybrid (Engram topic `sdd/categoria-unica-por-bucket/design`)
Inputs: `proposal.md` (its "Product decisions — locked" table is binding), Engram `sdd/categoria-unica-por-bucket/explore`.
Language: design in English; every quoted UI string is the neutral Spanish that ships. Spanish domain identifiers (`nombre`, `bucket`, `existeNombre`, `NombreCategoriaDuplicadoError`) are code, quoted verbatim, never translated.
`sdd-spec` owns the normative requirement deltas; this document owns the HOW.

---

## 0. Architecture summary

No new layer, no new pattern, no new dependency, no new port. The change is three moves on existing seams:

1. **Identity** — the reclassify write path stops resolving a `Categoria` by `nombre` and starts resolving it by `(id, userId)`, end to end: Zod schema → route → use case → `IReclasificarCategoriaWriter` → Prisma adapter → both clients' local state. This is the load-bearing move; everything else is downstream of it.
2. **Invariant** — the uniqueness key widens from `(userId, nombre)` to `(userId, bucketId, nombre)` in the DB, and `ICategoriaRepository.existeNombre` becomes bucket-scoped so the app-layer gate keeps matching the DB backstop. `ActualizarCategoriaUseCase` closes its bucket-only-PATCH gap in the same slice, because the migration is what arms that latent bug.
3. **Contract** — `openapi.json` and `@moneydiary/api-client` are regenerated from the Zod schemas that already drive them (ADR-011/012). The **response** shape does not change; only the request body.

Layering (ADR-005) holds throughout: `domain ← application ← infrastructure`. `bucket` crosses the port as a validated **name**; only the adapter knows `BUCKET_IDS`. No `Result` is replaced by a throw. No classification or money rule moves into a client (ADR-024) — web and mobile carry an opaque id and render the server's bucket grouping.

---

## 1. Verified facts this design rests on

| # | Fact | Evidence |
|---|---|---|
| F-1 | `Categoria` holds **two** unique keys today: `@@unique([userId, nombre])` and `@@unique([id, userId])` (the composite-FK target for `PatronClasificacion`), plus `@@index([bucketId])`. Only the first changes. | `schema.prisma:149,153,154` |
| F-2 | The reclassify adapter resolves by the generated compound selector `userId_nombre`, then does `updateMany({ where: { id, account: { userId } } })`. The `updateMany` — not the lookup — is what enforces RNF-SEC-006 on the write. | `prisma-reclasificar-categoria.repository.ts:59-62, 69-75` |
| F-3 | `PrismaCategoriaRepository.buscarPorId` already resolves a caller's own categoría with `findFirst({ where: { id, userId } })`. The house precedent for "my own row by id" exists and is not the compound selector. | `prisma-categoria.repository.ts:100-105` |
| F-4 | `ActualizarCategoriaUseCase` already loads the full current row (`actual`) at the top via `buscarPorId`, **before** any field validation. `actual.nombre` and `actual.bucket` are in hand. | `actualizar-categoria.use-case.ts:58-64` |
| F-5 | The uniqueness check runs **only** inside the `input.nombre !== undefined` branch. The `input.bucket !== undefined` branch validates assignability and nothing else. | `actualizar-categoria.use-case.ts:68-98` |
| F-6 | `existeNombre(userId, nombre, excluirId?)` — three `string` positional params, the third optional. `ActualizarCategoriaUseCase` calls it as `existeNombre(userId, nombre, input.id)`. | `categoria-repository.port.ts:42-46`, `actualizar-categoria.use-case.ts:74-78` |
| F-7 | The 200 response is `{ id, categoria: { id, nombre }, bucket }` and **already carries `categoria.id`**. `ReclasificarCategoriaResult` already carries `categoriaId`. | `reclasificar-categoria.dto.ts:23-44`, `reclasificar-categoria.port.ts:15-20` |
| F-8 | `ReclasificarCategoriaDto` is a **generated alias** (`S['TransaccionesCategoriaResponse']`) consumed by BOTH clients — web via `apps/web/src/api/types.ts`, mobile via `apps/mobile/src/domain/detalle.types.ts:5-12`. Mobile hand-writes only the runtime *guard* (`esReclasificarDto`), not the type. | `packages/api-client/src/index.ts:61`, `apps/mobile/src/api/categorias.ts:236-249` |
| F-9 | The web control receives `categoriaActual: string | null` — a **nombre**. Its caller `GrupoMovimientos` has `grupo.categoriaId` and `grupo.nombre` both in hand at the call site. | `ReclasificarCategoriaControl.tsx:83`, `GrupoMovimientos.tsx:111-121` |
| F-10 | The mobile control's `CategoriaActual` prop **already carries `id`** (`{ id, nombre, bucket }`). Its identity logic ignores it and compares `cat.nombre === categoriaActual.nombre`. `cat.id` is used only as a React key. | `ReclasificarMobileControl.tsx:60-64, 311-312, 316` |
| F-11 | `userId_nombre` appears at **12** live call sites: 1 runtime (F-2), 1 mocked-prisma unit assertion, 10 fixture resolutions across 8 `*.int-spec.ts` files, plus 1 index-name assertion in the us037 rehearsal script. | `rg userId_nombre` (see §4) |
| F-12 | `CATEGORIA_TEMPLATE` has no cross-bucket name collision today; `copiarCatalogoTemplate` builds `idPorNombre` keyed by `nombre` alone over the whole per-user copy. | `catalogo-template.ts:243-249` |
| F-13 | **CI already provisions an ephemeral Postgres** (`postgres:16-alpine` service container, `ALLOW_DESTRUCTIVE_DB=1`, localhost so db-safety accepts it) and runs `pnpm api test:integration` **and** `test:e2e` as blocking steps, gated by the `api`/`shared` path filters. Integration tests are a real CI gate, not a local-only ritual. | `.github/workflows/ci.yml:232-301` |
| F-14 | The us037 rehearsal runs `prisma migrate deploy` (**all** migrations, with only the us037 directory parked/unparked) and then asserts `Categoria_userId_nombre_key` exists. It is a manual `pnpm` script, **not** wired into CI. | `us037-catalogo-rehearsal.ts:160-167, 301-304`, `apps/api/package.json:25` |
| F-15 | `CategoriaDesconocidaError`'s `readonly nombre` is read **only** by its own spec. Every other consumer matches on the class. | `categoria-desconocida.error.ts:17-24`, `categoria-no-encontrada.error.spec.ts:23-46` |

---

## 2. Decisions

### D-01 — Slice ordering is a correctness constraint, not a preference: contract migrates BEFORE the constraint relaxes

Adopted from the proposal and recorded here as a decision because a future reader will be tempted to reorder it ("do the schema first, it's the small one").

While `(userId, nombre)` is still unique, **id-keying is a strict refinement of name-keying**: for every categoría, exactly one row answers to a given name, so resolving by id yields the identical row that resolving by name would have. Therefore PRs 1–3 are behaviour-preserving on the current schema and can land and deploy one at a time without a flag.

Reverse the order and you open a window in which two conditions hold simultaneously: names are ambiguous **and** the write path resolves by name. In that window there is no exception, no `400`, no log line — the money lands in the wrong bucket and the 50/30/20 verdict silently changes. The ordering guarantees that window never exists at any commit on `main`.

Corollary, and the reason this is stated as an invariant rather than a schedule: **no commit may contain both a name-keyed `Categoria` lookup on a write path and the relaxed index.** A reviewer can check that mechanically.

### D-02 — `existeNombre` takes a criterion object, because the positional form has a silent-miscompile hole

**Chosen signature** (`application/ports/categoria-repository.port.ts`):

```ts
/**
 * Uniqueness gate for `(userId, bucket, nombre)` — case-insensitive on
 * `nombre`, userId-scoped in the SQL WHERE (RNF-SEC-006). `bucket` viaja
 * como NOMBRE validado; el adapter resuelve `BUCKET_IDS[bucket]` (ADR-005).
 * `excluirId` habilita la auto-exclusión en PATCH: la propia fila nunca
 * colisiona consigo misma.
 */
existeNombre(criterio: {
  userId: string;
  nombre: string;
  bucket: string;
  excluirId?: string;
}): Promise<boolean>;
```

**Rejected: `existeNombre(userId, nombre, bucket, excluirId?)`.** It is smaller and it is dangerous. `ActualizarCategoriaUseCase` calls `existeNombre(input.userId, nombre, input.id)` today (F-6). Insert `bucket: string` at position three and that call **still compiles** — three arguments against three required params, all `string` — and silently passes a categoría **id** as a bucket **name**. `BUCKET_IDS['cknx…']` is `undefined`, the `where` gets `bucketId: undefined`, Prisma drops the clause, and the check degrades back to bucket-blind: a create in a second bucket gets a false `409`, and worse, a rename+re-bucket combination can pass a check it should have failed. The failure is silent, it is in the exact use case whose latent bug this change exists to fix, and `tsc` cannot see it.

Reordering to `(userId, bucket, nombre, excluirId?)` is no better — the old three-arg call still compiles, now with `nombre → bucket` and `id → nombre`.

The object form makes **every** call site an arity error (3 → 1) plus a shape error. The compiler enumerates them exhaustively, which is precisely the property the rest of this change leans on. That guarantee is worth more than four saved characters.

Against `solid`/ISP: the port does not grow a method and no consumer gains a dependency it does not use — `existeNombre` stays one cohesive question ("does this `(bucket, nombre)` pair already exist for this user, ignoring this row?"), and the object is a *criterion value*, not a god-parameter bag. Against `kiss`: named fields at the call site read as the invariant they enforce. Mocks stay honest: the `vi.fn()` stubs in six specs are arity-agnostic and need no edit; only the two `toHaveBeenCalledWith` assertions (`crear-categoria.use-case.spec.ts:162`, `actualizar-categoria.use-case.spec.ts:128`) and the three adapter-spec calls change, and they become self-documenting.

**Adapter** (`prisma-categoria.repository.ts`), mirroring the existing `BUCKET_IDS[... as Bucket]` cast already used by `crearConPatrones:150`:

```ts
async existeNombre(criterio: {
  userId: string; nombre: string; bucket: string; excluirId?: string;
}): Promise<boolean> {
  const row = await this.prisma.categoria.findFirst({
    where: {
      userId: criterio.userId,
      bucketId: BUCKET_IDS[criterio.bucket as Bucket],
      nombre: { equals: criterio.nombre, mode: 'insensitive' },
      ...(criterio.excluirId !== undefined ? { id: { not: criterio.excluirId } } : {}),
    },
    select: { id: true },
  });
  return row !== null;
}
```

`mode: 'insensitive'` stays. The app-layer case-insensitivity vs. case-sensitive DB index mismatch is an explicit non-goal (proposal Non-Goals) and does not widen: the app check is still the only gate every write passes through.

### D-03 — `ActualizarCategoriaUseCase` validates the RESULTING pair with one call, from the row it already holds

**Open choice 2 is resolved: no extra query.** F-4 confirms `actual` is loaded before any field validation and carries both `nombre` and `bucket`.

The three PATCH paths do not each get their own check. They all collapse to "compute the effective `(nombre, bucket)` pair the row would have after the patch, then ask once whether it collides":

| Path | `nombre` passed | `bucket` passed |
|---|---|---|
| nombre-only | the patched, trimmed value | `actual.bucket` |
| bucket-only | `actual.nombre` | the patched, validated value |
| both | the patched value | the patched value |

```ts
// after the demo gate and the 404, unchanged
let nombreValidado: string | undefined;
if (input.nombre !== undefined) {
  const nombre = input.nombre.trim();
  if (nombre.length < NOMBRE_MIN || nombre.length > NOMBRE_MAX) {
    return Result.fail(new NombreCategoriaInvalidoError(input.nombre));
  }
  nombreValidado = nombre;
}

let bucketValidado: string | undefined;
if (input.bucket !== undefined) {
  if (!BUCKETS_ASIGNABLES.includes(input.bucket as (typeof BUCKETS_ASIGNABLES)[number])) {
    return Result.fail(new BucketNoAsignableError(input.bucket));
  }
  bucketValidado = input.bucket;
}

// The pair the row WOULD have after this patch — the only thing worth checking.
const nombreEfectivo = nombreValidado ?? actual.nombre;
const bucketEfectivo = bucketValidado ?? (actual.bucket as string);

const colisiona = await this.categoriaRepository.existeNombre({
  userId: input.userId,
  nombre: nombreEfectivo,
  bucket: bucketEfectivo,
  excluirId: input.id,          // the row never collides with itself
});
if (colisiona) {
  return Result.fail(new NombreCategoriaDuplicadoError(nombreEfectivo));
}

const patch: { nombre?: string; bucket?: string } = {};
if (nombreValidado !== undefined) patch.nombre = nombreValidado;
// bucket ONLY if it actually changed — this is the mechanism that triggers the
// atomic Transaccion.bucketId re-stamp in the adapter (us-038 D-07). Unchanged.
if (bucketValidado !== undefined && bucketValidado !== (actual.bucket as string)) {
  patch.bucket = bucketValidado;
}
```

The check runs unconditionally once at least one field is present (the Zod schema already requires that). A true no-op patch cannot produce a false `409` because `excluirId` excludes the row itself.

**Recorded behaviour change — the validation order moves, and it is forced, not stylistic.** Today the order is `nombre`-shape → `nombre`-uniqueness → `bucket`-assignability. It becomes `nombre`-shape → `bucket`-assignability → pair-uniqueness. You cannot ask "is this pair taken?" against a bucket you have not yet validated — `BUCKET_IDS['Gustos']` is `undefined` and the question is meaningless. Observable consequence: a PATCH carrying **both** a colliding `nombre` **and** an invalid `bucket` returns `400 BUCKET_NO_ASIGNABLE` where it used to return `409 NOMBRE_DUPLICADO`. Both are correct rejections and nothing is persisted either way; `sdd-spec` should pin the new order so the change is deliberate rather than discovered.

`CrearCategoriaUseCase` needs no reorder — it already validates assignability (`:76-83`) before calling `existeNombre` (`:85-91`). It gains one field:

```ts
const yaExiste = await this.categoriaRepository.existeNombre({
  userId: input.userId,
  nombre,
  bucket: input.bucket,   // narrowed to BUCKETS_ASIGNABLES three lines above
});
```

### D-04 — Reclassify chain: `categoriaId` end to end, hard cutover

Four layers, one field.

**Transport** — `transacciones-categoria.schema.ts`:

```ts
export const transaccionesCategoriaRequestSchema = z.object({
  categoriaId: z.string().describe(
    "Categoria id — the caller's OWN Categoria row id, resolved against their own " +
    'catalog by the use case (CategoriaDesconocidaError if it does not resolve or is ' +
    'not theirs), not this schema.',
  ),
});
```

The file's "CONTRACT-ONLY, never `.safeParse()`'d at the route" docblock rule is preserved verbatim — this schema still documents the transport shape for OpenAPI and nothing else. The docblock that today records "`categoria` viaja como el `nombre` del dominio (no el id físico)" as a deliberate past decision (`reclasificar-categoria.dto.ts:7-10`) is **reversed and must say so**, naming ADR-042 and the reason: a nombre stopped identifying a categoría. A comment that asserts a fact the code contradicts is this repo's own named anti-pattern (`dry`).

**Route** — `transacciones.routes.ts:27-36`, same hand-coercion, new field:

```ts
const rawCategoriaId: unknown = (req.body as { categoriaId?: unknown } | undefined)?.categoriaId;
const categoriaId = typeof rawCategoriaId === 'string' ? rawCategoriaId : '';
```

`''` never matches a `cuid()`, so a missing or non-string field lands on `CategoriaDesconocidaError → 400` exactly as a bogus name does today. No new branch, no new status code, no enumeration.

**Use case** — `ReclasificarTransaccionUseCase` stays a pure delegate; `input.categoria: string` becomes `input.categoriaId: string`.

**Port** — `IReclasificarCategoriaWriter.reasignar(userId, transaccionId, categoriaId)`. Its docblock's "El writer resuelve `nombre` contra el catálogo REAL del usuario (`(userId, nombre)`)" becomes `(id, userId)`, and the `CategoriaDesconocidaError` clause becomes "un `categoriaId` que no resuelve a ninguna fila del catálogo del usuario — no existe **o no es suya**, indistinguibles (anti-enumeration)".

`CategoriaDesconocidaError`'s `readonly nombre` is renamed to `readonly categoriaId` (log-only field; F-15 confirms its single reader is its own spec, two assertions). Keeping a field named `nombre` that holds an id would be a lie in a domain error, and this change is entirely about not confusing the two.

### D-05 — The adapter lookup: `findFirst({ where: { id, userId } })`, and why the sibling `findFirst` is forbidden

```ts
const categoriaRow = await this.prisma.categoria.findFirst({
  where: { id: categoriaId, userId },   // STRUCTURAL isolation (RNF-SEC-006)
  include: { bucket: true },
});
if (categoriaRow === null) {
  return Result.fail(new CategoriaDesconocidaError(categoriaId));
}
```

**Why `findFirst({ userId, nombre })` is FORBIDDEN, stated plainly for the reviewer who will propose it as "the small fix":** it compiles, it type-checks, and every existing test passes. It also returns **one of N same-named rows across buckets, chosen by the database**, and reclassifies the transaction into a categoría the user did not pick. There is no exception, no `400`, no log line — money booked as `Deseos` lands in `Necesidades`, and the semáforo reports a verdict the user never chose. This is the silent money-misclassification class ADR-015 weights heaviest. It is the single change in this design that must never be made, and it is one keystroke away from the one that must.

**Why `findFirst({ id, userId })` is NOT the same hazard, despite looking identical:** `id` is `@id` — the primary key. `WHERE "id" = $1 AND "userId" = $2` can match at most one row **by construction of the primary key**, regardless of any unique index. There is no N to choose from. The two calls share a method name and share nothing else: one filters on a non-unique pair, the other on the primary key plus an ownership predicate.

**Why not `findUnique({ where: { id_userId: { id: categoriaId, userId } } })`,** which the existing `@@unique([id, userId])` (F-1) makes available and which states "at most one" at the type level. Two reasons. First, it re-couples the money-write path to a **generated compound-selector name** — precisely the coupling this change is paying to remove from this exact function; reorder that `@@unique` some day and the selector renames and we are back here. Second, the at-most-one claim is already free from the primary key, so the type-level statement buys nothing real. `findFirst({ id, userId })` is also the house precedent for "my own row by id" (`buscarPorId`, F-3), and `kiss` rule 2 says prefer the pattern already in the repo.

**RNF-SEC-006 is preserved in both statements, unchanged in mechanism:** `userId` sits in the SQL `WHERE` of the lookup (never a post-fetch check), and the write is still `updateMany({ where: { id: transaccionId, account: { userId } } })` with `count === 0` merging "does not exist" and "not yours" into one `TransaccionNoEncontradaError` (F-2). A foreign `categoriaId` now fails at the lookup instead of at the name resolution — same generic `400`, same non-enumerating message, and the transaction is never touched.

Note the small semantic upgrade: `CategoriaDesconocidaError` now also covers "exists but belongs to another user", which the name-keyed version could not express (another user's name simply did not resolve for *this* user either, so the outcome matches — it is the wording that gets more honest).

### D-06 — The response contract does NOT change

**Open choice 3 is resolved: keep `{ id, categoria: { id, nombre }, bucket }`.** F-7 confirms `ReclasificarCategoriaResult` already carries `categoriaId`, and the DTO already exposes `categoria.id`. Nothing needs adding.

One real change inside the adapter's return: `categoria` must now be read from the resolved row, not echoed from the input.

```ts
return Result.ok({
  id: transaccionId,
  categoriaId: categoriaRow.id,
  categoria: categoriaRow.nombre,   // was: the caller's input string
  bucket: categoriaRow.bucket.nombre as Bucket,
});
```

Today the echo and the row happen to agree because the name was the lookup key. Tomorrow the caller sends an id and the server is the only authority on what that row is called — which is the correct direction (ADR-024) and is what lets both clients keep rendering a label they did not have to derive.

**Contract consequence.** Only the request body changes shape. `pnpm api openapi:emit` then `pnpm --filter @moneydiary/api-client generate`, both in the same PR as the schema edit so `openapi:check` never goes red. `TransaccionesCategoriaResponse` is byte-identical, therefore:

- `ReclasificarCategoriaDto` (F-8) is unchanged for **both** clients.
- The web guard `esReclasificarCategoriaDto` (`client.ts:731-754`) is unchanged.
- The mobile guard `esReclasificarDto` (`categorias.ts:236-249`) is unchanged, and `apps/mobile/src/domain/detalle.types.ts` needs **no edit at all** — it is a pure re-export of a generated alias, not a hand-written DTO.

Also regenerated-by-consequence: `openapi-document.ts:697`'s 400 description ("the given **name** does not resolve") must be reworded to id, or the emitted document documents the old contract.

### D-07 — Web control: identity moves to `id`, prop shape changes so `tsc` breaks the caller

`ReclasificarCategoriaControl.tsx`, all five name-keyed sites:

| Site | Today | Becomes |
|---|---|---|
| prop (`:83`) | `categoriaActual: string \| null` | `categoriaActual: { id: string; nombre: string } \| null` |
| state (`:89`) | `useState(categoriaActual ?? '')` | `useState(categoriaActual?.id ?? '')` — `valor` now holds an **id** |
| lookup (`:109-110`) | `bucketDe(nombre)` → `.find(c => c.nombre === nombre)?.bucket` | `categoriaPorId(id)` → `data?.categorias.find(c => c.id === id)`, then `?.bucket` |
| `<option>` (`:218`) | `key={categoria.nombre} value={categoria.nombre}` | `key={categoria.id} value={categoria.id}` |
| mid-flight fallback (`:206`) | `<option value={categoriaActual}>{categoriaActual}</option>` | `<option value={categoriaActual.id}>{categoriaActual.nombre}</option>` |

Consequences that fall out for free: duplicate React keys are gone, and `<select value>` — whose value model is a flat string set and genuinely cannot represent two options labelled `Transporte` — becomes unambiguous.

`pendiente` shrinks to `{ categoriaId: string; bucketNuevo: string }`. The `nombre` it carries today is never rendered (the confirmation copy uses `montoLabel` and the two bucket labels only), so carrying it would be a dead field (`yagni` rule 3). `commit(categoriaId, onSuccess?)` calls `mutacion.mutate({ transaccionId, categoriaId })`. The three reset paths (`onError`, the unresolved-defensive branch, `cancelar`) become `setValor(categoriaActual?.id ?? '')`.

The defensive `bucketNuevo === undefined` branch at `:143-155` **stays**, with its "fail loud, never fall through to same-bucket-commit" comment intact — it is now more reachable, not less (a categoría deleted in another tab between render and select).

**The prop-shape change is deliberately the enforcement mechanism.** F-9: `GrupoMovimientos.tsx:116-118` already has both halves and becomes `categoriaActual={grupo.categoriaId === null ? null : { id: grupo.categoriaId, nombre: grupo.nombre }}`. Widening the prop instead (accepting either) would let the caller compile untouched, which is the opposite of what is wanted.

Up the seam: `ReclasificarCategoriaInput.categoria` → `categoriaId` (`use-reclasificar-categoria.ts:6-9`) and `postReclasificarCategoria(transaccionId, categoriaId)` sending `JSON.stringify({ categoriaId })` (`client.ts:769-781`). Renaming the **input interface field** is what makes the control's `mutate({ …, categoria })` a compile error; the `client.ts` body literal is untyped and would not have broken on its own. Its docblock's "El request SOLO envía `{ categoria: nombre }`" is rewritten; the surrounding rule it states — the client never sends a bucket, the server derives it — is unchanged and stays.

### D-08 — Mobile control: identity moves to `id`; name the two places `tsc` will NOT protect us

F-10: the prop already carries `id`, so **no prop change and no caller change**. Four edits inside `ReclasificarMobileControl.tsx`:

| Site | Today | Becomes |
|---|---|---|
| `:311-312` | `cat.nombre === categoriaActual.nombre` | `cat.id === categoriaActual.id` |
| `:319` | `testID={\`reclasificar-opcion-${cat.nombre}\`}` | `testID={\`reclasificar-opcion-${cat.id}\`}` |
| `:320-321` | `handleSelectCategoria(cat.nombre, cat.bucket)` | `handleSelectCategoria(cat.id, cat.bucket)` |
| `:137-158` | `commit(nombre, bucketNuevo?)` → `reclasificarCategoria(tx.id, nombre)` | `commit(categoriaId, bucketNuevo?)` → `reclasificarCategoria(tx.id, categoriaId)` |

The `:311` line is the concrete bug: with `Transporte` in two buckets, **both** rows render the "● actual" badge and both report `accessibilityState={{ selected: true }}` to VoiceOver/TalkBack — an a11y defect (ADR-018) on top of a wrong affordance.

`testID` keyed by `cat.id` costs some test readability. `reclasificar-opcion-${cat.bucket}-${cat.nombre}` would stay readable and is unique under the new invariant — and is rejected precisely because it re-derives identity from the invariant this change just proved fragile. A testID's one job is to be unique; `cat.id` is unique with no premises. The RNTL fixtures already construct their own catalog, so they already know the ids.

`esMismoBucket` keeps comparing bucket **names** — buckets are a closed set of three and were never the ambiguous thing.

**Where the compiler does not help.** Two request-side edits are not type-enforced:

1. `reclasificarCategoria(transaccionId, categoria: string)` → `(transaccionId, categoriaId: string)` is a positional `string` → `string` rename. Every call site keeps compiling.
2. The body literal `{ categoria }` → `{ categoriaId }` is a plain object passed to `enviarMutacion`, never checked against the generated request schema.

The actual gate is the existing `apps/mobile/src/api/reclasificar.spec.ts`, which asserts the serialized body — it goes red on the first edit and stays red until both are done. That is a genuine gate, but it is a **test** gate, not a **type** gate, and this design records the difference rather than implying `tsc` covers the whole client migration. The same asymmetry exists on web except that D-07's `ReclasificarCategoriaInput` rename converts it into a type error there.

### D-09 — Migration: forward-only index swap, and the rehearsal assertion must be updated

`schema.prisma:149` becomes `@@unique([userId, bucketId, nombre])`, with the comment at `:146-148` rewritten (it currently states "un usuario nunca puede tener dos categorías con el mismo nombre" — now false, and it is the load-bearing sentence of the whole change). `@@unique([id, userId])` and `@@index([bucketId])` are untouched.

`apps/api/prisma/migrations/<timestamp>_categoria_unica_por_bucket/migration.sql`, house style (prose header explaining rationale and safety, forward-only, no down file):

```sql
-- categoria-unica-por-bucket (ADR-042): Categoria uniqueness moves from
-- (userId, nombre) to (userId, bucketId, nombre). A user MAY hold the same
-- categoria name in two different buckets, and MUST NOT within one. Amends
-- ONLY the uniqueness clause of ADR-036/037; the composite-FK target
-- (id, userId) and the (prioridad, patron, id) tiebreak are untouched.
--
-- Pure relaxation, no backfill, no guard. (userId, nombre) is unique today
-- => no two existing rows share it => no two rows can violate the superset
-- key (userId, bucketId, nombre). Every row satisfying the old constraint
-- trivially satisfies the new one.
--
-- Column ORDER is load-bearing: it determines Prisma's generated compound
-- selector name (userId_bucketId_nombre). It must match schema.prisma:149.
DROP INDEX "Categoria_userId_nombre_key";
CREATE UNIQUE INDEX "Categoria_userId_bucketId_nombre_key"
  ON "Categoria" ("userId", "bucketId", "nombre");
```

`DROP` before `CREATE` is fine and deliberate: the transaction is short, the table is small, and ordering the other way would leave two overlapping unique indexes momentarily — harmless but noisier to reason about.

**`us037-catalogo-rehearsal.ts:301-304` must be updated, and the proposal's "Unchanged" line is wrong.** F-14: the script runs `prisma migrate deploy` over **all** migrations (parking only the us037 directory), so once this migration exists the rehearsal applies it too and the assertion `indexNames.includes('Categoria_userId_nombre_key')` fails with a message claiming the us037 migration broke. The fix mirrors the pattern the same function already uses two assertions later for the older dropped index:

```ts
assert(
  indexNames.includes('Categoria_userId_bucketId_nombre_key'),
  'unique index (userId, bucketId, nombre) exists on Categoria (ADR-042)',
);
assert(
  !indexNames.includes('Categoria_userId_nombre_key'),
  'the us037-era unique index (userId, nombre) was dropped by ADR-042',
);
```

Non-blocking for CI (the script is not wired in, F-14) but load-bearing for the next pre-deploy prod-snapshot rehearsal, which is exactly when a false failure is most expensive.

### D-10 — The 12 `userId_nombre` call sites: one bucket-aware test helper, not 10 copies of a forbidden shape

**Open choice 5 resolved: extract the helper.** F-11 gives three categories, handled differently:

1. **Runtime (1)** — `prisma-reclasificar-categoria.repository.ts:60`. Deleted by D-05, in slice 1. By the time the migration lands, **no runtime code uses the compound selector at all**, which is what makes the schema change a non-event for `src/`.
2. **Mocked-prisma assertion (1)** — `prisma-reclasificar-categoria.repository.spec.ts:55` asserts the `where` handed to `findUnique`. Not a fixture; rewritten in slice 1 to assert `findFirst({ where: { id, userId } })`. This assertion is the unit-level guard that the forbidden shape did not sneak back.
3. **Fixture resolutions (10, across 8 `*.int-spec.ts` files)** — every one is the same three lines: resolve a seeded categoría's real per-user id from its name. Eleven occurrences of one idea is far past `dry`'s three-strike threshold.

New helper, `apps/api/test/helpers/categoria-fixture.ts` (a new `helpers/` directory under `test/`, alongside the specs that use it — it is test infrastructure and has no business in `src/`):

```ts
/**
 * Resolves the REAL per-user id of a seeded Categoria (US-037: there is no
 * global fixed id per categoria). Under ADR-042 a nombre alone no longer
 * identifies a row, so the BUCKET IS REQUIRED — this helper cannot be
 * copy-pasted into runtime code as a name-only lookup, by construction.
 */
export async function categoriaIdDe(
  prisma: PrismaClient,
  criterio: { userId: string; bucket: Bucket; nombre: string },
): Promise<string> {
  const row = await prisma.categoria.findFirstOrThrow({
    where: {
      userId: criterio.userId,
      bucketId: BUCKET_IDS[criterio.bucket],
      nombre: criterio.nombre,
    },
    select: { id: true },
  });
  return row.id;
}
```

Requiring `bucket` is the point, not an accident. `findFirstOrThrow({ userId, nombre })` would be correct *today* in these fixtures (F-12: the template has no cross-bucket duplicate) and would sit in the codebase as a ready-made template of the exact shape D-05 forbids. Demanding the bucket makes the helper honest under the new invariant, self-documenting at each call site, and directly reusable by the correctness test in D-14, which needs to resolve two same-named rows apart. `BUCKET_IDS` is already imported by these specs (e.g. `reclasificar-categoria.int-spec.ts:183`).

`reclasificar-categoria.int-spec.ts:139-148` already wraps this idea in a local `categoriaIdFor`; it becomes a thin call into the shared helper (or is deleted in its favour). The migration is mechanical and `tsc` enumerates it exhaustively: once the `@@unique` field list changes, `prisma generate` stops emitting the `userId_nombre` key on `CategoriaWhereUniqueInput`, so every remaining reference is a compile error. Nothing breaks silently.

### D-11 — `catalogo-template.ts`: assert, do not re-key

**Open choice 4 resolved: the build-time assertion.** F-12: `idPorNombre` is keyed by `nombre` alone. Today no cross-bucket duplicate exists in `CATEGORIA_TEMPLATE`, so the map is correct; the risk is a future template author adding one and getting silent last-write-wins, which would attach `PATRON_TEMPLATE` entries to a categoría in the wrong bucket for every new user.

Re-keying by `(bucket, nombre)` is collision-proof but requires `PATRON_TEMPLATE` entries to also carry their categoría's bucket — a second place where the template's bucket assignment is written down, which will drift (`dry`). The assertion is smaller, keeps one source of truth, and fails loudly at exactly the moment the hazard is introduced:

```ts
// ADR-042 allows the same nombre in two buckets. This template deliberately
// has no such duplicate: idPorNombre below is keyed by nombre alone, and a
// duplicate would silently make PATRON_TEMPLATE resolve to the wrong
// categoria (last write wins). Fail loudly at the moment one is added.
const nombresTemplate = CATEGORIA_TEMPLATE.map((c) => c.nombre);
if (new Set(nombresTemplate).size !== nombresTemplate.length) {
  throw new Error(
    'CATEGORIA_TEMPLATE tiene un nombre repetido entre buckets: re-keyea ' +
      'idPorNombre por (bucket, nombre) antes de agregarlo (ADR-042).',
  );
}
```

Placed at module scope in `catalogo-template.ts` so it fires at import, and pinned by a unit test asserting the current template passes. A `throw` here is correct and not an ADR-005 violation: this is infrastructure, it is a programming error in a hardcoded constant (not a domain outcome), and it mirrors the existing `copiarCatalogoTemplate` docblock note that a throw is the only thing that rolls back the enclosing transaction.

### D-12 — Error copy: three files, three tests, one bucket-aware sentence

Per the proposal's User-facing copy table; the clients render their own closed code→copy map and never `body.message`, so all three change independently:

| File | Ships |
|---|---|
| `apps/api/src/domain/errors/nombre-categoria-duplicado.error.ts:13` | `Ya existe una categoría con ese nombre en ese bucket.` |
| `apps/web/src/components/configuracion/categorias/mensajes-catalogo.ts:103` | `Ya tienes una categoría con ese nombre en ese bucket.` |
| `apps/mobile/src/domain/mensajes-catalogo.ts:94` | `Ya tienes una categoría con ese nombre en ese bucket.` |

Assertions to update: `mensajes-catalogo.test.ts:63` (web), `mensajes-catalogo.spec.ts:75` (mobile), plus the server-side error's own spec and the `openapi.json` example that embeds it. "Bucket" is already user-facing house vocabulary (`BUCKET_NO_ASIGNABLE: 'Elige un bucket: Necesidades, Gustos o Ahorro.'`), so no new term is introduced. The `CodigoCatalogo` unions do not grow — same code, new string.

Proposal open product question 1 (should the copy actively hint "podés usar ese nombre en otro bucket") is **not** answered here; it is a product call and the strings above are the silent-capability default the proposal assumes.

### D-13 — ADR-042: scoped supersede, naming the exact sentences

New `docs/adr/ADR-042-unicidad-de-categoria-por-bucket.md`, following the ADR-038/039/040 precedent of naming precisely what is superseded and what survives.

**Decisión (draft, ships in Spanish neutral/profesional as the ADR corpus does):**

> La unicidad de `Categoria` pasa de `(userId, nombre)` a `(userId, bucketId, nombre)`: un usuario **puede** repetir un nombre de categoría entre buckets y **nunca** dentro de uno. Como consecuencia directa —un nombre deja de identificar una categoría— el contrato de reclasificación (`PATCH /api/transacciones/:id/categoria`) identifica la categoría por `categoriaId` en vez de por `nombre`, en corte duro y sin alias de transición. La verificación de unicidad de la capa de aplicación (`existeNombre`) se vuelve bucket-scoped y se ejecuta también en el PATCH de re-bucketeo, donde hoy no corre.

**Supersedes — exactly two sentences, nothing more:**

- **ADR-036**, the fragment `«FK compuesta (categoriaId,userId) → Categoria(id,userId) confirmada viva»`'s sibling clause that fixes uniqueness at `@@unique([userId, nombre])`. Only the uniqueness key. **Explicitly still binding:** per-user catalog ownership, materialization from `catalogo-template.ts` at user creation, `userId` NOT NULL on both tables, the composite FK `(categoriaId, userId) → Categoria(id, userId)`, and the `(prioridad, patron, id)` classification tiebreak.
- **ADR-037**, inside `«la validez de una categoría pasa a ser NOT NULL Categoria.bucketId + @@unique([userId, nombre]) + FK compuesta»`, the `@@unique([userId, nombre])` term only. **Explicitly still binding:** the retirement of the closed `Categoria` enum and `CATEGORIA_BUCKET`; validity is a row property, not a type. ADR-037 gets *stronger* here, not weaker — this change is the moment "identity is a row, not a name" becomes load-bearing rather than aspirational.

**Notes without amending:** ADR-011/012 (this is exactly the generate-don't-hand-sync contract change those ADRs anticipate), ADR-022/023 (the accepted APK-rebuild consequence of the hard cutover), ADR-015 (the integration test in D-14 is the money-risk gate this ADR's rationale rests on).

`docs/adr/README.md` and the root `CLAUDE.md` ADR table each gain one row. The root `CLAUDE.md` ADR-012 line calling `@moneydiary/api-client` "deuda registrada, no se construyó" is corrected in the same PR — F-8 shows the package is live and this change rides its pipeline, so shipping alongside a doc that denies it exists is not acceptable.

### D-14 — Test strategy: the decisive scenario cannot be mocked

Strict TDD is active; every slice is test-first. Runner `pnpm api test` (unit), `pnpm api test:integration` (gated), `pnpm web test`, `pnpm --filter @moneydiary/mobile test`.

**Layer assignment, and the reason for each boundary:**

| Layer | Test kind | What it can prove |
|---|---|---|
| `ActualizarCategoriaUseCase`, `CrearCategoriaUseCase` | **unit**, mocked port | The exact `existeNombre` criterion passed on each of the three PATCH paths (`toHaveBeenCalledWith` on the object — this is where D-03's effective-pair logic lives and it is pure); the new validation order; that the repository is never called when the check collides |
| `PrismaCategoriaRepository.existeNombre` | **unit**, mocked prisma | That `bucketId` and the `mode: 'insensitive'` clause reach the `where`, and `excluirId` composes as `id: { not: … }` |
| `PrismaReclasificarCategoriaRepository` | **unit**, mocked prisma | That the lookup is `findFirst({ where: { id, userId } })` — the regression guard against the forbidden shape reappearing |
| Route + Zod schema | **unit** | `{ categoriaId }` reaches the use case; a missing/non-string field coerces to `''` → `400`; the schema/DTO sync assertion |
| **Cross-bucket reclassify correctness** | **integration, real Postgres — MANDATORY** | Which row the database actually returns |
| Cross-user isolation with duplicate names | **integration** | That `userId` is in the SQL `WHERE`, not in memory |
| Web / mobile controls | **unit** (RTL / RNTL) | Distinct keys and values per option; exactly one "● actual" badge; the request body carries the id |

**The decisive test, and why mocking it proves nothing.** In `apps/api/test/reclasificar-categoria.int-spec.ts`:

> Given user A owns `Transporte` in `Necesidades` (id `A1`) and `Transporte` in `Deseos` (id `A2`), when `reasignar(userA, tx, A2)` runs, then the persisted `Transaccion.categoriaId` is exactly `A2` and `bucketId` is `Deseos`.

A mocked repository returns whatever the test told it to return. The entire question here — *which of N same-named rows does the database hand back* — is a property of Postgres and of the query shape, and a mock cannot express it. Running this against a stub would produce a green test that proves the mock works. It **must** run against a real database with two same-named rows physically present, created via `categoriaIdDe` (D-10) which can tell them apart.

Companion at the same layer: with the same fixture, `reasignar` with user B's `categoriaId` fails `CategoriaDesconocidaError` and user A's transaction is unchanged (RNF-SEC-006 with names deliberately colliding across users, which is the case the old key made unreachable).

Catalog-invariant scenarios (same name different bucket → `201`; same name same bucket → `409`; case-insensitive within a bucket; re-bucket into a collision → `409` **not** `500`; rename+re-bucket combined) belong in `catalogo-crud.int-spec.ts` / `catalogo-rebucket.int-spec.ts`, also against the real DB — they are assertions about the interaction of the app gate and the DB index, which is the pair this change re-aligns.

**Precondition for `apply`, resolved.** F-13: **CI already provisions an ephemeral `postgres:16-alpine` service container with `ALLOW_DESTRUCTIVE_DB=1` and runs `test:integration` and `test:e2e` as blocking steps**, gated by the `api`/`shared` path filters — which this change trips. So the integration gate is real CI enforcement, not a local-only ritual, and it does **not** block `apply` at the pipeline level.

What it does require locally: a developer running slice 4 test-first needs a local Postgres per `apps/api/docs/local-test-db.md` (`pnpm api test:db:setup`, `.env.test`, `ALLOW_DESTRUCTIVE_DB=1`). The db-safety gate rejects Supabase/prod connection strings by design, so pointing `.env` at production is not a workaround — it is the thing the gate exists to stop. **`sdd-tasks` should make "local test DB reachable and `pnpm api test:integration` green on `main`" the first task of slice 4**, since strict TDD means the red test must be writable before any production code moves.

### D-15 — Rollback is asymmetric; the runbook needs a dedup step, not a design change

- **Code-only rollback is safe at every moment.** Revert the PR chain and leave the looser index in place: the app-layer `existeNombre` gate becomes stricter than the DB again, which is the exact relationship that exists today (the DB index has always been the looser, case-sensitive backstop). No data is invalid, no read path breaks. This is the rollback that should be reached for first, and it is complete for every failure mode except a schema-level problem.
- **DB rollback is not the inverse of the migration.** The migration relaxes; the inverse tightens. `CREATE UNIQUE INDEX "Categoria_userId_nombre_key"` **fails outright** the moment one user holds `Transporte` in two buckets. Per house style there is no down file and DB rollback means restoring a Supabase snapshot (the US-037 precedent) — which is unaffected by the duplicates but loses everything written since the snapshot.
- **What the runbook needs** (`docs/` deploy runbook, added in the ADR-042 PR): before any attempt to re-tighten the index, run the detection query and resolve what it returns — rename or delete — because the index creation will otherwise abort:

  ```sql
  SELECT "userId", "nombre", count(*)
  FROM "Categoria" GROUP BY 1, 2 HAVING count(*) > 1;
  ```

  An empty result means the old index can be recreated; a non-empty result is a product decision (which duplicate survives, and what happens to the transactions pointing at the other), not something a migration can decide.
- Answering proposal open question 5 with a mechanism rather than a promise: this is a documented pre-rollback dedup step, exactly the resolution the proposal named as acceptable.

---

## 3. Reclassify path, before and after

```
BEFORE                                    AFTER
──────                                    ─────
client sends { categoria: "Transporte" }  client sends { categoriaId: "ckx…A2" }
   │  (name resolved from local state       │  (id carried through local state from
   │   by .find(c => c.nombre === n))       │   the option the user actually clicked)
   ▼                                        ▼
route: coerce non-string → ''             route: coerce non-string → ''
   ▼                                        ▼
ReclasificarTransaccionUseCase            ReclasificarTransaccionUseCase
  (delegate, categoria: string)             (delegate, categoriaId: string)
   ▼                                        ▼
IReclasificarCategoriaWriter              IReclasificarCategoriaWriter
  .reasignar(userId, txId, nombre)          .reasignar(userId, txId, categoriaId)
   ▼                                        ▼
findUnique({ userId_nombre })             findFirst({ where: { id, userId } })
   │  ← breaks: selector needs bucketId     │  ← primary key + ownership predicate:
   │    once the constraint widens          │    at most one row, by construction
   ▼                                        ▼
null → CategoriaDesconocidaError           null → CategoriaDesconocidaError
   │    ("no existe en tu catálogo")        │    (also covers "exists, not yours")
   ▼                                        ▼
updateMany({ id: txId, account:{userId} }) updateMany({ id: txId, account:{userId} })
   │   categoriaId + bucketId, atomic       │   UNCHANGED — RNF-SEC-006 intact
   ▼                                        ▼
count===0 → TransaccionNoEncontrada        count===0 → TransaccionNoEncontrada
   ▼                                        ▼
200 { id, categoria:{id,nombre}, bucket }  200 { id, categoria:{id,nombre}, bucket }
      nombre = the caller's echo                 nombre = read from the resolved row
      ── RESPONSE SHAPE UNCHANGED ──
```

The forbidden edge, drawn once so it is unmistakable:

```
findFirst({ where: { userId, nombre } })   ← compiles · type-checks · tests pass
                                           ← returns ONE OF N rows, DB's choice
                                           ← books money into the wrong bucket
                                           ← no exception, no 400, no log line
                                           ← NEVER WRITE THIS
```

---

## 4. Affected files

| File | Change | Slice |
|---|---|---|
| `apps/api/src/infrastructure/http-express/schemas/transacciones-categoria.schema.ts` | `categoria` → `categoriaId` + docblock reversal (D-04) | 1 |
| `apps/api/src/infrastructure/http-express/routes/transacciones.routes.ts` | coerce the new field | 1 |
| `apps/api/src/application/use-cases/reclasificar-transaccion.use-case.ts` | `categoriaId` | 1 |
| `apps/api/src/application/ports/reclasificar-categoria.port.ts` | `reasignar(…, categoriaId)` + docblock | 1 |
| `apps/api/src/infrastructure/persistence/prisma-reclasificar-categoria.repository.ts` | `findFirst({ id, userId })`; `categoria` read from the row (D-05/D-06) | 1 |
| `apps/api/src/domain/errors/categoria-desconocida.error.ts` (+ spec) | `nombre` → `categoriaId` field | 1 |
| `apps/api/src/infrastructure/http/dto/reclasificar-categoria.dto.ts` | body docblock reversal; response shape unchanged | 1 |
| `apps/api/src/infrastructure/http-express/schemas/openapi-document.ts` | 400 description: "name" → id | 1 |
| `apps/api/openapi.json`, `packages/api-client/src/types.gen.ts` | **regenerated** (`openapi:emit`, `generate`) | 1 |
| `prisma-reclasificar-categoria.repository.spec.ts`, `transacciones.routes.spec.ts`, `reclasificar-transaccion.use-case.spec.ts`, `transacciones-categoria.schema.spec.ts` | rewritten around the id | 1 |
| `docs/adr/ADR-042-unicidad-de-categoria-por-bucket.md`, `docs/adr/README.md`, root `CLAUDE.md` (ADR row + stale ADR-012 note) | **new** / modified (D-13) | 1 |
| `apps/web/src/api/use-reclasificar-categoria.ts` | `ReclasificarCategoriaInput.categoriaId` (the compile trigger) | 2 |
| `apps/web/src/api/client.ts` | `postReclasificarCategoria(…, categoriaId)`, body + docblock | 2 |
| `apps/web/src/components/ReclasificarCategoriaControl.tsx` (+ test) | id-keyed identity, prop shape (D-07) | 2 |
| `apps/web/src/components/GrupoMovimientos.tsx` (+ test) | pass `{ id, nombre }` | 2 |
| `apps/mobile/src/api/categorias.ts` | `reclasificarCategoria(…, categoriaId)`, body; **guard unchanged** | 3 |
| `apps/mobile/src/components/detalle/ReclasificarMobileControl.tsx` | id-keyed identity + testID (D-08) | 3 |
| `apps/mobile/src/api/reclasificar.spec.ts` | body assertions (the only gate on the mobile wire) | 3 |
| `apps/mobile/src/domain/detalle.types.ts` | **UNCHANGED** — generated re-export, response shape stable (F-8) | — |
| `apps/api/prisma/schema.prisma` | `@@unique([userId, bucketId, nombre])` + comment (D-09) | 4 |
| `apps/api/prisma/migrations/<ts>_categoria_unica_por_bucket/migration.sql` | **new** | 4 |
| `apps/api/prisma/rehearsals/us037-catalogo-rehearsal.ts:301-304` | index assertions updated (D-09, corrects the proposal) | 4 |
| `apps/api/src/application/ports/categoria-repository.port.ts` | `existeNombre(criterio)` (D-02) | 4 |
| `apps/api/src/infrastructure/persistence/prisma-categoria.repository.ts` (+ spec) | `bucketId` in the `where` | 4 |
| `apps/api/src/application/use-cases/crear-categoria.use-case.ts` (+ spec) | criterion object | 4 |
| `apps/api/src/application/use-cases/actualizar-categoria.use-case.ts` (+ spec) | effective pair, one call, reordered validation (D-03) | 4 |
| `apps/api/src/infrastructure/persistence/catalogo-template.ts` (+ spec) | duplicate-nombre assertion (D-11) | 4 |
| `apps/api/src/domain/errors/nombre-categoria-duplicado.error.ts` (+ spec) | copy (D-12) | 4 |
| `apps/web/.../mensajes-catalogo.ts` (+ test), `apps/mobile/src/domain/mensajes-catalogo.ts` (+ spec) | copy (D-12) | 4 |
| `apps/api/test/helpers/categoria-fixture.ts` | **new** — `categoriaIdDe` (D-10) | 4 |
| `apps/api/test/{reclasificar-categoria,catalogo-rebucket,catalogo-isolation,catalogo-delete-en-uso,categorizacion,detalle-bucket,movimientos-mes,backfill-categorias}.int-spec.ts` | 10 fixture swaps to the helper | 4 |
| `apps/api/test/reclasificar-categoria.int-spec.ts`, `catalogo-crud.int-spec.ts` | **new scenarios** — the D-14 correctness + isolation gates | 4 |
| `prisma-identidad-google.repository.ts` (+ spec fixtures) | stale JSDoc example only; discriminator logic unaffected | 4 |

---

## 5. Delivery slicing (input for `sdd-tasks`)

Four chained PRs, `chain_strategy: feature-branch-chain` — the hard cutover (locked decision 3) means the API contract and both clients must reach production together, and PR2 does not typecheck until PR1's regenerated `api-client` exists.

| PR | Scope | Est. hand-written lines | Shippable alone? |
|---|---|---|---|
| **1** | ADR-042 + docs; reclassify contract → `categoriaId` across Zod/route/use case/port/adapter; `openapi:emit` + `api-client generate`; four spec rewrites | ~280 + generated | Yes — behaviour-preserving under the current constraint (D-01); breaks only clients not yet updated, which is why the chain does not merge to `main` until 3 lands |
| **2** | Web: mutation input, `client.ts`, control id-keying, `GrupoMovimientos` | ~150 | Yes |
| **3** | Mobile: `api/categorias.ts`, control id-keying, `reclasificar.spec.ts` | ~200 | Yes — completes the cutover; the tracker branch is mergeable from here |
| **4** | The constraint: schema + migration + rehearsal; `existeNombre` port/adapter; both use cases; template guard; copy ×3; the fixture helper + 10 swaps; the correctness and isolation integration tests | **~380 — at the ceiling** | Yes |

**Ordering is a hard constraint, not a suggestion (D-01): 4 must be last.** 1–3 may be reordered among themselves only if 1 stays first (2 and 3 depend on its regenerated types).

**Budget note.** Slice 4 cannot be split further without a broken intermediate: a bucket-scoped `existeNombre` against a still-bucket-blind DB index lets a legitimate create pass the app gate and then hit a raw P2002 `500`. If it overruns 400 lines, `size:exception` is the right call with this justification: roughly a third of the diff is the mechanical fixture-helper swap that `tsc` enumerates exhaustively, and the migration + schema are ~15 lines of the total.

---

## 6. Risks and open items

| Risk | Severity | Mitigation |
|---|---|---|
| A `findFirst({ userId, nombre })` fallback lands on the write path | **Critical** | D-05 states the prohibition and the reason; the adapter unit spec asserts the exact `where`; the D-14 integration test fails against a real DB if it regresses; D-01's ordering means it cannot be reached before the contract migrates |
| The positional `existeNombre` form is chosen "because it's smaller" and the PATCH call site silently passes an id as a bucket | **High** | D-02 records the miscompile in full; the criterion object makes every call site an arity error |
| Local Postgres unavailable ⇒ slice 4 cannot be written test-first | Medium | F-13: CI provisions it and gates on it, so the pipeline is covered; locally `pnpm api test:db:setup` per `apps/api/docs/local-test-db.md` is the **first task of slice 4** |
| Mobile wire migration is gated by a test, not by types (D-08) | Medium | Named explicitly; `reclasificar.spec.ts` body assertions are the gate and must not be weakened while editing |
| Stale mobile APK sends `{ categoria }` after deploy | **Certain**, accepted | Locked decision 3; single-user deployment (ADR-023); failure mode is a clean `400`, never a wrong write; APK rebuild is already a runbook step (ADR-022) |
| `ActualizarCategoriaUseCase`'s reordered validation changes an observable error code | Low | D-03 records it; `sdd-spec` pins the new order so it is deliberate |
| The us037 rehearsal fails misleadingly on the next prod-snapshot run | Low, but expensive when it fires | D-09 updates both index assertions; the script is manual so it cannot be caught by CI |
| Cross-bucket duplicates block a DB rollback | Low | D-15: code-only rollback is always safe; the runbook gains the detection query |
| Slice 4 exceeds the 400-line budget | High | `size:exception` with the mechanical-churn justification; splitting creates a broken intermediate |

**Assumptions requiring validation at apply time:**
- `BUCKET_IDS[criterio.bucket as Bucket]` returns a defined id for all three assignable names — mirrors the existing `crearConPatrones:150` cast, but confirm `BUCKET_IDS` covers exactly `Bucket` before relying on the cast in a gate.
- `apps/api/test/helpers/` does not yet exist; confirm the vitest `include` globs for `test:integration` do not pick up a non-spec file placed there.
- `prisma generate` drops `userId_nombre` from `CategoriaWhereUniqueInput` once the field list changes (the exhaustive-enumeration guarantee D-10 rests on) — verify on the first `pnpm api build` of slice 4 rather than assuming.

**Resolved from the proposal:** open choices 1 (D-02), 2 (D-03), 3 (D-06), 4 (D-11), 5 (D-10), 6 (D-14). Open **product** questions 1–4 are deliberately left to the user; question 5 is answered by D-15's runbook step. One proposal statement is **corrected**: `us037-catalogo-rehearsal.ts` is not "Unchanged" (D-09, F-14), and `apps/mobile/src/domain/detalle.types.ts` needs no edit (D-06, F-8).
