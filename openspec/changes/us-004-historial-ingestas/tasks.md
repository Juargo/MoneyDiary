# Tasks — US-004: Historial de archivos cargados

- Slug: `us-004-historial-ingestas`
- Phase: TASKS (ordered implementation checklist — no code written here)
- Artifact store: hybrid (Engram `sdd/us-004-historial-ingestas/tasks` + this file)
- Reads: spec (`sdd/us-004-historial-ingestas/spec`) + design
  (`sdd/us-004-historial-ingestas/design`, APPROVED, passed 2-round Judgment Day)
- Delivery strategy: `ask-on-risk`. Chain strategy: **feature-branch-chain
  recommended** — see Review Workload Forecast, decision required before
  `sdd-apply`.
- Strict TDD is ACTIVE. Test runner: `pnpm api test` (Vitest). Every
  implementation task that touches an existing seam is preceded by its
  `[test]` (RED) task; `[verify]` tasks close a slice by running the full
  relevant suite.
- Language: tasks in English. Domain identifiers stay in Spanish (project
  convention).

Each task cites the requirement id(s) it satisfies (`ING-03`, `ING-05`,
`ING-07`, `ING-08`, `ING-09`). `[test]` tasks land RED before the paired
`[impl]` task; `[verify]` tasks run the full relevant suite.

---

## Slice 1 — Backend core: migration, domain/application/infrastructure

Depends on: — (foundation). PR target: **tracker branch**
(`us-004-historial-ingestas`), per feature-branch-chain.

- [ ] **1.1** `[impl]` `prisma/schema.prisma` diff — `Ingesta.userId` (new,
  becomes non-null), `accountId`/`banco` nullable, `User.ingestas` back-relation,
  `@@index([userId])`. (ING-07)
- [ ] **1.2** `[impl]` Hand-author migration SQL
  `prisma/migrations/<ts>_ingesta_userid_nullable_account_banco/migration.sql`
  per design §5.2: add nullable `userId` → backfill from `Account.userId` →
  `SET NOT NULL` → FK `ON DELETE RESTRICT` + index → relax
  `accountId`/`banco` nullable → raw-SQL CHECK
  `Ingesta_procesada_requires_account`. Verify offline with `prisma validate`
  + `prisma generate` (no live DB). (ING-07)
- [ ] **1.3** `[verify]` Document prod supervision note (migration header
  comment + runbook): before/after `SELECT count(*) WHERE userId IS NULL`
  check, plus rehearsal of the backfill `UPDATE` against a prod
  snapshot/dump before real prod apply (design §5.2/§10.3, D9).
- [ ] **1.4** `[impl]` New port
  `application/ports/registrar-ingesta-fallida.port.ts` —
  `IRegistrarIngestaFallidaWriter` + `RegistrarIngestaFallidaInput` + token.
  (ING-07)
- [ ] **1.5** `[impl]` Collapse `application/ports/ingesta-repository.port.ts`
  — replace `createPending`/`commit`/`markFailed` with a single
  `persistirProcesada(CrearIngestaProcesadaInput)`. (ING-07)
- [ ] **1.6** `[impl]` Widen `application/ports/listar-ingestas.port.ts` — add
  local `IngestaEstado = 'PROCESADA' | 'FALLIDA'` literal union + widen
  `IngestaResumen` (`nombreArchivo`, `estado`, `motivoFallo`, `banco: string |
  null`). No `@prisma/client` import in this file (ADR-005). (ING-03)
- [ ] **1.7** `[test]` RED: rewrite `persist-transactions.use-case.spec.ts` —
  pass-through to a stub `persistirProcesada` (ok echoes `{ ingestaId, total,
  duplicadosOmitidos }`, fail propagates); remove lifecycle/`markFailed`
  cases. (ING-07)
- [ ] **1.8** `[impl]` GREEN: rewrite
  `application/use-cases/persist-transactions.use-case.ts` — single call to
  `persistirProcesada`; add required `userId` to `PersistTransactionsInput`
  (already available in `runPipeline` as `input.userId`). (ING-07)
