import { QUADRANT_ORDER, type QuadrantId } from './classify';
import type { MemoItem } from '../db/schema';

export const QUADRANT_TEXT_LIMIT = 100;
export const QUADRANT_LIMIT_MESSAGE = '象限の100文字上限を超えるため登録できません。メモを減らしてお試しください。';
type TextChip = Pick<MemoItem, 'quadrant' | 'rawText'>;

/** 保存する本文の UTF-16 長。チップ間の改行も1文字として数える。 */
export function quadrantLength(chips: readonly TextChip[], quadrant: QuadrantId): number {
  return chips.filter((chip) => chip.quadrant === quadrant).map((chip) => chip.rawText).join('\n').length;
}
export function quadrantRemaining(chips: readonly TextChip[], quadrant: QuadrantId): number {
  return Math.max(0, QUADRANT_TEXT_LIMIT - quadrantLength(chips, quadrant));
}
export class QuadrantLimitError extends Error {
  constructor() { super('象限の100文字上限を超えています。'); }
}
export function assertQuadrantLimit(chips: readonly TextChip[]): void {
  if (QUADRANT_ORDER.some((quadrant) => quadrantLength(chips, quadrant) > QUADRANT_TEXT_LIMIT)) throw new QuadrantLimitError();
}
