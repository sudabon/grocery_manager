import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// 一時 git リポジトリを作り、scripts/check-test-plan.sh を実際に走らせる。
// スクリプトは自身の位置から 1 つ上をリポジトリルートとみなす。
async function setup(t, {
  changes = {},          // { <change-id>: { plan: bool, archived: bool, tasks: 'unchecked'|'partial' } }
  specs = {},            // { <ファイル名>: 内容 }
  makeE2eDir = true,
  initGit = true,
  commit = true,
  extraBinPath,
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'quadmemo check-test-plan-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts'), { recursive: true });
  await copyFile(new URL('../../scripts/check-test-plan.sh', import.meta.url),
    join(root, 'scripts', 'check-test-plan.sh'));
  await chmod(join(root, 'scripts', 'check-test-plan.sh'), 0o755);

  if (makeE2eDir) await mkdir(join(root, 'tests', 'e2e'), { recursive: true });
  for (const [name, content] of Object.entries(specs)) {
    await writeFile(join(root, 'tests', 'e2e', name), content);
  }
  for (const [id, spec] of Object.entries(changes)) {
    const dir = spec.archived
      ? join(root, 'openspec', 'changes', 'archive', id)
      : join(root, 'openspec', 'changes', id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'proposal.md'), '# proposal\n');
    if (spec.plan) await writeFile(join(dir, 'test-plan.md'), '| TP-001 | x | y |\n');
    // 未着手 = チェック済みタスクが 1 つも無い状態。partial = 1 つ以上着手済み。
    if (spec.tasks === 'unchecked') {
      await writeFile(join(dir, 'tasks.md'), '- [ ] 1.1 a\n- [ ] 1.2 b\n');
    } else if (spec.tasks === 'partial') {
      await writeFile(join(dir, 'tasks.md'), '- [x] 1.1 a\n- [ ] 1.2 b\n');
    }
  }

  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  };
  if (initGit) {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    if (commit) {
      git('add', '-A');
      git('commit', '-qm', 'init');
    }
  }
  return { root, git, extraBinPath };
}

function run({ root, extraBinPath }, args = []) {
  const env = { ...process.env };
  if (extraBinPath) env.PATH = extraBinPath + ':' + process.env.PATH;
  const result = spawnSync('bash', [join(root, 'scripts', 'check-test-plan.sh'), ...args],
    { cwd: root, encoding: 'utf8', timeout: 20000, env });
  assert.ifError(result.error);
  return result;
}

test('--change でタグ付きテストがあれば成功する', async t => {
  const ctx = await setup(t, {
    changes: { 'my-change': { plan: true } },
    specs: { 'a.spec.ts': "test('x', { tag: ['@my-change'] }, () => {});" },
  });
  const result = run(ctx, ['--change', 'my-change']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Checked: my-change/);
});

test('--change で test-plan.md が無ければ exit 1', async t => {
  const ctx = await setup(t, {
    changes: { 'my-change': { plan: false } },
    specs: { 'a.spec.ts': "test('x', { tag: ['@my-change'] }, () => {});" },
  });
  const result = run(ctx, ['--change', 'my-change']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /my-change に test-plan\.md がありません/);
});

test('--change でタグ付きテストが無ければ exit 1', async t => {
  const ctx = await setup(t, {
    changes: { 'my-change': { plan: true } },
    specs: { 'a.spec.ts': "test('x', { tag: ['@other'] }, () => {});" },
  });
  const result = run(ctx, ['--change', 'my-change']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /@my-change タグ付きの E2E テストが tests\/e2e\/ にありません/);
});

test('--change に存在しない change ID を渡したら test-plan 欠落と区別して exit 2', async t => {
  const ctx = await setup(t, { changes: { 'my-change': { plan: true } } });
  const result = run(ctx, ['--change', 'no-such-change']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /openspec\/changes\/no-such-change がありません/);
  assert.doesNotMatch(result.stderr, /test-plan\.md がありません/);
});

test('--change の引数が不正なら exit 2', async t => {
  const ctx = await setup(t, {});
  const result = run(ctx, ['--change', 'Bad_ID']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/);
});

test('tests/e2e/ が無ければタグ欠落と区別して exit 2', async t => {
  const ctx = await setup(t, {
    changes: { 'my-change': { plan: true } },
    makeE2eDir: false,
  });
  const result = run(ctx, ['--change', 'my-change']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /tests\/e2e\/ が存在しません/);
  assert.doesNotMatch(result.stdout, /タグ付きの E2E テストが/);
});

