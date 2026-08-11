# Tasks: US-037 — Per-user classification catalog (copy-on-signup)

Strict TDD is active. Test runner: `pnpm api test` (unit), `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration` (integration, ephemeral local Postgres per `apps/api/docs/local-test-db.md`). Each code task is RED (failing test) → GREEN (implementation) unless marked otherwise. Ordering follows design §12's 7 natural seams; seams 4-5 cannot land before seam 1.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1200–1800 (≈20 source/test files + migration SQL + ADR doc; largest single contributor is fixture-rollout churn across ~10-15 existing `*.int-spec.ts` files in task 6.7) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 7 slices along design §12 seams, PR1 → PR7 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — see recommendation below |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

**Chain-strategy recommendation (not a decision — orchestrator/user must confirm):** design §12 states migration + code are one atomic deployable unit — a schema-only or code-only partial deploy corrupts reads. Render/Vercel auto-deploy on push to `main` (ADR-030), so **stacked-to-main is unsafe here**: any intermediate slice merged to `main` deploys immediately and can blank categories in prod before downstream seams land. **Feature Branch Chain** is the fit: child PRs #1-#7 target each prior PR's branch, only the tracker merges to `main`, and merge happens once seam 7 + task 6.9 (rehearsal) + task 6.10 (cross-workspace verification) all pass on the accumulated branch.

### Suggested Work Units (Feature Branch Chain — tracker `feat/us-037-catalogo-per-user`)

| PR | Seam | Base | Scope | Est. lines |
|---|---|---|---|---|
| 1 | Schema + migration + FK gate | tracker | Tasks 1.1-1.6 | 150-250 |
| 2 | Template module + copy hook | PR1 | Tasks 2.1-2.4 | 250-300 |
| 3 | Seed + demo creation + cleanup chain | PR2 | Tasks 3.1-3.7 | 200-250 |
| 4 | Write paths (catalog port, bucket writer, reclasificar, DTO, D-08) | PR3 | Tasks 4.1-4.10 | 250-300 |
| 5 | Read paths + fold deletion | PR4 | Tasks 5.1-5.5 | 150-200 |
| 6 | Isolation + regression tests + fixture rollout | PR5 | Tasks 6.1-6.10 | 300-400 (largest — consider splitting 6.7 fixture rollout into its own child if it alone risks >400) |
| 7 | ADR-036 + docs | PR6 | Tasks 7.1-7.3 | 150-250 |

Tracker merges to `main` only after PR7 lands on the accumulated branch and 6.9/6.10 pass end-to-end.

---

## Phase 1: Schema + migration + FK gate (seam 1) — ✅ DONE (2026-08-11, PR1)

