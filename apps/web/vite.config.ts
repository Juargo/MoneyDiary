import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

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
