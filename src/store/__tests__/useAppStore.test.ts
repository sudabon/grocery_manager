import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAppStore, type MemoItem } from '../useAppStore';
import { todayBoardDate } from '../../core/boardDate';
import { defaultSettings, seedDictionaries } from '../../db/defaults';
import type { Repository } from '../../db/repository';

const BOARD = '2026-09-09';
const NOW = Date.parse(`${BOARD}T12:00:00+09:00`);
const chip = (id: string): MemoItem => ({ id, boardDate: BOARD, rawText: '牛乳', normText: '牛乳', quadrant: 'q4', matchedEntry: null, autoClassified: true, createdAt: 1, updatedAt: 1 });
let repo: Repository;
let store: ReturnType<typeof createAppStore>;
beforeEach(() => {
  repo = {
    getAllData: vi.fn(), applyImport: vi.fn(),
    getMemos: vi.fn().mockResolvedValue([]), putMemos: vi.fn().mockResolvedValue(undefined),
    getBoardDates: vi.fn().mockResolvedValue([]),
    removeMemo: vi.fn().mockResolvedValue(undefined), clearMemos: vi.fn().mockResolvedValue(undefined),
    getDictionaries: vi.fn().mockResolvedValue(seedDictionaries()), saveDictionary: vi.fn(),
    getSettings: vi.fn().mockResolvedValue(defaultSettings), saveSettings: vi.fn(),
    seed: vi.fn().mockResolvedValue(undefined), probeStorage: vi.fn().mockResolvedValue(true),
  };
  store = createAppStore(repo, async () => 'granted');
});
afterEach(() => vi.useRealTimers());
it('案内の記録は保存し、失敗しても通知しない', async () => {
  await store.getState().dismissInstallHint();
  expect(repo.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ installHintDismissed: true }));
  expect(store.getState().settings.installHintDismissed).toBe(true);
  expect(store.getState().saveErrors).toEqual([]);
  store = createAppStore(repo, async () => 'granted');
  const error = new Error('quota');
  vi.mocked(repo.saveSettings).mockRejectedValueOnce(error);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await store.getState().dismissInstallHint();
    expect(store.getState().settings.installHintDismissed).not.toBe(true);
    expect(store.getState().saveErrors).toEqual([]);
    expect(store.getState().pendingWrites).toBe(0);
    expect(warn).toHaveBeenCalledExactlyOnceWith('[settings] install hint dismissal not persisted', error);
  } finally { warn.mockRestore(); }
});
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
  vi.mocked(repo.getDictionaries).mockResolvedValue(seedDictionaries().map((d) => d.quadrant === 'q1' ? { ...d, entries: ['レビュー'] } : d));
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
  await store.getState().initialize();
  store.setState({ dictionaries: store.getState().dictionaries.map((d) => ({ ...d, label: '企画' })) });
  await store.getState().addChips([chip('a')]);
  const before = store.getState().chips;
  expect(await store.getState().saveDictionary('q1', 'パン\nぱん')).toBe(true);
  expect(store.getState().dictionaries[0]).toMatchObject({ label: 'それ以外', entries: ['パン'] });
  expect(store.getState().normalizedDicts.exact.get('ぱん')?.[0].quadrant).toBe('q1');
  expect(store.getState().chips).toEqual(before);
  expect(repo.putMemos).toHaveBeenCalledTimes(1);
  const savedDictionary = store.getState().dictionaries[0];
  vi.mocked(repo.saveDictionary).mockRejectedValueOnce(new Error('quota'));
  expect(await store.getState().saveDictionary('q1', '失敗')).toBe(false);
  expect(store.getState().dictionaries[0]).toEqual(savedDictionary); expect(store.getState().saveErrors).toHaveLength(1);
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
  ['saveDictionary', 'saveDictionary', () => store.getState().saveDictionary('q1', 'パン'), '保存できませんでした。変更は端末に保存されていません。'],
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

