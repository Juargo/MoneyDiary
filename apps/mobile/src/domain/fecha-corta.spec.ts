import { aDiaConSemana, aFechaCorta, aFechaLargaLabel } from './fecha-corta';

// T-04 RED: unit specs for aFechaCorta (US-056, D-14/T-C3)

describe('aFechaCorta', () => {
  it('slices ISO string to YYYY-MM-DD', () => {
    expect(aFechaCorta('2026-07-19T00:00:00.000Z')).toBe('2026-07-19');
  });

  it('passthrough on short/malformed input', () => {
    expect(aFechaCorta('2026-07')).toBe('2026-07');
  });
});

// bucket-detalle-lista-rediseño mobile port (Cambio 2): verbatim port of
// apps/web/src/domain/fecha.ts's aDiaConSemana/aFechaLargaLabel.
describe('aDiaConSemana', () => {
  it("splits an ISO timestamp into { dia: '03', diaSemana: 'lun' }", () => {
    expect(aDiaConSemana('2026-08-03T00:00:00.000Z')).toEqual({
      dia: '03',
      diaSemana: 'lun',
    });
  });

  it('lowercases diaSemana (uppercase is a presentation concern, not domain)', () => {
    const { diaSemana } = aDiaConSemana('2026-08-03T00:00:00.000Z');
    expect(diaSemana).toBe(diaSemana.toLowerCase());
  });

  it(
    'resolves the weekday in UTC, no local-time drift: 2026-08-03T00:00:00.000Z ' +
      "is Monday in UTC but would read as Sunday under Chile's UTC-4 offset " +
      '(2026-08-02T20:00:00 local) if this helper ever did local-time Date math',
    () => {
      expect(aDiaConSemana('2026-08-03T00:00:00.000Z').diaSemana).toBe('lun');
    },
  );

  it('never throws on an unparseable fechaIso — dia keeps the positional slice, diaSemana is empty', () => {
    // 'not-a-date' is 10 chars: slice(8, 10) === 'te' (same positional
    // slice dia always takes, unparseable or not) — only diaSemana needs
    // Date math, so only diaSemana degrades to ''.
    expect(aDiaConSemana('not-a-date')).toEqual({ dia: 'te', diaSemana: '' });
  });
});

describe('aFechaLargaLabel', () => {
  it("formats an ISO timestamp as '3 de agosto de 2026' (day not zero-padded)", () => {
    expect(aFechaLargaLabel('2026-08-03T00:00:00.000Z')).toBe(
      '3 de agosto de 2026',
    );
  });

  it('falls back to aFechaCorta for an unparseable fechaIso — never throws', () => {
    expect(aFechaLargaLabel('not-a-date')).toBe(aFechaCorta('not-a-date'));
  });
});
