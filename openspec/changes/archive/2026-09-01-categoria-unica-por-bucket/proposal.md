# Proposal: Categoría name uniqueness becomes per-bucket

## Intent

The seeded catalog (`catalogo-template.ts`) ships `Transporte` under `Necesidades`. A user importing a cartola opens the preview, picks the bucket `Deseos` (labelled "Gustos" in the UI) for a row, and tries to create `Transporte` there through the inline "nueva categoría" form. The request is rejected with `409 NOMBRE_DUPLICADO` — "Ya existe una categoría con ese nombre." — even though no categoría named `Transporte` exists in `Deseos`. The user is told a categoría exists that, from their point of view, does not.

The cause is that `Categoria` uniqueness is `@@unique([userId, nombre])` (`apps/api/prisma/schema.prisma:149`): global per user, bucket-blind. That was a reasonable simplification when the catalog was a fixed 8-row template with no cross-bucket name collisions (ADR-036/037). It stopped being reasonable the moment users could author their own catalog (US-038) and create categorías inline from the import preview: the same *word* legitimately means different things in different buckets. `Transporte` as a commute cost is a need; `Transporte` as a weekend trip is a want. The 50/30/20 verdict — the entire product promise — depends on the user being able to express exactly that distinction.

This change moves the invariant to `@@unique([userId, bucketId, nombre])`: a name is unique **within a bucket**, reusable **across buckets**. Because a name alone stops identifying a categoría, the reclassify wire contract migrates from `nombre` to `categoriaId` in the same change — not as polish, but because leaving it name-keyed converts a clean rejection into silently misclassified money (see **The correctness risk** below).

## Product decisions — locked (do NOT reopen in `spec` or `design`)

| # | Decision |
|---|----------|
| 1 | **Uniqueness invariant** becomes `(userId, bucketId, nombre)`. A user MAY reuse a name across buckets and MUST NOT reuse it within one bucket. |
| 2 | **The reclassify wire contract migrates from `nombre` to `categoriaId`** (exploration Option A). Rationale: both options require the clients to carry `categoria.id` through local state anyway (their current name-keyed lookups are already broken by duplicates), and id-keying is the established precedent for every other money-affecting write in this codebase (`RegistrarMovimientoForm`, `FilaRevision`, `CategoriaFila`, `EditarCategoria`). Option B (`{ categoria, bucket }`) would do the same client work and then throw the id away to re-derive name+bucket for the wire. |
| 3 | **Hard cutover — no transition alias.** The endpoint accepts only `categoriaId`. **Accepted consequence:** the mobile APK must be rebuilt and reinstalled alongside the API deploy (ADR-022 internal distribution); an already-installed APK that still sends `{ categoria: nombre }` will get a `400` on reclassify until it is replaced. This is acceptable because the deployment is single-user today (ADR-023) and the rebuild is a known step in the mobile release runbook. |
| 4 | **The `ActualizarCategoriaUseCase` bucket-only-PATCH gap ships in the SAME slice as the migration.** Splitting them would leave a latent raw-P2002 `500` in production the first time a user re-buckets a categoría into a bucket that already holds that name. |
| 5 | **No label changes in any categoría selector.** The existing per-bucket grouping is the disambiguator — `<optgroup>` on web, sectioned lists on mobile, bucket-filtered select in the upload preview. Duplicate names never appear inside a single group, so no `"Transporte (Gustos)"` suffixes are introduced. |
| 6 | **Case-insensitivity is DEFERRED (YAGNI).** See Non-Goals. |

## The correctness risk (the reason contract migration is mandatory)

`PrismaReclasificarCategoriaRepository.reasignar` today resolves the target categoría with `prisma.categoria.findUnique({ where: { userId_nombre: { userId, nombre } } })` (`prisma-reclasificar-categoria.repository.ts:59-62`). Prisma derives that compound selector name from the exact field list in `@@unique([...])`. Once the constraint becomes `(userId, bucketId, nombre)`, the generated selector becomes `userId_bucketId_nombre` and **requires a `bucketId` the endpoint does not have** — the endpoint's whole job is to resolve a categoría from what the client sent.

The dangerous part is the shape of the failure. The obvious "make it compile" fix is:

```ts
findFirst({ where: { userId, nombre } })   // compiles, type-checks, tests pass
```

