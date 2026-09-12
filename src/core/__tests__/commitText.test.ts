import { beforeEach, expect, it, vi } from 'vitest';
import { commitText } from '../commitText';
import { buildNormalizedDicts } from '../classify';
import { todayBoardDate } from '../boardDate';
import { useAppStore } from '../../store/useAppStore';
import { defaultSettings } from '../../db/defaults';
// 表示中のボードが当日でないと addChips が書き込みを断る（useAppStore の D4 判定）。
// 初期状態の viewingBoardDate はモジュール読み込み時の日付なので、時刻を固定しないと
// JST 0:00 をまたいだ実行でチップが 1 件も追加されなくなる。
const BOARD = '2026-09-09';
const NOW = Date.parse(`${BOARD}T12:00:00+09:00`);
beforeEach(async () => {
  // restoreMocks: true（vite.config.ts）が各テスト後に元へ戻す。
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  // clearAll() は writeQueue に連なるので、await すると前テストの飛行中の書き込みが settle する。
  // これを待たずに pendingWrites を 0 にすると、後から届く finally が値を負へ持っていく。
  await useAppStore.getState().clearAll();
  // フィールドを列挙するとストアに項目が増えたとき静かに漏れるため、初期状態そのものへ戻す。
  useAppStore.setState(useAppStore.getInitialState(), true);
  useAppStore.setState({ normalizedDicts: buildNormalizedDicts([]), settings: { ...defaultSettings }, viewingBoardDate: BOARD });
});
it('トークンをQ4へ追加し50件超過を通知する', async () => {
  const notify = vi.fn(); await commitText(Array(51).fill('卵').join(' '), notify);
  const chips = useAppStore.getState().chips;
  expect(chips).toHaveLength(50);
  expect(new Set(chips.map((chip) => chip.id)).size).toBe(50);
  expect(chips.every((chip) => chip.quadrant === 'q4' && chip.matchedEntry === null)).toBe(true);
  expect(notify).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('一部のみ登録しました'));
});
it('0件は追加も通知もせず50件ちょうどは通知しない', async () => {
  const notify = vi.fn(); await commitText('★ ！？', notify);
  expect(useAppStore.getState().chips).toHaveLength(0);
  await commitText(Array(50).fill('卵').join(' '), notify);
  expect(useAppStore.getState().chips).toHaveLength(50);
  expect(notify).not.toHaveBeenCalled();
});
it('同一ミリ秒の50件はULIDが単調増加する', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(2000000000000);
  // 固定した時刻の日付を表示中のボードにする（当日以外へは書き込めない: useAppStore の D4 判定）。
  useAppStore.setState({ viewingBoardDate: todayBoardDate() });
  await commitText(Array(50).fill('語').join(' '), vi.fn());
  const ids = useAppStore.getState().chips.map((chip) => chip.id);
  expect(ids).toHaveLength(50);
  expect(ids).toEqual([...ids].sort());
  expect(new Set(ids).size).toBe(50);
  for (const id of ids) expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
});
it('ストアの辞書と部分一致設定を使って分類する', async () => {
  useAppStore.setState({ normalizedDicts: buildNormalizedDicts([{ quadrant: 'q1', entries: ['牛乳'] }]) });
  await commitText('牛乳 みかん', vi.fn());
  expect(useAppStore.getState().chips).toMatchObject([
    { rawText: '牛乳', quadrant: 'q1', matchedEntry: '牛乳' },
    { rawText: 'みかん', quadrant: 'q4', matchedEntry: null },
  ]);
});
it.each([
  [false, 'q4', null],
  [true, 'q1', 'apple'],
])('部分一致=%s の設定を尊重して包含だけの語の配置を決める', async (partialMatch, quadrant, matchedEntry) => {
  useAppStore.setState({
    normalizedDicts: buildNormalizedDicts([{ quadrant: 'q1', entries: ['apple'] }]),
    settings: { ...defaultSettings, partialMatch },
  });
  await commitText('apples', vi.fn());
  expect(useAppStore.getState().chips).toMatchObject([{ rawText: 'apples', quadrant, matchedEntry }]);
});

