# Design — US-005 Detección de datos duplicados

> SDD change: `us-005-deteccion-duplicados` · Phase: design · Store: hybrid
> Engram topic: `sdd/us-005-deteccion-duplicados/design`
> Required input: `proposal.md` (obs #340) + `explore.md` (obs #337)

## 1. Scope of this design

Single-request **warn + auto-skip** duplicate detection, inserted into the
existing `ProcessIngestaUseCase.runPipeline` **just before**
`PersistTransactionsUseCase.execute`. Natural key
`accountId + fecha + descripcion + cargo + abono`, exact match on all five,
money compared as exact integers. Detection runs in the **application layer**
against **decrypted plaintext** descripcion; **never** a DB unique constraint,
**never** an index on `descripcion`. This design decides the exact contracts,
the commit-signature change, the bounded query, the DTO/web wiring, the
migration, and the TDD split. It does NOT write specs, tasks, or code.

Everything here honors the locked decisions. Two refinements are flagged in
§9 (port name; DTO field set) — both are naming/shape refinements inside the
locked direction, not reversals of it.

---

## 2. Architecture approach

Standard repo pattern (KISS §2 "boring technology"): **pure domain key
function** + **thin application use case** + **one dumb infra reader port**,
each testable in isolation. No new pattern is introduced.

```
ProcessIngestaUseCase.runPipeline
  … normalize → Transaccion[] (canonical, number money) …
  ├─ DetectarDuplicadosUseCase.execute({ accountId, transacciones })
  │     ├─ compute [minFecha, maxFecha] over the incoming batch
  │     ├─ ITransaccionExistenteReader.buscarPorCuentaYRango(accountId, min, max)
  │     │        └─ (infra) SELECT by (accountId, fecha∈[min,max]) + decrypt descripcion
  │     ├─ build Set<clave> over existing rows  (construirClaveDuplicado, domain)
  │     └─ partition incoming into { nuevas, duplicadas }  (same domain key fn)
  │     → Result<{ nuevas: Transaccion[], duplicadas: number }, PersistenciaFallidaError>
  └─ PersistTransactionsUseCase.execute({ …, transacciones: nuevas,
                                          duplicadosOmitidos: duplicadas })
        └─ IIngestaRepository.commit(id, accountId, nuevas, duplicadosOmitidos)
              └─ atomic $transaction([createMany(nuevas), ingesta.update(PROCESADA,
                 totalTransacciones, duplicadosOmitidos, procesadoEn)])
```

Only `nuevas` reach persistence; `duplicadas` (a count) is written on the
`Ingesta` row inside the **same atomic transaction** that flips it to
`PROCESADA`.

### Dependency-rule check (ADR-005 / SOLID D)

- `clave-duplicado.ts` → **domain** (pure, no imports of Prisma/NestJS/`Result`).
- `detectar-duplicados.use-case.ts` + `transaccion-existente-reader.port.ts` →
  **application** (depend only on domain + `Result`).
- `prisma-transaccion-existente.reader.ts` → **infrastructure** (Prisma +
  `ICryptoService`), wired in `IngestaModule` composition root.

No layer is inverted. The use case is unit-testable with a fake reader; the
domain key is unit-testable with plain values.

---

## 3. Contracts

### 3.1 Domain — composite key (pure function)

`apps/api/src/domain/value-objects/clave-duplicado.ts` (NEW)

```ts
export interface ClaveDuplicadoInput {
  readonly fecha: Date;
  readonly descripcion: string;
  /** Monto entero canónico como string decimal (BigInt-exacto). */
  readonly cargo: string;
  readonly abono: string;
}

/**
 * Clave natural de duplicado (decidida por stakeholder, Opción A):
 * accountId + fecha + descripcion + cargo + abono. `accountId` NO entra aquí
 * porque el scope ya está acotado por cuenta en la consulta (§3.3): todas las
 * claves comparadas pertenecen al mismo accountId, así que incluirlo sería
 * redundante. Los 3 campos numéricos van primero (sin `|` en su contenido);
 * `descripcion` va al final, así su contenido —aunque incluya `|`— nunca
 * corre el límite de un campo previo (no hay colisiones falsas). El dinero se
 * compara como string entero canónico, exacto, NUNCA float.
 */
export function construirClaveDuplicado(input: ClaveDuplicadoInput): string {
  return `${input.fecha.getTime()}|${input.cargo}|${input.abono}|${input.descripcion}`;
}
```

**Why money as `string`, not `number` and not `bigint`:** the two sides have
different money types — incoming `Transaccion` carries `number` (domain
guarantees positive integers), existing DB rows come back as `bigint`. A
canonical **integer decimal string** unifies them without a number↔bigint
conversion and without any `throw` in domain/app: `String(1500) === (1500n).toString() === "1500"`.
`bigint.toString()` is lossless (existing side is the BigInt source of truth);
the incoming side is a domain-guaranteed integer within `MAX_SAFE_INTEGER`, so
`String(tx.cargo)` is exact. This is the "money BigInt exact" locked decision
satisfied via exact canonical strings.

**Match semantics:** exact. No trimming, no case-folding, no date-truncation
beyond what the normalizer already produced (`fecha` is a UTC `Date`;
`getTime()` compares the exact instant, and both sides round-trip the same
value through Postgres `DateTime`). This matches the stakeholder "exact match
on all 5 fields".

### 3.2 Application — the reader port (RENAMED from `IDuplicateChecker`)

`apps/api/src/application/ports/transaccion-existente-reader.port.ts` (NEW)

```ts
import { Result } from '../../shared/result';
import { PersistenciaFallidaError } from '../../domain/errors/persistencia-fallida.error';

/** Proyección de una transacción ya persistida, con descripcion DESCIFRADA. */
export interface TransaccionExistente {
  readonly fecha: Date;
  readonly descripcion: string; // plaintext (ya pasó por ICryptoService.decrypt)
  readonly cargo: bigint;       // fuente de verdad BigInt-exacta
  readonly abono: bigint;
}

/**
 * ITransaccionExistenteReader — lectura acotada para detección de duplicados.
 * Un SELECT por (accountId, fecha∈[desde,hasta]); descifra descripcion en la
 * capa de infraestructura y devuelve texto plano. Retorna Result y NUNCA lanza
 * (la impl Prisma convierte errores de infra en Result.fail, igual que
 * IIngestaRepository).
 */
export interface ITransaccionExistenteReader {
  buscarPorCuentaYRango(
    accountId: string,
    fechaDesde: Date,
    fechaHasta: Date,
  ): Promise<Result<ReadonlyArray<TransaccionExistente>, PersistenciaFallidaError>>;
}

export const TRANSACCION_EXISTENTE_READER = 'ITransaccionExistenteReader';
```

**Boundary rationale (the real architecture call):** the locked decision named
the port `IDuplicateChecker`, but "checking" (the compare) is a **locked
application-layer concern**. A port literally named `Checker` would imply the
matching lives in infra — contradicting "comparison in APPLICATION layer". So
the port is renamed to describe its true, single responsibility (SOLID S/I): a
**bounded reader** that returns decrypted existing rows. The **use case owns
the compare**, building keys for BOTH sides via the one domain function. This:
- keeps the key logic in **exactly one place** (DRY), the domain function;
- makes `DetectarDuplicadosUseCase` fully unit-testable with a fake reader
  returning canned rows (ISP: the fake stubs one small method);
- keeps the port dumb (mirrors `ITransaccionParaClasificarReader`, the closest
  existing precedent).

The **use-case name `DetectarDuplicadosUseCase` and its result shape are kept
verbatim** from the locked decision.

### 3.3 Application — the detection use case

`apps/api/src/application/use-cases/detectar-duplicados.use-case.ts` (NEW)

```ts
export interface DetectarDuplicadosInput {
  readonly accountId: string;
  readonly transacciones: ReadonlyArray<Transaccion>;
}
export interface DetectarDuplicadosResult {
  readonly nuevas: ReadonlyArray<Transaccion>;
  readonly duplicadas: number;
}

// execute(input): Promise<Result<DetectarDuplicadosResult, PersistenciaFallidaError>>
```

Algorithm (guard-clause style, KISS §3):
1. `transacciones` empty → `Result.ok({ nuevas: [], duplicadas: 0 })` **without
   querying** (the fake asserts the reader is NOT called). Trivial CA-04.
2. `min`/`max` = earliest/latest `fecha` in the batch (single pass).
3. `reader.buscarPorCuentaYRango(accountId, min, max)`; on `isFail()` →
   `Result.fail(error)` (conservative: if we can't verify, we do NOT persist a
   possibly-duplicate batch — the orchestrator maps this to 500, nothing is
   written).
4. Build `existentes: Set<string>` = `construirClaveDuplicado` over each existing
   row (money via `row.cargo.toString()`).
5. Partition incoming preserving order: key each `tx` via
   `construirClaveDuplicado({ …, cargo: String(tx.cargo), abono: String(tx.abono) })`;
   `existentes.has(key)` → duplicate (increment count), else → push to `nuevas`.
6. `Result.ok({ nuevas, duplicadas })`.

**Intra-batch semantics (accepted MVP limitation, documented):** incoming rows
are compared only against **existing DB rows**, never against earlier rows in
the same batch. Two genuinely-identical rows in a single file are BOTH imported
(they are legitimately distinct). On re-upload, both match the two now-existing
keys and both are skipped. The corollary edge — existing has 1 copy, incoming
batch has 2 identical — skips both incoming (Set membership), which is exactly
the stakeholder-accepted "same-day identical transaction" collision.

### 3.4 Application — `PersistTransactionsUseCase` + `IIngestaRepository.commit`

The omitted count is written on the `Ingesta` in the **same atomic write** that
already sets `PROCESADA`/`totalTransacciones`. This is the only place a single
atomic transaction touches the `Ingesta` row post-insert, so it is the correct
home (no second, non-atomic update).

`IIngestaRepository.commit` gains a parameter:
```ts
commit(
  ingestaId: string,
  accountId: string,
  transacciones: ReadonlyArray<Transaccion>, // = nuevas
  duplicadosOmitidos: number,
): Promise<Result<{ total: number }, PersistenciaFallidaError>>;
```

`PersistTransactionsUseCase`:
- `PersistTransactionsInput` gains `duplicadosOmitidos: number`.
- `execute` threads it into `commit(...)`.
- `PersistTransactionsResult` gains `duplicadosOmitidos: number` (echoed back so
  the orchestrator can surface it without re-reading).

`createPending`/`markFailed` are unchanged.

### 3.5 Orchestration — `ProcessIngestaUseCase`

- Constructor gains `private readonly detectarDuplicadosUseCase: DetectarDuplicadosUseCase`
  (last collaborator, mirrors existing style).
- `ProcessIngestaError` union gains nothing new — the detector fails with
  `PersistenciaFallidaError`, already in the union.
- In `runPipeline`, between `normalize` and `persist`:
  ```ts
  const dedupeResult = await this.detectarDuplicadosUseCase.execute({
    accountId, transacciones,
  });
  if (dedupeResult.isFail()) return Result.fail(dedupeResult.getError());
  const { nuevas, duplicadas } = dedupeResult.getValue();

  const persistResult = await this.persistTransactionsUseCase.execute({
    accountId, banco: banco.banco, nombreArchivo: archivo.originalName,
    transacciones: nuevas, duplicadosOmitidos: duplicadas,
  });
  ```
- `ProcessIngestaResult`: `total` stays = **persisted/imported** count
  (`nuevas.length`), `transacciones` = `nuevas` (preview shows imported rows),
  and a new field `duplicadosOmitidos: number` is added.
- Categorization island is **unchanged** — it reads persisted rows by
  `ingestaId`, so it naturally only ever sees `nuevas`.

---

## 4. Infrastructure — bounded query + decryption

`apps/api/src/infrastructure/persistence/prisma-transaccion-existente.reader.ts` (NEW)

```ts
export class PrismaTransaccionExistenteReader implements ITransaccionExistenteReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ICryptoService,
  ) {}

  async buscarPorCuentaYRango(accountId, fechaDesde, fechaHasta) {
    try {
      const rows = await this.prisma.transaccion.findMany({
        where: { accountId, fecha: { gte: fechaDesde, lte: fechaHasta } },
        select: { fecha: true, descripcion: true, cargo: true, abono: true },
      });
      return Result.ok(
        rows.map((r) => ({
          fecha: r.fecha,
          descripcion: this.crypto.decrypt(r.descripcion), // ← plaintext here
          cargo: r.cargo,
          abono: r.abono,
        })),
      );
    } catch (error) {
      return Result.fail(new PersistenciaFallidaError(
        'no se pudo consultar transacciones existentes para deduplicación',
        error instanceof Error ? error : undefined,
      ));
    }
  }
}
```

- **Bounded**: filtered by `accountId` AND `fecha ∈ [min,max]` of the incoming
  batch — never a full-history scan. Backed by the new `(accountId, fecha)`
  index (§6). Meets NFR <3s/10k rows.
- **Decryption happens HERE**, in infra, because only infra holds
  `ICryptoService`. The application layer receives plaintext and never touches
  ciphertext or queries by `descripcion`.
- **`userId` isolation (RNF-SEC-006):** scoping by `accountId` is sufficient and
  correct — `accountId` is resolved server-side from the authenticated user via
  `AccountRepository.ensure` and is user-scoped by construction
  (`Account @@unique([userId, …])`). A cross-tenant `accountId` cannot be
  supplied. Same approach as `prisma-movimientos-mes.repository.ts`. An
  integration test still proves the isolation.

`PrismaIngestaRepository.commit` change: add `duplicadosOmitidos` to the
`ingesta.update` `data` payload inside the existing `$transaction([...])` array;
signature updated to accept the new parameter. No structural change to the
atomic insert of `nuevas`.

---

## 5. DTO + web wiring

### 5.1 Backend DTO — `ingesta-response.dto.ts`

- `ProcessIngestaResult.total` already = imported count → keep
  `IngestaResponseDto.totalTransacciones = data.total` (meaning **unchanged**:
  rows imported). **No consumer breaks.**
- Add `duplicadosOmitidos: number` (`= data.duplicadosOmitidos`).

```ts
export interface IngestaResponseDto {
  // …existing fields unchanged…
  totalTransacciones: number;   // imported rows (unchanged meaning)
  duplicadosOmitidos: number;   // NEW
  transacciones: ReadonlyArray<TransaccionResponseDto>;
}
```

### 5.2 Web mirror — `apps/web/src/api/types.ts`

Add `readonly duplicadosOmitidos: number` to `IngestaResponseDto`. No `client.ts`
change needed (it returns the parsed body as-is).

### 5.3 Web UI — `SubirCartola.tsx`

Inside the existing `estado === 'exito'` `<section>` (already focus-managed for
a11y), add an **inline banner** rendered **only when `duplicadosOmitidos > 0`**
(CA-04: no warning when zero):

> "Se importaron {totalTransacciones}, se omitieron {duplicadosOmitidos} duplicados."

Keep it inside the already-labelled/focused result section (no new focus trap,
no new aria-live region — the section heading already receives focus on
success). Style with Serene Finance tokens (not raw Tailwind — mirror the
`SubirCartola` follow-up debt note), non-destructive/informational styling.
`useIngesta`'s cache invalidation is unchanged.

---

## 6. Migration plan (additive, no backfill)

`apps/api/prisma/schema.prisma`:

```prisma
model Ingesta {
  // …
  duplicadosOmitidos Int @default(0)   // NEW
}

model Transaccion {
  // …
  @@index([accountId, fecha])          // NEW, non-unique
}
```

Migration name: `add_duplicados_omitidos_and_transaccion_account_fecha_index`.

- **`Ingesta.duplicadosOmitidos Int @default(0)`** — historical ingestas
  backfill to `0`, which is semantically correct (they recorded no omissions).
  No data migration.
- **`@@index([accountId, fecha])`** — non-unique, additive. Deliberately NOT a
  unique constraint and NOT on `descripcion`: a unique index would abort the
  atomic `createMany` on the first collision (the OPPOSITE of CA-03's
  auto-skip), and any `descripcion` index would break under real encryption and
  leak plaintext into an index (ADR-013).
- **Rollback**: drop the column + drop the index. No data reversal (nothing was
  backfilled or mutated). Matches the proposal rollback plan.
- Index creation briefly locks writes on Postgres; at current single-user MVP
  volume this is negligible (YAGNI: `CREATE INDEX CONCURRENTLY` deferred until a
  real volume trigger).

---

## 7. Encryption forward-compat (ADR-013) — why app-layer decrypt-and-compare

Today `descripcion` is stored through `ICryptoService.encrypt` (`NoOpCryptoService`
identity). The comparison is done in the **application layer on decrypted
plaintext** for a hard forward-compat reason:

- The bounded query filters only on `accountId` + `fecha` (both plaintext,
  always queryable) and reads `descripcion` back, decrypting in the infra
  adapter. This keeps working the day real encryption ships.
- **What breaks if someone shortcuts it:** a `WHERE descripcion = ?` filter, a
  DB unique constraint on the natural key, or any index touching `descripcion`
  would (a) stop matching once ciphertext becomes non-deterministic (IV/nonce
  per row), and (b) leak plaintext-adjacent data into an index. NEVER push the
  descripcion compare down to SQL. The natural-key compare MUST remain
  in-memory over decrypted values.

This is called out so a future optimizer doesn't "speed it up" by moving the
match into the query.

---

## 8. Test strategy (Strict TDD is active — write the test first)

**Domain-unit** — `construirClaveDuplicado` (`clave-duplicado.spec.ts`):
- identical tuples → identical key; differ by fecha / descripcion / cargo /
  abono → different key.
- **BigInt exactness**: existing `bigint.toString()` and incoming `String(number)`
  produce the same key for equal integer amounts; amounts near
  `Number.MAX_SAFE_INTEGER` still match exactly; a 1-peso difference → different
  key (money is exact, never float-rounded).
- delimiter safety: descripcion containing `|` does not create a false
  collision with a different numeric tuple.
- exact-match semantics: descriptions differing by case/whitespace are NOT
  equal (no normalization).

**Application-unit** — `DetectarDuplicadosUseCase` with a fake
`ITransaccionExistenteReader` (`detectar-duplicados.use-case.spec.ts`):
- empty batch → ok, reader NOT called, `duplicadas: 0`.
- reader returns `[]` → all `nuevas`, `duplicadas: 0` (CA-04).
- partial overlap → correct partition; `nuevas` preserves order, excludes
  matches (CA-01/CA-03).
- full overlap → `nuevas: []`, `duplicadas: N`.
- reader `Result.fail` → use case returns `fail` (conservative, nothing later
  persists).
- min/max range passed to the reader is the true batch min/max (fake asserts
  args).
- two txns differing by 1 peso → both `nuevas` (not duplicates).

**Application-unit** — `PersistTransactionsUseCase` (extend existing spec):
- `commit` is called with `duplicadosOmitidos`; result echoes it.

**Application-unit** — `ProcessIngestaUseCase` (extend existing spec):
- detection runs before persist; only `nuevas` reach `persist`;
  `duplicadosOmitidos` threaded into the result; detector `fail` short-circuits
  the pipeline (nothing persisted).

**Infra/DTO-unit** — `aIngestaResponseDto` maps `duplicadosOmitidos`;
`totalTransacciones` still = imported count.

**Integration** (gated `ALLOW_DESTRUCTIVE_DB=1`):
- `PrismaTransaccionExistenteReader`: returns only rows within
  `(accountId, [min,max])`; decrypts descripcion; **userId isolation** — a
  second user's account rows are never returned (RNF-SEC-006 / ISO).
- end-to-end re-upload of the same statement → 2nd import persists **0** new
  rows, `Ingesta.duplicadosOmitidos` = N, the first ingesta and its rows are
  **untouched** (read-only NFR).
- the atomic commit writes `duplicadosOmitidos` on the `Ingesta` row (and only
  `nuevas` are inserted).

**Web-unit** (vitest + RTL) — `SubirCartola`:
- banner shown with the imported/omitted counts when `duplicadosOmitidos > 0`;
- banner absent when `duplicadosOmitidos === 0` (CA-04).

---

## 9. KISS / YAGNI notes and refinements to the locked direction

**Refinements (inside the locked direction — flagged, not reversals):**
1. **Port renamed** `IDuplicateChecker` → `ITransaccionExistenteReader`. The
   compare is a locked application concern; naming the port "Checker" would
   mislead future readers into pushing matching into infra. The use-case name
   `DetectarDuplicadosUseCase` and its `Result<{ nuevas, duplicadas }>` shape are
   kept verbatim.
2. **DTO field set trimmed** to `totalTransacciones` (unchanged meaning:
   imported) + new `duplicadosOmitidos`. The proposal also listed
   `transaccionesImportadas`, which would be an exact duplicate of the existing
   `totalTransacciones` value → dropped for KISS/DRY. The banner derives "total
   detected" as `importadas + omitidas` client-side if ever needed.

**KISS/YAGNI held:**
- Port has ONE method, no thresholds, no fuzzy-match flag, no config — exact
  natural key only.
- No new unique DB constraint, no `descripcion` index (correctness + encryption).
- No two-phase preview/confirm (that is US-003, descoped).
- No intra-batch self-dedup beyond the accepted same-day-identical limitation.
- `duplicadosOmitidos` defaults to `0`, no backfill.
- Reuse `PersistenciaFallidaError` for reader/detector failures (existing repo
  convention) rather than inventing a new error type.

---

## 10. Affected files (design-level, for the tasks phase)

| File | Change |
|------|--------|
| `apps/api/src/domain/value-objects/clave-duplicado.ts` | NEW — pure key fn |
| `apps/api/src/application/ports/transaccion-existente-reader.port.ts` | NEW — reader port + token |
| `apps/api/src/application/use-cases/detectar-duplicados.use-case.ts` | NEW — detection use case |
| `apps/api/src/application/use-cases/persist-transactions.use-case.ts` | MOD — `duplicadosOmitidos` in input/result, thread to commit |
| `apps/api/src/application/ports/ingesta-repository.port.ts` | MOD — `commit` gains `duplicadosOmitidos` |
| `apps/api/src/application/use-cases/process-ingesta.use-case.ts` | MOD — new step + `duplicadosOmitidos` in result + ctor collaborator |
| `apps/api/src/infrastructure/persistence/prisma-transaccion-existente.reader.ts` | NEW — bounded query + decrypt |
| `apps/api/src/infrastructure/persistence/prisma-ingesta.repository.ts` | MOD — write `duplicadosOmitidos` in atomic update |
| `apps/api/src/infrastructure/http/ingesta.module.ts` | MOD — wire reader token + `DetectarDuplicadosUseCase` into `ProcessIngestaUseCase` |
| `apps/api/src/infrastructure/http/dto/ingesta-response.dto.ts` | MOD — add `duplicadosOmitidos` |
| `apps/api/prisma/schema.prisma` | MOD — index `(accountId, fecha)` + `Ingesta.duplicadosOmitidos` |
| `apps/web/src/api/types.ts` | MOD — mirror `duplicadosOmitidos` |
| `apps/web/src/components/SubirCartola.tsx` | MOD — inline omitted banner (>0 only) |

---

## 11. Risks / open items

| Risk | Mitigation |
|------|------------|
| Encryption pushed into SQL by a future optimizer | §7 documents why compare stays app-layer; no `descripcion` index exists to tempt it |
| Reader failure fails the whole ingesta (500) | Conservative-by-design: never persist a batch we couldn't verify; small blast radius, no partial import |
| Index build write-lock on large tables | Negligible at MVP volume; `CONCURRENTLY` deferred (YAGNI) with volume trigger |
| Same-day identical transactions collide | Accepted, stakeholder-documented MVP limitation; §3.3 states the exact behavior |
| CLI (`ingestar.ts`) does not surface omitted count | Cosmetic; `ProcessIngestaResult.duplicadosOmitidos` is available if a CLI line is added in tasks |

**Next recommended:** `sdd-tasks` (once spec is also ready).