- [ ] **1.9** `[test]` RED: edit `process-ingesta.use-case.spec.ts` — assert
  every `runPipeline` failure branch calls `ingestaFallidaWriter.registrar`
  once with `{ userId, nombreArchivo: getOriginalName(), motivo:
  <error.message> }`; the `catch` path uses the **fixed generic** motivo (no
  leak, ING-09); a failing/throwing `registrar` never changes the returned
  `Result` and never throws (island); success path never calls `registrar`.
  Update the in-file `IIngestaRepository` stub to the new single-method
  port. (ING-07, ING-09)
- [ ] **1.10** `[impl]` GREEN: edit
  `application/use-cases/process-ingesta.use-case.ts` — add
  `ingestaFallidaWriter` dep, wrap `execute()` in try/if-fail/catch
  `registrarFallo` per design §3.2 (structurally never-throw island);
  `runPipeline`'s seven `Result.fail` branches untouched. (ING-07, ING-09)
- [ ] **1.11** `[test]` RED: rewrite `prisma-ingesta.repository.spec.ts` —
  mock `ingesta.create`, assert the nested `createMany` payload maps via
  `aPersistencia`, `estado: PROCESADA`, `userId`/`accountId`/
  `totalTransacciones = length`/`duplicadosOmitidos`/`procesadoEn`; a create
  rejection → `Result.fail(PersistenciaFallidaError)`. Drop old
  `createPending`/`markFailed` cases. (ING-07)
- [ ] **1.12** `[impl]` GREEN: rewrite
  `infrastructure/persistence/prisma-ingesta.repository.ts` —
  `persistirProcesada` atomic nested create per design §7.1. (ING-07)
- [ ] **1.13** `[test]` RED (new):
  `prisma-registrar-ingesta-fallida.repository.spec.ts` — assert
  `ingesta.create` called with `estado: FALLIDA`, `userId`, `nombreArchivo`,
  `motivoFallo`, and no `accountId`/`banco` (→ null); rejection →
  `Result.fail`. (ING-07)
- [ ] **1.14** `[impl]` GREEN (new):
  `infrastructure/persistence/prisma-registrar-ingesta-fallida.repository.ts`
  per design §7.2 — no `ICryptoService` dep (failure rows touch no money
  columns). (ING-07)
- [ ] **1.15** `[test]` RED: edit `prisma-listar-ingestas.reader.spec.ts` —
  assert WHERE `{ userId, estado: { in: ['PROCESADA','FALLIDA'] } }` (no
  `account:` join), `orderBy creadoEn desc`, widened row→`IngestaResumen`
  mapping incl. `banco: null`, `motivoFallo`, `estado`, `totalTransacciones
  ?? 0`; the `aIngestaEstado` narrowing helper throws on an unexpected
  `EstadoIngesta` value. (ING-03, ING-08)
- [ ] **1.16** `[impl]` GREEN: rewrite
  `infrastructure/persistence/prisma-listar-ingestas.reader.ts` per design
  §4.1, incl. `aIngestaEstado`. (ING-03, ING-08)
- [ ] **1.17** `[impl]` Widen `infrastructure/http/dto/ingesta-list.dto.ts` —
  `IngestaListItemDto` adds `nombreArchivo`/`estado`/`motivoFallo`, `banco:
  string | null`; `aIngestaListItemDto` mapper needs no `as` cast (design
  §4.3). (ING-03)
- [ ] **1.18** `[test]` RED: edit `prisma-demo.repository.spec.ts` — assert
  `tx.ingesta.create` args include `userId: user.id`. (ING-07)
- [ ] **1.19** `[impl]` GREEN: edit
  `infrastructure/persistence/prisma-demo.repository.ts:56` — add `userId:
  user.id`. (ING-07)
