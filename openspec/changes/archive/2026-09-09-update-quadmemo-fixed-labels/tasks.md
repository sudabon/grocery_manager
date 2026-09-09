## 1. 固定ラベルの定義と読み出しの差し替え

- [x] 1.1 `src/db/defaults.ts` に `QUADRANT_LABELS: Record<QuadrantId, string>`（q1 `それ以外` / q2 `野菜` / q3 `肉類・乳製品` / q4 `ドラッグストア`）を追加し、`seedDictionaries()` の `label` をこの定数から埋める（design.md - D1）。`npx vitest run src/db` が通ることを確認
- [x] 1.2 `src/components/Quadrant.tsx:5` のラベル解決を保存値（`dictionaries.find(...)?.label ?? ''`）から `QUADRANT_LABELS[id]` に差し替え、`aria-label` と `<h2>` およびチップ操作シートの移動先が固定値になることを確認
- [x] 1.3 `src/core/boardImage.ts:18` の `boardImageLayout` を、辞書の保存値ではなく `QUADRANT_LABELS` からラベルを引く形に変える。`boardImageLayout` の引数から辞書を外せるかを併せて判断し、外す場合は呼び出し元（`src/pages/MemoPage.tsx`）も更新する
- [x] 1.4 `src/core/__tests__/boardImage.test.ts` の期待ラベル（`仕事` / `家庭` / `買い物` / `その他`）を新ラベルへ更新し、「辞書が欠けている象限もラベル空で描画対象に残す」テストが固定値前提で成り立つか見直す。`npx vitest run src/core/__tests__/boardImage.test.ts` が通ることを確認
- [x] 1.5 `boardImageLayout` が保存値に関係なく固定ラベルを返すことを検証する単体テストを 1 本追加する（test-plan.md の E2E 対象外 1 行目に対応）

## 2. 書き込み経路の削除

- [x] 2.1 `src/store/useAppStore.ts` の `saveDictionary(quadrant, label, rawText)` から `label` 引数を外し、`Dictionary` 組み立て時のラベルを `QUADRANT_LABELS` から埋める（design.md - D4）。`npx vitest run src/store` が通ることを確認
- [x] 2.2 `src/pages/DictionariesPage.tsx` からラベル入力欄（`:63-64`）を削除し、`drafts` のラベル項目・`dirty` 判定・`save()` の引数を単語リストだけにする。`npx tsc --noEmit` が通ることを確認
- [x] 2.3 `src/core/portability.ts:25` のインポートで `d.label` を取り込まず `QUADRANT_LABELS` から埋めるようにする。`label` は省略可能とし、存在する場合の文字列型チェックは維持する（design.md - D2）
- [x] 2.4 `src/core/portability.ts` の `dictionaryExport` の出力から象限ごとの `label` を除く。版数は `1` のまま据え置く（design.md - D3）
- [x] 2.5 `src/core/__tests__/portability.test.ts` の往復検証を、ラベルを含まないエクスポートとラベルを取り込まないインポートの形に更新する。ラベルを含む古い JSON を渡してもラベルが固定値のままであることを検証するケースを追加する
- [x] 2.6 `src/db/__tests__/repository.test.ts` で `Dictionary.label` フィールドが保存レコードに残ることを固定する（design.md - D2。test-plan.md の E2E 対象外 3 行目に対応）

## 3. E2E fixture の更新

- [x] 3.1 `tests/e2e/fixtures/README.md` の `seed:dict-custom-labels` の説明を「ラベルは差し替えるが表示には使われない（固定ラベルの検証に使う）」旨へ更新し、本 change の TP-ID を追記する
- [x] 3.2 `tests/e2e/fixtures/classification.ts` の `seed:dict-custom-labels` がラベルを差し替える定義をそのまま維持することを確認する（TP-002 / TP-008 がこの状態を必要とする）
- [x] 3.3 既存 E2E で意味を失う観点を整理する。`add-quadmemo-dictionaries` の「象限ラベルを変更するとメモ画面に反映される」（TP-001）を削除し、その change の test-plan.md からも該当行を外す。`bash scripts/check-test-plan.sh --change add-quadmemo-dictionaries` が通ることを確認

## 4. E2Eテスト実装タスク(必須)

実装規約は `.claude/skills/e2e-conventions/SKILL.md` に従う。全テストに `@update-quadmemo-fixed-labels` と `@TP-NNN` を付与する。

- [x] 4.1 TP-001: メモ画面を開くと 4 象限が等分割で表示され、左上 `野菜` / 右上 `それ以外` / 左下 `肉類・乳製品` / 右下 `ドラッグストア` が読み取れる（`@update-quadmemo-fixed-labels` `@TP-001`、fixture `seed:dict-basic`）
- [x] 4.2 TP-002: 固定値と異なるラベルが保存された状態でメモ画面を開くと固定値が表示され、保存されていた値（企画・暮らし・食品・保留）が現れない（`@TP-002`、fixture `seed:dict-custom-labels`）
- [x] 4.3 TP-003: 辞書編集画面に単語リストの入力手段はあり、象限ラベルを変更する入力手段が存在しない（`@TP-003`、fixture `seed:dict-basic`）
- [x] 4.4 TP-004: 辞書に語を追加して保存しコミットすると、その象限へ自動分類される（`@TP-004`、fixture `seed:dict-basic`）
- [x] 4.5 TP-005: 保存せずにメモ画面へ戻ってコミットすると未マッチとして Q4 へ配置される（`@TP-005`、fixture `seed:dict-basic`）
- [x] 4.6 TP-006: 辞書から語を削除して保存しコミットすると未マッチとして Q4 へ配置される（`@TP-006`、fixture `seed:dict-basic`）
- [x] 4.7 TP-007: 辞書エクスポートで版数と 4 象限の単語リストを含み、象限ラベルを含まない JSON が受け取れる（`@TP-007`、fixture `seed:dict-basic` + `env:web-share-stub`）
- [x] 4.8 TP-008: 象限ラベルを含む辞書 JSON をインポートすると単語リストだけが置き換わり、メモ画面のラベルは固定値のままである（`@TP-008`、fixture `seed:dict-custom-labels` + `files/dictionaries.json`）
- [x] 4.9 TP-009: 壊れた JSON をインポートするとエラーが表示され、辞書の内容が変更前のままである（`@TP-009`、fixture `seed:dict-basic` + `files/broken.json`）
- [x] 4.10 TP-010: 正しい辞書 JSON のインポートで 4 象限の単語リストが置き換わり、以後のコミットの分類に反映される（`@TP-010`、fixture `seed:dict-basic` + `files/dictionaries.json`）
- [x] 4.11 TP-011: ある象限のチップが表示領域を超えると、その象限内だけが縦スクロールし、他の象限とボード全体の位置は変わらない（`@TP-011`、fixture `seed:dict-basic`）

## 5. 検証

- [x] 5.1 `npx tsc --noEmit` が exit 0 であることを確認
- [x] 5.2 `npx vitest run` が全件パスすることを確認
- [x] 5.3 `bash scripts/check-test-plan.sh --change update-quadmemo-fixed-labels` が全 TP-ID の対応を報告することを確認
- [x] 5.4 `npx playwright test --grep "@update-quadmemo-fixed-labels"` が全件パス（フレーク 0 件）することを確認
- [x] 5.5 `npx playwright test` の全件実行で、既存 change の観点に回帰が無いことを確認（特に `add-quadmemo-dictionaries` と `add-quadmemo-board-image-share`）
- [x] 5.6 実機の iPhone で、メモ画面と共有画像の 4 象限ラベルが `肉類・乳製品` を含めて折り返しも圧縮もなく読めることを確認
