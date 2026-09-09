import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: [
    ...(process.env.E2E_BASE_URL ? [] : [{
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
    }]),
    ...(process.env.E2E_PWA_BASE_URL ? [] : [{
      command: 'npm run build && npm run preview -- --port 3001',
      url: 'http://localhost:3001',
      reuseExistingServer: false,
      timeout: 180_000,
    }]),
  ],
  projects: [
    { name: 'chromium', testIgnore: '**/add-quadmemo-pwa-offline.spec.ts', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', testIgnore: '**/add-quadmemo-pwa-offline.spec.ts', use: { ...devices['iPhone 13'] } },
    { name: 'pwa', testMatch: '**/add-quadmemo-pwa-offline.spec.ts', use: {
      ...devices['iPhone 13'], browserName: 'chromium',
      baseURL: process.env.E2E_PWA_BASE_URL || 'http://localhost:3001', serviceWorkers: 'allow',
    } },
  ],
  forbidOnly: !!process.env.CI,
  retries: 1, // リトライ成功 = フレークとして記録される
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
});
