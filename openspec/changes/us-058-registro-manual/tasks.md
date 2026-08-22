# Tasks: US-058 — Register a Manual Movement (backend)

Strict TDD (`pnpm api test`): RED fails before GREEN.
Order: domain errors → domain VO → application port + use case → infra adapter (migration-atomic) → HTTP/DTO/schema → composition + wiring → OpenAPI + contract → integration tests → ADR + closing.

Delivery strategy: ask-on-risk (Review Workload Forecast at bottom; confirm split before apply starts). Chain strategy: stacked-to-main.
Four force-chained PRs merge green to main; web/mobile untouched (US-060/US-061).

## APPLY PRECONDITION (blocking — verify before writing any code)

**Apply starts from post-merge `main`, ONLY after the US-057 chain (PRs #449–#454) merges.**

- [ ] T-00 — Verify precondition: run `git log origin/main --oneline | head -10` and confirm all 6 US-057 PRs are present. Then verify: `git show origin/main:apps/api/src/domain/errors/categoria-fuera-de-catalogo.error.ts` resolves. If either check fails: **STOP — do not write code until US-057 is merged.**

Also verify local ephemeral DB is available (`apps/api/docs/local-test-db.md`); confirm `pnpm api test:integration` baseline passes. Required before Phase 6. No code changes.

---

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1 650 (approx. PR1 ~280 + PR2 ~320 + PR3 ~380 + PR4 ~670) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 domain errors+VO → PR2 application port+use case+adapter+migration (atomic) → PR3 HTTP/DTO/schema+composition+openapi → PR4 integration tests+ADR+closing |
| Delivery strategy | ask-on-risk (user must confirm split before apply starts) |
| Chain strategy | stacked-to-main |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

### Atomic work units (un-splittable)

| Atomic unit | Items | Reason |
|---|---|---|
| **migration + schema + prisma generate + adapter** | Phase 3 migration SQL + `schema.prisma` edit + `prisma generate` + `PrismaRegistrarMovimientoManualRepository` compile | The adapter writes `ingestaId: null` + `origen: 'Manual'`; the pre-migration NOT NULL schema rejects that at the Prisma type level. Splitting leaves both tsc and tests broken. Must land in ONE commit. |

### Suggested Work Units

| Unit | Goal | PR | Est. lines |
|---|---|---|---|
| 1 | Domain errors + MovimientoManual VO | PR 1 → main | ~280 |
| 2 | Application port + use case + migration-atomic adapter commit | PR 2 → PR1 | ~320 |
| 3 | HTTP/DTO/Zod schema + movimientos.routes.ts sibling + composition + wiring + OpenAPI | PR 3 → PR2 | ~380 |
| 4 | Integration tests + ADR + closing | PR 4 → PR3 | ~670 |

---

## Phase 1 — Domain errors + MovimientoManual VO [PR 1]

*Satisfies: MAN-01 (domain validation via Result, overflow guard, fecha≤today, descripcion≤500), D-01, D-02, D-03; spec §Testing Emphasis (Unit — domain).*

- [ ] T-01 — (RED) Write unit test for `MovimientoManualInvalidoError`:
  - Confirms fixed scrub-safe message (no amounts, no categoriaId echoed).
  - Confirms all code variants are representable: `FECHA_FUTURA`, `DESCRIPCION_VACIA`, `DESCRIPCION_LARGA`, `MONTO_INVALIDO`, `MONTO_OVERFLOW`, `SIN_MONTOS`, `MONTO_NEGATIVO`, `CARGO_Y_ABONO`.
  - Extends appropriate base class (pattern: `NormalizacionInvalidaError`, `PersistenciaFallidaError`).
  **File (test first):** `apps/api/src/domain/errors/movimiento-manual-invalido.error.spec.ts`.

- [ ] T-02 — (GREEN) Create `apps/api/src/domain/errors/movimiento-manual-invalido.error.ts`:
  - `MotivoMovimientoManualInvalido` string enum with all 8 codes (D-01/D-09).
  - `MovimientoManualInvalidoError` class: `readonly code: MotivoMovimientoManualInvalido`; fixed message string; no interpolation of any request value.
  Verify: `pnpm api exec tsc --noEmit`.

- [ ] T-03 — (RED) Write unit test for `BucketCategoriaNoConcuerdaError`:
  - Fixed scrub-safe message.
  - Public props `categoriaId` and `bucket` present (for logging, never in `.message`).
  - Extends appropriate base class (mirrors `CategoriaFueraDeCatalogoError` at `apps/api/src/domain/errors/categoria-fuera-de-catalogo.error.ts`).
  **File (test first):** `apps/api/src/domain/errors/bucket-categoria-no-concuerda.error.spec.ts`.

- [ ] T-04 — (GREEN) Create `apps/api/src/domain/errors/bucket-categoria-no-concuerda.error.ts` (D-03):
  - Fixed message, no interpolation; public `categoriaId: string` and `bucket: Bucket` props.
  Verify: `pnpm api exec tsc --noEmit`.

- [ ] T-05 — (RED) Write unit test matrix for `MovimientoManual.crear` (D-01/D-02):
  - Ingreso: `{cargo:0n, abono:montoN}` mapping; `tipo` propagated.
  - Gasto: `{cargo:montoN, abono:0n}` mapping.
  - Non-numeric `monto` string ⇒ `MONTO_INVALIDO`.
  - Negative numeric string (e.g. `"-500"`) ⇒ `MONTO_INVALIDO`.
  - Float string (e.g. `"12.50"`) ⇒ `MONTO_INVALIDO`.
  - `monto` string whose numeric value > `Number.MAX_SAFE_INTEGER` ⇒ `MONTO_OVERFLOW`.
  - `monto` string at exactly `Number.MAX_SAFE_INTEGER` ⇒ ok (boundary stays exact, no float).
  - `monto="0"` ⇒ mapped to 0n ⇒ `Transaccion.crear` fires `SIN_MONTOS` ⇒ surfaced as `MovimientoManualInvalidoError(SIN_MONTOS)`.
  - `descripcion=""` or whitespace-only ⇒ `DESCRIPCION_VACIA`.
  - `descripcion` > 500 chars ⇒ `DESCRIPCION_LARGA`.
  - `descripcion` valid → forwarded as-is to `Transaccion.crear` (no re-validation there).
  - `fecha` = today (injected clock) ⇒ `Result.ok`.
  - `fecha` = today+1 (injected clock) ⇒ `FECHA_FUTURA`.
  - Unlimited past `fecha` ⇒ ok.
  - `CARGO_Y_ABONO` mapping arm present in code but no test asserts it is reachable at runtime (structurally unreachable per D-09 note).
  - All failure paths return `Result.fail`; no throw in any branch.
  **File (test first):** `apps/api/src/domain/value-objects/movimiento-manual.spec.ts`.

- [ ] T-06 — (GREEN) Create `apps/api/src/domain/value-objects/movimiento-manual.ts` (D-01/D-02):
  - `MovimientoManual.crear({ tipo: 'Ingreso' | 'Gasto', fecha: Date, descripcion: string, monto: string, clock?: () => Date }): Result<MovimientoManual, MovimientoManualInvalidoError>`.
  - (a) Decimal-string → BigInt conversion + overflow guard (`Number.MAX_SAFE_INTEGER` boundary): NEWLY ESTABLISHED here (no exact repo precedent); emits `MONTO_INVALIDO` or `MONTO_OVERFLOW`.
  - (b) `descripcion` trimmed non-empty + ≤ 500 chars; emits `DESCRIPCION_VACIA` or `DESCRIPCION_LARGA`.
  - (c) `fecha ≤ today` (UTC calendar date comparison via injected clock); emits `FECHA_FUTURA`.
  - (d) Maps `tipo` → `(cargo, abono)` bigint pair; delegates to `Transaccion.crear(...)` for XOR/non-negative/non-zero invariants; maps all `TransaccionInvalidaError` codes into `MovimientoManualInvalidoError` at the VO boundary.
  - Exposes `.transaccion`, `.tipo`, `.esIngreso()`.
  Verify: `pnpm api exec tsc --noEmit`.

- [ ] T-07 — Verify phase 1: `pnpm api test` (all suites green) + `pnpm api exec tsc --noEmit`.
  **Work-unit commit:** `feat(api): domain errors and MovimientoManual VO (US-058 PR1)`.

---

## Phase 2 — Application port + use case + atomic migration/adapter [PR 2]

*Satisfies: MAN-01 (Result, overflow guard), MAN-02 (Ingreso auto-classification, no CategorizarTransaccionUseCase), MAN-03 (Gasto cascade, CategoriaFueraDeCatalogoError, BucketCategoriaNoConcuerdaError), MAN-04 (null ingestaId, sentinel account, origen='Manual', delete-immunity), REG-01 (existing rows unaffected); D-04, D-05, D-07, D-08, D-09, D-10, D-11, D-13; spec §Testing Emphasis (Unit — use case, adapter, sentinel, migration).*

> **Atomic commit inside this PR (cannot be split across PRs):**
> The migration SQL + `schema.prisma` edits + `prisma generate` + `PrismaRegistrarMovimientoManualRepository` MUST all land in a single commit because the adapter writes `ingestaId: null` + `origen: 'Manual'` — the pre-migration NOT NULL schema rejects that at the Prisma type level. Splitting the migration from the adapter leaves compilation broken.

- [ ] T-08 — Create `apps/api/src/application/ports/registrar-movimiento-manual.port.ts` (D-04):
  - `RegistrarMovimientoManualInput = { userId: string; accountId: string; transaccion: Transaccion; bucket: Bucket; categoriaId: string | null }`.
  - `IRegistrarMovimientoManualWriter` interface with two methods:
    - `asegurarCuentaManual(userId: string): Promise<Result<{ accountId: string }, PersistenciaFallidaError>>`.
    - `registrar(input: RegistrarMovimientoManualInput): Promise<Result<{ id: string }, PersistenciaFallidaError>>`.
  - Does NOT extend or reuse `TransaccionAPersistir` or `IIngestaRepository`.
  Verify: `pnpm api exec tsc --noEmit`.

- [ ] T-09 — (RED) Write unit tests for `RegistrarMovimientoManualUseCase` (D-09/D-10/D-11):
  - **Ingreso happy path:** `CategorizarTransaccionUseCase` NOT invoked (assert via spy/no collaborator); catalog repo NOT called; result `{ bucket: Bucket.Ingreso, categoriaId: null }`; writer.asegurarCuentaManual called with `userId`; writer.registrar called once with correct payload.
  - **Gasto happy path:** catalog loaded, categoriaId in set, bucket matches; writer.registrar called with `{ bucket: requestedBucket, categoriaId }`.
  - **Gasto: categoriaId ∉ catalog set ⇒ `CategoriaFueraDeCatalogoError`; writer.registrar NOT called.**
  - **Gasto: categoriaId in set, wrong bucket ⇒ `BucketCategoriaNoConcuerdaError`; writer.registrar NOT called.**
  - **catalog repo throw ⇒ inner try/catch → `PersistenciaFallidaError`; never throws.**
  - **VO validation fail ⇒ returns `Result.fail`; no write call made.**
  - **asegurarCuentaManual fail ⇒ `PersistenciaFallidaError`; writer.registrar NOT called.**
  - **Outer try/catch: unexpected throw ⇒ `Result.fail(PersistenciaFallidaError)`; never re-throws.**
  - **No `Ingesta` row written on any failure path (no historial for manual).**
  - **Exhaustive `never` guard compiles (error union: `MovimientoManualInvalidoError | CategoriaFueraDeCatalogoError | BucketCategoriaNoConcuerdaError | PersistenciaFallidaError`).**
  **File (test first):** `apps/api/src/application/use-cases/registrar-movimiento-manual.use-case.spec.ts`.

- [ ] T-10 — (GREEN) Create `apps/api/src/application/use-cases/registrar-movimiento-manual.use-case.ts` (D-11):
  - `execute({ userId, tipo, fecha, descripcion, monto, bucket?, categoriaId? })`.
  - Algorithm (binding, D-11):
    1. `MovimientoManual.crear(...)` → fail-fast on bad money/fecha/descripcion.
    2. `writer.asegurarCuentaManual(userId)` → fail on persistence error.
    3. **if Gasto**: `categorias = await categoriaRepository.listarConPatrones(userId)` (INNER try/catch → throw ⇒ `PersistenciaFallidaError`); build `Set<categoriaId>` + `Map<categoriaId,Bucket>`; membership fail ⇒ `CategoriaFueraDeCatalogoError`; bucket-mismatch ⇒ `BucketCategoriaNoConcuerdaError`.
    4. Resolve `{ bucketFinal, categoriaIdFinal }`: Ingreso ⇒ `{Bucket.Ingreso, null}` (D-10); Gasto ⇒ `{requestedBucket, categoriaId}`.
    5. `writer.registrar({ userId, accountId, transaccion: vo.transaccion, bucket: bucketFinal, categoriaId: categoriaIdFinal })`.
    6. `Result.ok({ id })`.
  - Entire body wrapped in outer try/catch (D-09).
  - No `CategorizarTransaccionUseCase` invocation.
  Verify: `pnpm api exec tsc --noEmit`.

- [ ] T-11 — (RED) Write unit tests for `PrismaRegistrarMovimientoManualRepository` (D-05/D-08):
  - **Sentinel idempotency (D-05):** two `asegurarCuentaManual(userId)` calls against a Prisma spy; upserts on the composite key `@@unique([userId, banco, tipoCuenta, numeroCuentaBlindIndex])`; returns same `accountId` both times; only one upsert create path fires; module-level constants used (`SENTINEL_BANCO`, `SENTINEL_TIPO_CUENTA`, `SENTINEL_NUMERO_CUENTA_RAW`); `numeroCuentaBlindIndex = blindIndex.compute(normalizeNumeroCuenta('MANUAL'))` (MUST NOT be null — null would break Postgres unique-NULL semantics, creating a new row on each call instead of finding the existing one).
  - **Adapter `registrar` (D-08):** writes `ingestaId: null`; `origen: 'Manual'`; `bucketId = BUCKET_IDS[input.bucket]`; `descripcion = crypto.encrypt(input.transaccion.descripcion)`; `accountId` from sentinel.
  - **No `Ingesta.create` or `createMany` on any path.**
  **File (test first):** `apps/api/src/infrastructure/persistence/prisma-registrar-movimiento-manual.repository.spec.ts`.

- [ ] T-12 — **[ATOMIC COMMIT — migration + schema + prisma generate + adapter]**
  Implement in a SINGLE commit:

  **(a) Migration:** create `apps/api/prisma/migrations/<timestamp>_us058_manual_movement/migration.sql` with the exact D-13 SQL:
  ```sql
  ALTER TABLE "Transaccion" ALTER COLUMN "ingestaId" DROP NOT NULL;
  ALTER TABLE "Transaccion" ADD COLUMN "origen" TEXT;
  ALTER TABLE "Transaccion" ADD CONSTRAINT "Transaccion_origen_ingesta_consistency"
    CHECK (("ingestaId" IS NULL) = ("origen" IS NOT DISTINCT FROM 'Manual'));
  ```

  **(b) schema.prisma edits** (`apps/api/prisma/schema.prisma`):
  - `ingestaId String?` (relax from NOT NULL).
  - Pin `ingesta Ingesta? @relation(fields: [ingestaId], references: [id], onDelete: Restrict)` — REQUIRED to prevent Prisma from drifting to the `SetNull` default for optional relations (D-13 note).
  - Add `origen String?` with comment: `// null = ingesta-born; 'Manual' = manual (US-058, C-a)`.
  - CHECK stays out of `schema.prisma` (raw SQL only; house pattern: `Transaccion_cargo_abono_no_negativos`, `Ingesta_procesada_requires_account`).

  **(c) `prisma generate`:** run `pnpm api exec prisma generate` to regenerate the Prisma client.

  **(d) Apply gate — tsc:** run `pnpm api exec tsc --noEmit`. Verify `apps/api/src/infrastructure/persistence/prisma-eliminar-ingesta.repository.ts` still type-checks (its `deleteMany` where-clause uses `ingestaId` — must remain structurally unchanged after the schema relaxation; delete-immunity still rests on SQL three-valued logic: `NULL = <any non-null cuid>` evaluates to NULL, never TRUE, so manual rows are never matched).

  **(e) Adapter (GREEN for T-11):** create `apps/api/src/infrastructure/persistence/prisma-registrar-movimiento-manual.repository.ts`:
  - Module-level constants: `SENTINEL_BANCO = 'Manual'`, `SENTINEL_TIPO_CUENTA = 'Manual'`, `SENTINEL_NUMERO_CUENTA_RAW = 'MANUAL'`. NEVER use inline string literals for these (a typo silently creates a split-brain sentinel row via the 4-field composite key without any compile-time or runtime warning).
  - `asegurarCuentaManual(userId)`: upsert on `@@unique([userId, banco, tipoCuenta, numeroCuentaBlindIndex])` with `numeroCuenta = crypto.encrypt(normalizeNumeroCuenta(SENTINEL_NUMERO_CUENTA_RAW))` and `numeroCuentaBlindIndex = blindIndex.compute(normalizeNumeroCuenta(SENTINEL_NUMERO_CUENTA_RAW))`. Blind-index computation MUST NOT be skipped — a null `numeroCuentaBlindIndex` breaks upsert idempotency under Postgres unique-NULL semantics. Byte-identical upsert mechanics to `prisma-account.repository.ts:44-61`.
  - `registrar(input)`: single `Transaccion.create` with `ingestaId: null`, `origen: 'Manual'`, `bucketId: BUCKET_IDS[input.bucket]`, `descripcion: crypto.encrypt(input.transaccion.descripcion)`. No DB read-back after create.

  Run `pnpm api test` (all suites green) + `pnpm api exec tsc --noEmit`.
  **Atomic commit:** `feat(api): migration relax ingestaId, sentinel adapter, origen column (US-058 PR2-atomic)`.

- [ ] T-13 — Verify phase 2: `pnpm api test` (all suites green) + `pnpm api exec tsc --noEmit`.
  **PR 2 targets PR 1 branch (stacked-to-main).**

---

## Phase 3 — HTTP/DTO/schema + routes sibling + composition + wiring + OpenAPI [PR 3]

*Satisfies: MAN-06 (openapi.json, ADR-011), D-12 (discriminated union, 201, scrubbed 400), D-09 (exhaustive never guard at route), ISO-01 (userId from session), ISO-02 (cross-user); spec §Testing Emphasis (Unit — DTO schema, route mapping).*

- [ ] T-14 — (RED+GREEN) Create `apps/api/src/infrastructure/http/dto/movimiento-manual.dto.ts` (D-12):
  - `RegistrarMovimientoManualResponseDto` interface: `{ id, fecha (ISO string), descripcion, cargo (string), abono (string), bucket (string), categoriaId (string | null), origen: 'Manual' }`.
  - `aRegistrarMovimientoManualResponseDto(vo: MovimientoManual, id: string): RegistrarMovimientoManualResponseDto`: maps from the in-memory VO (`vo.transaccion.descripcion` is the plaintext string — already in memory); NO DB read-back, NO decrypt round-trip; `cargo` and `abono` as BigInt-safe strings.
  Write spec first: `apps/api/src/infrastructure/http/dto/movimiento-manual.dto.spec.ts` — covers mapper correctness (Ingreso: `cargo="0"`, `abono=montoStr`, `categoriaId=null`, `origen='Manual'`; Gasto: correct bucket string; BigInt → string serialization).

- [ ] T-15 — (RED+GREEN) Create `apps/api/src/infrastructure/http-express/schemas/movimiento-manual.schema.ts` (D-12):
  - Zod **discriminated union** on `tipo`:
    - Ingreso variant: `.strict()` — rejects stray `bucket` or `categoriaId` fields (Q3 resolution: fail-closed on malformed request, consistent with fail-closed boundary doctrine).
    - Gasto variant: requires `bucket` ∈ `{Necesidades, Deseos, Ahorro}` + `categoriaId: z.string()`.
  - `monto` as `z.string()` (BigInt-safe; JSON number ⇒ 400).
  - `fecha` as `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` — SHAPE ONLY (layer-honesty; `fecha ≤ today` business rule stays in domain, D-01/D-02).
  Write spec first: `apps/api/src/infrastructure/http-express/schemas/movimiento-manual.schema.spec.ts` — covers: Ingreso with stray `bucket`/`categoriaId` ⇒ `.strict()` 400; Gasto missing `bucket` ⇒ 400; `monto` as JSON number ⇒ 400; valid Ingreso parses; valid Gasto parses.

- [ ] T-16 — Modify `apps/api/src/infrastructure/http-express/routes/movimientos.routes.ts` (D-12):
  - Add exported sibling function `registrarMovimientoManual(router: Router, useCase: RegistrarMovimientoManualUseCase)` (POST handler at `/`, same route module as the existing `registrarMovimientos` GET handler — natural REST extension, D-12).
  - Handler: `express.json()` body → `registrarMovimientoManualSchema.safeParse(req.body)` → scrubbed 400 on shape fail (no raw body echo); `useCase.execute({ userId: req.userId!, ...parsed })`.
  - Error mapping with exhaustive `never` guard (D-09):
    - `MovimientoManualInvalidoError` ⇒ 400 (scrubbed message).
    - `CategoriaFueraDeCatalogoError` ⇒ 400.
    - `BucketCategoriaNoConcuerdaError` ⇒ 400.
    - `PersistenciaFallidaError` ⇒ 500.
    - `never` guard (mirror `movimientos.routes.ts:46-47` pattern).
  - Success ⇒ `201 Created` + `aRegistrarMovimientoManualResponseDto(vo, id)`.
  - Existing `registrarMovimientos` GET handler: UNTOUCHED (same file, same export pattern).
  Verify: `pnpm api exec tsc --noEmit`.

- [ ] T-17 — Create `apps/api/src/composition/crear-registrar-movimiento-manual.ts` (D-04/D-08):
  - Signature: `crearRegistrarMovimientoManual(prisma, crypto, blindIndex, logger)`.
  - Wires: `PrismaRegistrarMovimientoManualRepository(prisma, crypto, blindIndex)` as `IRegistrarMovimientoManualWriter`; `PrismaCategoriaRepository(prisma)` as `ICategoriaRepository`; logger.
  - Mirror `crear-commit-ingesta.ts` structure.
  Verify: `pnpm api exec tsc --noEmit`.

- [ ] T-18 — Modify `apps/api/src/composition/container.ts`:
  - Add `registrarMovimientoManual: RegistrarMovimientoManualUseCase` field to `Container`.
  - Wire via `crearRegistrarMovimientoManual(prisma, crypto, blindIndex, logger)`.
  Verify: `pnpm api exec tsc --noEmit`.

- [ ] T-19 — Modify `apps/api/src/infrastructure/http-express/app.ts`:
  - Call `registrarMovimientoManual(protectedApi, container.registrarMovimientoManual)` near line 179, next to the existing `registrarMovimientos(...)` call.
  - Sibling function pattern — NOT extending the existing function's signature.
  Verify: `pnpm api exec tsc --noEmit`.

- [ ] T-20 — (RED+GREEN) Update OpenAPI contract (MAN-06, ADR-011):
  - Modify `apps/api/src/infrastructure/http-express/schemas/openapi-document.ts`: add `POST /api/movimientos` operation with the discriminated union request body schema (Ingreso variant + Gasto variant) and the 201 response schema (`RegistrarMovimientoManualResponseDto` shape). APPEND at end of `paths` — never reorder existing paths.
  - Update `openapi-document.spec.ts` (or create it if absent): add cases asserting the `POST /api/movimientos` path is present; Ingreso variant rejects `bucket`/`categoriaId`; Gasto variant requires them; `201` response carries all required fields.
  Write spec cases BEFORE updating the document.

- [ ] T-21 — Regenerate `apps/api/openapi.json` via `pnpm api openapi:emit`. Run `pnpm api openapi:check` — exits 0. Verify: `POST /api/movimientos` operation present with correct request/response schemas.

- [ ] T-22 — Verify phase 3: `pnpm api test` (all suites green) + `pnpm api exec tsc --noEmit` + `pnpm api openapi:check` exit 0.
  **Work-unit commit:** `feat(api): HTTP DTO, Zod schema, routes sibling, composition wiring, OpenAPI (US-058 PR3)`.

---

## Phase 4 — Integration tests + ADR + closing [PR 4]

*Satisfies: MAN-01–MAN-06 (end-to-end), ISO-01, ISO-02, REG-01, D-06 (Origen truthy-branch — REQUIRED integration test), D-13 (migration CHECK truth table — both violations rejected), CA-04 (delete-ingesta immunity), CA-05 (resumen zero-code impact), spec §Testing Emphasis (Integration matrix).*

Requires: local ephemeral DB running (T-00 pre-flight).

- [ ] T-23 — (RED+GREEN) Write integration tests in `apps/api/test/` (follow existing integration file naming convention). All tests run against local ephemeral Postgres (`ALLOW_DESTRUCTIVE_DB=1`). Group by named describe blocks:

  - **MAN-01 / MAN-03 domain validation end-to-end:** `POST /api/movimientos` with future `fecha` ⇒ 400; `monto="0"` ⇒ 400; `monto="12.50"` ⇒ 400; `descripcion=""` ⇒ 400; all scrubbed (no raw amount in body). Gasto with missing `bucket` ⇒ 400. Amounts MUST NOT appear in any error response body.

  - **MAN-02 Ingreso auto-classification (no catalog call):** valid Ingreso `POST` ⇒ 201; persisted row has `bucketId = BUCKET_IDS[Ingreso]`, `categoriaId = null`, `ingestaId = null`, `origen = 'Manual'`; Ingreso with stray `bucket="Deseos"` ⇒ 400 (`.strict()` discriminated union rejection).

  - **MAN-03 Gasto cascade:** Gasto with valid `categoriaId + bucket` ⇒ 201; Gasto with `categoriaId` not in caller's catalog ⇒ 400 (`CategoriaFueraDeCatalogoError`); Gasto with `categoriaId` in catalog but wrong `bucket` ⇒ 400 (`BucketCategoriaNoConcuerdaError`); cross-tenant `categoriaId` (belonging to user B) used in user A's request ⇒ 400.

  - **MAN-04 sentinel account find-or-create:** user with no prior manual movement → first `POST` creates exactly one `Account(banco='Manual', userId=caller)`; second `POST` does NOT create a second sentinel row (idempotent upsert). Persisted row has `ingestaId = null`, `origen = 'Manual'`, `accountId` pointing to the sentinel.

  - **CA-04 delete-ingesta immunity (D-04/§4):** register a manual movement + an ingesta-born movement for the same user. Call `DELETE /api/ingestas/:id` on the ingesta. Assert the manual row (`ingestaId IS NULL`) survives in the DB. Assert the ingesta-born rows are deleted.

  - **D-06 Origen truthy branch (REQUIRED per §7):** register a manual Ingreso row (sentinel account has `banco='Manual'`). Call `GET /api/ingresos/mes`. Assert the response row has `origen='Manual'`. This tests the TRUTHY branch of `fila.banco || 'Manual'` end-to-end. The existing unit test at `obtener-ingresos-mes.use-case.spec.ts:287-300` covers only the empty-string fallback branch and does NOT substitute for this test.

  - **CA-05 resumen zero-reader-change (D-07):** register a manual Gasto (`bucket=Deseos`, period M) with no other transactions. Call `GET /api/resumen?periodo=M`. Assert `Deseos.total` equals the registered `monto`. Assert no reader file was modified (documentation note; the test proves it by running unchanged readers against the new row).

  - **REG-01 migration backward-compat (D-13 CHECK truth table):** confirm existing ingesta-born rows (`ingestaId` set, `origen = NULL`) satisfy the CHECK (truth table row 3: PASSES). Attempt to insert a hand-crafted violation `(ingestaId=null, origen=NULL)` → DB rejects it (row 1: REJECTED). Attempt `(ingestaId set, origen='Manual')` → DB rejects it (row 4: REJECTED). The null-safe `IS NOT DISTINCT FROM` form is required: the naive `(origen = 'Manual')` would silently pass row 1.

  - **ISO-01 / ISO-02 user isolation:** user B's `POST /api/movimientos` uses user B's `userId` exclusively; persisted row belongs to B; user A's resumen for period M is unchanged after B registers a manual movement in period M. User B cannot register into user A's space. Unauthenticated request (`POST /api/movimientos` with no session token) ⇒ 401 (middleware enforced before handler).

- [ ] T-24 — Create new ADR `docs/adr/ADR-039-manual-movements-origen.md` (or the next sequential ADR number at time of apply, verifying `docs/adr/README.md` to confirm):
  - **Amends ADR-026**: a `Transaccion` is no longer always ingesta-born. The manual origin path uses a per-user sentinel `Account(banco='Manual')` + `origen String?` column + nullable `ingestaId` (approach C, US-058).
  - Documents the `origen`/`ingestaId` pairing invariant (C-a semantics: `null = ingesta-born`, `'Manual' = manual`) and the DB-level CHECK constraint (`Transaccion_origen_ingesta_consistency`).
  - Documents delete-immunity guarantee (SQL three-valued logic: `NULL = <cuid>` is NULL, never TRUE).
  - Status: Accepted. This ADR is REQUIRED per §6 — not optional.
  - Update `docs/adr/README.md` to add the new ADR row.

- [ ] T-25 — Full sweep: `pnpm api test` + `pnpm api test:integration` + `pnpm api exec tsc --noEmit` + `pnpm api openapi:check` exit 0 + `pnpm api lint:ci` (if available in workspace).
  **Work-unit commit:** `feat(api): integration tests, migration CHECK, Origen truthy-branch, ADR (US-058 PR4)`.

---

## Parallel / sequential map

| Tasks | Relationship |
|---|---|
| T-00 | Pre-flight gate (must verify before any code) |
| T-01 → T-07 | Sequential (errors before VO; VO compiles errors) |
| T-08 | Can start as soon as PR 1 merges |
| T-09, T-10 | Sequential after T-08 (port must exist before use case) |
| T-11 | Can start in parallel with T-09/T-10 (adapter spec is independent of use case) |
| T-12 (Atomic) | Depends on T-10 + T-11 (use case and adapter RED/GREEN must exist); migration, schema, generate, and adapter ALL in ONE commit |
| T-13 | Gate after T-12 |
| T-14, T-15 | Can start in parallel as soon as PR 2 merges (DTO and schema are independent) |
| T-16 | Depends on T-14 + T-15 (routes import both) |
| T-17 | Depends on T-08 (port), T-12 (adapter); can start as soon as PR 2 merges |
| T-18, T-19 | Sequential after T-17 (container depends on creator helper) |
| T-20, T-21 | Can start as soon as PR 2 merges (openapi independent of composition) |
| T-22 | Gate after T-14 through T-21 |
| T-23 → T-25 | Sequential after PR 3 merges; T-23 requires ephemeral DB (T-00) |

---

## Requirement traceability

| Requirement | Tasks |
|---|---|
| MAN-01 (domain validation, overflow guard, fecha≤today, descripcion≤500) | T-01, T-02, T-05, T-06, T-23 |
| MAN-02 (Ingreso auto-classification, no CategorizarTransaccionUseCase) | T-09, T-10, T-23 |
| MAN-03 (Gasto cascade, CategoriaFueraDeCatalogoError, BucketCategoriaNoConcuerdaError) | T-03, T-04, T-09, T-10, T-23 |
| MAN-04 (null ingestaId, sentinel account, origen='Manual', delete-immunity) | T-08, T-09, T-10, T-11, T-12, T-23 |
| MAN-05 (resumen/percentages/semáforo, zero reader change) | T-12, T-23 (D-07 zero-work verified; integration confirms) |
| MAN-06 (userId isolation, openapi.json, ADR-011) | T-16, T-20, T-21, T-23 |
| ISO-01 (userId from session, 8 endpoints) | T-16, T-23 |
| ISO-02 (cross-user isolation, POST /api/movimientos) | T-09, T-23 |
| REG-01 (existing ingesta-born rows unaffected) | T-12, T-23 |
| D-06 Origen truthy-branch (REQUIRED integration test) | T-23 |
| D-13 CHECK truth table (both violations rejected by null-safe form) | T-12, T-23 |
| CONTRACT-01 (openapi.json updated, CI contract check) | T-20, T-21, T-25 |
| ADR (amends ADR-026 — REQUIRED) | T-24 |
