import { test as base, expect, fixtureFile, readDownload } from './dictionaries';
import { HistoryPage } from '../pages/HistoryPage';

// 状態は classification.ts の classificationSeed（`seed:boards-across-days` /
// `seed:legacy-memos-without-date` を追加）、時刻は clockMode、共有環境は shareMode で選ぶ。
// メモ画面・辞書編集・設定の Page Object と共有スタブは dictionaries.ts のものを継承する。
export const test = base.extend<{ history: HistoryPage }>({
  history: async ({ page, memo }, use) => { void memo; await use(new HistoryPage(page)); },
});
export { expect, fixtureFile, readDownload };
