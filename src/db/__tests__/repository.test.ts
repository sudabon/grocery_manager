import 'fake-indexeddb/auto';
import { deleteDB, unwrap } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openQuadmemoDb, QUADMEMO_DB_VERSION, type MemoItem } from '../schema';
import { boardDateOf, isBoardDate } from '../../core/boardDate';
import { createRepository, requestPersistence } from '../repository';
import { defaultSettings, seedDictionaries } from '../defaults';

let db: Awaited<ReturnType<typeof openQuadmemoDb>>;
let repo: ReturnType<typeof createRepository>;
const BOARD = '2026-09-09';
const memo = (id: string, createdAt = 1, boardDate = BOARD): MemoItem => ({ id, boardDate, rawText: '牛乳', normText: '牛乳', quadrant: 'q3', matchedEntry: '牛乳', autoClassified: true, createdAt, updatedAt: createdAt });
beforeEach(async () => { db = await openQuadmemoDb(); repo = createRepository(async () => db); });
afterEach(async () => { db.close(); await deleteDB('quadmemo'); vi.unstubAllGlobals(); });
it('インポートで端末のインストール案内の記録をリセットしない', async () => {
  await repo.seed();
  await repo.saveSettings({ ...defaultSettings, installHintDismissed: true });
  const data = await repo.getAllData();
  const imported = await repo.applyImport({ ...data, settings: { ...defaultSettings, partialMatch: true } });
  expect(imported.settings).toMatchObject({ partialMatch: true, installHintDismissed: true });
  expect(await repo.getSettings()).toEqual(imported.settings);
});
it('旧設定は端末設定の既定値を補い、インポートした端末設定を採用しない', async () => {
  await repo.seed();
  const { installHintDismissed: _dismissed, ...legacy } = defaultSettings;
  // 型分割以前に保存されたレコードを native IDB で再現する。
  const tx = db.transaction('settings', 'readwrite');
  unwrap(tx.store).put(legacy);
  await tx.done;
  expect(await repo.getSettings()).toEqual(defaultSettings);
  expect(await db.get('settings', 'app')).toEqual(legacy);
  const incoming = { ...legacy, partialMatch: true, installHintDismissed: true };
  const imported = await repo.applyImport({ dictionaries: await repo.getDictionaries(), memos: [], settings: incoming });
  expect(imported.settings).toEqual({ ...defaultSettings, partialMatch: true });
  expect(await repo.getSettings()).toEqual(imported.settings);
});
it('settings レコードが無い状態のインポートでは案内を閉じたフラグを採用しない', async () => {
  expect(await db.get('settings', 'app')).toBeUndefined();
  const incoming = { ...defaultSettings, partialMatch: true, installHintDismissed: true };
  const imported = await repo.applyImport({ dictionaries: seedDictionaries(), memos: [], settings: incoming });
  expect(imported.settings).toMatchObject({ partialMatch: true, installHintDismissed: false });
  expect(await db.get('settings', 'app')).toEqual(imported.settings);
  expect(await repo.getSettings()).toEqual(imported.settings);
});
it('インポートで端末の明示的な false も保持される', async () => {
  await repo.saveSettings({ ...defaultSettings, installHintDismissed: false });
  const incoming = { ...defaultSettings, partialMatch: true, installHintDismissed: true };
  const imported = await repo.applyImport({ dictionaries: seedDictionaries(), memos: [], settings: incoming });
  expect(imported.settings).toMatchObject({ partialMatch: true, installHintDismissed: false });
  expect(await db.get('settings', 'app')).toEqual(imported.settings);
  expect(await repo.getSettings()).toEqual(imported.settings);
});
it('v2スキーマとメモCRUD・作成順・象限別取得', async () => {
  expect(db.version).toBe(2);
  expect(QUADMEMO_DB_VERSION).toBe(2);
  expect([...db.objectStoreNames]).toEqual(['dictionaries', 'memos', 'settings']);
  const store = db.transaction('memos').store;
  expect(store.keyPath).toBe('id');
  expect([...store.indexNames]).toEqual(['boardDate', 'createdAt', 'quadrant']);
  await repo.putMemos([memo('b', 2), memo('c'), memo('a')]);
  expect((await repo.getMemos()).map((item) => item.id)).toEqual(['a', 'c', 'b']);
  await repo.putMemos([{ ...memo('a'), quadrant: 'q1', rawText: '編集', normText: '編集' }]);
  expect(await repo.getMemos({ quadrant: 'q1' })).toMatchObject([{ id: 'a', rawText: '編集' }]);
  expect(await repo.getMemos({ quadrant: 'q3' })).toHaveLength(2);
  await repo.removeMemo('a'); expect(await repo.getMemos()).toHaveLength(2);
  await repo.clearMemos(); expect(await repo.getMemos()).toEqual([]);
});
it('日付で絞って読み、日付と象限の併用もできる', async () => {
  await repo.putMemos([memo('a', 1), memo('b', 2, '2026-09-08'), { ...memo('c', 3), quadrant: 'q1' }]);
  expect((await repo.getMemos({ boardDate: BOARD })).map((item) => item.id)).toEqual(['a', 'c']);
  expect((await repo.getMemos({ boardDate: '2026-09-08' })).map((item) => item.id)).toEqual(['b']);
  expect(await repo.getMemos({ boardDate: '2026-09-07' })).toEqual([]);
  expect((await repo.getMemos({ boardDate: BOARD, quadrant: 'q1' })).map((item) => item.id)).toEqual(['c']);
});
it('チップがある日付だけを新しい順で返す', async () => {
  expect(await repo.getBoardDates()).toEqual([]);
  await repo.putMemos([memo('a', 1, '2026-09-06'), memo('b', 2, BOARD), memo('c', 3, BOARD), memo('d', 4, '2026-09-08')]);
  expect(await repo.getBoardDates()).toEqual(['2026-09-09', '2026-09-08', '2026-09-06']);
  await repo.removeMemo('d');
  expect(await repo.getBoardDates()).toEqual(['2026-09-09', '2026-09-06']);
});
it('version 1 のデータを version 2 へ移行してメモを失わず作成日の JST 日付を書き込む', async () => {
  db.close(); await deleteDB('quadmemo');
  // version 1 のストアと、日付を持たないレコードを native IDB で再現する。
  const legacy = [
    { id: 'a', createdAt: Date.parse('2026-09-10T00:30:00+09:00') },   // JST 0:30（UTC では前日）
    { id: 'b', createdAt: Date.parse('2026-09-09T23:30:00+09:00') },
    { id: 'c', createdAt: Date.parse('2026-09-06T12:00:00+09:00') },
  ];
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('quadmemo', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('memos', { keyPath: 'id' });
      store.createIndex('quadrant', 'quadrant');
      store.createIndex('createdAt', 'createdAt');
      request.result.createObjectStore('dictionaries', { keyPath: 'quadrant' });
      request.result.createObjectStore('settings', { keyPath: 'key' });
      for (const { id, createdAt } of legacy) {
        const { boardDate: _omitted, ...withoutDate } = memo(id, createdAt);
        store.put(withoutDate);
      }
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
  db = await openQuadmemoDb(); repo = createRepository(async () => db);
  expect(db.version).toBe(2);
  const migrated = await repo.getMemos();
  expect(migrated).toHaveLength(legacy.length);
  expect(migrated.map(({ id, boardDate }) => ({ id, boardDate }))).toEqual([
    { id: 'c', boardDate: '2026-09-06' }, { id: 'b', boardDate: '2026-09-09' }, { id: 'a', boardDate: '2026-09-10' },
  ]);
  for (const item of migrated) expect(item.boardDate).toBe(boardDateOf(item.createdAt));
  // 移行後は日付の索引で引ける。
  expect(await repo.getBoardDates()).toEqual(['2026-09-10', '2026-09-09', '2026-09-06']);
  expect((await repo.getMemos({ boardDate: '2026-09-09' })).map((item) => item.id)).toEqual(['b']);
  // 本文などの既存フィールドは書き換えない。
  expect(migrated[0]).toMatchObject({ rawText: '牛乳', normText: '牛乳', quadrant: 'q3', matchedEntry: '牛乳', autoClassified: true });
});
it('変換できない createdAt を持つ v1 レコードがあっても移行が成功する', async () => {
  db.close(); await deleteDB('quadmemo');
  // v1 のインポート検証は Number.isFinite しか見ていなかったため、Date で表現できない
  // createdAt も保存され得た。1 件でも変換に失敗すると upgrade ごと abort され、
  // 以降どの起動でもデータベースが開けなくなる（boardDateOf を全域関数にしている理由）。
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('quadmemo', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('memos', { keyPath: 'id' });
      store.createIndex('quadrant', 'quadrant');
      store.createIndex('createdAt', 'createdAt');
      request.result.createObjectStore('dictionaries', { keyPath: 'quadrant' });
      request.result.createObjectStore('settings', { keyPath: 'key' });
      for (const createdAt of [1e18, Date.parse('2026-09-09T09:00:00+09:00')]) {
        const { boardDate: _omitted, ...withoutDate } = memo(`memo-${createdAt}`, createdAt);
        store.put(withoutDate);
      }
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
  db = await openQuadmemoDb(); repo = createRepository(async () => db);
  expect(db.version).toBe(2);
  const migrated = await repo.getMemos();
  // 壊れた 1 件のために他のメモまで失わない。
  expect(migrated).toHaveLength(2);
  for (const item of migrated) expect(isBoardDate(item.boardDate)).toBe(true);
  expect(migrated.find((item) => item.createdAt === 1e18)!.boardDate).toBe('9999-12-31');
  const sane = migrated.find((item) => item.createdAt !== 1e18)!;
  expect(sane.boardDate).toBe(boardDateOf(sane.createdAt));
  // 移行後は日付の索引で引ける。
  expect(await repo.getBoardDates()).toEqual(['9999-12-31', BOARD]);
});
it('version 2 で開き直しても日付を持つレコードを書き換えない', async () => {
  await repo.putMemos([memo('a', 5, '2026-01-02')]);
  db.close();
  db = await openQuadmemoDb(); repo = createRepository(async () => db);
  expect(await repo.getMemos()).toEqual([memo('a', 5, '2026-01-02')]);
});
it('50件を単一トランザクションで書き込む', async () => {
  const transaction = vi.spyOn(db, 'transaction');
  await repo.putMemos(Array.from({ length: 50 }, (_, i) => memo(String(i))));
  expect(transaction).toHaveBeenCalledTimes(1);
  expect(await repo.getMemos()).toHaveLength(50);
});
it('一括書き込みの途中で失敗しても部分保存しない', async () => {
  await expect(repo.putMemos([memo('a'), { ...memo('b'), id: undefined } as unknown as MemoItem])).rejects.toThrow();
  expect(await repo.getMemos()).toEqual([]);
});
it('初期データ投入と辞書・設定の更新は独立し上書きしない', async () => {
  await repo.seed();
  const dictionaries = await repo.getDictionaries();
  expect(dictionaries.map((dict) => dict.label)).toEqual(['それ以外', '野菜', '肉類・乳製品', 'ドラッグストア']);
  expect(dictionaries.map((dict) => dict.entries)).toEqual([[], ['にんじん', 'たまねぎ', 'キャベツ', 'じゃがいも'], ['牛乳', '卵', '鶏肉', 'チーズ'], []]);
  expect(await repo.getSettings()).toEqual(defaultSettings);
  const custom = { ...dictionaries[0], label: '独自', entries: ['custom'] };
  await repo.saveDictionary(custom);
  await repo.saveSettings({ ...defaultSettings, partialMatch: true, allowDuplicates: false });
  await repo.seed();
  expect((await repo.getDictionaries())[0]).toEqual(custom);
  expect(await db.get('dictionaries', 'q1')).toHaveProperty('label', '独自');
  expect(await repo.getSettings()).toMatchObject({ partialMatch: true, allowDuplicates: false });
  await db.clear('settings'); await repo.seed();
  expect((await repo.getDictionaries())[0]).toEqual(custom);
  expect(await db.get('dictionaries', 'q1')).toHaveProperty('label', '独自');
  expect(await repo.getSettings()).toEqual(defaultSettings);
  await repo.saveSettings({ ...defaultSettings, autoCommitMs: 3000 });
  await db.clear('dictionaries'); await repo.seed();
  expect(await repo.getDictionaries()).toHaveLength(4);
  expect(await repo.getSettings()).toMatchObject({ autoCommitMs: 3000 });
});
it('probeは読み戻して検証し一時レコードを残さない', async () => {
  expect(await repo.probeStorage()).toBe(true);
  expect(await db.count('settings')).toBe(0);
  vi.spyOn(db, 'get').mockResolvedValueOnce(undefined);
  expect(await repo.probeStorage()).toBe(false);
  expect(await db.count('settings')).toBe(0);
});
it('crypto.randomUUIDが無い環境でもprobeできる', async () => {
  vi.stubGlobal('crypto', {});
  expect(await repo.probeStorage()).toBe(true);
  expect(await db.count('settings')).toBe(0);
});
it('probeのopen失敗・書き込み失敗を保存不可にする', async () => {
  expect(await createRepository(async () => { throw new Error('blocked'); }).probeStorage()).toBe(false);
  vi.spyOn(db, 'put').mockRejectedValueOnce(new Error('quota'));
  expect(await repo.probeStorage()).toBe(false);
});
it('書き込み失敗フラグはメモ・辞書・設定の更新を拒否し読み取りに影響しない', async () => {
  await repo.seed(); await repo.putMemos([memo('a')]);
  vi.stubGlobal('__QUADMEMO_FAIL_WRITES__', true);
  await expect(repo.putMemos([memo('b')])).rejects.toThrow();
  await expect(repo.removeMemo('a')).rejects.toThrow();
  await expect(repo.clearMemos()).rejects.toThrow();
  await expect(repo.saveDictionary((await repo.getDictionaries())[0])).rejects.toThrow();
  await expect(repo.saveSettings(defaultSettings)).rejects.toThrow();
  expect(await repo.getMemos()).toHaveLength(1);
});
it.each([true, false])('永続化要求の許可=%s', async (granted) => {
  const persist = vi.fn().mockResolvedValue(granted);
  vi.stubGlobal('navigator', { storage: { persist } });
  expect(await requestPersistence()).toBe(granted ? 'granted' : 'denied');
  expect(persist).toHaveBeenCalledTimes(1);
});
it('非対応・要求拒否を処理する', async () => {
  vi.stubGlobal('navigator', {}); expect(await requestPersistence()).toBe('unsupported');
  vi.stubGlobal('navigator', { storage: { persist: vi.fn().mockRejectedValue(new Error('denied')) } });
  expect(await requestPersistence()).toBe('denied');
});
it('全データの一括取得とID衝突をスキップする一括適用', async () => {
  await repo.seed(); await repo.putMemos([memo('a')]);
  const before = await repo.getAllData();
  const input = { ...before, settings: { ...defaultSettings, partialMatch: true },
    dictionaries: before.dictionaries.map((d) => ({ ...d, label: '新ラベル' })),
    memos: [{ ...memo('a'), rawText: '上書き禁止' }, memo('b'), memo('b')] };
  await repo.applyImport(input);
  expect((await repo.getAllData()).memos).toEqual([memo('a'), memo('b')]);
  expect(await repo.getSettings()).toMatchObject({ partialMatch: true });
  expect((await repo.getDictionaries())[0].label).toBe('それ以外');
  await repo.clearMemos();
  expect(await repo.getDictionaries()).toEqual(before.dictionaries);
  expect(await repo.getSettings()).toEqual(input.settings);
});
it('インポート検証失敗とトランザクション途中の失敗は全ストア無変更', async () => {
  await repo.seed(); await repo.putMemos([memo('a')]);
  const before = await repo.getAllData();
  await expect(repo.applyImport({ ...before, memos: [{ ...memo('b'), quadrant: 'q5' } as unknown as MemoItem] })).rejects.toThrow();
  expect(await repo.getAllData()).toEqual(before);
  // Fail the last store after dictionaries and settings have already been written.
  const add = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementationOnce(() => { throw new DOMException('quota', 'QuotaExceededError'); });
  await expect(repo.applyImport({ ...before, dictionaries: before.dictionaries.map((d) => ({ ...d, label: '失敗' })),
    settings: { ...defaultSettings, partialMatch: true }, memos: [memo('b')] })).rejects.toThrow();
  add.mockRestore();
  expect(await repo.getAllData()).toEqual(before);
});
it('辞書のみのインポートはメモと設定へ書き込まない', async () => {
  await repo.seed(); await repo.putMemos([memo('a')]);
  const before = await repo.getAllData();
  await repo.applyImport({ dictionaries: before.dictionaries.map((d) => ({ ...d, entries: [] })) });
  expect(await repo.getMemos()).toEqual(before.memos); expect(await repo.getSettings()).toEqual(before.settings);
});

it('既存メモが上限を超えていても辞書のみのインポートは成功する', async () => {
  await repo.seed();
  await repo.putMemos([{ ...memo('over'), rawText: 'a'.repeat(101), quadrant: 'q1' }]);
  const before = await repo.getAllData();
  await repo.applyImport({ dictionaries: before.dictionaries.map((d) => ({ ...d, entries: ['changed'] })) });
  expect((await repo.getDictionaries())[0].entries).toEqual(['changed']);
  expect(await repo.getMemos()).toEqual(before.memos);
});

it.each([0, 60])('インポートは既存%d文字との統合後に100文字を超えると全ストア無変更', async (length) => {
  await repo.seed();
  if (length) await repo.putMemos([{ ...memo('existing'), rawText: 'a'.repeat(length) }]);
  const before = await repo.getAllData();
  const incoming = { ...before, memos: [{ ...memo('incoming'), rawText: 'b'.repeat(length ? 40 : 101) }],
    settings: { ...defaultSettings, partialMatch: true }, dictionaries: before.dictionaries.map((dict) => ({ ...dict, entries: ['changed'] })) };
  await expect(repo.applyImport(incoming)).rejects.toThrow('100文字上限');
  expect(await repo.getAllData()).toEqual(before);
});
it('インポートはID衝突と入力内重複を数えず統合後ちょうど100文字を許可する', async () => {
  await repo.seed();
  const existing = { ...memo('existing'), rawText: 'a'.repeat(98) };
  await repo.putMemos([existing]);
  const incoming = { ...memo('new'), rawText: 'b' };
  await repo.applyImport({ ...(await repo.getAllData()), memos: [{ ...existing, rawText: 'x'.repeat(500) }, incoming, incoming] });
  expect(await repo.getMemos()).toEqual([existing, incoming]);
});
it('同時インポートもトランザクション内で最新の既存メモを数える', async () => {
  await repo.seed(); const before = await repo.getAllData();
  const results = await Promise.allSettled(['a', 'b'].map((id) => repo.applyImport({ ...before, memos: [{ ...memo(id), rawText: id.repeat(60) }] })));
  expect(results.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected']);
  expect(await repo.getMemos()).toHaveLength(1);
});
