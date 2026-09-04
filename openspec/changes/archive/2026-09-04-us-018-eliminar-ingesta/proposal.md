# Proposal — US-018: Eliminar ingesta (hard cascade delete)

**Change:** `us-018-eliminar-ingesta` · **Store:** hybrid · **Scope:** `apps/api` + `apps/web` (backend rich, thin web client — ADR-024)

---

## 1. Why / problem

US-018 is the **last functional item of the original MVP checklist** (closes RN-MET-002 for
the data-management epic). Today the ingesta pipeline is write-only: a user can upload a
cartola (`POST /api/ingestas`) but has **no way to remove one**. When a user uploads a wrong
file or the same cartola twice, the mistaken transactions permanently pollute every derived
money view — the 50/30/20 resumen, the semáforo, the annual grid — with no recourse.

The user needs to **delete a mistaken/duplicate ingesta** and have all money views
**recalculate to reflect reality** on the next read. Because the resumen and semáforo are
**derived on read** (`CalcularResumenMesUseCase` reads live rows), no recompute machinery is
needed: removing the rows is sufficient — the next `GET /api/resumen` reflects the deletion.

## 2. Scope — IN

| # | Item | Where |
|---|------|-------|
| a | `DELETE /api/ingestas/:id` — hard cascade delete (ingesta + its `Transaccion` rows) in **one atomic DB transaction**, `userId`-isolated | `apps/api/src/infrastructure/http-express/routes/ingesta.routes.ts` (+ use case, repo port/adapter, domain error) |
| b | **Prerequisite** `GET /api/ingestas` — list endpoint returning `{ id, banco, fecha, totalTransacciones }` per row, scoped by `userId` (there is NO list endpoint today — a delete button needs a surface to live on) | same route file + new list use case + repo method |
| c | Web listing UI + **accessible confirmation modal** showing the impact count ("N transacciones serán eliminadas") | `apps/web/src/components/` + `apps/web/src/api/` |
| d | Cache invalidation of derived money views on delete success (`['resumen']`, `['resumen-anual']`, `['detalle-bucket']`, `['ingestas']`) | new `use-eliminar-ingesta.ts` hook `onSuccess` |

**Scope-growth note (surfaced explicitly for PO):** item (b) is **not** in the original US-018
one-liner. There is no ingesta-listing endpoint or UI today (only upload). A delete action is
meaningless without a place to trigger it, so this change **must bundle a minimal list
endpoint + listing UI** as a prerequisite. The impact count `totalTransacciones` is **already
persisted** at commit time (`prisma-ingesta.repository.ts` `commit()`), so the list returns it
at **zero extra query cost** — no `COUNT(*)`.

## 3. Scope — OUT (non-goals)

- **Re-procesar / re-subir** a deleted ingesta (user just uploads again — existing flow).
- **Undo / trash / soft delete** — hard delete only, per PO decision.
- **Export-before-delete** or any backup step.
- **Mobile / CLI delete** — web only. Mobile stays read-only for deletion (ADR-010/026 unaffected).
- **Column encryption 11.6 / CryptoService** — does **not** apply: this change adds **no new PII
  surface** (list returns bank name + date + count, not descriptions/RUT). No change to the
  accepted-risk trigger in `docs/mobile-launch-runbook.md`.
- **Batch / multi-select delete** — single ingesta per action (YAGNI; no requirement today).

## 4. Recommended technical approach

**Keep the schema `onDelete: Restrict` default — NO migration.** Delete children explicitly at
the application layer inside an atomic `prisma.$transaction`, mirroring the existing
`PrismaIngestaRepository.commit()` precedent (array-form `$transaction`). This keeps cascade
semantics **visible and testable in application code** (KISS/SOLID conventions of this repo)
and avoids a blanket schema-level cascade that could silently delete transacciones from
unrelated FKs added to `Ingesta` in the future (YAGNI risk of the schema-cascade alternative).

**Resolves exploration open question #1** (schema `onDelete: Cascade` vs app-level explicit
delete): **choose app-level explicit `$transaction`.**

**Ownership gate — anti-enumeration single gate (mirrors reclassify precedent):**
both statements are **`userId`-scoped**, and the **parent delete count is the single gate**:

1. `deleteMany` on `Transaccion` where `{ ingestaId: id, ingesta: { account: { userId } } }`
   — scoped so a non-owned id deletes **zero** child rows (no cross-tenant leak).
2. `deleteMany` (or `delete`) on `Ingesta` where `{ id, account: { userId } }` — its count is
   the ownership gate.
3. Both wrapped in one `prisma.$transaction([...])`. If the parent delete affected **0 rows**
   → repository returns a merged **"not found OR not owned"** domain error →
   **404** at the route (anti-enumeration: same 404 for foreign id and nonexistent id,
   mirroring `prisma-reclasificar-categoria.repository.ts` `count === 0`).

> Sequencing detail (flag for design): with `Restrict` the child `deleteMany` **must run before**
> the parent delete. Because both statements are ownership-scoped, a non-owned id deletes
> nothing and the transaction commits harmlessly with parent count 0 → 404. If the design
> prefers a clean pre-check branch, the **interactive callback form** of `$transaction` is an
> acceptable equivalent — array-form + inspect-parent-count is the repo precedent.

