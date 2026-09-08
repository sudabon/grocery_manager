import { expect, it } from 'vitest';
import { buildNormalizedDicts, classify, type QuadrantId } from '../classify';

const dicts = buildNormalizedDicts([
  { quadrant: 'q3', entries: ['パン', 'abcde'] },
  { quadrant: 'q2', entries: ['れびゅー', 'abc'] },
  { quadrant: 'q1', entries: ['レビュー', 'ＡＢＣ', '牛乳'] },
  { quadrant: 'q4', entries: ['explicit', ' ', 'レビュー'] },
]);
it.each([
  ['ﾊﾟﾝ', 'q3', 'パン'], ['ＡＢＣ', 'q1', 'ＡＢＣ'], ['牛乳', 'q1', '牛乳'],
  ['レビュー', 'q1', 'レビュー'], ['ぎゅうにゅう', 'q4', null], ['explicit', 'q4', 'explicit'],
  ['abcdef', 'q4', null], ['ab', 'q4', null], ['★', 'q4', null],
])('完全一致 %s', (token, quadrant, matchedEntry) => {
  expect(classify(token, dicts, false)).toEqual({ quadrant, matchedEntry });
});
it.each(['abcdef', 'ab', 'abc'])('部分一致は双方向で完全一致より長いエントリも優先: %s', (token) => {
  expect(classify(token, dicts, true)).toEqual({ quadrant: 'q3', matchedEntry: 'abcde' });
});
it('原文長ではなく正規化後長を比較する', () => {
  const cache = buildNormalizedDicts([{ quadrant: 'q1', entries: ['ｶﾞｶﾞ'] }, { quadrant: 'q2', entries: ['ガガガ'] }]);
  expect(classify('ガ', cache, true)?.quadrant).toBe('q2');
});
it.each([false, true])('辞書配列の順序によらず象限順を優先する（部分一致=%s）', (partial) => {
  const quadrants: QuadrantId[] = ['q4', 'q3', 'q2', 'q1'];
  for (let i = 0; i < quadrants.length; i++) {
    const remaining = quadrants.slice(0, quadrants.length - i);
    const cache = buildNormalizedDicts(remaining.map((quadrant) => ({ quadrant, entries: ['語'] })));
    expect(classify('語', cache, partial)?.quadrant).toBe(remaining.at(-1));
  }
});
it.each(['', '　\n\t'])('空トークンは分類しない: %s', (token) => {
  expect(classify(token, dicts, true)).toBeNull();
  expect(classify(token, dicts, false)).toBeNull();
});
it('部分一致ONでもどのエントリにも一致しなければQ4へ落とす', () => {
  expect(classify('zzz', dicts, true)).toEqual({ quadrant: 'q4', matchedEntry: null });
});
it('正規化後に空になる辞書エントリは部分一致の候補にしない', () => {
  const cache = buildNormalizedDicts([{ quadrant: 'q1', entries: ['　'] }, { quadrant: 'q2', entries: ['ぱん'] }]);
  expect(classify('zzz', cache, true)).toEqual({ quadrant: 'q4', matchedEntry: null });
});
