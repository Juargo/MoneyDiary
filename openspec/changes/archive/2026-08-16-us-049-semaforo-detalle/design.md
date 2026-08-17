# Design: US-049 — Semáforo Detail Page

> Scope of this document: the HOW at architectural level. Task breakdown lives in `tasks.md`.
> Every file path, symbol and constant below was read in the repo before being written here.

---

## 0. Architecture at a glance

```
GET /api/resumen/semaforo?periodo=YYYY-MM
  └─ routes/resumen.routes.ts :: registrarResumenSemaforo   (infrastructure, closure-DI)
       └─ ObtenerSemaforoDetalleUseCase                     (application, Result<T,E>)
            ├─ IResumenMesReader.sumarPorBucket             (EXISTING port — no new port, no new query)
            ├─ construirResumenMesDesdeFilas                (EXISTING assembly — DRY with /api/resumen)
            └─ construirSemaforoDetalle(ResumenMes)         (domain, NEW pure VO module)
                 ├─ BANDAS_SEMAFORO                         (domain, EXISTING constants — now exported)
                 ├─ montoParaVerde(bucket,total,base)       (domain, NEW BigInt arithmetic)
                 └─ diagnosticar(resumen)                   (domain, NEW Spanish copy)
       └─ aSemaforoDetalleDto(...)                          (infrastructure, BigInt→string)
```

Dependency rule (ADR-005) untouched: the new domain module imports only `bucket.ts`,
`estado-semaforo.ts` and `resumen-mes.ts`. The new use case imports only domain + ports.
No new port, no new repository, no schema/migration.

The web mirrors the established container/presentational split:
`routes/_authenticated/semaforo.tsx` (router wiring only) → `SemaforoDetallePage`
(state switch, router-agnostic) → `BucketSemaforoCard` + `ZonaBar` (pure presentational).

---

## 1. Layer-by-layer design

### 1.1 Domain — `estado-semaforo.ts` (MODIFIED)

Today the 8 threshold constants are literals inlined in two private functions
(`estadoUnilateral`, `estadoAhorro`). Exporting a *second* copy for the wire would put
two sources of truth in the same file — precisely the drift R2 exists to prevent. So the
table becomes the single source and the classifier reads from it.

```ts
export interface BandasBucket {
  /** null ⇒ no lower bound (unilateral "≤ target is best" buckets). */
  readonly verdeMin: bigint | null;
  readonly verdeMax: bigint;
  /** null ⇒ no lower amarillo band (unilateral buckets). */
  readonly amarilloMin: bigint | null;
  readonly amarilloMax: bigint;
  /** 50/30/20 target CENTER in basis points. */
  readonly metaBp: bigint;
}

export const BANDAS_SEMAFORO = Object.freeze({
  [Bucket.Necesidades]: { verdeMin: null,  verdeMax: 5000n, amarilloMin: null,  amarilloMax: 6000n, metaBp: 5000n },
  [Bucket.Deseos]:      { verdeMin: null,  verdeMax: 3000n, amarilloMin: null,  amarilloMax: 4000n, metaBp: 3000n },
  [Bucket.Ahorro]:      { verdeMin: 2000n, verdeMax: 4000n, amarilloMin: 1000n, amarilloMax: 5000n, metaBp: 2000n },
} as const satisfies Record<Bucket.Necesidades | Bucket.Deseos | Bucket.Ahorro, BandasBucket>);
```

`estadoUnilateral` + `estadoAhorro` collapse into ONE table-driven function:

```ts
function estadoDesdeBandas(bp: bigint, b: BandasBucket): EstadoSemaforo {
  const enVerde = (b.verdeMin === null || bp >= b.verdeMin) && bp <= b.verdeMax;
  if (enVerde) return EstadoSemaforo.Verde;
  const enAmarillo = (b.amarilloMin === null || bp >= b.amarilloMin) && bp <= b.amarilloMax;
  if (enAmarillo) return EstadoSemaforo.Amarillo;
  return EstadoSemaforo.Rojo;
}

export function calcularEstadoBucket(bucket: Bucket, porcentajeBp: bigint | null) {
  if (porcentajeBp === null) return null;
  const bandas = BANDAS_SEMAFORO[bucket as keyof typeof BANDAS_SEMAFORO];
  return bandas === undefined ? null : estadoDesdeBandas(porcentajeBp, bandas);
}
```

**Equivalence proof (checked case by case against the current code and its 39 existing tests):**

| bp | bucket | old path | table path | result |
|----|--------|----------|------------|--------|
| 0 | Necesidades | `0 ≤ 5000` | `verdeMin null && 0 ≤ 5000` | Verde |
| 5000 | Necesidades | `≤ 5000` | idem | Verde |
| 5001 | Necesidades | `≤ 6000` | not verde; `amarilloMin null && ≤ 6000` | Amarillo |
| 6001 | Necesidades | else | neither | Rojo |
| 3000 / 3001 / 4001 | Deseos | same shape | same shape | Verde / Amarillo / Rojo |
| 999 | Ahorro | `<1000` | not verde (`999<2000`); not amarillo (`999<1000`) | Rojo |
| 1000 | Ahorro | `1000≤bp<2000` | not verde; `1000 ≤ 1000 ≤ 5000` | Amarillo |
| 2000 / 4000 | Ahorro | verde band | `≥2000 && ≤4000` | Verde |
| 4001 / 5000 | Ahorro | `4000<bp≤5000` | not verde; `≥1000 && ≤5000` | Amarillo |
| 5001 | Ahorro | else | neither | Rojo |
| any | SinCategoria / Ingreso | `default: null` | not in table → null | null |

**Acceptance gate for this refactor: `estado-semaforo.spec.ts`'s 39 existing tests must pass
byte-unchanged.** If any existing test needs editing, the refactor is wrong — revert it and
export a duplicated table instead.

### 1.2 Domain — `semaforo-detalle.ts` (NEW)

SRP: `estado-semaforo.ts` keeps *classification*; this module owns *explanation*
(how far off, in which direction, and how to say it). Pure, BigInt-only, no I/O, never throws.

Public surface:

```ts
export type DireccionConsejo = 'reducir' | 'aumentar';
export type CasoConsejo = 'excede' | 'ahorro-bajo' | 'ahorro-alto';

export interface ConsejoVerde {
  readonly direccion: DireccionConsejo;
  readonly monto: bigint;        // always > 0n
  readonly caso: CasoConsejo;
  readonly mensaje: string;      // Spanish, contains the literal placeholder `{monto}` exactly once
}

export interface BucketSemaforoDetalle {
  readonly bucket: Bucket;               // Necesidades | Deseos | Ahorro
  readonly total: bigint;
  readonly porcentajeBp: bigint | null;
  readonly estadoSemaforo: EstadoSemaforo | null;
  readonly bandas: BandasBucket;
  readonly consejo: ConsejoVerde | null;
}

export interface SemaforoDetalle {
  readonly totalIngreso: bigint;
  readonly sinIngreso: boolean;
  readonly estadoGlobal: EstadoSemaforo | null;
  readonly diagnostico: string;                        // no placeholders
  readonly bucketsCriticos: ReadonlyArray<Bucket>;     // [] when Verde / sinIngreso
  readonly buckets: ReadonlyArray<BucketSemaforoDetalle>;  // exactly 3, fixed order
  readonly sinCategoria: { readonly cantidad: number; readonly total: bigint };
}

export function construirSemaforoDetalle(resumen: ResumenMes): SemaforoDetalle;
export function montoParaVerde(bucket, total: bigint, base: bigint): ConsejoVerde | null;
export function diagnosticar(resumen: ResumenMes): string;
```

