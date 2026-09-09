import { expect, type Page } from '@playwright/test';
import { MemoBoardPage } from './MemoBoardPage';
import { DictionariesPage } from './DictionariesPage';
import { SettingsPage } from './SettingsPage';

export class PwaPage {
  readonly memo: MemoBoardPage;
  readonly dictionaries: DictionariesPage;
  readonly settings: SettingsPage;
  constructor(readonly page: Page) {
    this.memo = new MemoBoardPage(page);
    this.dictionaries = new DictionariesPage(page);
    this.settings = new SettingsPage(page);
  }
  get offlineReady() { return this.page.getByText('オフライン利用可', { exact: true }); }
  get installHint() { return this.page.getByRole('complementary', { name: 'ホーム画面への追加', exact: true }); }
  get updateBanner() { return this.page.getByRole('complementary', { name: 'アプリの更新', exact: true }); }
  get updateButton() { return this.updateBanner.getByRole('button', { name: '更新', exact: true }); }
  swState(label: string) { return this.settings.info.getByText(`Service Worker：${label}`, { exact: true }); }
  async open() {
    await this.page.goto('/');
    await expect(this.memo.board).toBeVisible();
    await expect(this.offlineReady).toBeVisible();
  }
  async closeHint() {
    await this.installHint.getByRole('button', { name: 'ホーム画面追加の案内を閉じる' }).click();
    await this.memo.waitForSave();
  }
  async manifest(): Promise<{ icons: { src: string; sizes: string; type: string; purpose?: string }[] } & Record<string, unknown>> {
    const href = await this.page.evaluate(() => (document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null)?.href);
    expect(href).toBeTruthy();
    const response = await this.page.request.get(href!);
    expect(response.status()).toBe(200);
    return response.json();
  }
  async expectIcons() {
    const manifest = await this.manifest();
    const apple = await this.page.evaluate(() => (document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null)?.href);
    if (!apple) throw new Error('apple-touch-icon link not found');
    const icons: { src: string; sizes: string }[] = [...manifest.icons, { src: apple, sizes: '180x180' }];
    for (const icon of icons) {
      const url = new URL(icon.src, this.page.url()).href;
      const response = await this.page.request.get(url);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('image/png');
      const body = await response.body();
      expect(body.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(`${body.readUInt32BE(16)}x${body.readUInt32BE(20)}`).toBe(icon.sizes);
    }
  }
}
