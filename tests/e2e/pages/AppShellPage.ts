import { expect, type Page } from '@playwright/test';

export class AppShellPage {
  constructor(private readonly page: Page, private readonly origin: string) {}

  goto(path = '/') {
    return this.page.goto(new URL(path, this.origin).href);
  }

  gotoHttp(path = '/') {
    const url = new URL(path, this.origin);
    url.protocol = 'http:';
    return this.page.goto(url.href);
  }

  openDictionaries() { return this.page.getByRole('link', { name: '辞書編集', exact: true }).click(); }
  openSettings() { return this.page.getByRole('link', { name: '設定', exact: true }).click(); }
  backToMemo() { return this.page.getByRole('link', { name: 'メモ画面へ戻る' }).click(); }
  async expectSecondary(name: string) {
    await expect(this.page.getByRole('heading', { name, exact: true, level: 2 })).toBeVisible();
    await expect(this.page.getByRole('link', { name: 'メモ画面へ戻る' })).toBeVisible();
  }

  reload() {
    return this.page.reload();
  }

  async expectVisible() {
    await expect(this.page.getByRole('main')).toBeVisible();
    await expect(this.page.getByRole('heading', { name: 'QuadMemo', exact: true, level: 1 })).toBeVisible();
  }

  async expectPath(path: string) {
    await expect(this.page).toHaveURL(new URL(path, this.origin).href);
  }
}
