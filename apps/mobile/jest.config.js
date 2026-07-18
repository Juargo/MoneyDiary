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
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.spec.{ts,tsx}'],
  // `app/_layout.tsx` imports `../global.css` (NativeWind) — only Metro
  // (metro.config.js's `withNativeWind`) can parse that at build/runtime.
  // Stub it out for Jest so specs that render the real `_layout.tsx` (e.g.
  // the auth-navigation integration test) can import it directly.
  moduleNameMapper: {
    '\\.css$': '<rootDir>/jest.css-stub.js',
  },
};
