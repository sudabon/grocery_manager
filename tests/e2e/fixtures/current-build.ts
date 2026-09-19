import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from './deployed-origin';

// 手元のビルド成果物のアプリシェル。CD はビルドからアップロードまでを一続きで行うため、
// 配信中のアプリシェルが参照するハッシュ付きアセットとこれが一致することを
// 「main の内容が配信に到達した」ことの観測とする（test-plan.md 前提）。
const distIndexPath = fileURLToPath(new URL('../../../dist/index.html', import.meta.url));

// Vite が assets/ に出す内容ハッシュ付きファイル（例: /assets/index-D2TD-pkZ.js）。
// エントリポイント（index.html / sw.js / manifest.webmanifest / icons/）はハッシュを持たず、
// no-cache で配信されるため対象外。
const HASHED_ASSET = /^\/assets\/[^/]+-[\w-]{8}\.\w+$/;

// アプリシェルの HTML から、参照しているハッシュ付きアセットのパスを重複なく昇順で返す。
// 配信側・手元側の両方に同じ抽出を適用して集合を比較する。
export function hashedAssetsOf(html: string): string[] {
  const paths = new Set<string>();
  for (const [, path] of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    if (HASHED_ASSET.test(path)) paths.add(path);
  }
  return [...paths].sort();
}

type CurrentBuildFixtures = {
  currentBuildAssets: string[];
};

export const test = base.extend<CurrentBuildFixtures>({
  // env:current-build — dist/index.html が無い・読めない場合はネットワークアクセス前に skip する。
  currentBuildAssets: async ({}, use) => {
    let html: string;
    try {
      html = await readFile(distIndexPath, 'utf8');
    } catch {
      base.skip(true, 'dist/index.html がありません。npm run build を実行してから再実行してください');
      return;
    }
    const assets = hashedAssetsOf(html);
    expect(assets, 'dist/index.html がハッシュ付きアセットを参照していません').not.toHaveLength(0);
    await use(assets);
  },
});

export { expect };
