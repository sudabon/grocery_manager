import type { Page } from '@playwright/test';
export type ShareMode = 'env:no-web-share' | 'env:web-share-stub' | 'env:web-share-abort' | 'env:web-share-failure';
/** JSON 以外（PNG などのバイナリ）は本文を記録しない。共有経路の検証は name / type / size で行う（board-image-share design - D5）。 */
export interface SharedFile { name: string; type: string; size: number; text?: string }
export async function configureShare(page: Page, mode: ShareMode) {
  await page.addInitScript((mode) => {
    const disabled = mode === 'env:no-web-share';
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: disabled ? undefined : () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: disabled ? undefined : async (data: ShareData) => {
      (window as unknown as { sharedFiles: unknown[] }).sharedFiles = await Promise.all((data.files ?? []).map(async (file) => ({
        name: file.name, type: file.type, size: file.size, ...(file.type === 'application/json' ? { text: await file.text() } : {}),
      })));
      // 受け渡しの成否は共有シート側の結果なので、記録したあとに再現する。
      if (mode === 'env:web-share-abort') throw new DOMException('cancelled', 'AbortError');
      if (mode === 'env:web-share-failure') throw new Error('share failed');
    } });
  }, mode);
}
export function sharedFiles(page: Page): Promise<SharedFile[]> {
  return page.evaluate(() => (window as unknown as { sharedFiles?: SharedFile[] }).sharedFiles ?? []);
}