test('openspec/changes/ が git 管理外なら差分ベースの検証を成立させず exit 2', async t => {
  const ctx = await setup(t, {
    changes: { 'my-change': { plan: true } },
    specs: { 'a.spec.ts': "test('x', { tag: ['@my-change'] }, () => {});" },
    commit: false,
  });
  // scripts/ と tests/ だけコミットし、openspec/ は未追跡のまま残す。
  ctx.git('add', 'scripts', 'tests');
  ctx.git('commit', '-qm', 'init');
  const result = run(ctx);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /openspec\/changes\/ の change が git 管理下にありません/);
});

test('archive だけが git 管理下でも「管理されている」と誤判定しない', async t => {
  const ctx = await setup(t, {
    changes: { 'old-change': { plan: true, archived: true }, 'my-change': { plan: true } },
    specs: { 'a.spec.ts': "test('x', { tag: ['@my-change'] }, () => {});" },
    commit: false,
  });
  ctx.git('add', 'scripts', 'tests', 'openspec/changes/archive');
  ctx.git('commit', '-qm', 'init');
  const result = run(ctx);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /openspec\/changes\/ の change が git 管理下にありません/);
});

test('git 管理下で差分が無ければ検出件数を添えて skip する', async t => {
  const ctx = await setup(t, {
    changes: { 'my-change': { plan: true } },
    specs: { 'a.spec.ts': "test('x', { tag: ['@my-change'] }, () => {});" },
  });
  const result = run(ctx, ['HEAD']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /差分 0 ファイル、change ID 0 件。skip/);
});

test('差分に change があればタグを検証する', async t => {
  const ctx = await setup(t, {
    changes: { 'my-change': { plan: true } },
    specs: { 'a.spec.ts': "test('x', { tag: ['@my-change'] }, () => {});" },
    commit: false,
  });
  // 1 コミット目は scripts/tests のみ、2 コミット目で openspec/ を追加する。
  // base を 1 コミット目にすると差分に change が現れる。
  ctx.git('add', 'scripts', 'tests');
  ctx.git('commit', '-qm', 'base');
  ctx.git('add', 'openspec');
  ctx.git('commit', '-qm', 'add change');
  const result = run(ctx, ['HEAD~1']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Checked: my-change/);
});

test('差分の change に test-plan.md が無ければ exit 1', async t => {
  const ctx = await setup(t, {
    changes: { 'my-change': { plan: false } },
    specs: { 'a.spec.ts': "test('x', { tag: ['@my-change'] }, () => {});" },
    commit: false,
  });
  ctx.git('add', 'scripts', 'tests');
  ctx.git('commit', '-qm', 'base');
  ctx.git('add', 'openspec');
  ctx.git('commit', '-qm', 'add change');
  const result = run(ctx, ['HEAD~1']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /my-change に test-plan\.md がありません/);
});

test('ベース ref が存在しなければ生の git エラーではなく exit 2 で案内する', async t => {
  const ctx = await setup(t, {
    changes: { 'my-change': { plan: true } },
    specs: { 'a.spec.ts': "test('x', { tag: ['@my-change'] }, () => {});" },
  });
  const result = run(ctx, ['no-such-ref']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /ベース ref 'no-such-ref' が見つかりません/);
});

test('git リポジトリの外なら未追跡と区別して exit 2', async t => {
  const ctx = await setup(t, {
    changes: { 'my-change': { plan: true } },
    specs: { 'a.spec.ts': "test('x', { tag: ['@my-change'] }, () => {});" },
    initGit: false,
  });
  const result = run(ctx);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /git リポジトリの外で実行されています/);
  assert.doesNotMatch(result.stderr, /git 管理下にありません/);
});

test('grep が実行エラーを返したらタグ欠落と区別して exit 2', async t => {
  // grep をエラー終了するスタブに差し替え、「マッチなし(1)」と「エラー(2)」を
  // 区別できていることを確認する。
  const bin = await mkdtemp(join(tmpdir(), 'quadmemo stub-bin-'));
  t.after(() => rm(bin, { recursive: true, force: true }));
  await writeFile(join(bin, 'grep'), '#!/bin/sh\nexit 2\n');
  await chmod(join(bin, 'grep'), 0o755);
  const ctx = await setup(t, {
    changes: { 'my-change': { plan: true } },
    specs: { 'a.spec.ts': "test('x', { tag: ['@my-change'] }, () => {});" },
    extraBinPath: bin,
  });
  const result = run(ctx, ['--change', 'my-change']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /tests\/e2e\/ の検索に失敗しました/);
  assert.doesNotMatch(result.stdout, /タグ付きの E2E テストが/);
});

