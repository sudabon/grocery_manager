import 'fake-indexeddb/auto';
import { deleteDB, openDB } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// getQuadmemoDb は接続をモジュール変数にキャッシュする。テストごとにモジュールを
// 読み直して、後片付けが blocking() の副作用に依存しないようにする。
let schema: typeof import('../schema');
beforeEach(async () => { vi.resetModules(); schema = await import('../schema'); });
afterEach(async () => { await deleteDB('quadmemo'); });

it('接続をキャッシュし、closeイベントで破棄して次回に開き直す', async () => {
  const first = schema.getQuadmemoDb();
  expect(schema.getQuadmemoDb()).toBe(first);
  const db = await first;
  db.dispatchEvent(new IDBVersionChangeEvent('close'));
  const second = schema.getQuadmemoDb();
  expect(second).not.toBe(first);
  db.close(); (await second).close();
});
it('versionchangeで接続を破棄し次回に開き直す', async () => {
  const first = schema.getQuadmemoDb();
  const db = await first;
  db.dispatchEvent(new IDBVersionChangeEvent('versionchange'));
  const second = schema.getQuadmemoDb();
  expect(second).not.toBe(first);
  db.close(); (await second).close();
});
it('open失敗はキャッシュせず次回に開き直す', async () => {
  const bumped = await openDB('quadmemo', 2, { upgrade() {} });
  bumped.close();
  await expect(schema.getQuadmemoDb()).rejects.toThrow();
  await deleteDB('quadmemo');
  const retried = schema.getQuadmemoDb();
  await expect(retried).resolves.toBeTruthy();
  (await retried).close();
});
