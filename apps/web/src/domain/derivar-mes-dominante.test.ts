import { describe, expect, it } from 'vitest';
import { derivarMesDominante } from './derivar-mes-dominante';

// Peak-end landing (SubirCartola exito state): the success screen fetches
// the resumen verdict for the month the just-committed cartola actually
// belongs to. Month choice is presentation-only (derived from fechas
// already in memory, D-02 of the change) — never a new backend computation.
describe('derivarMesDominante', () => {
  it('returns undefined for an empty list (e.g. every row was a duplicate omitted at commit)', () => {
    expect(derivarMesDominante([])).toBeUndefined();
  });

  it('derives the month from a single fecha', () => {
    expect(derivarMesDominante(['2026-07-15T00:00:00.000Z'])).toBe('2026-07');
  });

  it('picks the month with the most fechas (mode)', () => {
    const fechas = [
      '2026-07-01T00:00:00.000Z',
      '2026-07-15T00:00:00.000Z',
      '2026-07-28T00:00:00.000Z',
      '2026-06-30T00:00:00.000Z',
    ];
    expect(derivarMesDominante(fechas)).toBe('2026-07');
  });

  it('breaks a tie by picking the most recent month', () => {
    const fechas = [
      '2026-06-01T00:00:00.000Z',
      '2026-06-02T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
      '2026-07-02T00:00:00.000Z',
    ];
    expect(derivarMesDominante(fechas)).toBe('2026-07');
  });

  it('is order-independent — a shuffled input yields the same dominant month', () => {
    const fechas = [
      '2026-05-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
      '2026-07-02T00:00:00.000Z',
      '2026-05-02T00:00:00.000Z',
      '2026-07-03T00:00:00.000Z',
    ];
    expect(derivarMesDominante(fechas)).toBe('2026-07');
  });

  it('handles a year rollover tie correctly (string comparison, not numeric month)', () => {
    const fechas = ['2025-12-31T00:00:00.000Z', '2026-01-01T00:00:00.000Z'];
    expect(derivarMesDominante(fechas)).toBe('2026-01');
  });
});
