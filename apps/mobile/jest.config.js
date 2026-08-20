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
 * `lucide-react-native` (US-044 PR8, T8.2): the package's `exports` map
 * resolves the `.` entry to the `.mjs` ESM file under Jest's module
 * resolution, which Babel cannot parse. The CJS build is compatible — this
 * `moduleNameMapper` entry redirects the import to the CJS path so Jest never
 * touches the ESM file. Ships in the same slice as the Header gear import
 * (design §3 seam 2 + §5 cross-slice ordering constraint).
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.spec.{ts,tsx}'],
  moduleNameMapper: {
    // `app/_layout.tsx` imports `../global.css` (NativeWind) — only Metro
    // (metro.config.js's `withNativeWind`) can parse that at build/runtime.
    // Stub it out for Jest so specs that render the real `_layout.tsx` (e.g.
    // the auth-navigation integration test) can import it directly.
    '\\.css$': '<rootDir>/jest.css-stub.js',
    // Redirect lucide-react-native to its CJS build — the package's `exports`
    // map points Jest to the ESM (.mjs) entry which Babel cannot parse.
    // The CJS build at dist/cjs/ is feature-identical; tree-shaking happens
    // at Metro/bundler time in production, not in the test runner.
    '^lucide-react-native$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
};