- [x] 1.1 [GATE] Edit `apps/api/prisma/schema.prisma` per design §2.1: `Categoria.userId` (NOT NULL) + `user User @relation`, `@@unique([userId, nombre])`, `@@unique([id, userId])`, drop global `nombre` unique; `PatronClasificacion.userId` + `categoria Categoria @relation(fields:[categoriaId,userId], references:[id,userId])` (no `user` relation on Patron — D-06); `User.categorias Categoria[]` back-relation only. Verify: `pnpm api exec prisma validate`. ✅ `prisma validate` green.
- [x] 1.2 [GATE] **OUTCOME: composite FK CONFIRMED present.** Since the local ephemeral Postgres already had 8 Categoria / 20 PatronClasificacion rows, interactive `prisma migrate dev --create-only` refused non-interactively (Prisma 7 behavior); used `prisma migrate diff --from-schema <pre-change> --to-schema <post-change> --script` instead (pure schema diff, no DB mutation) and confirmed the generated SQL contains `ALTER TABLE "PatronClasificacion" ADD CONSTRAINT "PatronClasificacion_categoriaId_userId_fkey" FOREIGN KEY ("categoriaId","userId") REFERENCES "Categoria"("id","userId")`. → proceeded with 1.3a. **1.3b fallback NOT needed** — no downstream impact on tasks 6.2/7.1's fallback branches.
- [x] 1.3a Composite FK confirmed: finalized migration SQL at `apps/api/prisma/migrations/20260811200000_us037_catalogo_per_user/migration.sql` — Step0 guard + `n_reales = 0` fresh-DB branch (design §2.3), Step1 demo purge (`Session→Transaccion→Ingesta→Account→User`, `esDemo=true`, mirrors `DemoCleanupService.borrarExpirados()`'s exact join shape), Step2 add nullable `userId` columns, Step3 backfill UPDATE (Categoria then Patron-inherits-from-Categoria), Step4 tighten (`SET NOT NULL`, drop `Categoria_nombre_key`, add `Categoria_userId_nombre_key`/`Categoria_id_userId_key`/`PatronClasificacion_userId_idx`, composite FK).
- [x] 1.3b Fallback — **not taken** (gate 1.2 confirmed the composite FK).
- [x] 1.4 Verify: applied via `prisma migrate deploy` (Prisma 7 rejects non-interactive `migrate dev`; `deploy` is the correct non-interactive apply command and is what CI/prod use) against the local ephemeral Postgres — applied cleanly against the real seeded data (1 bootstrap user, 8 Categoria, 20 PatronClasificacion, 0 demo users): all 8/20 rows now owned by the bootstrap user, all constraints present, `prisma migrate status` reports up to date. Client regenerated (`prisma generate`).
- [x] 1.5 Migration rehearsal, run 1 (design §9.3) — scripted and PASSING at `apps/api/prisma/rehearsals/us037-catalogo-rehearsal.ts` (`pnpm us037:rehearsal prod-like`). Runs against a throwaway `<db>_rehearsal` database (never the real local DB). Seeds a bootstrap non-demo user + categorized transaction + one demo user with a categorized ingesta/session; applies the migration; asserts bootstrap catalog owned/intact (8 Categoria + 2 seeded PatronClasificacion, all owned by the bootstrap user), the bootstrap `Transaccion.categoriaId` unchanged (D-05), the demo user/account/transaccion/session fully purged, and all 5 target constraints (2 unique indexes, 1 plain index, 2 FKs) present + the old `Categoria_nombre_key` index gone. All assertions green.
- [x] 1.6 Migration rehearsal, run 2 — scripted in the same file (`pnpm us037:rehearsal multi-user-guard`). Seeds two non-demo users on a fresh throwaway DB; `prisma migrate deploy` raises (the us-037 guard exception); asserts the migration transaction fully rolled back (`Categoria.userId` column never added) and both users remain untouched. Green.

## Phase 2: Template module + copy hook (seam 2)

- [ ] 2.1 [RED] Write `apps/api/src/infrastructure/persistence/catalogo-template.spec.ts`: `CATEGORIA_TEMPLATE` covers exactly the 8 `Categoria` enum values with `bucketId === BUCKET_IDS[CATEGORIA_BUCKET[nombre]]`; `PATRON_TEMPLATE` entries have valid enum `categoria` + unique `patron` text; `CATEGORIA_TEMPLATE_SIZE`/`PATRON_TEMPLATE_SIZE` derived from array lengths.
- [ ] 2.2 [GREEN] Implement `apps/api/src/infrastructure/persistence/catalogo-template.ts` per design §3. Verify: `pnpm api test catalogo-template`.
- [ ] 2.3 [RED] Extend same spec for `copiarCatalogoTemplate(tx, userId)`: fake `CatalogoTemplateClient` — exactly 2 `createMany` calls, every row carries `userId`, pattern `categoriaId`s resolve via the read-back map, no `$transaction` opened, a rejecting client causes the promise to reject.
- [ ] 2.4 [GREEN] Implement `copiarCatalogoTemplate` per contract rules (throws on failure, not idempotent, `Pick<PrismaClient,'categoria'|'patronClasificacion'>` param type — design §3). Verify: `pnpm api test catalogo-template`.

## Phase 3: Seed + demo creation + cleanup chain (seam 3)

- [ ] 3.1 [RED] Extend `apps/api/src/infrastructure/persistence/seed-catalog.spec.ts`: catalog rows carry `userId: USER_ID_FIJO`, fixed ids unchanged, idempotency preserved.
- [ ] 3.2 [GREEN] Update `apps/api/prisma/seed.ts`: rebuild `CATEGORIA_CATALOG`/`PATRON_CATALOG` from template constants + fixed id maps; add `userId: USER_ID_FIJO` to `create` (not `update`) in both upsert loops; re-export `CATEGORIA_CATALOG_SIZE`/`PATRON_CATALOG_SIZE` from `catalogo-template.ts`. Verify: `pnpm api test seed-catalog`.
- [ ] 3.3 [RED] Extend `apps/api/src/infrastructure/persistence/prisma-demo.repository.spec.ts`: `crear()` calls `copiarCatalogoTemplate(tx, user.id)` between `tx.user.create` and `tx.account.create`; a forced failure rolls back the whole transaction (no partial rows).
- [ ] 3.4 [GREEN] Wire `copiarCatalogoTemplate` into `apps/api/src/infrastructure/persistence/prisma-demo.repository.ts` `crear()` per design §6. Verify: `pnpm api test prisma-demo.repository`.
- [ ] 3.5 [RED] Extend `apps/api/src/infrastructure/http/auth/demo-cleanup.service.spec.ts`: delete chain order `Session→Transaccion→Ingesta→PatronClasificacion(userId)→Categoria(userId)→Account→User`; both new deletes use `deleteMany({where:{userId:{in:ids}}})`.
- [ ] 3.6 [GREEN] Update `apps/api/src/infrastructure/http/auth/demo-cleanup.service.ts` `borrarExpirados()` per design §6. Verify: `pnpm api test demo-cleanup.service`.
- [ ] 3.7 New `apps/api/test/demo-lifecycle.int-spec.ts`: a new demo user gets exactly 8+20 rows atomically; forced transaction failure leaves zero rows (user/account/catalog/session); after `borrarExpirados()` on an expired demo user, no FK error and zero orphan `Categoria`/`PatronClasificacion` rows. Verify: `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration demo-lifecycle`.

## Phase 4: Write paths (seam 4)

- [ ] 4.1 [RED] Extend `apps/api/src/application/use-cases/categorizar-transaccion.use-case.spec.ts`: two equal-`prioridad` patterns with cuid ids resolve by `patron` text deterministically in both input orders (D-08).
- [ ] 4.2 [GREEN] Update sort comparator in `apps/api/src/application/use-cases/categorizar-transaccion.use-case.ts` to `(prioridad asc, patron asc, id asc)`. Verify: `pnpm api test categorizar-transaccion`.
- [ ] 4.3 [RED] Update `apps/api/src/application/ports/catalogo-clasificacion.port.ts` — `findAll(userId: string)`; extend `apps/api/src/infrastructure/persistence/prisma-catalogo-clasificacion.repository.spec.ts`: emitted `findMany` args contain `where: { userId }`.
- [ ] 4.4 [GREEN] Implement in `apps/api/src/infrastructure/persistence/prisma-catalogo-clasificacion.repository.ts`. Verify: `pnpm api test prisma-catalogo-clasificacion`.
- [ ] 4.5 [RED] Update `apps/api/src/application/ports/transaccion-bucket-writer.port.ts` — `asignarCategorizacion(userId, ingestaId, asignaciones)`; extend `apps/api/src/infrastructure/persistence/prisma-transaccion-bucket.repository.spec.ts`: category lookup is `where:{userId}`; ids written come from that lookup not `CATEGORIA_IDS`; missing category degrades to `Result.fail(CategorizacionFallidaError)` (never throws).
- [ ] 4.6 [GREEN] Implement in `apps/api/src/infrastructure/persistence/prisma-transaccion-bucket.repository.ts` per design §4.2. Verify: `pnpm api test prisma-transaccion-bucket`.
- [ ] 4.7 [RED+GREEN] Thread `userId` into `apps/api/src/application/use-cases/process-ingesta.use-case.ts` `runCategorizacion(ingestaId, userId)` (already in scope as `input.userId` — pure threading); extend `process-ingesta.use-case.spec.ts`; assert degradable-island behaviour unchanged. Verify: `pnpm api test process-ingesta`.
- [ ] 4.8 [RED] Update `apps/api/src/application/ports/reclasificar-categoria.port.ts` result adds `categoriaId`; extend `apps/api/src/infrastructure/persistence/prisma-reclasificar-categoria.repository.spec.ts`: lookup by `userId_nombre`, returned `categoriaId` is the persisted row id, null lookup rejects.
- [ ] 4.9 [GREEN] Implement in `apps/api/src/infrastructure/persistence/prisma-reclasificar-categoria.repository.ts` per design §4.3. Verify: `pnpm api test prisma-reclasificar-categoria`.
- [ ] 4.10 [RED+GREEN] Update `apps/api/src/infrastructure/http/dto/reclasificar-categoria.dto.ts` (`aReclasificarCategoriaDto` consumes `data.categoriaId`, drop `CATEGORIA_IDS` import) + its spec. Verify: `pnpm api test reclasificar-categoria.dto`.

## Phase 5: Read paths + fold deletion (seam 5 — highest silent-failure risk)

- [ ] 5.1 [RED] New `apps/api/src/infrastructure/persistence/fold-categoria.spec.ts`: `null`/`undefined` → `null`; unknown `nombre` → `null`; known `nombre` with an arbitrary cuid `id` → `{ id, nombre }`.
- [ ] 5.2 [GREEN] New `apps/api/src/infrastructure/persistence/fold-categoria.ts`: `foldCategoria(row)` per design §5. Verify: `pnpm api test fold-categoria`.
- [ ] 5.3 [GREEN, compiler-enforced] Delete `CATEGORIA_ID_TO_CATEGORIA` and `foldCategoriaId` from `apps/api/src/infrastructure/persistence/categoria-ids.ts`; keep `CATEGORIA_IDS` with docblock "seed/bootstrap ids only, never a runtime resolution mechanism" (D-09). Verify: `pnpm api exec tsc --noEmit` — every orphaned call site surfaces as a compile error.
- [ ] 5.4 [GREEN] Fix each surfaced call site: `apps/api/src/infrastructure/persistence/prisma-movimientos-mes.repository.ts` and `apps/api/src/infrastructure/persistence/prisma-detalle-bucket.repository.ts` — change `select` from `categoriaId: true` to `categoria: { select: { id, nombre } }`, call `foldCategoria`.
- [ ] 5.5 [RED] Extend `apps/api/src/infrastructure/persistence/prisma-movimientos-mes.repository.spec.ts` and `prisma-detalle-bucket.repository.spec.ts`: query selects nested `categoria` object; fold delegates to `foldCategoria`. Verify: `pnpm api test prisma-movimientos-mes prisma-detalle-bucket`.

## Phase 6: Isolation + regression tests (seam 6)

- [ ] 6.1 New `apps/api/test/catalogo-isolation.int-spec.ts`: users A/B each own disjoint 8+20 rows; `findAll(userId)` returns only A's patterns; B reclassifying writes B's own category id; A's descriptions never match B's patterns (CAT037-05).
- [ ] 6.2 Same file — invariant test, conditional on task 1.2's outcome: composite-FK branch (1.3a) → raw `INSERT` of a pattern with A's `categoriaId` + B's `userId` is rejected by the FK; fallback branch (1.3b) → full pipeline run for both users leaves zero rows where `p.userId <> c.userId`.
- [ ] 6.3 Extend `apps/api/test/seed.int-spec.ts`: seed run twice ⇒ 8+20 rows, ids stable, all owned by `USER_ID_FIJO`, no duplicates (CAT037-02).
- [ ] 6.4 Extend `apps/api/test/categorizacion.int-spec.ts`: a non-seed user's ingesta is classified using only their own patterns; catalog-failure degradation still writes only `Ingreso` and leaves the rest `null` (CAT037-03).
- [ ] 6.5 Extend `apps/api/test/movimientos-mes.int-spec.ts` and `apps/api/test/detalle-bucket.int-spec.ts`: a second, non-seed user sees real categories, not `null` (regression guard for seam 5 — CAT037-06).
- [ ] 6.6 Extend `apps/api/test/reclasificar-categoria.int-spec.ts`: response `categoria.id` equals the caller's own persisted row id; differs between two users reclassifying to the same category name (CAT037-04).
- [ ] 6.7 New shared fixture `apps/api/test/support/catalogo.fixture.ts` exporting `crearCatalogoParaUsuario(prisma, userId)` (thin wrapper over `copiarCatalogoTemplate`); apply it at every existing `*.int-spec.ts` user-creation call site so test users have a non-empty catalog. **Flagged as the largest single line-count contributor** — consider a dedicated child PR if it alone risks >400 lines.
- [ ] 6.8 [RED+GREEN] Update `apps/api/prisma/backfill-categorias.ts` (D-10): add explicit `account: { userId: USER_ID_FIJO }` filter + frozen/bootstrap-only docblock; extend `apps/api/src/infrastructure/persistence/backfill-categorias.spec.ts` and `apps/api/test/backfill-categorias.int-spec.ts` to assert cross-tenant rows are never touched (CAT037-05 legacy-script scenario).
- [ ] 6.9 Migration rehearsal, run 3 (not CI-automated): re-run against a restored prod snapshot immediately before the production deploy; record the result in the PR/deploy notes.
- [ ] 6.10 Cross-workspace verification: `pnpm web test` green with **zero** frontend edits (proves category names preserved); `pnpm api test`; `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration`; `pnpm api exec tsc --noEmit`.

## Phase 7: ADR-036 + docs (seam 7)

- [ ] 7.1 Write `docs/adr/ADR-036-catalogo-clasificacion-por-usuario.md`: record decisions D-01…D-10; explicitly record (a) demo catalog is read-only — binding precondition for US-038 (CAT037-02 amendment), and (b) the D-06 fallback, if taken in 1.3b, as a US-038 precondition (design §10.2). This task satisfies CAT037's CA-06 process criterion.
- [ ] 7.2 Add the ADR-036 row to `docs/adr/README.md` index.
- [ ] 7.3 Add the ADR-036 one-line summary row to the ADR table in `/Users/jorge/dev/MoneyDiary/CLAUDE.md`.
