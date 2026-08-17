/**
 * D-09 ring-parity fixture (US-050, design.md §2 "D-09 in detail"): both
 * apps/mobile and apps/web run their OWN `calcularDistribucionGasto`
 * against this SAME case table via `it.each`. This file MUST stay
 * byte-identical to its twin — a dedicated spec (mobile side) asserts that
 * with `fs.readFileSync`, turning silent drift between the two ports into a
 * red build instead of a silent divergence.
 *
 * Twin: apps/web/src/domain/__fixtures__/distribucion-anillo.fixture.ts
 *
 * Only default-path (4-item `BUCKETS_ANILLO`) cases live here — mobile does
 * not port web's trailing optional `bucketsIncluidos` parameter (D-08), so a
 * case exercising it would not be parity between the two ports.
 */
export const CASOS_PARIDAD_ANILLO = [
  {
    nombre: 'dilución 4 items (WG5-13)',
    buckets: [
      { bucket: 'Necesidades', total: '500000' },
      { bucket: 'Deseos', total: '300000' },
      { bucket: 'Ahorro', total: '200000' },
      { bucket: 'SinCategoria', total: '999999' },
    ],
    esperado: [
      ['Necesidades', 25],
      ['Deseos', 15],
      ['Ahorro', 10],
      ['SinCategoria', 50],
    ],
  },
  {
    nombre: 'mockup 77/12/11 con SinCategoria = 0',
    buckets: [
      { bucket: 'Necesidades', total: '770000' },
      { bucket: 'Deseos', total: '120000' },
      { bucket: 'Ahorro', total: '110000' },
      { bucket: 'SinCategoria', total: '0' },
    ],
    esperado: [
      ['Necesidades', 77],
      ['Deseos', 12],
      ['Ahorro', 11],
      ['SinCategoria', 0],
    ],
  },
  {
    nombre: 'cuatro unos → 25/25/25/25 (suman 100)',
    buckets: [
      { bucket: 'Necesidades', total: '1' },
      { bucket: 'Deseos', total: '1' },
      { bucket: 'Ahorro', total: '1' },
      { bucket: 'SinCategoria', total: '1' },
    ],
    esperado: [
      ['Necesidades', 25],
      ['Deseos', 25],
      ['Ahorro', 25],
      ['SinCategoria', 25],
    ],
  },
  {
    nombre: 'sin gasto → []',
    buckets: [
      { bucket: 'Necesidades', total: '0' },
      { bucket: 'Deseos', total: '0' },
      { bucket: 'Ahorro', total: '0' },
      { bucket: 'SinCategoria', total: '0' },
    ],
    esperado: [],
  },
  {
    nombre: 'total malformado degrada a 0, no lanza',
    buckets: [
      { bucket: 'Necesidades', total: '500000' },
      { bucket: 'Deseos', total: '' },
      { bucket: 'Ahorro', total: 'abc' },
    ],
    esperado: [
      ['Necesidades', 100],
      ['Deseos', 0],
      ['Ahorro', 0],
    ],
  },
  {
    nombre: 'bucket en 0 mezclado no produce NaN',
    buckets: [
      { bucket: 'Necesidades', total: '600000' },
      { bucket: 'Deseos', total: '400000' },
      { bucket: 'Ahorro', total: '0' },
    ],
    esperado: [
      ['Necesidades', 60],
      ['Deseos', 40],
      ['Ahorro', 0],
    ],
  },
  {
    nombre: 'BigInt-safe sobre 2^53',
    buckets: [
      { bucket: 'Necesidades', total: '9007199254740992' },
      { bucket: 'Ahorro', total: '9007199254740992' },
    ],
    esperado: [
      ['Necesidades', 50],
      ['Ahorro', 50],
    ],
  },
] as const;
