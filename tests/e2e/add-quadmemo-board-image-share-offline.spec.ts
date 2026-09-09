import { test, expect } from './fixtures/board-image-share-pwa';

// オフライン観点はビルド成果物を配信する pwa プロジェクトで実行する（design.md - D6）。
test('切断状態で画像共有するとPNGが共有へ渡る', { tag: ['@add-quadmemo-board-image-share', '@TP-008'] }, async ({ builtAppOffline: app, readSharedFiles }) => {
  await app.memo.start(); await app.memo.add('牛乳'); await app.memo.waitForSave();
  await app.memo.shareImage();
  await expect.poll(readSharedFiles).toEqual([{ name: expect.stringMatching(/^quadmemo-board-\d{4}-\d{2}-\d{2}\.png$/), type: 'image/png' }]);
  await expect(app.memo.toast).toBeEmpty();
});
