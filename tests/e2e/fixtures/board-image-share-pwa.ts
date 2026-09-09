import { test as base, expect } from './pwa';
import { configureShare, sharedFiles } from '../mocks/web-share';

type Fixtures = { shareEnvironment: void; readSharedFiles: () => ReturnType<typeof sharedFiles> };
// ビルド成果物を配信する pwa プロジェクト用。オフラインでも共有経路を観測できるよう、
// アプリを開く前に共有スタブを仕込む（design.md - D6）。
export const test = base.extend<Fixtures>({
  shareEnvironment: [async ({ page }, use) => { await configureShare(page, 'env:web-share-stub'); await use(); }, { auto: true }],
  readSharedFiles: async ({ page }, use) => { await use(() => sharedFiles(page)); },
});
export { expect };
