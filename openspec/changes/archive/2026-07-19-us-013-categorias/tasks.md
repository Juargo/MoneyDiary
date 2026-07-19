# Tasks — US-013: Categorías por transacción

- Slug: `us-013-categorias`
- Phase: TASKS (ordered implementation checklist — no code written here)
- Artifact store: hybrid (Engram `sdd/us-013-categorias/tasks` + this file)
- Reads: spec (`sdd/us-013-categorias/spec`, Engram #290) + design (`sdd/us-013-categorias/design`, Engram #291)
- Delivery strategy: `ask-on-risk`. Chain strategy: **not yet chosen** — see Review Workload
  Forecast, decision required before `sdd-apply`.
- Strict TDD is ACTIVE. Every implementation task is preceded by its test task. Test runners:
  `pnpm api test` (Vitest, ADR-016), `pnpm web test` (Vitest + Testing Library, jsdom).
  Money-exactness (BigInt), the categoría↔bucket invariant, `userId` isolation, and the
  cross-bucket resumen recompute all get their tests written and RED before the corresponding
  implementation task turns them GREEN.
- Language: tasks in English (neutral). Domain identifiers stay in Spanish (project convention).

Each task cites the requirement id(s) it satisfies (`CAT-*` = categorias-model,
`CATAPI-*` = categorias-api, `WCAT-*` = web-app). `[test]` tasks must land RED before the
paired `[impl]` task; `[verify]` tasks close a slice by running the full relevant suite.

---

## Slice S1 — Domain `Categoria` layer + schema + seed (no behavior change)

Depends on: — (first slice). Parallelizable internally: T1.5 (`categoria-ids.ts`) can run
alongside T1.1–T1.4 (both are pure/new files, no shared state); everything else is sequential
because schema must exist before seed code writes to it.

- [x] **T1.1** `[test]` Unit tests for `Categoria` enum + `CATEGORIA_BUCKET` total map: every
  value resolves to exactly one bucket; `bucketDeCategoria()` returns the expected bucket for
  each of the 8 categorías. — `domain/value-objects/categoria.spec.ts` (CAT-01)
- [x] **T1.2** `[impl]` Implement `Categoria` enum + `CATEGORIA_BUCKET: Record<Categoria, Bucket>`
  + `bucketDeCategoria()`. — `domain/value-objects/categoria.ts` (CAT-01)
- [x] **T1.3** `[test]` Unit test: `PatronClasificacion` VO's `get bucket()` derives correctly
  from its `categoria` prop (no independently-settable bucket). — `domain/value-objects/patron-clasificacion.spec.ts` (CAT-02)
  Implemented in S2 (was deferred from S1 — see the original note this replaces): added
  `it.each(Object.values(Categoria))` coverage that `get bucket()` derives every categoría via
  `CATEGORIA_BUCKET`, plus a test documenting `bucket` has no independent constructor param.
- [x] **T1.4** `[impl]` Update `PatronClasificacion` VO: constructor takes `categoria: Categoria`
  instead of `bucket`; expose `bucket` as a derived getter via `CATEGORIA_BUCKET`. —
  `domain/value-objects/patron-clasificacion.ts` (CAT-02)
  Implemented in S2 together with T1.3 (see above) — bundled with T2.3's read-path update in
  the same commit, as originally planned.
- [x] **T1.5** `[impl]` Add `CATEGORIA_IDS` (fixed seed ids) + `CATEGORIA_ID_TO_CATEGORIA`
  (inverse map, built once) mirroring `bucket-ids.ts`. — `infrastructure/persistence/categoria-ids.ts` (CAT-04)
- [x] **T1.6** `[impl]` Prisma schema: add `Categoria` model (`id`, `nombre @unique`,
  `bucketId`/`bucket` relation, `@@index([bucketId])`); `BucketPresupuesto.categorias Categoria[]`;
  `PatronClasificacion.categoriaId` (**nullable** FK, `bucketId` kept for now — dual-write
  window); `Transaccion.categoriaId` (nullable FK, `onDelete: SetNull`). Generate migration
  `add_categoria` — structural only, no data. — `prisma/schema.prisma` + migration (CAT-01, CAT-02)
  Migration hand-authored (see T1.6 apply note below) as
  `prisma/migrations/20260719000000_add_categoria_model/migration.sql`.
- [x] **T1.7** `[test]` Seed-integrity unit tests: every seeded `Categoria.bucketId ===
  BUCKET_IDS[CATEGORIA_BUCKET[nombre]]`; `CATEGORIA_IDS` covers the full enum; a
  `CATEGORIA_CATALOG_SIZE` constant matches (mirrors `PATRON_CATALOG_SIZE`); every
  `PATRON_CATALOG` entry references a valid `Categoria`. (CAT-01, CAT-04)
  Implemented as `src/infrastructure/persistence/seed-catalog.spec.ts` (in-memory upsert fake,
  no DB — mirrors ADR-015 pure-domain-test posture; `test/seed.int-spec.ts` stays the gated
  real-DB idempotency check and is unmodified/untouched by S1).
- [x] **T1.8** `[impl]` Update `seed.ts`: upsert 8 `Categoria` rows by fixed id (idempotent);
  rewire every `PATRON_CATALOG` entry to set **both** `bucketId` (unchanged, current reads still
  work) **and** `categoriaId` (new). — `prisma/seed.ts` (CAT-04)
- [x] **T1.9** `[test]` Idempotency scenario: running the seed twice does not duplicate
  `Categoria` rows and leaves the count unchanged. (CAT-04)
  Covered in `seed-catalog.spec.ts` (unit, in-memory) — see T1.7 note.
- [x] **T1.10** `[verify]` `pnpm api test` full suite green + `pnpm api exec tsc --noEmit`.
  Confirm US-012's existing tests still pass unmodified (bucketId-only read path is untouched
  by this slice — behavior-preserving by design).
  `pnpm api test`: 95 files / 724 tests passed. `pnpm api exec tsc --noEmit`: clean.

