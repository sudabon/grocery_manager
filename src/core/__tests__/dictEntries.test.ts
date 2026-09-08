import { expect, it } from 'vitest';
import { sanitizeEntries } from '../dictEntries';
import { clampAutoCommitMs } from '../settings';
it('行を整形して正規化重複は先着の表記を残す', () => {
  expect(sanitizeEntries(' \n パン \r\nぱん\nﾊﾟﾝ\r ＡＰＰＬＥ \napple\n 卵 \n')).toEqual(['パン', 'ＡＰＰＬＥ', '卵']);
});
it('空入力と空行だけの入力は空配列', () => {
  expect(sanitizeEntries('')).toEqual([]); expect(sanitizeEntries(' \n\t\r\n')).toEqual([]);
});
it.each([[0, 500], [6000, 5000], [1200, 1200], [NaN, 1500]])('待機時間%sを%sへクランプ', (value, expected) => {
  expect(clampAutoCommitMs(value)).toBe(expected);
});
