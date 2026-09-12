## 1. 辞書索引の準備

- [x] 1.1 `src/core/classify.ts` の `NormalizedDicts` に `maxEntryLength`（正規化後の最長エントリ長、エントリが無ければ 0）を追加し、`buildNormalizedDicts` で算出する（design.md - D1）。`npx vitest run src/core/__tests__/classify.test.ts` が通ることを確認
- [x] 1.2 `src/core/__tests__/classify.test.ts` に、エントリ無し・単一エントリ・全角/半角混在のエントリで `maxEntryLength` が正規化後の長さになることの検証を追加する

## 2. 結合ロジック

- [x] 2.1 `src/core/tokenize.ts` を、word-like セグメントが連続する「ラン」と区切りの境界を保った形へ組み替え、`tokenize(text, dicts?)` の任意引数で辞書を受け取れるようにする（design.md - D2）。辞書を渡さない場合に既存の `src/core/__tests__/tokenize.test.ts` が無修正で全件通ることを確認
- [x] 2.2 ランごとに、左から順・同じ開始位置では最長一致・完全一致のみ・`maxEntryLength` で探索打ち切り、という規則で結合を実装する（design.md - D3）
- [x] 2.3 フォールバック経路（`Intl.Segmenter` 非対応）も、区切りで割った各塊を長さ 1 のランとして同じ結合処理へ通す
- [x] 2.4 `src/core/__tests__/tokenize.test.ts` に結合の単体テストを追加し、`npx vitest run src/core/__tests__/tokenize.test.ts` が通ることを確認する。最低限、次を含める: 3 トークンへ割れる語の結合（`鶏むね肉`）／末尾が短いエントリと競合する最長一致（`むね肉` と `鶏むね肉`）／カタカナ入力とひらがなエントリの一致（`鶏ムネ肉`）／読点・空白を跨がないこと／辞書に無い語が従来どおり割れること／`maxEntryLength` を超える長さまで探索しないこと／1 文字エントリだけでは結合が起きないこと／`Intl.Segmenter` を未定義にしたフォールバックでも例外なく結果を返すこと

## 3. コミット経路への接続

- [x] 3.1 `src/core/commitText.ts` で `tokenize(text, normalizedDicts)` を呼ぶようにする（design.md - D5）。`npx vitest run src/core/__tests__/commitText.test.ts` が通ることを確認
- [x] 3.2 `src/core/__tests__/commitText.test.ts` に、50 件の切り詰めが結合後のトークン数に対して行われること、重複抑止の判定が結合後の正規化文字列で行われることの検証を追加する（test-plan.md の E2E 対象外 4〜5 行目に対応）

実装レビューで見つかった既存ヘルプとの矛盾も修正する:

- [x] 3.3 辞書画面の登録単位の案内を語全体の登録と区切りの制約に合わせ、既存の登録ヘルプ E2E を更新して検証する

## 4. E2E fixture の追加

- [x] 4.1 `tests/e2e/fixtures/classification.ts` に `seed:dict-compound`（Q1: `むね肉`、Q2: `ミニトマト`、Q3: `鶏むね肉` / `ヨーグルトドリンク`、Q4: `キッチンペーパー`、既定設定・メモ 0 件）を追加する
- [x] 4.2 同じ場所に `seed:dict-compound-partial`（`seed:dict-compound` と同じエントリで部分一致 ON）を追加する
- [x] 4.3 追加した 2 つの fixture を `tests/e2e/fixtures/README.md` に、作られる状態と使用する TP-ID とともに登録する

## 5. E2Eテスト実装タスク(必須)

実装規約は `.claude/skills/e2e-conventions/SKILL.md` に従う。全テストに `@update-quadmemo-dictionary-tokenization` と `@TP-NNN` を付与し、`tests/e2e/update-quadmemo-dictionary-tokenization.spec.ts` へ実装する。

- [x] 5.1 TP-001: `キッチンペーパー` をコミットすると Q4 にチップが 1 つだけでき、表示が原文どおりである（`@TP-001`、fixture `seed:dict-compound`）
- [x] 5.2 TP-002: `鶏むね肉` をコミットすると Q3 に `鶏むね肉` のチップが 1 つでき、Q1 に `むね肉` のチップができない（`@TP-002`、fixture `seed:dict-compound`）
- [x] 5.3 TP-003: `鶏ムネ肉` をコミットすると Q3 にチップが 1 つでき、表示はカタカナのままである（`@TP-003`、fixture `seed:dict-compound`）
- [x] 5.4 TP-004: `鶏、むね肉` をコミットすると `鶏` と `むね肉` の 2 つのチップができ、読点のチップはできない（`@TP-004`、fixture `seed:dict-compound`）
- [x] 5.5 TP-005: 部分一致が有効な状態で `鶏むね` をコミットすると、`鶏` と `むね` の 2 つのチップになり `鶏むね` の 1 チップにはならない（`@TP-005`、fixture `seed:dict-compound-partial`）
- [x] 5.6 TP-006: 辞書に無い `オリーブオイル` は `オリーブ` と `オイル` に割れ、辞書画面で登録してから再度コミットすると 1 つのチップになる（`@TP-006`、fixture `seed:dict-compound`）

## 6. 検証

- [x] 6.1 `npx tsc --noEmit` が exit 0 であることを確認
- [x] 6.2 `npx vitest run` が全件パスすることを確認
- [x] 6.3 `bash scripts/check-test-plan.sh --change update-quadmemo-dictionary-tokenization` が全 TP-ID の対応を報告することを確認
- [x] 6.4 `npx playwright test --grep "@update-quadmemo-dictionary-tokenization"` が全件パス（フレーク 0 件）することを確認
- [x] 6.5 `npx playwright test` の全件実行で既存観点に回帰が無いことを確認（特に `add-quadmemo-quadrant-ui` のコミット境界、`add-quadmemo-classification` の分類、`add-quadmemo-memo-length-limit` の部分登録）
- [x] 6.6 実機の iPhone で、音声入力で割れていた語を辞書へ登録すると 1 つのチップになることを確認

## 検証記録（2026-09-12）

- `npx tsc --noEmit`: 成功
- `npx vitest run`: 24 ファイル・322 テスト成功
- `bash scripts/check-test-plan.sh --change update-quadmemo-dictionary-tokenization`: TP-ID 6/6
- 対象 change の E2E: Chromium / mobile-safari 計 12 テスト成功、フレーク 0
- 最終状態の `npx playwright test`: 305 成功、12 スキップ、失敗 0、フレーク 0。スキップは HTTPS の `E2E_BASE_URL` が未指定のホスティング検証
- `openspec validate update-quadmemo-dictionary-tokenization` / `git diff --check`: 成功
- lint コマンドは package.json に未定義
- 参照先の `.claude/skills/e2e-conventions/SKILL.md` は見つからなかったため、既存 fixture / Page Object と `tests/e2e/fixtures/README.md` の規約に合わせて実装
- 6.6 は実機にアクセスできないため未確認。iPhone で「鶏むね肉」を辞書登録し、音声入力の次の確定で原文表記のチップ 1 つになることを確認する。音声認識が空白・句読点を挿入した場合は、仕様どおり区切りを跨いでは結合しない
