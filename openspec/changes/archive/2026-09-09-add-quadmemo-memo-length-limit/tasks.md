## 1. 上限の定義と数え方

- [x] 1.1 `src/core/quadrantLength.ts` に `QUADRANT_TEXT_LIMIT = 100` と純粋関数 `quadrantLength(chips, quadrant)`（象限のチップ本文を `'\n'` で連結した長さ）、および残り容量を返す `quadrantRemaining(chips, quadrant)` を追加する（design.md - D1）
- [x] 1.2 `src/core/__tests__/quadrantLength.test.ts` を追加し、ちょうど 100 文字・101 文字の境界、チップ 0 個・1 個、改行を含む本文、他象限のチップを数えないことを検証する（test-plan.md の E2E 対象外 1 行目に対応）

## 2. 書き込み経路への上限判定

- [x] 2.1 `src/store/useAppStore.ts` の `addChips` で、象限ごとの残り容量に収まるチップだけを追加し、絞った件数を呼び出し元へ返す。`npx vitest run src/store` が通ることを確認
- [x] 2.2 `src/store/useAppStore.ts` の `editChip` で、編集後の本文が移動先（同一象限）の上限を超える場合は状態を変えず false 相当を返す
- [x] 2.3 `src/store/useAppStore.ts` の `moveChip` で、移動先の象限が上限を超える場合は移動せず false 相当を返す
- [x] 2.4 `src/store/useAppStore.ts` の `importData` と repository のインポートへ統合後の100文字上限判定を追加し、超過時の全ストア無変更・ID重複除外・同時操作をテストで固定する（design.md - D2）
- [x] 2.5 `src/core/commitText.ts` で、50 件の切り詰めのあとに象限ごとの残り容量でさらに絞り、絞られた場合は既存の部分登録通知に合流させる。1 件も入らなかった場合は上限に達している旨の別文言を通知する（design.md - D3）
- [x] 2.6 `src/core/__tests__/commitText.test.ts` に、50 件上限と文字数上限の絞り込み順序を固定するテストを追加する（test-plan.md の E2E 対象外 2 行目に対応）

## 3. 拒否時の案内と残り容量の提示

- [x] 3.1 `src/components/ChipActionSheet.tsx` で、編集・移動が拒否されたとき（2.2 / 2.3 の戻り値が false）に上限の通知を出す
- [x] 3.2 `src/components/Quadrant.tsx` の見出しに残り文字数を出す（design.md - D5）。既存の件数バッジ（`chip-count`）を置き換えるか併記するかを決め、`add-quadmemo-quadrant-ui` に件数バッジの E2E 観点がある場合は追随する
- [x] 3.3 `src/pages/__tests__/MemoPage.test.tsx` または `Quadrant` のコンポーネントテストで、残り容量が読み取れることを検証する

## 4. 共有画像への影響の固定

- [x] 4.1 `src/core/__tests__/boardImage.test.ts` に、上限いっぱい（1 文字チップ 50 個 × 4 象限）のレイアウトで canvas 高さが 8,266px・面積が iOS 上限（16,777,216 px）以内に収まることを検証するテストを追加する（design.md - D4。test-plan.md の E2E 対象外 6 行目に対応）

## 5. E2E fixture の追加

- [x] 5.1 `tests/e2e/fixtures/classification.ts`（または適切な fixture ファイル）に `seed:quadrant-at-limit`（ある象限の連結長がちょうど 100 文字）を追加する
- [x] 5.2 同じ場所に `seed:quadrant-near-limit`（ある象限の残り容量が数文字）を追加する
- [x] 5.3 `tests/e2e/fixtures/files/over-limit.json`（ある象限の連結長が 100 文字を超える全データ JSON）を追加する
- [x] 5.4 追加した 3 つの fixture を `tests/e2e/fixtures/README.md` に、作られる状態と使用する TP-ID とともに登録する

## 6. E2Eテスト実装タスク(必須)

実装規約は `.claude/skills/e2e-conventions/SKILL.md` に従う。全テストに `@add-quadmemo-memo-length-limit` と `@TP-NNN` を付与する。

- [x] 6.1 TP-001: 残り容量を超える量をコミットすると、収まる分だけ追加され一部のみ登録の通知が出る（`@TP-001`、fixture `seed:quadrant-near-limit`）
- [x] 6.2 TP-002: 上限に達した象限へコミットするとチップが追加されず、上限の通知が出る（`@TP-002`、fixture `seed:quadrant-at-limit`）
- [x] 6.3 TP-003: 上限を超える編集は適用されず本文が変わらない（`@TP-003`、fixture `seed:quadrant-near-limit`）
- [x] 6.4 TP-004: 上限に達した象限へは移動できず、チップが元の象限に留まる（`@TP-004`、fixture `seed:quadrant-at-limit`）
- [x] 6.5 TP-005: 上限に達した象限がある状態でも、別の象限へは追加される（`@TP-005`、fixture `seed:quadrant-at-limit`）
- [x] 6.6 TP-006: 入力バーを開くと各象限の残り容量が読み取れる（`@TP-006`、fixture `seed:quadrant-near-limit`）
- [x] 6.7 TP-007: 空文字・記号のみのコミットではチップも通知も出ない（`@TP-007`、fixture `seed:dict-basic`）
- [x] 6.8 TP-008: 50 件を超えるトークンの投入で、上限に収まる分だけ追加され一部のみ登録の通知が出る（`@TP-008`、fixture `seed:dict-basic`）
- [x] 6.9 TP-009: 上限に余裕がある象限へチップを移動できる（`@TP-009`、fixture `seed:memos-across-quadrants`）
- [x] 6.10 TP-010: 上限に収まる長さへの編集が反映される（`@TP-010`、fixture `seed:memos-across-quadrants`）
- [x] 6.11 TP-011: ファイル単体または既存メモとの統合で上限を超えるインポートは拒否され、メモ・辞書・設定が無変更である（`@TP-011`、fixture `seed:dict-basic` + `files/over-limit.json`）
- [x] 6.12 TP-012: 全データのエクスポートと復元が上限導入後も従来どおり動く（`@TP-012`、fixture `seed:memos-across-quadrants` + `env:web-share-stub`）

## 7. 検証

- [x] 7.1 `npx tsc --noEmit` が exit 0 であることを確認
- [x] 7.2 `npx vitest run` が全件パスすることを確認
- [x] 7.3 `bash scripts/check-test-plan.sh --change add-quadmemo-memo-length-limit` が全 TP-ID の対応を報告することを確認
- [x] 7.4 `npx playwright test --grep "@add-quadmemo-memo-length-limit"` が全件パス（フレーク 0 件）することを確認
- [x] 7.5 `npx playwright test` の全件実行で既存観点に回帰が無いことを確認（特に `add-quadmemo-quadrant-ui` のコミット境界とチップ操作、`add-quadmemo-dictionaries` のインポート）
- [x] 7.6 実機の iPhone で、上限いっぱいの象限を含むボードから共有画像を生成でき、エラー案内が出ないことを確認
