## Context

現在ラベルは `Dictionary.label` として IndexedDB に保存され、`seedDictionaries()`（`src/db/defaults.ts`）が初期値を与える。読み出し側はボード（`src/components/Quadrant.tsx`）、共有画像（`src/core/boardImage.ts`）、辞書編集（`src/pages/DictionariesPage.tsx`）、チップ移動先（`src/components/ChipActionSheet.tsx`）で、いずれも辞書の保存ラベルを参照している。書き込み側は辞書編集画面の保存（`useAppStore.saveDictionary`）と辞書インポート（`src/core/portability.ts:25`）の 2 経路。

固定化の動機は proposal.md - Why を参照。既存端末には旧ラベル（仕事・家庭・買い物・その他）や利用者が変更した任意の文字列が保存済みなので、既定値の差し替えだけでは表示は変わらない。

## Goals / Non-Goals

**Goals:**

- 保存済みの値に関係なく、表示・共有画像・アクセシブル名のすべてで固定ラベルが出ること
- ラベルを書き換える経路（編集 UI・インポート）を無くし、固定であることを型と構造で担保すること
- 単語リスト（entries）の編集・エクスポート・インポートは現状のまま動くこと

**Non-Goals:**

- 象限の視覚配置（左上 Q2・右上 Q1・左下 Q3・右下 Q4）の変更。配置は `add-quadmemo-quadrant-ui` の決定を踏襲する
- ラベルの多言語化・利用者ごとの切り替え
- `Dictionary` レコードから `label` フィールドを物理削除する IndexedDB マイグレーション（D2 参照）

## Decisions

### D1: ラベルは保存値ではなくコード上の定数から解決する

`QUADRANT_LABELS: Record<QuadrantId, string>` を `src/db/defaults.ts` に置き、ボード・共有画像・辞書タブ・チップ操作シートの移動先をこの定数参照に差し替える。`seedDictionaries()` の `label` もこの定数から埋める。

代替として「既定値だけ新ラベルに変え、保存値を読み続ける」案は採らない。既存端末の保存値が旧ラベルのままなので表示が変わらず、`proposal.md` の要求（過去の保存値によっても変更されない）を満たせない。

もう一つの代替「起動時に IndexedDB のラベルを固定値へ書き戻すマイグレーション」も採らない。書き込みは失敗しうる（`storageAvailable` が false の端末がある）ため、書き込みの成否に表示が依存してしまう。読み出し時の解決なら保存層の状態に関わらず常に固定値になる。

### D2: `Dictionary.label` フィールドは残し、値を参照しないだけにする

スキーマから `label` を消すと IndexedDB のバージョン上げと既存レコードの書き換えが必要になり、D1 の「書き込みに依存しない」方針と衝突する。フィールドは残したまま、読み出し側が参照しないことで無効化する。

インポートでは `label` を省略可能とする。旧 JSON の `label` が存在する場合は文字列であることを検証するが、値は取り込まず `QUADRANT_LABELS` から埋める。`null`・数値・真偽値などは引き続き拒否する。これによりラベルを含む旧 JSON と、単語リストだけを持つ新 JSON の両方を受け付ける。共通の辞書検証を使う全データインポートでも同じ扱いとする。

### D3: 辞書エクスポートからラベルを外す

`dictionaryExport` の出力から象限ごとの `label` を除く。版数（`version: 1`）は据え置く。インポート側は D2 のとおりラベル省略を受け付けるため、出力 JSON をそのまま取り込んで単語リストを復元できる。

代替として版数を 2 に上げる案は採らない。ラベルは復元に使われなくなるだけで、単語リストの形式は変わらないため、版数の互換性判定を変える理由がない。

### D4: 辞書編集画面はラベル入力欄ごと削除する

`drafts` からラベル項目を落とし、`dirty` 判定と `saveDictionary` の引数も単語リストだけにする。`useAppStore.saveDictionary(quadrant, label, rawText)` から `label` を外し、`Dictionary` を組み立てる際にラベルは `QUADRANT_LABELS` から埋める。

`disabled` で残す案は採らない。読み取り専用の入力欄が残ると「なぜ変えられないのか」の説明が UI 側に必要になり、固定であるという意図が伝わりにくい。象限を選ぶタブ（`quadrant-tabs`）にラベルが表示されるようにし、どの象限を編集しているかが分かる。

### D5: 共有画像の `maxWidth` は保険として残す

`boardImage.ts` のラベル描画は `fillText(..., maxWidth)` で横方向に圧縮する。固定ラベルの最長は `ドラッグストア` の 7 文字（30px フォントで約 210px）。`肉類・乳製品` は 6 文字で、いずれも描画幅 431px に対して余裕があるため圧縮は起きない。それでもこの引数は残す。将来ラベルを変えたときにはみ出しが復活するのを防ぐ、コストゼロのガードである。

## Risks / Trade-offs

- **既存利用者の画面表示が予告なく変わる** → 本アプリは単一利用者向けで、ラベル変更は要望元の意図そのもの。リリースノートでの告知に留める
- **既存のエクスポート JSON からラベルが復元されなくなる** → 単語リストは復元されるため実害は小さい。D2 でラベルを含む JSON も受け付け続けるので、インポート自体が壊れることはない
- **E2E fixture `seed:dict-custom-labels` がラベルを差し替える前提で書かれている** → 当該 fixture は旧ラベルを無視する検証用に維持する。既存 E2E の表示期待値とラベル編集を使う準備処理を更新する必要がある（tasks.md で扱う）
- **単体テストがラベル文字列を期待値に持っている** → `boardImage.test.ts` は `仕事` / `家庭` / `買い物` / `その他` を、`portability.test.ts` は往復でラベル一致を検証している。いずれも新ラベルへの追随が必要

## Migration Plan

データ移行なし（D1・D2 により保存済みレコードを書き換えない）。ロールバックは `QUADRANT_LABELS` の参照を元の `?.label` へ戻し、ラベル入力欄を復帰させれば足りる。IndexedDB のレコード構造と JSON の版数は据え置く。新コードは旧 JSON を受け付けるが、ラベルなしの新しい辞書出力は旧コードでは受け付けられない。

### アーカイブ順序の制約

本 change の 3 つの delta はいずれも `MODIFIED Requirements` を含むため、アーカイブ時に本体 spec（`openspec/specs/<capability>/spec.md`）の存在を要求する。現時点で `openspec/specs/` は空で、対象の要求は未アーカイブの change の delta 内にしか無い（`openspec validate --strict` が 3 件の INFO でこれを報告する）。

したがって本 change をアーカイブする前に、要求の出どころとなる次の change をアーカイブしておく必要がある。

| 依存先 | 提供する capability |
|---|---|
| `add-quadmemo-quadrant-ui` | `memo-board` |
| `add-quadmemo-dictionaries` | `dictionary-management`, `data-portability` |

実装（apply）自体はこの順序に依存しないため、コードの変更は先行して進められる。制約がかかるのはアーカイブのタイミングだけである。
