# Proposal: US-038 — API CRUD for categories and classification patterns

- **Change**: `us-038-catalogo-crud`
- **Issue**: [#272](https://github.com/Juargo/MoneyDiary/issues/272) · Milestone `Sprint-12`
- **Status**: Proposed (2026-08-11)
- **Builds on**: US-037 / ADR-036 (per-user catalog, merged + deployed + archived)
- **Requires new ADR**: No — this change *executes* ADR-036's deferred CRUD. It does, however,
  retire the closed `Categoria` enum, which ADR-036 explicitly assigned to US-038
  ("`domain/` casi no cambia … US-038 es dueño de cualquier cambio ahí"). Design phase decides
  whether that warrants an ADR-036 amendment note or a new ADR.

## Intent

Give every user a real HTTP surface to **create, edit and delete their own categories and their
auto-classification patterns**, on top of the per-user row ownership US-037 established.

To do that honestly, this change also **finishes the job US-037 deliberately left half-done**: the
rows became per-user, but `domain/` still treats category names as a closed 8-value TypeScript enum.
As long as that enum is the authority on "which categories exist", a user-created category is a
second-class citizen that silently folds to `null` on read and is rejected on reclassify.

After this change:

- A user can add `Mascotas → Deseos`, attach `"petbrands"` as a `CONTAINS` pattern, rename it,
  re-bucket it, and delete it — all scoped by `userId` in SQL.
- **The authority for "is this category valid" is ownership, not name membership.** A row read
  through a `userId`-scoped query is valid by construction.
- The `Categoria` enum survives only as **template content** (what a new user starts with),
  demoted out of `domain/`.

## Why now

1. **US-038 is the payoff of US-037.** The ownership migration cost 7 chained PRs and shipped zero
   user-visible value. This change is where that investment becomes a feature.
2. **The half-migrated state is a live trap.** Today nothing stops a future PR from adding a write
   path that produces a name outside the enum; the result would be a category that exists in the DB,
   belongs to the user, and is invisible on the dashboard — with no error anywhere. That is exactly
   the failure mode ADR-036 D-09 was written to kill, reachable again through a different vector.
3. **It unblocks the visible work.** US-039 (delete a category in use, with migration) and US-043
   (the web UI) both need this API to exist first.
4. **The demo read-only rule has no enforcement point yet.** ADR-036 precondition 1 is currently a
   promise in a document. This change is the first one that can — and must — make it code.

## Scope

### In scope

**A. Retire the closed enum from the domain** (binding user decision 1)

- `Categoria.nombre` becomes `string` across `domain` / `application` / the read folds.
- Bucket is **always** resolved from the row's own `bucketId` / `categoria.bucket` relation, never
  from a name-keyed map.
- `CATEGORIA_BUCKET` and the enum move to `catalogo-template.ts` as template data.
- `foldCategoria` stops validating names against the enum.
- `PatronClasificacion`'s bucket getter reads row data instead of deriving from the name.

**B. The CRUD surface** — 7 endpoints (1 read + 6 write), Zod transport schemas, `openapi.json`
regeneration (CI-gated), `@moneydiary/api-client` regeneration (CI-gated).

**C. Demo gate** (binding user decision 2, ADR-036 precondition 1) — `esDemo` loaded once per
request in the session lookup; every catalog **mutation** use case refuses with `403` +
`DEMO_SOLO_LECTURA` and register-account guidance.

**D. Case-insensitive name uniqueness** (binding user decision 3) — enforced in the application
layer, `409` on collision, stored as typed, no migration.

**E. Reclassify-to-custom-category** (binding user decision 4) — `ReclasificarTransaccionUseCase`
stops gating on enum membership and resolves the caller's own `(userId, nombre)` row.

**F. Delete semantics for a category NOT in use** — patterns cascade with the category inside one
DB transaction; a category **in use** is rejected with a specific `409` (the migration flow itself
stays US-039).

**G. Bucket re-stamp on category re-bucketing** — see Approach §7. Not optional: skipping it breaks
the documented "transaction bucket === its category's bucket" invariant.

**H. Tests** — unit specs per use case, route specs, schema-vs-DTO sync specs, and an integration
test in the `catalogo-isolation.int-spec.ts` style proving user B cannot read, rename, re-bucket or
delete user A's catalog rows (RNF-SEC-006), plus a demo-gate integration test.

### Non-goals (out of scope)

| Not doing | Owner |
|-----------|-------|
| Delete a category **in use** (reassign / migrate its transactions) — this change only *defines and rejects* the case | **US-039** |
| Any web or mobile UI for catalog management | **US-043** |
| Demo-gating pre-existing mutations (`POST /api/ingestas`, `PATCH /api/transacciones/:id/categoria`). Demo users keep uploading and reclassifying — only the **catalog** is read-only per ADR-036 | — |
| Moving a pattern between categories via `PATCH` (delete + create instead) | deferred |
| Per-user `BucketPresupuesto`. Buckets stay the global fixed 50/30/20 taxonomy | ADR-036 |
| Template versioning / propagating template edits to existing users | ADR-036 (unchanged) |
| Accent-insensitive name matching (`Almacén` ≠ `Almacen`) | YAGNI, recorded below |
| Changing the reclassify wire contract to be id-based instead of name-based | US-043 companion |
| Deleting `prisma/backfill-categorias.ts` (still frozen per ADR-036 D-10; it gets a mechanical import fix only) | deferred, as in ADR-036 |

## Approach

### 1. The enum becomes template data, and `tsc` performs the migration

Following ADR-036 D-09's proven tactic — **delete, don't adapt**, so the compiler (not a reviewer's
grep) finds every call site:

- `apps/api/src/domain/value-objects/categoria.ts` is **deleted**. `Categoria`, `CATEGORIA_BUCKET`
  and `bucketDeCategoria()` disappear from `domain/`.
- `CATEGORIA_TEMPLATE` in `infrastructure/persistence/catalogo-template.ts` stops being derived
  from the enum and becomes the literal source list:

  ```ts
  export const CATEGORIA_TEMPLATE = [
    { nombre: 'Supermercado', bucket: Bucket.Necesidades },
    // … 8 rows
  ] as const;

  /** Compile-time union of the template's own names — NOT a constraint on user data. */
  export type CategoriaTemplateNombre = (typeof CATEGORIA_TEMPLATE)[number]['nombre'];
  ```

- `PATRON_TEMPLATE`'s `categoria` field is typed `CategoriaTemplateNombre`, so the compiler still
  guarantees the template is internally consistent (no pattern pointing at a category the template
  does not define) — the one guarantee worth keeping, at zero cost. `CATEGORIA_IDS` re-keys to the
  same union.

**Guarantee traded away, explicitly:** `Record<Categoria, Bucket>` was *total* — the compiler proved
no category was bucket-less. That proof is replaced by the DB: `Categoria.bucketId` is a `NOT NULL`
FK, so a bucket-less category is unrepresentable in the only place that now matters. The compiler
proof is retained where it still applies — the template.

### 2. `PatronClasificacion` carries its category, bucket included

```ts
interface PatronClasificacionProps {
  readonly id: string;
  readonly patron: string;
  readonly matchType: MatchType;
  readonly categoria: { id: string; nombre: string; bucket: Bucket }; // ← nested, not loose
  readonly prioridad: number;
}

get bucket(): Bucket { return this.categoria.bucket; }
```

The nesting is the point. Today's invariant — *"bucket is DERIVED from the category, never accepted
independently"* (CAT-02) — is currently held by a name-keyed lookup. Accepting `bucket` as a **loose
sibling field** would let a caller pass a mismatched pair and silently break the 50/30/20 math.
Accepting it **inside** the category object keeps the sentence "the bucket comes from the category"
true at the type level; the repository (`include: { categoria: { include: { bucket } } }`) is the
single production construction site, and its spec asserts it.

`coincide()` — including the REGEX `try/catch` that already satisfies **CA-05** — is untouched.

### 3. Categorization write path carries `categoriaId`, not a name

`CategorizarTransaccionResult.categoria` widens from `Categoria | null` to
`{ id: string; nombre: string } | null`. The id is already in hand (it comes from the matched
pattern's own row), which lets `PrismaTransaccionBucketRepository` **delete** its
`categoria.findMany({ where: { userId } })` + name→id map + the "categoría no encontrada en el
catálogo del usuario" throw. Net: less code, one less query, and one failure mode gone — a name
lookup would now be racy, because names became mutable in this very change.

`agruparPorCategoriaBucket` keys on `categoriaId | null` instead of the enum; the frozen
`backfill-categorias.ts` maps its fixed names through `CATEGORIA_IDS` before calling it.

*Design-phase fallback if the blast radius surprises:* widen the existing name-based path to
`string` and keep the lookup. Smaller diff, keeps the race. Recorded, not recommended.

### 4. `foldCategoria` — ownership is the authority

```ts
export function foldCategoria(
  categoria: { id: string; nombre: string } | null | undefined,
): { id: string; nombre: string } | null
```

Only `null`/`undefined` folds to `null` (Ingreso / SinCategoria — unchanged semantics). The
`CATEGORIA_NOMBRES.has()` guard is removed.

**This is a conscious change of guarantee, not a relaxation of security.** The defensive check was
never the isolation mechanism: the row arrives from a query that already carried `userId` in its
`WHERE`. Keeping the check would mean every user-created category disappears from the dashboard
without an error — the precise defect ADR-036 D-09 fixed, re-armed. `fold-categoria.spec.ts`'s
"unknown nombre folds to null (defensive)" test inverts into "any owned category name passes
through", and that inversion is the point of the test.

**Wire-contract impact: none.** `buckets.schema.ts` already types `categoria.nombre` as
`z.string()` (transport-shape-only, per its layer-honesty gate), and
`apps/web/src/lib/category-icons.ts` already falls back to a generic `Receipt` icon for unknown
names. Existing response contracts are byte-identical; arbitrary names were always legal on the
wire. `openapi.json` changes only by **addition** of the new endpoints.

### 5. HTTP surface

Flat resources, one registrar function per resource, closure-DI — the `ingesta.routes.ts` /
`transacciones.routes.ts` shape. No nested `/categorias/:id/patrones` route: this API has no
nested-resource precedent, and a nested create buys nothing an ownership check does not already
have to do.

| Method | Path | Success | Error statuses |
|--------|------|---------|----------------|
| `GET` | `/api/categorias` | `200` | `401` |
| `POST` | `/api/categorias` | `201` | `400` `403` `409` |
| `PATCH` | `/api/categorias/:id` | `200` | `400` `403` `404` `409` |
| `DELETE` | `/api/categorias/:id` | `204` | `403` `404` `409` (in use) |
| `POST` | `/api/patrones` | `201` | `400` `403` `404` `409` |
| `PATCH` | `/api/patrones/:id` | `200` | `400` `403` `404` `409` |
| `DELETE` | `/api/patrones/:id` | `204` | `403` `404` |

- **`GET /api/categorias` is not speculative** — it is the only way a client can obtain the ids that
  every write endpoint needs, and the only way to observe **CA-03** (a zero-pattern category).
  Patterns are returned **nested** inside their category (~8 categories / ~20 patterns: one round
  trip, no second endpoint).
- **`404` merges "does not exist" and "is not yours"** — the anti-enumeration rule already used by
  `IngestaNoEncontradaError` / `TransaccionNoEncontradaError`.
- **Bucket travels by NAME, not by id.** The body field is `bucket: "Necesidades" | "Deseos" |
  "Ahorro"`, matching the vocabulary `GET /api/buckets/:bucket` already exposes; `BUCKET_IDS`
  resolves it in infra. `Ingreso` and `SinCategoria` are computed states and are **not assignable**
  — a request naming them gets the same `400` as a missing bucket (**CA-01**).
- **Zod schemas are transport-shape-only** (`categorias.schema.ts`, `patrones.schema.ts`), per the
  `buckets.schema.ts` layer-honesty gate: shape and types here, business rules in the use case.
  Registered in `schemas/openapi-document.ts`'s fixed-order registry; `openapi:check` and the
  `api-client` job (both already CI gates — verified) enforce no drift.
- **Error bodies on the new endpoints are `{ message, code }`.** Existing endpoints return
  `{ message }` only and stay untouched; `code` is additive and must be treated as optional by
  clients. Introduced because decision 2 requires a machine-readable `DEMO_SOLO_LECTURA`, and a
  `code` on exactly one status of one resource would be worse than a consistent one.

### 6. Use cases, ports and errors

Seven thin `Result`-returning use cases, Spanish names, one operation each — the repo has no
service-god-object precedent and this change will not create one:

`ListarCatalogoUseCase` · `CrearCategoriaUseCase` · `ActualizarCategoriaUseCase` ·
`EliminarCategoriaUseCase` · `CrearPatronUseCase` · `ActualizarPatronUseCase` ·
`EliminarPatronUseCase`

Two ports, grained by **resource** (`ICategoriaRepository`, `IPatronRepository`) — the
`IIngestaRepository` / `ISessionRepository` precedent. Not one god port (ISP), not seven
single-method ports (that is fragmentation, not segregation: one Prisma adapter backs them all).

New domain errors, one per condition, each mapping to exactly one status:
`CategoriaNoEncontradaError` (404) · `NombreCategoriaInvalidoError` (400) ·
`BucketNoAsignableError` (400) · `NombreCategoriaDuplicadoError` (409) · `CategoriaEnUsoError` (409)
· `PatronNoEncontradoError` (404) · `PatronInvalidoError` (400) · `PatronDuplicadoError` (409) ·
`CatalogoDemoSoloLecturaError` (403). Every route keeps the `const _exhaustive: never = error`
guard, so a new variant fails compilation rather than falling through to a wrong status.

`CategoriaInvalidaError` — whose message hardcodes the 8 enum names, mirrored verbatim in
`transacciones.routes.ts` — is **deleted**, not edited (D-09 tactic again). Its replacement says
*"la categoría indicada no existe en tu catálogo"* and enumerates nothing.

### 7. Editing a category's bucket re-stamps its transactions

`Transaccion.bucketId` is denormalized and written atomically with `categoriaId` precisely so the
two columns can never disagree (CAT-02). Re-bucketing `Delivery` from `Deseos` to `Necesidades`
without touching history would leave past transactions in `Deseos` while their category says
`Necesidades` — the 50/30/20 percentages and the semáforo would then disagree with what the user
sees in the category list, with nothing flagging it.

So `ActualizarCategoriaUseCase`, when and only when the bucket actually changes, re-stamps in the
same DB transaction:

```sql
UPDATE "Transaccion" SET "bucketId" = $new
WHERE "categoriaId" = $id AND "accountId" IN (SELECT id FROM "Account" WHERE "userId" = $user)
```

Rejected alternative: forbid bucket edits (rename-only). Cheaper, but it strands any user who picks
the wrong bucket at creation time behind a delete-and-recreate that destroys their patterns.

### 8. Deleting a category

1. **In-use check** — a category is *in use* if any `Transaccion` references it (any period).
   Patterns are **not** "use": they are owned children, meaningless without their parent, and the
   composite FK requires deleting them first anyway.
2. In use → `409 CategoriaEnUsoError`, message points at reassigning first. **The migration flow is
   US-039**; this change only makes the case explicit and safe.
3. Not in use → delete its patterns, then the category, **in one DB transaction**. `204`, no body.
   The pattern loss is silent by design at the API level; the UI (US-043) can warn using the nested
   patterns `GET /api/categorias` already returns.

**Concession recorded:** check-and-delete lives inside the adapter's `$transaction`, so the *rule*
("in use ⇒ refuse") is named by a domain error but *evaluated* next to the write. The alternative —
use case asks, then use case deletes — is a TOCTOU window where a concurrent ingesta could
categorize into a category between the two calls. `onDelete: SetNull` on `Transaccion.categoriaId`
caps the residual blast radius at "transactions lose their category", never an FK error or a
cascade delete of money rows.

### 9. Demo gate — fact in the middleware, rule in the application layer

- `ISessionRepository.buscarPorTokenHash` selects `user: { select: { esDemo: true } }` alongside the
  existing fields — **one query, no extra round trip**. `ValidarSesionResult` gains `esDemo`;
  `sessionMiddleware` writes `req.esDemo` next to `req.userId`; `express-request.d.ts` is extended.
- The **rule** stays in `application`: `esDemo` is a **required** (non-optional) field on every
  catalog-mutation use case input, so a route that forgets to thread it **fails to compile** rather
  than silently defaulting to permissive. Each use case's first line returns
  `Result.fail(new CatalogoDemoSoloLecturaError())`.
- Response: `403 { message: "Las categorías de la cuenta demo son de solo lectura. Creá una cuenta
  para personalizar tu catálogo.", code: "DEMO_SOLO_LECTURA" }` — same UX family as
  `DemoUploadNudge.tsx` ("Los datos de esta cuenta demo son temporales…" + *Crear cuenta* CTA),
  which is the existing prompt ADR-036 precondition 1 refers to.
- Rejected: a `demoGuardMiddleware` mounted on the catalog router. DRY-er per route, but it puts a
  business rule in HTTP infra, is unit-testable only through HTTP, and is *forgettable* at the level
  that matters — the day someone adds a second catalog router.

### 10. Validation rules and `prioridad`

| Field | Rule |
|-------|------|
| `nombre` | trimmed, 1–40 chars, stored **as typed**; uniqueness per user is **case-insensitive** (`409`), via a `userId`-scoped `mode: 'insensitive'` query — in SQL, never in memory |
| `bucket` | required on create; must be `Necesidades` / `Deseos` / `Ahorro` (**CA-01**) |
| `patron` | trimmed, 1–200 chars; unique per user **case-insensitively** (`409`) |
| `matchType` | required, one of `CONTAINS` / `STARTS_WITH` / `REGEX` (**CA-02**) — first write path in the repo that validates it; today only the frozen template sets it |
| `prioridad` | optional integer, `1..999`, **default `100`**; lower wins (`asc`, existing semantics) |

**`prioridad` and ADR-036 precondition 2.** The tie-break stays `(prioridad, patron, id)` — total
and user-independent — and this change *strengthens* it: because `patron` is now unique per user,
the `id` term can never decide the outcome inside one user's catalog, which is exactly where cuid
ids would have made ordering arbitrary. The default of `100` sits above every template priority
(max `25`), so a new user pattern never silently outranks the curated Chilean rules unless the user
deliberately sets a lower number. Duplicate `prioridad` values remain legal and deterministic.

**Pattern uniqueness is a deliberate strengthening** (exploration flagged this as open): the DB has
no `(userId, patron)` constraint and this change adds **no migration** — the rule is enforced in the
application layer only. It forbids the rare "same text, two match types" setup; the workaround is a
trivially different pattern string. Verified compatible with the template: all 20 template pattern
texts are distinct.

**REGEX validity is checked at write time**: `new RegExp(patron)` inside the use case, throw ⇒
`400 PatronInvalidoError`. This does **not** weaken **CA-05** — `coincide()`'s runtime `try/catch`
stays exactly as is, so any pattern that predates this rule (or slips past it) still degrades to
"no match" and never breaks categorization. The write-time check is an earlier, friendlier gate,
not a replacement.

### 11. Reclassify moves to the per-user lookup (binding decision 4)

`ReclasificarTransaccionUseCase` drops `CATEGORIAS_VALIDAS` and `CATEGORIA_BUCKET`. The writer
`PrismaReclasificarCategoriaRepository.reasignar(userId, transaccionId, nombre)` — which **already**
resolves the row through the `userId_nombre` composite unique — becomes the single source of both
the `categoriaId` and the `bucket`, and the use case shrinks to delegation plus error mapping.

**Wire contract unchanged**: the body stays `{ categoria: "<nombre>" }`. Moving it to `categoriaId`
would be more honest now that names are mutable, but it breaks `apps/web` — which is US-043's
change, not this one.

**Accepted consequence, stated so it is not discovered in production:** `apps/web`'s reclassify
`<select>` is a hardcoded 8-name mirror. Once a user renames or deletes a template category, that
dropdown offers a name their catalog no longer has, and the request gets a clean
`400 "la categoría indicada no existe en tu catálogo"` instead of succeeding. That is *correct*
behaviour and a *known UX gap* until US-043 makes the dropdown data-driven. Recorded as an accepted
risk, not an oversight.

## Affected areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/domain/value-objects/categoria.ts` | **Deleted** | Enum + `CATEGORIA_BUCKET` move to the template |
| `apps/api/src/domain/value-objects/patron-clasificacion.ts` | Modified | Nested `categoria: {id, nombre, bucket}`; bucket getter reads row data |
| `apps/api/src/domain/errors/categoria-invalida.error.ts` | **Deleted** | Replaced by `CategoriaNoEncontradaError`; enumerated message dies with it |
| `apps/api/src/domain/errors/*.ts` | New (×9) | Catalog CRUD + demo-gate error family |
| `apps/api/src/infrastructure/persistence/catalogo-template.ts` | Modified | Literal template + `CategoriaTemplateNombre` union |
| `apps/api/src/infrastructure/persistence/fold-categoria.ts` | Modified | Ownership is the authority; returns `nombre: string` |
| `apps/api/src/infrastructure/persistence/categoria-ids.ts` | Modified | Re-keyed to the template union |
| `apps/api/src/infrastructure/persistence/prisma-catalogo-clasificacion.repository.ts` | Modified | Include `categoria.bucket`; build the nested VO |
| `apps/api/src/infrastructure/persistence/prisma-transaccion-bucket.repository.ts` | Modified | Write `categoriaId` directly; name→id lookup deleted |
| `apps/api/src/infrastructure/persistence/prisma-reclasificar-categoria.repository.ts` | Modified | Resolves and returns the bucket too |
| `apps/api/src/infrastructure/persistence/prisma-categoria.repository.ts`, `prisma-patron.repository.ts` | New | CRUD adapters, `userId` in every `WHERE` |
| `apps/api/src/infrastructure/persistence/prisma-session.repository.ts` | Modified | Select `user.esDemo` |
| `apps/api/src/application/use-cases/{listar-catalogo,crear-categoria,actualizar-categoria,eliminar-categoria,crear-patron,actualizar-patron,eliminar-patron}.use-case.ts` | New | 7 thin coordinators |
| `apps/api/src/application/use-cases/{categorizar,reclasificar}-transaccion.use-case.ts` | Modified | Widened result / per-user lookup |
| `apps/api/src/application/use-cases/validar-sesion.use-case.ts` | Modified | Returns `esDemo` |
| `apps/api/src/application/ports/{categoria,patron}-repository.port.ts` | New | Resource-grained write ports |
| `apps/api/src/application/ports/{session-repository,transaccion-bucket-writer,reclasificar-categoria}.port.ts` | Modified | `esDemo` / `categoriaId` / bucket in the result |
| `apps/api/src/application/services/agrupar-por-categoria-bucket.ts` | Modified | Key on `categoriaId` |
| `apps/api/src/infrastructure/http-express/routes/{categorias,patrones}.routes.ts` | New | Registrar functions, closure-DI, exhaustive error switch |
| `apps/api/src/infrastructure/http-express/routes/transacciones.routes.ts` | Modified | New error mapping, enumerated message removed |
| `apps/api/src/infrastructure/http-express/middleware/session.middleware.ts` + `express-request.d.ts` | Modified | `req.esDemo` |
| `apps/api/src/infrastructure/http-express/schemas/{categorias,patrones}.schema.ts` + `openapi-document.ts` | New/Modified | Transport-shape-only Zod + fixed-order registration |
| `apps/api/src/composition/container.ts` + `crear-*` | Modified | Wire 7 use cases + 2 repositories |
| `apps/api/openapi.json`, `packages/api-client/src/types.gen.ts` | **Generated** | Regenerated; both CI drift-gated |
| `apps/api/prisma/backfill-categorias.ts` | Modified | Mechanical import fix only (stays frozen, D-10) |
| `apps/api/prisma/schema.prisma` + migrations | **Unchanged** | No migration: `userId`, `bucketId`, `@@unique([userId, nombre])` all already exist |
| `apps/web/**`, `apps/mobile/**` | **Unchanged** | Contract is additive; `pnpm web test` is a verification step, not a work item |

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Widening `Categoria`→`string` silently loosens a type that was load-bearing elsewhere** (buckets, resumen, semáforo) | Medium | Critical (money math) | The 50/30/20 and semáforo math keys on `Bucket`, never on category names (verified). Deleting the enum module makes `tsc` enumerate every consumer — no grep-based confidence |
| **Bucket/category desync after a re-bucket edit** | High if §7 is skipped | High | Re-stamp in the same DB transaction + integration test asserting the resumen moves with the category |
| **User-supplied REGEX blocks the event loop** (catastrophic backtracking, Node is single-threaded → self-inflicted DoS affecting all users) | Low | High | 200-char cap + write-time compile check now; `re2` / execution timeout recorded as the deferred fix with an explicit trigger (first slow-ingesta report) |
| **Demo gate forgotten on a use case added later** | Medium | Medium (policy breach) | `esDemo` is a **required** input field ⇒ compile error, not a silent default. Integration test per mutation endpoint |
| **Case-insensitive uniqueness race** (two concurrent creates of `Mascotas`/`mascotas` both pass the check; the DB's case-*sensitive* unique lets both in) | Low | Low | Accepted: degrades to two similarly-named categories, never corruption. A citext/functional-index migration is the trigger-gated fix |
| **Web reclassify dropdown offers stale names after a rename** | Medium | Medium (UX) | Accepted and documented (§11); clean `400`, no data damage; closed by US-043 |
| **In-use check TOCTOU vs. a concurrent ingesta** | Low | Low | Check + delete in one transaction; `onDelete: SetNull` caps the worst case at "category lost", never an FK error |
| **`openapi.json` / `types.gen.ts` drift** | Low | Low | Both are already CI gates (`openapi:check`, `api-client` job) — verified, not assumed |
| **Scope creep into US-039** (someone "just adds" reassignment to the delete path) | Medium | Medium | Explicit non-goal; the `409` is the deliverable, the migration is not |
| **Generated files inflate the PR diff past the 400-line budget** | High | Low | Split per §Delivery; flag generated files to reviewers as read-once, not line-by-line |
| **Integration tests need a real Postgres** | Medium | Medium | Already solved: `apps/api/docs/local-test-db.md` + the CI ephemeral DB (PR #149) |

## Success criteria

| AC | Criterion |
|----|-----------|
| **CA-01** | `POST /api/categorias` requires `nombre` + `bucket`; a missing, unknown, or non-assignable bucket (`Ingreso`/`SinCategoria`) returns `400`; the three assignable buckets are `Necesidades`/`Deseos`/`Ahorro` |
| **CA-02** | Patterns can be created, updated and deleted with `CONTAINS`/`STARTS_WITH`/`REGEX` + value; an invalid `matchType` returns `400` |
| **CA-03** | A category created with no patterns is valid, is returned by `GET /api/categorias` with `patrones: []`, and classifies nothing (manual-only) |
| **CA-04** | Every endpoint requires a valid session **and** `x-api-key`; every catalog query and mutation carries `userId` in the SQL `WHERE`; an integration test proves user B gets `404` (not `403`) reading, renaming, re-bucketing or deleting user A's rows |
| **CA-05** | An invalid REGEX is rejected at write time with `400`, **and** `coincide()`'s `try/catch` still returns `false` for any malformed pattern already stored — categorization never throws |
| **CA-06** | `openapi.json` regenerated and `openapi:check` green; `types.gen.ts` regenerated and the `api-client` drift gate green; amounts stay BigInt-safe strings wherever they appear |
| — | **Demo gate**: every catalog mutation from an `esDemo` session returns `403` + `code: "DEMO_SOLO_LECTURA"`; `GET /api/categorias` still works for demo users |
| — | **Enum retired**: `domain/value-objects/categoria.ts` no longer exists; no runtime path validates a category name against a closed set |
| — | **In-use delete**: deleting a category referenced by ≥1 transaction returns `409`; deleting one with patterns but no transactions returns `204` and removes its patterns |
| — | **Bucket integrity**: after re-bucketing a category, its historical transactions report the new bucket in `/api/resumen` and the bucket drill-down |
| — | `pnpm api test`, `pnpm api test:integration`, `pnpm web test`, `pnpm api exec tsc --noEmit`, `pnpm api openapi:check` all green |

## Delivery and size forecast

The exploration smelled "1–2 PRs". **Validated: 2 PRs, chained.** They are separable by a clean
seam and the first is behaviour-preserving, which makes it independently reviewable and revertable.

| PR | Content | Shape |
|----|---------|-------|
| **#1 — Domain widening** | Enum retirement, VO reshape, `foldCategoria`, categorization/reclassify paths, `agrupar`, all affected specs. **No new endpoints, no behaviour change**, `openapi.json` byte-identical | Mostly test churn; a green suite *is* the acceptance criterion |
| **#2 — CRUD surface** | `esDemo` threading, 7 use cases + 2 ports + 2 adapters, 2 routers, Zod schemas, container wiring, `openapi.json` + `types.gen.ts` regeneration, integration + demo-gate tests | Feature PR; generated files dominate the line count |

Both PRs will likely exceed 400 changed lines once specs and generated files are counted. The tasks
phase owns the real forecast and the `chained-pr` decision; `feature-branch-chain` is the natural
fit (US-037's precedent), since PR #1 alone ships no user value.

## Rollback plan

1. **No migration, no data transformation** — this is the structural difference from US-037.
   Rollback is `git revert` + redeploy, with no snapshot dance and no data to restore.
2. **Rows created before a rollback survive as orphans of intent**: a user-created `Mascotas`
   category would still exist in the DB, and reverting §1/§4 would make it fold to `null` again —
   invisible, not corrupt. Recovery is re-deploying, not repairing. Worth stating in the deploy
   notes; not worth engineering around.
3. **PR #1 is independently revertable** (behaviour-preserving refactor). PR #2 is revertable on its
   own only while PR #1 stays; reverting #1 alone breaks compilation.

## Open questions (non-blocking — resolve in design)

1. **Does retiring the enum warrant an ADR?** It reverses a documented `domain/` invariant
   (`CATEGORIA_BUCKET` as "the single source of truth"). Options: an amendment note on ADR-036, or
   ADR-037. Leaning amendment — ADR-036 already assigned this change to US-038.
2. **Error-body `code` field** (§5): new endpoints only, as proposed, or a broader convention? Only
   the former is in scope; the latter would be a separate consistency change.
3. **Merging the two `400`-family category errors** (`NombreCategoriaInvalidoError` +
   `BucketNoAsignableError`) into one error carrying a reason. One-class-per-condition matches repo
   style; design may prefer fewer classes.
4. **Whether `ActualizarCategoriaUseCase` should accept a partial body** (`nombre` only, `bucket`
   only, or both) or require both. Partial is friendlier; both is simpler to validate.
5. **`categoriaId`-carrying vs. name-carrying categorization path** (§3) — recommended path stated,
   fallback recorded; design confirms against the real blast radius in `agrupar` + the frozen
   backfill script.

None of these block the spec or design phase.