it('追加は改行込み100文字までを登録し、拒否後も他の象限と短いチップを処理する', async () => {
  store.setState({ chips: [{ ...chip('existing'), rawText: 'a'.repeat(96) }] });
  const result = await store.getState().addChips([
    { ...chip('long'), rawText: 'long' }, { ...chip('fits'), rawText: 'abc' },
    { ...chip('full'), rawText: 'x' }, { ...chip('other'), quadrant: 'q1' },
  ]);
  expect(result).toEqual({ added: 2, rejected: 2 });
  expect(store.getState().chips.map(({ id }) => id)).toEqual(['existing', 'fits', 'other']);
  expect(vi.mocked(repo.putMemos).mock.calls[0][0].map(({ id }) => id)).toEqual(['fits', 'other']);
});
it('連続追加は保存待ちのチップも数え、上限超過を一切書き込まない', async () => {
  const first = store.getState().addChips([{ ...chip('a'), rawText: 'a'.repeat(100) }]);
  const second = store.getState().addChips([chip('b')]);
  expect(await second).toEqual({ added: 0, rejected: 1 });
  await first;
  expect(repo.putMemos).toHaveBeenCalledTimes(1);
  expect(store.getState().chips).toHaveLength(1);
});
it('上限に達していても重複OFFの強調は容量拒否として数えない', async () => {
  const text = 'a'.repeat(100);
  store.setState({ chips: [{ ...chip('a'), rawText: text, normText: text }], settings: { ...defaultSettings, allowDuplicates: false } });
  expect(await store.getState().addChips([{ ...chip('b'), rawText: text }])).toEqual({ added: 0, rejected: 0 });
  expect(store.getState().chips[0].highlighted).toBe(true);
  expect(repo.putMemos).not.toHaveBeenCalled();
});
it('編集は元の本文を置き換えて数え、超過時は本文・分類・時刻も変えない', async () => {
  store.setState({ chips: [{ ...chip('a'), rawText: 'a'.repeat(97) }, { ...chip('b'), rawText: 'b' }] });
  expect(await store.getState().editChip('b', ' xy ')).toEqual({ ok: true });
  const before = store.getState().chips;
  expect(before[1].rawText).toBe('xy');
  expect(await store.getState().editChip('b', 'xyz')).toEqual({ ok: false, reason: 'quadrant-limit' });
  expect(store.getState().chips).toEqual(before);
  expect(repo.putMemos).toHaveBeenCalledTimes(1);
});
it('移動先は改行込み100文字まで許可し、超過時は元の象限に留める', async () => {
  store.setState({ chips: [{ ...chip('target'), quadrant: 'q1', rawText: 'a'.repeat(98) },
    { ...chip('a'), rawText: 'b' }, { ...chip('b'), rawText: 'c' }] });
  expect(await store.getState().moveChip('a', 'q1')).toEqual({ ok: true });
  const before = store.getState().chips;
  expect(await store.getState().moveChip('b', 'q1')).toEqual({ ok: false, reason: 'quadrant-limit' });
  expect(store.getState().chips).toEqual(before);
  expect(repo.putMemos).toHaveBeenCalledTimes(1);
});
it('旧データの超過は自動切り詰めせず、短くする編集と空白編集による削除を許可する', async () => {
  vi.mocked(repo.getMemos).mockResolvedValue([{ ...chip('old'), rawText: 'a'.repeat(200) }]);
  await store.getState().initialize();
  expect(store.getState().chips[0].rawText).toHaveLength(200);
  expect(await store.getState().editChip('old', 'b'.repeat(200))).toEqual({ ok: true });
  expect(store.getState().chips[0].rawText).toBe('b'.repeat(200));
  expect(await store.getState().editChip('old', 'a'.repeat(250))).toEqual({ ok: false, reason: 'quadrant-limit' });
  expect(await store.getState().editChip('old', 'a'.repeat(150))).toEqual({ ok: true });
  expect(await store.getState().editChip('old', 'a'.repeat(100))).toEqual({ ok: true });
  expect(await store.getState().editChip('old', '   ')).toEqual({ ok: true });
  expect(store.getState().chips).toEqual([]);
});
it('インポートは既存の未保存メモも合算し、超過なら辞書・設定・メモを無変更にする', async () => {
  store.setState({ chips: [{ ...chip('a'), rawText: 'a'.repeat(98), unsaved: true }] });
  const before = store.getState();
  expect(await store.getState().importData({ dictionaries: seedDictionaries(), memos: [chip('new')], settings: defaultSettings })).toBe(false);
  expect(repo.applyImport).not.toHaveBeenCalled();
  expect(store.getState()).toMatchObject({ chips: before.chips, dictionaries: before.dictionaries, settings: before.settings });
  expect(store.getState().saveErrors[0].text).toContain('100文字上限');
});
it.each(['add', 'edit', 'move', 'remove'] as const)('インポート中の%sは完了後の容量と最新メモを使う', async (operation) => {
  const original = { ...chip('original'), rawText: 'a', quadrant: 'q1' as const };
  store.setState({ chips: [original] });
  const imported = { ...chip('imported'), rawText: 'b'.repeat(operation === 'edit' ? 98 : 100), quadrant: operation === 'edit' ? 'q1' as const : 'q4' as const };
  let finish!: (value: Awaited<ReturnType<Repository['applyImport']>>) => void;
  vi.mocked(repo.applyImport).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const importing = store.getState().importData({ dictionaries: seedDictionaries(), memos: [imported], settings: defaultSettings });
  await Promise.resolve();
  const editing = operation === 'add' ? store.getState().addChips([chip('new')])
    : operation === 'edit' ? store.getState().editChip('original', 'aa')
    : operation === 'move' ? store.getState().moveChip('original', 'q4')
    : store.getState().removeChip('imported');
  expect(repo.putMemos).not.toHaveBeenCalled(); expect(repo.removeMemo).not.toHaveBeenCalled();
  finish({ dictionaries: seedDictionaries(), memos: [imported], settings: defaultSettings });
  await importing;
  const result = await editing;
  if (operation === 'add') expect(result).toEqual({ added: 0, rejected: 1 });
  else if (operation !== 'remove') expect(result).toEqual({ ok: false, reason: 'quadrant-limit' });
  expect(store.getState().chips).toEqual(operation === 'remove' ? [original] : [imported, original]);
});

