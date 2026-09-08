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
