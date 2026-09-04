# Design — US-018 Eliminar Ingesta

> SDD design phase for change `us-018-eliminar-ingesta`. Architectural HOW, not
> task steps. Confirmed big rocks come from the proposal
> (`sdd/us-018-eliminar-ingesta/proposal`); this document designs the details
> and locks the one non-obvious correctness decision.

## 1. Scope recap (from proposal)

- `DELETE /api/ingestas/:id` — hard, atomic cascade delete of an `Ingesta` and
  its `Transaccion` rows. `userId`-isolated. 204 on success, 404 on the merged
  "not found OR not owned" gate (anti-enumeration).
- Prerequisite `GET /api/ingestas` — list the caller's ingestas
  `{ id, banco, fecha, totalTransacciones }`, powered by the already-persisted
  `Ingesta.totalTransacciones` (no extra COUNT query).
- Web-only listing UI + accessible confirm modal showing the impact count.
- NO schema migration: `onDelete: Restrict` stays; the cascade is explicit and
  visible in application code.

Verified against the codebase (not assumed):
- `Transaccion.ingesta` relation declares **no** `onDelete` ⇒ Postgres default
  `Restrict` (schema.prisma:112). Deleting an `Ingesta` with child rows fails at
  the DB today — children MUST be deleted first.
- Ownership path is `Ingesta.accountId → Account.userId` — `Ingesta` has **no**
  direct `userId` column (schema.prisma:52-69).
- No `TransaccionClasificacion` join table — categorization is inline
  (`Transaccion.categoriaId` / `bucketId`). Cascade is exactly two tables:
  `Transaccion` then `Ingesta`.
- `Ingesta.totalTransacciones` is `Int?`, written at `commit()` time
  (prisma-ingesta.repository.ts:73) — free impact count.

## 2. Architecture approach

Clean Architecture, dependency rule `domain ← application ← infrastructure`
(ADR-005). Mirror the existing **reclasificar** vertical slice exactly — it is
the closest analog (isolation gate + anti-enumeration 404 + narrow write port +
Prisma `*Many` count-based gate).

Two independent capabilities, each its own narrow port (SOLID/ISP), each its own
Prisma adapter (SRP), each its own thin use case:

| Capability | Port (application) | Adapter (infrastructure) | Use case |
|---|---|---|---|
| Delete cascade | `IEliminarIngestaWriter` | `PrismaEliminarIngestaRepository` | `EliminarIngestaUseCase` |
| List | `IListarIngestasReader` | `PrismaListarIngestasReader` | `ListarIngestasUseCase` |

**ISP decision (rejected alternative):** do NOT extend the existing
`IIngestaRepository` (`createPending`/`commit`/`markFailed`) with delete/list.
That port is the write-side aggregate root consumed by
`PersistTransactionsUseCase`, which has no business knowing about listing or
deletion. Fattening it would force that consumer to depend on methods it never
calls. New narrow ports mirror `IReclasificarCategoriaWriter`, which is a
separate port with its own separate `PrismaReclasificarCategoriaRepository` — not
bolted onto the ingesta write repo. Same reasoning for two separate Prisma
classes: each stays cohesive.

New domain error `IngestaNoEncontradaError` mirrors
`TransaccionNoEncontradaError` (same anti-enumeration doc + single-error merge).

## 3. THE key correctness decision — child-deleteMany isolation under `Restrict`

This is the one place a naive implementation silently corrupts another user's
money data. It is the reason this design exists.

### 3.1 The atomic operation

Array-form `$transaction`, mirroring `PrismaIngestaRepository.commit()`
(prisma-ingesta.repository.ts:67). Two `deleteMany` statements, children first
(mandatory under `Restrict`), **both `userId`-scoped**:

```
const [, parent] = await prisma.$transaction([
  // (1) children FIRST — REQUIRED under FK Restrict
  prisma.transaccion.deleteMany({
    where: { ingestaId, ingesta: { account: { userId } } },
  }),
  // (2) parent — its count IS the ownership gate
  prisma.ingesta.deleteMany({
    where: { id: ingestaId, account: { userId } },
  }),
]);

if (parent.count === 0) {
  return Result.fail(new IngestaNoEncontradaError(ingestaId)); // → 404
}
return Result.ok(undefined); // → 204
```

