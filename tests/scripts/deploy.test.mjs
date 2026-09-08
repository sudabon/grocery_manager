import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

async function runDeploy(t, config = {}) {
  // 空白を含む作業パスでも動作することを含めて確認する。
  const root = await mkdtemp(join(tmpdir(), 'quadmemo deploy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const app = join(root, 'app');
  const bin = join(root, 'bin');
  await mkdir(join(app, 'scripts'), { recursive: true });
  await mkdir(bin);
  for (const file of ['deploy.sh', 'has-removed-assets.mjs']) {
    await copyFile(new URL('../../scripts/' + file, import.meta.url), join(app, 'scripts', file));
  }
  for (const command of ['terraform', 'npm', 'aws']) {
    const path = join(bin, command);
    await copyFile(new URL('./fixtures/deploy-command.mjs', import.meta.url), path);
    await chmod(path, 0o755);
  }
  const log = join(root, 'commands.jsonl');
  const result = spawnSync('bash', [join(app, 'scripts/deploy.sh')], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, PATH: bin + ':' + process.env.PATH,
      DEPLOY_MOCK_CONFIG: JSON.stringify(config), DEPLOY_MOCK_LOG: log },
  });
  assert.ifError(result.error);
  const calls = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  return { ...result, calls };
}

const awsCalls = result => result.calls.filter(call => call.command === 'aws').map(call => call.args);

test('プレースホルダーのみでも成功し、存在しないエントリポイントを削除して無効化を待つ', async t => {
  const result = await runDeploy(t);
  assert.equal(result.status, 0, result.stderr);
  const calls = awsCalls(result);
  const uploads = calls.filter(args => args[1] === 'cp');
  assert.deepEqual(uploads, [['s3', 'cp', 'dist/index.html',
    's3://quadmemo-app-123456789012/index.html', '--cache-control', 'no-cache']]);
  assert.deepEqual(calls.filter(args => args[1] === 'rm').map(args => args[2]), [
    's3://quadmemo-app-123456789012/sw.js',
    's3://quadmemo-app-123456789012/registerSW.js',
    's3://quadmemo-app-123456789012/manifest.webmanifest',
  ]);
  const invalidation = calls.find(args => args[1] === 'create-invalidation');
  assert.deepEqual(invalidation.slice(invalidation.indexOf('--paths') + 1, invalidation.indexOf('--query')),
    ['/index.html', '/sw.js', '/registerSW.js', '/manifest.webmanifest']);
  assert.deepEqual(calls.at(-1), ['cloudfront', 'wait', 'invalidation-completed',
    '--distribution-id', 'E123ABC', '--id', 'INV123']);
  assert.match(result.stdout, /Deployed to/);
});

test('全エントリポイントを no-cache とし、長期キャッシュ同期から除外する', async t => {
  const files = { 'index.html': 'html', 'sw.js': 'sw', 'registerSW.js': 'register',
    'manifest.webmanifest': '{}', 'assets/app-abc12345.js': 'app' };
  const result = await runDeploy(t, { files, remoteKeys: Object.keys(files) });
  assert.equal(result.status, 0, result.stderr);
  const calls = awsCalls(result);
  const sync = calls.find(args => args[1] === 'sync');
  assert.ok(sync.includes('--delete'));
  assert.equal(sync[sync.indexOf('--cache-control') + 1], 'public, max-age=31536000, immutable');
  assert.deepEqual(sync.flatMap((arg, i) => arg === '--exclude' ? [sync[i + 1]] : []),
    ['index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest']);
  const uploads = calls.filter(args => args[1] === 'cp');
  assert.equal(uploads.length, 4);
  assert.ok(uploads.every(args => args.at(-1) === 'no-cache'));
  assert.equal(calls.filter(args => args[1] === 'rm').length, 0);
  assert.ok(!calls.find(args => args[1] === 'create-invalidation').includes('/*'));
});

test('削除したアセットや旧 SW がある場合は CDN 全体の無効化を追加する', async t => {
  const result = await runDeploy(t, { remoteKeys: ['index.html', 'assets/old-abc12345.js', 'sw.js'] });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(awsCalls(result).find(args => args[1] === 'create-invalidation').includes('/*'));
});

for (const [name, config] of [
  ['ビルド失敗', { buildFails: true }],
  ['空の index.html', { files: { 'index.html': '' } }],
  ['index.html のないビルド', { files: { 'assets/app.js': 'app' } }],
  ['不正な配信先', { bucket: 'unrelated-bucket' }],
]) {
  test(`${name}では AWS の同期・削除を実行しない`, async t => {
    const result = await runDeploy(t, config);
    assert.notEqual(result.status, 0);
    assert.deepEqual(awsCalls(result), []);
    assert.doesNotMatch(result.stdout, /Deployed to/);
  });
}

test('不正なオブジェクト一覧では同期前に停止する', async t => {
  const result = await runDeploy(t, { malformedList: true });
  assert.notEqual(result.status, 0);
  assert.equal(awsCalls(result).length, 1);
});

test('同期失敗ではエントリポイント更新・削除・無効化へ進まない', async t => {
  const result = await runDeploy(t, { syncFails: true });
  assert.notEqual(result.status, 0);
  assert.equal(awsCalls(result).at(-1)[1], 'sync');
  assert.doesNotMatch(result.stdout, /Deployed to/);
});

test('無効化待ちの失敗をデプロイ成功として扱わない', async t => {
  const result = await runDeploy(t, { waitFails: true });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /Deployed to/);
});