**S1 apply note (migration production):** the reachable Postgres instance (`prisma migrate
status` resolves to a Supabase pooler host) is the project's **shared dev database**, not a
disposable local instance — and it already has an unrelated migration
(`20260718120000_add_demo_trial_mode`) pending/unapplied there. Running `prisma migrate dev`
(even `--create-only`) against it risked reconciling/touching that unrelated pending state.
Per the apply guardrails ("do NOT apply any migration to a real/prod DB"), the migration SQL
was hand-authored instead, mirroring the shape Prisma would generate for this exact schema
diff (verified via `prisma validate` + `prisma generate`, both clean). **Needs human
application**: run `prisma migrate dev` (or `deploy`) against the shared dev DB once the
pending `add_demo_trial_mode` migration is reconciled, to actually apply
`20260719000000_add_categoria_model`.

## Slice S2 — Categorización write path flips to `{categoria, bucket}`

Depends on: **S1**. Sequential (schema/domain from S1 must exist first; within S2, tests before
each paired impl; migration T2.9 ships last, together with the code that reads `categoria`).

- [x] **T2.1** `[test]` Update `CategorizarTransaccionUseCase` unit tests for the new return
  shape: Ingreso → `{categoria: null, bucket: Ingreso}`; matched pattern → `{categoria,
  categoria.bucket}`; no match → `{categoria: null, bucket: SinCategoria}`; priority/id tiebreak
  unchanged; never throws. (CAT-03)
- [x] **T2.2** `[impl]` Update `CategorizarTransaccionUseCase.execute` to return
  `{categoria: Categoria | null, bucket: Bucket}`, deriving `bucket` via the matched pattern's
  `bucket` getter (Ingreso/no-match branches unchanged in structure). —
  `application/use-cases/categorizar-transaccion.use-case.ts` (CAT-03)
- [x] **T2.3** `[impl]` Update `ICatalogoClasificacion` port + `PrismaCatalogoClasificacionRepository`:
  swap `include: { bucket: true }` → `include: { categoria: true }`; map `row.categoria.nombre`
  to the `Categoria` enum when constructing each `PatronClasificacion` VO. (can run in parallel
  with T2.1/T2.2 — different files, no shared state)
- [x] **T2.4** `[test]` Writer test: `asignarCategorizacion` writes `categoriaId` + `bucketId`
  atomically per `(categoria, bucket)` group, inside the existing `$transaction`, preserving the
  double-lock scope isolation (`WHERE id IN (...) AND ingestaId = ?`). (CAT-02)
  Also covers: two different categorías that derive to the SAME bucket produce two separate
  groups (categoria drives grouping, not bucket alone) — a scenario the design's grouping
  description implied but didn't spell out as a distinct test case.
- [x] **T2.5** `[impl]` Rename `transaccion-bucket-writer.port.ts` method `asignarBuckets` →
  `asignarCategorizacion(ingestaId, asignaciones: {transaccionId, categoria, bucket}[])`; update
  `PrismaTransaccionBucketRepository` to group by `(categoria, bucket)` and emit one `updateMany`
  per group setting `{categoriaId: categoria ? CATEGORIA_IDS[categoria] : null, bucketId:
  BUCKET_IDS[bucket]}`. (CAT-02)
- [x] **T2.6** `[impl]` Update `ProcessIngestaUseCase.runCategorizacion` wiring: map each
  classified row to `{transaccionId, categoria, bucket}` (was `{transaccionId, bucket}`);
  degradation island (catalog down → only Ingreso rows written) stays structurally unchanged.
