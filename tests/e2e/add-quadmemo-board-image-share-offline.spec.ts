import { test, expect } from './fixtures/board-image-share-pwa';

// オフライン観点はビルド成果物を配信する pwa プロジェクトで実行する（design.md - D6）。
test('切断状態で画像共有するとPNGが共有へ渡る', { tag: ['@add-quadmemo-board-image-share', '@TP-008'] }, async ({ builtAppOffline: app, readSharedFiles }) => {
  await app.memo.start(); await app.memo.add('牛乳'); await app.memo.waitForSave();
  await app.memo.shareImage();
  await expect.poll(readSharedFiles).toHaveLength(1);
  const [shared] = await readSharedFiles();
  expect(shared.name).toMatch(/^quadmemo-board-\d{4}-\d{2}-\d{2}\.png$/);
  expect(shared.type).toBe('image/png');
  expect(shared.size).toBeGreaterThan(0);
  // t=0 でトーストが出ている場合、既定の 5000ms は 4000ms の自動消滅を待って偽の緑になる。
  // 遅れて出るトーストは toBeEmpty が即座に成功して抜けるため、この timeout では検出できない。
  await expect(app.memo.toast).toBeEmpty({ timeout: 1000 });
});
