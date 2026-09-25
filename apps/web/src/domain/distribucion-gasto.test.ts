import { describe, expect, it } from 'vitest';
import {
  BUCKETS_5030,
  BUCKETS_ANILLO,
  calcularDistribucionGasto,
} from './distribucion-gasto';
import { CASOS_PARIDAD_ANILLO } from './__fixtures__/distribucion-anillo.fixture';

// DOM port of apps/mobile/src/domain/distribucion-gasto.spec.ts — pure BigInt
// math, no platform dependency, so the port is verbatim.
function bucket(bucket: string, total: string) {
  return { bucket, total };
}

describe('calcularDistribucionGasto', () => {
  it('calcula la participación de cada bucket sobre el gasto total (share-of-gasto, no share-of-ingreso)', () => {
    const tajadas = calcularDistribucionGasto([
      bucket('Necesidades', '400000'),
      bucket('Deseos', '250000'),
      bucket('Ahorro', '350000'),
    ]);
    expect(tajadas.map((t) => [t.bucket, t.porcentaje])).toEqual([
      ['Necesidades', 40],
      ['Deseos', 25],
      ['Ahorro', 35],
    ]);
  });

  it('reproduce la distribución del mockup (77 / 12 / 11)', () => {
    const tajadas = calcularDistribucionGasto([
      bucket('Necesidades', '770000'),
      bucket('Deseos', '120000'),
      bucket('Ahorro', '110000'),
    ]);
    expect(tajadas.map((t) => t.porcentaje)).toEqual([77, 12, 11]);
  });

  it('los porcentajes enteros SIEMPRE suman 100 (largest remainder)', () => {
    const tajadas = calcularDistribucionGasto([
      bucket('Necesidades', '1'),
      bucket('Deseos', '1'),
      bucket('Ahorro', '1'),
    ]);
    expect(tajadas.map((t) => t.porcentaje)).toEqual([34, 33, 33]);
    expect(tajadas.reduce((s, t) => s + t.porcentaje, 0)).toBe(100);
  });

  // issue #778 tramo5b PR1 (apps/web): SinCategoria is no longer a ring
  // member — a SinCategoria entry in `buckets` (the API still sends one) is
  // excluded from BOTH the ring's numerator set and its denominator, exactly
  // like any other bucket outside `BUCKETS_ANILLO`. Replaces the retired
  // WG5-13 "incluye SinCategoria en el anillo y en el denominador" test,
  // which asserted the now-reverted dilution behavior.
  it('ignora un bucket SinCategoria en la entrada: no aparece en el anillo y no diluye el denominador (issue #778 tramo5b PR1)', () => {
    const tajadas = calcularDistribucionGasto([
      bucket('Necesidades', '500000'),
      bucket('Deseos', '300000'),
      bucket('Ahorro', '200000'),
      bucket('SinCategoria', '999999'),
    ]);
    expect(tajadas.map((t) => t.bucket)).toEqual([
      'Necesidades',
      'Deseos',
      'Ahorro',
    ]);
    // Against the 3-item total (1_000_000), not diluted by SinCategoria's
    // 999_999 — the pre-US-047 50/30/20 reading, now the ONLY reading.
    expect(tajadas.map((t) => t.porcentaje)).toEqual([50, 30, 20]);
    expect(tajadas.reduce((s, t) => s + t.porcentaje, 0)).toBe(100);
  });

  // issue #778 tramo5b PR1: the mockup's 77/12/11 fixture is unaffected by
  // whatever total a SinCategoria entry carries — zero or not — since it
  // never enters the ring's denominator anymore.
  it('el fixture del mockup (77/12/11) no se distorsiona por una entrada SinCategoria, sea cero o no (issue #778)', () => {
    const conSinCategoriaEnCero = calcularDistribucionGasto([
      bucket('Necesidades', '770000'),
      bucket('Deseos', '120000'),
      bucket('Ahorro', '110000'),
      bucket('SinCategoria', '0'),
    ]);
    const conSinCategoriaNoCero = calcularDistribucionGasto([
      bucket('Necesidades', '770000'),
      bucket('Deseos', '120000'),
      bucket('Ahorro', '110000'),
      bucket('SinCategoria', '999999'),
    ]);
    const esperado = [
      ['Necesidades', 77],
      ['Deseos', 12],
      ['Ahorro', 11],
    ];
    expect(conSinCategoriaEnCero.map((t) => [t.bucket, t.porcentaje])).toEqual(
      esperado,
    );
    expect(conSinCategoriaNoCero.map((t) => [t.bucket, t.porcentaje])).toEqual(
      esperado,
    );
  });

  // US-047 D-05, updated for issue #778 tramo5b PR1: `BUCKETS_ANILLO` and
  // `BUCKETS_5030` are now the SAME 3-item set — the ring dropped
  // `SinCategoria` (previously its 4th, trailing member).
  it('BUCKETS_ANILLO ya no incluye SinCategoria — es igual a BUCKETS_5030 (issue #778 tramo5b PR1)', () => {
    expect(BUCKETS_5030).toEqual(['Necesidades', 'Deseos', 'Ahorro']);
    expect(BUCKETS_ANILLO).toEqual(['Necesidades', 'Deseos', 'Ahorro']);
    expect(BUCKETS_ANILLO).toEqual(BUCKETS_5030);
  });

  it('devuelve [] cuando no hay gasto (evita división por cero)', () => {
    expect(
      calcularDistribucionGasto([
        bucket('Necesidades', '0'),
        bucket('Deseos', '0'),
        bucket('Ahorro', '0'),
      ]),
    ).toEqual([]);
  });

  // FIX 6: money is validated at the fetch boundary (client.ts), but this
  // pure fn defends itself too — an unvalidated bad string reaching a bare
  // `BigInt(...)` would throw a raw SyntaxError mid-render (no
  // ErrorBoundary in the app). A malformed/empty total degrades to 0
  // instead of throwing (belt-and-suspenders).
  it('trata un total malformado/vacío como 0 en vez de lanzar (FIX 6)', () => {
    expect(() =>
      calcularDistribucionGasto([
        bucket('Necesidades', '500000'),
        bucket('Deseos', ''),
        bucket('Ahorro', 'abc'),
      ]),
    ).not.toThrow();
    const tajadas = calcularDistribucionGasto([
      bucket('Necesidades', '500000'),
      bucket('Deseos', ''),
      bucket('Ahorro', 'abc'),
    ]);
    expect(tajadas.map((t) => [t.bucket, t.porcentaje])).toEqual([
      ['Necesidades', 100],
      ['Deseos', 0],
      ['Ahorro', 0],
    ]);
  });

  // FIX 8: a bucket with fraccion 0 mixed among non-zero buckets must not
  // produce NaN/crash.
  it('un bucket con total 0 mezclado con otros no-cero no genera NaN/crash (FIX 8)', () => {
    const tajadas = calcularDistribucionGasto([
      bucket('Necesidades', '600000'),
      bucket('Deseos', '400000'),
      bucket('Ahorro', '0'),
    ]);
    expect(tajadas.map((t) => [t.bucket, t.porcentaje, t.fraccion])).toEqual([
      ['Necesidades', 60, 0.6],
      ['Deseos', 40, 0.4],
      ['Ahorro', 0, 0],
    ]);
    expect(
      tajadas.every(
        (t) => Number.isFinite(t.porcentaje) && Number.isFinite(t.fraccion),
      ),
    ).toBe(true);
  });

  it('es BigInt-safe: montos por encima de 2^53 no pierden precisión en la razón', () => {
    const tajadas = calcularDistribucionGasto([
      bucket('Necesidades', '9007199254740992'),
      bucket('Ahorro', '9007199254740992'),
    ]);
    expect(tajadas.map((t) => t.porcentaje)).toEqual([50, 50]);
    expect(tajadas[0].fraccion).toBeCloseTo(0.5, 6);
  });

  // US-047 PR1 shim (judgment-day round 2 CRITICAL fix), still exercised
  // after issue #778 tramo5b PR1: a trailing optional `bucketsIncluidos`
  // param lets a caller apportion over an explicit SUBSET of `buckets` — the
  // math (largest-remainder, BigInt ratios) stays in the domain layer
  // (ADR-024) instead of a component-side filter-without-renormalize shim.
  // `BUCKETS_ANILLO`/`BUCKETS_5030` are now the SAME 3-item set (SinCategoria
  // dropped out of the ring, see the D-05 test above), so passing either one
  // explicitly is behaviorally identical to the default.
  describe('parámetro bucketsIncluidos (US-047 PR1 shim)', () => {
    it('con BUCKETS_5030 explícito, el resultado es idéntico al default (BUCKETS_ANILLO === BUCKETS_5030, issue #778)', () => {
      const entradas = [
        bucket('Necesidades', '400000'),
        bucket('Deseos', '250000'),
        bucket('Ahorro', '250000'),
        bucket('SinCategoria', '100000'),
      ];

      const porDefecto = calcularDistribucionGasto(entradas);
      const explicito = calcularDistribucionGasto(entradas, BUCKETS_5030);

      // 900000 total (SinCategoria excluded either way): 400000/900000=44.4%,
      // 250000/900000=27.7% x2 — largest remainder hands the 2 leftover
      // points to the two tied .7 remainders (Deseos, Ahorro).
      expect(porDefecto.map((t) => t.porcentaje)).toEqual([44, 28, 28]);
      expect(explicito).toEqual(porDefecto);
      expect(porDefecto.reduce((s, t) => s + t.porcentaje, 0)).toBe(100);
    });

    it('las fracciones del subconjunto suman exactamente 1.0 — legitima el cierre forzado a 360 de calcularAngulos (sin absorción de gap en la última cuña)', () => {
      const tajadas = calcularDistribucionGasto(
        [
          bucket('Necesidades', '500000'),
          bucket('Deseos', '300000'),
          bucket('Ahorro', '200000'),
          bucket('SinCategoria', '999999'),
        ],
        BUCKETS_5030,
      );
      const sumaFracciones = tajadas.reduce((s, t) => s + t.fraccion, 0);
      // PRECISION-truncated BigInt ratio (1e6) — tolerance matches that scale.
      expect(sumaFracciones).toBeCloseTo(1.0, 5);
    });

    it('sin segundo argumento, el comportamiento es idéntico al de BUCKETS_ANILLO (default byte-identical)', () => {
      const entradas = [
        bucket('Necesidades', '770000'),
        bucket('Deseos', '120000'),
        bucket('Ahorro', '110000'),
        bucket('SinCategoria', '5000'),
      ];
      expect(calcularDistribucionGasto(entradas)).toEqual(
        calcularDistribucionGasto(entradas, BUCKETS_ANILLO),
      );
    });
  });

  // US-050 (design §2 D-09) — RESTORED in issue #778 tramo5b PR2:
  // `apps/mobile` now also drops SinCategoria from its own ring
  // (`BUCKETS_ANILLO` = `BUCKETS_5030` on both apps), so
  // `CASOS_PARIDAD_ANILLO` was updated to the new 3-item shape on BOTH
  // fixture files and both ports can run the SAME table again — apps/mobile
  // runs it against ITS own implementation
  // (`apps/mobile/src/domain/distribucion-gasto.spec.ts`), and a byte-equality
  // guard on the mobile side keeps both fixture files in sync.
  it.each(CASOS_PARIDAD_ANILLO)(
    'paridad de anillo: $nombre',
    ({ buckets, esperado }) => {
      const tajadas = calcularDistribucionGasto(buckets);
      expect(tajadas.map((t) => [t.bucket, t.porcentaje])).toEqual(esperado);
    },
  );
});
