import { afterEach, expect, it, vi } from 'vitest';
import { boardDateLabel, boardDateOf, isBoardDate, JST_OFFSET_MS, todayBoardDate } from '../boardDate';

afterEach(() => vi.useRealTimers());
const jst = (text: string) => Date.parse(`${text}+09:00`);

it('JST 0:00 の直前と直後で日付が切り替わる', () => {
  expect(boardDateOf(jst('2026-09-09T23:59:59.999'))).toBe('2026-09-09');
  expect(boardDateOf(jst('2026-09-10T00:00:00.000'))).toBe('2026-09-10');
  expect(boardDateOf(jst('2026-09-10T00:00:00.001'))).toBe('2026-09-10');
});
it('UTC 15:00 の前後が JST の日付境界と一致する', () => {
  expect(boardDateOf(Date.parse('2026-09-09T14:59:59.999Z'))).toBe('2026-09-09');
  expect(boardDateOf(Date.parse('2026-09-09T15:00:00.000Z'))).toBe('2026-09-10');
  // UTC 日付では 1 日ずれる時間帯（JST 0:00〜9:00）でも JST の日付を返す。
  expect(boardDateOf(Date.parse('2026-09-10T00:00:00.000Z'))).toBe('2026-09-10');
  expect(JST_OFFSET_MS).toBe(32_400_000);
});
it('うるう日と年をまたぐ境界を扱える', () => {
  expect(boardDateOf(jst('2028-02-28T23:59:59.999'))).toBe('2028-02-28');
  expect(boardDateOf(jst('2028-02-29T00:00:00.000'))).toBe('2028-02-29');
  expect(boardDateOf(jst('2028-03-01T00:00:00.000'))).toBe('2028-03-01');
  expect(boardDateOf(jst('2026-12-31T23:59:59.999'))).toBe('2026-12-31');
  expect(boardDateOf(jst('2027-01-01T00:00:00.000'))).toBe('2027-01-01');
});
it.each([
  // [端末のタイムゾーン, JST 2026-09-10 0:30 の端末上の日, JST 2026-09-09 23:30 の端末上の日]
  ['UTC', 9, 9], ['America/Los_Angeles', 9, 9], ['Australia/Sydney', 10, 10], ['Asia/Tokyo', 10, 9],
])('端末のタイムゾーン %s でも同じ日付になる', (timeZone, afterMidnight, beforeMidnight) => {
  const original = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    const after = jst('2026-09-10T00:30:00');
    const before = jst('2026-09-09T23:30:00');
    // 端末上の日が JST の日とずれる組み合わせを含むことを先に確かめ、検証が空振りにならないようにする。
    expect([new Date(after).getDate(), new Date(before).getDate()]).toEqual([afterMidnight, beforeMidnight]);
    expect(boardDateOf(after)).toBe('2026-09-10');
    expect(boardDateOf(before)).toBe('2026-09-09');
  } finally { process.env.TZ = original; }
});
it('現在時刻の日付を返し、引数で固定もできる', () => {
  vi.useFakeTimers();
  vi.setSystemTime(jst('2026-09-10T00:00:00'));
  expect(todayBoardDate()).toBe('2026-09-10');
  vi.setSystemTime(jst('2026-09-09T23:59:59.999'));
  expect(todayBoardDate()).toBe('2026-09-09');
  expect(todayBoardDate(jst('2026-09-11T12:00:00'))).toBe('2026-09-11');
});

it.each([['2026-09-09', '2026年9月9日'], ['2026-12-31', '2026年12月31日'], ['2028-02-29', '2028年2月29日']])(
  '%s を年月日で表示する', (boardDate, label) => {
    expect(boardDateLabel(boardDate)).toBe(label);
  });
it.each(['2026-09-09', '2028-02-29', '1970-01-01'])('ボードの日付として受け入れる: %s', (value) => {
  expect(isBoardDate(value)).toBe(true);
});
it.each(['2026-9-9', '2026/09/09', '2026-02-30', '2026-13-01', '', 'today', '2026-09-09T00:00:00Z', null, 20260909])(
  'ボードの日付として拒否する: %j', (value) => {
    expect(isBoardDate(value)).toBe(false);
  });
it.each([1e18, -1e18, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 3e14, -3e14, NaN, Infinity, -Infinity])(
  // 移行とインポートがこの全域性に依存する。例外や拡張年（+011476-08）を返すとデータベースが開けなくなる。
  '範囲外・非数の %p でもボードの日付として妥当な値を返す', (value) => {
    expect(isBoardDate(boardDateOf(value))).toBe(true);
  });
