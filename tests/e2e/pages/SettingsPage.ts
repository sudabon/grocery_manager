import { expect, type Page } from '@playwright/test';
export class SettingsPage {
  constructor(readonly page: Page) {}
  get partial() { return this.page.getByRole('switch', { name: '部分一致を許可', exact: true }); }
  get duplicates() { return this.page.getByRole('switch', { name: '同一単語の重複を許可', exact: true }); }
  get hint() { return this.page.getByRole('switch', { name: 'ディクテーションのヒント表示', exact: true }); }
  get range() { return this.page.getByRole('slider', { name: /^自動コミット待機時間/ }); }
  get deleteButton() { return this.page.getByRole('button', { name: 'メモを全削除', exact: true }); }
  get dialog() { return this.page.getByRole('dialog'); }
  get cancel() { return this.dialog.getByRole('button', { name: '中止', exact: true }); }
  get next() { return this.dialog.getByRole('button', { name: '次へ', exact: true }); }
  get deleteConfirm() { return this.dialog.getByRole('button', { name: 'すべてのメモを削除', exact: true }); }
  get importConfirm() { return this.dialog.getByRole('button', { name: '上書きしてインポート', exact: true }); }
  get info() { return this.page.getByRole('region', { name: 'アプリ情報' }); }
  get backup() { return this.page.getByRole('region', { name: '全データのバックアップ' }); }
  get exportButton() { return this.page.getByRole('button', { name: '全データをエクスポート', exact: true }); }
  get importInput() { return this.page.getByLabel('全データをインポート', { exact: true }); }
  get toast() { return this.page.getByRole('status'); }
  get dictationHint() { return this.page.getByText('キーボードのマイクキー🎤をタップして話してください', { exact: true }); }
  async open() { await this.page.getByRole('link', { name: '設定', exact: true }).click(); await expect(this.partial).toBeVisible(); }
  async back() { await this.page.getByRole('link', { name: 'メモ画面へ戻る' }).click(); }
  async saved() { await expect(this.page.getByText('保存処理完了', { exact: true })).toBeAttached(); }
  async reload() { await this.page.reload(); await expect(this.partial).toBeVisible(); }
  async setWait(value: number, commit = true) {
    await this.range.evaluate((node, { value, commit }) => {
      const input = node as HTMLInputElement; input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (commit) input.dispatchEvent(new Event('change', { bubbles: true }));
    }, { value, commit });
    if (commit) await this.saved();
  }
  async clear() { await this.deleteButton.click(); await this.next.click(); await this.deleteConfirm.click(); await expect(this.dialog).toHaveCount(0); await this.saved(); }
  async export() { const download = this.page.waitForEvent('download'); await this.exportButton.click(); return download; }
  async import(path: string) { await this.importInput.setInputFiles(path); }
  async importContents(text: string) { await this.importInput.setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text) }); }
  async acceptImport() { await this.importConfirm.click(); await expect(this.dialog).toHaveCount(0); await this.saved(); }
}
