import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// dist/ のキー一覧と、S3 の list-objects-v2 レスポンス(標準入力)を比較する。
// 呼び出し側は sync --delete より前に実行すること(変更前の一覧が必要)。
//
// 引数: 再検証が必要なエントリポイントのファイル名(省略可)
// 標準出力は 2 行:
//   1 行目 yes|no      … dist/ に無いオブジェクトが S3 に存在するか
//   2 行目 空白区切り  … 引数のうち S3 にあって dist/ に無いもの
const entrypoints = process.argv.slice(2);

function fail(message) {
  console.error(message);
  process.exit(1);
}

const localKeys = new Set();
async function collect(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const key = prefix + entry.name;
    if (entry.isDirectory()) {
      await collect(join(directory, entry.name), key + '/');
    } else if (entry.isFile()) {
      localKeys.add(key);
    } else {
      fail(`配信物には通常ファイルとディレクトリのみ使用できます: ${key}`);
    }
  }
}

await collect(fileURLToPath(new URL('../dist/', import.meta.url)));

// setEncoding が無いと Buffer が逐次 toString され、マルチバイトのキーが
// チャンク境界で分断されて壊れる。
process.stdin.setEncoding('utf8');
let input = '';
for await (const chunk of process.stdin) input += chunk;

// 呼び出し側は --query を通さない生のレスポンスを渡す。Contents キーの有無で
// 「オブジェクト 0 件」と「取得できていない」を区別するため。
// 空バケットの表現は AWS CLI の版によって「Contents を持たないオブジェクト」
// 「Contents: null」「出力そのものが空」のいずれにもなるので 3 形すべて受ける。
let response = {};
if (input.trim() !== '') {
  try {
    response = JSON.parse(input);
  } catch (err) {
    fail(`S3 のオブジェクト一覧を JSON として解析できません: ${err.message}`);
  }
}
if (response === null) response = {};
if (typeof response !== 'object' || Array.isArray(response)) {
  fail('S3 のオブジェクト一覧が JSON オブジェクトではありません（--query を通さない生の応答を渡してください）');
}

const contents = response.Contents ?? [];
if (!Array.isArray(contents)) {
  fail('S3 のオブジェクト一覧の Contents が配列ではありません');
}
const remoteKeys = contents.map(entry => (entry == null ? undefined : entry.Key));
if (remoteKeys.some(key => typeof key !== 'string')) {
  fail('S3 のオブジェクト一覧に Key を持たない要素があります');
}

// 末尾スラッシュのキーは S3 のディレクトリマーカー(コンソール操作等で作られる 0 バイト
// オブジェクト)で、ローカルの dist/ には決して現れない。除外しないと毎回 /* 無効化が走る。
const removed = remoteKeys.filter(key => !key.endsWith('/') && !localKeys.has(key));
console.log(removed.length > 0 ? 'yes' : 'no');
console.log(entrypoints.filter(name => removed.includes(name)).join(' '));
