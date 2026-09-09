import { test as base, expect } from '@playwright/test';
import { PwaPage } from '../pages/PwaPage';
import { displayMode, waitingServiceWorker } from '../mocks/pwa';

type Fixtures = {
  builtApp: PwaPage;
  builtAppOffline: PwaPage;
  builtAppOfflineFirstVisit: { navigationFailed: boolean; registrations: number; caches: string[] };
  swUpdateAvailable: PwaPage;
  displayModeBrowser: PwaPage;
  displayModeStandalone: PwaPage;
  displayModeIosStandalone: PwaPage;
  externalRequests: string[];
};
export const test = base.extend<Fixtures>({
  externalRequests: [async ({ context, baseURL }, use) => {
    const requests: string[] = [];
    const listen = (request: { url(): string }) => {
      const url = new URL(request.url());
      if (/^https?:$/.test(url.protocol) && url.origin !== new URL(baseURL!).origin) requests.push(url.href);
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
  builtAppOfflineFirstVisit: async ({ page, context, baseURL }, use) => {
    // A same-origin inert document allows cache/registration inspection without loading the app.
    await page.route('**/__pwa_probe__', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Cache probe</title>' }));
    await page.goto('/__pwa_probe__');
    const empty = await page.evaluate(async () => ({ registrations: (await navigator.serviceWorker.getRegistrations()).length, caches: await caches.keys() }));
    await page.unroute('**/__pwa_probe__');
    await context.setOffline(true);
    const destination = await context.newPage();
    let navigationFailed = false;
    try { await destination.goto(baseURL!); } catch { navigationFailed = true; }
    await use({ navigationFailed, ...empty });
    await destination.close(); await context.setOffline(false);
  },
  swUpdateAvailable: async ({ page }, use) => {
    await waitingServiceWorker(page);
    const app = new PwaPage(page); await app.open();
    await expect(app.updateBanner).toBeVisible();
    await use(app);
  },
  displayModeBrowser: async ({ page }, use) => {
    await displayMode(page, 'browser'); const app = new PwaPage(page); await app.open(); await use(app);
  },
  displayModeStandalone: async ({ page }, use) => {
    await displayMode(page, 'media'); const app = new PwaPage(page); await app.open(); await use(app);
  },
  displayModeIosStandalone: async ({ page }, use) => {
    await displayMode(page, 'ios'); const app = new PwaPage(page); await app.open(); await use(app);
  },
});
export { expect };
