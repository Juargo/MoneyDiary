import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Vitest reusa el pipeline de Vite existente (ADR-016) — mismo plugin de React
// (JSX), mismos alias. Solo se añade la capa de test: entorno `jsdom` para el
// DOM y un setup con los matchers de `@testing-library/jest-dom`.
// `vite.config.ts` exports a config *function* (needed for `loadEnv` in the
// dev proxy), so it must be invoked with the current config env before
// merging — passing the function itself to `mergeConfig` would merge the
// function value instead of the resolved config object.
export default defineConfig((configEnv) =>
  mergeConfig(
    viteConfig(configEnv),
    defineConfig({
      test: {
        // Fails the run locally (not just in CI) if a stray `.only` slips in.
        allowOnly: false,
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
  ),
)