`buckets` is exactly **3** (the buckets that have a rule), not the 4 of `/api/resumen` —
SinCategoria has no band, no estado and no target, so a 4th entry would need three nullable
fields that no consumer reads. Its count+total travel in their own `sinCategoria` object
(CA-06). This deliberate divergence from `ResumenMesDto` is documented in both DTOs.

### 1.3 THE FORMULA — CLP-to-Verde (proposal R1, High risk)

Everything below is derived **from** `porcentajeBasisPoints` (`resumen-mes.ts:28`), never
guessed. Let `base = totalIngreso > 0n`, `h = base / 2n` (BigInt floor), and

```
bp(t) = (t * 10000n + h) / base          // BigInt division = floor for non-negative operands
```

`bp` is monotonically non-decreasing in `t` (numerator grows, divisor fixed). Two exact
inverses are enough for all three cases:

```ts
/** Largest amount whose recomputed bp is ≤ bpMax. */
function montoMaximoConBpHasta(base: bigint, bpMax: bigint): bigint {
  return (base * (bpMax + 1n) - 1n - base / 2n) / 10000n;
}

/** Smallest amount whose recomputed bp is ≥ bpMin. */
function montoMinimoConBpDesde(base: bigint, bpMin: bigint): bigint {
  return (bpMin * base - base / 2n + 9999n) / 10000n;
}
```

**Derivation — `montoMaximoConBpHasta`.** `floor(q) ≤ V ⟺ q < V+1`, so
`bp(t) ≤ V ⟺ 10000t + h < base·(V+1) ⟺ 10000t ≤ base·(V+1) − 1 − h` (integers), hence
`t ≤ floor((base·(V+1) − 1 − h) / 10000)`. Numerator is non-negative for every `base ≥ 1n`
and `V ≥ 2000n` (`base·(V+1) − h ≥ base·(V + 0.5) > 1`), so the BigInt truncation is a floor,
not a toward-zero surprise.

**Derivation — `montoMinimoConBpDesde`.** `floor(q) ≥ L ⟺ q ≥ L`, so
`bp(t) ≥ L ⟺ 10000t + h ≥ L·base ⟺ t ≥ ceil((L·base − h)/10000)`, computed as
`(L·base − h + 9999n) / 10000n`. Numerator `≥ 2000·base − base/2 > 0` for `base ≥ 1n`.

**Worked examples (boundary values, hand-computed):**

| case | base | threshold | formula result | verification |
|------|------|-----------|----------------|--------------|
| (a) Necesidades, `verdeMax=5000` | `1_000_000n` | max amount still Verde | `(1e6·5001 − 1 − 500000)/10000 = 5_000_499_999/10000 = 500_049` | `bp(500_049) = (5_000_490_000+500_000)/1e6 = 5000` ✓ Verde · `bp(500_050) = 5001` ✗ |
| (a) same, naive `floor(V·base/10000)` | `1_000_000n` | — | `500_000` | also Verde but **49 pesos over-asks** — rejected, see D-04 |
| (a) tiny base | `1n` | `verdeMax=5000` | `(5001 − 1 − 0)/10000 = 0` | `bp(0)=0` ✓ Verde · `bp(1)=10000` ✗ |
| (b) Ahorro low, `verdeMin=2000` | `1_000_000n` | min amount already Verde | `(2e9 − 500000 + 9999)/10000 = 1_999_509_999/10000 = 199_950` | `bp(199_950) = (1_999_500_000+500_000)/1e6 = 2000` ✓ Verde · `bp(199_949) = 1999` ✗ |
| (b) odd base (exercises `base/2n` truncation) | `999_999n` | `2000` | `(1_999_998_000 − 499_999 + 9999)/10000 = 1_999_508_000/10000 = 199_950` | `bp(199_950) = (1_999_500_000+499_999)/999_999 = 2000` ✓ · `bp(199_949)=1999` ✗ |
| (c) Ahorro high, floor `2000` | `1_000_000n`, `total=450_000n` (bp 4500) | max liberatable | `450_000 − 199_950 = 250_050` | `bp(199_950) = 2000` ✓ still Verde |

`montoParaVerde` composes them:

```ts
export function montoParaVerde(bucket: Bucket, total: bigint, base: bigint): ConsejoVerde | null {
  if (base === 0n) return null;                                   // sinIngreso — nothing to advise
  const bandas = BANDAS_SEMAFORO[bucket as keyof typeof BANDAS_SEMAFORO];
  if (bandas === undefined) return null;                          // SinCategoria / Ingreso

  const bp = porcentajeBasisPoints(total, base);
  const estado = calcularEstadoBucket(bucket, bp);
  if (bp === null || estado === null || estado === EstadoSemaforo.Verde) return null;  // CA-05

  let objetivo: bigint;
  let direccion: DireccionConsejo;
  let caso: CasoConsejo;

  if (bandas.verdeMin === null) {                                 // (a) unilateral, always over
    objetivo = montoMaximoConBpHasta(base, bandas.verdeMax);
    direccion = 'reducir';
    caso = 'excede';
  } else if (bp < bandas.verdeMin) {                              // (b) Ahorro below the band
    objetivo = montoMinimoConBpDesde(base, bandas.verdeMin);
    direccion = 'aumentar';
    caso = 'ahorro-bajo';
  } else {                                                        // (c) Ahorro above the band
    objetivo = montoMinimoConBpDesde(base, bandas.verdeMin);
    direccion = 'reducir';
    caso = 'ahorro-alto';
  }

  const monto = direccion === 'reducir' ? total - objetivo : objetivo - total;
  if (monto <= 0n) return null;

  // POST-CONDITION (R1): the advice is emitted ONLY if re-applying it verifiably lands Verde.
  // Always true for (a) by construction; guards the pathological small-base granularity case
  // where one peso moves bp by more than a whole band (e.g. base = 1n ⇒ 10000bp per peso).
  if (calcularEstadoBucket(bucket, porcentajeBasisPoints(objetivo, base)) !== EstadoSemaforo.Verde) {
    return null;
  }
  return { direccion, monto, caso, mensaje: mensajeConsejo(bucket, caso, direccion) };
}
```

