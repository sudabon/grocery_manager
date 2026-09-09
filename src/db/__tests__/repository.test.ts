import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openQuadmemoDb, type MemoItem } from '../schema';
import { createRepository, requestPersistence } from '../repository';
import { defaultSettings } from '../defaults';

let db: Awaited<ReturnType<typeof openQuadmemoDb>>;
let repo: ReturnType<typeof createRepository>;
it('インポートで端末のインストール案内の記録をリセットしない', async () => {
  await repo.seed();
  await repo.saveSettings({ ...defaultSettings, installHintDismissed: true });
  const data = await repo.getAllData();
  const imported = await repo.applyImport({ ...data, settings: { ...defaultSettings, partialMatch: true } });
  expect(imported.settings).toMatchObject({ partialMatch: true, installHintDismissed: true });
  expect(await repo.getSettings()).toEqual(imported.settings);
});
const memo = (id: string, createdAt = 1): MemoItem => ({ id, rawText: '牛乳', normText: '牛乳', quadrant: 'q3', matchedEntry: '牛乳', autoClassified: true, createdAt, updatedAt: createdAt });
beforeEach(async () => { db = await openQuadmemoDb(); repo = createRepository(async () => db); });
afterEach(async () => { db.close(); await deleteDB('quadmemo'); vi.unstubAllGlobals(); });
it('v1スキーマとメモCRUD・作成順・象限別取得', async () => {
  expect(db.version).toBe(1);
  expect([...db.objectStoreNames]).toEqual(['dictionaries', 'memos', 'settings']);
  const store = db.transaction('memos').store;
  expect(store.keyPath).toBe('id');
  expect([...store.indexNames]).toEqual(['createdAt', 'quadrant']);
  await repo.putMemos([memo('b', 2), memo('c'), memo('a')]);
  expect((await repo.getMemos()).map((item) => item.id)).toEqual(['a', 'c', 'b']);
  await repo.putMemos([{ ...memo('a'), quadrant: 'q1', rawText: '編集', normText: '編集' }]);
  expect(await repo.getMemos('q1')).toMatchObject([{ id: 'a', rawText: '編集' }]);
  expect(await repo.getMemos('q3')).toHaveLength(2);
  await repo.removeMemo('a'); expect(await repo.getMemos()).toHaveLength(2);
  await repo.clearMemos(); expect(await repo.getMemos()).toEqual([]);
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
  expect(dictionaries.map((dict) => dict.label)).toEqual(['仕事', '家庭', '買い物', 'その他']);
  expect(dictionaries[0].entries).toContain('会議');
  expect(await repo.getSettings()).toEqual(defaultSettings);
  const custom = { ...dictionaries[0], label: '独自', entries: ['custom'] };
  await repo.saveDictionary(custom);
  await repo.saveSettings({ ...defaultSettings, partialMatch: true, allowDuplicates: false });
  await repo.seed();
  expect((await repo.getDictionaries())[0]).toEqual(custom);
  expect(await repo.getSettings()).toMatchObject({ partialMatch: true, allowDuplicates: false });
  await db.clear('settings'); await repo.seed();
  expect((await repo.getDictionaries())[0]).toEqual(custom);
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
  expect((await repo.getDictionaries())[0].label).toBe('新ラベル');
  await repo.clearMemos();
  expect(await repo.getDictionaries()).toEqual(input.dictionaries);
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
