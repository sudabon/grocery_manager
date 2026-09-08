import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAppStore, type MemoItem } from '../useAppStore';
import { defaultSettings, seedDictionaries } from '../../db/defaults';
import type { Repository } from '../../db/repository';

const chip = (id: string): MemoItem => ({ id, rawText: '牛乳', normText: '牛乳', quadrant: 'q4', matchedEntry: null, autoClassified: true, createdAt: 1, updatedAt: 1 });
let repo: Repository;
let store: ReturnType<typeof createAppStore>;
beforeEach(() => {
  repo = {
    getAllData: vi.fn(), applyImport: vi.fn(),
    getMemos: vi.fn().mockResolvedValue([]), putMemos: vi.fn().mockResolvedValue(undefined),
    removeMemo: vi.fn().mockResolvedValue(undefined), clearMemos: vi.fn().mockResolvedValue(undefined),
    getDictionaries: vi.fn().mockResolvedValue(seedDictionaries()), saveDictionary: vi.fn(),
    getSettings: vi.fn().mockResolvedValue(defaultSettings), saveSettings: vi.fn(),
    seed: vi.fn().mockResolvedValue(undefined), probeStorage: vi.fn().mockResolvedValue(true),
  };
  store = createAppStore(repo, async () => 'granted');
});
afterEach(() => vi.useRealTimers());
it('追加順を保ち同一単語も別チップにする', async () => {
  await store.getState().addChips([chip('a'), chip('b')]);
  expect(store.getState().chips.map((item) => item.id)).toEqual(['a', 'b']);
});
it('手動移動と編集で自動分類から除外し正規化と他チップを保持する', async () => {
  const actions = store.getState(); await actions.addChips([chip('a'), chip('b')]);
  await actions.moveChip('a', 'q1'); await actions.editChip('b', '  パン  ');
  expect(store.getState().chips[0]).toMatchObject({ quadrant: 'q1', autoClassified: false, rawText: '牛乳' });
  expect(store.getState().chips[1]).toMatchObject({ rawText: 'パン', normText: 'ぱん', autoClassified: false });
  expect(store.getState().chips[0].updatedAt).toBeGreaterThan(1);
});
it('削除と空白編集は対象だけを削除し全消去もできる', async () => {
  const actions = store.getState(); await actions.addChips([chip('a'), chip('b'), chip('c')]);
  await actions.editChip('a', '  '); await actions.removeChip('b');
  expect(store.getState().chips.map((item) => item.id)).toEqual(['c']);
  await actions.clearAll(); expect(store.getState().chips).toEqual([]);
  expect(repo.removeMemo).toHaveBeenCalledWith('a'); expect(repo.clearMemos).toHaveBeenCalledTimes(1);
});
it.each(['granted', 'denied', 'unsupported'] as const)('起動時ロードは一度だけ実行し設定・辞書キャッシュ・永続化結果%sを保持する', async (permission) => {
  const persist = vi.fn().mockResolvedValue(permission);
  store = createAppStore(repo, persist);
  vi.mocked(repo.getMemos).mockResolvedValue([chip('saved')]);
  vi.mocked(repo.getSettings).mockResolvedValue({ ...defaultSettings, partialMatch: true });
  await Promise.all([store.getState().initialize(), store.getState().initialize()]);
  expect(repo.seed).toHaveBeenCalledTimes(1); expect(persist).toHaveBeenCalledTimes(1);
  expect(store.getState()).toMatchObject({ ready: true, dataLoaded: true, persistencePermission: permission, chips: [{ id: 'saved' }], settings: { partialMatch: true } });
  expect(store.getState().normalizedDicts.exact.has('れびゅー')).toBe(true);
});
it('保存不可でも読み取りに成功すれば既存メモを表示する', async () => {
  vi.mocked(repo.probeStorage).mockResolvedValue(false);
  vi.mocked(repo.getMemos).mockResolvedValue([chip('saved')]);
  await store.getState().initialize();
  // 書き込み不可でも読み取れているので dataLoaded は true。エクスポートは実データを出力できる。
  expect(store.getState()).toMatchObject({ ready: true, storageAvailable: false, dataLoaded: true, chips: [{ id: 'saved' }] });
  expect(repo.seed).not.toHaveBeenCalled();
});
it('seedに失敗しても読み取れたメモは捨てない', async () => {
  vi.mocked(repo.seed).mockRejectedValue(new Error('quota'));
  vi.mocked(repo.getMemos).mockResolvedValue([chip('saved')]);
  await store.getState().initialize();
  expect(store.getState()).toMatchObject({ ready: true, storageAvailable: false, dataLoaded: true, chips: [{ id: 'saved' }] });
});
it('保存不可でも既存データを読めれば表示し読めなければ既定辞書でメモを続ける', async () => {
  vi.mocked(repo.probeStorage).mockResolvedValue(false);
  vi.mocked(repo.getMemos).mockRejectedValue(new Error('blocked'));
  await store.getState().initialize();
  expect(store.getState()).toMatchObject({ ready: true, storageAvailable: false, dataLoaded: false });
  expect(store.getState().normalizedDicts.exact.has('牛乳')).toBe(true);
  expect(repo.seed).not.toHaveBeenCalled();
});
for (const operation of ['add', 'move', 'edit', 'remove', 'clear'] as const) {
  it.each([0, 1, 2])(`${operation}: 保存失敗%s回で成功・再試行・警告を確認`, async (failures) => {
    store.setState({ chips: operation === 'add' ? [] : [chip('a')] });
    const write = vi.mocked(operation === 'remove' ? repo.removeMemo : operation === 'clear' ? repo.clearMemos : repo.putMemos);
    for (let i = 0; i < failures; i++) write.mockRejectedValueOnce(new Error('quota'));
    const actions = store.getState();
    const pending = operation === 'add' ? actions.addChips([chip('a')]) : operation === 'move' ? actions.moveChip('a', 'q1') : operation === 'edit' ? actions.editChip('a', 'パン') : operation === 'remove' ? actions.removeChip('a') : actions.clearAll();
    expect(store.getState().pendingWrites).toBe(1);
    if (operation === 'move') expect(store.getState().chips[0].quadrant).toBe('q1');
    if (operation === 'clear') expect(store.getState().chips).toEqual([chip('a')]);
    const result = await pending;
    expect(write).toHaveBeenCalledTimes(operation === 'clear' || failures === 0 ? 1 : 2);
    expect(store.getState().saveErrors).toHaveLength((operation === 'clear' ? failures > 0 : failures === 2) ? 1 : 0);
    expect(store.getState().pendingWrites).toBe(0);
    if (operation === 'clear') {
      expect(result).toBe(failures === 0);
      expect(store.getState().chips).toEqual(failures === 0 ? [] : [chip('a')]);
    }
    if (!['remove', 'clear'].includes(operation)) expect(!!store.getState().chips[0].unsaved).toBe(failures === 2);
    for (const [items] of vi.mocked(repo.putMemos).mock.calls) for (const item of items) expect(item).not.toHaveProperty('unsaved');
  });
}
it('再試行を含め書き込み順を守り追加直後の編集・削除を後戻りさせない', async () => {
  vi.mocked(repo.putMemos).mockRejectedValueOnce(new Error('retry'));
  const actions = store.getState();
  await Promise.all([actions.addChips([chip('a')]), actions.editChip('a', 'new'), actions.removeChip('a')]);
  expect(vi.mocked(repo.putMemos).mock.calls.map(([items]) => items[0].rawText)).toEqual(['牛乳', '牛乳', 'new']);
  expect(repo.removeMemo).toHaveBeenCalledWith('a'); expect(store.getState().chips).toEqual([]);
});
it('重複OFFは正規化して同象限と一括入力内で抑止し一時強調する', async () => {
  vi.useFakeTimers(); store.setState({ settings: { ...defaultSettings, allowDuplicates: false } });
  await store.getState().addChips([{ ...chip('a'), rawText: 'パン' }, { ...chip('b'), rawText: 'ﾊﾟﾝ' }, { ...chip('c'), rawText: 'ぱん', quadrant: 'q1' }]);
  expect(store.getState().chips.map((item) => item.id)).toEqual(['a', 'c']);
  expect(store.getState().chips[0].highlighted).toBe(true);
  expect(vi.mocked(repo.putMemos).mock.calls[0][0]).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(1800); expect(store.getState().chips[0].highlighted).toBe(false);
});
it('辞書保存は成功後だけキャッシュを更新し既存メモは変更しない', async () => {
  await store.getState().initialize(); await store.getState().addChips([chip('a')]);
  const before = store.getState().chips;
  expect(await store.getState().saveDictionary('q1', '企画', 'パン\nぱん')).toBe(true);
  expect(store.getState().dictionaries[0]).toMatchObject({ label: '企画', entries: ['パン'] });
  expect(store.getState().normalizedDicts.exact.get('ぱん')?.[0].quadrant).toBe('q1');
  expect(store.getState().chips).toEqual(before);
  expect(repo.putMemos).toHaveBeenCalledTimes(1);
  vi.mocked(repo.saveDictionary).mockRejectedValueOnce(new Error('quota'));
  expect(await store.getState().saveDictionary('q1', '失敗', '失敗')).toBe(false);
  expect(store.getState().dictionaries[0].label).toBe('企画'); expect(store.getState().saveErrors).toHaveLength(1);
});
it('設定の連続保存で他の設定を失わず失敗時は保存済みの値を維持する', async () => {
  await Promise.all([store.getState().updateSettings({ partialMatch: true }), store.getState().updateSettings({ autoCommitMs: 9000 })]);
  expect(store.getState().settings).toMatchObject({ partialMatch: true, autoCommitMs: 5000 });
  vi.mocked(repo.saveSettings).mockRejectedValueOnce(new Error('quota'));
  expect(await store.getState().updateSettings({ partialMatch: false })).toBe(false);
  expect(store.getState().settings.partialMatch).toBe(true);
});
it('インポート成功で辞書キャッシュと設定を置き換え既存IDを除いてメモを作成日時順にマージする', async () => {
  const existing = { ...chip('existing'), createdAt: 2 };
  vi.mocked(repo.getMemos).mockResolvedValue([existing]);
  await store.getState().initialize();
  const dictionaries = seedDictionaries(2).map((d) => ({ ...d, entries: d.quadrant === 'q1' ? ['orange'] : [] }));
  const settings = { ...defaultSettings, partialMatch: true, autoCommitMs: 700, allowDuplicates: false, showDictationHint: false };
  const earlier = chip('earlier');
  const later = { ...chip('later'), createdAt: 3 };
  const memos = [later, { ...existing, rawText: '上書き禁止', normText: '上書き禁止' }, earlier];
  // repo より緩い（衝突メモを除いていない）戻り値を返し、ストア側の skipExistingMemos を実際に通す。
  vi.mocked(repo.applyImport).mockResolvedValue({ dictionaries, memos, settings });
  expect(await store.getState().importData({ dictionaries, memos, settings })).toBe(true);
  expect(vi.mocked(repo.applyImport)).toHaveBeenCalledWith({ dictionaries, memos, settings });
  expect(store.getState().normalizedDicts.exact.get('orange')).toEqual([{ quadrant: 'q1', raw: 'orange', normalized: 'orange' }]);
  expect(store.getState().settings).toEqual(settings);
  expect(store.getState().chips).toEqual([earlier, existing, later]);
});
it.each([
  ['clearAll', 'clearMemos', () => store.getState().clearAll(), 'メモを削除できませんでした。メモは削除されていません。'],
  ['importData', 'applyImport', () => store.getState().importData({ dictionaries: seedDictionaries(1) }), 'インポートできませんでした。データは変更されていません。'],
  ['saveDictionary', 'saveDictionary', () => store.getState().saveDictionary('q1', '企画', 'パン'), '保存できませんでした。変更は端末に保存されていません。'],
  ['updateSettings', 'saveSettings', () => store.getState().updateSettings({ partialMatch: true }), '保存できませんでした。変更は端末に保存されていません。'],
] as const)('%s の失敗は操作に対応した文言で通知する', async (_name, method, run, text) => {
  vi.mocked(repo[method]).mockRejectedValueOnce(new Error('quota'));
  expect(await run()).toBe(false);
  expect(store.getState().saveErrors).toEqual([{ text }]);
});
it('インポート失敗でメモ・辞書・設定・キャッシュを変更しない', async () => {
  await store.getState().initialize();
  const before = store.getState();
  vi.mocked(repo.applyImport).mockRejectedValueOnce(new Error('quota'));
  expect(await store.getState().importData({ dictionaries: seedDictionaries(2), memos: [chip('a')], settings: { ...defaultSettings, partialMatch: true } })).toBe(false);
  expect(store.getState()).toMatchObject({ chips: before.chips, dictionaries: before.dictionaries, settings: before.settings, normalizedDicts: before.normalizedDicts });
  expect(store.getState().saveErrors).toHaveLength(1);
});
