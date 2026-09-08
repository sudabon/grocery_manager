import { afterEach, describe, expect, it, vi } from 'vitest';
import { tokenize } from '../tokenize';

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
