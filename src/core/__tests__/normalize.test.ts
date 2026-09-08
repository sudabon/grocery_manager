import { expect, it } from 'vitest';
import { normalize } from '../normalize';

it.each([
  ['ﾊﾟﾝ', 'ぱん'], ['ｶﾞｯﾂ', 'がっつ'], ['ＡＢＣ１２３', 'abc123'],
  ['カタカナ', 'かたかな'], [' ヴァイオリン　', 'ゔぁいおりん'],
  ['　\t 牛乳 \n', '牛乳'], ['', ''], ['　 ', ''], ['★', '★'],
])('正規化 %s → %s', (raw, expected) => expect(normalize(raw)).toBe(expected));
it('長音符と漢字かなの差は吸収しない', () => {
  expect(normalize('メール')).not.toBe(normalize('メル'));
  expect(normalize('牛乳')).not.toBe(normalize('ぎゅうにゅう'));
});
