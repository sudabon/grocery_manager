import { test as base, expect } from './memo-board';
import { MemoBoardPage } from '../pages/MemoBoardPage';
import { seedFor } from './classification';
import { seedIndexedDb } from './indexed-db';
import { defaultSettings, seedDictionaries } from '../../../src/db/defaults';
import { configureShare, sharedFiles, type ShareMode } from '../mocks/web-share';

export type BoardSeed = 'seed:empty-board' | 'seed:memos-across-quadrants';
type Fixtures = { boardSeed: BoardSeed; shareMode: ShareMode; shareEnvironment: void; readSharedFiles: () => ReturnType<typeof sharedFiles> };
export const test = base.extend<Fixtures>({
  boardSeed: ['seed:empty-board', { option: true }],
  shareMode: ['env:web-share-stub', { option: true }],
  // memo-board の投入を boardSeed で差し替える。シードは addInitScript の upgrade で 1 回しか走らないため、
  // 追加の fixture を重ねるのではなくここで選ぶ（seed:empty-board は従来と同じ状態）。
  emptyDictionaries: async ({ page, boardSeed }, use) => {
    await seedIndexedDb(page, boardSeed === 'seed:empty-board'
      ? { dictionaries: seedDictionaries(1).map((dict) => ({ ...dict, entries: [] })), settings: { ...defaultSettings }, memos: [] }
      : seedFor(boardSeed));
    await use();
  },
  // ボードの表示を待ってから渡す。MemoPage は初期化完了後にしか描画されないので、
  // 表示できた時点でシード済みのチップも出そろっている（共有前後の比較が空配列にならない）。
  memo: async ({ page }, use) => { const memo = new MemoBoardPage(page); await memo.goto(); await expect(memo.board).toBeVisible(); await use(memo); },
  shareEnvironment: [async ({ page, shareMode }, use) => { await configureShare(page, shareMode); await use(); }, { auto: true }],
  readSharedFiles: async ({ page }, use) => { await use(() => sharedFiles(page)); },
});
export { expect };