That returns **one of N same-named rows, non-deterministically**, and reclassifies the transaction into a categoría in the wrong bucket. There is no exception, no `400`, no log line: the money simply lands in `Necesidades` when the user asked for `Deseos`, and the 50/30/20 semáforo reports a verdict the user never chose. Both the web and mobile controls compound it — `ReclasificarCategoriaControl.tsx:109-110` (`.find(c => c.nombre === nombre)`) and `ReclasificarMobileControl.tsx:311-312` (`cat.nombre === categoriaActual.nombre`) resolve local state by name too, so the cross-bucket confirmation dialog can describe a *different* row than the one the server will write.

This is a **silent money-misclassification** class of bug, which is exactly the risk category this project weights heaviest (ADR-015: "dinero con tipos exactos" + BDD-executable criteria). Type-checking will not catch it; only a dedicated integration test ("two same-named categorías in different buckets → reclassify resolves the correct one") will. Hence: the constraint relaxation MUST NOT land before the reclassify path is id-keyed. The slicing below encodes that as a hard ordering constraint.

## Scope

### In scope

**Data model — `apps/api/prisma`**
- `schema.prisma:149`: `@@unique([userId, nombre])` → `@@unique([userId, bucketId, nombre])`. `@@unique([id, userId])` (composite-FK target, ADR-036) and `@@index([bucketId])` are untouched.
- One forward-only migration `.sql` in house style (see **Migration**).

