import { beforeEach, expect, it, vi } from 'vitest';
import { commitText } from '../commitText';
import { buildNormalizedDicts } from '../classify';
import { useAppStore } from '../../store/useAppStore';
import { defaultSettings } from '../../db/defaults';
beforeEach(() => { useAppStore.setState({ normalizedDicts: buildNormalizedDicts([]), settings: { ...defaultSettings } }); return useAppStore.getState().clearAll(); });
it('トークンをQ4へ追加し50件超過を通知する', () => {
  const notify = vi.fn(); commitText(Array(51).fill('牛乳').join(' '), notify);
  const chips = useAppStore.getState().chips;
  expect(chips).toHaveLength(50);
  expect(new Set(chips.map((chip) => chip.id)).size).toBe(50);
  expect(chips.every((chip) => chip.quadrant === 'q4' && chip.matchedEntry === null)).toBe(true);
  expect(notify).toHaveBeenCalledTimes(1);
});
it('0件は追加も通知もせず50件ちょうどは通知しない', () => {
  const notify = vi.fn(); commitText('★ ！？', notify);
  expect(useAppStore.getState().chips).toHaveLength(0);
  commitText(Array(50).fill('卵').join(' '), notify);
  expect(useAppStore.getState().chips).toHaveLength(50);
  expect(notify).not.toHaveBeenCalled();
});
it('同一ミリ秒の50件はULIDが単調増加する', () => {
  vi.spyOn(Date, 'now').mockReturnValue(2000000000000);
  commitText(Array(50).fill('語').join(' '), vi.fn());
  const ids = useAppStore.getState().chips.map((chip) => chip.id);
  expect(ids).toHaveLength(50);
  expect(ids).toEqual([...ids].sort());
  expect(new Set(ids).size).toBe(50);
  for (const id of ids) expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
});
it('ストアの辞書と部分一致設定を使って分類する', () => {
  useAppStore.setState({ normalizedDicts: buildNormalizedDicts([{ quadrant: 'q1', entries: ['牛乳'] }]) });
  commitText('牛乳 みかん', vi.fn());
  expect(useAppStore.getState().chips).toMatchObject([
    { rawText: '牛乳', quadrant: 'q1', matchedEntry: '牛乳' },
    { rawText: 'みかん', quadrant: 'q4', matchedEntry: null },
  ]);
});
it.each([
  [false, 'q4', null],
  [true, 'q1', 'apple'],
])('部分一致=%s の設定を尊重して包含だけの語の配置を決める', (partialMatch, quadrant, matchedEntry) => {
  useAppStore.setState({
    normalizedDicts: buildNormalizedDicts([{ quadrant: 'q1', entries: ['apple'] }]),
    settings: { ...defaultSettings, partialMatch },
  });
  commitText('apples', vi.fn());
  expect(useAppStore.getState().chips).toMatchObject([{ rawText: 'apples', quadrant, matchedEntry }]);
});
