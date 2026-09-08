import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../../scripts/e2e-report.mjs', import.meta.url));
const CHANGE_ID = 'setup-quadmemo-hosting';

// 実装のテストは TP-ID を tag に置き、title は日本語文で TP-ID を含まない
// (tests/e2e/setup-quadmemo-hosting.spec.ts と同じ形)。フィクスチャもそれに合わせる。
const spec = (tpId, status, { title = `${tpId} の観点を検証する`, projectName = 'chromium' } = {}) => ({
  title,
  tags: ['@setup-quadmemo-hosting', `@${tpId}`],
  tests: [{ status, projectName }],
});

async function runReport(t, {
  specs = [],
  planIds = ['TP-001', 'TP-002', 'TP-003'],
  startTime = new Date().toISOString(),
  stats = undefined,
  report = undefined,
  rawResults = undefined,
  args = ['--max-age', '900'],
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'quadmemo e2e-report-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const planDir = join(root, 'openspec', 'changes', CHANGE_ID);
  await mkdir(planDir, { recursive: true });
  const planRows = planIds.map(id => `| ${id} | シナリオ | 期待結果 |`).join('\n');
  await writeFile(join(planDir, 'test-plan.md'), `# Test Plan\n\n${planRows}\n`);

  const body = rawResults !== undefined
    ? rawResults
    : JSON.stringify(report ?? {
      stats: stats ?? { startTime, duration: 1000 },
      suites: [{ title: 'setup-quadmemo-hosting.spec.ts', specs }],
    });
  await writeFile(join(root, 'results.json'), body);

  const result = spawnSync(process.execPath, [script, CHANGE_ID, 'results.json', ...args],
    { cwd: root, encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  return result;
}

test('全件 skipped はカバレッジ欠落として exit 1', async t => {
  const result = await runReport(t, {
    specs: [spec('TP-001', 'skipped'), spec('TP-002', 'skipped'), spec('TP-003', 'skipped')],
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /合計 3 件: pass 0 \/ fail 0 \/ skip 3/);
  assert.match(result.stdout, /カバレッジ欠落: TP-001, TP-002, TP-003/);
});

test('全件 expected は exit 0 で TP-ID が表に出る', async t => {
  const result = await runReport(t, {
    specs: [spec('TP-001', 'expected'), spec('TP-002', 'expected'), spec('TP-003', 'expected')],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /合計 3 件: pass 3 \/ fail 0 \/ skip 0/);
  // tag から TP-ID を拾えていること（title 側には TP-ID があってもなくても成立させない）。
  assert.match(result.stdout, /\| TP-001 \|/);
  assert.doesNotMatch(result.stdout, /カバレッジ欠落/);
});

test('unexpected を含む結果は exit 3', async t => {
  const result = await runReport(t, {
    specs: [spec('TP-001', 'expected'), spec('TP-002', 'unexpected'), spec('TP-003', 'expected')],
  });
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stdout, /合計 3 件: pass 2 \/ fail 1 \/ skip 0/);
});

test('flaky は pass に数えつつフレーク列に印を付ける', async t => {
  const result = await runReport(t, {
    specs: [spec('TP-001', 'flaky'), spec('TP-002', 'expected'), spec('TP-003', 'expected')],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /合計 3 件: pass 3 \/ fail 0 \/ skip 0 \/ フレーク 1/);
  assert.match(result.stdout, /\| TP-001 \|.*\| pass \| ⚠ \|/);
});

test('未知ステータスは fail として集計し、表と合計を残したまま exit 3', async t => {
  const result = await runReport(t, {
    specs: [spec('TP-001', 'unknown'), spec('TP-002', 'unexpected'), spec('TP-003', 'skipped')],
  });
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stdout, /合計 3 件: pass 0 \/ fail 2 \/ skip 1/);
  assert.match(result.stdout, /カバレッジ欠落: TP-003/);
  // 表と同じ stdout に出す（> report.txt で警告だけ消えないように）。
  assert.match(result.stdout, /未知のテストステータスを fail として集計しました: unknown/);
});

test('複数プロジェクトのうち片方だけ実行してもカバレッジ欠落にしない', async t => {
  const result = await runReport(t, {
    specs: [
      { ...spec('TP-001', 'expected'), tests: [
        { status: 'expected', projectName: 'chromium' },
        { status: 'skipped', projectName: 'mobile-safari' },
      ] },
      spec('TP-002', 'expected'), spec('TP-003', 'expected'),
    ],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[chromium\]/);
});

// --- 入力の形 ---

for (const [name, rawResults, pattern] of [
  ['壊れた JSON', 'not json', /JSON として解析できません/],
  ['null', 'null', /オブジェクト）ではありません/],
  ['配列', '[]', /オブジェクト）ではありません/],
  ['文字列', '"hello"', /オブジェクト）ではありません/],
]) {
  test(`レポートが ${name} なら exit 2`, async t => {
    const result = await runReport(t, { rawResults });
    assert.equal(result.status, 2);
    assert.match(result.stderr, pattern);
  });
}

test('テストが 1 件も無い回はカバレッジ欠落ではなく実行失敗として exit 2', async t => {
  const result = await runReport(t, {
    report: { stats: { startTime: new Date().toISOString(), duration: 1 }, suites: [],
      errors: [{ message: 'global setup が失敗しました' }] },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /テストが 1 件も含まれていません/);
  // results.errors を読んで原因を出すこと。
  assert.match(result.stderr, /global setup が失敗しました/);
  assert.doesNotMatch(result.stdout, /カバレッジ欠落/);
});

// --- 鮮度検証 ---

test('実行開始時刻が無ければ --max-age の指定に関係なく exit 2', async t => {
  const result = await runReport(t, {
    specs: [spec('TP-001', 'expected')], stats: { duration: 1000 }, args: [],
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /実行開始時刻\(stats\.startTime\)がありません/);
});

test('--max-age より古い結果は exit 2', async t => {
  const result = await runReport(t, {
    specs: [spec('TP-001', 'expected'), spec('TP-002', 'expected'), spec('TP-003', 'expected')],
    startTime: new Date(Date.now() - 3600 * 1000).toISOString(),
    args: ['--max-age', '900'],
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--max-age 900 秒を超えています/);
});

test('--max-age 未指定では鮮度を検証していないことを警告する', async t => {
  const result = await runReport(t, {
    specs: [spec('TP-001', 'expected'), spec('TP-002', 'expected'), spec('TP-003', 'expected')],
    startTime: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    args: [],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /--max-age を指定していないため/);
});

// --- test-plan 側 ---

test('test-plan に TP-ID が 1 件も無ければ exit 2', async t => {
  const result = await runReport(t, { specs: [spec('TP-001', 'expected')], planIds: [] });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /TP-ID \(TP-NNN\) が 1 件もありません/);
});

test('test-plan が読めなければ exit 2', async t => {
  const root = await mkdtemp(join(tmpdir(), 'quadmemo e2e-report-noplan-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'results.json'), JSON.stringify({
    stats: { startTime: new Date().toISOString(), duration: 1 },
    suites: [{ title: 'f.spec.ts', specs: [spec('TP-001', 'expected')] }],
  }));
  const result = spawnSync(process.execPath, [script, CHANGE_ID, 'results.json', '--max-age', '900'],
    { cwd: root, encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /test-plan\.md を読めません/);
});

// --- 引数パース ---

test('単一ダッシュの未知オプションは引数エラーとして exit 2', async t => {
  const result = await runReport(t, { specs: [spec('TP-001', 'expected')], args: ['-x'] });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /未知のオプションです: -x/);
});

test('二重ダッシュの未知オプションも引数エラーとして exit 2', async t => {
  const result = await runReport(t, { specs: [spec('TP-001', 'expected')], args: ['--nope'] });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /未知のオプションです: --nope/);
});

for (const raw of ['', ' ', '\n', ' \t\n']) {
  test(`--max-age の値が空白のみ(${JSON.stringify(raw)})なら引数エラーで exit 2`, async t => {
    const result = await runReport(t, {
      specs: [spec('TP-001', 'expected')], args: [`--max-age=${raw}`],
    });
    assert.equal(result.status, 2);
    // 「0 秒を超えています」という鮮度エラーに化けていないことまで固定する。
    assert.match(result.stderr, /--max-age には 0 以上の秒数/);
    assert.doesNotMatch(result.stderr, /秒を超えています/);
  });
}

for (const raw of ['0x10', '1e3', '-1', '900abc', 'Infinity']) {
  test(`--max-age に十進整数以外(${raw})を渡したら exit 2`, async t => {
    const result = await runReport(t, {
      specs: [spec('TP-001', 'expected')], args: ['--max-age', raw],
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /十進の整数/);
    assert.doesNotMatch(result.stderr, /秒を超えています/);
  });
}
