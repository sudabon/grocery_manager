import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

// スクリプトは自身の位置から ../dist/ を解決するため、一時ディレクトリに
// scripts/ と dist/ の対を作って実行する。
async function run(t, { localFiles = {}, input = '', entrypoints = [] } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'quadmemo has-removed-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(join(root, 'dist'), { recursive: true });
  await copyFile(new URL('../../scripts/has-removed-assets.mjs', import.meta.url),
    join(root, 'scripts', 'has-removed-assets.mjs'));
  for (const [key, content] of Object.entries(localFiles)) {
    const path = join(root, 'dist', key);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, content);
  }
  const result = spawnSync(process.execPath,
    [join(root, 'scripts', 'has-removed-assets.mjs'), ...entrypoints],
    { input, encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  const [removed = '', removedEntrypoints = ''] = result.stdout.split('\n');
  return { ...result, removed, removedEntrypoints };
}

const listing = keys => JSON.stringify({ KeyCount: keys.length, Contents: keys.map(Key => ({ Key })) });

test('S3 にあって dist/ に無いキーがあれば yes', async t => {
  const result = await run(t, {
    localFiles: { 'index.html': 'x' },
    input: listing(['index.html', 'assets/old-abc12345.js']),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.removed, 'yes');
});

test('S3 と dist/ が一致すれば no', async t => {
  const result = await run(t, {
    localFiles: { 'index.html': 'x', 'assets/app.js': 'y' },
    input: listing(['index.html', 'assets/app.js']),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.removed, 'no');
});

test('末尾スラッシュのディレクトリマーカーは削除扱いにしない', async t => {
  const result = await run(t, {
    localFiles: { 'index.html': 'x' },
    input: listing(['index.html', 'assets/']),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.removed, 'no');
});

// 空バケットの表現は AWS CLI の版によって変わるため 3 形すべてを受ける。
for (const [name, input] of [
  ['Contents キーが無い応答', JSON.stringify({ KeyCount: 0 })],
  ['Contents が null の応答', JSON.stringify({ KeyCount: 0, Contents: null })],
  ['出力が空', ''],
]) {
  test(`空バケット（${name}）は no を返す`, async t => {
    const result = await run(t, { localFiles: { 'index.html': 'x' }, input });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.removed, 'no');
  });
}

test('引数で渡したエントリポイントのうち S3 にだけあるものを 2 行目に出す', async t => {
  const result = await run(t, {
    localFiles: { 'index.html': 'x' },
    input: listing(['index.html', 'sw.js', 'manifest.webmanifest', 'assets/old.js']),
    entrypoints: ['index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest'],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.removed, 'yes');
  assert.equal(result.removedEntrypoints, 'sw.js manifest.webmanifest');
});

test('S3 にしか無いものが無ければ 2 行目は空', async t => {
  const result = await run(t, {
    localFiles: { 'index.html': 'x' },
    input: listing(['index.html']),
    entrypoints: ['index.html', 'sw.js'],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.removed, 'no');
  assert.equal(result.removedEntrypoints, '');
});

// 「取得できていない」応答は空バケットに丸めず、原因の分かるメッセージで停止する。
for (const [name, input, pattern] of [
  ['配列が渡された', '[]', /JSON オブジェクトではありません/],
  ['壊れた JSON', 'not json', /JSON として解析できません/],
  ['Contents が配列でない', JSON.stringify({ Contents: 'x' }), /Contents が配列ではありません/],
  ['Key を持たない要素', JSON.stringify({ Contents: [{ Size: 1 }] }), /Key を持たない要素/],
  ['Key が文字列でない', JSON.stringify({ Contents: [{ Key: 42 }] }), /Key を持たない要素/],
]) {
  test(`不正な応答（${name}）は理由を示して停止する`, async t => {
    const result = await run(t, { localFiles: { 'index.html': 'x' }, input });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, pattern);
    assert.equal(result.stdout, '');
  });
}

test('マルチバイトのキーがチャンク境界で分割されても壊れない', async t => {
  // setEncoding が無いと chunk ごとに Buffer.toString() され、境界をまたぐ文字が
  // 置換文字になってローカルキーと一致しなくなる（削除扱い＝毎回 /* 無効化）。
  // 実データのサイズでは分割位置が非決定的なので、継続バイトの位置で意図的に
  // 2 回に分けて書き込み、境界跨ぎを必ず発生させる。
  const root = await mkdtemp(join(tmpdir(), 'quadmemo has-removed-split-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(join(root, 'dist'), { recursive: true });
  await copyFile(new URL('../../scripts/has-removed-assets.mjs', import.meta.url),
    join(root, 'scripts', 'has-removed-assets.mjs'));
  await writeFile(join(root, 'dist', 'あいうえお.js'), 'x');

  const buffer = Buffer.from(listing(['あいうえお.js']), 'utf8');
  const split = buffer.findIndex((byte, i) => i > 0 && (byte & 0xc0) === 0x80);
  assert.ok(split > 0, 'マルチバイト文字の継続バイトが必要');

  const child = spawn(process.execPath, [join(root, 'scripts', 'has-removed-assets.mjs')]);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.write(buffer.subarray(0, split));
  await new Promise(resolve => setTimeout(resolve, 50));
  child.stdin.end(buffer.subarray(split));
  const status = await new Promise(resolve => child.on('close', resolve));

  assert.equal(status, 0, stderr);
  assert.equal(stdout.split('\n')[0], 'no');
});

test('サブディレクトリのファイルは prefix 付きのキーとして比較する', async t => {
  const root = await mkdtemp(join(tmpdir(), 'quadmemo has-removed-sub-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(join(root, 'dist', 'sub'), { recursive: true });
  await writeFile(join(root, 'dist', 'sub', 'a.js'), 'x');
  await copyFile(new URL('../../scripts/has-removed-assets.mjs', import.meta.url),
    join(root, 'scripts', 'has-removed-assets.mjs'));
  // ディレクトリは再帰対象。中身のキーが prefix 付きで拾えることを確認する。
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'has-removed-assets.mjs')],
    { input: listing(['sub/a.js']), encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.split('\n')[0], 'no');
});
