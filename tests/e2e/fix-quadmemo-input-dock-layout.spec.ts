import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures/memo-board';

// 入力ドック（入力バー + マイク）はボードの下にフロー配置し、ボードはその直上で終わる。
// ソフトウェアキーボードは Playwright から出せないので、キーボードに隠れた量を表す `--keyboard-inset` を
// 直接与えて、ドックが持ち上がりボードが縮む CSS の配線を検証する（量の算出は useVisualViewport の単体テスト）。
const tags = (id: string) => ({ tag: ['@fix-quadmemo-input-dock-layout', `@${id}`] });
const box = async (locator: Locator) => (await locator.boundingBox())!;
const dock = (memo: { page: Page }) => memo.page.locator('.input-dock');

test('入力バーを閉じている間はドックの高さがマイクに収まり、ボードはドックの直上で終わる', tags('TP-001'), async ({ memo }) => {
  await expect(memo.mic).toBeVisible();
  const [board, dockBox, mic] = await Promise.all([box(memo.board), box(dock(memo)), box(memo.mic)]);
  expect(dockBox.height).toBeLessThanOrEqual(mic.height + 24);
  expect(board.y + board.height).toBeCloseTo(dockBox.y, 0);
});

test('入力バーを開いている間もボードはドックの直上で終わる', tags('TP-002'), async ({ memo }) => {
  await memo.start();
  const [board, dockBox, input] = await Promise.all([box(memo.board), box(dock(memo)), box(memo.input)]);
  expect(input.y).toBeGreaterThan(dockBox.y);
  expect(board.y + board.height).toBeCloseTo(dockBox.y, 0);
});

test('あふれた象限を末尾までスクロールすると末尾チップの全体が象限内に見える', tags('TP-003'), async ({ memo }) => {
  await memo.start(); await memo.add(Array(50).fill('卵').join(' '));
  await expect(memo.chips).toHaveCount(50); await memo.closeInput.click();
  const quadrant = memo.quadrant(4);
  await quadrant.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  const [q, last] = await Promise.all([box(quadrant), box(memo.chips.last())]);
  expect(last.y + last.height).toBeLessThanOrEqual(q.y + q.height);
});

// 余白はボードを 0 まで縮めても他の要素（辞書の案内・日付行・ドック）が収まる量にする。iPhone 13 相当の
// 高さで 300px にすると収まらずドックが押し下げられ、配線ではなくビューポートの高さを検証することになる。
test('キーボード分の余白を与えるとドックが持ち上がりボードが縮む', tags('TP-004'), async ({ memo }) => {
  await memo.start();
  const before = await box(dock(memo));
  await memo.page.evaluate(() => document.documentElement.style.setProperty('--keyboard-inset', '200px'));
  const [board, after] = await Promise.all([box(memo.board), box(dock(memo))]);
  expect(after.y + after.height).toBeCloseTo(before.y + before.height - 200, 0);
  expect(board.y + board.height).toBeCloseTo(after.y, 0);
});