- [x] **T2.7** `[test]` Integration/e2e: full ingesta pipeline persists `categoriaId` +
  `bucketId` together for a matched-pattern row; catalog-down degradation still writes only
  Ingreso rows correctly (rest stay `null`/`null`, pending — not `SinCategoria`).
  `test/categorizacion.int-spec.ts` updated to the new `asignarCategorizacion` contract (T18/T19
  degradation + T21 FK-integrity now also asserts `categoriaId`/`categoria.nombre`). This is a
  **gated** test (`ALLOW_DESTRUCTIVE_DB=1`, real DB) — NOT executed in this apply session, same
  as S1's precedent: the only reachable Postgres is the shared Supabase dev DB, and running it
  would both require reconciling S1/S2's unapplied migrations first and mutate shared state.
  Updated for compile-correctness + reviewed logically; needs a human run once the migrations
  are applied.
- [x] **T2.8** `[impl]` Migration `drop_patron_bucketid`: make `PatronClasificacion.categoriaId`
  **NOT NULL** (safe — S1's seed populated all rows); **DROP** `PatronClasificacion.bucketId`.
  Ships together with T2.2–T2.6 (code flip + schema tighten land in the same PR).
  Hand-authored (see S2 apply note below) as
  `prisma/migrations/20260719010000_drop_patron_bucketid/migration.sql`.
- [x] **T2.9** `[verify]` `pnpm api test` full suite + `pnpm api test:e2e` green. Confirm CAT-03
  scenarios pass end-to-end.
  `pnpm api test`: 95 files / 735 tests passed. `pnpm api exec tsc --noEmit`: clean.
  `pnpm api test:e2e` NOT run — gated, real-DB, would touch the shared dev DB (see T2.7 note).

**S2 apply note (migration production + ordering vs S1):** same posture as S1 — the reachable
Postgres instance (Supabase pooler) is the shared dev DB, not a disposable local instance, so
`drop_patron_bucketid` was hand-authored rather than generated via `prisma migrate dev`
(verified via `prisma validate` + `prisma generate`, both clean; `prisma generate` was actually
run to refresh the local TS client types, which is safe — it does not touch the DB). **Ordering
risk vs S1**: `20260719010000_drop_patron_bucketid` has a strict dependency on
`20260719000000_add_categoria_model` (S1) having been applied and the seed re-run first — it
assumes `PatronClasificacion.categoriaId` is already populated on every row before tightening it
to NOT NULL. **Needs human application, in order**: (1) reconcile the pre-existing unrelated
`20260718120000_add_demo_trial_mode` migration, (2) apply S1's `add_categoria_model` +re-run
`seed.ts`, (3) apply S2's `drop_patron_bucketid`. Applying S2 before S1 would fail (the
`categoriaId` column wouldn't exist yet); applying S2 without a completed seed run would fail
the NOT NULL tightening on any un-seeded row.

## Slice S3 — Backfill script for existing rows

Depends on: **S2** (needs the categoría-aware catalog + `{categoria, bucket}` classification).
Sequential; all tests are gated (`ALLOW_DESTRUCTIVE_DB=1`) and must exist before the script does.

- [x] **T3.1** `[test]` Gated integration test: running the backfill twice yields identical DB
  state (idempotency). (CAT-05)
- [x] **T3.2** `[test]` Gated integration test: `--dry-run` writes nothing and reports a summary
  (total rows, per-categoría counts, count of rows whose `bucketId` would change). (CAT-05)
- [x] **T3.3** `[test]` Gated integration test: a row with a non-null (manually set) `categoriaId`
  is left untouched by a re-run (scope = `categoriaId IS NULL` only). (CAT-05)
- [x] **T3.4** `[test]` Unit/integration test: the script refuses to run without
  `ALLOW_DESTRUCTIVE_DB=1` and rejects production connection strings (reuses `db-safety.ts`).
  (CAT-05)
- [x] **T3.5** `[impl]` Implement `apps/api/prisma/backfill-categorias.ts`: load the
  categoría-aware catalog; select `Transaccion WHERE categoriaId IS NULL`; run
  `CategorizarTransaccionUseCase.execute` per row; write results grouped by `(categoria, bucket)`
  via `updateMany` inside a `$transaction`; `--dry-run` flag; `assertDestructiveDbAllowed` gate
  at the top (structured like `seed.ts`). (CAT-05)
- [x] **T3.6** `[verify]` Manual dry-run against local dev DB; review the printed summary
  (row/categoría counts + bucket-change preview) before considering this slice done.
  **RECONCILED AT ARCHIVE (2026-07-19) — see "Archive-time reconciliation" note at the end of
  this file.** At `sdd-apply`/`sdd-verify` time this task was correctly left unchecked and
  explicitly deferred: no dry-run was executed against any DB during that session, per that
  session's explicit guardrail ("Do NOT apply the backfill to any real DB. Do NOT set
  ALLOW_DESTRUCTIVE_DB."). A human subsequently ran the supervised backfill (dry-run reviewed,
  then applied) against production as part of the deploy described in the archive report, and
  it completed successfully, preserving every existing `bucketId`. T3.1-T3.3's gated integration
  tests (`test/backfill-categorias.int-spec.ts`) remain not executed in this repo's CI/session
  history for the same original reason — same precedent as S1/S2's `categorizacion.int-spec.ts`
  — but 11 pure-logic unit tests (`src/infrastructure/persistence/backfill-categorias.spec.ts`)
  cover the same idempotency, scope, and dry-run behavior against a fake Prisma client and ARE
  green.

