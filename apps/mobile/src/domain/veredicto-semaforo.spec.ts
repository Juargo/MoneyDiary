import {
  construirVeredictoSemaforo,
  type BucketVeredicto,
} from './veredicto-semaforo';

/**
 * construirVeredictoSemaforo — semáforo hero redesign (2026-08-30): the
 * tinted verdict box explains WHY the month verdict is what it is, from the
 * per-bucket estados the backend already computed (verbatim pass-through,
 * ADR-024 — this function only phrases, never recomputes). Copy matrix is
 * authoritative — see the function's docstring.
 */
describe('construirVeredictoSemaforo (mobile port)', () => {
  const buckets = (estados: readonly (string | null)[]): BucketVeredicto[] =>
    ['Necesidades', 'Gustos', 'Ahorro'].map((nombre, i) => ({
      nombre,
      estado: estados[i] ?? null,
    }));

  it('verde: names every bucket as within plan', () => {
    expect(
      construirVeredictoSemaforo('verde', buckets(['verde', 'verde', 'verde'])),
    ).toEqual({
      lead: 'Tu veredicto es Muy Saludable.',
      detalle: 'Necesidades, Gustos y Ahorro están dentro del plan este mes.',
    });
  });

  it('amarillo with a single tight bucket: names it singular', () => {
    expect(
      construirVeredictoSemaforo(
        'amarillo',
        buckets(['verde', 'amarillo', 'verde']),
      ),
    ).toEqual({
      lead: 'Tu veredicto es Saludable.',
      detalle: 'Gustos va ajustado este mes; el resto está en rango.',
    });
  });

  it('amarillo with two tight buckets: plural agreement', () => {
    expect(
      construirVeredictoSemaforo(
        'amarillo',
        buckets(['amarillo', 'verde', 'amarillo']),
      ),
    ).toEqual({
      lead: 'Tu veredicto es Saludable.',
      detalle:
        'Necesidades y Ahorro van ajustados este mes; el resto está en rango.',
    });
  });

  it('amarillo with all three tight: drops the "el resto" clause', () => {
    expect(
      construirVeredictoSemaforo(
        'amarillo',
        buckets(['amarillo', 'amarillo', 'amarillo']),
      ),
    ).toEqual({
      lead: 'Tu veredicto es Saludable.',
      detalle: 'Necesidades, Gustos y Ahorro van ajustados este mes.',
    });
  });

  it('rojo with one bucket out of range: highest-risk explanation (mock copy)', () => {
    expect(
      construirVeredictoSemaforo('rojo', buckets(['verde', 'rojo', 'verde'])),
    ).toEqual({
      lead: 'Tu veredicto es En peligro.',
      detalle:
        'Aunque Necesidades y Ahorro están en rango, Gustos queda fuera de rango y define el estado global de este mes siguiendo la lógica de mayor riesgo.',
    });
  });

  it('rojo with two buckets out and one in: singular "está", plural "quedan/definen"', () => {
    expect(
      construirVeredictoSemaforo('rojo', buckets(['rojo', 'rojo', 'amarillo'])),
    ).toEqual({
      lead: 'Tu veredicto es En peligro.',
      detalle:
        'Aunque Ahorro está en rango, Necesidades y Gustos quedan fuera de rango y definen el estado global de este mes siguiendo la lógica de mayor riesgo.',
    });
  });

  it('rojo with every bucket out of range: no "aunque" clause', () => {
    expect(
      construirVeredictoSemaforo('rojo', buckets(['rojo', 'rojo', 'rojo'])),
    ).toEqual({
      lead: 'Tu veredicto es En peligro.',
      detalle: 'Necesidades, Gustos y Ahorro quedan fuera de rango este mes.',
    });
  });

  // Missing/inconsistent bucket data never crashes the hero — each estado
  // degrades to a self-contained fallback line (no bucket names).
  it.each([
    [
      'verde',
      'Tu veredicto es Muy Saludable.',
      'Tus gastos del mes están dentro del plan.',
    ],
    [
      'amarillo',
      'Tu veredicto es Saludable.',
      'Vas ajustado este mes; revisa el detalle para no pasarte.',
    ],
    [
      'rojo',
      'Tu veredicto es En peligro.',
      'Te pasaste del plan este mes; revisa el detalle para ver dónde.',
    ],
  ])(
    '%s with no bucket data falls back to the per-estado line',
    (estado, lead, detalle) => {
      expect(construirVeredictoSemaforo(estado, [])).toEqual({ lead, detalle });
    },
  );

  it('amarillo whose buckets carry no amarillo (inconsistent data) falls back', () => {
    expect(
      construirVeredictoSemaforo(
        'amarillo',
        buckets(['verde', 'verde', 'verde']),
      ),
    ).toEqual({
      lead: 'Tu veredicto es Saludable.',
      detalle: 'Vas ajustado este mes; revisa el detalle para no pasarte.',
    });
  });

  it('rojo whose buckets carry no rojo (inconsistent data) falls back', () => {
    expect(
      construirVeredictoSemaforo(
        'rojo',
        buckets(['verde', 'amarillo', 'verde']),
      ),
    ).toEqual({
      lead: 'Tu veredicto es En peligro.',
      detalle:
        'Te pasaste del plan este mes; revisa el detalle para ver dónde.',
    });
  });

  it('null estadoGlobal has no verdict', () => {
    expect(construirVeredictoSemaforo(null, [])).toBeNull();
  });

  it('unknown estado never coerces into a verdict', () => {
    expect(
      construirVeredictoSemaforo(
        'fucsia',
        buckets(['verde', 'verde', 'verde']),
      ),
    ).toBeNull();
  });

  it('prototype-chain keys (e.g. "toString") never coerce into a verdict', () => {
    expect(
      construirVeredictoSemaforo(
        'toString',
        buckets(['verde', 'verde', 'verde']),
      ),
    ).toBeNull();
  });
});
