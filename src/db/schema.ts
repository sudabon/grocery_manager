import { openDB, type DBSchema } from 'idb';
import type { QuadrantId } from '../core/classify';

export interface MemoItem {
  id: string;
  rawText: string;
  normText: string;
  quadrant: QuadrantId;
  matchedEntry: string | null;
  autoClassified: boolean;
  createdAt: number;
  updatedAt: number;
}
export interface Dictionary {
  quadrant: QuadrantId;
  label: string;
  entries: string[];
  updatedAt: number;
}
export interface AppSettings {
  key: 'app';
  partialMatch: boolean;
  autoCommitMs: number;
  allowDuplicates: boolean;
  showDictationHint: boolean;
}
export interface QuadmemoDb extends DBSchema {
  memos: { key: string; value: MemoItem; indexes: { quadrant: QuadrantId; createdAt: number } };
  dictionaries: { key: QuadrantId; value: Dictionary };
  settings: { key: string; value: AppSettings | { key: string; probe: string } };
}
export function openQuadmemoDb() {
  const opened = openDB<QuadmemoDb>('quadmemo', 1, {
    upgrade(db) {
      const memos = db.createObjectStore('memos', { keyPath: 'id' });
      memos.createIndex('quadrant', 'quadrant');
      memos.createIndex('createdAt', 'createdAt');
      db.createObjectStore('dictionaries', { keyPath: 'quadrant' });
      db.createObjectStore('settings', { keyPath: 'key' });
    },
    blocking() { connection = undefined; void opened.then((db) => db.close()).catch(() => {}); },
    terminated() { connection = undefined; },
  });
  return opened;
}

// One connection per application. It is dropped on close, terminate, and open failure so the next call reopens; repository construction remains injectable for tests.
let connection: ReturnType<typeof openQuadmemoDb> | undefined;
export function getQuadmemoDb() {
  return connection ??= openQuadmemoDb().catch((error) => { connection = undefined; throw error; });
}
