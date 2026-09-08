import { test, expect } from './fixtures/deployed-origin';

test('配信ルートを HTTPS で開くと 200 でアプリシェルが表示される', {
  tag: ['@setup-quadmemo-hosting', '@TP-001'],
}, async ({ appShell }) => {
  const response = await appShell.goto();
  expect(response?.status()).toBe(200);
  await appShell.expectVisible();
});

test('HTTP の同一パスが HTTPS にリダイレクトされ 200 になる', {
  tag: ['@setup-quadmemo-hosting', '@TP-002'],
}, async ({ appShell, request, deployedOrigin }) => {
  const path = '/dictionaries';
  const httpURL = new URL(path, deployedOrigin);
  httpURL.protocol = 'http:';
  // ブラウザの HTTPS 自動昇格ではなく、サーバーのリダイレクトを検証する。
  const redirect = await request.get(httpURL.href, { maxRedirects: 0 });
  expect([301, 302, 307, 308]).toContain(redirect.status());
  expect(redirect.headers().location).toBe(new URL(path, deployedOrigin).href);
  const response = await appShell.gotoHttp(path);
  expect(response?.status()).toBe(200);
  await appShell.expectPath(path);
  await appShell.expectVisible();
});

test('辞書画面へ直リンクすると 200 でアプリシェルが表示される', {
  tag: ['@setup-quadmemo-hosting', '@TP-003'],
}, async ({ appShell }) => {
  const response = await appShell.goto('/dictionaries');
  expect(response?.status()).toBe(200);
  expect(await response?.headerValue('cache-control')).toMatch(/\bno-cache\b/i);
  await appShell.expectPath('/dictionaries');
  await appShell.expectVisible();
});

test('設定画面でリロードしても 200 でアプリシェルが表示される', {
  tag: ['@setup-quadmemo-hosting', '@TP-004'],
}, async ({ appShell }) => {
  await appShell.goto('/settings');
  await appShell.expectVisible();
  const response = await appShell.reload();
  expect(response?.status()).toBe(200);
  await appShell.expectPath('/settings');
  await appShell.expectVisible();
});

test('アプリシェルの Cache-Control が no-cache を含む', {
  tag: ['@setup-quadmemo-hosting', '@TP-005'],
}, async ({ appShell }) => {
  const response = await appShell.goto('/index.html');
  expect(response?.status()).toBe(200);
  expect(await response?.headerValue('cache-control')).toMatch(/\bno-cache\b/i);
});

test('アプリシェルにセキュリティレスポンスヘッダーが付く', {
  tag: ['@setup-quadmemo-hosting', '@TP-006'],
}, async ({ appShell }) => {
  const response = await appShell.goto();
  expect(response?.status()).toBe(200);
  expect(await response?.headerValue('x-content-type-options')).toBe('nosniff');
  expect(await response?.headerValue('strict-transport-security')).toMatch(/max-age=[1-9]\d*/i);
  expect(await response?.headerValue('x-frame-options')).toMatch(/^(DENY|SAMEORIGIN)$/i);
});
