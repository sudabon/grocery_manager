import { expect, it, vi } from 'vitest';
import { boardImageFile, boardImageLayout } from '../boardImage';
import type { MemoItem } from '../../db/schema';

const chip = (id: string, rawText: string, quadrant: MemoItem['quadrant']): MemoItem =>
  ({ id, rawText, normText: rawText, quadrant, matchedEntry: null, autoClassified: false, createdAt: 1, updatedAt: 1 });

it('視覚配置順に象限ラベルと全チップ本文を追加順で返す', () => {
  const layout = boardImageLayout([
    chip('1', '会議', 'q1'), chip('2', '洗濯', 'q2'), chip('3', '牛乳', 'q3'), chip('4', '卵', 'q3'), chip('5', '会議室予約', 'q1'),
  ]);
  expect(layout).toEqual([
    { quadrant: 'q2', label: '野菜', texts: ['洗濯'] },
    { quadrant: 'q1', label: 'それ以外', texts: ['会議', '会議室予約'] },
    { quadrant: 'q3', label: '肉類・乳製品', texts: ['牛乳', '卵'] },
    { quadrant: 'q4', label: 'ドラッグストア', texts: [] },
  ]);
});
it('メモ0件でも4象限のラベルを空の象限として返す', () => {
  expect(boardImageLayout([])).toEqual([
    { quadrant: 'q2', label: '野菜', texts: [] }, { quadrant: 'q1', label: 'それ以外', texts: [] },
    { quadrant: 'q3', label: '肉類・乳製品', texts: [] }, { quadrant: 'q4', label: 'ドラッグストア', texts: [] },
  ]);
});
it('辞書を必要とせず空の象限も固定ラベルで描画対象に残す', () => {
  const layout = boardImageLayout([chip('1', 'メモ', 'q4')]);
  expect(layout.map((cell) => cell.quadrant)).toEqual(['q2', 'q1', 'q3', 'q4']);
  expect(layout[3]).toEqual({ quadrant: 'q4', label: 'ドラッグストア', texts: ['メモ'] });
});

// jsdom は 2D コンテキストを持たないため、描画呼び出しを記録する最小の代替を差し込む。
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
function stubCanvas(omitRoundRect = false) {
  const texts: string[] = [];
  const fillTextCalls: { text: string; maxWidth?: number }[] = [];
  const rectCalls: number[][] = [];
  const roundRectCalls: number[][] = [];
  const context = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, textBaseline: '' as CanvasTextBaseline,
    measureText: (text: string) => ({ width: [...text].length * 16 }),
    fillText: (text: string, _x: number, _y: number, maxWidth?: number) => { texts.push(text); fillTextCalls.push({ text, maxWidth }); },
    fillRect: () => {}, beginPath: () => {},
    rect: (x: number, y: number, w: number, h: number) => { rectCalls.push([x, y, w, h]); },
    fill: () => {}, stroke: () => {},
    roundRect: (x: number, y: number, w: number, h: number) => { roundRectCalls.push([x, y, w, h]); },
  };
  // roundRect は Safari 16.4 以降。未対応環境のフォールバック分岐を踏むために外せるようにする。
  if (omitRoundRect) delete (context as Partial<typeof context>).roundRect;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(PNG_1PX);
  return { texts, fillTextCalls, rectCalls, roundRectCalls };
}
// 1 行チップの枠の寸法。columnWidth(539) - PADDING*2 = 475 幅、LINE_HEIGHT(40) + CHIP_PADDING_Y*2(28) = 68 高さ。
const CHIP_FRAME_SIZE = [475, 68];

