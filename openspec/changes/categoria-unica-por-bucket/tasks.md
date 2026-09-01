# Tasks: Categoría name uniqueness becomes per-bucket (ADR-042)

Inputs: `proposal.md`, `design.md` (D-01..D-15, F-1..F-15), spec deltas under
`specs/{catalogo-clasificacion-ownership,web-app,mobile-detalle-mes,mobile-configuracion}/spec.md`.
Strict TDD is active. Every implementation task is preceded by its own RED task in the
same phase; `(RED)`/`(GREEN)` markers follow the house convention.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~280 hand-written + generated `openapi.json`/`types.gen.ts` · PR2 ~150 · PR3 ~200 · PR4 **~420-480 hand-written** (see verification note below) |
| 400-line budget risk | PR1 Low (hand-written) / High if generated files count · PR2 Low · PR3 Low · PR4 **High** |
| Chained PRs recommended | **Yes** |
| Suggested split | PR1 → {PR2, PR3 in parallel} → PR4 (`feature-branch-chain` recommended; see Chain Strategy Note) |
| Delivery strategy | `ask-on-risk` (per orchestrator context) |
| Chain strategy | not yet chosen — task list works under either; differences flagged below |

**Decision needed before apply: Yes**
**Chained PRs recommended: Yes**
**400-line budget risk: High** (PR4)

### PR4 line-count verification (independent of design.md's ~380 estimate)

I re-derived this rather than restating the design's number. Spot-checked against the
actual files (2026-08-31):

- `actualizar-categoria.use-case.ts` is 107 lines today; F-4/F-5 confirm `actual` is
  already loaded before validation (verified by reading the file). The D-03 rewrite
  touches ~45 of those lines; its spec currently covers 3 paths and gains new
  assertions for: nombre-only pair check, bucket-only pair check (today untested —
  this is the latent-bug branch), combined rename+re-bucket, the reordered-validation
  observable-status-code change (`400` vs `409` when both fields are invalid), and the
  re-bucket-into-occupied-bucket 409-not-500 regression guard. Six new/changed
  scenarios at ~12-15 lines each ⇒ **~90-110 lines in the spec alone**.
- `categoria-repository.port.ts` is 104 lines; the `existeNombre` signature + docblock
  change is ~15 lines.
- Verified via `rg userId_nombre apps/api` (13 files, 15 occurrences): the fixture-swap
  surface is confirmed at design's stated size — 8 `*.int-spec.ts` files (not 10; F-11's
  "10 fixture resolutions" count occurrences, not files) + the rehearsal script. At
  ~3-4 changed lines per occurrence ⇒ **~45-55 lines**, plus the new
  `test/helpers/categoria-fixture.ts` (~25 lines).
- The two decisive integration scenarios (D-14: cross-bucket correctness + cross-user
  isolation with colliding names) are new, non-trivial `int-spec` blocks (arrange two
  categorías, a transaction, assert on both `categoriaId` and denormalized `bucketId`)
  — realistically **~60-90 lines**, not a one-line assertion.
- Catalog-invariant scenarios (CAT038-01 cross-bucket/case-insensitive/isolation;
  CAT038-03 all six PATCH scenarios) landing in `catalogo-crud.int-spec.ts` /
  `catalogo-rebucket.int-spec.ts` add roughly **80-110 lines** combined.

Summing hand-written surface: schema+migration+rehearsal (~30) + port+adapter+spec
(~55) + `CrearCategoriaUseCase`+spec (~20) + `ActualizarCategoriaUseCase`+spec
(~135) + template guard+spec (~30) + copy×3+tests+openapi example (~15) + fixture
helper+10 swaps (~70) + decisive + catalog-invariant integration tests (~140-200) ≈
**~495-555** at the high end, **~420-480** as a realistic middle estimate once
overlap with already-existing scenarios (approval-testing, not all-new) is
subtracted. **This is higher than design.md's ~380 point estimate**, not lower —
mainly driven by `ActualizarCategoriaUseCase`'s spec, which design's own §2 D-03
write-up already signals is the most behaviorally complex file in the slice (three
patch paths × collision/no-collision × the reordered-validation edge case).

**Conclusion: PR4 is over budget, not merely "at the ceiling."** See the optional
split below.

### Optional additional split — not in design.md, offered here because it is genuinely free

`test/helpers/categoria-fixture.ts` + the ~8-file fixture swap (D-10) touch **zero**
`src/` files and do not depend on the migration: `categoriaIdDe` is a plain
`findFirstOrThrow({ userId, bucketId, nombre })` lookup, which is valid against
**today's** schema too (the `bucketId` column and its index already exist per
ADR-036/037 — only the *unique* index is what changes). This means the helper +
swap can be its own PR, landed **before, after, or in parallel with PR1-3**, with
zero runtime risk (it is test infrastructure only) and no dependency on the
migration having landed.

