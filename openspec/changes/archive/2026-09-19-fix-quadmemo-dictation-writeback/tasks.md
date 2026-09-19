## 1. コミット制御

- [x] 1.1 `src/hooks/__tests__/useCommitController.test.ts` に、書き戻し（コミット済み + 続き／コミット済みと同一／手動コミット後）と `reset` の単体テストを追加し、失敗することを確認する
- [x] 1.2 `src/hooks/useCommitController.ts` で表示テキストとコミット対象テキストを分け、コミット時点の表示テキストを記憶して先頭一致を除く。`reset` を追加する（design.md - D1）。`npx vitest run src/hooks` が通ることを確認

## 2. 入力バーの配線

- [x] 2.1 `src/components/__tests__/InputBar.test.tsx` に、バーを閉じて開き直す／blur／keydown／選択範囲を持つ `beforeinput` の後は先頭一致でも丸ごとコミットされること、選択範囲なしの `beforeinput` では残りだけコミットされることのテストを追加し、失敗することを確認する
- [x] 2.2 `src/components/InputBar.tsx` で `onBlur` / `onKeyDown` から `reset` を呼び、native の `beforeinput` で選択範囲があれば `reset` を呼ぶ（design.md - D2）。`npx vitest run src/components` が通ることを確認

## 3. E2Eテスト実装タスク(必須)

実装規約は `.claude/skills/e2e-conventions/SKILL.md` に従う。全テストに `@fix-quadmemo-dictation-writeback` と `@TP-NNN` を付与し、`tests/e2e/fix-quadmemo-dictation-writeback.spec.ts` へ実装する。新規 fixture は無い。

- [x] 3.1 `tests/e2e/fixtures/README.md` の `seed:empty-board` 行に本 change の TP-001〜TP-004 を追記する
- [x] 3.2 TP-001: 自動コミット後に同じテキストを `fill` しても チップが 1 つのままで入力欄が空になる（`@TP-001`、fixture `seed:empty-board`）
- [x] 3.3 TP-002: 「牛乳」の自動コミット後に「牛乳、卵」を `fill` すると Q4 が「牛乳」「卵」になる（`@TP-002`、fixture `seed:empty-board`）
- [x] 3.4 TP-003: 「卵」をコミットして閉じ、開き直して「卵焼き」をコミットすると Q4 が「卵」「卵焼き」になる（`@TP-003`、fixture `seed:empty-board`）
- [x] 3.5 TP-004: 自動コミット直後にキー入力で先頭一致する語を打って確定すると、その語がそのままチップになる（`@TP-004`、fixture `seed:empty-board`）
- [x] 3.6 修正前のコードで TP-001 / TP-002 が失敗することを確認する（`git stash` で実装だけ退避して実行）

## 4. 検証

- [x] 4.1 `npm test` / `npm run build` が通る
- [x] 4.2 `npx playwright test tests/e2e/fix-quadmemo-dictation-writeback.spec.ts tests/e2e/add-quadmemo-quadrant-ui.spec.ts --project=chromium --project=mobile-safari` が通る（既存の自動コミット／クローズ時コミットの観点を含む）
- [x] 4.3 実機（iPhone / 日本語ディクテーション）で「牛乳」→「卵」を入力し、チップが 牛乳・卵 の 2 つだけになること、ログ上 `COMMIT "牛乳"` → `COMMIT "、卵"` となることを確認する
