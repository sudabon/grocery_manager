## 1. キーボード追従フック

- [x] 1.1 `src/hooks/__tests__/useVisualViewport.test.tsx` を書き直し、`--keyboard-inset` の公開（縮小・スクロール・復帰・購読解除・`active=false`・`visualViewport` 未対応）が失敗することを確認する
- [x] 1.2 `src/hooks/useVisualViewport.ts` を `useVisualViewport(active)` に変更し、レイアウト下端と視覚ビューポート下端の差を `--keyboard-inset` として html に公開する。`transform` の付与を廃止する（design.md - D3）。`npx vitest run src/hooks` が通ることを確認

## 2. 入力バーとレイアウト

- [x] 2.1 `src/components/__tests__/InputBar.test.tsx` に、閉じている間は `collapsed` が付き開くと外れること、開いている間だけ `--keyboard-inset` が公開されることのテストを追加し、失敗することを確認する
- [x] 2.2 `src/components/InputBar.tsx` で `collapsed` クラスを `open` に応じて付け、`useVisualViewport(open)` を呼ぶ（design.md - D2）。`npx vitest run src/components` が通ることを確認
- [x] 2.3 `src/styles.css` で `.memo-page` の下パディングを `var(--keyboard-inset, 0px)` に、`.input-dock` をフロー内（`position: relative; flex: none`）に、`.input-bar.collapsed` を追加し、持ち上がっている間はセーフエリア分の下余白を付けない（design.md - D1 / D2 / D3）

## 3. E2Eテスト実装タスク(必須)

全テストに `@fix-quadmemo-input-dock-layout` と `@TP-NNN` を付与し、`tests/e2e/fix-quadmemo-input-dock-layout.spec.ts` へ実装する。新規 fixture は無い。

- [x] 3.1 `tests/e2e/fixtures/README.md` の `seed:empty-board` 行に本 change の TP-001〜TP-004 を追記する
- [x] 3.2 TP-001: 入力バーを閉じた状態でドックの高さがマイク + 24px 以下、ボードの下端 == ドックの上端（`@TP-001`、fixture `seed:empty-board`）
- [x] 3.3 TP-002: 入力バーを開いた状態で入力欄がドック内、ボードの下端 == ドックの上端（`@TP-002`、fixture `seed:empty-board`）
- [x] 3.4 TP-003: 50 件のチップで Q4 を末尾までスクロールし、末尾チップの下端 ≤ Q4 の下端（`@TP-003`、fixture `seed:empty-board`）
- [x] 3.5 TP-004: `--keyboard-inset: 200px` でドックの下端が 200px 上がり、ボードの下端 == ドックの上端（`@TP-004`、fixture `seed:empty-board`）
- [x] 3.6 修正前のコードで TP-001 / TP-002 / TP-004 が失敗することを確認する（`git stash` で実装だけ退避して mobile-safari で実行。TP-003 は修正前のエミュレーションでも通る = 実機でのみ再現する観点）

## 4. 検証

- [x] 4.1 `npm test` / `npm run build` が通る
- [x] 4.2 `npx playwright test --project=chromium --project=mobile-safari` が通る（既存のマイクサイズ・象限独立スクロール・入力バー開閉を含む）
- [x] 4.3 Chrome DevTools（390×664 mobile）で実測: 閉じた状態のドック 88px、ボード下端 == ドック上端、開いた状態も一致、`--keyboard-inset: 300px` でドックが 300px 上がりボードが縮む
- [ ] 4.4 実機（iPhone / PWA）で確認: 閉じた状態でボードの下端がマイクの帯に隠れない／キーボード表示中に入力バーがキーボードの上にあり、ボードが縮んで象限のスクロールで末尾チップまで見える／閉じた状態でマイクがホームバーに被らない