- **PR4a** (optional): `test/helpers/categoria-fixture.ts` + the 8-file swap. ~70
  hand-written lines, zero `src/` changes, zero behavior change (approval-testing:
  the existing int-specs must stay green, unchanged in assertions, only their
  fixture-resolution mechanism changes).
- **PR4b**: everything else in PR4 (schema + migration + rehearsal + `existeNombre`
  port/adapter + both use cases + template guard + copy×3 + the two decisive
  integration tests + catalog-invariant scenarios). ~350-410 hand-written lines —
  still large, but the honest floor: relaxing the DB constraint and closing the
  `ActualizarCategoriaUseCase` gap are one indivisible correctness unit (locked
  decision 4 — splitting them reopens the raw-P2002-on-rebucket bug for the window
  between the two PRs).

This is presented as an option for the `ask-on-risk` gate, not a silent change to
the design's 4-slice plan. If the user prefers to stay at exactly 4 PRs,
`size:exception` on PR4 is the fallback the design already names, with the same
justification (roughly a third of the diff is mechanical, tsc-enumerated churn).

### Chain Strategy Note (informs, does not decide, the pending choice)

- **`feature-branch-chain`** (design's recommendation): no deploy happens until the
  tracker branch merges, so the hard-cutover window (API accepts only
  `categoriaId`, but web/mobile still send `nombre`) never reaches production.
  PR2 and PR3 can both target the tracker branch (or PR1's branch) directly and
  merge into it in either order — they touch disjoint files (`apps/web` vs.
  `apps/mobile`) with no conflict risk, so a strict linear 1→2→3→4 chain is not
  required, only 1-before-{2,3}-before-4.
- **`stacked-to-main`** would auto-deploy PR1 to production the moment it merges
  (Render/Vercel git-integration deploy on push to `main`, ADR-030) — with
  **neither client updated yet**. Every in-flight reclassify request from web or
  mobile would `400` until PR2/PR3 also merge and deploy. This is the accepted
  "stale APK" risk (proposal risk table) **widened to include the currently
  up-to-date web app too**, for the entire window between PR1 and PR2/PR3 merging.
  If `stacked-to-main` is chosen anyway, PR1 must not be merged to `main` without
  PR2 and PR3 ready to merge immediately after (same day, ideally same review
  session) — flag this explicitly if the user picks `stacked-to-main`.

### Suggested Work Units

| Unit | Goal | PR | Depends on |
|------|------|----|------------|
| 1 | ADR-042 + reclassify contract → `categoriaId` (Zod/route/use case/port/adapter/errors) + contract regen | PR1 | none (base: tracker/`main`) |
| 2 | Web reclassify control id-keyed | PR2 | PR1 (regenerated `api-client` types) |
| 3 | Mobile reclassify control id-keyed | PR3 | PR1 (regenerated `api-client` types). **Parallelizable with PR2** — disjoint files. |
| 4 (or 4a+4b) | The constraint: schema/migration, `existeNombre`, both use cases, template guard, copy×3, fixture helper, decisive + catalog-invariant integration tests | PR4 | PR2 **and** PR3 merged (D-01: constraint must be last) |

---

## PR1 — ADR-042 + backend reclassify contract → `categoriaId`

**Start state**: reclassify endpoint accepts `{ categoria: <nombre> }`; adapter resolves via
`findUnique({ userId_nombre })`; `CategoriaDesconocidaError.nombre` field.
**Finished state**: endpoint accepts only `{ categoriaId }` (hard cutover); adapter resolves
`findFirst({ id, userId })`; contract regenerated; ADR-042 recorded. Behaviour-preserving under
the *current* `(userId, nombre)` constraint (D-01) — id-keying is a strict refinement while
names are still unique, so no production behavior changes yet for a client that already sends
a valid id... except no client sends an id yet, which is why this PR alone is not release-safe
without PR2/PR3 (see Chain Strategy Note).
**Verify**: `pnpm api exec tsc --noEmit`, `pnpm api test`, `pnpm api openapi:check`, `pnpm api-client typecheck`, `pnpm api lint:ci`.
**Rollback boundary**: revert PR1 branch; no migration, no client depends on it yet.

### Phase 1.1: Domain — `CategoriaDesconocidaError` field rename

- [x] 1.1.1 (RED) Extend `apps/api/src/domain/errors/categoria-desconocida.error.spec.ts`: asserts `readonly categoriaId` (not `nombre`), both existing assertions updated (F-15: this is the field's only reader)
- [x] 1.1.2 (GREEN) Rename the field in `apps/api/src/domain/errors/categoria-desconocida.error.ts`; update its docblock to describe "id that did not resolve — does not exist or is not theirs, anti-enumeration"

### Phase 1.2: Application — port docblock + use case field rename

- [x] 1.2.1 (GREEN, no test — interface-only) Update `apps/api/src/application/ports/reclasificar-categoria.port.ts`: `reasignar(userId, transaccionId, categoriaId)`; docblock's "El writer resuelve `nombre` contra el catálogo REAL del usuario (`(userId, nombre)`)" becomes "(id, userId)"; `CategoriaDesconocidaError` clause updated per D-04
- [x] 1.2.2 (RED) Extend `apps/api/src/application/use-cases/reclasificar-transaccion.use-case.spec.ts`: input field is `categoriaId`, delegate call forwards it unchanged
- [x] 1.2.3 (GREEN) Rename `input.categoria` → `input.categoriaId` in `reclasificar-transaccion.use-case.ts`

### Phase 1.3: Infrastructure persistence — the load-bearing adapter fix (D-05)

- [x] 1.3.1 (RED) Extend `apps/api/src/infrastructure/persistence/prisma-reclasificar-categoria.repository.spec.ts`: the lookup is **exactly** `findFirst({ where: { id: categoriaId, userId } })` — this is the regression guard against the forbidden `findFirst({ userId, nombre })` shape (D-05) ever reappearing; `categoria` in the returned DTO is read from `categoriaRow.nombre`, never echoed from the input; `null` row → `CategoriaDesconocidaError(categoriaId)`; the write (`updateMany({ id: transaccionId, account: { userId } })`) is unchanged
- [x] 1.3.2 (GREEN) Implement in `prisma-reclasificar-categoria.repository.ts` per D-05/D-06

### Phase 1.4: Infrastructure HTTP — schema, route, contract docs

- [x] 1.4.1 (RED) Extend `apps/api/src/infrastructure/http-express/schemas/transacciones-categoria.schema.spec.ts`: `{ categoriaId: string }` required; a body with `{ categoria: "x" }` (no `categoriaId`) fails validation (CAT037-04's "legacy shape rejected" scenario); docblock's field-purpose comment reversed
- [x] 1.4.2 (GREEN) Rewrite `transacciones-categoria.schema.ts` per D-04
- [x] 1.4.3 (RED) Extend `apps/api/src/infrastructure/http-express/routes/transacciones.routes.spec.ts`: non-string/missing `categoriaId` coerces to `''` → `400` via `CategoriaDesconocidaError`, no new branch/status code; valid `categoriaId` reaches the use case unchanged
- [x] 1.4.4 (GREEN) Update the coercion in `transacciones.routes.ts` per D-04
- [x] 1.4.5 (GREEN, docs-only) Update the 400 description in `apps/api/src/infrastructure/http-express/schemas/openapi-document.ts` from "name does not resolve" to "id does not resolve"; update `apps/api/src/infrastructure/http/dto/reclasificar-categoria.dto.ts`'s docblock (D-04 — the "reversed decision" comment must name ADR-042 and the reason)

Note (apply-time, not in design.md): `apps/api/src/infrastructure/http-express/app.transacciones.spec.ts` also exercises this route through the full auth chain with the legacy `{ categoria }` body — updated to `{ categoriaId }` alongside 1.4.4/1.4.5 (same mechanical rename, not a new task).

### Phase 1.5: Contract regeneration

- [x] 1.5.1 Run `pnpm contract:sync` (`pnpm api openapi:emit && pnpm --filter @moneydiary/api-client generate`)
- [x] 1.5.2 Verify `pnpm api openapi:check` and `pnpm api-client typecheck` — zero drift (CAT038-14)

### Phase 1.6: Docs — ADR-042 + index + stale note

- [x] 1.6.1 Create `docs/adr/ADR-042-unicidad-de-categoria-por-bucket.md` per design.md D-13 (Decisión text, scoped-supersede table naming exact ADR-036/037 clauses, "Notes without amending" section). Apply-time correction: ADR-036's own file text never spells out `@@unique([userId, nombre])` verbatim (that sentence lives in the `schema.prisma` model comment its migration produced) — ADR-042 names this explicitly rather than fabricating a quote that isn't in ADR-036.md.
- [x] 1.6.2 Add ADR-042 row to `docs/adr/README.md`
- [x] 1.6.3 Add ADR-042 row to root `CLAUDE.md`'s ADR table. Apply-time correction: verified the literal "deuda registrada, no se construyó" sentence does NOT exist in root `CLAUDE.md`'s ADR-012 row (it is a bare one-liner with no status note) — that phrasing lives in `.claude/skills/yagni/SKILL.md` and `docs/adr/README.md`'s ADR-012 row instead, both out of scope for this PR. Gave the CLAUDE.md ADR-012 row an accurate status note (package is live, `workspace:*` in web+mobile, generated via `pnpm contract:sync`, per F-8) since it previously had none, rather than "correcting" text that was never there.

### Phase 1.7: Verification

- [x] 1.7.1 Run `pnpm api test` (all of 1.1-1.4 green) — 266 files, 2497 tests passed
- [x] 1.7.2 Run `pnpm api exec tsc --noEmit` — clean
- [x] 1.7.3 Run `pnpm api lint:ci` — 0 errors, 3 pre-existing unrelated warnings (excel services, untouched by this PR)
- [x] 1.7.4 Commit; note in the PR description that PR1 is not independently release-safe until PR2+PR3 land (Chain Strategy Note)

---

## PR2 — Web reclassify control id-keyed (WDM-10)

**Depends on PR1** (regenerated `@moneydiary/api-client` types — `apps/web/src/api/types.ts` re-exports `ReclasificarCategoriaDto`, unchanged shape, F-8).
**Parallelizable with PR3** — disjoint files, no shared state.
**Start state**: `ReclasificarCategoriaControl` identifies categorías by `nombre`; `categoriaActual: string | null` prop.
**Finished state**: identity is `id`-keyed end-to-end per D-07; `GrupoMovimientos` passes `{ id, nombre }`.
**Verify**: `pnpm web test`, `pnpm web typecheck`, `pnpm web lint`.
**Rollback boundary**: revert PR2 branch only; PR1's contract already accepts `categoriaId` from any caller, so this rollback does not touch the API.

### Phase 2.1: API seam — the compile trigger (D-07)

- [x] 2.1.1 (RED) Extend `apps/web/src/api/use-reclasificar-categoria.test.ts` (or equivalent): `ReclasificarCategoriaInput.categoriaId` (not `categoria`); `postReclasificarCategoria` serializes `{ categoriaId }`
- [x] 2.1.2 (GREEN) Rename `ReclasificarCategoriaInput.categoria` → `categoriaId` in `use-reclasificar-categoria.ts`; update `postReclasificarCategoria(transaccionId, categoriaId)` and its docblock in `client.ts` (D-07 — this rename is what turns the control's old call site into a compile error)

### Phase 2.2: Control identity (D-07, WDM-10)

- [x] 2.2.1 (RED) Extend `ReclasificarCategoriaControl.test.tsx`: prop is `categoriaActual: { id: string; nombre: string } | null`; two same-named categorías in different buckets each get a distinct `<option>` key/value (their own id); selecting the `Deseos` duplicate shows the `Deseos` confirmation and sends `{ categoriaId: <Deseos id> }` (WDM-10 both scenarios); `pendiente` no longer carries a `nombre` field
- [x] 2.2.2 (GREEN) Implement all five sites from design.md's D-07 table: prop shape, `valor` state (holds id), `categoriaPorId` lookup replacing `bucketDe(nombre)`, `<option key/value>` by id, the mid-flight fallback `<option>`; shrink `pendiente` to `{ categoriaId, bucketNuevo }`; the three reset paths (`onError`, unresolved-defensive branch, `cancelar`) use `categoriaActual?.id ?? ''`

### Phase 2.3: Caller wiring

- [x] 2.3.1 (RED) Extend `GrupoMovimientos.test.tsx`: passes `categoriaActual={grupo.categoriaId === null ? null : { id: grupo.categoriaId, nombre: grupo.nombre }}`
- [x] 2.3.2 (GREEN) Update the call site in `GrupoMovimientos.tsx`

Note (apply-time, not in design.md): `apps/web/src/api/client.test.ts`'s
`postReclasificarCategoria` describe block also exercises the request body
directly with the stale `{ categoria }` key/test title — updated to
`{ categoriaId }` alongside 2.1.2 (same mechanical rename as PR1's
`app.transacciones.spec.ts` note, not a new task). Similarly, every
pre-existing `categoriaActual="<nombre>"` string prop and `select.value`/body
assertion across `ReclasificarCategoriaControl.test.tsx`'s other ~20
scenarios needed the mechanical `{ id, nombre }` migration once the prop
shape changed (D-07's own stated intent — the shape change is the compile/
behavior trigger); none of the assertions' intent changed, only the
identity representation.

### Phase 2.4: Verification

- [x] 2.4.1 Run `pnpm web test` — 138 files, 1729 tests passed
- [x] 2.4.2 Run `pnpm web typecheck` — clean
- [x] 2.4.3 Run `pnpm web lint` — 0 errors

---

## PR3 — Mobile reclassify control id-keyed (MDET-08)

**Depends on PR1** (F-8: `apps/mobile/src/domain/detalle.types.ts` is a generated re-export — **needs no edit**, response shape unchanged).
**Parallelizable with PR2** — disjoint files, no shared state.
**Start state**: `ReclasificarMobileControl` compares `cat.nombre === categoriaActual.nombre`; two same-named categorías both render "● actual" (ADR-018 defect).
**Finished state**: identity is `id`-keyed at all four sites (D-08).
**Verify**: `pnpm --filter @moneydiary/mobile test`.
**Rollback boundary**: revert PR3 branch only; does not touch the API or web.

### Phase 3.1: API wire — the ONLY gate on this edit is a test, not a type (D-08)

- [x] 3.1.1 (RED) Extend `apps/mobile/src/api/reclasificar.spec.ts` (5 tests, per proposal Affected Areas): asserts the serialized body is `{ categoriaId }`, never `{ categoria }` — this spec is the actual gate because both the positional `string → string` rename and the untyped body literal compile silently either way (design D-08 names this explicitly)
- [x] 3.1.2 (GREEN) Rename `reclasificarCategoria(transaccionId, categoria)` → `(transaccionId, categoriaId)` and the body literal in `apps/mobile/src/api/categorias.ts`; guard `esReclasificarDto` is unchanged (F-8)

### Phase 3.2: Control identity — the concrete a11y bug (D-08, MDET-08)

- [x] 3.2.1 (RED) Extend `ReclasificarMobileControl` RNTL tests: with "Transporte" in `Necesidades` (current, id `A`) and "Transporte" in `Deseos` (id `B`), only row `A` renders "● actual" and `accessibilityState={{selected:true}}` — row `B` must NOT (this is the regression pin for today's bug); `testID` is `reclasificar-opcion-${cat.id}`; selecting row `B` and confirming sends `{ categoriaId: "B" }`
- [x] 3.2.2 (GREEN) Implement the four sites from D-08's table: `cat.id === categoriaActual.id`, `testID` by `cat.id`, `handleSelectCategoria(cat.id, cat.bucket)`, `commit(categoriaId, bucketNuevo?)` calling `reclasificarCategoria(tx.id, categoriaId)`. `esMismoBucket` keeps comparing bucket names (unchanged, D-08)

Note (apply-time, not in design.md): once `testID` moved from `cat.nombre` to `cat.id`,
all ~10 pre-existing scenarios in `ReclasificarMobileControl.spec.tsx` that selected an
option via `reclasificar-opcion-Entretenimiento`/`reclasificar-opcion-Comida` needed the
mechanical id-keyed rename (`reclasificar-opcion-cat-deseos`/`reclasificar-opcion-cat-necesidades`)
to keep passing — identical pattern to PR2's `ReclasificarCategoriaControl.test.tsx` note,
not a new task; no assertion's intent changed.

### Phase 3.3: Verification

- [x] 3.3.1 Run `pnpm --filter @moneydiary/mobile test`
- [x] 3.3.2 Confirm `apps/mobile/src/domain/detalle.types.ts` was NOT touched (F-8/D-06 — record this explicitly in the PR description, since it corrects a proposal assumption a reviewer might "fix"). Verified via `git diff --stat` — zero changes to this file.

---

## PR4 — The constraint: bucket-scoped uniqueness (CAT038-01/03/13/14, D-02/03/09/10/11/12/14)

**Depends on PR2 AND PR3 merged** (D-01 hard ordering: no commit may contain both a name-keyed
write-path lookup and the relaxed index — by PR4, both clients are already id-keyed, so this
constraint is trivially satisfied).
**Start state**: `(userId, nombre)` unique; `existeNombre` bucket-blind; `ActualizarCategoriaUseCase`
never checks uniqueness on a bucket-only PATCH.
**Finished state**: `(userId, bucketId, nombre)` unique; `existeNombre` bucket-scoped; both use
cases validate the resulting pair; copy is bucket-aware in all three surfaces; the decisive
correctness test proves the DB, not a mock, resolves the right row.
**Verify**: `pnpm api test`, `pnpm api test:integration` (gated `ALLOW_DESTRUCTIVE_DB=1`), `pnpm api exec tsc --noEmit`, `pnpm api lint:ci`, `pnpm web test` (copy), `pnpm --filter @moneydiary/mobile test` (copy).
**Rollback boundary**: code-only rollback is always safe (D-15 — app gate becomes stricter than
the DB again, today's relationship). DB rollback requires the pre-rollback dedup query (D-15) if
any cross-bucket duplicate was created after deploy — document in the deploy runbook, not code.

### Phase 4.0: Local Postgres reachable (prerequisite — first task, per D-14)

- [x] 4.0.1 Provision local Postgres per `apps/api/docs/local-test-db.md` (`pnpm api test:db:setup`, `.env.test` with `ALLOW_DESTRUCTIVE_DB=1`); confirm `pnpm api test:integration` is green on `main` BEFORE writing any RED test in this slice, so a subsequent red is trusted to be this slice's, not a pre-existing break. Done by the orchestrator before this PR4b apply session — baseline measured at `3 failed | 199 passed (202)`, all 3 pre-existing in `test/seed.int-spec.ts` idempotency (local-DB-reseed artifact, unrelated to this slice).

### Phase 4.1: Schema + migration (D-09, CAT038-13) — lands before the app-layer change

Ordering rationale (not in design.md, derived here): the DB migration must land
**before** `existeNombre` becomes bucket-scoped, not after. If the app-layer check
were relaxed first while the DB still enforced the old `(userId, nombre)` index, a
legitimate cross-bucket create would pass the app gate and then hit a raw Prisma
`P2002` — the exact "clean 409, never 500" guarantee this slice exists to add would
be violated for one commit. Migrating the DB first is safe either way: old
bucket-blind app code simply doesn't yet expose the new capability, no crash.

- [x] 4.1.1 (RED) Create `apps/api/test/categoria-unique-index.int-spec.ts` (or extend an existing schema-level int-spec): query `pg_indexes` for `Categoria` and assert `Categoria_userId_bucketId_nombre_key` exists, `Categoria_userId_nombre_key` does not (CAT038-13 scenario 1)
- [x] 4.1.2 (GREEN) Edit `apps/api/prisma/schema.prisma:149`: `@@unique([userId, bucketId, nombre])`, rewrite the now-false comment at `:146-148`; create `apps/api/prisma/migrations/<timestamp>_categoria_unica_por_bucket/migration.sql` per D-09's exact SQL (prose header, `DROP INDEX` then `CREATE UNIQUE INDEX`, no down file); apply it locally (`prisma migrate dev`) against the test DB. Applied via hand-authored migration + `prisma migrate deploy` (kept the exact D-09 SQL verbatim rather than a diff-generated migration); `prisma generate` re-run afterward.
- [x] 4.1.3 (GREEN, no new test — this is a doc-honesty fix) Update `apps/api/prisma/rehearsals/us037-catalogo-rehearsal.ts:301-304` per D-09: assert the new index exists AND the old one does not, mirroring the script's existing pattern two assertions later

### Phase 4.2: `existeNombre` port + adapter (D-02) — the miscompile-proof signature

- [x] 4.2.1 (RED) Extend `apps/api/src/infrastructure/persistence/prisma-categoria.repository.spec.ts`: `existeNombre({ userId, nombre, bucket, excluirId? })` composes `where: { userId, bucketId: BUCKET_IDS[bucket], nombre: { equals, mode: 'insensitive' }, ...(excluirId ? { id: { not: excluirId } } : {}) }`
- [x] 4.2.2 (GREEN) Change the `existeNombre` signature to the criterion-object form in `categoria-repository.port.ts` (D-02 — rejects the positional form explicitly because `ActualizarCategoriaUseCase`'s current 3-arg call would silently miscompile with a positional 4th param); implement in `prisma-categoria.repository.ts`
- [x] 4.2.3 Run `pnpm api exec tsc --noEmit` immediately — expect compile errors at every stale `existeNombre` call site and its mocks (the exhaustive-enumeration property D-02/D-10 rely on); do not silence any with `as any`. Confirmed: exactly 2 compile errors, `actualizar-categoria.use-case.ts:76` and `crear-categoria.use-case.ts:87` — matches D-02's claim precisely.

### Phase 4.3: `CrearCategoriaUseCase` — bucket-scoped uniqueness (CAT038-01)

- [x] 4.3.1 (RED, unit) Extend `crear-categoria.use-case.spec.ts`: `existeNombre` called with `{ userId, nombre, bucket: input.bucket }` (object, not positional)
- [x] 4.3.2 (RED, integration) Extend `apps/api/test/catalogo-crud.int-spec.ts`: same-bucket case-insensitive duplicate → `409`; same name in a DIFFERENT bucket → `201`, both rows coexist; a second user's same-named category never blocks the first user's create (CAT038-01 all 5 scenarios — the first two already pass today and act as the regression baseline). Apply-time note: before 4.3.3's fix, ALL 10 catalogo-crud scenarios failed 409 (not just the 2 new ones) — the broken runtime call site (`existeNombre` still called positionally against the new object-shaped port) silently dropped every WHERE filter (Prisma treats `undefined` leaf values as omitted), so the check matched an arbitrary row and false-409'd universally. RED for the right systemic reason; resolved by 4.3.3.
- [x] 4.3.3 (GREEN) Update the `existeNombre` call site in `crear-categoria.use-case.ts`

### Phase 4.4: `ActualizarCategoriaUseCase` — effective pair, one call, reordered validation (D-03, CAT038-03)

- [x] 4.4.1 (RED, unit) Extend `actualizar-categoria.use-case.spec.ts`: nombre-only patch checks `{nombre: patched, bucket: actual.bucket, excluirId: input.id}`; bucket-only patch checks `{nombre: actual.nombre, bucket: patched, excluirId: input.id}` (**today untested — this is the latent gap the migration arms**); both-fields patch checks both patched; `excluirId` always excludes the row from colliding with itself (no-op patch never false-409s); validation order is shape → bucket-assignability → pair-uniqueness, so a patch with a colliding `nombre` AND an invalid `bucket` returns `400 BUCKET_NO_ASIGNABLE`, not `409` (the recorded behaviour change from D-03)
- [x] 4.4.2 (RED, integration) Extend `apps/api/test/catalogo-rebucket.int-spec.ts`: re-bucket-only into a bucket that already holds that name → `409`, never `500`, nothing persisted (the CA-05 regression this slice exists to close); rename-into-different-bucket succeeds; rename+re-bucket combined validated against the resulting pair (both the colliding and the non-colliding branch); re-bucket updating history atomically is UNCHANGED (existing scenario, run as regression). Confirmed the exact CA-05 500 regression pre-fix (raw Prisma P2002 surfaced as HTTP 500), matching design's prediction precisely.
- [x] 4.4.3 (GREEN) Rewrite `actualizar-categoria.use-case.ts` per D-03's pseudocode: compute `nombreEfectivo`/`bucketEfectivo`, one `existeNombre` call with `excluirId: input.id`, then build the patch (bucket only if it actually changed — unchanged mechanism)

### Phase 4.5: `catalogo-template.ts` guard (D-11)

- [x] 4.5.1 (RED) Extend (or create) a spec for `catalogo-template.ts`: the current `CATEGORIA_TEMPLATE` has no duplicate `nombre` (passes); a synthetic template with a cross-bucket duplicate throws at construction — extract the check into a small named function (`assertSinNombresDuplicados` or similar) so it is unit-testable outside module-scope import side effects
- [x] 4.5.2 (GREEN) Implement the assertion per D-11 and call it at module scope in `catalogo-template.ts`, with the comment naming ADR-042 and the failure mode it prevents (`idPorNombre` last-write-wins)

### Phase 4.6: Copy ×3 — bucket-aware `NOMBRE_DUPLICADO` (D-12, WDM-11, MCTG-07)

- [x] 4.6.1 (RED) Extend `nombre-categoria-duplicado.error.spec.ts`: message is `'Ya existe una categoría con ese nombre en ese bucket.'`
- [x] 4.6.2 (GREEN) Update `apps/api/src/domain/errors/nombre-categoria-duplicado.error.ts:13`; check `openapi-document.ts` for an embedded example of the old message and update it if present; re-run `pnpm contract:sync` if the example changed, then re-verify `openapi:check`. Searched — no embedded example of the old message exists in `openapi-document.ts`; `openapi:check` confirmed still clean, no sync needed. Also updated a stale JSDoc/P2002-fixture reference in `prisma-identidad-google.repository.ts`/`.spec.ts` naming the OLD constraint name (`Categoria_userId_nombre_key`) — the discriminator logic is generic (substring match, functionally unaffected either way) but the comment and fixture now name the real constraint (`Categoria_userId_bucketId_nombre_key`), a deliberate decision (not silently ignored per the apply brief).
- [x] 4.6.3 (RED) Extend `apps/web/src/components/configuracion/categorias/mensajes-catalogo.test.ts:63`: `NOMBRE_DUPLICADO` is exactly `'Ya tienes una categoría con ese nombre en ese bucket.'` (WDM-11)
- [x] 4.6.4 (GREEN) Update `mensajes-catalogo.ts:103` in `apps/web`
- [x] 4.6.5 (RED) Extend `apps/mobile/src/domain/mensajes-catalogo.spec.ts:75`: same exact literal (MCTG-07)
- [x] 4.6.6 (GREEN) Update `mensajes-catalogo.ts:94` in `apps/mobile`

Apply-time correction (not in design.md/tasks.md): `pnpm web test` and mobile's Jest run surfaced 2 web files (`NuevaCategoriaForm.test.tsx`, `NuevaCategoriaDesdeFilaForm.test.tsx`) and 1 mobile file (`NuevaCategoriaForm.spec.tsx`, 3 occurrences) asserting the OLD `NOMBRE_DUPLICADO` copy end-to-end (via the rendered `alert` role), not caught by the task list's two named test files. Same mechanical pattern as PR1/PR2/PR3's "apply-time note" precedent — updated all 4 occurrences to the new literal; no assertion's intent changed.

### Phase 4.7: Test fixture helper + the 8-file swap (D-10) — see optional PR4a split above

- [x] 4.7.1 Create `apps/api/test/helpers/categoria-fixture.ts` — `categoriaIdDe(prisma, { userId, bucket, nombre })`, `findFirstOrThrow` requiring `bucket` by construction (D-10 — a name-only variant would be a ready-made template of the forbidden D-05 shape)
- [x] 4.7.2 Verify the vitest `include` globs for `test:integration` do not pick up this non-spec file (design's own flagged apply-time assumption — confirm, don't assume). Verified: `apps/api/vitest.int.config.ts` include is `test/**/*.int-spec.ts`; `test/helpers/categoria-fixture.ts` does not match the `*.int-spec.ts` suffix. Also confirmed the unit config (`vitest.config.ts`, include `src/**/*.spec.ts` + `test/*.spec.ts` top-level only) does not pick it up either.
- [x] 4.7.3 Swap the `userId_nombre` fixture resolutions to `categoriaIdDe` across: `reclasificar-categoria.int-spec.ts`, `catalogo-rebucket.int-spec.ts`, `catalogo-isolation.int-spec.ts` (3 occurrences), `catalogo-delete-en-uso.int-spec.ts`, `categorizacion.int-spec.ts`, `detalle-bucket.int-spec.ts`, `movimientos-mes.int-spec.ts`, `backfill-categorias.int-spec.ts` — mechanical, `tsc` enumerates each once `prisma generate` drops the `userId_nombre` selector from `CategoriaWhereUniqueInput`; run the full suite after each file to confirm zero assertion drift (approval-testing: behavior must stay byte-identical). Done, PR4a (`feat/categoria-unica-pr4a-fixtures`, commit `567e8173`, based on PR3's tip). Apply-time correction: `movimientos-mes.int-spec.ts` had a SECOND reference to the swapped-out row variable (`streamingRowB.id` at the `expect(...).toEqual(...)` a few lines below the lookup, not just at the `Transaccion.create` call) that a plain `rg userId_nombre` grep did not surface — caught by `tsc --noEmit` (`ReferenceError`-equivalent compile error) run as a mid-swap checkpoint, not by the initial per-occurrence grep alone. Lesson recorded in apply-progress: run `tsc --noEmit` after every file in this kind of swap, not just at the end.
- [x] 4.7.4 Delete or fold `reclasificar-categoria.int-spec.ts:139-148`'s local `categoriaIdFor` into the shared helper. Done — local helper deleted, all 16 call sites folded into `categoriaIdDe` with the bucket named explicitly per D-10.

### Phase 4.8: The decisive correctness + isolation tests (D-14 — MANDATORY, real Postgres)

- [x] 4.8.1 (RED) Extend `apps/api/test/reclasificar-categoria.int-spec.ts`: given user A owns "Transporte" in `Necesidades` (id `A`, via `categoriaIdDe`) and "Transporte" in `Deseos` (id `B`), `reasignar(userA, tx, B)` persists `categoriaId === B` and the transaction's denormalized `bucketId` matches `B`'s own bucket — **this cannot be written against a mock; it must fail for real if the adapter regresses to `findFirst({ userId, nombre })`** (CAT037-04 final scenario)
- [x] 4.8.2 (RED) Same file: companion scenario — with the same fixture, `reasignar` using user B's `categoriaId` fails `CategoriaDesconocidaError` and user A's transaction is unchanged (RNF-SEC-006 with names deliberately colliding across users)
- [x] 4.8.3 (GREEN — should already pass) Run both; if either fails, the regression is in PR1's adapter (Phase 1.3) or Phase 4.1's migration, not in new code written this phase — fix at the source, do not patch around it here. Both passed on first run, as predicted — proves PR1's `findFirst({ id, userId })` adapter and Phase 4.1's migration are both correct.

### Phase 4.9: Verification

- [x] 4.9.1 Run `pnpm api test` (unit, full suite) — 266 files, 2505 tests passed
- [x] 4.9.2 Run `pnpm api test:integration` (all of 4.1, 4.3.2, 4.4.2, 4.8 green) — 30 files, 210 tests: 207 passed, 3 failed (all pre-existing `test/seed.int-spec.ts` idempotency, baseline unchanged; +8 tests over the 202-test baseline, matching the 8 new scenarios added this slice)
- [x] 4.9.3 Run `pnpm api exec tsc --noEmit` — clean
- [x] 4.9.4 Run `pnpm api lint:ci` — 0 errors, 3 pre-existing unrelated warnings (excel services `any`-argument, same ones PR1/PR4a already noted as untouched)
- [x] 4.9.5 Run `pnpm web test` and `pnpm --filter @moneydiary/mobile test` — web 138 files/1729 tests passed; mobile 73 suites/820 tests passed (after fixing the 3 apply-time-discovered stray copy assertions noted under 4.6)
- [x] 4.9.6 Confirm via `git status`/`git diff --stat` that PR4 touched no files outside the list in design.md §4's "Slice 4" rows plus the two web/mobile copy files. Confirmed — diff scope is exactly: the Slice-4 `src/`+prisma+schema+migration+test files, the 2 named copy files (web/mobile `mensajes-catalogo.ts`+tests), the `prisma-identidad-google` stale-fixture fix (4.6.2 decision), and 3 additional web/mobile test files asserting the same copy end-to-end (4.6 apply-time correction) — no unrelated file touched. Also ran `pnpm api openapi:check` — clean, confirms D-12's copy change needed no contract sync.

---

## Cross-cutting: spec sync (owned by `sdd-archive`, tracked here so it is not lost)

- [ ] X.1 At archive time, fold this change's spec deltas into the canonical spec files:
  `openspec/specs/catalogo-clasificacion-ownership/spec.md` (CAT038-01/03/13/14, CAT037-04),
  `openspec/specs/web-app/spec.md` (WDM-10/11), `openspec/specs/mobile-detalle-mes/spec.md` (MDET-08),
  `openspec/specs/mobile-configuracion/spec.md` (MCTG-07, new domain if not already present)
- [ ] X.2 **Partial prose edit, not an appended requirement** (non-negotiable input #9): `openspec/specs/catalogo-clasificacion-ownership/spec.md:18` (CAT037-01) literally states `(userId, nombre)` uniqueness — this sentence must be edited in place to reflect that CAT038-13 has superseded ONLY its uniqueness clause (ADR-042 scoped-supersede pattern), leaving the rest of CAT037-01 (NOT NULL `userId`, bootstrap ownership, no FK repointing) untouched and correctly worded
- [ ] X.3 Confirm `docs/adr/README.md` and root `CLAUDE.md` carry the ADR-042 row added in PR1 Phase 1.6 (idempotent check, not a new edit)
