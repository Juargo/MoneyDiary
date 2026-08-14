import { describe, expect, it } from 'vitest';
import { Route as ConfiguracionRoute } from '@/routes/_authenticated/configuracion';

/**
 * `?google=` on /configuracion (US-042 design.md §1/Q6a, WCFG-10). Mirrors
 * `login-error-param.test.tsx`'s direct `.options.validateSearch` case: the
 * URL SELECTS a client constant (`'vinculado' | 'error'`), it never supplies
 * content that gets rendered or interpolated — same `sanitizeRedirect`
 * discipline `/login` already applies to `?redirect=`.
 */
describe('/configuracion — ?google= validateSearch boundary (US-042 WCFG-10)', () => {
  const validate = ConfiguracionRoute.options.validateSearch as (
    search: Record<string, unknown>,
  ) => { google?: 'vinculado' | 'error' };

  it('keeps ?google=vinculado unchanged', () => {
    expect(validate({ google: 'vinculado' })).toEqual({ google: 'vinculado' });
  });

  it('keeps ?google=error unchanged', () => {
    expect(validate({ google: 'error' })).toEqual({ google: 'error' });
  });

  it('strips an unknown ?google= value — never round-trips it', () => {
    expect(validate({ google: 'anything-else' })).toEqual({});
    expect(validate({ google: '<script>alert(1)</script>' })).toEqual({});
  });

  it('strips an empty ?google= value', () => {
    expect(validate({ google: '' })).toEqual({});
  });

  it('strips a non-string ?google= value (array, object, number)', () => {
    expect(validate({ google: ['vinculado'] })).toEqual({});
    expect(validate({ google: { value: 'vinculado' } })).toEqual({});
    expect(validate({ google: 1 })).toEqual({});
  });

  it('returns an empty object when ?google= is absent', () => {
    expect(validate({})).toEqual({});
  });
});