- [ ] **1.20** `[test]` RED: edit `demo-cleanup.service.spec.ts` — assert
  `ingesta.deleteMany` where-clause is the direct `{ userId: { in: ids } }`
  (no `account` join); ordering before `Account`/`User` deletes unchanged.
  (ING-07)
- [ ] **1.21** `[impl]` GREEN: edit
  `infrastructure/http/auth/demo-cleanup.service.ts` `borrarExpirados()` per
  design §5.3. (ING-07)
- [ ] **1.22** `[impl]` Wire composition: `composition/crear-process-ingesta.ts`
  — construct `PrismaRegistrarIngestaFallidaRepository(prisma)`, pass as the
  new last arg to `ProcessIngestaUseCase`. Confirm `container.ts`'s
  `listarIngestas` wiring is unchanged (reader internals only). (ING-07)
- [ ] **1.23** `[test]` RED (new integration):
  `apps/api/test/historial-ingestas.int-spec.ts` — two users A/B, `RUN_ID`
  isolation + `afterAll` cleanup, gated by `assertDestructiveDbAllowed`:
  (a) RNF-SEC-006 trap — B's `accountId`-null FALLIDA row never visible to
  A; (b) early-failure e2e via `ProcessIngestaUseCase.execute` (bad
  extension / unrecognized bank) → `Result.fail` + exactly one FALLIDA row
  with `accountId`/`banco` null; (c) success invariant — PROCESADA row's
  `accountId`/`banco`/`totalTransacciones` non-null, and a raw insert
  attempt with null `accountId` + `estado=PROCESADA` violates the CHECK;
  (d) superset ordering (CA-01) — PROCESADA + FALLIDA both returned,
  `creadoEn` desc; (e) atomicity proof — a `persistirProcesada` call whose
  `createMany` violates `cargo >= 0` rolls back to zero `Ingesta`/
  `Transaccion` rows (equivalent to the deleted `prisma-persistence.int-spec.ts`
  W3 case). (ING-03, ING-07, ING-08, ING-09)
- [ ] **1.24** `[verify]` Green run of 1.23 is **gated** on provisioning the
  local disposable Postgres (`apps/api/docs/local-test-db.md`, ADR-028/029
  debt) — write and commit the test now; do not silently skip it.
- [ ] **1.25** `[verify]` `pnpm api test` + `pnpm api exec tsc --noEmit`
  green for every file this slice touches. (The 15 blast-radius files of
  Slice 2 remain red until Slice 2 lands — expected.)

## Slice 2 — Backend test-fixture blast radius (design §10.5)

Depends on: **Slice 1** (the schema change is what breaks these files — they
do not compile/pass until `userId` exists and the persist API has
collapsed). PR target: **Slice 1's branch**, per feature-branch-chain.

- [ ] **2.1** `[impl]` Mechanical `userId:` fixture add (12 files, no
  assertion changes — same non-null-column edit as 1.19, applied to test
  fixtures): `test/backfill-categorias.int-spec.ts`,
  `test/auth-isolation.int-spec.ts`, `test/eliminar-ingesta.int-spec.ts`,
  `test/movimientos.e2e-spec.ts`, `test/categorizacion.int-spec.ts`,
  `test/movimientos-mes.int-spec.ts`, `test/resumen-anual.e2e-spec.ts`,
  `test/detalle-bucket.int-spec.ts`, `test/detalle-bucket.e2e-spec.ts`,
  `test/resumen.e2e-spec.ts`, `test/reclasificar-categoria.int-spec.ts`,
  `test/prisma-transaccion-existente-reader.int-spec.ts`.
- [ ] **2.2** `[impl]` Mechanical `userId:` fixture add (3 files, `upsert`
  fixtures): `prisma-resumen-mes.repository.spec.ts`,
  `prisma-resumen-anual.repository.spec.ts`,
  `prisma-detalle-bucket.repository.spec.ts`.