it('先頭50件を先に選び、容量不足でも51件目を繰り上げない', async () => {
  useAppStore.setState({ normalizedDicts: buildNormalizedDicts([{ quadrant: 'q1', entries: ['牛乳'] }, { quadrant: 'q2', entries: ['卵'] }]) });
  const notify = vi.fn();
  await commitText([...Array(50).fill('牛乳'), '卵'].join(' '), notify);
  expect(useAppStore.getState().chips).toHaveLength(33);
  expect(useAppStore.getState().chips.every(({ quadrant }) => quadrant === 'q1')).toBe(true);
  expect(notify).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('一部のみ登録'));
});
it('1件も容量に収まらなければ上限の通知を出す', async () => {
  const notify = vi.fn();
  await commitText('a'.repeat(100), notify);
  await commitText('b', notify);
  expect(useAppStore.getState().chips).toHaveLength(1);
  expect(notify).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('100文字上限'));
});
it('51語すべてが容量に収まらなければ切り捨てと上限の両方を通知する', async () => {
  const notify = vi.fn();
  await commitText('a'.repeat(100), notify);
  notify.mockClear();
  await commitText(Array(51).fill('b').join(' '), notify);
  expect(notify).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('先頭50件のみ処理しました'));
  expect(notify.mock.calls[0][0]).toContain('100文字上限');
});
it('重複OFFで51語すべてが既存重複でも切り捨てを通知する', async () => {
  useAppStore.setState({ settings: { ...defaultSettings, allowDuplicates: false } });
  const setup = vi.fn();
  await commitText('ねこ', setup);
  expect(setup).not.toHaveBeenCalled();
  const notify = vi.fn();
  await commitText(Array(51).fill('ねこ').join(' '), notify);
  expect(useAppStore.getState().chips).toHaveLength(1);
  expect(notify).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('先頭50件のみ処理しました'));
});

it.each([50, 51])('結合後の%s語に50件上限を適用する', async (count) => {
  useAppStore.setState({ normalizedDicts: buildNormalizedDicts([
    { quadrant: 'q3', entries: ['鶏むね肉'] }, { quadrant: 'q2', entries: ['牛乳'] },
  ]) });
  const notify = vi.fn();
  const words = [...Array(10).fill('鶏むね肉'), ...Array(40).fill('卵')];
  if (count === 51) words.push('牛乳');
  await commitText(words.join(' '), notify);
  const chips = useAppStore.getState().chips;
  expect(chips).toHaveLength(50);
  expect(chips.slice(0, 10).map(({ rawText }) => rawText)).toEqual(Array(10).fill('鶏むね肉'));
  expect(chips.slice(10).map(({ rawText }) => rawText)).toEqual(Array(40).fill('卵'));
  if (count === 50) expect(notify).not.toHaveBeenCalled();
  else expect(notify).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('一部のみ登録'));
});

it('重複OFFでは結合後の正規化文字列で同一コミット内と既存チップの重複を抑止する', async () => {
  useAppStore.setState({
    normalizedDicts: buildNormalizedDicts([{ quadrant: 'q3', entries: ['鶏むね肉'] }]),
    settings: { ...defaultSettings, allowDuplicates: false },
  });
  const notify = vi.fn();
  await commitText('鶏ムネ肉 鶏むね肉', notify);
  expect(useAppStore.getState().chips).toMatchObject([
    { rawText: '鶏ムネ肉', normText: '鶏むね肉', quadrant: 'q3', matchedEntry: '鶏むね肉' },
  ]);
  await commitText('鶏ﾑﾈ肉', notify);
  expect(useAppStore.getState().chips).toHaveLength(1);
  expect(notify).not.toHaveBeenCalled();
});
