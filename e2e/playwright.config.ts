import { defineConfig, devices } from '@playwright/test';

/**
 * app:    the production build served by `vite preview` against a throwaway API (scripts/test-all.sh sets BASE_URL).
 * deploy: read-only checks of a running deployment (DEPLOY_URL).
 */
export default defineConfig({
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // GitHub runners have 2 cores: fewer browsers at once, and one retry (a test passing on retry is reported "flaky").
  // CI runners have 4 cores; locally, half of the machine.
  workers: process.env.CI ? 4 : '50%',
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'],
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    permissions: ['clipboard-read', 'clipboard-write'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'app', testDir: 'tests/app', use: { baseURL: process.env.BASE_URL ?? 'http://localhost:4173' } },
    { name: 'deploy', testDir: 'tests/deploy', use: { baseURL: process.env.DEPLOY_URL ?? 'http://localhost:8080' } },
  ],
});
