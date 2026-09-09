import { expect, it } from 'vitest';
import { assertQuadrantLimit, quadrantLength, quadrantRemaining, QuadrantLimitError, QUADRANT_TEXT_LIMIT } from '../quadrantLength';

const q1 = (rawText: string) => ({ quadrant: 'q1' as const, rawText });
it('空の象限は0文字で100文字残る', () => {
  expect(QUADRANT_TEXT_LIMIT).toBe(100);
  expect(quadrantLength([], 'q1')).toBe(0);
  expect(quadrantRemaining([], 'q1')).toBe(100);
});
it.each([0, 1, 99, 100, 101])('1チップの本文%d文字を数える', (length) => {
  const chips = [q1('あ'.repeat(length))];
  expect(quadrantLength(chips, 'q1')).toBe(length);
  expect(quadrantRemaining(chips, 'q1')).toBe(Math.max(0, 100 - length - 1));
});
it('本文内とチップ間の改行を数え、他象限は含めない', () => {
  expect(quadrantLength([q1('あ\nい'), { quadrant: 'q2', rawText: '無関係' }, q1('う')], 'q1')).toBe(5);
});
it('複数チップの連結長100文字は許可し101文字は拒否する', () => {
  expect(() => assertQuadrantLimit([q1('あ'.repeat(98)), q1('い')])).not.toThrow();
  expect(() => assertQuadrantLimit([q1('あ'.repeat(99)), q1('い')])).toThrow(QuadrantLimitError);
});
it('UTF-16長で数え、空文字チップの間の改行も省略しない', () => {
  expect(quadrantLength([q1('😀')], 'q1')).toBe(2);
  expect(quadrantLength([q1(''), q1(''), q1('a')], 'q1')).toBe(3);
});