## Slice S4 — Manual reclassify endpoint

Depends on: **S1 only** (needs `Categoria` domain + `CATEGORIA_IDS`/`CATEGORIA_BUCKET`; does
**not** need S2/S3). Can be implemented **in parallel with S2 and S3** once S1 has merged.
Sequential within the slice: tests before each paired impl.

- [x] **T4.1** `[test]` Unit test: `ReclasificarTransaccionUseCase` derives the bucket from the
  chosen categoría (never accepts one); an unknown categoría value returns
  `CategoriaInvalidaError` without invoking the writer. (CATAPI-02)
  Implemented as `application/use-cases/reclasificar-transaccion.use-case.spec.ts` (5 cases:
  derives-not-accepts, every-enum-value coverage, unknown-categoría rejection, anti-reflected-input,
  propagates writer's `TransaccionNoEncontradaError`).
- [x] **T4.2** `[impl]` `domain/errors/categoria-invalida.error.ts` (scrubbed message, raw value
  never reflected) + `domain/errors/transaccion-no-encontrada.error.ts` (merged not-found /
  not-owned — anti-enumeration).
- [x] **T4.3** `[impl]` `application/ports/reclasificar-categoria.port.ts`
  (`IReclasificarCategoriaWriter.reasignar`) + `application/use-cases/reclasificar-transaccion.use-case.ts`
  — validates against the enum, derives bucket via `CATEGORIA_BUCKET`, delegates the
  userId-isolated write to the port. (CATAPI-02)
- [x] **T4.4** `[test]` Integration test — `userId` isolation (CATAPI-01): user A's session
  cannot reclassify user B's transaction (`count===0` → 404, target row's `categoriaId`/`bucketId`
  unchanged); user A can reclassify their own transaction and the response reflects the new
  value. Mirrors the existing ISO integration pattern in `test/`.
  Implemented as `test/reclasificar-categoria.int-spec.ts` (T4.4a/b). **Gated**
  (`ALLOW_DESTRUCTIVE_DB=1`, real DB) — NOT executed this session, same precedent as S1-S3: the
  only reachable Postgres is the shared Supabase dev DB and S1's `add_categoria` migration has
  not been applied there yet.
- [x] **T4.5** `[test]` Integration test — money exactness (CATAPI-03, CATAPI-04): within-bucket
  reclassify (e.g. Delivery→Streaming) leaves `bucketId` and the resumen's Deseos subtotal
  unchanged; cross-bucket reclassify (Deseos→Necesidades) shifts both bucket totals by the exact
  `BigInt` amount with no float drift, and `porcentajeBp`/`estadoSemaforo` recompute on the next
  `/api/resumen` read (including a scenario where the move flips the traffic-light state at the
  threshold).
  Implemented in the same `test/reclasificar-categoria.int-spec.ts` (T4.5a/b) — same gated,
  not-executed status as T4.4 above.
- [x] **T4.6** `[impl]` `infrastructure/persistence/prisma-reclasificar-categoria.repository.ts`:
  `updateMany({where: {id: transaccionId, account: {userId}}, data: {categoriaId, bucketId}})`
  (structural isolation, atomic dual-column write); `count === 0` → `Result.fail(new
  TransaccionNoEncontradaError(...))`. (CATAPI-01, CATAPI-03, CATAPI-04)
- [x] **T4.7** `[impl]` `infrastructure/http/dto/reclasificar-categoria.dto.ts` (body: `{categoria:
  string}`) + `infrastructure/http/transacciones.controller.ts`
  (`PATCH /api/transacciones/:id/categoria`), guarded by the same `ApiKeyGuard` + `SessionGuard`
  chain as the other data controllers; maps use-case errors to 400 (`CategoriaInvalidaError`) /
  404 (`TransaccionNoEncontradaError`).
  Also added `transacciones.controller.spec.ts` (6 unit cases) — not a separately-listed task but
  matches the project's existing per-controller `.spec.ts` convention (mirrors
  `DetalleBucketController`/`MovimientosController`).
- [x] **T4.8** `[impl]` `infrastructure/http/transacciones.module.ts` — composition root wiring
  `ReclasificarTransaccionUseCase` + `PrismaReclasificarCategoriaRepository` behind its token
  (`inject: [PrismaService]`); register the module in `AppModule`.
