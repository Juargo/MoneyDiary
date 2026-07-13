import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Vitest reusa el pipeline de Vite existente (ADR-016) — mismo plugin de React
// (JSX), mismos alias. Solo se añade la capa de test: entorno `jsdom` para el
// DOM y un setup con los matchers de `@testing-library/jest-dom`.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/routeTree.gen.ts'],
      },
    },
  }),
)
