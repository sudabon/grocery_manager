import type { Page } from '@playwright/test';
import type { AppSettings, Dictionary, MemoItem } from '../../../src/db/schema';

export interface DatabaseSeed { dictionaries: Dictionary[]; settings: AppSettings; memos: MemoItem[] }
export async function seedIndexedDb(page: Page, seed: DatabaseSeed) {
  await page.addInitScript((data) => {
    // Each test owns a fresh browser context. Seed only during creation, within
    // the upgrade transaction: app connections wait until all records commit.
    // Reloading opens v1 without reseeding, so restoration tests exercise real writes.
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
