/**
 * Config de Jest para apps/mobile (ADR-017).
 *
 * `preset: 'jest-expo'` es el camino oficial de Expo: resuelve la transpilación
 * de React Native, el module mapping y los mocks del boundary nativo, y se
 * versiona junto al Expo SDK. Los matchers de componentes se registran en
 * jest.setup.ts (RNTL built-in — reemplaza al deprecado @testing-library/jest-native).
 *
 * NOTA (pnpm): el layout no-hoisted de pnpm (node_modules/.pnpm) puede requerir
 * extender `transformIgnorePatterns` para que Jest transpile los paquetes ESM
 * de RN/Expo. Se ajusta al scaffoldear la app real y correr la primera suite.
 *
 * `lucide-react-native` (US-044 PR8, T8.2): jest-expo (via
 * @react-native/jest-preset's ReactNativeEnv) sets
 * `customExportConditions = ['require', 'react-native']`. The package's
 * `exports` map lists the `react-native` condition (pointing at the .mjs ESM
 * build) before `require`, so the resolver picks ESM regardless of
 * `transformIgnorePatterns` — Babel fails on the .mjs file. The
 * `moduleNameMapper` entry below redirects the bare import to the CJS build
 * at resolution time, before any transform decision, so Babel never sees the
 * ESM file. Ships in the same slice as the Header gear import (design §3
 * seam 2 + §5 cross-slice ordering constraint).
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Jest's 5s default is not enough for the FIRST test in a spec file on slow
  // CI runners. That test pays the one-off warm-up of the jest-expo preset and
  // the first React Native render; every later test in the same file reuses it.
  // Measured in ReclasificarMobileControl.spec.tsx: first test 618ms locally
  // vs ~15ms for each of the other twelve. On GitHub-hosted runners the same
  // warm-up crossed 5s and failed the suite deterministically (three runs:
  // 5.881s, 5.881s, 6.132s) while passing locally. The cost is per file, so
  // all 73 spec files carry the same risk, not just that one — hence a global
  // timeout rather than a per-test override. This buys headroom for the
  // warm-up; it does not mask slow assertions, which still fail on their own.
  testTimeout: 15000,
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.spec.{ts,tsx}'],
  moduleNameMapper: {
    // `app/_layout.tsx` imports `../global.css` (NativeWind) — only Metro
    // (metro.config.js's `withNativeWind`) can parse that at build/runtime.
    // Stub it out for Jest so specs that render the real `_layout.tsx` (e.g.
    // the auth-navigation integration test) can import it directly.
    '\\.css$': '<rootDir>/jest.css-stub.js',
    // Redirect lucide-react-native to its CJS build. jest-expo's
    // customExportConditions=['require','react-native'] causes the exports map
    // to resolve the react-native condition (ESM .mjs) before require, so
    // transformIgnorePatterns alone cannot prevent the Babel parse error.
    // This mapper redirects at resolution time; production (Metro) is unaffected.
    '^lucide-react-native$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
};
