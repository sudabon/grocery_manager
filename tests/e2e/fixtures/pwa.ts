import { test as base, expect } from '@playwright/test';
import { PwaPage } from '../pages/PwaPage';
import { displayMode, waitingServiceWorker } from '../mocks/pwa';

type Fixtures = {
  builtApp: PwaPage;
  builtAppOffline: PwaPage;
  builtAppOfflineFirstVisit: { navigationFailed: boolean; boardVisible: boolean };
  swUpdateAvailable: PwaPage;
  displayModeName: 'browser' | 'media' | 'ios';
  displayModeApp: PwaPage;
  externalRequests: string[];
};
export const test = base.extend<Fixtures>({
  externalRequests: [async ({ context, baseURL }, use) => {
    if (!baseURL) throw new Error('baseURL is required for externalRequests fixture');
    const origin = new URL(baseURL).origin;
    const requests: string[] = [];
    const listen = (request: { url(): string }) => {
      const url = new URL(request.url());
      if (/^https?:$/.test(url.protocol) && url.origin !== origin) requests.push(url.href);
    };
    context.on('request', listen);
    await use(requests);
    context.off('request', listen);
  }, { auto: true }],
  builtApp: async ({ page }, use) => { const app = new PwaPage(page); await app.open(); await use(app); },
  builtAppOffline: async ({ builtApp, context }, use) => {
    await context.setOffline(true);
    await use(builtApp);
    await context.setOffline(false);
  },
  builtAppOfflineFirstVisit: async ({ context, baseURL }, use) => {
    if (!baseURL) throw new Error('baseURL is required for builtAppOfflineFirstVisit fixture');
    await context.setOffline(true);
    const destination = await context.newPage();
    let navigationFailed = false;
    try { await destination.goto(baseURL, { timeout: 10_000 }); } catch { navigationFailed = true; }
    // セレクタは Page Object に寄せる（規約: page.locator / CSS 指定は禁止）。
    const boardVisible = await new PwaPage(destination).memo.board.isVisible().catch(() => false);
    await use({ navigationFailed, boardVisible });
    await destination.close(); await context.setOffline(false);
  },
  swUpdateAvailable: async ({ page, displayModeName }, use) => {
    await displayMode(page, displayModeName);
    await waitingServiceWorker(page);
    const app = new PwaPage(page); await app.open();
    await expect(app.updateBanner).toBeVisible();
    await use(app);
  },
  displayModeName: ['browser', { option: true }],
  displayModeApp: async ({ page, displayModeName }, use) => {
    await displayMode(page, displayModeName);
    const app = new PwaPage(page); await app.open(); await use(app);
  },
});
export { expect };
