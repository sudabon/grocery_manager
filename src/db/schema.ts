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
  // 表示・エクスポートでは参照しない。唯一の出所は QUADRANT_LABELS（src/db/defaults.ts）。
  // IndexedDB のバージョン上げと既存レコードの書き換えを避けるためフィールドだけ残している。
  label: string;
  entries: string[];
  updatedAt: number;
}
/** バックアップに含める設定。エクスポート・インポートの対象。 */
export interface PortableSettings {
  key: string;
  partialMatch: boolean;
  autoCommitMs: number;
  allowDuplicates: boolean;
  showDictationHint: boolean;
}
/** 端末固有の設定。エクスポートに含めず、インポートでも既存値を保持する。 */
export interface DeviceSettings {
  installHintDismissed: boolean;
}
export type AppSettings = PortableSettings & DeviceSettings;

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
