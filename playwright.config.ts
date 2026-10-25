import { defineConfig, devices } from '@playwright/test'
import { AUTH_STATE, BASE_URL } from './e2e/env'

// End-to-end tests against a running local OpenCloud stack (docs/testing/e2e.md). The specs share
// server state (uploads, the user's language), so they run one at a time.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
    acceptDownloads: true,
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'login', testMatch: /login\.setup\.ts/ },
    {
      name: 'chromium',
      testMatch: /specs\/.*\.spec\.ts/,
      dependencies: ['login'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_STATE }
    }
  ]
})
