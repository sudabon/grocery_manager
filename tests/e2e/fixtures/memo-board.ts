import { test as base, expect } from '@playwright/test';
import { seedIndexedDb } from './indexed-db';
import { FIXED_NOW, installFixedClock } from '../mocks/clock';
import { defaultSettings, seedDictionaries } from '../../../src/db/defaults';
import { MemoBoardPage } from '../pages/MemoBoardPage';
import { AppShellPage } from '../pages/AppShellPage';

type Fixtures = { emptyDictionaries: void; memo: MemoBoardPage; noSegmenter: MemoBoardPage; reducedMotionBoard: MemoBoardPage; noDialog: MemoBoardPage; appShell: AppShellPage };
export const test = base.extend<Fixtures>({
  // 自動 fixture なので他の fixture より先に走り、シードとナビゲーションの前に時刻を固定できる。
  // ボードは当日の日付で始まるため、日付が変わる瞬間に走ると前提が崩れる（`env:fixed-clock`）。
  emptyDictionaries: [async ({ page }, use) => {
    await installFixedClock(page, FIXED_NOW);
    await seedIndexedDb(page, { dictionaries: seedDictionaries(1).map((dict) => ({ ...dict, entries: [] })), settings: { ...defaultSettings }, memos: [] });
    await use();
  }, { auto: true }],
  memo: async ({ page }, use) => { const memo = new MemoBoardPage(page); await memo.goto(); await use(memo); },
  noSegmenter: async ({ page }, use) => {
    await page.addInitScript(() => Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true }));
    const memo = new MemoBoardPage(page); await memo.goto(); await use(memo);
  },
  reducedMotionBoard: async ({ page }, use) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const memo = new MemoBoardPage(page); await memo.goto(); await use(memo);
  },
  noDialog: async ({ page }, use) => {
    await page.addInitScript(() => Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { value: undefined, configurable: true }));
    const memo = new MemoBoardPage(page); await memo.goto(); await use(memo);
  },
  appShell: async ({ page, baseURL }, use) => { await use(new AppShellPage(page, baseURL!)); },
});
export { expect };
