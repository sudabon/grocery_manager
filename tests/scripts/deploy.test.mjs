import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

async function runDeploy(t, config = {}, { hasRemovedAssetsStub } = {}) {
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
  if (hasRemovedAssetsStub !== undefined) {
    await writeFile(join(app, 'scripts', 'has-removed-assets.mjs'), hasRemovedAssetsStub);
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

const ICONS = ['icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon-180.png'];
const ENTRYPOINTS = ['index.html', 'sw.js', 'manifest.webmanifest', ...ICONS];
const ENTRYPOINT_PATHS = ENTRYPOINTS.map(file => '/' + file);

// find の結果が undefined だと TypeError になり、本当の原因（無効化が呼ばれていない）が
// 読めなくなるため、存在を先に固定する。
function invalidationOf(result) {
  const invalidation = awsCalls(result).find(args => args[1] === 'create-invalidation');
  assert.ok(invalidation, 'create-invalidation が呼ばれていない');
  return invalidation;
}

const pathsOf = invalidation =>
  invalidation.slice(invalidation.indexOf('--paths') + 1, invalidation.indexOf('--query'));

test('プレースホルダーのみでも成功し、存在しないエントリポイントを削除して無効化を待つ', async t => {
  const result = await runDeploy(t);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const calls = awsCalls(result);
  const uploads = calls.filter(args => args[1] === 'cp');
  assert.deepEqual(uploads, [['s3', 'cp', 'dist/index.html',
    's3://quadmemo-app-123456789012/index.html', '--cache-control', 'no-cache']]);
  assert.deepEqual(calls.filter(args => args[1] === 'rm').map(args => args[2]), [
    's3://quadmemo-app-123456789012/sw.js',
    's3://quadmemo-app-123456789012/manifest.webmanifest',
    ...ICONS.map(file => 's3://quadmemo-app-123456789012/' + file),
  ]);
  assert.deepEqual(pathsOf(invalidationOf(result)), ENTRYPOINT_PATHS);
  assert.deepEqual(calls.at(-1), ['cloudfront', 'wait', 'invalidation-completed',
    '--distribution-id', 'E123ABC', '--id', 'INV123']);
  assert.match(result.stdout, /Deployed to/);
});

test('全エントリポイントを no-cache とし、長期キャッシュ同期から除外する', async t => {
  const files = { 'index.html': 'html', 'sw.js': 'sw',
    'manifest.webmanifest': '{}', 'assets/app-abc12345.js': 'app', ...Object.fromEntries(ICONS.map(file => [file, 'icon'])) };
  const result = await runDeploy(t, { files, remoteKeys: Object.keys(files) });
  assert.equal(result.status, 0, result.stderr);
  const calls = awsCalls(result);
  const sync = calls.find(args => args[1] === 'sync');
  assert.ok(sync.includes('--delete'));
  assert.equal(sync[sync.indexOf('--cache-control') + 1], 'public, max-age=31536000, immutable');
  assert.deepEqual(sync.flatMap((arg, i) => arg === '--exclude' ? [sync[i + 1]] : []),
    ENTRYPOINTS);
  const uploads = calls.filter(args => args[1] === 'cp');
  assert.equal(uploads.length, ENTRYPOINTS.length);
  assert.ok(uploads.every(args => args[args.indexOf('--cache-control') + 1] === 'no-cache'));
  const manifestUpload = uploads.find(args => args[2] === 'dist/manifest.webmanifest');
  assert.deepEqual(manifestUpload, ['s3', 'cp', 'dist/manifest.webmanifest',
    's3://quadmemo-app-123456789012/manifest.webmanifest', '--cache-control', 'no-cache',
    '--content-type', 'application/manifest+json']);
  assert.equal(calls.filter(args => args[1] === 'rm').length, 0);
  assert.deepEqual(pathsOf(invalidationOf(result)), ENTRYPOINT_PATHS);
});

// 空バケットの表現は AWS CLI の版によって変わるため、いずれでも初回デプロイが成立すること。
for (const [name, config] of [
  ['Contents キーが無い応答', { emptyBucket: true }],
  ['Contents が null の応答', { listShape: 'null-contents' }],
  ['応答そのものが null', { listShape: 'null-response' }],
  ['出力が空', { listShape: 'empty-output' }],
]) {
  test(`空バケット（${name}）では CDN 全体の無効化を追加しない`, async t => {
    const result = await runDeploy(t, config);
    assert.equal(result.status, 0, result.stderr);
    const invalidation = invalidationOf(result);
    assert.deepEqual(pathsOf(invalidation), ENTRYPOINT_PATHS);
  });
}

test('削除したアセットや旧 SW がある場合は CDN 全体の無効化に置き換える', async t => {
  const result = await runDeploy(t, { remoteKeys: ['index.html', 'assets/old-abc12345.js', 'sw.js'] });
  assert.equal(result.status, 0, result.stderr);
  // /* はエントリポイントを包含するので、パス数課金を増やさないよう置き換える。
  assert.deepEqual(pathsOf(invalidationOf(result)), ['/*']);
});

test('S3 のディレクトリマーカーは削除扱いにしない', async t => {
  const result = await runDeploy(t, { remoteKeys: ['index.html', 'assets/'] });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(pathsOf(invalidationOf(result)), ENTRYPOINT_PATHS);
});

test('S3 に実在するエントリポイントを消すときだけ警告する', async t => {
  // ビルドが sw.js を吐き損ねた状況。S3 には残っているので事故として警告する。
  const result = await runDeploy(t, { remoteKeys: ['index.html', 'sw.js'] });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /dist\/sw\.js がビルド成果物に無く、S3 には存在します/);
  // 最初から S3 に無いものは正常系なので警告しない。
  assert.doesNotMatch(result.stderr, /icons\/icon-192\.png がビルド成果物に無く/);
  assert.doesNotMatch(result.stderr, /manifest\.webmanifest がビルド成果物に無く/);
});

for (const file of ['sw.js', 'manifest.webmanifest']) {
  test(`空のエントリポイント ${file} ではデプロイを中止する`, async t => {
    const result = await runDeploy(t, { files: { 'index.html': '<h1>x</h1>', [file]: '' } });
    assert.equal(result.status, 1);
    assert.deepEqual(awsCalls(result), []);
    assert.match(result.stderr, new RegExp(`${file.replace('.', '\\.')} が空、または通常ファイルではありません`));
    assert.doesNotMatch(result.stdout, /Deployed to/);
  });
}

// ディレクトリは -s が真になるため、-f を併せて見ないと削除分岐に落ちて本番を消す。
for (const file of ['index.html', 'sw.js', 'manifest.webmanifest']) {
  test(`エントリポイント ${file} がディレクトリならデプロイを中止する`, async t => {
    // 同じパスをファイルとしても作るとモックの mkdir が EEXIST で落ち、
    // 「別の理由で止まった」テストになるので files には含めない。
    const files = file === 'index.html'
      ? { 'assets/app.js': 'x' }
      : { 'index.html': '<h1>x</h1>' };
    const result = await runDeploy(t, { files, dirs: [file] });
    assert.equal(result.status, 1);
    assert.deepEqual(awsCalls(result), []);
    assert.match(result.stderr,
      new RegExp(`dist/${file.replace('.', '\\.')} が空、または通常ファイルではありません`));
    assert.doesNotMatch(result.stdout, /Deployed to/);
  });
}

for (const [name, config, stderrPattern] of [
  ['ビルド失敗', { buildFails: true }],
  ['空の index.html', { files: { 'index.html': '' } }, /index\.html が存在しないか/],
  ['index.html のないビルド', { files: { 'assets/app.js': 'app' } }, /index\.html が存在しないか/],
  ['不正な配信先', { bucket: 'unrelated-bucket' }, /配信先出力が不正です/],
  ['不正なディストリビューション ID', { distributionId: 'invalid-id!' }, /配信先出力が不正です/],
]) {
  test(`${name}では AWS の同期・削除を実行しない`, async t => {
    const result = await runDeploy(t, config);
    assert.notEqual(result.status, 0);
    assert.deepEqual(awsCalls(result), []);
    assert.doesNotMatch(result.stdout, /Deployed to/);
    if (stderrPattern) assert.match(result.stderr, stderrPattern);
  });
}

test('不正なオブジェクト一覧では同期前に停止する', async t => {
  const result = await runDeploy(t, { malformedList: true });
  assert.notEqual(result.status, 0);
  // 明示的なバリデーションで止まったこと（TypeError でのクラッシュではないこと）を固定する。
  assert.match(result.stderr, /JSON オブジェクトではありません/);
  assert.deepEqual(awsCalls(result).map(args => args.slice(0, 2)), [['s3api', 'list-objects-v2']]);
  assert.doesNotMatch(result.stdout, /Deployed to/);
});

test('has-removed-assets.mjs が想定外の値を返したら同期前に停止する', async t => {
  // 出力契約が将来ずれたとき、黙って「削除なし」に倒れて /* 無効化を飛ばさないこと。
  const result = await runDeploy(t, {}, { hasRemovedAssetsStub: "console.log('maybe');\n" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /has-removed-assets\.mjs の出力が想定外です: maybe/);
  assert.deepEqual(awsCalls(result).map(args => args.slice(0, 2)), [['s3api', 'list-objects-v2']]);
  assert.doesNotMatch(result.stdout, /Deployed to/);
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