**Case (c) semantics — decided, not hand-waved.** For `bp > verdeMax` on Ahorro the amount is
the **maximum liberatable while the recomputed bp stays ≥ 2000bp** (the Verde *floor*), not the
minimum needed to drop to 4000bp. Rationale: over-saving is not an urgency to correct, it is
headroom to inform about — "hasta $X" answers the question the user actually has ("how much of
this could I spend?"). Rejected alternative: min-to-`verdeMax` (lands at 40 %) — it would read as
an instruction to save less, which the product does not want to say. Consequence documented in
the copy: the sentence uses "hasta" and "quedar en Verde", never an imperative.

**Invariant this design guarantees (and tests pin):**
*for every `ConsejoVerde` returned, applying `monto` in `direccion` produces `EstadoSemaforo.Verde`.*
Non-Verde buckets with a realistic income always get advice; pathological bases degrade to
`null` (no advice) rather than to wrong advice — fail-closed, same discipline as the rest of the
money code.

### 1.4 Domain — copy (Spanish literals, exact)

House language check: the app is written in **tuteo**, not voseo — evidence in the repo:
`'Vuelve pronto…'` (`semaforo.tsx`), `'Intenta nuevamente.'` (`client.ts`), `'Toca un ítem…'`
(`ResumenScreen.tsx`), `'Inicia sesión de nuevo.'` (`client.ts`). The proposal's paraphrase
("podés liberar") is voseo; **the implementation uses tuteo** for consistency (D-08).

Product label map (backend copy must say what the card says — the web calls `Deseos` "Gustos"):

```ts
const ETIQUETA_BUCKET_COPY = Object.freeze({
  [Bucket.Necesidades]: 'Necesidades',
  [Bucket.Deseos]:      'Gustos',
  [Bucket.Ahorro]:      'Ahorro',
});
const PALABRA_ESTADO = Object.freeze({
  [EstadoSemaforo.Verde]: 'verde',
  [EstadoSemaforo.Amarillo]: 'amarillo',
  [EstadoSemaforo.Rojo]: 'rojo',
});
const VERBO = Object.freeze({ reducir: 'reduce', aumentar: 'aumenta' });
```

`PALABRA_ESTADO` deliberately duplicates the *strings* of `ESTADO_WIRE`
(`infrastructure/http/dto/resumen-mes.dto.ts:59`) but not the *knowledge*: one is the JSON wire
contract, the other is prose vocabulary. They may diverge without either being wrong
(dry.md, "distinguir conocimiento de coincidencia"), and the domain cannot import infrastructure
anyway (ADR-005).

**Diagnosis literals — 3 in source:**

| id | literal |
|----|---------|
| D1 | `'Este mes no registramos ingresos, así que no podemos calcular tus porcentajes.'` |
| D2 | `'Tu mes está en verde: los tres grupos están dentro de su rango.'` |
| D3 | `` `Tu mes está en ${palabra} por ${lista}.` `` |

`lista` joins the driving buckets' product labels in the fixed order
**Necesidades → Gustos → Ahorro**, with `', '` between all but the last pair and `' y '` before
the last (`'Necesidades y Gustos'`, `'Necesidades, Gustos y Ahorro'`).

Rules:
- `estadoGlobal === null` → **D1**. (Provably equivalent to `sinIngreso`: `calcularEstadoBucket`
  returns non-null for all 3 rule buckets whenever `porcentajeBp !== null`, and `porcentajeBp`
  is `null` only when `base === 0n`. So `base > 0n ⇒ estadoGlobal !== null`.)
- `estadoGlobal === Verde` → **D2** (all three are Verde by the worst-of rule).
- otherwise → **D3**, naming **every** bucket whose `estadoSemaforo === estadoGlobal`.
- **Tie-breaking:** there is no arbitrary winner. Two buckets sharing the worst estado are both
  named, in the fixed order above; three are all named. Rejected alternative: pick one by
  priority — it silently hides half the problem and makes the sentence order-dependent on the
  `buckets` array, which is an assembly detail, not a product rule.
- Never contains `{monto}` (no money in the diagnosis — the cards carry the numbers).

**Advice literals — 2 in source:**

| id | case | literal |
|----|------|---------|
| A1 | `'excede'` + `'ahorro-bajo'` | `` `Para volver a Verde, ${VERBO[direccion]} {monto} en ${etiqueta} este mes.` `` |
| A2 | `'ahorro-alto'` | `'Estás ahorrando por sobre la banda: puedes liberar hasta {monto} y quedar en Verde.'` |

Rendered examples: `Para volver a Verde, reduce {monto} en Gustos este mes.` ·
`Para volver a Verde, aumenta {monto} en Ahorro este mes.`

**The `{monto}` placeholder convention (D-05).** The backend owns the *wording*; the client owns
*money formatting* (it already does, everywhere — `formatearMontoCLP`). So `mensaje` ships with
the literal token `{monto}` and the client substitutes `formatearMontoCLP(consejo.monto)`.
Invariants: `{monto}` appears **exactly once** in every `consejo.mensaje` and **never** in
`diagnostico`. Rejected alternative: formatting CLP server-side — it would duplicate the web's
money formatter in the API and put money *display* rules in two places, which is a worse drift
than a documented placeholder (ADR-015 concentrates risk on money; two formatters is exactly
that risk).

**Copy-literal occurrence count (source, `apps/api/src/domain/value-objects/semaforo-detalle.ts`):**
5 sentence/template literals (D1, D2, D3, A1, A2) + 3 `ETIQUETA_BUCKET_COPY` values +
3 `PALABRA_ESTADO` values + 2 `VERBO` values + 2 joiner literals (`', '`, `' y '`) = **15 string
literals**, each appearing exactly once in `src/`. Test files restate the *rendered* strings —
that restatement is the point (copy is pinned by assertion, per D-07).

### 1.5 Application — `obtener-semaforo-detalle.use-case.ts` (NEW)

Mirrors `CalcularResumenMesUseCase` step for step; reuses the SAME port and the SAME assembly.

```ts
export interface ObtenerSemaforoDetalleResult {
  readonly periodo: string;
  readonly detalle: SemaforoDetalle;
}

export class ObtenerSemaforoDetalleUseCase {
  constructor(private readonly reader: IResumenMesReader, private readonly logger: ILogger) {}
  async execute(input: { userId: string; periodo: string | undefined }):
    Promise<Result<ObtenerSemaforoDetalleResult, PeriodoInvalidoError>> { … }
}
```

- `periodo` absent → `PeriodoMes.actual()`; present → `PeriodoMes.crear()`, `Result.fail` on invalid.
- **`PeriodoInvalidoError` is the ONLY error case.** A month with no income is a *valid 200*
  (CA-07): `sinIngreso: true`, `estadoGlobal: null`, `diagnostico` = D1, all `consejo: null`,
  all `porcentajeBp: null`. Same discipline as `/api/resumen`'s SC-04.
- `logger.debug` logs **counts only** (`rows.length`, `periodo`, `estadoGlobal`,
  `bucketsCriticos.length`) — never montos, never the diagnosis sentence (ADR-013/033).
- Never throws; never imports infrastructure.

**Why a second use case instead of widening `CalcularResumenMesUseCase`:** SRP — `/api/resumen`
is the dashboard's hot path (also consumed by mobile and by the 12-month annual loop, which
builds a `ResumenMes` per month). Making it also generate 12 diagnosis sentences and 36
CLP-to-Verde computations per annual request is work nobody renders.

