# Design: US-052 — Backend detalle MES-INGRESOS con columna Origen (banco/Manual)

> Scope: the HOW at architectural level. Task breakdown lives in `tasks.md`.
> Every path/symbol below was read in the repo before writing (2026-08-17). Template: archived
> `2026-08-17-us-051-mes-bucket-detalle/design.md` (mirrors structure, numbering D-01..).

---

## 1. Overview + Design Principles

Additive sibling endpoint `GET /api/ingresos/mes?periodo=YYYY-MM` that reuses the **existing**
`IDetalleBucketReader.findByPeriodoYBucket(userId, periodo, Bucket.Ingreso)` (US-017 reader —
rows already decrypted ADR-013, ordered `fecha asc, id asc`, `account: { userId }` structural
WHERE). **Zero new SQL, ports, repositories, migrations.** A new application use case
`ObtenerIngresosMesUseCase` projects the PII-trimmed row shape at the application boundary
(mirrors US-051's `recortarTransaccion` gate) and sums `abono` in BigInt; a new DTO + Zod
`.strict()` schema + flat route expose exactly `{total, conteo, transacciones}` on the wire.

```
GET /api/ingresos/mes?periodo=YYYY-MM
  └─ routes/ingresos.routes.ts :: registrarIngresosMes        (infrastructure, closure-DI)
       └─ ObtenerIngresosMesUseCase                            (application, Result<T,E>)
            └─ IDetalleBucketReader.findByPeriodoYBucket      (EXISTING port, Bucket.Ingreso)
               └─ proyección recortada {id, fecha, descripcion, origen, monto}  (PII gate PR1)
       └─ aIngresosMesDto(...)                                 (infrastructure, BigInt→string)
```

Design principles (ADR-005/008/015/024): dependency rule untouched; **reuse-first** — the
bucket-ingreso filter already encodes `esIngreso` (cargo = 0 ∧ abono > 0), assigned at ingest by
`categorizar-transaccion.use-case.ts`; **strict TDD** (ADR-016), application before infrastructure;
money stays `bigint` until the HTTP boundary; never throws (`Result<T,E>`); Spanish naming in
domain/application, English in infra; no new domain VO/error class.

## 2. Decisions (ADR-style)

| id | decision | rationale | rejected alternative |
|----|----------|-----------|----------------------|
| D-01 | Reuse `IDetalleBucketReader` with `Bucket.Ingreso` — no new reader/SQL | US-051 D-02 precedent; `prisma-detalle-bucket.repository.ts` returns `banco` (plain) + decrypted `descripcion`/`numeroCuenta`, rows pre-folded and ordered; filter `{ bucketId: 'bucket-ingreso' }` (BUCKET_IDS) encodes the income rule — the use case MUST NOT re-apply a sign rule (MID-05) | New `PrismaIngresosMesRepository` (DRY/YAGNI) |
| D-02 | New `obtener-ingresos-mes.use-case.ts`: `ObtenerIngresosMesUseCase.execute({userId, periodo?}) → Result<ObtenerIngresosMesResult, PeriodoInvalidoError>`; result = `{total: bigint (Σ abono), conteo, transacciones[]}` with `transacciones` = `{id, fecha, descripcion, origen, monto}` projected by a private `recortarTransaccionIngreso(fila)` (`origen = fila.banco \|\| 'Manual'`, `monto = fila.abono`) | PII-trim gate at the application boundary, mirroring `recortarTransaccion` (US-051 MBD-08) — `tipoCuenta`/`numeroCuenta` never reach application types; `\|\|` compiles on non-null `banco: string` yet is runtime-safe (MID-02) | Projecting rows raw to the DTO (PII would live in types) |
| D-03 | Response has EXACTLY `{total, conteo, transacciones[]}` — no `meta`/`porcentaje`/`estado`, and no `periodo` echo (MID-01 is authoritative); `.strict()` schema is the wire guarantee | Ingresos don't participate in 50/30/20; the 3-key shape is pinned by MID-01; a stray echo (e.g. `periodo`) FAILS the `.strict()` response schema — self-checking | Echoing `periodo` like US-051 (breaks MID-01 shape) |
| D-04 | `ingresos-mes.dto.ts`: `aIngresosMesDto(result)` — `String(total)`, `String(abono)`, `fecha.toISOString()`, `origen` string | BigInt-safe strings (CA-05), ISO-8601 UTC (locked convention), mirrors `detalle-bucket-mes.dto.ts` mapper discipline (verbatim, serialize-only) | Number conversion (2^53 loss) |
| D-05 | `ingresos-mes.schema.ts`: `ingresosMesQuerySchema` (`periodo` optional, transport-shape only — NOT the domain period parser, US-051 D-07 discipline) + `ingresosMesResponseSchema` `.strict()` with leaf `{id, fecha, descripcion, origen, monto}` `.strict()` + `.meta({id: 'IngresosMesResponse'})` | `.strict()` = `additionalProperties: false` in generated OpenAPI — a stray `tipoCuenta` fails parse (MID-03/MID-06); sync guarantee checked against `aIngresosMesDto` output | Validating YYYY-MM in the schema (domain rule stays in `PeriodoMes`) |
| D-06 | Route: NEW `routes/ingresos.routes.ts` `registrarIngresosMes(router, useCase)` → `GET /ingresos/mes`, mounted on `protectedApi` in `app.ts` after `registrarBucketDetalleMes` (line ~176); flat-handler discipline: query safeParse → use case → `PeriodoInvalidoError` → scrubbed 400 (never echoes raw input) → exhaustive `never` → 500 → `aIngresosMesDto` | Verified top-level `/api/ingresos/mes` is free (no existing `/ingresos` route); US-051's `GET /api/buckets/Ingresos/detalle` 400 (MBD-07) is a DIFFERENT path and stays untouched | `/api/buckets/Ingresos/...` sub-resource (collides with MBD-07 semantics) |
| D-07 | Container: THIRD `new PrismaDetalleBucketRepository(prisma, crypto)` + one `new ObtenerIngresosMesUseCase(...)`, no `crear-*` helper | VERIFIED: container.ts holds two per-use-case instances already (lines 207, 216) under the one-`new`-per-use-case discipline (US-049 D-12 / US-051 D-10 — "segunda instancia stateless, sin costo"); the repo pattern is per-use-case instances, NOT a shared one | Extracting a shared reader instance (US-051 D-10's documented rejected alternative: invisible coupling, mocked in app specs) |
| D-08 | OpenAPI: `ingresosMesOperation` + `'/api/ingresos/mes': { get: ... }` APPENDED at END of `paths` (after `/api/buckets/{bucket}/detalle`, line 1149 — the file's own "append, never reorder" instruction); then `pnpm api openapi:emit` + `pnpm api-client generate` (root `contract:sync`). Isolation grows 6→7 (data-bearing, userId in WHERE) — design + delta spec state it explicitly | Determinism contract (openapi-contract-express): `openapi:check` diffs only the genuine addition | Mid-map insert (spurious diffs) |

Method-naming note: the launch brief said `executar`, but EVERY use case in this repo (US-017/049/051)
uses `execute` — the design follows the repo convention.

## 3. PII narrative — explicit divergence from US-051 MBD-08

| context | banco | tipoCuenta / numeroCuenta |
|---------|-------|---------------------------|
| US-017 flat `/api/buckets/:bucket` | exposed (dto maps verbatim, verified) | exposed |
| US-051 MBD-08 `/api/buckets/:bucket/detalle` | BANNED (DTO spec asserts absent; leaf `.strict()`) | banned |
| **US-052 `/api/ingresos/mes`** | **EXPOSED as `origen` (CA-02, verbatim, no normalization)** | **NEVER** |

US-052 deliberately does NOT inherit MBD-08: the bank NAME is required output (CA-02, issue #286),
strictly narrower than US-017's full account exposure. Enforcement: (1) application-boundary
projection type (D-02) simply has no cuenta fields — the typechecker can't emit them; (2) `.strict()`
leaf schema (D-05) hard-rejects any stray key — a wire guarantee, not just discipline.

## 4. File-by-file change list (domain → application → infrastructure; TDD order)

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | `apps/api/src/application/use-cases/obtener-ingresos-mes.use-case.ts` | Create | `ObtenerIngresosMesUseCase` (D-01/D-02): periodo resolution (`PeriodoMes.actual()` / `PeriodoMes.crear`) → reader with `Bucket.Ingreso` → Σ abono + trimmed projection; logs counts only (ADR-013) |
| 2 | `apps/api/src/application/use-cases/obtener-ingresos-mes.use-case.spec.ts` | Create | Unit tests with fake reader (ledger §5) |
| 3 | `apps/api/src/infrastructure/http/dto/ingresos-mes.dto.ts` | Create | `IngresosMesDto` + `aIngresosMesDto` (D-03/D-04) |
| 4 | `apps/api/src/infrastructure/http/dto/ingresos-mes.dto.spec.ts` | Create | Mapping tests |
| 5 | `apps/api/src/infrastructure/http-express/schemas/ingresos-mes.schema.ts` | Create | Query + `.strict()` response schema (D-05) |
| 6 | `apps/api/src/infrastructure/http-express/schemas/ingresos-mes.schema.spec.ts` | Create | Sync + `.strict()` rejection tests |
| 7 | `apps/api/src/infrastructure/http-express/routes/ingresos.routes.ts` | Create | `registrarIngresosMes` (D-06) |
| 8 | `apps/api/src/infrastructure/http-express/app.ts` | Modify | Mount `registrarIngresosMes(protectedApi, ...)` after line 176 |
| 9 | `apps/api/src/composition/container.ts` | Modify | `Container.obtenerIngresosMes` + wiring + return (D-07) |
| 10 | `apps/api/src/infrastructure/http-express/schemas/openapi-document.ts` | Modify | `ingresosMesOperation` + appended path (D-08) |
| 11 | `apps/api/src/infrastructure/http-express/schemas/openapi-document.spec.ts` | Modify | +1 case: registers the path with query + 200/400 |
| 12 | `apps/api/src/infrastructure/http-express/app.ingresos-mes.spec.ts` | Create | Hermetic auth+isolation gate |
| 13 | `apps/api/test/ingresos-mes.e2e-spec.ts` | Create | Real-DB e2e (RUN_ID fixtures) |
| 14 | `apps/api/openapi.json` | Regenerate | `pnpm api openapi:emit` (checked by `openapi:check`) |
| 15 | `packages/api-client/src/types.gen.ts` | Regenerate | `pnpm api-client generate` (via `contract:sync`) |

`openspec/changes/us-052-mes-ingresos-detalle/tasks.md` is created by sdd-tasks (not here). No
domain files change — no new VO, no new error class, no schema/migration.

## 5. Test strategy / ledger (RED first)

**Existing suites that MUST pass byte-unchanged (additive gate):** `app.bucket-detalle-mes.spec.ts` (6),
`bucket-detalle-mes.e2e-spec.ts` (7 — incl. MBD-07 `GET /api/buckets/Ingresos/detalle` → 400),
`obtener-detalle-bucket-mes.use-case.spec.ts` (12), `detalle-bucket-mes.dto.spec.ts` (5),
`bucket-detalle-mes.schema.spec.ts` (2), all buckets/movimientos/resumen/openapi suites.

| suite | status | cases | contents |
|-------|--------|-------|----------|
| `obtener-ingresos-mes.use-case.spec.ts` | NEW | **13** | absent periodo → `PeriodoMes.actual()` (1); invalid → `Result.fail(PeriodoInvalidoError)`, reader NOT called (1); periodo flows to reader (1); `userId` flows verbatim (RNF-SEC-006/MID-06) (1); reader called with `Bucket.Ingreso` — bucket filter encodes esIngreso, no sign rule re-applied (1); empty rows → ok `0n`/0/`[]` (1); total = Σ abono exact beyond `MAX_SAFE_INTEGER` (1); `monto` = positive abono, never cargo (1); reader order preserved, not re-sorted (1); `origen` verbatim `'Santander'`/`'BancoEstado'` (MID-02) (1); `origen` `'Manual'` on empty `banco` — dead branch unit-proven (1); projection has EXACTLY `{id,fecha,descripcion,origen,monto}` — no `tipoCuenta`/`numeroCuenta` in the type (1); logger counts only, montos never logged (ADR-013) (1) |
| `ingresos-mes.dto.spec.ts` | NEW | **4** | `total`/`monto` bigint→string (1); fecha ISO-8601 UTC (1); `origen` passthrough (1); output has EXACTLY `{total, conteo, transacciones}` — no meta/porcentaje/estado/periodo (1) |
| `ingresos-mes.schema.spec.ts` | NEW | **3** | real `aIngresosMesDto` output parses (sync guarantee) (1); leaf `.strict()` rejects stray `tipoCuenta` key (MID-03) (1); top-level `.strict()` rejects extra key / `monto` as JSON number (1) |
| `app.ingresos-mes.spec.ts` | NEW | **6** | 401 sin `x-api-key` (1); 401 api-key sin sesión (1); 200 con api-key + sesión y el `userId` DE LA SESIÓN fluye al use case (MID-06) (1); 400 scrubbed en `PeriodoInvalidoError` — input crudo ausente del body (1); body 200 real cumple `ingresosMesResponseSchema` con `origen` banco en el wire (1); sin meta/porcentaje/estado en el body (1) |
| `ingresos-mes.e2e-spec.ts` | NEW | **7** | sin `periodo` → 200 con las filas del mes UTC actual (seed en mes actual + mes anterior, solo aparecen las del actual — MID-04) (1); `?periodo=not-a-date` → 400 scrubbed (1); DTO shape — exactamente `{total, conteo, transacciones}` y cada tx `{id, fecha, descripcion, origen, monto}` con `origen` = banco del account seed, sin paginación (MID-01/02) (1); mes vacío → `"0"`/0/`[]` (1); montos > `MAX_SAFE_INTEGER` exactos en el wire (1); aislamiento dos usuarios — datos de B nunca en A, cookie y Bearer (MID-06/ISO-02, delta 6→7) (1); reconciliación: `total` === resumen-mensual Ingreso `totalAbono`, SPEND row (`abono>0 && cargo>0`) excluido (1) |
| `openapi-document.spec.ts` | MOD | **+1** | registra `GET /api/ingresos/mes` con query `periodo` + 200/400 |

**Totals: 33 new backend cases (+1 touched).** No web/mobile/landing impact (consumer is US-054).

## 6. HTTP contract appendix

**Request:** `GET /api/ingresos/mes?periodo=2026-07` — headers `x-api-key` + session (cookie or Bearer).

**200 (MID-01/02/03/05):**
```json
{ "total": "3000000", "conteo": 3, "transacciones": [
  { "id": "tx-a", "fecha": "2026-07-03T00:00:00.000Z", "descripcion": "Sueldo", "origen": "BCI", "monto": "1500000" },
  { "id": "tx-b", "fecha": "2026-07-15T00:00:00.000Z", "descripcion": "Freelance", "origen": "BancoEstado", "monto": "900000" },
  { "id": "tx-c", "fecha": "2026-07-21T00:00:00.000Z", "descripcion": "Transferencia", "origen": "Santander", "monto": "600000" }
] }
```
Empty month: `{"total": "0", "conteo": 0, "transacciones": []}`.

**Errors (always scrubbed — raw input never echoed):**
```json
{ "message": "El período no es válido. Formato esperado: YYYY-MM (ej: 2026-07)." }
```
**401** when session missing (api-key alone insufficient, ISO-01). **500** unexpected via `next(err)`.

## 7. PR slicing — force-chained (stacked-to-main)

Mirrors US-051's 4-PR pattern (each slice RED-first, green + `tsc --noEmit` + lint + `openapi:check` before hand-off; budget < 800 changed lines/slice):

| PR | branch target | contents | est. changed lines |
|----|---------------|----------|--------------------|
| 1 | `main` (stack base) | application: use case + spec (D-01/D-02) | ~400 |
| 2 | PR1 branch | DTO + spec, schema + spec (D-03/04/05) | ~350 |
| 3 | PR2 branch | route + `app.ts` mount + container + openapi-document + spec case (D-06/07/08; `openapi.json`/`types.gen.ts` regenerated in-PR) | ~170 hand-written |
| 4 | PR3 branch | hermetic app spec + e2e (heaviest — fixture boilerplate) | ~700 |

Each slice is independently reviewable; slice 4 is the largest but stays under the 800 cap (mostly
RUN_ID seeding helpers mirroring `bucket-detalle-mes.e2e-spec.ts`). If reviewers prefer, slice 4 can
split into hermetic / e2e — same chain, one more node.

## 8. Rollback / Compatibility

**Additive, zero migration** — rollback = revert the PR(s) and regenerate `openapi.json` +
`types.gen.ts`. US-017 flat, US-051 grouped detail, movimientos and resumen untouched (MBD-07's 400
for `/api/buckets/Ingresos/detalle` is byte-unchanged — different path, no interaction).

## 9. Risks / Open questions

| risk | severity | mitigation |
|------|----------|------------|
| Inherits US-051 MBD-08 "no banco" gate by copy-paste | Med | §3 PII narrative pinned in design + spec; DTO/e2e assert `origen` present AND `tipoCuenta`/`numeroCuenta` absent |
| Manual branch reads as dead weight | Low | Unit-proven via fake reader (`banco: ''` → `'Manual'`); e2e covers the bank branch; no data-model change (NOT NULL `ingestaId`/`accountId`) |
| Isolation delta 6→7 mis-merged (Purpose prose / ISO-01 stale at 6) | Low | Delta spec's archive note is explicit: merge Purpose + ISO-01 + ISO-02 together; hermetic 401 + two-user e2e |
| Container "reuse" assumption from brief | Low | VERIFIED: per-use-case instances are the pattern (2 already exist); D-07 creates the third, documents why not a shared instance |
| Route naming collision | Low | `/api/ingresos/mes` verified free; MBD-07 path untouched and covered by existing e2e |
| `execute` vs brief's `executar` | Low | Repo convention followed (`execute` on all use cases); noted in §2 |
| No `periodo` echo on wire (MID-01) | Low | e2e proves current-month default via seeded-row windows, not body echo; `.strict()` schema rejects a stray echo |

Open questions: none blocking — TDD order, route path, response shape and PII bounds are all pinned
by spec MID-01..06 + the delta. `tasks.md` will mirror §5 ledger (13+4+3+6+7, +1 touched).
