import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // Extension tests need serial execution
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1, // Chrome extension tests require single worker
  reporter: process.env['CI'] ? 'github' : 'list',

  use: {
    // Screenshot on failure
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium-extension',
      use: {
        ...devices['Desktop Chrome'],
        // Channel 'chrome' is required for extensions
        // Falls back to chromium if chrome is not installed
      },
    },
  ],

  // Start mock server before tests
  webServer: {
    command: 'pnpm mock:server',
    url: 'http://localhost:3456',
    reuseExistingServer: !process.env['CI'],
    timeout: 10_000,
  },

  // Global setup to build extension if needed
  globalSetup: resolve(__dirname, 'tests/e2e/global-setup.ts'),
});
