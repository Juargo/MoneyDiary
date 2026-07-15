import { calcularDistribucionGasto } from './distribucion-gasto';

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

  it('excluye SinCategoria del pie y del denominador', () => {
    const tajadas = calcularDistribucionGasto([
      bucket('Necesidades', '500000'),
      bucket('Deseos', '300000'),
      bucket('Ahorro', '200000'),
      bucket('SinCategoria', '999999'),
    ]);
    expect(tajadas.map((t) => t.bucket)).toEqual(['Necesidades', 'Deseos', 'Ahorro']);
    expect(tajadas.map((t) => t.porcentaje)).toEqual([50, 30, 20]);
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
});
