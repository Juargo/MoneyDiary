import { calcularAngulos, arcoPath } from './pie-geometry';

describe('calcularAngulos', () => {
  it('acumula fracciones en tramos [inicio, fin] en grados, arrancando en 0', () => {
    expect(calcularAngulos([0.5, 0.25, 0.25])).toEqual([
      { inicio: 0, fin: 180 },
      { inicio: 180, fin: 270 },
      { inicio: 270, fin: 360 },
    ]);
  });

  it('cierra SIEMPRE en 360 aunque las fracciones no sumen exacto (truncamiento BigInt)', () => {
    const angulos = calcularAngulos([0.333333, 0.333333, 0.333333]);
    expect(angulos[angulos.length - 1].fin).toBe(360);
  });

  it('una sola fracción completa cubre el círculo entero', () => {
    expect(calcularAngulos([1])).toEqual([{ inicio: 0, fin: 360 }]);
  });
});

describe('arcoPath', () => {
  it('arranca en el centro y cierra el wedge (Z)', () => {
    const d = arcoPath(100, 100, 80, 0, 90);
    expect(d.startsWith('M 100 100')).toBe(true);
    expect(d.trim().endsWith('Z')).toBe(true);
    expect(d).toContain('A 80 80');
  });

  it('marca large-arc-flag=1 cuando el barrido supera 180°', () => {
    const chico = arcoPath(100, 100, 80, 0, 90); // 90° → flag 0
    const grande = arcoPath(100, 100, 80, 0, 270); // 270° → flag 1
    expect(chico).toContain('A 80 80 0 0 1');
    expect(grande).toContain('A 80 80 0 1 1');
  });

  it('un barrido completo (0→360) produce un path cerrado sin NaN', () => {
    const d = arcoPath(100, 100, 80, 0, 360);
    expect(d).not.toContain('NaN');
    expect(d.trim().endsWith('Z')).toBe(true);
  });
});
