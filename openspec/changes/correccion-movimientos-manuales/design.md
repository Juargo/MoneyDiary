# Design: Correction path for committed manual movements

> SDD change `correccion-movimientos-manuales` — design phase (2026-08-29).
> Canonical mirror in Engram: `sdd/correccion-movimientos-manuales/design`.
> Inputs: `proposal.md` (§3 decisions, §6 ADR-040 draft), `spec.md` (DEL-01..05,
> WEB-DEL-01/02), `explore.md`.

## Technical Approach

A near-verbatim mirror of the `EliminarIngesta` triad, one HTTP sibling handler, one
shared web control rendered on two surfaces, plus the **one genuinely new piece of
work**: plumbing the `origen` provenance signal onto the gasto wire, which today stops
at the application boundary (D-02). No migration, no schema change, no reader change,
no cache layer to invalidate — `Transaccion` is a leaf and every reader recomputes per
request (ADR-039 CA-05/D-07).

```
DELETE /api/movimientos/:id
  route (movimientos.routes.ts)  ── esDemoDeSesion(req) ──┐
        │ req.userId (session middleware, never body)     │
        ▼                                                 ▼
  EliminarMovimientoManualUseCase ── esDemo ──> MovimientoDemoSoloLecturaError (403)
        │ writer port
        ▼
  PrismaEliminarMovimientoManualRepository
        deleteMany({ id, origen:'Manual', account:{ userId } })
        count === 0 ──> TransaccionNoEncontradaError (merged 404)
        count === 1 ──> 204
```

## Architecture Decisions

### D-01 — Backend triad mirrors `EliminarIngesta`, minus the `$transaction`