- [x] **T4.9** `[verify]` `pnpm api test` + `pnpm api test:integration` (gated) green; manual
  curl matrix against local dev (200 own tx / 404 other user's tx / 400 unknown categoría).
  `pnpm api test`: 99 files / 762 tests passed. `pnpm api exec tsc --noEmit`: clean (both `src/`
  and `test/`). `pnpm api test:integration` NOT run — gated, real-DB, would touch the shared dev
  DB (see T4.4/T4.5 note). Manual curl matrix **DEFERRED — human action required**, same posture
  as S1-S3's DB-touching steps: needs a running local/dev server with `ALLOW_DESTRUCTIVE_DB`-free
  read/write access and the S1 migration applied first.

**S4 apply note:** implemented in parallel-eligible position per the dependency graph (depends
only on S1, independent of S2/S3) but built sequentially after S3 in this session, branched off
`feat/us-013-categorias-s3` per the chosen `feature-branch-chain` PR ordering (its own PR will
target the S3 branch). No new migration needed — S4 only *writes* to columns S1's
`add_categoria` migration already added (`Transaccion.categoriaId`/`bucketId`), so it inherits
the same "needs human migration application" precedent already logged in S1/S2, not a new one.

## Slice S5 — Expose `categoria` on read DTOs

Depends on: **S1 only** (needs `CATEGORIA_ID_TO_CATEGORIA`). Can be implemented **in parallel
with S2, S3, and S4** once S1 has merged.

- [x] **T5.1** `[test]` Unit test: movimientos row fold — classified row → `{id, nombre}`;
  Ingreso/SinCategoria row → `null`; unrecognized non-null id → `null` (defensive, mirrors the
  bucket fold). (CATAPI-05)
  Implemented as 3 new cases in `prisma-movimientos-mes.repository.spec.ts` (mocked
  PrismaService, mirrors the existing bucket-fold test pattern in the same file).
- [x] **T5.2** `[test]` Unit test: detalle-bucket row fold — same three cases. (CATAPI-05)
  `prisma-detalle-bucket.repository.spec.ts` was previously 100% gated integration (real DB) —
  added a new mocked-PrismaService `describe` block (`— categoria fold (unit)`) covering the same
  three cases without touching the pre-existing gated suite.
- [x] **T5.3** `[impl]` `PrismaMovimientosMesRepository`: add `categoriaId` to `select`; fold via
  `CATEGORIA_ID_TO_CATEGORIA`; `MovimientoMesRow` port type gains `categoria: {id, nombre:
  Categoria} | null`.
  Fold logic extracted as a shared `foldCategoriaId()` helper in `categoria-ids.ts` (DRY —
  correctness-critical fold needed identically by both S5 repos).
- [x] **T5.4** `[impl]` `PrismaDetalleBucketRepository`: same fold; `DetalleBucketRow` port type
  gains `categoria`. Reuses `foldCategoriaId()` from T5.3.
- [x] **T5.5** `[impl]` `dto/movimiento-mes.dto.ts` + `dto/detalle-bucket.dto.ts`: add
  `categoria: {id: string; nombre: string} | null` (additive — existing fields unchanged).
- [x] **T5.6** `[verify]` `pnpm api test` green; existing movimientos/detalle-bucket integration
  tests pass unmodified (additive field, no breaking change).
  `pnpm api test`: 99 files / 768 tests passed. `pnpm api exec tsc --noEmit`: clean (src + test).
  Fixture-default fixups (`categoria: null`) were needed in 4 pre-existing spec files
  (`obtener-movimientos-mes.use-case.spec.ts`, `obtener-detalle-bucket.use-case.spec.ts`,
  `detalle-bucket.dto.spec.ts`) whose `makeRow` helpers build a full port-type object — additive
  field, no behavior change to those tests.

## Slice S6 — Web: revert panel, group by categoría, activate reclassify control

Depends on: **S4 + S5** (needs the reclassify endpoint and the `categoria` DTO field to exist).
Last slice in the chain.

> **S6a/S6b split (this session, `sdd-apply`)**: S6 was implemented in two sub-slices — **S6a**
> (branch `feat/us-013-categorias-s6a`, off S5): read-only grouping (T6.1-T6.3 + the grouping
> half of T6.6-T6.9). **S6b** (not started): the reclassify `<select>` (T6.0, T6.4, T6.5, the
> control half of T6.6/T6.7, T6.11).
>
> **Deviation from the design's "revert" framing, confirmed against the actual repo before
> implementing**: PR #75 (`TransaccionesAgrupadas`, all-buckets-visible) was **closed, never
> merged** — `ResumenScreen` already does pie/legend-click → single-bucket panel (its original
> US-017/US-030 behavior). There was nothing to revert. T6.8/T6.9 (WCAT-01/WCAT-03) are already
> satisfied by the pre-existing `ResumenScreen` + `BucketDetailList` — verified via the existing
> green test suite, no new assertions needed, no `ResumenScreen.tsx` behavior change.
>
> **Deviation from T6.7's literal component name**: rather than a new
> `BucketCategoriasList.tsx`, S6a added grouping DIRECTLY to the existing
> `BucketDetailList.tsx` (the component `ResumenScreen` already renders for its panel, and the
> standalone `/buckets/:bucket` route already reuses verbatim) — avoids a redundant parallel
> component + a ResumenScreen wiring change that isn't needed. T6.10 (route consolidation) is
> therefore MOOT — `BucketDetailList` already serves both call sites. S6b will add the
> reclassify `<select>` to this SAME component, not a new one.

- [x] **T6.0** `[DECISION]` **Confirmed by the user before S6b implementation.** Reclassify
  `<select>` offers **ALL 8 categorías** grouped by bucket via `<optgroup>` (cross-bucket
  allowed — design's recommendation). Guardrail added on top: when the chosen categoría's bucket
  differs from the row's current bucket, a confirmation (`role="alertdialog"`, stating the exact
  money move, e.g. "Esto mueve $X de Gustos a Necesidades") is shown before committing;
  same-bucket re-categorization commits immediately. Implemented in
  `apps/web/src/components/ReclasificarCategoriaControl.tsx`.
- [x] **T6.1** `[test]` Unit test `agrupar-detalle-por-categoria`: groups rows by
  `categoria.nombre`; null categoría → a "Sin categoría" group; per-group subtotal computed via
  `BigInt` (a value beyond `Number.MAX_SAFE_INTEGER` preserves every digit); per-group count is
  correct. (WCAT-02) — `apps/web/src/domain/agrupar-detalle-por-categoria.test.ts` (8 cases,
  also covers canonical order + Ingreso-sums-abono discipline).
- [x] **T6.2** `[impl]` `apps/web/src/domain/agrupar-detalle-por-categoria.ts` — pure grouping
  function, no framework dependency. (WCAT-02)
- [x] **T6.3** `[impl]` `apps/web/src/api/types.ts`: DTO mirrors (movimientos + detalle-bucket)
  gain `categoria: {id: string; nombre: string} | null`. — Done for **detalle-bucket** (S6a
  scope, `DetalleBucketTransaccionDto`). `MovimientoMesDto`/`BucketResumenDto` mirrors for
  `/api/movimientos` were NOT touched (no S6a consumer needs them yet; movimientos DTO already
  has `categoria` server-side from S5, web mirror deferred to whichever slice first consumes it
  — YAGNI).
- [x] **T6.4** `[test]` Unit test `use-reclasificar-categoria`: on `onSuccess`, invalidates
  `['resumen', periodo]`, `['detalle-bucket', bucket, periodo]`, `['resumen-anual', anio]` (mock
  `QueryClient`); mutation stays `isPending` while in flight. (WCAT-04) — **S6b DONE**.
  `apps/web/src/api/use-reclasificar-categoria.test.tsx` (6 cases). Deviation: `resumen-anual`
  invalidation uses the PARTIAL key `['resumen-anual']` (no `anio`) rather than the literal
  `['resumen-anual', anio]` — this hook has no `anio` in scope (only `periodo`/`bucket`, threaded
  from `BucketDetailList`), so it invalidates every cached year instead of guessing one; see the
  hook's docstring for the full rationale (TanStack Query's fuzzy key matching means this cannot
  collide with `['resumen', ...]`/`['detalle-bucket', ...]`, distinct key[0] strings).
