import { defineConfig, devices } from '@playwright/test'

/**
 * E2E against production preview (`vite preview` of prod `dist`), not Vite-dev.
 * Local: `bun run test:e2e` (build + strip preloaded JSON, serve :4179).
 * CI: downloads the same `tc-study-dist` artifact that deploy publishes
 *     (`E2E_USE_EXISTING_DIST=1`). See docs/E2E_DEPLOY_ARTIFACT_PARITY.md.
 * UI: `bun run test:e2e:ui`
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Serialize locally too: Door43 route mocks + shared preview origin are not safe in parallel
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    // Dedicated E2E port (avoids colliding with leftover :4173 previews)
    baseURL: 'http://127.0.0.1:4179',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Prod artifact via scripts/e2e-webserver.cjs (free port → build → vite preview — not Vite-dev)
    command: 'node scripts/e2e-webserver.cjs',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      ...process.env,
      E2E_PORT: '4179',
    },
  },
})
