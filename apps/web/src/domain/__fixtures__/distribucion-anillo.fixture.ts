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
 * Only default-path (`BUCKETS_ANILLO`) cases live here — mobile does not
 * port web's trailing optional `bucketsIncluidos` parameter (D-08), so a
 * case exercising it would not be parity between the two ports.
 *
 * Issue #778 tramo5b PR2: `BUCKETS_ANILLO` dropped `SinCategoria` on BOTH
 * apps (apps/web PR1, apps/mobile this PR) — it is now the SAME 3-item set
 * as `BUCKETS_5030` on both sides. Every case below that still feeds a
 * `SinCategoria` entry does so ON PURPOSE, to prove both ports ignore it —
 * it never appears in `esperado` and never enters the denominator.
 */
export const CASOS_PARIDAD_ANILLO = [
  {
    nombre:
      'SinCategoria en la entrada no aparece y no diluye el denominador (issue #778)',
    buckets: [
      { bucket: 'Necesidades', total: '500000' },
      { bucket: 'Deseos', total: '300000' },
      { bucket: 'Ahorro', total: '200000' },
      { bucket: 'SinCategoria', total: '999999' },
    ],
    esperado: [
      ['Necesidades', 50],
      ['Deseos', 30],
      ['Ahorro', 20],
    ],
  },
  {
    nombre: 'mockup 77/12/11 no se distorsiona con SinCategoria en 0',
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
    ],
  },
  {
    nombre:
      'mockup 77/12/11 tampoco se distorsiona con SinCategoria con plata (issue #778)',
    buckets: [
      { bucket: 'Necesidades', total: '770000' },
      { bucket: 'Deseos', total: '120000' },
      { bucket: 'Ahorro', total: '110000' },
      { bucket: 'SinCategoria', total: '999999' },
    ],
    esperado: [
      ['Necesidades', 77],
      ['Deseos', 12],
      ['Ahorro', 11],
    ],
  },
  {
    nombre: 'tres unos con SinCategoria ignorada → 34/33/33 (suman 100)',
    buckets: [
      { bucket: 'Necesidades', total: '1' },
      { bucket: 'Deseos', total: '1' },
      { bucket: 'Ahorro', total: '1' },
      { bucket: 'SinCategoria', total: '1' },
    ],
    esperado: [
      ['Necesidades', 34],
      ['Deseos', 33],
      ['Ahorro', 33],
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
  {
    // Empate genuino en el remanente: Necesidades y Deseos quedan ambos con
    // remanente exacto 0.5 (25.5% y 24.5% antes de redondear) compitiendo por
    // el único punto sobrante (resto=1). `apportionarLargestRemainder` usa
    // `Array.prototype.sort`, que es estable (spec ECMAScript, garantizado
    // desde ES2019) — a igual remanente, gana el bucket con menor índice
    // ORIGINAL en `bucketsIncluidos` (orden de `BUCKETS_ANILLO`), no un
    // desempate explícito por nombre. Por eso Necesidades (índice 0) se lleva
    // el punto y queda en 26%, mientras Deseos (índice 1, mismo remanente)
    // se queda en 24%. `SinCategoria` carga un monto grande a propósito
    // (500) — si entrara al denominador (total 700 en vez de 200) rompería
    // el empate exacto que este caso ejercita; queda ignorada (issue #778).
    nombre:
      'empate genuino de remanente (25.5% vs 24.5%) — gana el índice menor, SinCategoria ignorada',
    buckets: [
      { bucket: 'Necesidades', total: '51' },
      { bucket: 'Deseos', total: '49' },
      { bucket: 'Ahorro', total: '100' },
      { bucket: 'SinCategoria', total: '500' },
    ],
    esperado: [
      ['Necesidades', 26],
      ['Deseos', 24],
      ['Ahorro', 50],
    ],
  },
] as const;
