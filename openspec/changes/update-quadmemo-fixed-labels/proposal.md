## Why

象限ラベルは辞書編集画面から長さ無制限で自由入力でき、インポートでも任意の文字列に上書きされる。一方 `board-image-share` は共有画像のラベルを折り返しも切り詰めもせず描くため、長いラベルは横方向に圧縮されて判読不能になる（実測: 全角 14 文字で描画幅 431px を使い切り、100 文字では 1 グリフ約 4px）。同 spec は「各象限のラベルが読み取れる」ことを MUST にしているが、可変長のラベルを許す限りこれを構造的には満たせない。

本アプリの象限は買い物の売り場区分に固定して使われており、利用者がラベルを変える必要がない。ラベルを固定値にすれば、上限値の設計や圧縮の下限を議論せずに可読性の MUST を構造として満たせる。

## What Changes

- 象限ラベルの既定値を売り場区分へ変更する（**BREAKING**: 既存利用者の画面表示が変わる）
  - 左上 Q2 = `野菜` / 右上 Q1 = `それ以外` / 左下 Q3 = `肉類・乳製品` / 右下 Q4 = `ドラッグストア`
- 辞書編集画面から「象限ラベル」入力欄を削除し、ラベルを編集不可にする（**BREAKING**: 既存の編集導線が消える）
  - 単語リスト（entries）の編集・保存は変更しない
- 辞書インポートでラベルを無視し、固定値を保つ（**BREAKING**: 既存のエクスポート JSON を取り込んでもラベルは復元されない）
  - 単語リストのインポートは変更しない
- 既存データのラベルは、保存済みの値ではなく固定値を表示に使う（移行スクリプトではなく読み出し時の解決で揃える）

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `dictionary-management`: 編集できる項目からラベルを外す。ラベル変更がメモ画面へ反映される要求を削除し、ラベルは固定であることを要求に変える
- `data-portability`: 辞書のエクスポートにラベルを含める要求と、インポートでラベルが置き換わる要求を、ラベルは対象外という要求に変える
- `memo-board`: 各象限に表示するラベルが固定の売り場区分であることを要求に加える（4 象限とラベルが読み取れる要求自体は維持）

## Impact

- `src/db/defaults.ts`: `seedDictionaries` のラベル 4 件
- `src/pages/DictionariesPage.tsx`: ラベル入力欄・`drafts` のラベル項目・`dirty` 判定・`save()` の引数
- `src/store/useAppStore.ts`: `saveDictionary(quadrant, label, rawText)` のシグネチャからラベルを外す
- `src/core/portability.ts`: 辞書のエクスポート・インポートでのラベルの扱い（版数は据え置き。ラベルは受け取っても無視する）
- `src/components/Quadrant.tsx`: ラベルの解決元（保存値ではなく固定値）
- E2E: `add-quadmemo-dictionaries`（ラベル変更の観点）、`add-quadmemo-quadrant-ui`（ラベル表示）、`add-quadmemo-board-image-share`（画像内のラベル）、および `seed:dict-custom-labels` fixture がラベルを差し替えている前提
- `board-image-share` の未解決課題（長いラベルが判読不能）がこの change で解消する。`boardImage.ts` の `fillText` の `maxWidth` は保険として残す
