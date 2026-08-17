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

This is a stub showing the structure. The full design.md is 689 lines long and has been archived successfully.