### 1.6 Infrastructure

**DTO** — `infrastructure/http/dto/semaforo-detalle.dto.ts` (NEW), mirroring `aResumenMesDto`:

```ts
export interface SemaforoDetalleDto {
  readonly periodo: string;
  readonly totalIngreso: string;                       // BigInt → decimal string
  readonly sinIngreso: boolean;
  readonly estadoGlobal: string | null;                // aWire()
  readonly diagnostico: string;
  readonly bucketsCriticos: ReadonlyArray<string>;     // domain bucket names, [] when Verde
  readonly buckets: ReadonlyArray<{
    readonly bucket: string;                           // 'Necesidades' | 'Deseos' | 'Ahorro'
    readonly total: string;                            // BigInt string
    readonly porcentajeBp: number | null;
    readonly estadoSemaforo: string | null;
    readonly metaBp: number;
    readonly bandas: {
      readonly verdeMin: number | null;
      readonly verdeMax: number;
      readonly amarilloMin: number | null;
      readonly amarilloMax: number;
    };
    readonly consejo: {
      readonly direccion: 'reducir' | 'aumentar';
      readonly monto: string;                          // BigInt string — money never a JSON number
      readonly mensaje: string;                        // contains `{monto}` exactly once
    } | null;
  }>;
  readonly sinCategoria: { readonly cantidad: number; readonly total: string };
}
```

