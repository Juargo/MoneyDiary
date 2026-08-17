# Design: US-051 — Backend detalle MES-BUCKET agrupado por categoría

> Scope: the HOW at architectural level. Task breakdown lives in `tasks.md`.
> Every file path, symbol and constant below was read in the repo before being written here
> (opencode design phase, 2026-08-16). Template: us-049 design (archived `2026-08-16-us-049-semaforo-detalle/design.md`).

---

## 1. Overview + Design Principles

Additive sibling endpoint `GET /api/buckets/:bucket/detalle?periodo=YYYY-MM` that composes the
**two existing readers** — `IDetalleBucketReader.findByPeriodoYBucket` (US-017 rows, already
categoria-folded and decrypted ADR-013) and `IResumenMesReader.sumarPorBucket` (month income =
`Ingreso.totalAbono`) — plus the existing `BANDAS_SEMAFORO` table and `porcentajeBasisPoints`
helper. **Zero new SQL, ports, repositories or migrations.** A pure application service
`agruparDetallePorCategoria` mirrors the web helper's documented semantics (apps/web
`agrupar-detalle-por-categoria.ts`, US-013 WCAT-02) on the backend's BigInt rows.

```
GET /api/buckets/:bucket/detalle?periodo=YYYY-MM
  └─ routes/buckets.routes.ts :: registrarBucketDetalleMes   (infrastructure, closure-DI)
       └─ ObtenerDetalleBucketMesUseCase                     (application, Result<T,E>)
            ├─ IDetalleBucketReader.findByPeriodoYBucket     (EXISTING port — bucket rows)
            ├─ IResumenMesReader.sumarPorBucket              (EXISTING port — income base)
            ├─ agruparDetallePorCategoria(rows)              (application, NEW pure service)
            ├─ BANDAS_SEMAFORO[bucket].metaBp                (domain, EXISTING table; null ⇒ no rule)
            └─ porcentajeBasisPoints(total, ingresos)        (domain, EXISTING round-half-up)
       └─ aDetalleBucketMesDto(...)                          (infrastructure, BigInt→string, PII trim)
```

Design principles (ADR-005/008/015/024): dependency rule untouched (new code imports domain +
ports only); **reuse-first** — every rule already encoded in the repo is read, not rewritten;
**strict TDD** (ADR-016) — application before infrastructure, each suite written test-first;
money stays `bigint` until the HTTP boundary; domain/application never throw (`Result<T,E>`);
Spanish naming in domain/application, English in infrastructure; no cross-layer grouping
abstraction (this is the 3rd grouping implementation — see D-03).

## 2. Decisions (ADR-style)

