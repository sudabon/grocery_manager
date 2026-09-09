import type { Page } from '@playwright/test';

/**
 * 時刻を固定する（`env:fixed-clock` / `env:clock-advanced`）。
 * ボードの日付は JST の現在時刻から決まるため、固定しないと日付が変わる瞬間に
 * 全 change の E2E が不安定になる（test-plan.md の前提）。
 */
/** JST 2026-09-09 12:00。 */
export const FIXED_NOW = Date.UTC(2026, 8, 9, 3, 0, 0);
export const FIXED_BOARD_DATE = '2026-09-09';
/** 日付が変わったあとの時刻。JST 2026-09-10 12:00。 */
export const NEXT_DAY_NOW = Date.UTC(2026, 8, 10, 3, 0, 0);
export const NEXT_DAY_BOARD_DATE = '2026-09-10';

/** `Date.now()` と引数なしの `new Date()` を固定する。タイマー（setTimeout）には触らない。 */
export async function installFixedClock(page: Page, now: number) {
  await page.addInitScript((fixed: number) => {
    const state = { now: fixed };
    const RealDate = Date;
    // Proxy にするのは、instanceof・Date.parse・Date.UTC・引数付き new Date() を本物のまま残すため。
    window.Date = new Proxy(RealDate, {
      construct(target, args: unknown[]) {
        return args.length ? new (target as new (...values: unknown[]) => Date)(...args) : new target(state.now);
      },
      apply() { return new RealDate(state.now).toString(); },
      get(target, property, receiver) {
        return property === 'now' ? () => state.now : Reflect.get(target, property, receiver);
      },
    });
    // あとから登録する init script が値を差し替えられるようにする。init script は
    // ナビゲーションごとに登録順で走るので、再読み込み後も差し替えた時刻が残る。
    Object.defineProperty(window, '__fixedNow', {
      configurable: true,
      get: () => state.now,
      set: (value: number) => { state.now = value; },
    });
  }, now);
}

/** 固定時刻を差し替える。いま開いているページと、以降のナビゲーションの両方へ効かせる。 */
export async function setFixedClock(page: Page, now: number) {
  await page.addInitScript((next: number) => { (window as unknown as { __fixedNow: number }).__fixedNow = next; }, now);
  await page.evaluate((next: number) => { (window as unknown as { __fixedNow: number }).__fixedNow = next; }, now);
}