// 差分モードは CI（新規チェックアウト）と同じ「コミット済みツリー」を見る必要がある。
// ローカルの未追跡ファイルを存在扱いすると、ローカルで通って CI だけが落ちる。
test('差分モードでは未追跡の test-plan.md をコミット漏れとして exit 1', async t => {
  const ctx = await setup(t, {
    changes: { 'my-change': { plan: false } },
    specs: { 'a.spec.ts': "test('x', { tag: ['@my-change'] }, () => {});" },
    commit: false,
  });
  ctx.git('add', 'scripts', 'tests');
  ctx.git('commit', '-qm', 'base');
  ctx.git('add', 'openspec');
  ctx.git('commit', '-qm', 'add change');
  await writeFile(join(ctx.root, 'openspec', 'changes', 'my-change', 'test-plan.md'),
    '| TP-001 | x | y |\n');
  const result = run(ctx, ['HEAD~1']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /my-change の test-plan\.md がコミットされていません/);
});

test('差分モードでは未追跡の E2E テストをコミット漏れとして exit 1', async t => {
  const ctx = await setup(t, {
    changes: { 'my-change': { plan: true } },
    commit: false,
  });
  ctx.git('add', 'scripts');
  ctx.git('commit', '-qm', 'base');
  ctx.git('add', 'openspec');
  ctx.git('commit', '-qm', 'add change');
  await writeFile(join(ctx.root, 'tests', 'e2e', 'a.spec.ts'),
    "test('x', { tag: ['@my-change'] }, () => {});");
  const result = run(ctx, ['HEAD~1']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /@my-change タグ付きの E2E テストがコミットされていません/);
});

// --change は未コミットの change を手元で検証する用途なので、
// ファイルシステムを見る従来の挙動を保つ。
test('--change では未追跡の test-plan.md と E2E テストでも成功する', async t => {
  const ctx = await setup(t, {
    changes: { 'my-change': { plan: true } },
    specs: { 'a.spec.ts': "test('x', { tag: ['@my-change'] }, () => {});" },
    commit: false,
  });
  ctx.git('add', 'scripts');
  ctx.git('commit', '-qm', 'base');
  const result = run(ctx, ['--change', 'my-change']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Checked: my-change/);
});

// 未着手（tasks.md にチェック済みタスクが無い）change は実装が存在しないため、
// @<change-id> の E2E テストを要求しない。test-plan.md は提案時の成果物なので必須のまま。
test('--change で未着手の change は @tag が無くても成功する', async t => {
  const ctx = await setup(t, {
    changes: { 'my-change': { plan: true, tasks: 'unchecked' } },
  });
  const result = run(ctx, ['--change', 'my-change']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Pending: my-change/);
});

test('--change で 1 つでも着手済みなら @tag を要求する', async t => {
  const ctx = await setup(t, {
    changes: { 'my-change': { plan: true, tasks: 'partial' } },
  });
  const result = run(ctx, ['--change', 'my-change']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /@my-change タグ付きの E2E テストが tests\/e2e\/ にありません/);
});

test('--change で未着手でも test-plan.md は要求する', async t => {
  const ctx = await setup(t, {
    changes: { 'my-change': { plan: false, tasks: 'unchecked' } },
  });
  const result = run(ctx, ['--change', 'my-change']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /my-change に test-plan\.md がありません/);
  assert.doesNotMatch(result.stdout, /Pending: my-change/);
});

test('差分モードでも未着手の change は @tag を免除する', async t => {
  const ctx = await setup(t, {
    changes: { 'my-change': { plan: true, tasks: 'unchecked' } },
    commit: false,
  });
  ctx.git('add', 'scripts');
  ctx.git('commit', '-qm', 'base');
  ctx.git('add', 'openspec');
  ctx.git('commit', '-qm', 'add change');
  const result = run(ctx, ['HEAD~1']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Pending: my-change/);
});