`deleteMany` (not `delete`) for the parent: `delete` throws on miss; `deleteMany`
returns `{ count: 0 }` — a count-based gate, no throw, indistinguishable from
"not found" (anti-enumeration). Identical shape to reclasificar's `updateMany`
count gate.

### 3.2 Why the child deleteMany MUST also be userId-scoped (the subtlety)

Consider the tempting simpler child clause `where: { ingestaId }` (not
userId-scoped), relying on the parent delete's `count === 0` for the gate.

Attacker `userId = A` sends `DELETE /api/ingestas/{X}` where `X` belongs to
`userId = B`:

- Statement (1) `deleteMany({ where: { ingestaId: X } })` → **deletes ALL of
  user B's transacciones for ingesta X.** Damage done.
- Statement (2) `deleteMany({ where: { id: X, account: { userId: A } } })` →
  `count === 0`.
- `count === 0` is a **successful** deleteMany, **not** a transaction error — so
  the `$transaction` **commits**. We then read `count === 0` and return 404 to
  the attacker.

Result: attacker gets a clean 404, and user B has lost all transacciones of an
ingesta while the orphaned `Ingesta` row (with `totalTransacciones = N`) stays —
silently corrupting user B's resumen / semáforo / annual grid. This is a
**RNF-SEC-006 cross-tenant isolation breach plus data loss**, and it passes any
test that only checks the attacker's HTTP status.

**Fix (locked):** scope the child deleteMany to the parent's owner via the
relation — `where: { ingestaId, ingesta: { account: { userId } } }`.