- [ ] **2.3** `[test+impl]` **Semantic rewrite (NOT mechanical)** —
  `apps/api/test/listar-ingestas.int-spec.ts`. Its `'filters out
  non-PROCESADA ingestas (PENDIENTE/FALLIDA)'` case inverts: the `ingFallida`
  fixture must now be **included** (`toContain`, not `not.toContain`); keep
  a manually-inserted PENDIENTE fixture asserting continued **exclusion**
  (WHERE `estado IN [PROCESADA, FALLIDA]` only). Do not add `userId` and
  move on — the pre-existing assertion is wrong under ING-03/ING-07 and
  must be rewritten. (ING-03, ING-07)
- [ ] **2.4** `[test+impl]` Rewrite `apps/api/test/prisma-persistence.int-spec.ts`
  for the collapsed `persistirProcesada` API (drop `createPending`/
  `commit`/`markFailed` calls); re-express the **W3 real-`$transaction`
  atomicity proof** against the single nested-write path (superseded by
  1.23e's proof if the latter is judged sufficient — otherwise both stand).
  (ING-07)
- [ ] **2.5** `[test+impl]` Rewrite `apps/api/test/ingesta.e2e-spec.ts`'s
  `.xls`-rejection case: now asserts exactly **one** FALLIDA row
  (`nombreArchivo` set, `motivoFallo` matching the extension error), HTTP
  response still 400 — inverts the old "creates no row" assertion. (ING-07)
- [ ] **2.6** `[verify]` `pnpm api test` full suite green + `pnpm api exec
  tsc --noEmit` clean across Slices 1+2 combined.

## Slice 3 — Web: widen `/ingestas` (design §9)

Depends on: Slice 1's HTTP contract (functional dependency only). PR target:
**Slice 2's branch**, per feature-branch-chain convention (later child PRs
base on the immediate previous PR branch).

- [ ] **3.1** `[test]` RED: `client` test — the `IngestaListItemDto`
  type-guard accepts a FALLIDA item (`banco: null`, `estado: 'FALLIDA'`,
  `motivoFallo` string, `totalTransacciones: 0`) and a PROCESADA item;
  rejects malformed. (ING-03)
- [ ] **3.2** `[impl]` GREEN: `apps/web/src/api/types.ts` — mirror the
  widened `IngestaListItemDto` (`banco: string | null`, +`nombreArchivo`,
  +`estado` union, +`motivoFallo`). (ING-03)
- [ ] **3.3** `[impl]` `apps/web/src/api/client.ts` — widen `fetchIngestas`
  type-guard per design §9. (ING-03)
- [ ] **3.4** `[test]` RED: `ListaIngestas` component test — a FALLIDA row
  renders `nombreArchivo`/`motivoFallo`/`banco` as "—" and **no** delete
  control; a PROCESADA row renders count + the existing (US-018) delete
  control (regression guard). (ING-05)
- [ ] **3.5** `[impl]` GREEN: `apps/web/src/components/ListaIngestas.tsx` /
  `IngestaItem` — branch on `estado` per design §9. (ING-05)
- [ ] **3.6** `[impl]` `apps/web/src/components/EliminarIngestaControl.tsx`
  — `banco` null-tolerance (control only mounts for PROCESADA rows, so the
  parent passes a narrowed non-null value, or the control coalesces `banco
  ?? ''`); one-line touch, US-018 regression guard (design §8). (ING-05)
- [ ] **3.7** `[verify]` `pnpm web test` + `pnpm web typecheck` + `pnpm web
  build` green.
- [ ] **3.8** `[verify]` Real-fixture DoD check in the browser (local dev
  server): upload a bad-extension file AND a valid fixture via `/subir` →
  `/ingestas` shows both — fallido with `motivoFallo`, exitoso with correct
  count — and confirm the PROCESADA delete flow is unaffected (US-018
  regression, ING-05).

---

## Cross-slice dependency summary