- [x] **T6.5** `[impl]` `apps/web/src/api/use-reclasificar-categoria.ts` — `useMutation` wrapping
  the PATCH call; `onSuccess` invalidation per T6.4; exposes `isPending` for the control to
  disable itself. — **S6b DONE**.
- [x] **T6.6** `[test]` Component test: grouping half (`BucketDetailList.test.tsx`, S6a) + the
  reclassify `<select>` half — **S6b DONE**. `ReclasificarCategoriaControl.test.tsx` (10 cases:
  accessible label, optgroup contents + preselection, SinCategoria placeholder value, same-bucket
  immediate commit, cross-bucket confirmation text + no premature commit, confirm commits, cancel
  reverts without committing, disabled-while-pending, failed-reclassify reverts + shows an error).
  `BucketDetailList.test.tsx` updated: the two old disabled-placeholder tests replaced with two
  wiring tests (select rendered + accessibly named + correctly preselected/empty per row).
- [x] **T6.7** `[impl]` (grouping half done in S6a, in `BucketDetailList.tsx`, not a new
  `BucketCategoriasList.tsx` — see deviation note above): renders group heading (`h2`/`h3`
  depending on `headingLevel`) + rows per group, reuses `ETIQUETA_BUCKET` +
  `Loading`/`ErrorState`/`Empty`. — **S6b DONE**: per-row reclassify `<select>` implemented as a
  new `apps/web/src/components/ReclasificarCategoriaControl.tsx` (container-presentational: owns
  its own local select/confirmation/error state + the mutation, `BucketDetailList` just passes
  per-row props), replacing the two disabled placeholders. `categoriaActual` is read off the
  row's `grupo` (categoriaId/nombre), not threaded through `DetalleBucketRowViewModel` — every row
  in a group shares the same categoría by construction (DRY, no new field needed).