Re-run the attacker case with the scoped clause:
- (1) no `Transaccion` matches (ingesta X's `account.userId` is B ≠ A) → deletes
  **0** children. User B untouched.
- (2) `count === 0` → 404.

Owner case (A deletes own X):
- (1) all N children match → deleted.
- (2) `count === 1` → 204.

Both statements gated by the same `userId` traversal, inside one atomic tx: there
is no interleaving where children die but the parent survives, and no path where a
non-owner touches any row. The parent `count` is the sole 404 signal.

**Scoping-path choice:** `Transaccion` also has its own `account` relation, so
`where: { ingestaId, account: { userId } }` would also work (and matches
reclasificar's `account: { userId }`). I choose `ingesta: { account: { userId } }`
because it ties the child deletion to the **parent being gated** rather than to
the child's own denormalized `accountId` — the two are equal today, but keying
off the parent is the semantically precise "delete children of this ingesta only
if this ingesta is yours." Note the equivalent as acceptable in review.

### 3.3 Array form vs interactive-callback form

Array form chosen (KISS + repo precedent `commit()`):
- Under `Restrict` you cannot delete the parent first, so the callback form buys
  no "verify ownership before touching children" capability here.
- With both statements userId-scoped, a non-owner deletes 0 children AND 0 parent
  — there is nothing to conditionally roll back. `count === 0` ⇒ nothing happened.
- The array form returns `[{count}, {count}]`, so `result[1].count` is directly
  readable as the gate.

Rejected: interactive `$transaction(async tx => …)` — extra ceremony, no added
safety for this operation.

### 3.4 Error channel

Mirror the reclasificar repo: **do not** wrap infra exceptions in the repo. The
port's error type is only the domain `IngestaNoEncontradaError` (the
`count === 0` case). A DB failure throws out of the repo, propagates through the
route's `catch (err) { next(err) }` to `errorMiddleware` → 500. This keeps the
Result error channel narrow (one domain error), consistent with
`PrismaReclasificarCategoriaRepository.reasignar`.

## 4. Application layer — ports & use cases

### 4.1 `apps/api/src/application/ports/eliminar-ingesta.port.ts` (new)

```ts
export interface IEliminarIngestaWriter {
  // Isolation (RNF-SEC-006) lives in the WHERE clause, never in app layer.
  // count===0 (missing OR not owned) → Result.fail(IngestaNoEncontradaError).
  eliminarConTransacciones(
    userId: string,
    ingestaId: string,
  ): Promise<Result<void, IngestaNoEncontradaError>>;
}
export const ELIMINAR_INGESTA_WRITER = 'IEliminarIngestaWriter';
```

### 4.2 `apps/api/src/application/ports/listar-ingestas.port.ts` (new)

```ts
export interface IngestaResumen {
  readonly id: string;
  readonly banco: string;
  readonly fecha: Date;            // Ingesta.creadoEn
  readonly totalTransacciones: number;
}
export interface IListarIngestasReader {
  listarPorUsuario(userId: string): Promise<IngestaResumen[]>;
}
export const LISTAR_INGESTAS_READER = 'IListarIngestasReader';
```

`IngestaResumen` is an application read model, colocated in the port file (same
convention as `ReclasificarCategoriaResult`). `fecha` is a `Date`; the HTTP DTO
serializes to ISO string at the boundary.

### 4.3 `apps/api/src/application/use-cases/eliminar-ingesta.use-case.ts` (new)

```ts
export class EliminarIngestaUseCase {
  constructor(private readonly writer: IEliminarIngestaWriter) {}
  execute(input: { userId: string; ingestaId: string }):
    Promise<Result<void, IngestaNoEncontradaError>> {
    return this.writer.eliminarConTransacciones(input.userId, input.ingestaId);
  }
}
```

Thin, Result-based, never throws a domain error (mirrors
`ReclasificarTransaccionUseCase` minus the category validation step — deletion
has no input to validate beyond the session-supplied `userId` and the path id).

### 4.4 `apps/api/src/application/use-cases/listar-ingestas.use-case.ts` (new)

```ts
export class ListarIngestasUseCase {
  constructor(private readonly reader: IListarIngestasReader) {}
  execute(userId: string): Promise<IngestaResumen[]> {
    return this.reader.listarPorUsuario(userId);
  }
}
```

**Return-type decision:** returns the array directly, NOT `Result<…>`. There is
no domain failure to model — an empty list is a valid success, `userId` is
guaranteed by the session middleware (no validation), and infra errors propagate
as exceptions (same channel as §3.4). Wrapping in `Result<IngestaResumen[], never>`
would be empty ceremony (KISS/YAGNI). This deliberately diverges from the
Result-returning read use cases that DO have a domain error (e.g. resumen's
invalid-period); documenting it so it reads as intentional, not an oversight.

## 5. Infrastructure — persistence adapters

### 5.1 `apps/api/src/infrastructure/persistence/prisma-eliminar-ingesta.repository.ts` (new)

Implements `IEliminarIngestaWriter`. Constructor `(prisma: PrismaClient)` — no
`ICryptoService` (delete touches no money columns). Body is §3.1 verbatim. Does
NOT try/catch infra errors (§3.4).

### 5.2 `apps/api/src/infrastructure/persistence/prisma-listar-ingestas.reader.ts` (new)

Implements `IListarIngestasReader`. Constructor `(prisma: PrismaClient)`.

```ts
const rows = await this.prisma.ingesta.findMany({
  where: { account: { userId }, estado: EstadoIngesta.PROCESADA },
  orderBy: { creadoEn: 'desc' },
  select: { id: true, banco: true, creadoEn: true, totalTransacciones: true },
});
return rows.map((r) => ({
  id: r.id, banco: r.banco, fecha: r.creadoEn,
  totalTransacciones: r.totalTransacciones ?? 0,
}));
```

**`estado: PROCESADA` filter decision:** list only PROCESADA ingestas.
Rationale (YAGNI + product): the US is "remove a wrong/duplicate cartola that
polluted the money views." Only PROCESADA ingestas ever persisted transacciones
and are visible in resumen/semáforo/annual; PENDIENTE/FALLIDA persisted nothing
(FALLIDA's `commit` rolled back), so there is nothing for the user to clean up
there. Bonus: `totalTransacciones` is guaranteed non-null for PROCESADA (set at
commit), so the `?? 0` coalesce is defensive only. Rejected alternative: list all
states — would surface confusing zero-impact rows and expose a nullable count for
no user benefit. `?? 0` retained so a PROCESADA-with-all-duplicates ingesta
(`totalTransacciones === 0`) still lists and deletes cleanly.

Isolation on the read side is structural via `account: { userId }` in the WHERE —
identical to every existing read repo (movimientos-mes, resumen-mes,
detalle-bucket).

## 6. Infrastructure — HTTP layer

### 6.1 `apps/api/src/infrastructure/http-express/routes/ingesta.routes.ts` (extend)

`registrarIngestas` currently takes `(router, processIngesta)`. It now needs
three use cases. Change to a small deps object (readability with 3 deps; mirrors
`registrarAuthPublic`'s deps object):

```ts
interface IngestaRoutesDeps {
  processIngesta: ProcessIngestaUseCase;
  eliminarIngesta: EliminarIngestaUseCase;
  listarIngestas: ListarIngestasUseCase;
}
export function registrarIngestas(router: Router, deps: IngestaRoutesDeps): void
```

New handlers (the existing `POST /ingestas` is unchanged):

**`GET /ingestas`**
```
const ingestas = await deps.listarIngestas.execute(req.userId!);
res.status(200).json({ ingestas: ingestas.map(aIngestaListItemDto) });
```
Wrapped in `{ ingestas: [...] }` (every other endpoint returns an object, not a
bare array — consistency). `userId` from `req.userId!` (guaranteed by
`sessionMiddleware`, the same source the existing POST handler uses).

**`DELETE /ingestas/:id`**
```
const result = await deps.eliminarIngesta.execute({
  userId: req.userId!, ingestaId: req.params.id,
});
if (result.isFail()) {
  const error = result.getError();
  if (error instanceof IngestaNoEncontradaError) {
    res.status(404).json({ message:
      'La cartola no existe o no pertenece al usuario autenticado.' });
    return;
  }
  const _exhaustive: never = error; void _exhaustive;   // exhaustiveness guard
  res.status(500).json({ message: 'Error inesperado' });
  return;
}
res.status(204).send();   // no body
```
Same exhaustive-`never` guard style as `transacciones.routes.ts`. 204 with empty
body (no JSON). Outer `try { … } catch (err) { next(err) }` wraps both handlers so
infra throws reach `errorMiddleware` → 500.

### 6.2 DTO — `apps/api/src/infrastructure/http/dto/ingesta-list.dto.ts` (new)

```ts
export interface IngestaListItemDto {
  id: string;
  banco: string;
  fecha: string;              // ISO-8601 (creadoEn.toISOString())
  totalTransacciones: number; // Int row-count — BigInt-safe, not money
}
export function aIngestaListItemDto(r: IngestaResumen): IngestaListItemDto {
  return { id: r.id, banco: r.banco, fecha: r.fecha.toISOString(),
           totalTransacciones: r.totalTransacciones };
}
```
`totalTransacciones` is a **row count**, not money — plain `number`, no
BigInt/`String()` treatment (contrast with cargo/abono DTOs).

### 6.3 Composition — `apps/api/src/composition/container.ts` (extend)

Add two use cases, constructed inline like `reclasificarTransaccion` (NOT inside
`crear-process-ingesta.ts` — these are separate from the ingestion pipeline
graph; that helper stays untouched):

```ts
const eliminarIngesta = new EliminarIngestaUseCase(
  new PrismaEliminarIngestaRepository(prisma),
);
const listarIngestas = new ListarIngestasUseCase(
  new PrismaListarIngestasReader(prisma),
);
```
Add `eliminarIngesta` and `listarIngestas` to the `Container` interface + the
returned object. Update `app.ts`:
```ts
registrarIngestas(protectedApi, {
  processIngesta: container.processIngesta,
  eliminarIngesta: container.eliminarIngesta,
  listarIngestas: container.listarIngestas,
});
```
`registrarIngestas` stays mounted on `protectedApi` (behind
`sessionMiddleware`) — DELETE/GET require a session, same as the existing POST.

### 6.4 Domain error — `apps/api/src/domain/errors/ingesta-no-encontrada.error.ts` (new)

Mirror `TransaccionNoEncontradaError`: message "La cartola no existe o no
pertenece al usuario autenticado.", `readonly ingestaId` for server-side logging
only, same anti-enumeration doc comment.

## 7. Web layer

### 7.1 Data access — `apps/web/src/api/client.ts` (extend)

**`fetchIngestas(): Promise<ApiResult<IngestaListItemDto[]>>`** — GET
`/api/ingestas` same-origin (proxy injects `x-api-key`). Type guard
`esIngestaListItemDto` (id `string`, banco `string`, fecha `string` +
`esFechaValida`, totalTransacciones `typeof === 'number'`). Validate
`body.ingestas` is an array where `.every(esIngestaListItemDto)`. Never throws;
maps to tagged `ApiError` (same discipline as `fetchDetalleBucket`).
`totalTransacciones` is a count — validated with `typeof === 'number'`, NOT
`esMontoStringValido` (not money).

**`deleteIngesta(id: string): Promise<ApiResult<void>>`** — DELETE
`/api/ingestas/:id`.

> **204 gotcha (flag):** a 204 has no body — calling `res.json()` throws. On
> `res.ok` return `{ ok: true, value: undefined }` WITHOUT parsing JSON. Map 401
> → unauthorized, 404 → `{ tag: 'server', status: 404 }` (anti-enumeration; the
> UI shows a generic "already removed" message and refreshes the list), other
> `!res.ok` → server.

### 7.2 Query hooks

- `apps/web/src/api/use-ingestas.ts` — `useIngestas()`:
  `useQuery({ queryKey: ['ingestas'], queryFn: fetchIngestas→unwrap })`, same
  unwrap-or-throw-ApiError pattern as `use-resumen.ts`.
- `apps/web/src/api/use-eliminar-ingesta.ts` — `useEliminarIngesta()`:
  `useMutation<void, ApiError, string>`, `mutationFn` calls `deleteIngesta`,
  throws `result.error` on `!ok`. `onSuccess` invalidates **four** caches:
  ```
  ['resumen'], ['resumen-anual'], ['detalle-bucket'], ['ingestas']
  ```
  (the upload hook `use-ingesta.ts` invalidates only the first three because it
  doesn't mutate the list; deletion also mutates the list, so `['ingestas']` is
  added. There is no `['movimientos']` cache in web — verified, do not invalidate
  a non-existent key.)

### 7.3 Components — mirror `ReclasificarCategoriaControl.tsx` a11y

- `apps/web/src/components/ListaIngestas.tsx` — fetches via `useIngestas()`,
  renders Loading / Error / Empty / list states (same state discipline as the
  existing screens). Each row → `<IngestaItem>` showing banco, formatted `fecha`,
  and `totalTransacciones` ("N movimientos"), plus an `EliminarIngestaControl`.
- `apps/web/src/components/EliminarIngestaControl.tsx` — the per-row delete
  trigger + confirm dialog. Structural clone of `ReclasificarCategoriaControl`'s
  a11y (lines 154-187):
  - "Eliminar" `<button>` is the trigger.
  - On open, a `role="alertdialog"` with `aria-label="Confirmar eliminación"`;
    `useEffect` moves focus to the "Eliminar" (confirm) button (`confirmarRef`).
  - `onKeyDown` Escape → cancel; cancel returns focus to the trigger button
    (`triggerRef`).
  - Dialog body states the impact + irreversibility:
    "Se eliminarán {totalTransacciones} movimientos de {banco}
    ({fecha}). Esta acción no se puede deshacer."
  - Confirm button `disabled={mutacion.isPending}`; on click fires
    `useEliminarIngesta().mutate(id)`.
  - `aria-live="polite"` success announcement + `role="alert"` error message,
    same as the reclasificar control.
  - No full focus-trap (same scoping decision as the reclasificar inline widget).

Reuse, do not re-invent: use the existing `role="alertdialog"` hand-rolled
pattern, NOT a new modal library (KISS, mirrors the explicit "NOT shadcn Dialog"
precedent).

### 7.4 DTO mirror — `apps/web/src/api/types.ts` (extend)

```ts
export interface IngestaListItemDto {
  readonly id: string;
  readonly banco: string;
  readonly fecha: string;             // ISO-8601
  readonly totalTransacciones: number; // row count — safe number, not money
}
```

### 7.5 Route + nav

- New route `apps/web/src/routes/_authenticated/ingestas.tsx` rendering
  `<ListaIngestas />` (under `_authenticated`, same as `/subir`).
- `apps/web/src/components/app-shell/nav-items.ts` — add
  `{ kind: 'link', label: 'Gestionar cartolas', to: '/ingestas', icon: Files }`
  (`Files` from `lucide-react`, ADR-027). The route must exist in
  `routeTree.gen.ts` for `to: '/ingestas'` to typecheck (`NavRoute`).

## 8. Testing design (strict TDD — test-first, project has `strict_tdd`)

### 8.1 Backend unit (mocked PrismaClient — mirror `prisma-ingesta.repository.spec.ts`)

`prisma-eliminar-ingesta.repository.spec.ts`:
- `$transaction = vi.fn().mockResolvedValue([{ count: 3 }, { count: 1 }])`;
  inspect `transaction.mock.calls[0][0]` (the ops array).
- Assert **ordering**: ops array length 2, child `deleteMany` is index 0, parent
  index 1 (children-first under `Restrict`).
- Assert **both where-clauses are userId-scoped** — child
  `{ ingestaId, ingesta: { account: { userId } } }`, parent
  `{ id: ingestaId, account: { userId } }`. This is the mocked-level guard for
  §3.2; the real proof is the integration test.
- `[…, { count: 1 }]` → `Result.ok(undefined)`.
- `[…, { count: 0 }]` → `Result.fail(IngestaNoEncontradaError)`.
- `$transaction` rejects → the error propagates (repo does NOT swallow it) —
  assert it throws (contrast the write repo which wraps; §3.4).

`prisma-listar-ingestas.reader.spec.ts`:
- Mock `findMany`; assert WHERE `{ account: { userId }, estado: 'PROCESADA' }`,
  `orderBy: { creadoEn: 'desc' }`, and the row→`IngestaResumen` mapping
  (including `totalTransacciones ?? 0`).

### 8.2 Backend use-case unit

`eliminar-ingesta.use-case.spec.ts` (pass-through to a stub writer; ok + fail
propagation) and `listar-ingestas.use-case.spec.ts` (pass-through to a stub
reader).

### 8.3 Backend integration — **the key correctness test** (mirror `reclasificar-categoria.int-spec.ts`)

`apps/api/test/eliminar-ingesta.int-spec.ts`, two users A/B, each User→Account→
Ingesta→Transacciones, `RUN_ID` isolation + `afterAll` cleanup. Gate
`assertDestructiveDbAllowed` (`ALLOW_DESTRUCTIVE_DB=1` + non-prod URL) + local
disposable Postgres (`apps/api/docs/local-test-db.md`).

- **ISO (isolation) — catches the §3.2 bug:** user A calls
  `eliminarConTransacciones(A, ingestaB)` → `Result.fail(IngestaNoEncontradaError)`
  AND assert **user B's Ingesta row still exists** AND
  `prisma.transaccion.count({ where: { ingestaId: ingestaB } })` is **unchanged**.
  A naive unscoped child delete passes the 404 assertion but FAILS the "B's
  transacciones unchanged" assertion — this test is the trap.
- **Own delete:** user A deletes own ingesta → `Result.ok`; assert the Ingesta
  row is gone AND its transacciones count is 0.
- **Idempotent double-delete:** second delete of the same id →
  `IngestaNoEncontradaError` (parent count 0) → 404.
- **Empty ingesta:** a PROCESADA ingesta with 0 transacciones deletes cleanly
  (`Result.ok`, 0 children removed, 1 parent removed).

> Same debt posture as ADR-028: written in the backend slice but the **green run
> is gated on provisioning local Postgres** — it must NOT be silently skipped.

### 8.4 Backend route test (fast, stubbed use cases)

Optional supertest/route-level test asserting `DELETE` → 204 on `Result.ok`, 404
on `IngestaNoEncontradaError`, and `GET` → 200 `{ ingestas: [...] }` — using
stubbed use cases, no DB (fast feedback for the HTTP mapping + the 204-empty-body
contract).

### 8.5 Web tests (vitest + Testing Library, jsdom)

- `client` test: `fetchIngestas` type-guard + status mapping; `deleteIngesta`
  **204 handling** (must NOT call `res.json()` on 204), 404/401 mapping.
- `EliminarIngestaControl` component test: opens the `role="alertdialog"` on
  "Eliminar", focus moves to Confirm, Escape cancels + focus returns to trigger,
  Confirm fires the mutation, `onSuccess` invalidates the four query keys, the
  dialog shows the correct impact count.

## 9. Edge cases

| Case | Behavior | Mechanism |
|---|---|---|
| Double-delete (idempotency) | 2nd → 404 | parent `deleteMany` count 0 → `IngestaNoEncontradaError` |
| Empty ingesta (0 tx, PROCESADA) | deletes cleanly, 204 | child deletes 0, parent deletes 1 |
| Partial failure / future FK to `Ingesta` | full rollback, 500, no partial state | array `$transaction` is all-or-nothing; a new `Restrict` FK surfaces as a throw → `errorMiddleware`, NOT a silent cascade (exactly why we keep `Restrict` + explicit deletes) |
| Cross-tenant delete | 404, zero rows touched | §3.2 both statements userId-scoped |
| `totalTransacciones` as impact count | correct today | holds only while no endpoint mutates per-ingesta row count (reclassify never adds/removes rows) — documented assumption |

## 10. Files summary

**Backend (new):** `domain/errors/ingesta-no-encontrada.error.ts` ·
`application/ports/eliminar-ingesta.port.ts` ·
`application/ports/listar-ingestas.port.ts` ·
`application/use-cases/eliminar-ingesta.use-case.ts` (+ spec) ·
`application/use-cases/listar-ingestas.use-case.ts` (+ spec) ·
`infrastructure/persistence/prisma-eliminar-ingesta.repository.ts` (+ spec) ·
`infrastructure/persistence/prisma-listar-ingestas.reader.ts` (+ spec) ·
`infrastructure/http/dto/ingesta-list.dto.ts` · `test/eliminar-ingesta.int-spec.ts`.

**Backend (edit):** `infrastructure/http-express/routes/ingesta.routes.ts` ·
`composition/container.ts` · `infrastructure/http-express/app.ts`.

**Web (new):** `api/use-ingestas.ts` · `api/use-eliminar-ingesta.ts` ·
`components/ListaIngestas.tsx` · `components/EliminarIngestaControl.tsx` ·
`routes/_authenticated/ingestas.tsx` (+ tests).

**Web (edit):** `api/client.ts` · `api/types.ts` ·
`components/app-shell/nav-items.ts`.

**Schema:** none — `onDelete: Restrict` stays, no migration.

## 11. Slicing (informs sdd-tasks; delivery likely chained PRs, combined > 400 LOC)

- **Slice 1 — backend:** domain error, ports, use cases, both Prisma adapters,
  routes (GET + DELETE), composition wiring, unit specs, integration spec
  (green run gated on local Postgres).
- **Slice 2 — web:** client fns, hooks, list + confirm components, route, nav,
  cache invalidation, tests. Consumes Slice 1's contract.

## 12. ADR-style decision log

- **D1 — App-level explicit cascade, keep `Restrict`, no migration.** Cascade
  stays visible/testable in application code; a future FK to `Ingesta` fails
  loudly (500) instead of silently cascade-deleting money rows. Rejected:
  schema-level `onDelete: Cascade` (smaller diff, but invisible/blanket cascade).
  *(confirmed by proposal — recorded for traceability)*
- **D2 — Child deleteMany userId-scoped via `ingesta: { account: { userId } }`.**
  The load-bearing correctness decision (§3.2): prevents cross-tenant child
  deletion + data loss under the array `$transaction`. Rejected: unscoped child
  `{ ingestaId }` (isolation breach).
- **D3 — Two narrow ports + two Prisma classes (ISP/SRP), not extend
  `IIngestaRepository`.** Mirrors the reclasificar slice; keeps the write
  aggregate port clean.
- **D4 — `ListarIngestasUseCase` returns the array directly, not `Result`.** No
  domain error to model; avoids `Result<_, never>` ceremony (KISS/YAGNI).
- **D5 — List filters to `estado: PROCESADA`.** Only these polluted the money
  views; guarantees a non-null impact count. Rejected: list all states.
- **D6 — Array-form `$transaction`, parent `count` is the 404 gate.** Repo
  precedent (`commit()`); callback form buys no safety under `Restrict`.
- **D7 — Web `deleteIngesta` treats 204 as ok without parsing JSON.** Empty-body
  gotcha; parsing would throw.