const PAST = '2026-09-08';
const pastChip = (id: string): MemoItem => ({ ...chip(id), boardDate: PAST });
/** 固定時刻の当日ボードから始め、過去のボードへ切り替えたストアを返す。 */
async function viewingPastBoard() {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  store = createAppStore(repo, async () => 'granted');
  vi.mocked(repo.getMemos).mockResolvedValue([chip('today')]);
  await store.getState().initialize();
  vi.mocked(repo.getMemos).mockResolvedValue([pastChip('past')]);
  await store.getState().viewBoard(PAST);
  vi.mocked(repo.putMemos).mockClear(); vi.mocked(repo.removeMemo).mockClear();
  return store.getState();
}
it('起動時は当日のボードだけを読み、日付を状態に持つ', async () => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  store = createAppStore(repo, async () => 'granted');
  vi.mocked(repo.getMemos).mockResolvedValue([chip('a')]);
  await store.getState().initialize();
  expect(repo.getMemos).toHaveBeenCalledWith({ boardDate: BOARD });
  expect(store.getState()).toMatchObject({ viewingBoardDate: BOARD, viewingIsToday: true });
  expect(store.getState().chips.map((item) => item.id)).toEqual(['a']);
});
it('ボードを切り替えるとその日付のチップだけを読み、当日でないことを保持する', async () => {
  const actions = await viewingPastBoard();
  expect(repo.getMemos).toHaveBeenLastCalledWith({ boardDate: PAST });
  expect(store.getState()).toMatchObject({ viewingBoardDate: PAST, viewingIsToday: false });
  expect(store.getState().chips.map((item) => item.id)).toEqual(['past']);
  // 当日へ戻すと当日のチップを読み直す。
  vi.mocked(repo.getMemos).mockResolvedValue([chip('today')]);
  await actions.viewBoard(BOARD);
  expect(store.getState()).toMatchObject({ viewingBoardDate: BOARD, viewingIsToday: true });
  expect(store.getState().chips.map((item) => item.id)).toEqual(['today']);
});
it('同じ日付への切り替えは読み直さない', async () => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  store = createAppStore(repo, async () => 'granted');
  await store.getState().initialize();
  vi.mocked(repo.getMemos).mockClear();
  await store.getState().viewBoard(BOARD);
  expect(repo.getMemos).not.toHaveBeenCalled();
});
it('過去のボード表示中は追加・移動・編集・削除のどれも状態を変えない', async () => {
  const actions = await viewingPastBoard();
  const before = store.getState().chips;
  expect(await actions.addChips([chip('new')])).toEqual({ added: 0, rejected: 0, readOnly: true });
  expect(await actions.moveChip('past', 'q1')).toEqual({ ok: false, reason: 'read-only' });
  expect(await actions.editChip('past', '変更後')).toEqual({ ok: false, reason: 'read-only' });
  await actions.removeChip('past');
  expect(store.getState().chips).toBe(before);
  expect(repo.putMemos).not.toHaveBeenCalled();
  expect(repo.removeMemo).not.toHaveBeenCalled();
  // 空文字への編集は削除へ回るが、その削除も拒否される。
  expect(await actions.editChip('past', '   ')).toEqual({ ok: false, reason: 'read-only' });
  expect(store.getState().chips).toBe(before);
});
it('書き込みの瞬間に日付が変わっていれば表示中のボードでも拒否する', async () => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  store = createAppStore(repo, async () => 'granted');
  vi.mocked(repo.getMemos).mockResolvedValue([chip('a')]);
  await store.getState().initialize();
  const actions = store.getState();
  vi.mocked(repo.putMemos).mockClear();
  // 表示したまま日付が変わる。
  vi.setSystemTime(NOW + 24 * 60 * 60 * 1000);
  expect(todayBoardDate()).not.toBe(BOARD);
  const before = store.getState().chips;
  expect(await actions.addChips([chip('new')])).toEqual({ added: 0, rejected: 0, readOnly: true });
  expect(await actions.moveChip('a', 'q1')).toEqual({ ok: false, reason: 'read-only' });
  expect(await actions.editChip('a', '変更後')).toEqual({ ok: false, reason: 'read-only' });
  await actions.removeChip('a');
  expect(store.getState().chips).toBe(before);
  expect(repo.putMemos).not.toHaveBeenCalled();
  expect(repo.removeMemo).not.toHaveBeenCalled();
  // 表示中のボードは切り替えず、見え方も選んだ時点のまま保つ。
  expect(store.getState()).toMatchObject({ viewingBoardDate: BOARD, viewingIsToday: true });
});
it('追加したチップは表示中のボードの日付に属する', async () => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  store = createAppStore(repo, async () => 'granted');
  await store.getState().initialize();
  await store.getState().addChips([{ ...chip('a'), boardDate: '1970-01-01' } as MemoItem]);
  expect(store.getState().chips[0].boardDate).toBe(BOARD);
  expect(vi.mocked(repo.putMemos).mock.calls[0][0][0]).toMatchObject({ id: 'a', boardDate: BOARD });
});
it('日付の一覧は保存層に委譲し、失敗時は空で保存不可にする', async () => {
  vi.mocked(repo.getBoardDates).mockResolvedValue([BOARD, PAST]);
  expect(await store.getState().listBoardDates()).toEqual([BOARD, PAST]);
  vi.mocked(repo.getBoardDates).mockRejectedValue(new Error('blocked'));
  expect(await store.getState().listBoardDates()).toEqual([]);
  expect(store.getState().storageAvailable).toBe(false);
});
it('インポートしたメモのうち表示中のボードの日付だけを画面に載せる', async () => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  store = createAppStore(repo, async () => 'granted');
  vi.mocked(repo.getMemos).mockResolvedValue([]);
  await store.getState().initialize();
  const incoming = { dictionaries: seedDictionaries(), memos: [chip('today'), pastChip('past')], settings: { ...defaultSettings } };
  vi.mocked(repo.applyImport).mockResolvedValue({ ...incoming, settings: { ...defaultSettings } });
  expect(await store.getState().importData(incoming)).toBe(true);
  expect(store.getState().chips.map((item) => item.id)).toEqual(['today']);
});
