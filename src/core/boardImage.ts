import type { QuadrantId } from './classify';
import type { Dictionary, MemoItem } from '../db/schema';

/** 画面のボードと同じ視覚配置: 左上 Q2・右上 Q1・左下 Q3・右下 Q4（design.md - D1）。 */
export const BOARD_IMAGE_ORDER: QuadrantId[] = ['q2', 'q1', 'q3', 'q4'];
export interface BoardImageCell { quadrant: QuadrantId; label: string; texts: string[] }

/**
 * 描画に必要な内容だけを視覚配置順に取り出す。PNG のピクセルからは検証できないため、
 * 「どの象限にどのラベルとどの本文が載るか」はこの純粋関数で担保する（design.md - D5）。
 */
export function boardImageLayout(
  dictionaries: readonly Pick<Dictionary, 'quadrant' | 'label'>[],
  chips: readonly Pick<MemoItem, 'quadrant' | 'rawText'>[],
): BoardImageCell[] {
  return BOARD_IMAGE_ORDER.map((quadrant) => ({
    quadrant,
    label: dictionaries.find((dict) => dict.quadrant === quadrant)?.label ?? '',
    // chips は追加順の配列なので、filter がそのまま画面の並び順になる。
    texts: chips.filter((chip) => chip.quadrant === quadrant).map((chip) => chip.rawText),
  }));
}

// 画面と同じ配色。外部画像もウェブフォントも読み込まないので、キャンバスは汚染されない（design.md - D1）。
const FONT_STACK = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Noto Sans JP", sans-serif';
const COLORS = { grid: '#bfc8bf', cell: ['#f8f3e9', '#eff3ed', '#f2efea', '#eef1f2'], text: '#283c35', muted: '#637267', chip: '#fffdf8', chipBorder: '#728379' };
const WIDTH = 1080, GAP = 2, PADDING = 32;
const HEADING_SIZE = 30, CHIP_SIZE = 28, LINE_HEIGHT = 40;
const HEADING_HEIGHT = 68, CHIP_PADDING_X = 18, CHIP_PADDING_Y = 14, CHIP_GAP = 12, MIN_CELL_HEIGHT = 300;

function wrap(measure: (text: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  // 日本語は単語境界で折れないので 1 文字ずつ詰める。切り捨てはしない。
  for (const char of text) {
    if (line && measure(line + char) > maxWidth) { lines.push(line); line = char; }
    else line += char;
  }
  if (line) lines.push(line);
  return lines;
}
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, width, height, radius);
  else ctx.rect(x, y, width, height);
  ctx.fill(); ctx.stroke();
}
function dataUrlToFile(dataUrl: string, name: string): File {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], name, { type: 'image/png' });
}

/**
 * レイアウトから PNG の File を同期的に組み立てる。ユーザージェスチャを失わないため
 * toBlob ではなく toDataURL を使う（design.md - D2）。
 */
export function boardImageFile(layout: BoardImageCell[], name: string): File {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('この環境ではキャンバスを利用できません。');
  const columnWidth = (WIDTH - GAP) / 2;
  const chipWidth = columnWidth - PADDING * 2;
  ctx.font = `${CHIP_SIZE}px ${FONT_STACK}`;
  const measure = (text: string) => ctx.measureText(text).width;
  const cells = layout.map((cell) => {
    const chips = cell.texts.map((text) => wrap(measure, text, chipWidth - CHIP_PADDING_X * 2));
    const content = chips.reduce((total, lines) => total + lines.length * LINE_HEIGHT + CHIP_PADDING_Y * 2 + CHIP_GAP, 0);
    return { ...cell, chips, height: Math.max(PADDING * 2 + HEADING_HEIGHT + content, MIN_CELL_HEIGHT) };
  });
  const rows = [Math.max(cells[0].height, cells[1].height), Math.max(cells[2].height, cells[3].height)];
  // 高さの指定でコンテキストの状態が初期化されるので、以降で font と色を指定し直す。
  canvas.width = WIDTH;
  canvas.height = rows[0] + rows[1] + GAP;
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.grid;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  cells.forEach((cell, index) => {
    const x = index % 2 === 0 ? 0 : columnWidth + GAP;
    const y = index < 2 ? 0 : rows[0] + GAP;
    ctx.fillStyle = COLORS.cell[index];
    ctx.fillRect(x, y, columnWidth, rows[index < 2 ? 0 : 1]);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `${HEADING_SIZE - 8}px ${FONT_STACK}`;
    const numberWidth = ctx.measureText(cell.quadrant.toUpperCase()).width;
    ctx.fillText(cell.quadrant.toUpperCase(), x + PADDING, y + PADDING + 8);
    ctx.fillStyle = COLORS.text;
    ctx.font = `600 ${HEADING_SIZE}px ${FONT_STACK}`;
    ctx.fillText(cell.label, x + PADDING + numberWidth + 12, y + PADDING);
    ctx.font = `${CHIP_SIZE}px ${FONT_STACK}`;
    let top = y + PADDING + HEADING_HEIGHT;
    for (const lines of cell.chips) {
      const height = lines.length * LINE_HEIGHT + CHIP_PADDING_Y * 2;
      ctx.fillStyle = COLORS.chip; ctx.strokeStyle = COLORS.chipBorder; ctx.lineWidth = 2;
      roundedRect(ctx, x + PADDING, top, chipWidth, height, 12);
      ctx.fillStyle = COLORS.text;
      lines.forEach((line, row) => ctx.fillText(line, x + PADDING + CHIP_PADDING_X, top + CHIP_PADDING_Y + row * LINE_HEIGHT + 4));
      top += height + CHIP_GAP;
    }
  });
  return dataUrlToFile(canvas.toDataURL('image/png'), name);
}
