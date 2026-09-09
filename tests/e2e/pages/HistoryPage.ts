import { expect, type Page } from '@playwright/test';

export class HistoryPage {
  constructor(readonly page: Page) {}
  get heading() { return this.page.getByRole('heading', { name: '日付の一覧', exact: true, level: 2 }); }
  get list() { return this.page.getByRole('list', { name: 'ボードの日付' }); }
  /** 一覧に並ぶ日付。並び順の検証に使う。 */
  get dates() { return this.list.getByRole('link'); }
  get noPastBoards() { return this.page.getByText('過去のボードはまだありません。', { exact: true }); }
  board(label: string) { return this.list.getByRole('link', { name: label, exact: true }); }
  async open() { await this.page.getByRole('link', { name: '日付の一覧', exact: true }).click(); await expect(this.heading).toBeVisible(); }
  async openBoard(label: string) { await this.board(label).click(); }
  async back() { await this.page.getByRole('link', { name: 'メモ画面へ戻る' }).click(); }
}
