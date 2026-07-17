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
      tsconfigPaths: true,
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
