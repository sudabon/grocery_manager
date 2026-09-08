import { test as base, expect } from '@playwright/test';
import { seedIndexedDb } from './indexed-db';
import { defaultSettings, seedDictionaries } from '../../../src/db/defaults';
import { MemoBoardPage } from '../pages/MemoBoardPage';
import { AppShellPage } from '../pages/AppShellPage';

type Fixtures = { emptyDictionaries: void; memo: MemoBoardPage; noSegmenter: MemoBoardPage; reducedMotionBoard: MemoBoardPage; noDialog: MemoBoardPage; appShell: AppShellPage };
export const test = base.extend<Fixtures>({
  emptyDictionaries: [async ({ page }, use) => {
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