it('PNGのFileを同期的に返し、全象限のラベルとチップ本文を描く', () => {
  const { texts, rectCalls, roundRectCalls } = stubCanvas();
  const file = boardImageFile(boardImageLayout([chip('1', '会議', 'q1'), chip('2', '牛乳', 'q3')]), 'quadmemo-board-2026-09-09.png');
  expect(file).toBeInstanceOf(File);
  expect(file.type).toBe('image/png');
  expect(file.name).toBe('quadmemo-board-2026-09-09.png');
  expect(file.size).toBeGreaterThan(0);
  for (const expected of ['Q1', 'Q2', 'Q3', 'Q4', 'それ以外', '野菜', '肉類・乳製品', 'ドラッグストア', '会議', '牛乳']) expect(texts).toContain(expected);
  // roundRect が使える主経路。チップ 2 件が roundRect で描かれ、rect のフォールバックは走らない。
  expect(roundRectCalls.map((call) => call.slice(2))).toEqual([CHIP_FRAME_SIZE, CHIP_FRAME_SIZE]);
  expect(rectCalls).toEqual([]);
});
it('長い本文は折り返して全文を描き、切り捨てない', () => {
  const { texts } = stubCanvas();
  const long = 'あ'.repeat(120);
  boardImageFile(boardImageLayout([chip('1', long, 'q1')]), 'board.png');
  expect(texts.filter((text) => /^あ+$/.test(text)).join('')).toBe(long);
  // join だけでは折り返さず 1 行で返す退化を検出できないため、行数の下限も見る。
  expect(texts.filter((text) => /^あ+$/.test(text)).length).toBeGreaterThan(1);
});
it('全固定ラベルの描画幅に余裕があり、maxWidth の保険も維持する', () => {
  const { fillTextCalls } = stubCanvas();
  boardImageFile(boardImageLayout([]), 'board.png');
  for (const label of ['野菜', 'それ以外', '肉類・乳製品', 'ドラッグストア']) {
    const call = fillTextCalls.find((entry) => entry.text === label);
    expect(call).toBeDefined();
    // columnWidth(539) - PADDING*2(64) - measureText('Q1')(32) - 12 = 431。
    expect(call!.maxWidth).toBe(431);
    expect([...label].length * 30).toBeLessThan(call!.maxWidth!);
  }
});
it('メモ0件でもPNGを返しエラーにならない', () => {
  const { texts } = stubCanvas();
  const file = boardImageFile(boardImageLayout([]), 'board.png');
  expect(file.type).toBe('image/png');
  expect(texts).toEqual(['Q2', '野菜', 'Q1', 'それ以外', 'Q3', '肉類・乳製品', 'Q4', 'ドラッグストア']);
});
it('roundRect 非対応の環境では rect のフォールバックでチップ枠を描く', () => {
  const { texts, rectCalls } = stubCanvas(true);
  const file = boardImageFile(boardImageLayout([chip('1', '会議', 'q1')]), 'board.png');
  expect(file.type).toBe('image/png');
  for (const expected of ['Q1', 'それ以外', '会議']) expect(texts).toContain(expected);
  // 呼び出し回数だけでは ctx.rect(0, 0, 1, 1) のような退化を通すため、枠の寸法まで見る。
  expect(rectCalls.map((call) => call.slice(2))).toEqual([CHIP_FRAME_SIZE]);
});
it('2Dコンテキストを取得できない環境では例外を投げる', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  expect(() => boardImageFile(boardImageLayout([]), 'board.png')).toThrow(/この環境ではキャンバスを利用できません/);
});
it.each(['data:,', 'data:image/png;base64,'])('toDataURL が %s を返す環境では例外を投げる', (dataUrl) => {
  stubCanvas();
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(dataUrl);
  expect(() => boardImageFile(boardImageLayout([]), 'board.png')).toThrow(/画像を書き出せませんでした/);
});

it('ラベル解決には保存済み辞書を受け取らず、本文にも影響されない', () => {
  const layout = boardImageLayout([
    chip('1', '企画', 'q1'), chip('2', '暮らし', 'q2'), chip('3', '食品', 'q3'), chip('4', '保留', 'q4'),
  ]);
  expect(layout.map(({ label }) => label)).toEqual(['野菜', 'それ以外', '肉類・乳製品', 'ドラッグストア']);
});

it('1文字チップ50個を各象限に置いても画像高さ8266pxで面積上限に収まる', () => {
  stubCanvas();
  const chips = (['q1', 'q2', 'q3', 'q4'] as const).flatMap((quadrant) =>
    Array.from({ length: 50 }, (_, index) => chip(`${quadrant}-${index}`, '卵', quadrant)));
  let size = { width: 0, height: 0 };
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
    size = { width: this.width, height: this.height }; return PNG_1PX;
  });
  boardImageFile(boardImageLayout(chips), 'board.png');
  expect(size).toEqual({ width: 1080, height: 8266 });
  expect(size.width * size.height).toBeLessThan(16_777_216);
});
