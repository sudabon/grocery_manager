import { test, expect, hashedAssetsOf } from './fixtures/current-build';

// 配信の契機・資格情報・直列化はブラウザから観測できないため、ここでは
// 「配信中の内容が手元のビルド成果物（= main）と一致すること」と、
// 「手元実行と同じ手順で配信されたこと（キャッシュ制御）」だけを見る（test-plan.md）。

test('配信中のアプリシェルが参照するハッシュ付きアセットが手元のビルド成果物と一致する', {
  tag: ['@setup-quadmemo-cd', '@TP-001'],
}, async ({ appShell, currentBuildAssets }) => {
  const response = await appShell.goto('/index.html');
  expect(response?.status()).toBe(200);
  await appShell.expectVisible();
  const deployedAssets = hashedAssetsOf(await response!.text());
  expect(deployedAssets).toEqual(currentBuildAssets);
});

test('ハッシュ付きアセットは 1 年 immutable、アプリシェルは no-cache で配信される', {
  tag: ['@setup-quadmemo-cd', '@TP-002'],
}, async ({ appShell, request, deployedOrigin, currentBuildAssets }) => {
  const shell = await appShell.goto('/index.html');
  expect(shell?.status()).toBe(200);
  expect(await shell?.headerValue('cache-control')).toBe('no-cache');
  for (const asset of currentBuildAssets) {
    const response = await request.get(new URL(asset, deployedOrigin).href);
    expect(response.status(), asset).toBe(200);
    // 存在しないパスは SPA フォールバックでアプリシェルが 200 で返るため、本体であることも見る。
    expect(response.headers()['content-type'], asset).not.toMatch(/^text\/html/);
    expect(response.headers()['cache-control'], asset).toBe('public, max-age=31536000, immutable');
  }
});
