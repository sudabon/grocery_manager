import { openDB, type DBSchema } from 'idb';
import { boardDateOf } from '../core/boardDate';
import type { QuadrantId } from '../core/classify';

export interface MemoItem {
  id: string;
  /** 所属するボードの日付（JST の `YYYY-MM-DD`）。version 2 で追加（design.md - D2）。 */
  boardDate: string;
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
  memos: { key: string; value: MemoItem; indexes: { quadrant: QuadrantId; createdAt: number; boardDate: string } };
  dictionaries: { key: QuadrantId; value: Dictionary };
  settings: { key: string; value: AppSettings | { key: string; probe: string } };
}
export const QUADMEMO_DB_VERSION = 2;
export function openQuadmemoDb() {
  const opened = openDB<QuadmemoDb>('quadmemo', QUADMEMO_DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        const memos = db.createObjectStore('memos', { keyPath: 'id' });
        memos.createIndex('quadrant', 'quadrant');
        memos.createIndex('createdAt', 'createdAt');
        db.createObjectStore('dictionaries', { keyPath: 'quadrant' });
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (oldVersion < 2) {
        const memos = transaction.objectStore('memos');
        memos.createIndex('boardDate', 'boardDate');
        // 既存メモを作成時刻の JST 日付へ振り分ける（design.md - D2）。
        // upgrade トランザクション内で完結させるので、途中で失敗すれば index 追加ごと巻き戻り、
        // 部分適用のデータは残らない（接続は失敗し、保存できない環境として扱われる）。
        // 失敗すると以降の起動でも同じ upgrade をやり直して同じ場所で失敗するため、
        // 変換処理は例外を投げない実装にすること（boardDateOf は全域関数である）。
        const migration = (async () => {
          for (let cursor = await memos.openCursor(); cursor; cursor = await cursor.continue()) {
            if (typeof cursor.value.boardDate === 'string') continue;
            await cursor.update({ ...cursor.value, boardDate: boardDateOf(cursor.value.createdAt) });
          }
        })();
        // IDB 由来の失敗はトランザクションが自ら中断するが、移行処理自身の失敗も同じ扱いにする。
        // 中断すると接続ごと失敗し、保存できない環境と見分けが付かなくなるので痕跡は残す。
        migration.catch((error: unknown) => {
          console.error('[db] version 2 への移行に失敗しました', error);
          try { transaction.abort(); } catch { /* Already aborted. */ }
        });
      }
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