- [x] **T6.8** `[test]` Already satisfied by the PRE-EXISTING `ResumenScreen.test.tsx` (no
  revert happened, see deviation note): "clicking a different legend/slice row switches the
  transactions panel to that bucket" (WCAT-01) + `BucketDetailList`'s own empty-state test
  (WCAT-03) + `ResumenScreen`'s null-selection skip (no panel rendered) already cover this.
  Reconfirmed green after S6a's `BucketDetailList` changes (`pnpm web test`: 284/284).
- [x] **T6.9** `[impl]` N/A — no revert needed (see deviation note above); `ResumenScreen.tsx`
  untouched this session, still renders `<BucketDetailList bucket={bucketSeleccionado} .../>`
  for its panel.
- [x] **T6.10** `[impl, optional]` N/A — moot, `BucketDetailList` already serves both the
  dashboard panel and the standalone `/buckets/:bucket` route (no separate
  `BucketCategoriasList` was created).
- [x] **T6.11** `[verify]` `pnpm web test` + `pnpm web typecheck` + `pnpm web build` green;
  manual a11y spot-check of the full keyboard-only reclassify flow (WCAT-05 scenario: tab to a
  row's control, activate with Enter/Space, select a categoría via keyboard, confirm the
  reclassify completes and the resumen/pie updates). — **S6b DONE** (automated portion):
  `pnpm web test` 38 files / 311 tests green, `pnpm web typecheck` clean, `pnpm web build` OK.
  The keyboard-operability CLAIM is covered by automated tests using
  `@testing-library/user-event` (`ReclasificarCategoriaControl.test.tsx`: `selectOptions` +
  `click` on native `<select>`/`<button>` elements, which are keyboard-operable by construction —
  no custom ARIA widget). A live manual spot-check in a real browser with a screen reader
  (VoiceOver/NVDA) is **DEFERRED — human action required**, same posture as this session's other
  "needs human verification" items (S1-S5's DB-touching steps) — no dev server / real backend
  was started this session.

---

## Cross-slice dependency summary

```
S1 (domain + schema + seed, no behavior change)
 ├─→ S2 (categorización write path flip)  ──→ S3 (backfill)
 ├─→ S4 (reclassify endpoint)             ─┐
 └─→ S5 (DTO exposure)                    ─┴─→ S6 (web: revert panel, grouping, reclassify UI)
```

- S2 and S3 are strictly sequential (S3 needs S2's categoría-aware catalog).
- S4 and S5 depend **only** on S1 and are independent of each other and of S2/S3 — they can be
  implemented and reviewed **in parallel** once S1 merges.
- S6 is the sink: it needs both S4 (the endpoint to call) and S5 (the `categoria` field to
  render/group by) merged first.
- No slice after S1 needs S1's migration `add_categoria` to be anything other than merged —
  there is no runtime coupling beyond "the columns/table exist."

---

## Review Workload Forecast

Rough `additions + deletions` estimate per slice (impl + tests + generated migration SQL where
applicable). These are planning estimates, not measured diffs — re-check with `git diff --stat`
once each slice is actually implemented.

| Slice | Est. changed lines | 400-line budget risk | Notes |
|-------|--------------------:|-----------------------|-------|
| S1 — domain + schema + seed | ~320 | Low-Medium | New enum/VO files + migration SQL + seed rewrite; no behavior change reduces review risk even if line count is moderate. |
| S2 — categorización flip | ~275 | Low-Medium | Touches 5 existing files + a migration; each change is small/mechanical (extend, don't rewrite per design). |
| S3 — backfill script | ~270 | Low-Medium | Mostly one new script + its gated integration tests; self-contained, easy to review in isolation. |
| S4 — reclassify endpoint | ~430 | **High** | New error types + port + use case + repo + DTO + controller + module + 2 integration tests (isolation, money-exactness) — a full vertical slice in one PR. |
| S5 — DTO exposure | ~130 | Low | Two repo folds + two DTOs + unit tests; smallest slice. |
| S6 — web panel + grouping + reclassify UI | ~650-700 | **High** | New pure fn + hook + a fairly large new component (groups + per-row `<select>` + a11y) + a screen revert, each with its own tests. Likely needs its **own internal split** if kept as a single PR (see recommendation below). |
| **Total** | **~2075-2125** | — | — |

**Chained PRs recommended: Yes.** Two slices (S4, S6) individually exceed the 400-line budget
as scoped above, and the whole change is a money-moving, cross-tenant-sensitive feature that
benefits from reviewable, independently-verifiable increments (mirrors the project's existing
precedent: Grupo W's 5-PR feature-branch-chain for the resumen UI, and `auth-login-session`'s
4-slice chain).

**Decision needed before apply: Yes.** Two separate decisions, both flagged here rather than
defaulted in `sdd-apply`:

1. **Chain strategy** (asked per `ask-on-risk`): recommend **`feature-branch-chain`** with a
   draft/no-merge tracker PR for `us-013-categorias`, child PRs S1→S2→S3→S4→S5 in order (S4/S5
   can each target the tracker directly and land as siblings once S1 is merged into the tracker,
   since neither depends on the other), and S6 landing last, split into **two child PRs**
   (`S6a`: `agrupar-detalle-por-categoria` + `use-reclasificar-categoria` + their tests, ~350
   lines; `S6b`: `BucketCategoriasList` + `ResumenScreen` revert + their tests, ~350 lines) to
   keep every individual PR under the ~400-line / ~60-minute review budget. Rationale for
   `feature-branch-chain` over `stacked-to-main`: the schema migrations (S1's `add_categoria`,
   S2's `drop_patron_bucketid`) and the invariant-bearing write-path change (S2) are not safe to
   merge to `main` independently mid-flight — an intermediate state where `PatronClasificacion`
   has both `bucketId` and a not-yet-required `categoriaId`, or where the reclassify endpoint
   exists but the web can't reach it yet, is fine to sit in a tracker branch but should not be
   `main`'s state for an extended period on a money-path feature. This also matches the design
   doc's own recommendation (§9) and the project's existing precedent for money-adjacent chains.
2. **One SDD change (S1–S6, six-to-seven chained PRs) vs split into two SDD changes** (backend
   `us-013-categorias` for S1–S5, web `us-013-categorias-web` for S6) — design's residual Q5.
   **Recommendation: keep ONE SDD change.** Splitting into two SDD changes does not remove the
   S6→(S4,S5) dependency — the web change would still have to wait for the backend change to
   merge before it could start, so the actual critical path is identical either way. What
   splitting *would* add is process overhead: a second proposal/spec/design/tasks cycle, a
   second Engram topic tree, and a seam where the `categoria` DTO contract (S5) and its web
   consumer (S6) could drift if written from two separate spec readings instead of one. Since
   the chain strategy above already gives every individual PR an independent review boundary
   (including a within-S6 split), there is no reviewer-load benefit left to buy by adding a
   second SDD change on top. Ask the user to confirm this before `sdd-apply` proceeds, since it
   is explicitly a residual open question from design (Q5), not a fully closed decision.

---

## Requirement coverage check

- `categorias-model`: CAT-01 (T1.1/T1.2/T1.7), CAT-02 (T1.3/T1.4/T2.4/T2.5), CAT-03
  (T2.1/T2.2/T2.7), CAT-04 (T1.5/T1.7/T1.8/T1.9), CAT-05 (T3.1-T3.5) — all 5 covered.
- `categorias-api`: CATAPI-01 (T4.4), CATAPI-02 (T4.1/T4.3), CATAPI-03 (T4.5), CATAPI-04 (T4.5),
  CATAPI-05 (T5.1/T5.2/T5.3/T5.4/T5.5) — all 5 covered.
- `web-app`: WCAT-01 (T6.8/T6.9), WCAT-02 (T6.1/T6.2/T6.6/T6.7), WCAT-03 (T6.8/T6.9), WCAT-04
  (T6.4/T6.5/T6.6), WCAT-05 (T6.6/T6.7/T6.11) — all 5 covered.

---

## Archive-time reconciliation (added 2026-07-19, `sdd-archive`)

**T3.6** was the sole remaining unchecked implementation/verification task at the end of the
`sdd-apply`/`sdd-verify` cycle (verify-report Engram #295: "1 (T3.6 — manual dry-run,
explicitly deferred/human-gated)", verdict PASS WITH WARNINGS, 0 CRITICAL). Per the
`sdd-archive` skill's Task Completion Gate, an unchecked implementation task normally blocks
archive. This is the documented exception:

- **Reconciliation reason**: the orchestrator (change owner) explicitly instructed at archive
  time that, after `sdd-verify` completed, a human ran the supervised backfill against
  production outside of this SDD session — dry-run reviewed first, then applied — and it
  completed successfully, preserving every existing `Transaccion.bucketId` (only the
  previously-null `categoriaId` column was populated). This also included a fix to
  `db-safety.ts`'s production-detection (see Engram #294/apply-progress) so the destructive-gate
  correctly recognizes the project's real Supabase host as production, and a bridge/reconcile
  step for the pre-existing pending `add_demo_trial_mode` migration noted in the S1/S2 apply
  notes above, ahead of applying `add_categoria_model` and `drop_patron_bucketid` in order.
- **Proof basis**: this production rollout happened after `verify-report` (#295) was written, so
  it is not independently captured inside this change's own Engram artifact trail (proposal,
  spec, design, tasks, verify-report, apply-progress all predate it). The reconciliation is
  recorded here on the explicit, direct confirmation of the change owner at archive time, per the
  skill's "exceptional mechanical reconciliation" allowance. No other artifact or automated check
  independently re-verifies the production backfill's outcome from inside this repository's SDD
  history — see the archive report's "Residual / Human Verification Items" section for the
  honest status of what remains genuinely unverified by any artifact (the WCAT-05 live
  screen-reader spot-check).
- T3.6 is marked `[x]` above to reflect this closure. The original deferred-status note is
  preserved verbatim above the strikethrough point for audit-trail honesty (nothing about the
  original session's account of what it did or didn't run was rewritten).
