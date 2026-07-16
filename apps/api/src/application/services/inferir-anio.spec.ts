import { inferirAnios } from './inferir-anio';

describe('inferirAnios', () => {
  it('retorna un arreglo vacío para un arreglo de meses vacío', () => {
    expect(inferirAnios([], 2026)).toEqual([]);
  });

  it('un solo mes usa el año inicial', () => {
    expect(inferirAnios([4], 2026)).toEqual([2026]);
  });

  it('meses ascendentes dentro del mismo año no incrementan el año', () => {
    expect(inferirAnios([3, 4, 5], 2026)).toEqual([2026, 2026, 2026]);
  });

  it('meses repetidos (varios movimientos el mismo mes) no incrementan el año', () => {
    expect(inferirAnios([3, 3, 3], 2026)).toEqual([2026, 2026, 2026]);
  });

  it('cruce de diciembre a enero incrementa el año, y el resto de la fila queda en el año nuevo', () => {
    expect(inferirAnios([11, 12, 1, 2], 2025)).toEqual([
      2025, 2025, 2026, 2026,
    ]);
  });

  it('un statement que empieza y termina en el mismo mes de diciembre a enero (borde exacto)', () => {
    expect(inferirAnios([12, 1], 2025)).toEqual([2025, 2026]);
  });
});