**API — `apps/api/src`**
- `ICategoriaRepository.existeNombre` becomes bucket-scoped. `bucket` travels as a validated **name** (`Necesidades`/`Deseos`/`Ahorro`); only the adapter resolves `BUCKET_IDS[bucket]` (ADR-005, and the port's own docblock at `categoria-repository.port.ts:48-53` already states this rule).
- `CrearCategoriaUseCase`: uniqueness check scoped to the target bucket.
- `ActualizarCategoriaUseCase`: the uniqueness check must run for **rename**, **re-bucket**, and **both at once** — today it only runs inside the `input.nombre !== undefined` branch (`actualizar-categoria.use-case.ts:74-98`), which under the new constraint leaves re-bucket collisions to surface as a raw Prisma P2002 `500`.
- Reclassify chain migrated to `categoriaId` end-to-end: Zod schema `transacciones-categoria.schema.ts` → route `transacciones.routes.ts` → `ReclasificarTransaccionUseCase` → `IReclasificarCategoriaWriter.reasignar` port → Prisma adapter (`findFirst({ where: { id: categoriaId, userId } })`, `userId`-scoped per RNF-SEC-006).
- `NombreCategoriaDuplicadoError` message updated (see **User-facing copy**).
- `catalogo-template.ts`'s `idPorNombre` map (`:247-249`) is keyed by `nombre` alone across the whole per-user copy — harmless today (no cross-bucket duplicate in the template) but a silent last-write-wins trap for a future template author. Key it by `(bucket, nombre)` or add an explicit assertion.

**Contract**
- `apps/api/openapi.json` regenerated (`pnpm api openapi:emit`, gated by `openapi:check` in CI) and `@moneydiary/api-client` regenerated (`pnpm --filter @moneydiary/api-client generate`) — the sanctioned ADR-011/012 path. `apps/web/src/api/types.ts` re-exports `ReclasificarCategoriaDto` from the generated package, so web picks up the new shape automatically.

**Web — `apps/web`**
- `ReclasificarCategoriaControl.tsx`: carry `categoria.id` through local state, key the `<select>` and its `<option>`s by id (fixes duplicate React keys and the ambiguous `<select value>` model), derive `bucketDe` from the selected id, send `categoriaId`.
- `mensajes-catalogo.ts` `NOMBRE_DUPLICADO` copy + its test.

**Mobile — `apps/mobile`**
- `ReclasificarMobileControl.tsx`: `esCategoriaActual` and the `testID`/`onPress` identity keyed by `cat.id` instead of `cat.nombre` (today, duplicate names would mark two rows "● actual" at once).
- `api/categorias.ts` `reclasificarCategoria(transaccionId, categoriaId)` + its hand-written DTO guard; `src/domain/detalle.types.ts`; `reclasificar.spec.ts` (5 tests).
- `src/domain/mensajes-catalogo.ts` `NOMBRE_DUPLICADO` copy + its test.

**Docs**
- New **ADR-042** (see **ADR amendment plan**).
- Root `CLAUDE.md`: the ADR-012 line calling `@moneydiary/api-client` "deuda registrada, no se construyó" is stale — the package is live and `apps/web/src/api/types.ts` re-exports from it. Correct it as a side note, since this change depends on that pipeline.
- `prisma-identidad-google.repository.ts` JSDoc (`:63`, `:178`) uses `Categoria(userId, nombre)` as its worked example of "a P2002 that is always a real bug". The discriminator logic is generic and functionally unaffected; only the prose and the illustrative fixtures at `prisma-identidad-google.repository.spec.ts:434-458` become stale.

### Out of scope (Non-Goals)

- **Case-insensitive uniqueness at the DB level — explicitly deferred.** `existeNombre` compares case-insensitively in the app layer (`mode: 'insensitive'`, `prisma-categoria.repository.ts:115`) while the DB unique index is case-sensitive. This mismatch **pre-exists this change and does not widen under the new key**: the app-layer check is always the actual gate (both `CrearCategoriaUseCase` and `ActualizarCategoriaUseCase` call it before every write), so the DB index is a backstop that is already looser than what the app permits to be written. Adding `bucketId` as a third column changes none of that dynamic — same looseness, same backstop, same never-exercised gap. Fixing it means a citext column or a functional index plus a data audit, which is disproportionate to a gap no code path can reach (YAGNI; deferred with this paragraph as its recorded trigger: revisit if a write path is ever added that bypasses `existeNombre`).
- **Label changes in categoría selectors** (locked decision 5).
- **A transition alias accepting the old `{ categoria: nombre }` body** (locked decision 3).
- **Retroactive data changes.** No existing row is renamed, re-bucketed, merged, or deleted. Pure constraint relaxation.
- **`PatronClasificacion` uniqueness**, the `(prioridad, patron, id)` classification tiebreak, and the `(categoriaId, userId) → Categoria(id, userId)` composite FK — all ADR-036 decisions that remain binding and untouched.
- **A migration rehearsal harness** in the style of `us037-catalogo-rehearsal.ts`. That script existed because US-037 purged demo users and ran a multi-step backfill; this migration is an index swap with provably zero data risk. A targeted integration test is proportionate; a rehearsal script is not.
- **Merging duplicate categorías** or any UI to reconcile them. Nothing creates duplicates automatically.
- **Web/mobile UI for choosing a bucket during reclassify.** The control's bucket-grouped list is unchanged.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `catalogo-clasificacion-ownership`: the per-user name-uniqueness rule becomes bucket-scoped (amends **CAT038-01**'s uniqueness clause and **CAT038-03**'s re-bucket scenario); **CAT037-04** stops resolving reclassification by `(userId, nombre)` and resolves by `(userId, id)`. **CAT037-06** (read paths fold a stored `categoriaId` back to its `nombre`) is **unaffected** — it reads by id already. Next free IDs: **CAT038-13+**.
- `web-app`: the reclassify control's identity model. Next free IDs: **WDM-10+**.
- `mobile-detalle-mes`: same, for the mobile control. Next free IDs: **MDET-08+**.

## Approach (component/contract level — `sdd-design` owns the detail)

| Layer | Change |
|-------|--------|
| **domain** | `NombreCategoriaDuplicadoError` message only. No new VO, no new rule object — bucket membership is already modelled. |
| **application** | `existeNombre` gains a `bucket` **name** parameter (never `bucketId` — ADR-005). `CrearCategoriaUseCase` passes the target bucket; `ActualizarCategoriaUseCase` passes the *effective* bucket (patch value if present, else the row's current bucket) and runs the check for rename, re-bucket, and both. The reclassify use case's `categoria: string` (nombre) becomes `categoriaId: string`, a thin delegate as today. Errors keep flowing as `Result.fail` — no throws. |
| **infrastructure (persistence)** | `PrismaCategoriaRepository.existeNombre` adds `bucketId: BUCKET_IDS[bucket]` to the `where`. `PrismaReclasificarCategoriaRepository.reasignar` resolves `findFirst({ where: { id: categoriaId, userId } })` — `userId` in the SQL `WHERE`, never in memory (RNF-SEC-006). ~11 files reference the generated `userId_nombre` selector purely as a **test-fixture resolution helper**; TypeScript strict mode flags every one at compile time, and each becomes a `findFirst` or a bucket-threaded lookup. |
| **infrastructure (http)** | `transacciones-categoria.schema.ts` renames the field and its docblock (which currently documents "`categoria` viaja como el `nombre` del dominio (no el id físico)" as a deliberate past decision — this change reverses it and the docblock must say so). The route's hand-coercion of a non-string `categoria` to `''` moves to the new field. |
| **contract** | `openapi.json` + `@moneydiary/api-client` regenerated in the same PR as the API change so `openapi:check` stays green. |
| **web / mobile** | Identity switches from `nombre` to `id` in local state, keys, and the request body. No business rule moves into the clients (ADR-024): they carry an opaque id and render the server's bucket grouping. |

### Open design choices (hand-off to `sdd-design`)

| # | Choice |
|---|--------|
| 1 | **`existeNombre` signature shape.** `existeNombre(userId, nombre, bucket, excluirId?)` (positional, four args, one optional in the middle-ish position) vs. an options object. The port is consumed by two use cases and mocked in several specs — pick the shape that keeps the mocks honest (SOLID/ISP: the mock should not need more than the caller uses). |
| 2 | **How `ActualizarCategoriaUseCase` obtains the effective bucket** for a rename-only PATCH: re-read the row via `buscarPorId` (an extra query) vs. thread it from the already-loaded row. Design must confirm what the use case already has in hand at that point. |
| 3 | **Whether `IReclasificarCategoriaWriter.reasignar` returns the resolved categoría's `nombre`/`bucket`** for the response DTO, or whether the client already has them. Affects whether the response contract changes beyond the request. |
| 4 | **`catalogo-template.ts` `idPorNombre` fix shape:** re-key by `(bucket, nombre)` vs. add a build-time assertion that the template has no cross-bucket duplicates. The second is smaller; the first is collision-proof. |
| 5 | **The ~11 `userId_nombre` fixture call sites:** mechanical `findFirst` swap vs. extracting one shared test helper (`categoriaPorNombre(prisma, userId, bucket, nombre)`). DRY's three-strikes rule clearly applies at 11 occurrences; confirm the helper's home. |
| 6 | **Test placement for the correctness guard.** The "two same-named categorías in different buckets → reclassify hits the right one" test needs a real DB (integration, `ALLOW_DESTRUCTIVE_DB=1`, local Postgres per `apps/api/docs/local-test-db.md`). Design must confirm it lands in `test/reclasificar-categoria.int-spec.ts` and not as a mock-level unit test, where it would prove nothing. |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/prisma/schema.prisma` | Modified | `@@unique([userId, bucketId, nombre])` |
| `apps/api/prisma/migrations/<ts>_categoria_unica_por_bucket/migration.sql` | New | Index swap, forward-only |
| `apps/api/src/application/ports/categoria-repository.port.ts` | Modified | `existeNombre` gains bucket scoping |
| `apps/api/src/application/ports/reclasificar-categoria.port.ts` | Modified | `reasignar(userId, transaccionId, categoriaId)` |
| `apps/api/src/application/use-cases/crear-categoria.use-case.ts` | Modified | Bucket-scoped uniqueness |
| `apps/api/src/application/use-cases/actualizar-categoria.use-case.ts` | Modified | Uniqueness on rename **and** re-bucket (locked decision 4) |
| `apps/api/src/application/use-cases/reclasificar-transaccion.use-case.ts` | Modified | `categoriaId` |
| `apps/api/src/infrastructure/persistence/prisma-categoria.repository.ts` | Modified | `bucketId` in the `where` |
| `apps/api/src/infrastructure/persistence/prisma-reclasificar-categoria.repository.ts` | Modified | `findFirst({ id, userId })` — the load-bearing fix |
| `apps/api/src/infrastructure/persistence/catalogo-template.ts` | Modified | `idPorNombre` collision guard |
| `apps/api/src/infrastructure/http-express/schemas/transacciones-categoria.schema.ts`, `routes/transacciones.routes.ts` | Modified | Wire field + docblock |
| `apps/api/src/domain/errors/nombre-categoria-duplicado.error.ts` | Modified | Copy |
| `apps/api/openapi.json`, `packages/api-client/src/types.gen.ts` | Regenerated | Contract sync (CI gate) |
| `apps/api/test/*.int-spec.ts` (~10 files) + `prisma-reclasificar-categoria.repository.spec.ts` | Modified | `userId_nombre` fixture helper churn — mechanical, `tsc` flags each |
| `apps/api/src/infrastructure/persistence/prisma-identidad-google.repository.ts` (+ spec) | Modified (docs) | Stale JSDoc example / illustrative P2002 fixtures |
| `apps/api/prisma/rehearsals/us037-catalogo-rehearsal.ts:302-303` | **Unchanged** | Asserts `Categoria_userId_nombre_key` but rehearses an already-executed migration; historical, non-CI |
| `apps/web/src/components/.../ReclasificarCategoriaControl.tsx` (+ test) | Modified | id-keyed identity |
| `apps/web/src/components/configuracion/categorias/mensajes-catalogo.ts` (+ test) | Modified | Copy |
| `apps/mobile/src/components/.../ReclasificarMobileControl.tsx` | Modified | id-keyed identity |
| `apps/mobile/src/api/categorias.ts`, `src/domain/detalle.types.ts`, `src/api/reclasificar.spec.ts` | Modified | Wire + DTO guard + 5 tests |
| `apps/mobile/src/domain/mensajes-catalogo.ts` (+ spec) | Modified | Copy |
| `docs/adr/ADR-042-*.md`, `docs/adr/README.md`, root `CLAUDE.md` | New / Modified | ADR + stale api-client note |
| **Unaffected, verified** | — | `RegistrarMovimientoForm.tsx`, `FilaRevision.tsx`, `agrupar-por-categoria-bucket.ts`, `apps/web/src/domain/agrupar-categorias-por-bucket.ts` — all already id-keyed |

## User-facing copy

The clients render their **own closed code→copy map**, never `body.message` (a deliberate discipline: `NuevaCategoriaForm.test.tsx:118` asserts it). So the copy change lands in three places, and each has a test asserting the exact string.

| Surface | Today | Proposed |
|---|---|---|
| `apps/api/src/domain/errors/nombre-categoria-duplicado.error.ts:13` (server-side, logs + `openapi.json` example) | `Ya existe una categoría con ese nombre.` | `Ya existe una categoría con ese nombre en ese bucket.` |
| `apps/web/src/components/configuracion/categorias/mensajes-catalogo.ts:103` (`NOMBRE_DUPLICADO`) | `Ya tienes una categoría con ese nombre.` | `Ya tienes una categoría con ese nombre en ese bucket.` |
| `apps/mobile/src/domain/mensajes-catalogo.ts:94` (`NOMBRE_DUPLICADO`) | `Ya tienes una categoría con ese nombre.` | `Ya tienes una categoría con ese nombre en ese bucket.` |

The word "bucket" is already user-facing house vocabulary — the sibling entry reads `BUCKET_NO_ASIGNABLE: 'Elige un bucket: Necesidades, Gustos o Ahorro.'`. Copy stays neutral/professional Chilean Spanish, consistent with the rest of the catalog map. Corresponding assertions: `mensajes-catalogo.test.ts:63` (web), `mensajes-catalogo.spec.ts:75` (mobile).

## ADR amendment plan

**New: `docs/adr/ADR-042-unicidad-de-categoria-por-bucket.md`** (next free number; `ADR-041` is the highest today).

> **Decisión:** la unicidad de `Categoria` pasa de `(userId, nombre)` a `(userId, bucketId, nombre)` — un usuario puede repetir un nombre de categoría entre buckets y nunca dentro de uno — y, como consecuencia directa, el contrato de reclasificación identifica la categoría por `categoriaId` en vez de por `nombre`.

Following the scoped-supersede pattern of ADR-038/039/040, the ADR must name **precisely** which prior clauses it supersedes and which remain binding:

- **Supersedes only** the `@@unique([userId, nombre])` clause of **ADR-036** and the identical clause inside ADR-037's "la validez de una categoría pasa a ser NOT NULL `Categoria.bucketId` + `@@unique([userId, nombre])` + FK compuesta".
- **Explicitly still binding** from ADR-036: per-user catalog ownership, materialization from `catalogo-template.ts` at user creation, `userId` NOT NULL on both tables, the composite FK `(categoriaId, userId) → Categoria(id, userId)`, and the `(prioridad, patron, id)` classification tiebreak.
- **Explicitly still binding** from ADR-037: the retirement of the closed `Categoria` enum and `CATEGORIA_BUCKET`; validity is a row property, not a type.
- **Notes, does not amend:** ADR-011/012 (this is exactly the contract change those ADRs' generate-don't-hand-sync process anticipates) and ADR-022/023 (the hard-cutover consequence of locked decision 3).

`docs/adr/README.md` index and the root `CLAUDE.md` ADR table get one row each.

## Migration

**Pure relaxation, zero data risk, no backfill.** `(userId, nombre)` is unique today, so no two existing rows share a `(userId, nombre)` pair, so no two rows can possibly violate the superset key `(userId, bucketId, nombre)`. Every row satisfying the old constraint trivially satisfies the new one. No guard, no purge, no multi-step backfill (unlike US-037's migration).

House style, confirmed against `20260811200000_us037_catalogo_per_user/migration.sql` and `20260821000000_us058_manual_movement/migration.sql`: a plain forward-only `.sql` under `apps/api/prisma/migrations/<timestamp>_<slug>/migration.sql`, with a prose header explaining rationale and ordering. No down-migration file.

```sql
-- categoria-unica-por-bucket (ADR-042): uniqueness moves from
-- (userId, nombre) to (userId, bucketId, nombre) — a user may hold the same
-- categoria name in two different buckets. Amends the uniqueness clause of
-- ADR-036/037. Pure relaxation: (userId, nombre) is unique today => no two
-- existing rows share it => none can violate the superset key. No backfill.
DROP INDEX "Categoria_userId_nombre_key";
CREATE UNIQUE INDEX "Categoria_userId_bucketId_nombre_key"
  ON "Categoria" ("userId", "bucketId", "nombre");
```

Field **order matters**: it determines Prisma's generated compound selector name (`userId_bucketId_nombre`). Most call sites will not use the compound selector at all after this change.

## Rollback Plan

- **Code:** revert the PR chain. Under `feature-branch-chain` the whole change is one merge to `main`, so one revert restores the previous contract and the previous app-layer uniqueness rule.
- **Database:** rollback = **restore from a Supabase snapshot**, per the production runbook precedent set by US-037's migration. There is no down-migration file (house style).
- **Honest caveat — the rollback is not symmetric.** The migration relaxes; the inverse tightens. If a user created a cross-bucket duplicate name after the deploy, `CREATE UNIQUE INDEX "Categoria_userId_nombre_key"` will **fail** until those duplicates are renamed or removed. Reverting *code only* (leaving the looser index in place) is safe — the app-layer `existeNombre` check is always the actual gate and would simply become stricter than the DB again, the same relationship that exists today.
- **Data written under the new rule is ordinary catalog data.** Categorías created in a second bucket are indistinguishable from any other and remain manageable in `/configuracion/categorias`.

## Delivery — proposed slicing (chained PRs)

**Recommended chain strategy: `feature-branch-chain`.** The hard cutover (locked decision 3) means the API contract change and both clients must reach production together; a tracker branch that accumulates the chain and merges once gives exactly that, with reviewable per-PR diffs.

**Hard ordering constraint:** the reclassify path must be **id-keyed before** the constraint is relaxed. PRs 1–3 are behaviour-preserving under the *current* `(userId, nombre)` constraint (id-keying is a strict refinement while names are still unique), so the window in which "a name resolves ambiguously" never exists at any commit. Relaxing first and migrating the contract second would open exactly the silent-misclassification window described above.

| # | Slice | Contents | Est. changed lines |
|---|-------|----------|--------------------|
| 1 | **ADR + backend reclassify contract → `categoriaId`** | ADR-042, `docs/adr/README.md`, root `CLAUDE.md` rows; Zod schema, route, use case, port, Prisma adapter; `openapi.json` + `@moneydiary/api-client` regen; adapter + route specs | ~280 |
| 2 | **Web reclassify control id-keyed** | `ReclasificarCategoriaControl.tsx` + its test | ~150 |
| 3 | **Mobile reclassify control id-keyed** | `ReclasificarMobileControl.tsx`, `api/categorias.ts`, `detalle.types.ts`, `reclasificar.spec.ts` | ~200 |
| 4 | **The constraint** | `schema.prisma` + migration; `existeNombre` port/adapter; `CrearCategoriaUseCase`; `ActualizarCategoriaUseCase` (locked decision 4); `catalogo-template.ts` guard; error copy ×3 + their tests; the ~11 `userId_nombre` fixture call sites; the cross-bucket reclassify correctness integration test | **~380 — at the budget ceiling** |

**Budget note:** slice 4 is the size risk. It cannot be split further without creating a broken intermediate state (a bucket-scoped `existeNombre` against a still-bucket-blind DB index would let a create pass the app check and then hit a raw P2002). Mitigation for review: roughly a third of its diff is one-line mechanical fixture swaps that `tsc` enumerates exhaustively. If it overruns, `size:exception` with that justification is the right call, not an artificial split.

**Every slice is test-first** (Strict TDD is active; runner `pnpm api test`, plus `pnpm web test` / `pnpm --filter @moneydiary/mobile test`). Conventional Commits throughout.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **Silent wrong-bucket reclassification** via a `findFirst`-by-name fallback | **High if the ordering constraint is violated** | Slice ordering (contract before constraint) + a mandatory integration test asserting the correct row is chosen with two same-named categorías in different buckets. This test is the acceptance gate for slice 4. |
| `ActualizarCategoriaUseCase` re-bucket collision surfaces as a raw P2002 `500` | High if deferred | Locked decision 4: ships in slice 4 with the migration. |
| Stale mobile APK breaks reclassify after deploy | **Certain** (accepted, decision 3) | Single-user deployment (ADR-023); the release runbook already includes an APK rebuild+reinstall step (ADR-022). The failure mode is a clean `400`, never a wrong write. |
| Cross-bucket duplicates block a DB rollback | Low | Documented in the Rollback Plan; code-only rollback is always safe. |
| Test-churn volume inflates slice 4 past 400 lines | **High** | `tsc --noEmit` enumerates every call site (no silent breakage); `size:exception` with the mechanical-churn justification if needed. |
| Contract drift (`openapi.json` vs. routes) | Low | `openapi:check` gates CI; regeneration ships inside slice 1. |
| A future `catalogo-template.ts` edit adds a cross-bucket duplicate and `idPorNombre` silently mis-resolves patrón→categoría | Low now, silent when it fires | In-scope guard (open design choice 4). |
| Users create confusingly duplicated names across buckets | Low | Intentional — that is the feature. The per-bucket grouping in every selector (locked decision 5) keeps them visually distinct; no label change needed. |

## Dependencies

- No new npm dependency (`.npmrc` `minimum-release-age=10080` would otherwise apply).
- Slice 4's correctness test needs a **local Postgres** with `ALLOW_DESTRUCTIVE_DB=1` (`apps/api/docs/local-test-db.md`); the db-safety gate rejects production connection strings by design. CI already provisions an ephemeral Postgres for integration/e2e (ADR-029).
- `apps/web/src/api/types.ts` re-exports from `@moneydiary/api-client`, so slice 2 depends on slice 1's regeneration.

## Success Criteria (BDD outline — `sdd-spec` owns the normative form)

**Catalog invariant**
- [ ] **Same name, different bucket** — Given a user owns `Transporte` in `Necesidades`, When they `POST /api/categorias { nombre: "Transporte", bucket: "Deseos" }`, Then the response is `201` and both rows coexist.
- [ ] **Same name, same bucket** — Given a user owns `Transporte` in `Necesidades`, When they POST the same nombre with `bucket: "Necesidades"`, Then the response is `409 NOMBRE_DUPLICADO` with the bucket-aware copy.
- [ ] **Case-insensitive within a bucket, unchanged** — Given `Transporte` in `Necesidades`, When they POST `transporte` in `Necesidades`, Then `409`; And When they POST `transporte` in `Deseos`, Then `201`.
- [ ] **Re-bucket into a collision (locked decision 4)** — Given `Transporte` exists in both `Necesidades` and `Deseos`, When the user PATCHes the `Necesidades` one to `bucket: "Deseos"`, Then the response is `409 NOMBRE_DUPLICADO` — **not** a `500` — and nothing is persisted.
- [ ] **Re-bucket without collision** — Given `Transporte` only in `Necesidades`, When the user PATCHes it to `Deseos`, Then `200`, and the existing `catalogo-rebucket.int-spec.ts` behaviour (atomic history re-stamping, CAT038-03) is unchanged.
- [ ] **Rename + re-bucket in one PATCH** — Given the combined patch would collide in the destination bucket, Then `409`; And given it would not, Then `200`.

**Money classification correctness (ADR-015 emphasis)**
- [ ] **Reclassify hits the right row** — Given a user owns `Transporte` in `Necesidades` (id `A`) and `Transporte` in `Deseos` (id `B`), When they reclassify a transaction with `{ categoriaId: B }`, Then the persisted `categoriaId` is exactly `B` and the transaction's bucket becomes `Deseos`. **This scenario MUST run against a real database, not mocks.**
- [ ] **No name-keyed resolution survives** — Given the reclassify write path, Then no runtime code resolves a target `Categoria` by `nombre` alone; the resolution is by `(id, userId)`.
- [ ] **Unknown or foreign id** — Given a `categoriaId` that does not exist, or exists but belongs to another user, When reclassify is called, Then the response is a generic `400`/`404` per the existing anti-enumeration rule (CAT038-07), never an enumerated list and never a successful write.
- [ ] **Bucket totals stay exact** — Given a reclassify across buckets, Then the affected bucket totals and the 50/30/20 semáforo recompute from `BigInt` values with round-half-up, unchanged from today.

**Per-`user_id` isolation (RNF-SEC-006)**
- [ ] **Cross-user same-name isolation** — Given users A and B each own `Transporte` in `Necesidades` and in `Deseos`, When A reclassifies to their own `Deseos` row, Then no query result, response field, or persisted value references any of B's four rows; And the `userId` filter appears in the SQL `WHERE`, not in memory.
- [ ] **`existeNombre` is user-scoped** — Given user B owns `Mascotas` in `Deseos`, When user A creates `Mascotas` in `Deseos`, Then `201` — B's catalog never constrains A's.

**Clients**
- [ ] **Web control** — Given two same-named categorías in different buckets, Then each `<option>` has a distinct key and value; And selecting the `Deseos` one shows the cross-bucket confirmation describing `Deseos`; And the PATCH body carries that row's id.
- [ ] **Mobile control** — Given the same fixture, Then exactly one row renders the "● actual" badge, and it is the one matching the transaction's current `categoriaId`.
- [ ] **Copy** — Given a `409 NOMBRE_DUPLICADO`, Then web and mobile render their own bucket-aware string from the closed code map, never `body.message`.

**Contract and regression**
- [ ] **Contract sync** — `openapi.json` and `@moneydiary/api-client` reflect `categoriaId`; `openapi:check` is green.
- [ ] **No regression** — the import preview, commit path, manual-movement forms, category deletion (CAT038-04), demo read-only (CAT038-08), and the dashboard/detalle read paths (CAT037-06) behave exactly as before.

## Open product questions (for the user, before `sdd-spec`)

The six locked decisions above settle the main product surface. These remain genuinely open and are cheap to answer now, expensive to discover in `apply`:

1. **Discoverability of the new freedom.** Nothing in the UI tells a user that "Transporte" can now exist twice. Is silent capability enough for the first slice, or should the duplicate-name `409` copy actively hint at the alternative (e.g. "…en ese bucket. Podés usar ese nombre en otro bucket")? The current proposal assumes silent.
2. **Reclassify list ordering with duplicates.** Two `Transporte` entries appear in the same alphabetically-sorted control, in different bucket groups. The proposal keeps grouping as the sole disambiguator (locked decision 5) — confirm that groups are always visually labelled in **both** clients at the point of selection, including the mobile bottom-sheet variant.
3. **Deletion semantics with duplicates.** `DELETE /api/categorias/:id` is id-keyed and unaffected. But the delete confirmation copy may say "«Transporte»" without naming the bucket, which is now ambiguous to read. In scope for this change, or a follow-up?
4. **Import-preview inline creation.** The originating trigger. Should the preview form, on a `409`, offer to reuse the existing same-named categoría from the *other* bucket, or is a plain error the right first slice?
5. **Rollback tolerance.** Are you comfortable that a DB-level rollback becomes impossible once a user creates the first cross-bucket duplicate (code-only rollback stays safe)? If not, the acceptable answer is a documented pre-rollback dedup step in the runbook, not a design change.

## Next step

Run **`sdd-spec`** and **`sdd-design`** in parallel against this proposal.
`spec` owns the requirement deltas (`CAT038-13+`, `WDM-10+`, `MDET-08+`) plus the amendments to CAT037-04 / CAT038-01 / CAT038-03, in Given/When/Then with RFC 2119 keywords.
`design` owns open choices 1–6; **choice 6 (the correctness test must run against a real database) blocks `apply`.**
