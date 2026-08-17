import {
  mesAbreviado,
  mesCompletoLabel,
  anioDePeriodo,
  periodoActualUTC,
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
    // Local time (any TZ behind UTC) would read June; UTC reads July 1st.
    expect(periodoActualUTC(new Date('2026-07-01T00:30:00.000Z'))).toBe(
      '2026-07',
    );
  });

  it('zero-pads single-digit months', () => {
    expect(periodoActualUTC(new Date('2026-01-05T00:00:00.000Z'))).toBe(
      '2026-01',
    );
  });
});
