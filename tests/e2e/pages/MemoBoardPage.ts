import { expect, type Page } from '@playwright/test';

export class MemoBoardPage {
  constructor(readonly page: Page) {}
  get board() { return this.page.getByRole('group', { name: 'メモボード' }); }
  get mic() { return this.page.getByRole('button', { name: '音声メモ開始', exact: true }); }
  get closeInput() { return this.page.getByRole('button', { name: '入力バーを閉じる', exact: true }); }
  get input() { return this.page.getByRole('textbox', { name: 'メモを入力', exact: true }); }
  get confirm() { return this.page.getByRole('button', { name: '確定', exact: true }); }
  get chips() { return this.board.getByRole('button', { name: /^メモ「/ }); }
  get sheet() { return this.page.getByRole('dialog', { name: 'メモの操作' }); }
  get editInput() { return this.sheet.getByRole('textbox', { name: 'メモの編集' }); }
  get toast() { return this.page.getByRole('status'); }
  get shareImageButton() { return this.page.getByRole('button', { name: '画像で共有', exact: true }); }
  async shareImage() { await this.shareImageButton.click(); }
  async downloadImage() { const download = this.page.waitForEvent('download'); await this.shareImageButton.click(); return download; }
  /** 象限ごとのチップ本文。共有の前後で同一であることの比較に使う。 */
  async quadrantTexts() { return Promise.all([1, 2, 3, 4].map((id) => this.quadrantChips(id).allInnerTexts())); }
  quadrant(id: number) { return this.board.getByRole('region', { name: new RegExp(`^Q${id} `) }); }
  remaining(id: number) { return this.quadrant(id).getByText(/^残り\d+文字$/); }
  quadrantChips(id: number) { return this.quadrant(id).getByRole('button', { name: /^メモ「/ }); }
  chip(text: string) { return this.board.getByRole('button', { name: `メモ「${text}」（未分類）`, exact: true }); }
  classifiedChip(text: string) { return this.board.getByRole('button', { name: `メモ「${text}」`, exact: true }); }
  unsavedChip(text: string) { return this.board.getByRole('button', { name: `メモ「${text}」（未分類）（未保存）`, exact: true }); }
  highlightedChip(text: string) { return this.board.getByRole('button', { name: `メモ「${text}」（重複のため追加をスキップ）`, exact: true }); }
  get storageBanner() { return this.page.getByRole('complementary', { name: '保存できない環境の案内' }); }
  async closeStorageBanner() { await this.storageBanner.getByRole('button', { name: '保存の案内を閉じる' }).click(); }
  async reload() { await this.page.reload(); await expect(this.board).toBeVisible(); }
  async waitForSave() { await expect(this.page.getByText('保存処理完了', { exact: true })).toBeAttached(); }
  async openClassifiedChip(text: string) { await this.classifiedChip(text).click(); await expect(this.sheet).toBeVisible(); }
  moveButton(id: number) { return this.sheet.getByRole('button', { name: new RegExp(`^Q${id} .+へ移動$`) }); }
  goto() { return this.page.goto('/'); }
  async start() { await this.mic.click(); await expect(this.input).toBeFocused(); }
  async add(text: string) { await this.input.fill(text); await this.confirm.click(); }
  async openChip(text: string) { await this.chip(text).click(); await expect(this.sheet).toBeVisible(); }
  async edit(text: string) {
    await this.sheet.getByRole('button', { name: '編集', exact: true }).click();
    await this.editInput.fill(text);
    await this.sheet.getByRole('button', { name: '編集を確定', exact: true }).click();
  }
  async remove() { await this.sheet.getByRole('button', { name: '削除', exact: true }).click(); }
  async expectEqualQuadrants() {
    const boxes = await Promise.all([1, 2, 3, 4].map((id) => this.quadrant(id).boundingBox()));
    for (const box of boxes) { expect(box).not.toBeNull(); expect(box!.width).toBeCloseTo(boxes[0]!.width, 0); expect(box!.height).toBeCloseTo(boxes[0]!.height, 0); }
    expect(boxes[0]!.x).toBeGreaterThan(boxes[1]!.x);
    expect(boxes[2]!.x).toBe(boxes[1]!.x);
    expect(boxes[3]!.x).toBe(boxes[0]!.x);
    expect(boxes[0]!.y).toBe(boxes[1]!.y);
    expect(boxes[2]!.y).toBeGreaterThan(boxes[1]!.y);
    expect(boxes[3]!.y).toBe(boxes[2]!.y);
  }
  async expectIndependentScroll() {
    const before = await this.quadrant(1).boundingBox();
    const boardBefore = await this.board.boundingBox();
    const pageBefore = await this.page.evaluate(() => window.scrollY);
    const scroll = this.quadrant(4);
    expect(await scroll.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    await this.chips.last().scrollIntoViewIfNeeded();
    await expect(this.chips.last()).toBeInViewport();
    expect(await scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    expect(await this.quadrant(1).boundingBox()).toEqual(before);
    expect(await this.board.boundingBox()).toEqual(boardBefore);
    expect(await this.page.evaluate(() => window.scrollY)).toBe(pageBefore);
    await expect(scroll).toHaveCSS('overscroll-behavior-y', 'contain');
  }
  async expectFocusContained() {
    for (let i = 0; i < 12; i++) {
      await this.page.keyboard.press('Tab');
      expect(await this.sheet.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
    for (let i = 0; i < 12; i++) {
      await this.page.keyboard.press('Shift+Tab');
      expect(await this.sheet.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }
  }
  async typeWithoutRefocus(text: string) { await this.page.keyboard.insertText(text); await this.page.keyboard.press('Enter'); }
}
