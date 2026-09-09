import type { Page } from '@playwright/test';
import type { AppSettings, Dictionary, MemoItem } from '../../../src/db/schema';

/** 日付を持たない version 1 相当のレコードも投入できるようにする（`seed:legacy-memos-without-date`）。 */
export type SeedMemo = Omit<MemoItem, 'boardDate'> & { boardDate?: string };
export interface DatabaseSeed { dictionaries: Dictionary[]; settings: AppSettings; memos: SeedMemo[] }
export async function seedIndexedDb(page: Page, seed: DatabaseSeed) {
  await page.addInitScript((data) => {
    // Each test owns a fresh browser context. Seed only during creation, within
    // the upgrade transaction: app connections wait until all records commit.
    // Reloading opens the existing database without reseeding, so restoration tests exercise real writes.
    // 投入は version 1 のスキーマで行う。アプリ側の接続が version 2 へ上げ、日付を持たない
    // レコードは upgrade の移行処理で作成日の JST 日付へ振り分けられる（daily-boards design - D2）。
    const request = indexedDB.open('quadmemo', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const memos = db.createObjectStore('memos', { keyPath: 'id' });
      memos.createIndex('quadrant', 'quadrant'); memos.createIndex('createdAt', 'createdAt');
      const dictionaries = db.createObjectStore('dictionaries', { keyPath: 'quadrant' });
      const settings = db.createObjectStore('settings', { keyPath: 'key' });
      for (const memo of data.memos) memos.put(memo);
      for (const dict of data.dictionaries) dictionaries.put(dict);
      settings.put(data.settings);
    };
    request.onsuccess = () => request.result.close();
  }, seed);
}
