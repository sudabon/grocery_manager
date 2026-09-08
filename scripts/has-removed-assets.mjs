import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// S3 の全キーとビルド成果物を比較する。変更前の一覧なので削除後も判定できる。
const localKeys = new Set();
async function collect(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const key = prefix + entry.name;
    if (entry.isDirectory()) {
      await collect(join(directory, entry.name), key + '/');
    } else if (entry.isFile()) {
      localKeys.add(key);
    } else {
      throw new Error(`配信物には通常ファイルとディレクトリのみ使用できます: ${key}`);
    }
  }
}

await collect(fileURLToPath(new URL('../dist/', import.meta.url)));
let input = '';
for await (const chunk of process.stdin) input += chunk;
const remoteKeys = JSON.parse(input) ?? [];
if (!Array.isArray(remoteKeys) || remoteKeys.some(key => typeof key !== 'string')) {
  throw new Error('S3 のキー一覧が不正です');
}
console.log(remoteKeys.some(key => !localKeys.has(key)) ? 'yes' : 'no');
