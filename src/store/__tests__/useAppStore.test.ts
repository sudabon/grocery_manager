import { beforeEach, expect, it } from 'vitest';
import { useAppStore, type MemoItem } from '../useAppStore';
const chip = (id: string): MemoItem => ({ id, rawText: '牛乳', normText: '牛乳', quadrant: 'q4', matchedEntry: null, autoClassified: true, createdAt: 1, updatedAt: 1 });
beforeEach(() => useAppStore.getState().clearAll());
it('追加順を保ち同一単語も別チップにする', () => {
  useAppStore.getState().addChips([chip('a'), chip('b')]);
  expect(useAppStore.getState().chips.map((item) => item.id)).toEqual(['a', 'b']);
});
it('手動移動と編集で自動分類から除外し他チップを保持する', () => {
  const store = useAppStore.getState(); store.addChips([chip('a'), chip('b')]);
  store.moveChip('a', 'q1'); store.editChip('b', '  パン  ');
  expect(useAppStore.getState().chips[0]).toMatchObject({ quadrant: 'q1', autoClassified: false, rawText: '牛乳' });
  expect(useAppStore.getState().chips[1]).toMatchObject({ rawText: 'パン', normText: 'パン', autoClassified: false });
  expect(useAppStore.getState().chips[0].updatedAt).toBeGreaterThan(1);
});
it('削除と空白編集は対象だけを削除し全消去もできる', () => {
  const store = useAppStore.getState(); store.addChips([chip('a'), chip('b'), chip('c')]);
  store.editChip('a', '  '); store.removeChip('b');
  expect(useAppStore.getState().chips.map((item) => item.id)).toEqual(['c']);
  store.clearAll(); expect(useAppStore.getState().chips).toEqual([]);
});
