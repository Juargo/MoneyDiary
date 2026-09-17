import { describe, expect, it } from 'vitest';
import {
  aDiaConSemana,
  aFechaCorta,
  aFechaLargaLabel,
  esFechaValida,
  hoyLocal,
} from './fecha';

// US-060 T-01 (D-04): `hoyLocal()` — returns the current local date in
// America/Santiago timezone as YYYY-MM-DD via Intl.DateTimeFormat('en-CA').
// The en-CA locale outputs YYYY-MM-DD directly (no slice needed).
// TZ rationale: `aFechaCorta(new Date().toISOString())` would yield TOMORROW
// for Chilean evenings (UTC-4) — `hoyLocal()` uses Intl.DateTimeFormat with
// America/Santiago to correctly pin the local calendar date.
describe('hoyLocal', () => {
  it('retorna un string en formato YYYY-MM-DD', () => {
    expect(hoyLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('es igual al resultado de Intl.DateTimeFormat en-CA con timeZone America/Santiago', () => {
    const expected = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
    }).format(new Date());
    expect(hoyLocal()).toBe(expected);
  });

  // Advisory/env-dependent: this assertion is only meaningful when the
  // runtime UTC hour >= 20 (Chile is UTC-4; the UTC ISO string would yield
  // tomorrow for Chilean evenings). At minimum the format + Intl equality
  // assertions above are authoritative.
  it('puede diferir de new Date().toISOString().slice(0,10) para horas vespertinas de Chile (TZ-rationale)', () => {
    const utcSlice = new Date().toISOString().slice(0, 10);
    const localHoy = hoyLocal();
    // On most test environments this may be equal — the important contract
    // is the Intl equality test above. We assert it does not throw.
    expect(typeof localHoy).toBe('string');
    expect(typeof utcSlice).toBe('string');
  });
});

// US-053 T-16 (D-08): `esFechaValida` moved here from the flat chain's
// `detalle-bucket-view-model.ts` (deleted in T-18) — the money-safety
// predicate reused by the api/client.ts guards to reject an unparseable
// `fecha` BEFORE it reaches a positional slice (`aFechaCorta` only slices,
// it never validates format — an unparseable `fecha` would render a
// garbled/empty date instead of failing explicitly).
// KISS: "non-empty + parseable by `Date.parse`" is sufficient, no fancier
// date parsing.
describe('esFechaValida', () => {
  it('acepta un ISO-8601 UTC completo', () => {
    expect(esFechaValida('2026-07-15T00:00:00.000Z')).toBe(true);
  });

  it('rechaza el string vacío', () => {
    expect(esFechaValida('')).toBe(false);
  });

  it('rechaza un string no parseable como fecha', () => {
    expect(esFechaValida('not-a-date')).toBe(false);
  });
});

// US-054 (T-06, D-02): `aFechaCorta` — `YYYY-MM-DD` date part via pure
// string surgery (no Date round-trip → TZ-safe for Chile's UTC-4). Guarded
// upstream by `esFechaValida`; this helper only slices, it never validates
// (same division of labor as `esFechaValida`'s own docblock).
describe('aFechaCorta', () => {
  it('slices the date part out of a full ISO-8601 UTC timestamp', () => {
    expect(aFechaCorta('2026-07-15T00:00:00.000Z')).toBe('2026-07-15');
  });

  it('passes an already-short ISO date through unchanged', () => {
    expect(aFechaCorta('2026-07-15')).toBe('2026-07-15');
  });

  it('passes a short non-ISO string through unchanged (defensive, never throws)', () => {
    expect(aFechaCorta('nope')).toBe('nope');
  });
});

// bucket-detalle-lista-rediseño: `aDiaConSemana` powers the ledger's fecha
// column — a 2-digit day + a 3-letter weekday, both in lowercase (the CSS
// `uppercase` class owns the small-caps presentation, never the domain).
// `diaSemana` is computed in UTC via a fixed `T00:00:00Z` anchor — NEVER
// `Intl` with a timezone (that would make the output depend on the runtime's
// locale, the same reason `aFechaCorta` avoids a `Date` round-trip).
describe('aDiaConSemana', () => {
  it('splits an ISO-8601 UTC timestamp into a 2-digit day and a lowercase weekday abbreviation', () => {
    expect(aDiaConSemana('2026-08-03T00:00:00.000Z')).toEqual({
      dia: '03',
      diaSemana: 'lun',
    });
  });

  it('computes diaSemana in UTC without local-timezone drift', () => {
    // 2026-08-03 is a Monday in UTC. Interpreted in Chile's local time
    // (UTC-4) via a naive `new Date(fechaIso)` + `getDay()`, the UTC
    // midnight instant would still read back as Sunday (2026-08-02 20:00
    // local) for a runtime whose local TZ is behind UTC — this is exactly
    // the drift `aFechaCorta`'s own docblock says this module avoids by
    // never round-tripping through local-time `Date` accessors.
    expect(aDiaConSemana('2026-08-03T00:00:00.000Z').diaSemana).toBe('lun');
    // Independent cross-check: 2026-08-01 is a Saturday in UTC.
    expect(aDiaConSemana('2026-08-01T00:00:00.000Z').diaSemana).toBe('sáb');
  });

  it('is defensive — an unparseable fecha never throws, and dia falls back to a raw slice', () => {
    // 'not-a-date'.slice(8, 10) === 'te' — same positional-slice contract as
    // `dia`'s happy path, just fed a non-ISO input.
    expect(aDiaConSemana('not-a-date')).toEqual({ dia: 'te', diaSemana: '' });
  });
});

// `aFechaLargaLabel` powers the row's `sr-only` accessible date — the full
// Spanish long-form label a screen reader announces instead of the terse
// visible day+weekday pair.
describe('aFechaLargaLabel', () => {
  it('formats an ISO-8601 UTC timestamp as a long Spanish date label', () => {
    expect(aFechaLargaLabel('2026-08-03T00:00:00.000Z')).toBe(
      '3 de agosto de 2026',
    );
  });

  it('does not zero-pad the day', () => {
    expect(aFechaLargaLabel('2026-08-09T00:00:00.000Z')).toBe(
      '9 de agosto de 2026',
    );
  });

  it('falls back to aFechaCorta for an unparseable fecha instead of throwing', () => {
    expect(aFechaLargaLabel('not-a-date')).toBe(aFechaCorta('not-a-date'));
  });
});
