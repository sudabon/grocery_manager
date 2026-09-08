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
    const parsed = new URL(baseURL!);
    base.skip(
      parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '',
      'E2E_BASE_URL には配信サブドメインのルートを指定してください（パス・クエリ・ハッシュは不可）',
    );
    await use(parsed.origin);
  }, { auto: true }],
  appShell: async ({ page, deployedOrigin }, use) => {
    await use(new AppShellPage(page, deployedOrigin));
  },
});

export { expect };
