import { defineConfig, devices } from '@playwright/test';

/**
 * playwright.config.ts — the acceptance layer for US-063 (design.md D-11,
 * D-12). D-08 chose CSS-only responsive behaviour for every M2/M3
 * criterion, so `pnpm web test` (jsdom, no layout engine) cannot assert a
 * single one of CA-01…CA-05 as a user-visible outcome — the class literal
 * being present is not proof it is in EFFECT at a given width (the exact
 * gap that shipped `WCTG-14` false, US-043 archive-report debt 1). This
 * harness is the only layer that renders real geometry.
 *
 * Three projects are the EXECUTABLE definition of D-01's tier — not a
 * decorative choice, the only artifact in the repo that can be *wrong*
 * about the tier and fail:
 *   - `movil`     360×740  — mobile,  <768px
 *   - `tablet`    880×1000 — tablet,  768–1023px (T2/T3's measured width)
 *   - `escritorio` 1280×800 — desktop, ≥1024px
 *
 * Chromium only (D-11): every criterion here is a layout fact of one CSS
 * engine, not a cross-browser behavioural difference — Firefox/WebKit would
 * triple CI time for zero additional criterion coverage. Recorded as a
 * deliberate narrowing, not an oversight.
 *
 * `webServer` runs `vite preview` of the PRODUCTION build, not `vite dev`:
 * `main.tsx` imports `./index.css`, and only the production build serves
 * the real, compiled Tailwind CSS this suite exists to assert against —
 * `vite dev`'s pipeline is a different artifact. `pnpm exec vite preview`
 * (not the workspace `preview` script) because the `preview` script itself
 * takes no arguments and betting the harness on `pnpm run <script> --
 * <args>` forwarding was not worth it. `reuseExistingServer: !process.env.CI`
 * lets `pnpm web test:e2e` reuse an already-running `pnpm web dev`/`preview`
 * locally without a rebuild, while CI always starts fresh.
 *
 * No real backend anywhere (D-11): every spec under `e2e/` stubs
 * `**\/api/**` (and the cross-origin `/version` the API-version badge
 * calls) via `page.route` — see `e2e/fixtures/api-stubs.ts`. The suite
 * asserts layout, not integration; a real API would add Render cold
 * starts, DB state, and auth cookies as failure modes for assertions that
 * depend on none of them.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'movil',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 740 },
      },
    },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 880, height: 1000 },
      },
    },
    {
      name: 'escritorio',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command:
      'pnpm run build && pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
