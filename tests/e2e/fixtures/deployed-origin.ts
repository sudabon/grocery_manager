import { test as base, expect } from '@playwright/test';
import { AppShellPage } from '../pages/AppShellPage';

type HostingFixtures = {
  deployedOrigin: string;
  appShell: AppShellPage;
};

export const test = base.extend<HostingFixtures>({
  deployedOrigin: [async ({}, use) => {
    const baseURL = process.env.E2E_BASE_URL;
    base.skip(!baseURL?.startsWith('https://'), 'E2E_BASE_URL に HTTPS の配信先を指定してください');
    await use(new URL(baseURL!).origin);
  }, { auto: true }],
  appShell: async ({ page, deployedOrigin }, use) => {
    await use(new AppShellPage(page, deployedOrigin));
  },
});

export { expect };