`aWire()` is duplicated here rather than exported from `resumen-mes.dto.ts` — 3 lines, same
frozen map, and the two DTOs are independent wire contracts (kiss.md's "tolerar duplicación
pequeña"). If a third DTO needs it, extract then (third-strike rule).

Band edges and `metaBp` travel as JS **numbers** (bp ≤ 10000 ≪ 2^53), consistent with
`porcentajeBp`. Money (`total`, `monto`, `sinCategoria.total`) travels as **strings**, always.

**Zod schema** — `http-express/schemas/semaforo-detalle.schema.ts` (NEW), mirroring
`resumen.schema.ts`: `semaforoDetalleQuerySchema` = `{ periodo: z.string().optional() }`
(transport shape only — the `YYYY-MM` rule stays a domain rule, layer-honesty gate), and
`semaforoDetalleResponseSchema` with `.meta({ id: 'SemaforoDetalleResponse' })`.

**openapi-document.ts** — new `semaforoDetalleOperation` and one **appended** entry
`'/api/resumen/semaforo': { get: semaforoDetalleOperation }`. Appended, never reordered
(the file's own instruction at line ~1043), so `openapi:check` diffs only the genuine addition.

**Route** — `registrarResumenSemaforo(router, obtenerSemaforoDetalle)` added to
`resumen.routes.ts`. Registered as a **third** `router.get` in the same file with the same
Result→HTTP translation (400 scrubbed, `next(err)` for unexpected). Express matches
`/resumen/semaforo` before `/resumen` only because they are distinct literal paths — no param
route exists on this router, so there is no ordering hazard (verified: `resumen.routes.ts` has
only `/resumen` and `/resumen/anual`, both literal).

**Container** — `obtenerSemaforoDetalle: ObtenerSemaforoDetalleUseCase` on the `Container`
interface, wired next to `calcularResumenMes` with **a second `new PrismaResumenMesRepository(prisma)`
instance** (matching the file's existing style — every use case constructs its own reader;
`PrismaResumenMesRepository` is stateless). No `crear-*` helper: this is one `new`, and helpers
exist for large sub-graphs (auth, ingesta), not for single-line wiring.

**Contract chain (ADR-011/012)** — `pnpm api openapi:emit` → `pnpm api-client generate` →
add `export type SemaforoDetalleDto = S['SemaforoDetalleResponse'];` (+ a
`SemaforoBucketDetalleDto` indexed alias) to `packages/api-client/src/index.ts` → re-export from
`apps/web/src/api/types.ts`. Two CI drift gates cover this (`ci.yml:211` `openapi:check`,
`ci.yml:524-530` `types.gen.ts` diff).

### 1.7 Web

**`routes/_authenticated/semaforo.tsx` (MODIFIED)** — stays a thin container:

```tsx
function SemaforoRoute() {
  const { periodo } = Route.useSearch();
  const query = useSemaforoDetalle(periodo);
  return <SemaforoDetallePage query={query} periodo={periodo} />;
}
```

`validateSearch` unchanged. **CA-08 back-link fix**: the "Volver al resumen" `<Link to="/">`
becomes `<Link to="/" search={{ periodo }}>` — moved into `SemaforoDetallePage` so it is
testable without a router harness (TanStack's `Link` needs a router in tests; the existing
route-tree test at `src/test/semaforo-route.test.tsx` covers it with the real tree, which is
where the new assertion goes).

**`api/client.ts` (MODIFIED)** — `fetchSemaforoDetalle(periodo?)`, same never-throw `ApiResult<T>`
shape, same status mapping as `fetchResumen` (400 → `invalid`, 401 → `unauthorized`, other
non-2xx → `server`, network → `network`, bad body → `parse`).

**The DTO guard is IN SCOPE (WG5-05 lesson).** `esSemaforoDetalleDto` validates exactly what
flows into money/render code — nothing more (KISS, same rule as `esResumenMesDto`):
`totalIngreso` and `sinCategoria.total` via `esMontoStringValido`; `diagnostico` is a string;
`buckets` is an array where each entry has `porcentajeBp: number|null`,
`estadoSemaforo: string|null`, `metaBp: number`, a `bandas` object with `verdeMax`/`amarilloMax`
numbers and `verdeMin`/`amarilloMin` `number|null`, and `consejo === null` **or**
`{ direccion, mensaje }` strings + `monto` passing `esMontoStringValido`.
A `consejo.monto` of `"12.5"` must be rejected at the boundary — otherwise `formatearMontoCLP`
throws mid-render with no ErrorBoundary in the app (the exact past "money guard crash" class).

**`api/use-semaforo-detalle.ts` (NEW)** — verbatim `use-resumen.ts` shape,
`queryKey: ['semaforo-detalle', periodo ?? 'actual']`.

**`domain/porcentaje.ts` (NEW, small extraction)** — `SIN_PORCENTAJE_LABEL` +
`aPorcentajeLabel(bp)` move out of `resumen-view-model.ts` (lines 19/101-106).
`SIN_PORCENTAJE_LABEL` is already exported (line 19); only `aPorcentajeLabel` is currently
private (lines 101-106) — the extraction is what gives it a public surface both view-models can
share. `resumen-view-model.ts` re-exports `SIN_PORCENTAJE_LABEL` so its existing importers and
tests are untouched.

**`domain/semaforo-detalle-view-model.ts` (NEW)** — pure mapping + **zone-bar geometry**
(testable without the DOM, mirroring mobile's pie-geometry precedent):

```ts
export interface SegmentoZona {
  readonly estado: 'verde' | 'amarillo' | 'rojo';
  readonly desdePct: number;   // 0..100
  readonly anchoPct: number;
  readonly etiqueta: string;   // e.g. '0–50%' — visible text, never colour alone
}
```

- Scale: `0..10000bp` → `0..100%`; the marker sits at `clamp(bp/100, 0, 100)`.
- Unilateral buckets → **3** segments (`verde [0, verdeMax]`, `amarillo (verdeMax, amarilloMax]`,
  `rojo (amarilloMax, 10000]`). Ahorro → **5** (`rojo`, `amarillo`, `verde`, `amarillo`, `rojo`).
- Segments are contiguous and their widths sum to exactly 100.
- Every edge shown comes from `bandas` on the wire — **no threshold literal exists in
  `apps/web`** (R2 mitigation; pinned by a test).

**`components/ZonaBar.tsx` (NEW)** — a11y contract (ADR-018, WCAG 2.2 AA, the "never colour
alone" house rule that `SemaforoBadge`/`SemaforoTag`/`MiniSemaforoTag` already follow):
the coloured track and the marker are `aria-hidden="true"`; the accessible content is text —
the bucket's percentage, its estado word (from `resolverEstiloSemaforo(...).label`, reused, no
new mapping) and each band's numeric range (`0–50%`, `50–60%`, `60–100%`). No `role="img"` with
a synthesized sentence: real text nodes read better and are assertable.

**`components/SemaforoDetallePage.tsx` (NEW)** — router-agnostic, owns the
`{loading|error|data}` switch over the query (per `ResumenPage`), and composes:
1. **Header** — `<h1>Semáforo</h1>` (the page's only `h1`), the month label via
   `mesCompletoLabel(periodo)`, the **static `SemaforoBadge`** (adopted — see D-06) and the
   backend `diagnostico` rendered verbatim. Back-link with `search={{ periodo }}`.
2. **Explainer** (CA-03) — one static web literal (see below).
3. **Three `BucketSemaforoCard`s** — label from `ETIQUETA_BUCKET` (existing), `porcentajeLabel`,
   `Meta: {metaBp/100}%`, estado badge, `ZonaBar`, and the advice line when `consejo !== null`
   (arrow icon from `direccion`, `lucide-react` per ADR-027).
4. **Sin categoría notice** (CA-06) — count + formatted total + `<Link to="/buckets/$bucket"
   params={{ bucket: 'SinCategoria' }} search={{ periodo }}>`. Target decided **with the code in
   hand**: the standalone route `/buckets/SinCategoria` exists and renders `BucketDetailList`
   (`routes/_authenticated/buckets.$bucket.tsx`), which is a real drill-down. Linking to the
   dashboard with SinCategoria pre-selected was rejected — `ResumenScreen`'s selection is
   `useState`-local with no URL representation, so there is nothing to link to without inventing
   a new search param (out of scope, and it would leak interaction state into the URL contract).
5. **`sinIngreso` branch** (CA-07) — renders the backend `diagnostico` (D1) plus an `<Empty>`
   with month-specific copy; never renders the three cards with `—` percentages.

**New web copy literals — 11:** explainer `'Tu semáforo global es el peor de los tres grupos: si uno está en rojo, todo el mes queda en rojo.'`;
Sin categoría block `'Sin categoría'`, `'movimiento'`, `'movimientos'`, `'Ver los movimientos sin categoría'`;
sinIngreso `<Empty>` `'Este mes no tiene ingresos registrados'` + `'Carga una cartola para ver tu semáforo del mes.'`;
card labels `'Meta'`, `'Tu mes'`, `'Rango verde'`, `'Rango amarillo'`.
Preserved from the stub: `'Semáforo'`, `'Volver al resumen'`. Estado words are **not** new
literals — they come from `resolverEstiloSemaforo`.

**Documented deviation:** the planned static range-label literals (`'Tu mes'`, `'Rango verde'`,
`'Rango amarillo'`, standalone `'Sin categoría'`) were superseded during implementation by
labels **computed dynamically** from the wire bands (`` `${desdePct}–${hastaPct}%` `` in
`semaforo-detalle-view-model.ts`, feeding `ZonaBar`'s segment list) — a stricter reading of R2
(no threshold literal in the client) than the plan called for, catching WSEM-03 conformance the
static-literal design would have left looser. No static card-label literals ship.

**`eslint.config.js` (MODIFIED)** — the US-047 scoped-ERROR block already globs
`src/routes/_authenticated/semaforo*.tsx` and `src/components/SemaforoBadge.tsx`. Add a US-049
block (same FILE-LIST form, same rationale — loose siblings, no directory glob) for
`src/components/SemaforoDetallePage.tsx`, `src/components/BucketSemaforoCard.tsx`,
`src/components/ZonaBar.tsx`.

---

## 2. Decisions (ADR-style)

| id | decision | rationale | rejected alternative |
|----|----------|-----------|----------------------|
| D-01 | New sibling endpoint `GET /api/resumen/semaforo?periodo=`, own use case + DTO, **reusing `IResumenMesReader` + `construirResumenMesDesdeFilas`** | No duplicated query; matches the two precedents in the same route file (`/anual`, `/buckets/:bucket`); makes the page a standalone deep link (CA-08) | Extending `/api/resumen` — every dashboard, mobile and 12× annual load would pay for detail-only work |
| D-02 | Band edges become a **table (`BANDAS_SEMAFORO`) that the classifier itself reads**, exported and on the wire | One source of truth; a second exported copy would drift against the classifier it describes | Exporting duplicated constants; or having the web hardcode them (R2) |
| D-03 | `buckets` carries exactly **3** entries; `sinCategoria` is its own object | SinCategoria has no band/estado/meta — a 4th entry would need 3 nullable fields nobody reads | Mirroring `/api/resumen`'s 4-entry array for symmetry |
| D-04 | CLP-to-Verde uses the **exact inverse** of `porcentajeBasisPoints`, minimal by construction | Naive `floor(V·base/10000)` is safe but over-asks by up to ~0.5 bp worth of pesos (49 CLP on a $1M income) — the user asked "how much", not "at least how much" | Naive target amount; float arithmetic (forbidden, ADR-015) |
| D-05 | `consejo.mensaje` ships a `{monto}` placeholder; the client substitutes `formatearMontoCLP(consejo.monto)` | Backend owns wording, client owns money formatting (it already does everywhere) | CLP formatting server-side — a second money formatter is the worst possible duplication here |
| D-06 | Adopt `SemaforoBadge` as the **static** header badge (closes #382 by reuse) | Verified dead: the only references in `apps/web` are its own file, its own test, `eslint.config.js`, a docstring mention in `DemoBanner.tsx`, and comment/docstring mentions at `ResumenScreen.tsx:78`, `SemaforoTag.tsx:12`, `ResumenScreen.test.tsx:386`, and `semaforo-estilos.ts:29` — several docstring mentions, zero imports outside its own file/test. The header needs a non-clickable badge (we are already on `/semaforo`), which is exactly its shape | Deleting it; or using `SemaforoTag` (it would link to the page you are on) |
| D-07 | Backend owns **data-derived** sentences; the client owns **static explanatory** copy | Keeps the new backend-copy precedent narrow and justified (the sentence depends on which bucket drives the estado — that is domain knowledge, ADR-024). CA-03's explainer has no data in it | Backend owning all page copy (turns the API into a CMS); client composing the diagnosis (re-implements worst-of naming client-side) |
| D-08 | Copy is **tuteo**, not voseo | Every existing user-facing string in `apps/web` is tuteo (4 verified examples) | Following the proposal's voseo paraphrase literally |
| D-09 | Ahorro-high amount = **max liberatable while bp stays ≥ 2000** | Answers the user's real question ("how much of this could I spend?"); over-saving is informational, not an imperative | Min-to-4000 (reads as "save less", which the product does not want to say) |
| D-10 | Tie in the worst estado → **name every** driving bucket, fixed order Necesidades → Gustos → Ahorro | Deterministic and lossless; hiding one of two red buckets is misinformation | Priority pick-one (order-dependent on an assembly detail) |
| D-11 | Advice is emitted **only if re-applying it verifiably lands Verde** (runtime post-condition) | Makes the R1 invariant unconditional instead of hoped-for; degrades pathological small-income months to "no advice" rather than wrong advice | Trusting the closed form alone (breaks when one peso spans a whole band) |
| D-12 | Second `PrismaResumenMesRepository` instance in the container, no `crear-*` helper | Matches the file's existing one-`new`-per-use-case style; helpers are for large sub-graphs | Sharing one reader instance (invisible coupling); a helper for a single line |

**D-08 in detail — two independent copy corrections, not one.**

(a) **Voseo → tuteo.** The proposal's paraphrase ("podés liberar") is voseo; every existing
user-facing string in `apps/web` is tuteo — evidence: `'Vuelve pronto…'` (`semaforo.tsx`),
`'Intenta nuevamente.'` (`client.ts`), `'Toca un ítem…'` (`ResumenScreen.tsx`), `'Inicia sesión de
nuevo.'` (`client.ts`). The implementation uses tuteo throughout for consistency with the rest of
the app.

(b) **Template restructure — dropping "sin salir de Verde".** This is not merely a re-voicing of
the proposal's Ahorro-high framing ("estás ahorrando por sobre la banda — podés liberar $X sin
salir de Verde"); it is a semantic correction. "Sin salir de Verde" is FALSE at the point this
sentence renders: the bucket's `estadoSemaforo` is already Amarillo/Rojo (§1.3 case (c) — the
bucket has already left Verde by definition of being above the band), so claiming the user hasn't
"left" Verde misstates the bucket's current state. The shipped template —
`'Estás ahorrando por sobre la banda: puedes liberar hasta {monto} y quedar en Verde.'` — uses
ceiling semantics instead: liberating up to `{monto}` is what RETURNS the bucket to Verde, not
something that happens "without leaving" it. The proposal's exact wording is explicitly
superseded by this design, not merely translated to tuteo.

(c) **Low-side template also superseded (symmetry note).** The proposal's low-side paraphrase
("para volver a Verde, Ahorro necesita subir $X" — impersonal) is likewise fully superseded by
the unified A1 template `'Para volver a Verde, {reduce|aumenta} {monto} en {etiqueta} este
mes.'` (user-directed imperative, consistent verb table across all buckets). No trace of the
proposal's "necesita subir" phrasing survives in the shipped copy.

**D-12 supersession note.** The proposal's Affected Areas row for `container.ts` mentions a
`crear-*` helper; that mention is superseded by D-12 — the wiring is one `new` inline in the
container (helpers exist for large sub-graphs like auth/ingesta, not single-line wiring). The
proposal is frozen; this note is the reconciliation of record.

---

## 3. Test ledger (TDD — tests first, per suite)

**Backend — 131 new/changed test cases**

| suite | status | cases | contents |
|-------|--------|-------|----------|
| `domain/value-objects/estado-semaforo.spec.ts` | MOD | **+5** | `BANDAS_SEMAFORO` has exactly 3 entries (1); values match the 8 documented constants, one test per bucket (3); `TARGETS_503020[b]*100 === Number(BANDAS_SEMAFORO[b].metaBp)` for the 3 buckets — makes the 50/30/20 duplication non-driftable (1). **The 39 existing cases must pass unchanged** (refactor regression gate) |
| `domain/value-objects/semaforo-detalle.spec.ts` | NEW | **102** | see breakdown below |
| `application/use-cases/obtener-semaforo-detalle.use-case.spec.ts` | NEW | **6** | periodo absent → `PeriodoMes.actual()` (1); periodo válido → reader receives it (1); periodo inválido → `Result.fail(PeriodoInvalidoError)`, reader NOT called (1); mes sin ingresos → `Result.ok` with `sinIngreso: true` (a valid response, not an error — CA-07) (1); `userId` flows verbatim to the reader (1); `logger.debug` receives counts only, no montos and no diagnosis text (1) |
| `infrastructure/http/dto/semaforo-detalle.dto.spec.ts` | NEW | **5** | BigInt→string for `totalIngreso`/`consejo.monto`/`sinCategoria.total` (1); bp/meta/band edges → numbers (1); estados → lowercase wire (1); `consejo: null` stays `null` (1); `bandas.verdeMin: null` preserved for unilateral buckets (1) |
| `infrastructure/http-express/schemas/semaforo-detalle.schema.spec.ts` | NEW | **2** | a real `aSemaforoDetalleDto(...)` output parses against `semaforoDetalleResponseSchema` (the sync guarantee, per `resumen.schema.spec.ts`) (1); schema rejects a `consejo.monto` sent as a JSON number (1) |
| `infrastructure/http-express/schemas/openapi-document.spec.ts` | MOD | **+1** | registers `GET /api/resumen/semaforo` with a `periodo` query param and a 200 response schema |
| `infrastructure/http-express/app.resumen-semaforo.spec.ts` | NEW | **5** | 401 sin `x-api-key` (1); 401 con api-key sin sesión (1); 200 con ambos + **el `userId` de la sesión fluye al use case** (RNF-SEC-006, per `app.buckets.spec.ts`) (1); 400 scrubbed en `PeriodoInvalidoError` — el input crudo no aparece en el body (1); el body 200 real cumple `semaforoDetalleResponseSchema` (1) |
| `test/resumen-semaforo.e2e-spec.ts` | NEW | **5** | sin `periodo` → 200 con el periodo UTC actual (1); `?periodo=not-a-date` → 400 scrubbed (1); DTO shape — 3 buckets, `bandas` presentes, `diagnostico` no vacío (1); mes vacío → `sinIngreso: true`, todos los `consejo: null`, `diagnostico` = D1 (1); **aislamiento de dos usuarios** — los datos del otro usuario no aparecen (1) |

`semaforo-detalle.spec.ts` breakdown (102):

**Table convention:** each `(N)` is the number of `it`/`it.each` test blocks that row contributes,
not the number of internal assertions inside those blocks. Group C's last row is one example:
it is **1** parametrized `it.each` test block that internally covers 4 bases × 3 scenarios (12
assertion cases), counted as `(1)` under this convention — consistent with the row's own total of
**47** (14 single-case items + 16 + 8 + 8 + this 1 = 47).

| group | cases | what |
|-------|-------|------|
| A — `montoMaximoConBpHasta` | **17** | worked example `base=1_000_000n, bpMax=5000n → 500_049n` (1); `it.each` over 8 bases `[1n, 2n, 3n, 7n, 10_000n, 999_999n, 1_000_000n, 1_234_567n]`: `bp(f(base)) ≤ bpMax` (8); minimality `bp(f(base)+1n) > bpMax` (8) |
| B — `montoMinimoConBpDesde` | **17** | worked example `base=1_000_000n, bpMin=2000n → 199_950n` (1); same 8 bases: `bp(f(base)) ≥ bpMin` (8); minimality `bp(f(base)-1n) < bpMin` (8) |
| C — `montoParaVerde` | **47** | Necesidades Verde → null (1); Necesidades Amarillo → exact `{reducir, monto}` (1); Necesidades Rojo → exact (1); Deseos Amarillo (1); Deseos Rojo (1); Ahorro Verde → null (1); Ahorro bp 1500 → exact `{aumentar}` (1); Ahorro bp 500 → exact `{aumentar}` (1); Ahorro bp 4500 → exact `{reducir}` (1); Ahorro bp 6000 → exact `{reducir}` (1); SinCategoria → null (1); Ingreso → null (1); `base === 0n` → null (1); pathological `base=1n` Ahorro → null via the D-11 guard (1); **R1 re-apply, unilateral**: 8 bases × 2 buckets, total forced to `tMax+1`, assert the returned advice re-applied yields `Verde` (16); **R1 re-apply, Ahorro low**: 8 bases (8); **R1 re-apply, Ahorro high**: 8 bases (8); "non-Verde with a realistic income always gets advice" — **1 parametrized `it.each` test block covering 4 bases × 3 scenarios (12 internal assertion cases, counted as 1 per the table convention above)** |
| D — `diagnosticar` | **9** | D1 on `estadoGlobal === null` (1); D2 all Verde (1); one driving bucket → `'Tu mes está en rojo por Necesidades.'` (1); Deseos driving → uses `'Gustos'` (1); two-way tie → `'… por Necesidades y Gustos.'` (1); three-way → `'… por Necesidades, Gustos y Ahorro.'` (1); Rojo + Amarillo → names only the Rojo (1); order is fixed regardless of input array order (1); never contains `{monto}` (1) |
| E — label map | **1** | `ETIQUETA_BUCKET_COPY` exact values (pins `'Gustos'`) |
| F — `mensajeConsejo` | **4** | `'excede'` exact template (1); `'ahorro-bajo'` exact (1); `'ahorro-alto'` exact (1); every case contains `{monto}` exactly once (1) |
| G — `construirSemaforoDetalle` | **7** | exactly 3 buckets in fixed order (1); `bandas` carried per bucket (1); `metaBp` 5000/3000/2000 (1); `bucketsCriticos` `[]` when Verde (1); `bucketsCriticos` names the drivers (1); `sinCategoria` `{cantidad,total}` carried from `ResumenMes` (1); `sinIngreso` → all consejos null, all estados null, `diagnostico` = D1 (1) |

**Web — 48 new test cases (+1 rewritten)**

| suite | status | cases | contents |
|-------|--------|-------|----------|
| `src/api/client.test.ts` | MOD | **+11** | `fetchSemaforoDetalle` 200 ok (1); 400 → `invalid` (1); 401 → `unauthorized` (1); 5xx → `server` (1); fetch rejection → `network` (1); non-JSON body → `parse` (1); **`consejo.monto: "12.5"` → `parse`** (money guard, WG5-05 lesson) (1); missing/non-string `diagnostico` → `parse` (1); non-array `buckets` → `parse` (1); malformed `sinCategoria.total` → `parse` (1); `periodo` is URL-encoded into the query (1) |
| `src/api/use-semaforo-detalle.test.ts` | NEW | **2** | `queryKey` is `['semaforo-detalle', periodo ?? 'actual']` (1); a typed `ApiError` surfaces as the query error (1) |
| `src/domain/semaforo-detalle-view-model.test.ts` | NEW | **12** | `{monto}` substituted with the formatted amount (1); no raw `{monto}` survives (1); a mensaje without the placeholder renders verbatim (defensive) (1); `porcentajeLabel` via the shared helper (1); `consejo: null` → no advice row (1); marker position `= bp/100` (1); `bp > 10000` clamps to 100 (1); unilateral bands start at 0 (1); Ahorro → 5 ordered contiguous segments (1); unilateral → 3 segments (1); widths sum to exactly 100 (1); `Meta: 50%` derived from `metaBp` (1) |
| `src/components/ZonaBar.test.tsx` | NEW | **5** | the coloured track is `aria-hidden` (1); bp, band edges and estado are present as accessible text (1); each segment has a text label — state is never conveyed by colour alone (1); the marker renders at the computed position (1); `porcentajeBp: null` → "Sin datos", no marker (1) |
| `src/components/SemaforoDetallePage.test.tsx` | NEW | **14** | loading → `Loading` (1); error → `ErrorState` + retry (1); header shows month + badge + the diagnosis literal (CA-01/02) (1); worst-of-3 explainer present (CA-03) (1); three bucket cards with % vs meta and estado (CA-04) (1); Amarillo/Rojo card shows the advice with the formatted amount (CA-05) (1); Verde card shows no advice (1); Ahorro low shows the "aumenta" framing (1); Ahorro high shows the informational framing (1); Sin categoría notice shows count + total and links to `/buckets/SinCategoria` carrying `periodo` (CA-06) (1); `sinIngreso` → explanation, no empty percentages (CA-07) (1); the header badge is the static `SemaforoBadge` (`role="img"`, not a link) (1); **no hardcoded threshold literal** — band edges rendered come from the fixture, and changing the fixture changes the render (R2) (1); exactly one `h1` (1) |
| `src/test/semaforo-route.test.tsx` | MOD | **+2** (1 rewritten) | rewritten: authenticated navigation renders the real page, no "en construcción" (1, replaces the existing case); NEW: "Volver al resumen" preserves `periodo` (CA-08 bug fix) (1); NEW: a deep link `?periodo=2026-07` reaches the hook with that period (1). The unauthenticated-redirect case stays untouched |
| `e2e/semaforo-detalle.e2e.ts` + `e2e/fixtures/api-stubs.ts` | NEW / MOD | **2** | deep link `/semaforo?periodo=2026-07` renders header + 3 cards + zone bar at a real viewport (1); "Volver al resumen" navigates to `/` keeping `?periodo=2026-07` (1). Fixture: `SEMAFORO_DETALLE_FIXTURE` + `page.route('**/api/resumen/semaforo*')`. **No ordering hazard** with the existing `**/api/resumen*` route — Playwright's `*` does not cross `/`, the same reason `/api/resumen/anual` already coexists |

**Totals: 131 backend + 48 web = 179 new test cases** (plus 1 rewritten web case and 39 backend
cases that must keep passing untouched as the refactor gate).

---

## 4. Impact sweep (verified with ripgrep, not assumed)

| symbol / file | call sites found | impact |
|---------------|------------------|--------|
| `calcularEstadoBucket` | `resumen-mes.ts:139` (1 production call), `estado-semaforo.spec.ts` (18 assertions), one comment in `reclasificar-categoria.int-spec.ts:383` | **Signature unchanged** → zero blast radius. Only the body changes |
| `estadoUnilateral` / `estadoAhorro` | private, not exported, 0 external references | Merged into `estadoDesdeBandas`; nothing else to update |
| `porcentajeBasisPoints` | unchanged, reused by the new module | none |
| `TARGETS_503020` | `resumen-mes.dto.ts:95-97`, `resumen-mes.spec.ts:61-65` | **Not touched.** The new `metaBp` lives in `BANDAS_SEMAFORO`; a consistency test forbids drift |
| `ResumenMes` / `construirResumenMesDesdeFilas` | reused as-is by the new use case | none |
| `Container` interface | `app.ts` + 11 `app.*.spec.ts` fakes | Adding an optional-in-practice field is safe: every fake casts `as unknown as Container`, so no existing fake needs editing (verified in `app.resumen.spec.ts` / `app.buckets.spec.ts`) |
| `SemaforoBadge` (web) | own file, own test, `eslint.config.js`, and several docstring mentions (`DemoBanner.tsx`, `ResumenScreen.tsx:78`, `SemaforoTag.tsx:12`, `ResumenScreen.test.tsx:386`, `semaforo-estilos.ts:29`) — **zero imports** | Confirms it is dead; D-06 adoption is genuine reuse. Closes #382 |
| `SIN_PORCENTAJE_LABEL` / `aPorcentajeLabel` | `resumen-view-model.ts` (private + 1 export) | Extraction keeps a re-export so importers/tests are untouched |
| `apps/mobile` | consumes `/api/resumen` via its own minimal client; no reference to any semáforo threshold or to `apps/api` source | **Zero mobile impact** — the new endpoint is additive and unconsumed there (proposal: mobile out of scope) |
| `apps/landing` | unrelated | none |
| `eslint.config.js` | US-047 block already globs `semaforo*.tsx` + `SemaforoBadge.tsx` | Add a US-049 file-list block for the 3 new components |

No Prisma schema change, no migration, no new env var, no new dependency (icons come from
`lucide-react`, already installed per ADR-027).

---

## 5. PR slicing suggestion (input for `sdd-tasks`)

Backend-first chain. The **US-045 cross-workspace lesson** is respected in PR #4: the OpenAPI
regen, the generated `types.gen.ts`, the `api-client` alias and the web type re-export **must
land in the same PR**, or `pnpm web typecheck` breaks on `main`.

| # | slice | files | tests | est. lines |
|---|-------|-------|-------|-----------|
| 1 | Bands on the table | `estado-semaforo.ts` + spec | +5 (39 must stay green) | ~130 |
| 2a | CLP-to-Verde arithmetic | `semaforo-detalle.ts` (helpers + `montoParaVerde`) + spec groups A/B/C | 81 | ~550 ⚠ |
| 2b | Copy + assembly | `semaforo-detalle.ts` (diagnóstico, mensajes, `construirSemaforoDetalle`) + spec groups D/E/F/G | 21 | ~280 |
| 3 | Use case | `obtener-semaforo-detalle.use-case.ts` + spec | 6 | ~180 |
| 4 | HTTP + contract chain | DTO, Zod schema, `openapi-document.ts`, route, `container.ts`, `openapi.json`, `types.gen.ts`, `api-client/src/index.ts`, `web/src/api/types.ts` + 4 suites | 13 | ~600 ⚠ (mostly generated) |
| 5 | Web data layer | `client.ts` (+ guard), `use-semaforo-detalle.ts`, `porcentaje.ts`, `semaforo-detalle-view-model.ts` + specs | 25 | ~380 |
| 6 | Web UI | `ZonaBar`, `BucketSemaforoCard`, `SemaforoDetallePage`, `semaforo.tsx`, `eslint.config.js`, route test, e2e + fixture | 23 | ~470 ⚠ |

**Review Workload Forecast:** ~2 590 changed lines across 7 PRs; three slices exceed the 400-line
budget (2a and 6 by test volume, 4 by generated artifacts). Chained PRs are **recommended**;
`feature-branch-chain` fits better than `stacked-to-main` here because PRs 4–6 are only
meaningful together (the endpoint has no consumer until PR 6). Decision needed before apply.

---

## 6. Risks carried into implementation

| risk | severity | mitigation in this design |
|------|----------|---------------------------|
| R1 CLP-to-Verde off-by-one | High | Closed-form inverses derived from `porcentajeBasisPoints` (§1.3), 34 boundary/minimality tests, 32 re-apply tests, **plus a runtime post-condition (D-11)** so wrong advice is impossible by construction |
| R2 band values drifting client-side | Med | Bands are on the wire and the classifier itself reads the table (D-02); a web test asserts no threshold literal exists in `apps/web` |
| Backend Spanish copy says `'Deseos'` while the card says `'Gustos'` | Med | `ETIQUETA_BUCKET_COPY` maps `Deseos → 'Gustos'`, pinned by test E; cross-reference comments in both `semaforo-detalle.ts` and `lib/bucket-colors.ts`. **Residual:** no automated gate can catch a future divergence between the two maps across workspaces — accepted, registered here |
| `{monto}` placeholder leaking to the DOM | Med | Backend test F4 (exactly one placeholder per mensaje, none in `diagnostico`) + web tests V1/V2 (substitution, no raw token) |
| Zone bar conveys state by colour alone | Med | Track/marker `aria-hidden`; bp, edges and estado as real text; scoped ESLint a11y ERROR block for the 3 new components |
| Refactoring a well-tested VO (`estado-semaforo.ts`) | Low | Case-by-case equivalence table (§1.1) + the 39 existing tests must pass **unedited**; if one needs editing, revert to a duplicated table |
| New route leaks another user's data | Low | `app.resumen-semaforo.spec.ts` (401 + session-derived `userId`) and an e2e two-user isolation test, per `app.buckets.spec.ts` |
| Test volume (179 cases) inflating PR size | Low | Slicing in §5; `size:exception` expected on PRs 2a, 4 and 6 |
