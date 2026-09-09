import { test, expect } from './fixtures/pwa';

const tag = (id: string) => ['@add-quadmemo-pwa-offline', `@${id}`];

test('マニフェストを取得すると standalone・ルートスコープ・3種のアイコンを宣言している', { tag: tag('TP-001') }, async ({ builtApp }) => {
  const manifest = await builtApp.manifest();
  expect(manifest).toMatchObject({ name: 'QuadMemo', short_name: 'QuadMemo', display: 'standalone', orientation: 'portrait', start_url: '/', scope: '/', theme_color: '#1a1a2e', background_color: '#1a1a2e' });
  expect(manifest.icons).toEqual([
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ]);
});
test('マニフェストと iOS 用アイコンを取得すると宣言どおりの PNG サイズである', { tag: tag('TP-002') }, async ({ builtApp }) => {
  await builtApp.expectIcons();
});
test('保存して切断後に再読み込みするとメモと空の象限が復元される', { tag: tag('TP-003') }, async ({ builtApp, context }) => {
  await builtApp.memo.start(); await builtApp.memo.add('牛乳'); await builtApp.memo.waitForSave();
  await context.setOffline(true); await builtApp.memo.reload();
  await expect(builtApp.memo.classifiedChip('牛乳')).toBeVisible();
  await expect(builtApp.memo.quadrantChips(1)).toHaveCount(0);
  await expect(builtApp.memo.quadrantChips(3)).toHaveCount(1);
});
test('キャッシュ後の空データでもオフラインで再起動できる', { tag: tag('TP-003') }, async ({ builtAppOffline: app }) => {
  await app.memo.reload(); await expect(app.memo.chips).toHaveCount(0);
});
test('オフライン利用可の表示後はアプリシェルがキャッシュされている', { tag: tag('TP-003') }, async ({ builtApp }) => {
  const cached = await builtApp.page.evaluate(async () => {
    const names = await caches.keys();
    const urls: string[] = [];
    for (const name of names) urls.push(...(await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname));
    return urls;
  });
  expect(cached).toContain('/index.html');
  expect(cached).toContain('/manifest.webmanifest');
  expect(cached.some((path) => path.startsWith('/icons/'))).toBe(true);
});
test('切断状態で追加・移動・編集・削除すると再読み込み後も保持される', { tag: tag('TP-004') }, async ({ builtAppOffline: app }) => {
  await app.memo.start(); await app.memo.add('牛乳 banana'); await app.memo.waitForSave();
  await app.memo.openClassifiedChip('牛乳'); await app.memo.moveButton(1).click();
  await app.memo.openClassifiedChip('牛乳'); await app.memo.edit('変更後メモ');
  await app.memo.openChip('banana'); await app.memo.remove(); await app.memo.waitForSave();
  await app.memo.reload();
  await expect(app.memo.quadrantChips(1)).toHaveCount(1);
  await expect(app.memo.chip('変更後メモ')).toBeVisible();
  await expect(app.memo.chips).toHaveCount(1);
});
test('切断状態で辞書・設定へ遷移して編集すると再読み込み後も反映される', { tag: tag('TP-005') }, async ({ builtAppOffline: app }) => {
  await app.dictionaries.open();
  await app.dictionaries.entries.fill('傘'); await app.dictionaries.save(); await app.dictionaries.reload();
  await expect(app.dictionaries.tab(1)).toHaveText('Q1 それ以外'); await expect(app.dictionaries.entries).toHaveValue('傘');
  await app.settings.open(); await app.settings.duplicates.uncheck(); await app.settings.saved(); await app.settings.reload();
  await expect(app.settings.duplicates).not.toBeChecked();
  await app.settings.back(); await app.memo.start(); await app.memo.add('傘'); await app.memo.waitForSave();
  await expect(app.memo.quadrantChips(1)).toHaveCount(1);
});
test('切断して再表示しても4象限と文字が表示され外部ホストへ要求しない', { tag: tag('TP-006') }, async ({ builtAppOffline: app, externalRequests }) => {
  await app.memo.reload(); await app.memo.expectEqualQuadrants();
  for (const [index, label] of ['それ以外', '野菜', '肉類・乳製品', 'ドラッグストア'].entries()) {
    await expect(app.memo.quadrant(index + 1)).toBeVisible();
    await expect(app.memo.quadrant(index + 1)).toContainText(label);
  }
  expect(externalRequests).toEqual([]);
});
test('更新が無ければ更新通知を表示しない', { tag: tag('TP-007') }, async ({ builtApp }) => {
  await expect(builtApp.updateBanner).toHaveCount(0);
});
test('更新待機状態で開くと更新通知と操作の導線が表示される', { tag: tag('TP-007') }, async ({ swUpdateAvailable: app }) => {
  await expect(app.updateBanner).toContainText('新しいバージョンがあります'); await expect(app.updateButton).toBeEnabled();
  await app.settings.open(); await expect(app.swState('更新待機中')).toBeVisible();
});
test.describe('ブラウザでのバナー同時表示', () => {
  test.use({ displayModeName: 'browser' });
  test('更新待機中の初回訪問でも両バナーと4象限が表示される', { tag: tag('TP-007') }, async ({ swUpdateAvailable: app }) => {
    await expect(app.updateBanner).toBeVisible();
    await expect(app.installHint).toBeVisible();
    await app.memo.expectEqualQuadrants();
    for (let index = 1; index <= 4; index++) await expect(app.memo.quadrant(index)).toBeVisible();
  });
});
test('更新せずに操作を続けても通知と入力途中のテキストが維持される', { tag: tag('TP-008') }, async ({ swUpdateAvailable: app }) => {
  await app.memo.start();
  // Composition prevents normal auto-commit, so this isolates reload/data loss from the input timer.
  await app.memo.input.dispatchEvent('compositionstart');
  await app.memo.input.fill('入力途中');
  await expect(app.updateButton).toBeEnabled(); await app.memo.expectEqualQuadrants();
  await expect(app.memo.input).toHaveValue('入力途中'); await expect(app.memo.chips).toHaveCount(0);
  await expect(app.updateBanner).toBeVisible();
});
test('ブラウザ表示で初めて開くとホーム画面追加の手順を案内する', { tag: tag('TP-009') }, async ({ displayModeApp: app }) => {
  await expect(app.installHint).toContainText('共有ボタンから「ホーム画面に追加」');
});
test('ホーム画面追加の案内を閉じて再読み込みすると再表示されない', { tag: tag('TP-010') }, async ({ displayModeApp: app }) => {
  await app.closeHint(); await app.memo.reload(); await expect(app.installHint).toHaveCount(0);
});
test.describe('media standalone', () => {
  test.use({ displayModeName: 'media' });
  test('standalone 表示で開くと追加の案内を表示しない', { tag: tag('TP-011') }, async ({ displayModeApp: app }) => {
    await expect(app.installHint).toHaveCount(0);
  });
});
test.describe('ios standalone', () => {
  test.use({ displayModeName: 'ios' });
  test('iOS の standalone フラグでも追加の案内を表示しない', { tag: tag('TP-011') }, async ({ displayModeApp: app }) => {
    await expect(app.installHint).toHaveCount(0);
  });
});
test('設定画面を開くと Service Worker の登録状態が読める', { tag: tag('TP-012') }, async ({ builtApp }) => {
  await builtApp.settings.open(); await expect(builtApp.swState('登録済み')).toBeVisible();
});
test('未キャッシュでオフライン初回訪問するとアプリシェルは起動できない', { tag: tag('TP-013') }, async ({ builtAppOfflineFirstVisit: result }) => {
  expect(result.navigationFailed).toBe(true);
  expect(result.boardVisible).toBe(false);
});
