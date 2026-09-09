import { test as base, expect } from './classification';
import { configureShare, sharedFiles, type ShareMode } from '../mocks/web-share';

// 状態は classification.ts の classificationSeed をそのまま使う（seed:dict-all-empty が空ボード、
// seed:memos-across-quadrants が Q1 apple / Q2 ぱん / Q3 牛乳）。memo fixture も同ファイルの
// ボード表示待ち付きのものを継承するので、ここでは共有環境だけを足す。
type Fixtures = { shareMode: ShareMode; shareEnvironment: void; readSharedFiles: () => ReturnType<typeof sharedFiles> };
export const test = base.extend<Fixtures>({
  shareMode: ['env:web-share-stub', { option: true }],
  shareEnvironment: [async ({ page, shareMode }, use) => { await configureShare(page, shareMode); await use(); }, { auto: true }],
  readSharedFiles: async ({ page }, use) => { await use(() => sharedFiles(page)); },
});
export { expect };
