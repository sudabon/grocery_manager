import type { Page } from '@playwright/test';
export async function configureShare(page: Page, mode: 'env:no-web-share' | 'env:web-share-stub') {
  await page.addInitScript((mode) => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: mode === 'env:no-web-share' ? undefined : () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: mode === 'env:no-web-share' ? undefined : async (data: ShareData) => {
      (window as unknown as { sharedFiles: unknown[] }).sharedFiles = await Promise.all((data.files ?? []).map(async (file) => ({ name: file.name, text: await file.text() })));
    } });
  }, mode);
}
export function sharedFiles(page: Page) {
  return page.evaluate(() => (window as unknown as { sharedFiles?: { name: string; text: string }[] }).sharedFiles ?? []);
}
