import { beforeEach, expect, it, vi } from 'vitest';
import { commitText } from '../commitText';
import { useAppStore } from '../../store/useAppStore';
beforeEach(() => useAppStore.getState().clearAll());
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
