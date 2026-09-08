import { test as base, expect } from '@playwright/test';
import { MemoBoardPage } from '../pages/MemoBoardPage';
import { AppShellPage } from '../pages/AppShellPage';
import { seedIndexedDb, type DatabaseSeed } from './indexed-db';
import { defaultSettings, seedDictionaries } from '../../../src/db/defaults';
import type { MemoItem } from '../../../src/db/schema';

export const fixtureNames = [
  'seed:dict-all-empty', 'seed:fresh-storage', 'seed:dict-basic', 'seed:dict-overlap-partial', 'seed:dict-normalize-tie',
  'seed:settings-partial-match', 'seed:settings-no-duplicates', 'seed:memos-across-quadrants',
  'seed:dict-custom-labels', 'env:idb-write-failure', 'env:idb-blocked',
] as const;
export type ClassificationFixture = typeof fixtureNames[number];
function memo(id: string, rawText: string, quadrant: MemoItem['quadrant']): MemoItem {
  return { id, rawText, normText: rawText, quadrant, matchedEntry: rawText, autoClassified: true, createdAt: 1, updatedAt: 1 };
}
function seedFor(name: ClassificationFixture): DatabaseSeed {
  const dictionaries = seedDictionaries(1);
  dictionaries[0].entries = ['apple', '会議', '猫'];
  dictionaries[1].entries = ['ぱん'];
  dictionaries[2].entries = ['牛乳'];
  const seed: DatabaseSeed = { dictionaries, settings: { ...defaultSettings }, memos: [] };
  if (name === 'seed:dict-all-empty') dictionaries.forEach((d) => { d.entries = []; });
  if (name === 'seed:dict-overlap-partial') {
    dictionaries[0].entries = ['app']; dictionaries[1].entries = ['apple']; seed.settings.partialMatch = true;
  }
  if (name === 'seed:dict-normalize-tie') {
    dictionaries[0].entries = ['ＡＰＰＬＥ']; dictionaries[1].entries = ['apple'];
  }
  if (name === 'seed:settings-partial-match') seed.settings.partialMatch = true;
  if (name === 'seed:settings-no-duplicates') {
    seed.settings.allowDuplicates = false; seed.memos = [memo('01J00000000000000000000001', 'apple', 'q1')];
  }
  if (name === 'seed:memos-across-quadrants') seed.memos = [
    memo('01J00000000000000000000001', 'apple', 'q1'), memo('01J00000000000000000000002', 'ぱん', 'q2'), memo('01J00000000000000000000003', '牛乳', 'q3'),
  ];
  if (name === 'seed:dict-custom-labels') {
    dictionaries.forEach((dict, index) => { dict.label = ['企画', '暮らし', '食品', '保留'][index]; });
    seed.settings.partialMatch = true;
    seed.settings.autoCommitMs = 3000;
    seed.settings.showDictationHint = false;
  }
  return seed;
}
type Fixtures = { classificationSeed: ClassificationFixture; memo: MemoBoardPage; appShell: AppShellPage; externalRequests: string[] };
export const test = base.extend<Fixtures>({
  classificationSeed: ['seed:dict-basic', { option: true }],
  externalRequests: [async ({ context, baseURL }, use) => {
    const requests: string[] = [];
    context.on('request', (request) => { if (new URL(request.url()).origin !== new URL(baseURL!).origin) requests.push(request.url()); });
    await use(requests);
  }, { auto: true }],
  memo: async ({ page, classificationSeed }, use) => {
    if (classificationSeed === 'env:idb-blocked') {
      await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('Blocked', 'SecurityError'); } }));
    } else if (classificationSeed !== 'seed:fresh-storage') await seedIndexedDb(page, seedFor(classificationSeed));
    if (classificationSeed === 'env:idb-write-failure') {
      await page.addInitScript(() => Object.defineProperty(window, '__QUADMEMO_FAIL_WRITES__', { value: true, writable: false }));
    }
    const memo = new MemoBoardPage(page); await memo.goto(); await expect(memo.board).toBeVisible(); await use(memo);
  },
  appShell: async ({ page, baseURL }, use) => { await use(new AppShellPage(page, baseURL!)); },
});
export { expect };
