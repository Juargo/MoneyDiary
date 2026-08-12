# Verify Report — US-038 `us-038-catalogo-crud`

- **Verdict**: **PASS** — 0 CRITICAL · 2 WARNING (process/traceability only, no implementation defects) · 2 SUGGESTION
- **Verified against**: head of the 3-PR chain (`feat/us-038-s2b-infrastructure`, commit `8df7396`; tracker #305 ← PR1 #306 ← PR2a #307 ← PR2b #308)
- **Method**: isolated detached worktree (`git worktree add /tmp/verify-us038 … --detach`); the main working tree was never disturbed. Every gate below was re-executed, not trusted from PR bodies.

> Reconstructed from the archived verification record (engram `sdd/us-038-catalogo-crud/verify-report`, obs #574) — the working copy of this file was lost before the archive commit.

## Executed checks

| Check | Result |
|---|---|
| `pnpm api test` | 204 files / 1617 tests green |
| `pnpm api exec tsc --noEmit` | 0 diagnostics |
| `pnpm api openapi:check` | green, no drift |
| `pnpm web test` | 61 files / 560 tests green |
| `ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration` | 20 files / 108 tests green |
| `git diff main…HEAD -- apps/web apps/mobile` | exactly 1 file — `apps/web/src/domain/categoria.mirror.spec.ts` (test-only, confirmed by full diff read). `apps/web/src/domain/categoria.ts` production code: zero-line diff. Zero `apps/mobile` changes |

Integration runs in a fresh worktree required inline env vars (a fresh worktree has no `.env.test`) — the same gotcha the PR2b apply session documented. Reused the existing `moneydiary-test-db` docker container, regenerated `ENCRYPTION_KEY`, ran `prisma migrate deploy` (no-op) plus a fresh `prisma/seed.ts`.

## Design conformance — confirmed by direct source read, not inference

- **D-06 delete-in-use**: the predicate lives INSIDE the delete —
  `tx.categoria.deleteMany({ where: { id, userId, transacciones: { none: {} } } })` — not check-then-delete.
- **D-07 re-bucket re-stamp**: array-form `$transaction([update, updateMany])` with `account: { userId }` in the re-stamp `WHERE`, triggered only when `bucket` is present in the patch.
- **D-04/D-05 demo gate**: `esDemo` is a required, non-optional field on all 6 mutation use cases and is absent entirely from the read use case's input type — the asymmetry is compile-enforced.
- **Error translation**: `catalogo-http-error.ts` has 12 `instanceof` branches plus a `const _exhaustive: never = error` guard. The 13th error (`CategoriaDesconocidaError`) is correctly owned by `transacciones.routes.ts`'s own switch.
- **Ports**: 2 resource-grained (`ICategoriaRepository`, `IPatronRepository`).
- **RNF-SEC-006**: `userId` present in every Prisma `where` across both adapters, verified method by method.
- **Contract**: `openapi-document.ts` diff is 307 insertions / 1 deletion — the single deletion being exactly the intentional `400` description change PR1's proof obligation names. True append-only.
- **Composition**: `container.ts` is +1 field, +1 call, mirroring `crearAuth`.
- **Untouched**: `schema.prisma`, `prisma/migrations/**`, `bucket.ts` — zero-line diffs across the whole chain (no per-user `BucketPresupuesto`).

## The rollback bug — mechanism confirmed

`PrismaCategoriaRepository.eliminar()` deleted a category's patterns first, then attempted the in-use-gated category delete via `deleteMany()`. A `deleteMany()` matching 0 rows **does not throw**, so without the `RollbackCategoriaEnUso` sentinel a refused (409) delete would still **commit** the earlier pattern deletion. `catalogo-crud.int-spec.ts` (lines 192-257) asserts via raw Prisma `findUnique` that both the category row and its pattern survive a 409.

**WARNING (process)**: that "the test would fail without the fix" was confirmed by reasoning over the mechanism, not by reverting and re-running — the verification worktree stayed read-only by design.

## ADR accuracy

ADR-037 exists and matches design §1 Q1's content obligations verbatim (title, the traded-away `Record<Categoria, Bucket>` totality guarantee, 3 rejected alternatives, backfill consequence). ADR-036's stale "Pendiente antes de producción" section is gone, replaced by a passed "Gate 6.9" section; `docs/adr/README.md` row updated to "Decidido e implementado"; `CLAUDE.md` carries the ADR-037 row.

## Warnings and suggestions

1. **WARNING (process)** — the rollback-fix claim is reasoned, not revert-tested (above).
2. **WARNING (traceability)** — `main`'s checked-out `tasks.md` was stale relative to the unmerged chain branch at verification time (expected; read the chain copy).
3. **SUGGESTION** — `GET /api/categorias` documents only `200` in its OpenAPI operation; `401` is middleware-handled and this matches the convention of other GET routes.
4. **SUGGESTION** — integration specs run with default file-parallelism produced non-reproducible flakes while three agents shared one local Postgres container; serialized runs are green.

## Deploy readiness

Unlike US-037, **no database migration is required** — `schema.prisma` and `prisma/migrations/**` are untouched across the entire chain, which makes this deploy materially lower risk (rollback is `git revert` + redeploy).

Remaining steps at verification time: merge PR1 → PR2a → PR2b in chain order, then un-draft and merge only tracker #305 to `main` (Render git-integration deploy).