| Element | Shape |
|---|---|
| Port | `application/ports/eliminar-movimiento-manual.port.ts` — `IEliminarMovimientoManualWriter.eliminarManual(userId, transaccionId): Promise<Result<void, TransaccionNoEncontradaError>>` + `ELIMINAR_MOVIMIENTO_MANUAL_WRITER` token. ISP-narrow, NOT an extension of `ITransaccionRepository`. |
| Use case | `application/use-cases/eliminar-movimiento-manual.use-case.ts` — demo gate FIRST (`if (input.esDemo) return Result.fail(new MovimientoDemoSoloLecturaError())`), then writer, then `logger.debug` with `{ transaccionId, eliminado }` only (no montos — ADR-013/033). Error union `MovimientoDemoSoloLecturaError \| TransaccionNoEncontradaError`. |
| Repository | `infrastructure/persistence/prisma-eliminar-movimiento-manual.repository.ts` — single `deleteMany({ where: { id, origen: 'Manual', account: { userId } } })`. **No `$transaction`** (leaf row, no cascade — unlike `EliminarIngesta`, which needs children-first under FK `Restrict`). `count === 0` → `Result.fail(TransaccionNoEncontradaError)`. No try/catch: infra faults propagate to `errorMiddleware` → 500. |
| Domain error | `domain/errors/movimiento-demo-solo-lectura.error.ts` — 4th per-domain sibling, deliberately NOT a shared base class (see `IngestaDemoSoloLecturaError`'s docstring, issue #507). Copy matches the sibling register: *"Los movimientos de la cuenta demo son de solo lectura. Creá una cuenta para registrar y eliminar los tuyos."* |
| Reuse | `TransaccionNoEncontradaError` verbatim — its docstring already states the merged-case anti-enumeration contract. |
| Composition | `container.ts`: `eliminarMovimientoManual` field + `new EliminarMovimientoManualUseCase(new PrismaEliminarMovimientoManualRepository(prisma), logger)` inline (no `crear-*` helper — the graph is 2 nodes; `crear-*` exists only for multi-adapter use cases). |

**Rationale**: the `deleteMany`-count-as-ownership-gate idiom is already hardened through
US-018 + the US-004 review round. The `origen: 'Manual'` clause is airtight against
cartola rows *by construction* while the ADR-039 CHECK holds — not by application
discipline. **Rejected**: a read-then-delete (`findFirst` + `delete`) — TOCTOU window plus
it produces a distinguishable "exists but not manual" branch, i.e. a provenance oracle.

### D-01b — Route handler: sibling function, `responderErrorTraducido` chokepoint

`registrarEliminarMovimientoManual(router, useCase)` in `routes/movimientos.routes.ts`
(same D-12/T-19 sibling pattern as `registrarMovimientos` / `registrarMovimientoManual`),
registering `router.delete('/movimientos/:id', ...)`. Maps
`MovimientoDemoSoloLecturaError` → 403 `{ code: 'DEMO_SOLO_LECTURA' }`,
`TransaccionNoEncontradaError` → 404 *"El movimiento no existe o no pertenece al usuario
autenticado."*, exhaustive `never` guard → 500, success → `res.status(204).send()`.

This handler uses `responderErrorTraducido` while its two GET/POST siblings in the same
file do not — **deliberate**: `responderErrorTraducido` is the chokepoint that fires
`logDemoGateTrip(req.path)` for `DEMO_SOLO_LECTURA` (issue #507), which DEL-03 requires.

**Contract (ADR-011)**: new `schemas/movimiento-delete.schema.ts` exporting
`movimientoDeletePathParamsSchema` (transport-only, `id: z.string()`), mirroring
`ingesta-delete.schema.ts`; new `eliminarMovimientoManualOperation` **appended** to the
fixed-order `paths` map in `openapi-document.ts` under the existing
`'/api/movimientos'` entry as `delete:` (204/401/403/404). Never reorder existing entries
— the order is part of the `openapi:check` determinism contract.

### D-02 — RESOLVED: the gasto side does **not** carry the origen signal; extend the DTO

**Verification (the proposal's UNCONFIRMED risk 2, now closed):**

| Layer | Carries origen? |
|---|---|
| `DetalleBucketRow` (`ports/detalle-bucket.port.ts:26`) | ✅ `banco: string` (from `account.banco`) |
| `TransaccionDetalleBucketMes` (`services/agrupar-detalle-por-categoria.ts:13`) | ❌ **stripped here** — `recortarTransaccion` projects only `{id, fecha, descripcion, monto}` (gate PR1 / MBD-08) |
| `DetalleBucketMesDto` | ❌ absent from the TYPE; the Zod `transaccionDetalleMesSchema` is `.strict()` ⇒ `additionalProperties: false` on the wire |
| `detalle-bucket-mes-view-model.ts` (web) | ❌ absent |

So the brief's option "presentation-only derivation client-side from `banco === 'Manual'`"
is **not available**: `banco` never reaches the gasto client at all.

**Chosen**: add `origen: string` to the gasto transaction projection — a verbatim mirror of
the ingresos field, same derivation `fila.banco || 'Manual'`, same wire name. Touch points:
`agrupar-detalle-por-categoria.ts` (`recortarTransaccion` + its interface),
`detalle-bucket-mes.dto.ts`, `bucket-detalle-mes.schema.ts` (inside `.strict()`),
`pnpm contract:sync`, `detalle-bucket-mes-view-model.ts`.

**Rationale**: MBD-08 stripped `banco`/`tipoCuenta`/`numeroCuenta` as one bundle, but the
*later and narrower* US-052 ruling (MID-02/MID-06) explicitly kept the bank name on the
wire as `origen` while removing only `tipoCuenta`/`numeroCuenta` — bank name for the
caller's own rows is already sanctioned wire data. Mirroring the existing field keeps ONE
wire concept and ONE client predicate for manual-ness across both surfaces.

**Rejected**: `esManual: boolean`. Cheaper on PII posture and more ADR-024-pure (server
states the fact), but it creates two competing wire encodings of the same underlying truth
— gastos would use a boolean while ingresos uses a string compare — and the asymmetry
would have to be re-explained at every future reader.
**Rejected**: incomes-only shipping (proposal question 2) — a half capability
("why can I remove this manual income but not this manual grocery run?").

**Duplication note (DRY, 2nd occurrence)**: `origen: fila.banco || 'Manual'` will exist in
`obtener-ingresos-mes.use-case.ts` **and** `agrupar-detalle-por-categoria.ts`. Per the house
rule (annotate at 2, extract at 3), do **not** extract yet — add a cross-reference comment
in both. Blast radius: the shared `IDetalleBucketReader` already supplies `banco`, so both
derivations read the same source field.

**Contract regeneration correction**: the proposal states "no generated client to
regenerate (ADR-012 deferred)". That is **stale**. `packages/api-client` exists as a
type-only generated package (`openapi-typescript` → `src/types.gen.ts`), and
`apps/web/src/api/types.ts` re-exports `TransaccionDetalleBucketMesDto` from it. The DTO
change therefore requires `pnpm contract:sync` (= `openapi:emit` + `api-client generate`),
not just `openapi:emit`.

### D-03 — ONE shared web control, pre-formatted props (EliminarIngestaControl error semantics)

`apps/web/src/components/EliminarMovimientoControl.tsx`, props
`{ id, fechaLabel, descripcion, montoLabel, esDemo?, onEliminado? }`.

**Rationale**: the row *shapes* differ (`<tr>` cells vs `<li>` card) but the *control* does
not — trigger + `InlineConfirm` + mutation. The row-shape difference is absorbed by the
existing `EliminarIngestaControl` idiom of **pre-formatted label props**: the ingresos
view-model already yields `fechaLabel` (`aFechaCorta`), while the gasto view-model keeps
`fecha` verbatim ISO (WDM-03) — so `GrupoMovimientos` formats at the call site rather than
the control learning two date shapes. Two controls would duplicate the InlineConfirm wiring,
the per-row `aria-label`, the demo gate and the error semantics for zero gain.

**Error handling — follow `EliminarIngestaControl`, not `ReclasificarCategoriaControl`**:
the dialog **stays open** on error with `role="alert"` and Confirmar still available.
Mandated by spec WEB-DEL-01 and correct for a destructive action: reopening would force the
user to re-read the impact statement. `ReclasificarCategoriaControl` closes/resets on error
because a failed reclassify leaves a still-valid row and the user may pick a different
target; a failed delete has exactly one sensible next action — retry.

**Accessibility / lifecycle**: per-row `aria-label` (`Eliminar movimiento {descripcion}
({fechaLabel})`); success announced by the **parent**, because the control unmounts with its
row. `BucketDetalleMesPage` already owns a page-level `role="status"` region (`anuncio`,
D-07) — reuse it (`Movimiento eliminado.`). `IngresosMesPage` has none: add one
page-level `<p role="status">` sibling above the table, same pattern.

**Demo**: `esDemo` disables the trigger (UI honesty; the server gate is the real one),
threaded from `_authenticated` route context exactly as `RegistrarMovimientoForm` does.

**Client fn + hook**: `deleteMovimiento(id)` in `api/movimientos.ts` following
`postMovimientoManual`'s never-throw `ApiResult` shape and `deleteIngesta`'s status map
(401 → `unauthorized`, 404 → `server`+404 with *"El movimiento ya no existe. La lista se
actualizará."*, else `server`, network throw → `network`, 204 → `ok`).
`use-eliminar-movimiento.ts` invalidates the SAME 4 keys `use-registrar-movimiento.ts`
already invalidates — `resumen`, `resumen-anual`, `detalle-bucket-mes`, `ingresos-mes` — via
a new `invalidarCachesMovimiento(qc)` helper in `api/movimientos-invalidacion.ts`, mirroring
`invalidarCachesIngesta`. This is the **3rd occurrence** of that exact key set
(`use-registrar-movimiento`, `categorias-invalidacion`, now delete), so the DRY threshold is
genuinely met; scope the extraction to the two *movement* hooks and leave
`categorias-invalidacion.ts` alone (it carries an extra `categorias` key and its own tested
contract). A 404 invalidates only the two list keys (stale row, not a failure) — same
reasoning as `useEliminarIngesta`'s 404 branch.

### D-04 — `MENSAJE_PERMANENCIA` rewrite

New copy (neutral tuteo, calm register, accurate post-change):

> **"Un movimiento registrado no se puede editar, pero puedes eliminarlo desde el detalle
> del mes y registrarlo de nuevo; su categoría también puede reclasificarse desde el
> dashboard."**

Accurate on all three counts: no-edit still true (ADR-040 rule 3), delete now exists and is
located, reclassify unchanged. It deliberately does **not** mention cartola-born rows — this
form only ever creates manual movements, and the contrast would be noise at the moment of
confirmation.

**Placement**: keep the constant module-local in `RegistrarMovimientoForm.tsx` but **export**
it so a unit test can pin the exact string; both render sites (the `role="note"` and the
`InlineConfirm` body) keep consuming the single constant. **Rejected**: moving it to a shared
`copy.ts` — one consumer file today; the 2nd consumer (a future mobile registration form)
is the extraction trigger (YAGNI, deuda con gatillo).

### D-05 — Test architecture (ADR-015 layering)

| Layer | File | Asserts |
|---|---|---|
| Unit — use case | `eliminar-movimiento-manual.use-case.spec.ts` | demo gate short-circuits: writer double **never called**; writer failure → `TransaccionNoEncontradaError` passthrough; logger receives no montos |
| Unit — repository | `prisma-eliminar-movimiento-manual.repository.spec.ts` | `deleteMany` called with the **exact** `{ id, origen: 'Manual', account: { userId } }` WHERE; `count: 0` → fail; no `$transaction` call |
| Unit — route | `movimientos.routes.spec.ts` (extend) | 204 / 403 `DEMO_SOLO_LECTURA` / 404 message shape; `req.userId` sourced from session, never body |
| Unit — contract sync | `bucket-detalle-mes.schema.spec.ts` (extend) | mapper output still parses under `.strict()` with the new `origen` key |
| Unit — application | `agrupar-detalle-por-categoria.spec.ts`, `obtener-detalle-bucket-mes.use-case.spec.ts` | `origen` = banco verbatim; empty banco → `'Manual'` (mirrors the ingresos dead-code branch test) |
| Unit — web | `EliminarMovimientoControl.test.tsx`, `IngresosMesTable.test.tsx`, `GrupoMovimientos.test.tsx`, `RegistrarMovimientoForm.test.tsx` | control renders on manual rows only, both surfaces; dialog discloses fecha/monto/descripcion; **error keeps dialog open**; demo disables; parent live region announces; `MENSAJE_PERMANENCIA` pinned + present at both sites |
| **Integration** | **`test/eliminar-movimiento-manual.int-spec.ts` (new)** | **DEL-05 + DEL-02**: cross-user attempt → 404 **and victim row still in DB**; own ingesta-born row → 404 **and row still in DB**; absent id → 404; repeat delete → 404; all three 404 bodies byte-identical; happy path → 204 + row gone + `GET /api/resumen` reflects it; **DEL-03** demo session → 403 + row untouched |

**Fixture strategy**: follow `registro-manual.int-spec.ts` / `ingesta-demo-gate.int-spec.ts`
(full HTTP stack: `createApp(createContainer(env, prisma), env)` + `supertest` + `x-api-key`
+ `crearSesionParaUsuario` from `test/support/session.fixture.ts`), **not** the
repository-only shape of `eliminar-ingesta.int-spec.ts` — DEL-02 asserts *response body
identity across three cases* and DEL-03 needs the real session/demo path, neither of which a
repository-level harness can observe. Per-run `RUN_ID`-suffixed users A/B, own sentinel
`Account(banco='Manual')` rows created directly via Prisma, `afterAll` cleanup scoped by
`userId`. Requires the local ephemeral Postgres (`ALLOW_DESTRUCTIVE_DB=1`, ADR-029).

**Why these two negatives cannot be unit tests**: a mocked Prisma proves the WHERE clause we
*wrote*; only a real DB proves the row **survived**. That is the entire safety story of this
change (proposal risks 3/4).

### D-06 — ADR-040 placement

Confirmed: `docs/adr/ADR-040-correccion-de-movimientos-manuales.md`, authored in the
**implementing PR** (house convention, `docs/adr/README.md`: *"se revisan en el PR que las
implementa"*), Spanish, text per proposal §6. Same PR adds the ADR-040 row to
`docs/adr/README.md` and the ADR-039 amendment note, following the ADR-026/038/039 row style.
Number 040 verified free.

## File Changes

| File | Action |
|---|---|
| `apps/api/src/domain/errors/movimiento-demo-solo-lectura.error.ts` | Create |
| `apps/api/src/application/ports/eliminar-movimiento-manual.port.ts` | Create |
| `apps/api/src/application/use-cases/eliminar-movimiento-manual.use-case.ts` | Create |
| `apps/api/src/infrastructure/persistence/prisma-eliminar-movimiento-manual.repository.ts` | Create |
| `apps/api/src/infrastructure/http-express/schemas/movimiento-delete.schema.ts` | Create |
| `apps/api/src/infrastructure/http-express/routes/movimientos.routes.ts` | Modify — sibling DELETE handler |
| `apps/api/src/infrastructure/http-express/schemas/openapi-document.ts` | Modify — append `delete:` under `/api/movimientos` |
| `apps/api/src/composition/container.ts`, `.../http-express/app.ts` | Modify — wire + register |
| `apps/api/src/application/services/agrupar-detalle-por-categoria.ts` | Modify — `origen` in projection (D-02) |
| `apps/api/src/infrastructure/http/dto/detalle-bucket-mes.dto.ts` | Modify — `origen` in DTO + mapper |
| `apps/api/src/infrastructure/http-express/schemas/bucket-detalle-mes.schema.ts` | Modify — `origen` inside `.strict()` |
| `apps/api/openapi.json`, `packages/api-client/src/types.gen.ts` | Regenerate — `pnpm contract:sync` |
| `apps/web/src/domain/detalle-bucket-mes-view-model.ts` | Modify — carry `origen` |
| `apps/web/src/components/EliminarMovimientoControl.tsx` | Create |
| `apps/web/src/api/movimientos.ts`, `use-eliminar-movimiento.ts`, `movimientos-invalidacion.ts` | Create/Modify |
| `apps/web/src/components/IngresosMesTable.tsx`, `IngresosMesPage.tsx`, `GrupoMovimientos.tsx`, `BucketDetalleMesPage.tsx` | Modify — control + live region |
| `apps/web/src/components/RegistrarMovimientoForm.tsx` | Modify — D-04 copy, export constant |
| `apps/api/test/eliminar-movimiento-manual.int-spec.ts` | Create |
| `docs/adr/ADR-040-correccion-de-movimientos-manuales.md`, `docs/adr/README.md` | Create/Modify |

## Migration / Rollout

**No migration required.** No schema change, no data backfill, no feature flag. `origen` and
the ADR-039 CHECK already exist. Rollback = revert the commits; no down-migration, no data
becomes inaccessible.

## Open Questions

- [ ] None blocking. The proposal's UNCONFIRMED gasto-side signal is resolved in D-02.
- [ ] Product questions from proposal §7 (delete-vs-edit verb, copy register) remain open for
      the owner but do not block implementation — D-04 answers the copy with the house's
      "calm + accurate" default.