**New domain error:** `apps/api/src/domain/errors/ingesta-no-encontrada.error.ts` (Spanish,
domain layer — follows `transaccion-no-encontrada.error.ts`). Use cases return `Result.fail`,
never throw (repo convention).

**Files (concrete):**
- Domain: `apps/api/src/domain/errors/ingesta-no-encontrada.error.ts` (new)
- Application: new `eliminar-ingesta.use-case.ts` + `listar-ingestas.use-case.ts` + ports
  (`IEliminarIngestaPort` / extend an ingesta-query port — ISP: keep small, per-role)
- Infrastructure: extend `apps/api/src/infrastructure/persistence/prisma-ingesta.repository.ts`
  with `eliminarConTransacciones({ id, userId })` + `listarPorUsuario(userId)`; routes in
  `apps/api/src/infrastructure/http-express/routes/ingesta.routes.ts` (`registrarIngestas`
  gains DELETE + GET); wiring in `apps/api/src/composition/container.ts` /
  `crear-process-ingesta.ts` neighborhood.
- Web: `IngestaListItemDto` in `apps/web/src/api/types.ts` (hand-written, ADR-011/012 debt);
  `use-ingestas.ts` (list query) + `use-eliminar-ingesta.ts` (delete mutation) hooks; listing
  component + confirm modal mirroring `apps/web/src/components/ReclasificarCategoriaControl.tsx`
  (`role="alertdialog"`, focus to Confirm on open, Escape cancels, focus returned on cancel).

## 5. Slicing recommendation (for sdd-tasks)

Two logical slices; **chained PRs recommended** — combined diff (backend list+delete +
migration-free repo work + web list UI + modal + hooks + tests) will likely **exceed the
400-line budget**, and the split is clean (backend contract lands first, web consumes it).

- **Slice 1 — Backend (`DELETE` + `GET /api/ingestas`):** domain error, list + delete use
  cases, ports, repo methods (`$transaction` cascade), route wiring, DTO. **Mandatory
  integration test** for two-user isolation (RNF-SEC-006) mirroring
  `apps/api/test/reclasificar-categoria.int-spec.ts`. Real-fixture verification per DoD.
- **Slice 2 — Web (list UI + confirm modal + delete hook):** listing view, accessible
  `alertdialog` with impact count, `use-ingestas.ts` / `use-eliminar-ingesta.ts`, cache
  invalidation of derived views. Nav entry alongside "Subir nuevo archivo".

Delivery: **feature-branch-chain** or **stacked-to-main** — orchestrator/PO decides at
tasks-phase per cached `delivery_strategy` / `chain_strategy`.

## 6. Risks & dependencies

- **FK `Restrict` (known):** handled by the explicit ordered child-then-parent delete inside
  `$transaction`. No migration. **Primary implementation risk = statement ordering** inside the
  array-form transaction — call out in design.md.
- **Integration test needs local disposable Postgres** (pre-existing debt, same as ADR-028):
  `assertDestructiveDbAllowed` requires `ALLOW_DESTRUCTIVE_DB=1` + non-prod URL. The isolation
  int-test **may not run until a local Postgres is provisioned** (`apps/api/docs/local-test-db.md`).
  Flag: the test is **written** in Slice 1 but its green run is gated on DB provisioning — do
  not let this silently skip RNF-SEC-006 coverage.
- **`totalTransacciones` as free impact count** holds only because no endpoint mutates a
  ingesta's transaction **row count** today (reclassify changes categoría/bucket, never adds/
  removes rows). If that invariant ever changes, the count could drift — note in design.md.
- **DoD:** requires real-fixture verification (upload a real fixture ingesta, delete it, confirm
  resumen recalculates) before the US is closed.
- **No new PII / encryption trigger untouched** — confirms 11.6 stays out of scope.

## 7. Acceptance criteria (BDD, executable)

```
AC-1 Cascade delete (happy path)
  Given an authenticated user who owns ingesta I with N Transaccion rows
  When they DELETE /api/ingestas/I
  Then the response is 200/204
  And ingesta I and all N of its Transaccion rows no longer exist
  And a subsequent GET /api/resumen for the affected period recalculates without those rows

AC-2 Isolation — foreign ingesta (RNF-SEC-006, anti-enumeration)
  Given user A and user B, and ingesta I owned by user B
  When user A calls DELETE /api/ingestas/I
  Then the response is 404 (identical to a nonexistent id)
  And ingesta I and all of user B's Transaccion rows remain intact

AC-3 Nonexistent ingesta
  Given an authenticated user and an id that does not exist
  When they DELETE /api/ingestas/that-id
  Then the response is 404 (same shape as AC-2 — no existence disclosure)

AC-4 Atomicity
  Given a delete that fails partway (simulated DB error)
  Then neither the ingesta nor any of its Transaccion rows are deleted (all-or-nothing)

AC-5 List + impact count
  Given an authenticated user with ingestas
  When they GET /api/ingestas
  Then each row returns id, banco, fecha and totalTransacciones
  And only the calling user's ingestas are returned (scoped by userId)

AC-6 Confirmation modal (web)
  Given the user clicks delete on an ingesta with N transactions
  Then an accessible alertdialog opens stating "N transacciones serán eliminadas"
  And Escape / Cancelar closes it without deleting and returns focus to the trigger
  And Confirmar issues the DELETE and, on success, refreshes the list and money views
```
