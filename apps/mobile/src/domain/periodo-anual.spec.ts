import {
  mesAbreviado,
  mesCompletoLabel,
  anioDePeriodo,
  periodoActualUTC,
  mesAnterior,
  mesSiguiente,
  esMesActual,
} from './periodo-anual';

// Ported subset of apps/web/src/domain/periodo-anual.ts (US-050, design
// §1.3) — only the four functions this screen actually consumes. Same
// total/never-throw discipline: an unparseable `periodo` returns the input
// verbatim instead of throwing.

describe('mesAbreviado', () => {
  it('returns the 3-letter Spanish abbreviation for month 1 (ENE)', () => {
    expect(mesAbreviado('2026-01')).toBe('ENE');
  });

  it('returns the 3-letter Spanish abbreviation for month 7 (JUL)', () => {
    expect(mesAbreviado('2026-07')).toBe('JUL');
  });

  it('returns the 3-letter Spanish abbreviation for month 12 (DIC)', () => {
    expect(mesAbreviado('2026-12')).toBe('DIC');
  });

  it('returns the input verbatim for an unparseable periodo', () => {
    expect(mesAbreviado('not-a-periodo')).toBe('not-a-periodo');
  });
});

describe('mesCompletoLabel', () => {
  it("formats '2026-07' as 'julio 2026'", () => {
    expect(mesCompletoLabel('2026-07')).toBe('julio 2026');
  });

  it('returns the input verbatim for an unparseable periodo', () => {
    expect(mesCompletoLabel('garbage')).toBe('garbage');
  });
});

describe('anioDePeriodo', () => {
  it('extracts the numeric year from a well-formed periodo', () => {
    expect(anioDePeriodo('2026-07', 1999)).toBe(2026);
  });

  it('falls back to anioPorDefecto for an unparseable periodo', () => {
    expect(anioDePeriodo('not-a-periodo', 1999)).toBe(1999);
  });
});

describe('periodoActualUTC', () => {
  it('formats an injected Date as YYYY-MM', () => {
    expect(periodoActualUTC(new Date('2026-07-19T12:00:00.000Z'))).toBe(
      '2026-07',
    );
  });

  it('resolves by UTC, not local time, for a date near a month boundary', () => {
    const instante = new Date('2026-07-01T00:30:00.000Z'); // UTC: July 1st.
    const getFullYearSpy = jest
      .spyOn(Date.prototype, 'getFullYear')
      .mockReturnValue(1999); // Deliberately wrong "local" year.
    const getMonthSpy = jest
      .spyOn(Date.prototype, 'getMonth')
      .mockReturnValue(5); // Deliberately wrong "local" month (June, 0-based).

    try {
      expect(periodoActualUTC(instante)).toBe('2026-07');
    } finally {
      getFullYearSpy.mockRestore();
      getMonthSpy.mockRestore();
    }
  });

  it('zero-pads single-digit months', () => {
    expect(periodoActualUTC(new Date('2026-01-05T00:00:00.000Z'))).toBe(
      '2026-01',
    );
  });
});

// T-04 RED: new cases for period navigation helpers (US-056, D-13)
describe('mesAnterior', () => {
  it("mesAnterior('2026-07') returns '2026-06'", () => {
    expect(mesAnterior('2026-07')).toBe('2026-06');
  });

  it("mesAnterior('2026-01') returns '2025-12' (Jan→Dec year rollover)", () => {
    expect(mesAnterior('2026-01')).toBe('2025-12');
  });
});

describe('mesSiguiente', () => {
  it("mesSiguiente('2026-07') returns '2026-08'", () => {
    expect(mesSiguiente('2026-07')).toBe('2026-08');
  });

  it("mesSiguiente('2026-12') returns '2027-01' (Dec→Jan year rollover)", () => {
    expect(mesSiguiente('2026-12')).toBe('2027-01');
  });
});

describe('esMesActual', () => {
  it('returns true for current UTC month', () => {
    const ahora = new Date('2026-08-15T12:00:00.000Z');
    expect(esMesActual('2026-08', ahora)).toBe(true);
  });

  it('returns false for prior month', () => {
    const ahora = new Date('2026-08-15T12:00:00.000Z');
    expect(esMesActual('2026-07', ahora)).toBe(false);
  });
});
