#!/usr/bin/env node
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

const command = basename(process.argv[1]);
const args = process.argv.slice(2);
const config = JSON.parse(process.env.DEPLOY_MOCK_CONFIG);
appendFileSync(process.env.DEPLOY_MOCK_LOG, JSON.stringify({ command, args }) + '\n');

if (command === 'terraform') {
  const name = args.at(-1);
  if (name === 'app_bucket') console.log(config.bucket ?? 'quadmemo-app-123456789012');
  else if (name === 'cloudfront_distribution_id') console.log(config.distributionId ?? 'E123ABC');
  else throw new Error(`Unexpected Terraform output: ${name}`);
} else if (command === 'npm') {
  if (config.buildFails) process.exit(2);
  for (const [key, content] of Object.entries(config.files ?? { 'index.html': '<h1>QuadMemo</h1>' })) {
    const path = 'dist/' + key;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  // 通常ファイル以外の成果物（ディレクトリ）を再現する。
  for (const key of config.dirs ?? []) mkdirSync('dist/' + key, { recursive: true });
} else if (command === 'aws') {
  if (args[0] === 's3api' && args[1] === 'list-objects-v2') {
    // deploy.sh は --query を通さないので、生の ListObjectsV2 レスポンス相当を返す。
    // listShape で空バケットの 3 つの表現（Contents なし / Contents: null / 空出力）を
    // 切り替えられるようにし、実 CLI の版差を再現できるようにしている。
    if (config.malformedList) console.log('[]');
    else if (config.listShape === 'empty-output') process.stdout.write('');
    else if (config.listShape === 'null-response') console.log('null');
    else if (config.listShape === 'null-contents') console.log(JSON.stringify({ KeyCount: 0, Contents: null }));
    else if (config.emptyBucket) console.log(JSON.stringify({ KeyCount: 0 }));
    else {
      const keys = config.remoteKeys ?? [];
      console.log(JSON.stringify({ KeyCount: keys.length, Contents: keys.map(Key => ({ Key })) }));
    }
  } else if (args[0] === 's3' && ['sync', 'cp', 'rm'].includes(args[1])) {
    if (config.syncFails && args[1] === 'sync') process.exit(3);
  } else if (args[0] === 'cloudfront' && args[1] === 'create-invalidation') {
    console.log('INV123');
  } else if (args[0] === 'cloudfront' && args[1] === 'wait') {
    if (config.waitFails) process.exit(4);
  } else {
    throw new Error(`Unexpected AWS invocation: ${JSON.stringify(args)}`);
  }
} else {
  throw new Error(`Unexpected command: ${command}`);
}
