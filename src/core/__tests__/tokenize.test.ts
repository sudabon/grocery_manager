import { afterEach, describe, expect, it, vi } from 'vitest';
import { tokenize } from '../tokenize';
import { buildNormalizedDicts } from '../classify';

afterEach(() => vi.unstubAllGlobals());
describe('tokenize', () => {
  it('単語を順番に分割し句読点と空白を除く', () => {
    expect(tokenize('  牛乳、 卵。パン！？ ,.!? ')).toEqual(['牛乳', '卵', 'パン']);
  });
  it('空文字と記号のみでは0件', () => {
    for (const text of ['', '   ', '！？、。... ★🎤']) expect(tokenize(text)).toEqual([]);
  });
  it('Segmenter 未対応では空白と句読点で分割する', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    expect(tokenize(' 牛乳、卵。パン！milk?tea,coffee.水\n米 ')).toEqual(['牛乳', '卵', 'パン', 'milk', 'tea', 'coffee', '水', '米']);
    expect(tokenize('★ 🎤 、 。 !')).toEqual([]);
  });
});

describe('辞書による結合', () => {
  const dicts = buildNormalizedDicts([
    { quadrant: 'q1', entries: ['むね肉', '鶏むね'] },
    { quadrant: 'q3', entries: ['鶏むね肉', 'キッチンペーパー'] },
  ]);
  it.each(['鶏むね肉', '鶏ムネ肉', '鶏ﾑﾈ肉', 'キッチンペーパー'])('最長の完全一致を原文のまま結合する: %s', (text) => {
    expect(tokenize(text, dicts)).toEqual([text]);
  });
  it.each(['、', ' ', '。', '\n', '★', '🎤'])('区切りを跨がず、区切りの後でも結合する: %s', (separator) => {
    expect(tokenize(`鶏${separator}むね肉`, dicts)).toEqual(['鶏', 'むね肉']);
  });
  it('複数のランの中を左から順に結合する', () => {
    expect(tokenize('鶏むね肉キッチンペーパー、鶏むね肉', dicts)).toEqual(['鶏むね肉', 'キッチンペーパー', '鶏むね肉']);
  });
  it('辞書に無い語と空の辞書は従来の分割を保つ', () => {
    expect(tokenize('オリーブオイル', dicts)).toEqual(['オリーブ', 'オイル']);
    expect(tokenize('鶏むね肉', buildNormalizedDicts([]))).toEqual(['鶏', 'むね', '肉']);
  });
  it('エントリの一部と一致しても結合しない', () => {
    const cache = buildNormalizedDicts([{ quadrant: 'q3', entries: ['鶏むね肉'] }]);
    expect(tokenize('鶏むね', cache)).toEqual(['鶏', 'むね']);
  });
  it('1文字のエントリは周囲を巻き込まない', () => {
    expect(tokenize('鶏むね肉', buildNormalizedDicts([{ quadrant: 'q1', entries: ['鶏', '肉'] }]))).toEqual(['鶏', 'むね', '肉']);
  });
  it('最長エントリ長を超える候補は照合せず探索を打ち切る', () => {
    const cache = buildNormalizedDicts([{ quadrant: 'q1', entries: ['鶏むね肉'] }]);
    const has = vi.spyOn(cache.exact, 'has');
    const normalize = vi.spyOn(String.prototype, 'normalize');
    expect(tokenize('鶏むね肉肉肉肉肉', cache)).toEqual(['鶏むね肉', '肉', '肉', '肉', '肉']);
    expect(has.mock.calls.every(([candidate]) => candidate.length <= 4)).toBe(true);
    expect(normalize.mock.contexts.every((candidate) => String(candidate).length <= 5)).toBe(true);
  });
  it('正規化で縮む半角カナも原文長で打ち切らず結合する', () => {
    const cache = buildNormalizedDicts([{ quadrant: 'q3', entries: ['鶏がが肉'] }]);
    expect(tokenize('鶏ｶﾞｶﾞ肉', cache)).toEqual(['鶏ｶﾞｶﾞ肉']);
  });
  it('Segmenter未対応でも区切りごとの塊を返す', () => {
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined });
    expect(tokenize('鶏むね肉、鶏 むね肉。キッチンペーパー', dicts)).toEqual(['鶏むね肉', '鶏', 'むね肉', 'キッチンペーパー']);
    expect(tokenize('★ 🎤 、 。 !', dicts)).toEqual([]);
  });
});
