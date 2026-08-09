/**
 * `config.ts` reads `process.env.EXPO_PUBLIC_*` at module-load time, so each
 * test that needs a specific env must reset the module registry and
 * re-require it — mirrors the discipline documented in `client.spec.ts`.
 */
function requireConfig(): typeof import('./config') {
  return jest.requireActual('./config');
}

describe('GOOGLE_CLIENT_ID_ANDROID', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('is undefined when EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID is absent (not configured, C1.4/design §9.1)', () => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID;

    const { GOOGLE_CLIENT_ID_ANDROID } = requireConfig();

    expect(GOOGLE_CLIENT_ID_ANDROID).toBeUndefined();
  });

  it('is undefined when EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID is an empty string (same discipline as API_BASE_URL)', () => {
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID: '',
    };

    const { GOOGLE_CLIENT_ID_ANDROID } = requireConfig();

    expect(GOOGLE_CLIENT_ID_ANDROID).toBeUndefined();
  });

  it('exposes the raw value when configured', () => {
    process.env = {
      ...ORIGINAL_ENV,
      EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID:
        '12345-android.apps.googleusercontent.com',
    };

    const { GOOGLE_CLIENT_ID_ANDROID } = requireConfig();

    expect(GOOGLE_CLIENT_ID_ANDROID).toBe(
      '12345-android.apps.googleusercontent.com',
    );
  });
});
