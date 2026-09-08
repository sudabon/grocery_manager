import { expect, type Page } from '@playwright/test';
export class DictionariesPage {
  constructor(readonly page: Page) {}
  get label() { return this.page.getByRole('textbox', { name: '象限ラベル', exact: true }); }
  get entries() { return this.page.getByRole('textbox', { name: '単語リスト（1 行 1 語）', exact: true }); }
  get saveButton() { return this.page.getByRole('button', { name: '保存', exact: true }); }
  get dirty() { return this.page.getByText('未保存の変更があります', { exact: true }); }
  get help() { return this.page.getByText(/^複合語が細かく分割される場合は/); }
  get exportButton() { return this.page.getByRole('button', { name: '辞書をエクスポート', exact: true }); }
  get importInput() { return this.page.getByLabel('辞書をインポート', { exact: true }); }
  get toast() { return this.page.getByRole('status'); }
  get prompt() { return this.page.getByRole('link', { name: '辞書を設定すると自動で振り分けられます' }); }
  tab(q: number) { return this.page.getByRole('tab', { name: `Q${q}`, exact: true }); }
  async open() { await this.page.getByRole('link', { name: '辞書編集', exact: true }).click(); await expect(this.label).toBeVisible(); }
  async back() { await this.page.getByRole('link', { name: 'メモ画面へ戻る' }).click(); }
  async save() { await this.saveButton.click(); await expect(this.page.getByText('保存済み', { exact: true })).toBeVisible(); }
  async reload() { await this.page.reload(); await expect(this.label).toBeVisible(); }
  async export() { const download = this.page.waitForEvent('download'); await this.exportButton.click(); return download; }
  async import(path: string) { await this.importInput.setInputFiles(path); }
  async repeatSave() { await this.saveButton.evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); }); await expect(this.page.getByText('保存済み', { exact: true })).toBeVisible(); }
}
