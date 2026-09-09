/**
 * ボードの日付は JST（UTC+9）固定で求める（design.md - D1）。
 * 端末のタイムゾーン設定に依存させないため、固定オフセットを足した UTC 表現から日付を取り出す。
 * 日本に夏時間は無いのでオフセットは常に一定で、`toLocaleDateString` の環境差も避けられる。
 */
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** エポックミリ秒が属するボードの日付（JST の `YYYY-MM-DD`）。 */
export function boardDateOf(epochMs: number): string {
  return new Date(epochMs + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 現在のボードの日付。呼び出しごとに評価するので、日付が変わればその瞬間から新しい値を返す。 */
export function todayBoardDate(now = Date.now()): string {
  return boardDateOf(now);
}

/** 画面に出す年月日。日付は表示のみに使うので、ゼロ埋めしない日本語表記にする。 */
export function boardDateLabel(boardDate: string): string {
  const [year, month, day] = boardDate.split('-');
  return `${Number(year)}年${Number(month)}月${Number(day)}日`;
}

/** ボードの日付として扱える文字列か。URL から受け取った値の検査に使う。 */
export function isBoardDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  // 2026-02-30 のような存在しない日付を弾く。
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}
