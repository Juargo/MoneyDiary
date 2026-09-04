# Tasks — US-018: Eliminar Ingesta

- Slug: `us-018-eliminar-ingesta`
- Phase: TASKS (ordered implementation checklist — no code written here)
- Artifact store: hybrid (Engram `sdd/us-018-eliminar-ingesta/tasks` + this file)
- Reads: spec (`sdd/us-018-eliminar-ingesta/spec`, Engram #376) + design
  (`sdd/us-018-eliminar-ingesta/design`, Engram #377)
- Delivery strategy: `ask-on-risk`. Chain strategy: **not yet chosen** — see Review
  Workload Forecast, decision required before `sdd-apply`.
- Strict TDD is ACTIVE. Every implementation task is preceded by its failing test
  task. Test runners: `pnpm api test` (Vitest), `pnpm web test` (Vitest + Testing
  Library, jsdom). The cross-tenant child-deleteMany isolation (design §3.2) and
  the 204-empty-body web contract (design §7.1/D7) each get a RED test before the
  GREEN implementation task.
- Language: tasks in English. Domain identifiers stay in Spanish (project
  convention).

Each task cites the requirement id(s) it satisfies (`ING-01`..`ING-06`). `[test]`
tasks must land RED before the paired `[impl]` task; `[verify]` tasks close a
slice by running the full relevant suite.

---

## Slice 1 — Backend: `DELETE /api/ingestas/:id` + `GET /api/ingestas`

Depends on: — (first slice, defines the HTTP contract Slice 2 consumes).
Sequential: domain error before ports, ports before use cases, use cases before
adapters, adapters before routes/composition. T1.1-T1.4 (domain + ports) can be
written together; T1.5-T1.10 (use cases + adapters) are test-then-impl pairs.

- [x] **T1.1** `[impl]` `domain/errors/ingesta-no-encontrada.error.ts` — mirror
  `TransaccionNoEncontradaError`: merged not-found/not-owned message, `readonly
  ingestaId` for server-side logging only, anti-enumeration doc comment.
  (ING-02)
- [x] **T1.2** `[impl]` `application/ports/eliminar-ingesta.port.ts` —
  `IEliminarIngestaWriter.eliminarConTransacciones(userId, ingestaId):
  Promise<Result<void, IngestaNoEncontradaError>>` + token constant. (ING-01,
  ING-02)
- [x] **T1.3** `[impl]` `application/ports/listar-ingestas.port.ts` —
  `IngestaResumen` read model (`id`, `banco`, `fecha: Date`,
  `totalTransacciones: number`) + `IListarIngestasReader.listarPorUsuario` +
  token constant. (ING-03)
- [x] **T1.4** `[test]` Unit tests for `EliminarIngestaUseCase` (pass-through to a
  stub writer: ok + `IngestaNoEncontradaError` propagation) and
  `ListarIngestasUseCase` (pass-through to a stub reader, empty-list case). —
  `eliminar-ingesta.use-case.spec.ts`, `listar-ingestas.use-case.spec.ts`
  (ING-01, ING-03)
- [x] **T1.5** `[impl]` `application/use-cases/eliminar-ingesta.use-case.ts` +
  `listar-ingestas.use-case.ts` — thin delegation per design §4.3/§4.4;
  `ListarIngestasUseCase.execute` returns the array directly, not `Result`
  (D4). (ING-01, ING-03)
- [x] **T1.6** `[test]` Unit test for `PrismaEliminarIngestaRepository` (mocked
  `PrismaClient`): asserts the `$transaction` ops array has length 2, child
  `deleteMany` at index 0 / parent at index 1 (children-first under
  `Restrict`), **both where-clauses userId-scoped** — child `{ ingestaId,
  ingesta: { account: { userId } } }`, parent `{ id: ingestaId, account: {
  userId } } }`; `count:1` → `Result.ok`, `count:0` → `Result.fail`;
  `$transaction` rejection propagates (repo does not swallow it). —
  `prisma-eliminar-ingesta.repository.spec.ts` (ING-01, ING-02 — mocked-level
  guard for the §3.2 correctness decision)
- [x] **T1.7** `[impl]` `infrastructure/persistence/prisma-eliminar-ingesta.repository.ts`
  — implements §3.1 verbatim: array-form `$transaction`, children-first, both
  statements userId-scoped via the relation path (`ingesta: { account: {
  userId } }`), no try/catch of infra errors (mirror reclasificar). (ING-01,
  ING-02)
- [x] **T1.8** `[test]` Unit test for `PrismaListarIngestasReader` (mocked
  `findMany`): asserts WHERE `{ account: { userId }, estado: 'PROCESADA' }`,
  `orderBy: { creadoEn: 'desc' }`, and row→`IngestaResumen` mapping including
  `totalTransacciones ?? 0`. — `prisma-listar-ingestas.reader.spec.ts` (ING-03)
- [x] **T1.9** `[impl]` `infrastructure/persistence/prisma-listar-ingestas.reader.ts`
  per design §5.2. (ING-03)
- [x] **T1.9a** `[test]` (post-review gap closure) Integration test for
  `PrismaListarIngestasReader` — mirrors T1.15's two-user pattern
  (cross-tenant isolation, PROCESADA filter, row shape, `creadoEn desc`
  ordering). Closes a coverage gap flagged by fresh-context review: this
  userId-isolated read endpoint had only a mocked unit test (T1.8), unlike
  every sibling read endpoint (RNF-SEC-006). —
  `test/listar-ingestas.int-spec.ts` (ING-03)
- [x] **T1.10** `[impl]` `infrastructure/http/dto/ingesta-list.dto.ts` —
  `IngestaListItemDto` + `aIngestaListItemDto` mapper; `totalTransacciones` is
  a plain `number` (row count, not money). (ING-03)
- [x] **T1.11** `[test]` Route-level test (stubbed use cases, no DB): `DELETE
  /ingestas/:id` → 204 on `Result.ok` / 404 on `IngestaNoEncontradaError`;
  `GET /ingestas` → 200 `{ ingestas: [...] }`. — optional per design §8.4, but
  included here as the fast feedback loop for the HTTP mapping + 204-empty-body
  contract before wiring the real adapters end-to-end. (ING-01, ING-02, ING-03,
  ING-04)
- [x] **T1.12** `[impl]` `infrastructure/http-express/routes/ingesta.routes.ts`
  — change `registrarIngestas(router, processIngesta)` to
  `registrarIngestas(router, deps: IngestaRoutesDeps)` (deps object per design
  §6.1, existing `POST /ingestas` unchanged); add `GET /ingestas` and `DELETE
  /ingestas/:id` handlers with the exhaustive-`never` error guard and the
  bare-204-send (no JSON body) per design §6.1. (ING-01, ING-02, ING-03,
  ING-04)
- [x] **T1.13** `[impl]` `composition/container.ts` — add `eliminarIngesta` and
  `listarIngestas` use cases, constructed inline (mirror
  `reclasificarTransaccion`, NOT inside `crear-process-ingesta.ts`); extend the
  `Container` interface + returned object. (ING-01, ING-03)
- [x] **T1.14** `[impl]` `infrastructure/http-express/app.ts` — update the
  `registrarIngestas(protectedApi, ...)` call to pass the 3-key deps object;
  confirm it stays mounted on `protectedApi` (behind `sessionMiddleware`).
  (ING-04)
- [x] **T1.15** `[test]` Integration test — **the key correctness test** (mirror
  `reclasificar-categoria.int-spec.ts`), two users A/B each with
  User→Account→Ingesta→Transacciones, `RUN_ID` isolation + `afterAll` cleanup,
  gated by `assertDestructiveDbAllowed`:
  - ISO case (catches the §3.2 bug): user A calls
    `eliminarConTransacciones(A, ingestaB)` → `Result.fail`, AND assert user
    B's `Ingesta` row still exists AND `transaccion.count({ ingestaId:
    ingestaB })` is unchanged.
  - Own delete: user A deletes own ingesta → `Result.ok`; row gone, tx count 0.
  - Idempotent double-delete: second delete of the same id → 404.
  - Empty ingesta (0 transacciones, PROCESADA): deletes cleanly.
  — `apps/api/test/eliminar-ingesta.int-spec.ts`. **Green run is GATED on
  provisioning the local disposable Postgres** (`apps/api/docs/local-test-db.md`,
  ADR-028 debt) — write and commit this test now; do NOT silently skip it; the
  actual gated run happens once a human provisions the local DB. (ING-01,
  ING-02)
- [x] **T1.16** `[verify]` `pnpm api test` full suite green + `pnpm api exec tsc
  --noEmit` clean. Confirm the existing `POST /api/ingestas` flow and its
  tests are unaffected by the `registrarIngestas` deps-object refactor.
- [ ] **T1.17** `[verify]` Real-fixture DoD check (once local Postgres from
  T1.15 is provisioned, or against local dev server): upload a real fixture
  (e.g. `test/fixtures/movimientos-test.xlsx`) via `POST /api/ingestas` → `GET
  /api/ingestas` shows it with the correct `totalTransacciones` → `DELETE
  /api/ingestas/:id` → `GET /api/resumen` for the affected period recalculates
  without those rows.

## Slice 2 — Web: list + accessible delete confirmation

Depends on: **Slice 1** (consumes its HTTP contract: `GET /api/ingestas` shape,
`DELETE /api/ingestas/:id` 204/404 contract). Sequential: client fns before
hooks, hooks before components, components before route/nav wiring.

- [x] **T2.1** `[impl]` `apps/web/src/api/types.ts` — add `IngestaListItemDto`
  mirror (`id`, `banco`, `fecha: string` ISO, `totalTransacciones: number`).
  (ING-03)
- [x] **T2.2** `[test]` `client` tests: `fetchIngestas` type-guard
  (`esIngestaListItemDto`) + status mapping; `deleteIngesta` **204 handling**
  (must NOT call `res.json()` on a 204), 404 → tagged server error, 401 →
  unauthorized. (ING-01, ING-02, ING-03, ING-04)
- [x] **T2.3** `[impl]` `apps/web/src/api/client.ts` — `fetchIngestas():
  Promise<ApiResult<IngestaListItemDto[]>>` (GET `/api/ingestas`, validates
  `body.ingestas` is an array of valid items) + `deleteIngesta(id):
  Promise<ApiResult<void>>` (DELETE `/api/ingestas/:id`, returns `{ ok: true,
  value: undefined }` on 204 without parsing JSON — design §7.1/D7). (ING-01,
  ING-02, ING-03, ING-04)
- [x] **T2.4** `[test]` `use-ingestas` test: `useQuery` with key `['ingestas']`
  unwraps or throws `ApiError`, same pattern as `use-resumen.ts`. (ING-03)
- [x] **T2.5** `[impl]` `apps/web/src/api/use-ingestas.ts` — `useIngestas()`.
  (ING-03)
- [x] **T2.6** `[test]` `use-eliminar-ingesta` test: `onSuccess` invalidates
  exactly the four keys `['resumen']`, `['resumen-anual']`,
  `['detalle-bucket']`, `['ingestas']`; `onError`/failed mutation invalidates
  none. (ING-06)
- [x] **T2.7** `[impl]` `apps/web/src/api/use-eliminar-ingesta.ts` —
  `useEliminarIngesta()` per design §7.2. (ING-06)
- [x] **T2.8** `[test]` `EliminarIngestaControl` component test: "Eliminar"
  button opens `role="alertdialog"` stating the exact impact count; focus
  moves to the confirm button on open; Escape/Cancelar closes without a DELETE
  request and returns focus to the trigger; Confirm fires the mutation and,
  on success, the modal closes and the row disappears from the list. (ING-05,
  ING-06)
- [x] **T2.9** `[impl]` `apps/web/src/components/EliminarIngestaControl.tsx` —
  structural clone of `ReclasificarCategoriaControl`'s a11y pattern (design
  §7.3): `role="alertdialog"`, `aria-label`, focus management, Escape-cancels,
  `aria-live="polite"` success / `role="alert"` error, confirm
  `disabled={mutacion.isPending}`. (ING-05, ING-06)
- [x] **T2.10** `[test]` `ListaIngestas` component test: Loading / Error / Empty
  / list states render correctly; each row shows banco, formatted fecha, and
  "N movimientos", plus its `EliminarIngestaControl`. (ING-03, ING-05)
- [x] **T2.11** `[impl]` `apps/web/src/components/ListaIngestas.tsx` per design
  §7.3. (ING-03, ING-05)
- [x] **T2.12** `[impl]` `apps/web/src/routes/_authenticated/ingestas.tsx` —
  new route rendering `<ListaIngestas />` under `_authenticated` (same as
  `/subir`). (ING-04)
- [x] **T2.13** `[impl]` `apps/web/src/components/app-shell/nav-items.ts` — add
  `{ kind: 'link', label: 'Gestionar cartolas', to: '/ingestas', icon: Files }`
  (lucide `Files`, ADR-027); confirm `routeTree.gen.ts` regenerates so
  `to: '/ingestas'` typechecks.
- [x] **T2.14** `[verify]` `pnpm web test` + `pnpm web typecheck` + `pnpm web
  build` green.
- [ ] **T2.15** `[verify]` Real-fixture DoD check end-to-end in the browser
  (local dev server): upload a real fixture via `/subir` → navigate to
  `/ingestas`, see it listed with the correct impact count → open the
  confirmation dialog, confirm keyboard operability (Tab/Enter/Escape) → click
  Confirmar → row disappears, dashboard/resumen view recalculates without
  those transactions.

---

## Cross-slice dependency summary

```
Slice 1 (backend contract: GET+DELETE /api/ingestas)
 └─→ Slice 2 (web: list + confirm modal, consumes Slice 1's contract)
```

Strictly sequential — Slice 2 cannot be implemented against a mocked contract
without risking drift; the design already locked the exact response/DTO shapes,
so Slice 2 starts once Slice 1's routes are merged (or at minimum, once its DTO
shapes are stable — chain strategy below addresses whether "merged" or
"stable-on-a-shared-branch" applies).

---

## Review Workload Forecast

Rough `additions + deletions` estimate per slice (impl + tests). Planning
estimates, not measured diffs — re-check with `git diff --stat` once each slice
is implemented.

| Slice | Est. changed lines | 400-line budget risk | Notes |
|-------|--------------------:|-----------------------|-------|
| Slice 1 — backend (domain error, 2 ports, 2 use cases + specs, 2 Prisma adapters + specs, DTO, route rewiring, container/app wiring, route test, integration test) | ~480-540 | **High** | A full vertical slice in one PR: 2 new adapters with the load-bearing §3.2 isolation logic, a `registrarIngestas` signature change, plus a real integration test file. |
| Slice 2 — web (client fns + 2 hooks + 2 components + route + nav, all with tests) | ~380-430 | **Medium-High** | New a11y dialog component + its test is the bulk; borderline the 400-line budget depending on how verbose the component test ends up. |
| **Total** | **~860-970** | — | Combined change is well above the 400-line single-PR budget. |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

**Chained PRs recommended: Yes.** Both slices individually approach or exceed
the 400-line review budget, and Slice 1 contains the one correctness-critical
decision of this change (cross-tenant child-deleteMany isolation, design §3.2) —
it benefits from an isolated, focused review before Slice 2 lands on top of it.

**Decision needed before apply: Yes** (per `ask-on-risk`). Ask the user which
chain strategy to use:
- **`stacked-to-main`**: Slice 1 merges to `main` first (backend-only, additive —
  no existing route behavior changes), then Slice 2 targets `main` and merges
  second. Fast, matches this change's clean dependency (Slice 2 strictly needs
  Slice 1's contract, not an in-flight branch).
- **`feature-branch-chain`**: a tracker branch for `us-018-eliminar-ingesta`,
  Slice 1 PR targets the tracker, Slice 2 PR targets Slice 1's branch, tracker
  merges to `main` once both land. Gives rollback control if Slice 2 needs
  rework without touching `main`.

Recommendation leans **`stacked-to-main`**: unlike US-013 (schema migrations +
an invariant-bearing write-path flip that was unsafe to leave partially merged),
this change has NO schema migration and Slice 1 alone is a safe, additive,
fully-functional backend capability (GET+DELETE) that can sit on `main` even
before Slice 2's UI exists — nothing intermediate is broken or inconsistent.

---

## Requirement coverage check

- ING-01 (atomic cascade delete): T1.2, T1.4, T1.5-T1.7, T1.11, T1.12, T1.15,
  T1.17, T2.2, T2.3.
- ING-02 (userId isolation + anti-enumeration): T1.1, T1.2, T1.6, T1.7, T1.11,
  T1.12, T1.15, T2.2, T2.3.
- ING-03 (list endpoint, zero-cost count): T1.3, T1.4, T1.5, T1.8-T1.10, T1.11,
  T1.17, T2.1-T2.5, T2.10, T2.11, T2.15.
- ING-04 (both endpoints require session): T1.11, T1.12, T1.14, T2.2, T2.3,
  T2.12.
- ING-05 (accessible confirm modal): T2.8, T2.9, T2.10, T2.11, T2.15.
- ING-06 (cache invalidation on success/failure): T2.6, T2.7, T2.15.

All 6 requirements covered by at least one test task and one impl task.