```
Slice 1 (schema + backend production code — introduces Ingesta.userId NOT NULL)
 └─→ Slice 2 (backend test-fixture blast radius — required to keep CI green;
      cannot be independently green without Slice 1, and Slice 1 alone
      breaks 15 existing test files without Slice 2)
      └─→ Slice 3 (web — consumes Slice 1's HTTP contract; PR stacks on
           Slice 2's branch per chain convention)
```

Slices 1 and 2 are **compile-coupled**, not just logically sequential: the
`userId NOT NULL` migration breaks 15 pre-existing test files the instant
it lands, so neither slice alone yields a green `pnpm api test` run. This is
the deciding factor in the chain-strategy recommendation below.

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1750-1850 total (Slice 1 ~1050-1150, Slice 2 ~350-400, Slice 3 ~300-350) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Slice 1 (migration + backend production code) → Slice 2 (test-fixture blast-radius sweep) → Slice 3 (web) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain (recommended — see rationale) |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Migration + schema + domain/application/infrastructure production code + their own new/edited specs + new integration spec | PR 1, base = tracker branch `us-004-historial-ingestas` | ~1050-1150 lines. Contains the money-integrity invariant (DB CHECK) and the RNF-SEC-006 isolation switch — the correctness-critical slice. |
| 2 | 12 mechanical `userId:` fixture adds + 3 upsert fixture adds + 1 semantic rewrite (`listar-ingestas.int-spec.ts`) + 2 further rewrites (`prisma-persistence.int-spec.ts`, `ingesta.e2e-spec.ts`) | PR 2, base = PR 1 branch | ~350-400 lines, but reviewer load is mostly mechanical skim except the one semantic rewrite — flag that file explicitly in the PR description so it isn't rubber-stamped with the rest. |
| 3 | Web: types/client widen + `ListaIngestas` estado branching + `EliminarIngestaControl` null-tolerance + tests | PR 3, base = PR 2 branch | ~300-350 lines. Functionally depends only on PR 1's contract; stacked on PR 2 per chain convention to keep the diff focused. |

**Why feature-branch-chain over stacked-to-main (unlike US-018):** this
change has a NOT-NULL schema migration that immediately breaks 15
pre-existing test files. Under `stacked-to-main`, PR 1 could not merge to
`main` on its own — the required `CI success` branch-protection check
(ADR-030) would be red until PR 2's fixture fixes land, so PR 1 and PR 2
would have to be squashed into one oversized PR to keep `main` green,
defeating the point of splitting. `feature-branch-chain` lets PR 1 and PR 2
merge into an unprotected tracker branch in sequence (each individually
reviewable, red CI on the tracker tolerated between them), and only the
fully-green tracker merges to `main` once. This mirrors the same
class of risk US-013's chain reasoning flagged (schema migration +
invariant-bearing write-path flip unsafe to leave partially merged) —
the opposite of US-018, which had no migration and could safely land
Slice 1 alone on `main`.

**Decision needed before apply: Yes** (per `ask-on-risk`). Confirm the
feature-branch-chain recommendation, or override to `size:exception` if the
team prefers one large reviewed PR for the whole backend slice (still not
recommended given the ~1050+ line estimate for Slice 1 alone).

---

## Requirement coverage check

- ING-03 (list endpoint returns all terminal outcomes, isolated, with
  outcome detail): 1.6, 1.15-1.17, 1.23, 2.3, 3.1-3.3, 3.5, 3.8.
- ING-05 (delete affordance gated to PROCESADA; FALLIDA renders no delete
  control): 3.4-3.6, 3.8.
- ING-07 (early pipeline failures recorded with direct userId isolation):
  1.1-1.2, 1.4-1.5, 1.7-1.14, 1.18-1.23, 2.1, 2.3-2.5.
- ING-08 (multi-tenant isolation of the widened history, incl.
  accountId-null rows): 1.15-1.16, 1.23.
- ING-09 (stored failure reasons never leak raw monetary amounts): 1.9-1.10,
  1.23.

All 5 requirements covered by at least one test task and one impl task.
