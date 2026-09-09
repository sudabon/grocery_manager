import { QUADRANT_ORDER, type QuadrantId } from './classify';
import type { MemoItem } from '../db/schema';

export const QUADRANT_TEXT_LIMIT = 100;
export const QUADRANT_LIMIT_MESSAGE = `象限の${QUADRANT_TEXT_LIMIT}文字上限を超えるため登録できません。メモを減らしてお試しください。`;
type TextChip = Pick<MemoItem, 'quadrant' | 'rawText'>;

/** 象限に属するチップ本文の合計 UTF-16 長。チップ間の区切りを1文字として数える。 */
export function quadrantLength(chips: readonly TextChip[], quadrant: QuadrantId): number {
  return chips.filter((chip) => chip.quadrant === quadrant).map((chip) => chip.rawText).join('\n').length;
}
/** 次に追加できる1チップの最大文字数。既存チップがあれば、その前に入る区切り1文字を先に差し引く。 */
export function quadrantRemaining(chips: readonly TextChip[], quadrant: QuadrantId): number {
  const separator = chips.some((chip) => chip.quadrant === quadrant) ? 1 : 0;
  return Math.max(0, QUADRANT_TEXT_LIMIT - quadrantLength(chips, quadrant) - separator);
}
export class QuadrantLimitError extends Error {
  constructor() { super(`象限の${QUADRANT_TEXT_LIMIT}文字上限を超えています。`); }
}
/** 引数を「統合後の全メモ」とみなし、4象限すべてを検査する。既存分と追加分を連結して渡すこと。 */
export function assertQuadrantLimit(chips: readonly TextChip[]): void {
  if (QUADRANT_ORDER.some((quadrant) => quadrantLength(chips, quadrant) > QUADRANT_TEXT_LIMIT)) throw new QuadrantLimitError();
}
