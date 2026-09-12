import { test as base, expect } from '@playwright/test';
import { MemoBoardPage } from '../pages/MemoBoardPage';
import { AppShellPage } from '../pages/AppShellPage';
import { seedIndexedDb, type DatabaseSeed, type SeedMemo } from './indexed-db';
import { FIXED_BOARD_DATE, FIXED_NOW, installFixedClock, NEXT_DAY_NOW, setFixedClock } from '../mocks/clock';
import { defaultSettings, seedDictionaries } from '../../../src/db/defaults';
import type { MemoItem } from '../../../src/db/schema';

export const fixtureNames = [
  'seed:dict-all-empty', 'seed:fresh-storage', 'seed:dict-basic', 'seed:dict-overlap-partial', 'seed:dict-normalize-tie',
  'seed:settings-partial-match', 'seed:settings-no-duplicates', 'seed:memos-across-quadrants',
  'seed:quadrant-at-limit', 'seed:quadrant-near-limit', 'seed:dict-custom-labels', 'env:idb-write-failure', 'env:idb-blocked',
  'seed:boards-across-days', 'seed:legacy-memos-without-date',
  'seed:dict-compound', 'seed:dict-compound-partial',
] as const;
export type ClassificationFixture = typeof fixtureNames[number];
/** 時刻の扱い。固定しないと日付が変わる瞬間にボードの前提が崩れる（test-plan.md の前提）。 */
export const clockNames = ['env:fixed-clock', 'env:clock-advanced', 'env:live-clock'] as const;
export type ClockFixture = typeof clockNames[number];
const jst = (text: string) => Date.parse(`${text}+09:00`);
/** 固定時刻と同じ日の JST 9:00。固定時刻より前で、boardDate と作成日が一致する。 */
const SEED_CREATED_AT = jst('2026-09-09T09:00:00');
function memo(id: string, rawText: string, quadrant: MemoItem['quadrant'],
  boardDate: string = FIXED_BOARD_DATE, createdAt: number = SEED_CREATED_AT): MemoItem {
  return { id, boardDate, rawText, normText: rawText, quadrant, matchedEntry: rawText, autoClassified: true, createdAt, updatedAt: createdAt };
}
/** 日付を持たない version 1 相当のメモ。移行で作成日の JST 日付へ振り分けられる。 */
function legacyMemo(id: string, rawText: string, quadrant: MemoItem['quadrant'], createdAt: number): SeedMemo {
  const { boardDate: _withoutDate, ...rest } = memo(id, rawText, quadrant, FIXED_BOARD_DATE, createdAt);
  return rest;
}
function seedFor(name: ClassificationFixture): DatabaseSeed {
  const dictionaries = seedDictionaries(1);
  dictionaries[0].entries = ['apple', '会議', '猫'];
  dictionaries[1].entries = ['ぱん'];
  dictionaries[2].entries = ['牛乳'];
  const seed: DatabaseSeed = { dictionaries, settings: { ...defaultSettings }, memos: [] };
  if (name === 'seed:dict-all-empty') dictionaries.forEach((d) => { d.entries = []; });
  if (name === 'seed:dict-compound' || name === 'seed:dict-compound-partial') {
    dictionaries[0].entries = ['むね肉'];
    dictionaries[1].entries = ['ミニトマト'];
    dictionaries[2].entries = ['鶏むね肉', 'ヨーグルトドリンク'];
    dictionaries[3].entries = ['キッチンペーパー'];
    seed.settings.partialMatch = name === 'seed:dict-compound-partial';
  }
  if (name === 'seed:dict-overlap-partial') {
    dictionaries[0].entries = ['app']; dictionaries[1].entries = ['apple']; seed.settings.partialMatch = true;
  }
  if (name === 'seed:dict-normalize-tie') {
    dictionaries[0].entries = ['ＡＰＰＬＥ']; dictionaries[1].entries = ['apple'];
  }
  if (name === 'seed:settings-partial-match') seed.settings.partialMatch = true;
  if (name === 'seed:settings-no-duplicates') {
    seed.settings.allowDuplicates = false; seed.memos = [memo('01J00000000000000000000001', 'apple', 'q1')];
  }
  if (name === 'seed:memos-across-quadrants') seed.memos = [
    memo('01J00000000000000000000001', 'apple', 'q1'), memo('01J00000000000000000000002', 'ぱん', 'q2'), memo('01J00000000000000000000003', '牛乳', 'q3'),
  ];
  if (name === 'seed:dict-custom-labels') {
    dictionaries.forEach((dict, index) => { dict.label = ['企画', '暮らし', '食品', '保留'][index]; });
    seed.settings.partialMatch = true;
    seed.settings.autoCommitMs = 3000;
    seed.settings.showDictationHint = false;
  }
  if (name === 'seed:quadrant-at-limit' || name === 'seed:quadrant-near-limit') {
    seed.memos = [memo('capacity-memo', 'a'.repeat(name === 'seed:quadrant-at-limit' ? 100 : 95), 'q1'), memo('movable-memo', 'ぱん', 'q2')];
  }
  // 当日（2026-09-09）・前日（2026-09-08）・2026-09-06 にチップがあり、2026-09-07 は空。
  if (name === 'seed:boards-across-days') seed.memos = [
    memo('01J00000000000000000000010', '牛乳', 'q3', '2026-09-06', jst('2026-09-06T12:00:00')),
    memo('01J00000000000000000000011', 'ぱん', 'q2', '2026-09-08', jst('2026-09-08T09:00:00')),
    memo('01J00000000000000000000012', '卵', 'q3', '2026-09-08', jst('2026-09-08T10:00:00')),
    memo('01J00000000000000000000013', 'apple', 'q1', FIXED_BOARD_DATE, SEED_CREATED_AT),
  ];
  // JST 0:30（UTC 日付では前日）を含める。UTC で振り分けると当日のボードから消える。
  if (name === 'seed:legacy-memos-without-date') seed.memos = [
    legacyMemo('01J00000000000000000000020', '牛乳', 'q3', jst('2026-09-06T12:00:00')),
    legacyMemo('01J00000000000000000000021', 'ぱん', 'q2', jst('2026-09-08T23:30:00')),
    legacyMemo('01J00000000000000000000022', 'apple', 'q1', jst('2026-09-09T00:30:00')),
  ];
  return seed;
}
/** 固定時刻を次の日へ進める操作。`env:clock-advanced` を指定したテストだけが使える。 */
export interface ClockControl { advanceToNextDay: () => Promise<void> }
type Fixtures = {
  classificationSeed: ClassificationFixture; clockMode: ClockFixture; clock: ClockControl;
  memo: MemoBoardPage; appShell: AppShellPage; externalRequests: string[];
};
export const test = base.extend<Fixtures>({
  classificationSeed: ['seed:dict-basic', { option: true }],
  clockMode: ['env:fixed-clock', { option: true }],
  clock: async ({ page, clockMode }, use) => {
    if (clockMode !== 'env:live-clock') await installFixedClock(page, FIXED_NOW);
    await use({
      advanceToNextDay: async () => {
        if (clockMode !== 'env:clock-advanced') throw new Error("時刻を進めるには clockMode: 'env:clock-advanced' を指定してください");
        await setFixedClock(page, NEXT_DAY_NOW);
      },
    });
  },
  externalRequests: [async ({ context, baseURL }, use) => {
    const requests: string[] = [];
    context.on('request', (request) => { if (new URL(request.url()).origin !== new URL(baseURL!).origin) requests.push(request.url()); });
    await use(requests);
  }, { auto: true }],
  // clock を先に受け取り、シードとナビゲーションより前に時刻を固定する。
  memo: async ({ page, clock, classificationSeed }, use) => {
    void clock;
    if (classificationSeed === 'env:idb-blocked') {
      await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('Blocked', 'SecurityError'); } }));
    } else if (classificationSeed !== 'seed:fresh-storage') await seedIndexedDb(page, seedFor(classificationSeed));
    if (classificationSeed === 'env:idb-write-failure') {
      await page.addInitScript(() => Object.defineProperty(window, '__QUADMEMO_FAIL_WRITES__', { value: true, writable: false }));
    }
    const memo = new MemoBoardPage(page); await memo.goto(); await expect(memo.board).toBeVisible(); await use(memo);
  },
  appShell: async ({ page, baseURL }, use) => { await use(new AppShellPage(page, baseURL!)); },
});
export { expect };