| id | decision | rationale | rejected alternative |
|----|----------|-----------|----------------------|
| D-01 | New sibling path `GET /api/buckets/:bucket/detalle`, **separate** `registrarBucketDetalleMes` in `buckets.routes.ts`, mounted after `registrarBuckets` in `app.ts` | US-049 sibling precedent; flat endpoint (US-017) keeps serving dashboard + interim drill-down until US-053; no ordering hazard (`:bucket` matches one segment, `/buckets/X/detalle` never matches `/buckets/:bucket`) | In-place evolution (breaks live consumers today); new SQL/port (DRY, YAGNI — exploration Approach 3) |
| D-02 | Use case orchestrates BOTH readers: rows (bucket) + `sumarPorBucket` (income base, `Ingreso.totalAbono ?? 0n`) | Two bounded queries per request; income base is the SAME rule `construirResumenMesDesdeFilas` reads — inlined 2 lines with a cross-reference comment (2nd occurrence; extract at 3rd) instead of building a full `ResumenMes` VO just to read one field | Full `construirResumenMesDesdeFilas` reuse (computes 4 slices + estados nobody renders); new single-query repo (forced by no new SQL) |
| D-03 | Pure `agruparDetallePorCategoria(rows: DetalleBucketRow[]): GrupoDetalleCategoria[]` in `application/services/` — group key `categoriaId`, subtotal = Σ cargo (Ingreso impossible: route rejects it), es-CL alpha, "Sin categoría" LAST, only present categories, reader order preserved, empty → `[]` | Mirrors web helper semantics verbatim (same documented rules); cargo-only is correct because the route allowlist excludes Ingreso (D-08) — no defensive branch | Extracting a shared cross-layer abstraction (ADR-005/008: **deliberately NOT** — write-path service returns ids, web helper works on DTOs); re-sorting transactions (reader order already fecha asc, id asc) |
| D-04 | % vs meta **single-shot**: `porcentajeBp = porcentajeBasisPoints(total, ingreso)` computed from raw bigint total vs raw income — never from an already-rounded value; `metaBp = BANDAS_SEMAFORO[bucket]?.metaBp ?? null` → `Number()` at the DTO (bp ≤ 10000 ≪ 2^53) | H1 pinned in proposal; one rounding pass on raw values ⇒ no double-rounding class; helper reuse (DRY) | H2 compliance ratio (double-rounding risk, proposal R2); a second bp formula |
| D-05 | Null semantics, one rule: **metaBp null ⇒ porcentajeBp null**, plus the existing **sinIngreso ⇒ porcentajeBp null** (`porcentajeBasisPoints` returns null on base 0) | SinCategoria absent from `BANDAS_SEMAFORO` ⇒ both null (CA-03, zero special-casing); a real bucket in a no-income month: total `"0"`, metaBp 5000, porcentajeBp null (no base) — consistent with resumen/semáforo | Synthetic default rule for SinCategoria (forbidden — single source of truth) |
| D-06 | DTO shape: `{periodo, bucket, total, totalTransacciones, totalCategorias, porcentajeBp, metaBp, grupos[]}`; `grupos[]` = `{categoriaId\|null, nombre, subtotal, conteo, transacciones[{id, fecha, descripcion, monto}]}`; money as `String(bigint)`; `monto = String(cargo)` | MBD-01/02/05 contract; BigInt strings (CA-05); PII trim per proposal decision 3 (ADR-015) — banco/tipoCuenta/numeroCuenta dropped, flat endpoint keeps full shape | Parity with flat endpoint (would ship PII the CA-02 wireframe list doesn't need) |
| D-07 | Zod transport-shape schema + response schema (`.meta({ id: 'BucketDetalleMesResponse' })`); `BucketInvalidoError`/`PeriodoInvalidoError` → **scrubbed 400** (messages never echo raw input); exhaustive `never` → 500; the 400 messages list the 4-bucket allowlist | Layer-honesty gate (openapi-contract-express) + scrub discipline already used by the flat route; allowlist message is the ONLY divergence from the flat route's 5-bucket message | Validating the enum in the schema (domain rule must stay in the use case — same docstring rule as `buckets.schema.ts`) |
| D-08 | Route allowlist `{Necesidades, Deseos, Ahorro, SinCategoria}` (new `BUCKETS_DETALLE_MES` set in the use case); anything else — **including `Bucket.Ingreso`** — → `BucketInvalidoError` → 400 | Pinned (proposal decision ②); Ingreso is US-052's territory (out of scope) and has no meta rule | Serving Ingreso with null meta (defers a 400 to a client that can't render it) |
| D-09 | `totalCategorias = grupos.length` (synthetic group counted); SinCategoria bucket ⇒ always 1; empty month ⇒ 0 with `grupos: []` | Pinned (proposal decision 2 + MBD-01 scenario); a "0 categorías" header beside one rendered group is wrong | Counting only non-null categories |
| D-10 | Container: `obtenerDetalleBucketMes` wired with **one `new PrismaDetalleBucketRepository(prisma, crypto)`** + **one `new PrismaResumenMesRepository(prisma)`** (both stateless), no `crear-*` helper | US-049 D-12 precedent: one-`new`-per-use-case style; helpers are for large sub-graphs | Reusing existing instances (invisible coupling, mocked in app specs) |
| D-11 | New `bucketDetalleMesOperation` + an **appended** entry `'/api/buckets/{bucket}/detalle'` at the END of the `paths` map (never reorder — the file's own instruction at openapi-document.ts:1070-1076), then `pnpm api openapi:emit` | Determinism contract of openapi-contract-express: `openapi:check` diffs only the genuine addition | Inserting mid-map (produces spurious diffs) |

## 3. File-by-file change list (domain → application → infrastructure; TDD order)

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | `apps/api/src/application/services/agrupar-detalle-por-categoria.ts` | Create | Pure grouping service mirroring web helper semantics (D-03). Spanish name, bigint math, never throws |
| 2 | `apps/api/src/application/services/agrupar-detalle-por-categoria.spec.ts` | Create | Mirror-semantics unit tests (ledger §4) |
| 3 | `apps/api/src/application/use-cases/obtener-detalle-bucket-mes.use-case.ts` | Create | `ObtenerDetalleBucketMesUseCase`: allowlist → period resolution (US-049 template) → both readers → header + groups assembly. `Result<ObtenerDetalleBucketMesResult, BucketInvalidoError \| PeriodoInvalidoError>`; **never throws**; logs counts only (ADR-013) |
| 4 | `apps/api/src/application/use-cases/obtener-detalle-bucket-mes.use-case.spec.ts` | Create | Unit tests (ledger §4) |
| 5 | `apps/api/src/infrastructure/http/dto/detalle-bucket-mes.dto.ts` | Create | `DetalleBucketMesDto` + `aDetalleBucketMesDto(...)` — BigInt→string, bp/meta → number|null, PII trim, `monto = cargo` (D-06) |
| 6 | `apps/api/src/infrastructure/http/dto/detalle-bucket-mes.dto.spec.ts` | Create | DTO mapping tests |
| 7 | `apps/api/src/infrastructure/http-express/schemas/bucket-detalle-mes.schema.ts` | Create | `bucketDetalleMesQuerySchema` (reuses `bucketsPathParamsSchema`) + `bucketDetalleMesResponseSchema` (`.meta({ id: 'BucketDetalleMesResponse' })`) |
| 8 | `apps/api/src/infrastructure/http-express/schemas/bucket-detalle-mes.schema.spec.ts` | Create | Sync guarantee: mapper output parses; rejects monto as JSON number |
| 9 | `apps/api/src/infrastructure/http-express/routes/buckets.routes.ts` | Modify | Add `registrarBucketDetalleMes(router, obtenerDetalleBucketMes)` — same handler shape as the flat route (scrubbed 400s, `next(err)`) |
| 10 | `apps/api/src/infrastructure/http-express/schemas/openapi-document.ts` | Modify | `bucketDetalleMesOperation` + appended path entry (D-11) |
| 11 | `apps/api/src/composition/container.ts` | Modify | `Container.obtenerDetalleBucketMes` + wiring (D-10) |
| 12 | `apps/api/src/infrastructure/http-express/app.ts` | Modify | Mount `registrarBucketDetalleMes(protectedApi, ...)` after `registrarBuckets` (line ~172) |
| 13 | `apps/api/src/infrastructure/http-express/app.bucket-detalle-mes.spec.ts` | Create | Hermetic auth+isolation gate (ledger §4) |
| 14 | `apps/api/test/bucket-detalle-mes.e2e-spec.ts` | Create | Real-DB e2e (ledger §4) |
| 15 | `apps/api/openapi.json` | Regenerate | `pnpm api openapi:emit` (checked by `openapi:check` gate) |

No domain files change — no new VO, no new error class, no schema/migration (proposal: "No new domain VO/errors").

## 4. Test strategy / ledger

**Existing suites that MUST pass byte-unchanged (the additive gate):** `buckets.routes.spec.ts` (6),
`buckets.schema.spec.ts` (7), `app.buckets.spec.ts` (2), `detalle-bucket.e2e-spec.ts` (6),
`agrupar-por-categoria-bucket.spec.ts` (write-path grouping, 5), `app.resumen-semaforo.spec.ts` (5),
`resumen-semaforo.e2e-spec.ts` (7) + every domain/application suite. If any needs editing, the
design is wrong — the new endpoint is additive by construction.

**New backend test cases (41):**

| suite | status | cases | contents |
|-------|--------|-------|----------|
| `agrupar-detalle-por-categoria.spec.ts` | NEW | **10** | group by `categoriaId` with subtotal+conteo (1); null-categoria rows → synthetic grupo with `categoriaId: null`, nombre `'Sin categoría'` (1); BigInt exact beyond `Number.MAX_SAFE_INTEGER` — `9007199254740993n + 9007199254740993n` keeps every digit (1); es-CL alpha order, Sin categoría last (1); accent/ñ order under explicit `'es-CL'` locale (1); a category literally named `'Sin categoría'` sorts last (accepted edge, visual merge) (1); only present categories — never empty grupos (1); empty input → `[]` (1); reader order preserved (fecha asc, id asc — not re-sorted) (1); subtotal = Σ cargo, never abono (1) |
| `obtener-detalle-bucket-mes.use-case.spec.ts` | NEW | **11** | each allowlist bucket accepted (1, `it.each`); `Ingreso` → `Result.fail(BucketInvalidoError)` (1); unknown bucket → fail, neither reader called (1); absent periodo → `PeriodoMes.actual()` (1); invalid periodo → `Result.fail(PeriodoInvalidoError)`, readers NOT called (1); periodo flows to both readers (1); `userId` flows verbatim to BOTH readers (RNF-SEC-006) (1); empty rows → `Result.ok` header `total: 0n`, `totalTransacciones: 0`, `totalCategorias: 0`, `grupos: []` (1); no-income month, real bucket → `porcentajeBp: null`, `metaBp: 5000n` (1); SinCategoria → both `null`, `totalCategorias: 1` (1); `logger.debug` counts only — fixture montos never logged (ADR-013) (1) |
| `detalle-bucket-mes.dto.spec.ts` | NEW | **5** | bigint→string for total/subtotal/monto (1); bp/meta → number, null preserved (1); `monto === String(cargo)` (1); **PII keys absent** — no banco/tipoCuenta/numeroCuenta key anywhere (MBD-08) (1); fecha ISO-8601 UTC `toISOString()` (1) |
| `bucket-detalle-mes.schema.spec.ts` | NEW | **2** | a real `aDetalleBucketMesDto(...)` output parses against the response schema (sync guarantee, per `buckets.schema.spec.ts` precedent) (1); schema rejects `monto: 12.5` as a JSON number (1) |
| `app.bucket-detalle-mes.spec.ts` | NEW | **6** | 401 sin `x-api-key` (1); 401 con api-key sin sesión (1); 200 con api-key + sesión y **el `userId` de la sesión fluye al use case** (RNF-SEC-006, per `app.buckets.spec.ts`) (1); 400 scrubbed en `PeriodoInvalidoError` — input crudo ausente del body (1); 400 scrubbed en `BucketInvalidoError` (Ingreso) — `'Ingreso'` ausente del body (1); body 200 real cumple `bucketDetalleMesResponseSchema` (1) |
| `bucket-detalle-mes.e2e-spec.ts` | NEW | **7** | sin `periodo` → 200 con el periodo UTC actual (1); `?periodo=not-a-date` → 400 scrubbed (1); DTO shape — header + grupos + transacciones `{id, fecha, descripcion, monto}` con los 5 movimientos presentes, sin paginación (MBD-02) (1); mes vacío del bucket → `total: "0"`, `totalCategorias: 0`, `grupos: []` (MBD-01) (1); montos > MAX_SAFE_INTEGER exacto en el wire (MBD-05) (1); **aislamiento de dos usuarios** — los datos de B nunca aparecen en A (MBD-06/ISO-02) (1); `Ingresos` → 400 (MBD-07) (1) |
| `openapi-document.spec.ts` | MOD | **+1** | registra `GET /api/buckets/{bucket}/detalle` con query `periodo` + 200/400 responses |

**Totals: 41 new backend cases (+1 touched) — 48 counting the +1.** No web, no mobile, no landing
impact: this endpoint has no consumer until US-053 (web change registers the retirement of the
interim drill-down and the web grouping).

## 5. HTTP contract appendix

**Request:** `GET /api/buckets/Necesidades/detalle?periodo=2026-07` — headers `x-api-key` +
session (cookie or `Authorization: Bearer`).

**200 — header + groups + transactions (MBD-01/02/03/05/08):**

Example month income base: **1 500 000 CLP** (`Ingreso.totalAbono`), so
250000 / 1500000 = 16.666… % → 1666.66… bp → round-half-up → `porcentajeBp` **1667**
(single-shot on raw values, D-04 — never 1666).

```json
{
  "periodo": "2026-07",
  "bucket": "Necesidades",
  "total": "250000",
  "totalTransacciones": 5,
  "totalCategorias": 2,
  "porcentajeBp": 1667,
  "metaBp": 5000,
  "grupos": [
    {
      "categoriaId": "cat-comida",
      "nombre": "Comida",
      "subtotal": "150000",
      "conteo": 3,
      "transacciones": [
        { "id": "tx-1", "fecha": "2026-07-03T00:00:00.000Z", "descripcion": "Jumbo", "monto": "90000" },
        { "id": "tx-2", "fecha": "2026-07-15T00:00:00.000Z", "descripcion": "Santa Isabel", "monto": "60000" }
      ]
    },
    {
      "categoriaId": null,
      "nombre": "Sin categoría",
      "subtotal": "100000",
      "conteo": 2,
      "transacciones": [
        { "id": "tx-4", "fecha": "2026-07-10T00:00:00.000Z", "descripcion": "Giro", "monto": "40000" },
        { "id": "tx-5", "fecha": "2026-07-21T00:00:00.000Z", "descripcion": "Cuota", "monto": "60000" }
      ]
    }
  ]
}
```

SinCategoria bucket: `"metaBp": null, "porcentajeBp": null, "totalCategorias": 1`. Empty month:
`"total": "0", "totalTransacciones": 0, "totalCategorias": 0, "grupos": []`. Ingreso: **400**.

**Errors (always scrubbed — raw input never echoed):**

```json
{ "message": "El bucket no es válido. Valores esperados: Necesidades, Deseos, Ahorro, SinCategoria." }
{ "message": "El período no es válido. Formato esperado: YYYY-MM (ej: 2026-07)." }
```

**401** when session missing (api-key alone insufficient, ISO-01).

## 6. Rollback / Compatibility

**Additive, zero migration** — rollback = revert the PR and regenerate `openapi.json`. The flat
endpoint (`GET /api/buckets/:bucket`), dashboard panel and interim drill-down are untouched and
keep working until US-053 (retirement registered in this change's proposal and the
`bucket-detalle-mes` spec). Two new readers-per-request (rows + sums) are bounded by one
bucket-month; future per-group `?page=` noted as follow-up (YAGNI now).

## 7. Test ledger totals

| bucket | existing | touched | new | final |
|--------|----------|---------|-----|-------|
| Backend (related suites) | 38 byte-unchanged | 1 (+1 case) | 41 | 80 |

`tsc --noEmit`, lint and `openapi:check` (D-11) are the non-test gates. No migration, no new env,
no new dependency.

## Risks carried into implementation

| risk | severity | mitigation in this design |
|------|----------|---------------------------|
| Grouping drifts from web helper (3rd impl) | Med | Mirror tests pin the documented rules (D-03); no cross-layer abstraction (ADR-005/008); both files cross-reference each other |
| % double-rounding | Med | D-04 single-shot on raw values; boundary test pins `porcentajeBasisPoints` equivalence (use-case spec, no-income + half-bp cases) |
| Isolation leak | Low | Hermetic app test (401 + session-derived userId) + two-user e2e, per `app.buckets.spec.ts` (RNF-SEC-006) |
| PII slips through the trim | Low | DTO spec asserts the three keys are absent anywhere in the response (MBD-08) |
| Oversized payload | Low | Bounded by one bucket-month; `?page=` follow-up noted (YAGNI) |