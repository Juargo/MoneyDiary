import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import pkg from './package.json' with { type: 'json' }

/**
 * Single source of truth for "what is deployed" on the web app.
 *
 * `version` is what release-please writes to package.json (tag `web-vX.Y.Z`,
 * ADR-030); `commit`/`ref` are the Vercel build vars, injected here in the
 * Vite Node process — the SPA has no server render, and `import.meta.env` only
 * exposes `VITE_`-prefixed vars, so a build plugin is the only place the
 * (non-prefixed) git SHA can be baked into the output. On a local build the
 * VERCEL_GIT_* vars are absent and fall back to "local".
 *
 * Two outputs: a static `/version.json` (curl-able, served before the SPA
 * fallback) and `app-version`/`app-commit` meta tags on every page.
 */
function buildInfoPlugin(): Plugin {
  const info = {
    version: pkg.version,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
    ref: process.env.VERCEL_GIT_COMMIT_REF ?? 'local',
    builtAt: new Date().toISOString(),
  }
  return {
    name: 'moneydiary-build-info',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { name: 'app-version', content: info.version }, injectTo: 'head' },
      { tag: 'meta', attrs: { name: 'app-commit', content: info.commit }, injectTo: 'head' },
    ],
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(info, null, 2) + '\n',
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // '' prefix -> load ALL env vars, including the bare (non-VITE_) `API_KEY`.
  // This runs in the Vite Node process only; `env.API_KEY` never reaches
  // `import.meta.env` and is never bundled into client code.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      buildInfoPlugin(),
    ],
    resolve: {
      // `tsconfigPaths: true` resolves the `@/*` alias for dev/Vitest, but
      // NOT for the production build (Rolldown doesn't pick it up — found
      // while wiring the first `@/...`-importing components, W1 slice 3:
      // `pnpm web build` failed with "Rolldown failed to resolve import
      // '@/api/use-resumen'" even though `pnpm web test`/`pnpm web dev`
      // worked). An explicit `resolve.alias` is required for both to agree.
      tsconfigPaths: true,
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          configure: (proxy) => {
            if (!env.API_KEY) {
              console.warn(
                '[vite proxy] API_KEY not set in .env.local — requests to /api will hit the backend without x-api-key and get 401',
              )
            }
            proxy.on('proxyReq', (proxyReq) => {
              if (env.API_KEY) proxyReq.setHeader('x-api-key', env.API_KEY)
            })
          },
        },
      },
    },
  }
})
