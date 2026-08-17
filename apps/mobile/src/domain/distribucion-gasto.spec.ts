import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BUCKETS_5030,
  BUCKETS_ANILLO,
  calcularDistribucionGasto,
} from './distribucion-gasto';
import { CASOS_PARIDAD_ANILLO } from './__fixtures__/distribucion-anillo.fixture';

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
    // 33.33 c/u — con remanentes empatados, el punto sobrante va al primer
    // bucket (desempate estable). Lo que importa es que sumen 100.
    expect(tajadas.map((t) => t.porcentaje)).toEqual([34, 33, 33]);
    expect(tajadas.reduce((s, t) => s + t.porcentaje, 0)).toBe(100);
  });

  // US-050 (design §1.2, WG5-13): inverted, not deleted — SinCategoria now
  // DILUTES the three spend-bucket ring percentages instead of being
  // excluded from the denominator. This is the semantic core of the change.
  it('incluye SinCategoria en el anillo y en el denominador (WG5-13)', () => {
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
      'SinCategoria',
    ]);
    // Diluted against the 4-item total (1_999_999), not the 3-item total
    // (1_000_000) — 50/30/20 would be the OLD, excluded-denominator reading.
    expect(tajadas.map((t) => t.porcentaje)).toEqual([25, 15, 10, 50]);
  });

  // US-050 (design §1.2/§2 D-05): ring order + membership pinned as a
  // literal-array assertion, not an implementation detail.
  it('BUCKETS_ANILLO termina en SinCategoria y BUCKETS_5030 la excluye', () => {
    expect(BUCKETS_5030).toEqual(['Necesidades', 'Deseos', 'Ahorro']);
    expect(BUCKETS_ANILLO).toEqual([
      'Necesidades',
      'Deseos',
      'Ahorro',
      'SinCategoria',
    ]);
  });

  it('los cuatro porcentajes del anillo SIEMPRE suman 100, con SinCategoria no-cero', () => {
    const tajadas = calcularDistribucionGasto([
      bucket('Necesidades', '1'),
      bucket('Deseos', '1'),
      bucket('Ahorro', '1'),
      bucket('SinCategoria', '1'),
    ]);
    expect(tajadas.map((t) => t.porcentaje)).toEqual([25, 25, 25, 25]);
    expect(tajadas.reduce((s, t) => s + t.porcentaje, 0)).toBe(100);
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

  it('es BigInt-safe: montos por encima de 2^53 no pierden precisión en la razón', () => {
    // 2^53 = 9007199254740992. Con number, (2^53+1) === (2^53) → colapsaría.
    const tajadas = calcularDistribucionGasto([
      bucket('Necesidades', '9007199254740992'),
      bucket('Ahorro', '9007199254740992'),
    ]);
    expect(tajadas.map((t) => t.porcentaje)).toEqual([50, 50]);
    expect(tajadas[0].fraccion).toBeCloseTo(0.5, 6);
  });

  // US-050 (design §2 D-09): runs mobile's OWN calcularDistribucionGasto
  // against the shared ring-parity fixture table. apps/web runs the same
  // table against ITS own implementation (distribucion-gasto.test.ts).
  it.each(CASOS_PARIDAD_ANILLO)(
    'paridad de anillo: $nombre',
    ({ buckets, esperado }) => {
      const tajadas = calcularDistribucionGasto(buckets);
      expect(tajadas.map((t) => [t.bucket, t.porcentaje])).toEqual(esperado);
    },
  );

  // US-050 (design §2 D-09): guard de bytes — si cualquiera de los dos
  // fixtures se edita unilateralmente, este test se pone en rojo, porque
  // mobile es la copia que históricamente se desincronizó.
  it('el fixture de paridad de anillo es byte-idéntico entre mobile y web (D-09)', () => {
    const rutaMobile = path.join(
      __dirname,
      '__fixtures__',
      'distribucion-anillo.fixture.ts',
    );
    const rutaWeb = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'web',
      'src',
      'domain',
      '__fixtures__',
      'distribucion-anillo.fixture.ts',
    );
    const contenidoMobile = fs.readFileSync(rutaMobile, 'utf-8');
    const contenidoWeb = fs.readFileSync(rutaWeb, 'utf-8');
    expect(contenidoMobile).toBe(contenidoWeb);
  });
});
