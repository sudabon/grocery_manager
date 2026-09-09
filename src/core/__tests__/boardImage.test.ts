import { expect, it, vi } from 'vitest';
import { boardImageFile, boardImageLayout } from '../boardImage';
import { seedDictionaries } from '../../db/defaults';
import type { MemoItem } from '../../db/schema';

const chip = (id: string, rawText: string, quadrant: MemoItem['quadrant']): MemoItem =>
  ({ id, rawText, normText: rawText, quadrant, matchedEntry: null, autoClassified: false, createdAt: 1, updatedAt: 1 });

it('視覚配置順に象限ラベルと全チップ本文を追加順で返す', () => {
  const layout = boardImageLayout(seedDictionaries(1), [
    chip('1', '会議', 'q1'), chip('2', '洗濯', 'q2'), chip('3', '牛乳', 'q3'), chip('4', '卵', 'q3'), chip('5', '会議室予約', 'q1'),
  ]);
  expect(layout).toEqual([
    { quadrant: 'q2', label: '家庭', texts: ['洗濯'] },
    { quadrant: 'q1', label: '仕事', texts: ['会議', '会議室予約'] },
    { quadrant: 'q3', label: '買い物', texts: ['牛乳', '卵'] },
    { quadrant: 'q4', label: 'その他', texts: [] },
  ]);
});
it('メモ0件でも4象限のラベルを空の象限として返す', () => {
  expect(boardImageLayout(seedDictionaries(1), [])).toEqual([
    { quadrant: 'q2', label: '家庭', texts: [] }, { quadrant: 'q1', label: '仕事', texts: [] },
    { quadrant: 'q3', label: '買い物', texts: [] }, { quadrant: 'q4', label: 'その他', texts: [] },
  ]);
});
it('辞書が欠けている象限もラベル空で描画対象に残す', () => {
  const layout = boardImageLayout(seedDictionaries(1).filter((dict) => dict.quadrant !== 'q4'), [chip('1', 'メモ', 'q4')]);
  expect(layout.map((cell) => cell.quadrant)).toEqual(['q2', 'q1', 'q3', 'q4']);
  expect(layout[3]).toEqual({ quadrant: 'q4', label: '', texts: ['メモ'] });
});

// jsdom は 2D コンテキストを持たないため、描画呼び出しを記録する最小の代替を差し込む。
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
function stubCanvas() {
  const texts: string[] = [];
  const context = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, textBaseline: '' as CanvasTextBaseline,
    measureText: (text: string) => ({ width: [...text].length * 16 }),
    fillText: (text: string) => { texts.push(text); },
    fillRect: () => {}, beginPath: () => {}, rect: () => {}, fill: () => {}, stroke: () => {}, roundRect: () => {},
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(PNG_1PX);
  return texts;
}

it('PNGのFileを同期的に返し、全象限のラベルとチップ本文を描く', () => {
  const texts = stubCanvas();
  const file = boardImageFile(boardImageLayout(seedDictionaries(1), [chip('1', '会議', 'q1'), chip('2', '牛乳', 'q3')]), 'quadmemo-board-2026-09-09.png');
  expect(file).toBeInstanceOf(File);
  expect(file.type).toBe('image/png');
  expect(file.name).toBe('quadmemo-board-2026-09-09.png');
  expect(file.size).toBeGreaterThan(0);
  for (const expected of ['Q1', 'Q2', 'Q3', 'Q4', '仕事', '家庭', '買い物', 'その他', '会議', '牛乳']) expect(texts).toContain(expected);
});
it('長い本文は折り返して全文を描き、切り捨てない', () => {
  const texts = stubCanvas();
  const long = 'あ'.repeat(120);
  boardImageFile(boardImageLayout(seedDictionaries(1), [chip('1', long, 'q1')]), 'board.png');
  expect(texts.filter((text) => /^あ+$/.test(text)).join('')).toBe(long);
});
it('メモ0件でもPNGを返しエラーにならない', () => {
  const texts = stubCanvas();
  const file = boardImageFile(boardImageLayout(seedDictionaries(1), []), 'board.png');
  expect(file.type).toBe('image/png');
  expect(texts).toEqual(['Q2', '家庭', 'Q1', '仕事', 'Q3', '買い物', 'Q4', 'その他']);
});
it('2Dコンテキストを取得できない環境では例外を投げる', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  expect(() => boardImageFile(boardImageLayout(seedDictionaries(1), []), 'board.png')).toThrow();
});
