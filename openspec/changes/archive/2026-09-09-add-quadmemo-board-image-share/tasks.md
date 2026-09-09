## 1. 共有ヘルパの一般化

- [x] 1.1 `src/core/shareExport.ts` に `shareFile(file)` を切り出し、既存 `shareExport` は JSON の `File` を組み立てて委譲する（design.md - D3）。`src/core/__tests__/shareExport.test.ts` が JSON 経路（共有・ダウンロード・AbortError 無視）で全通過することを確認
- [x] 1.2 `exportFileName` に `'board'` 種別を追加し、`quadmemo-board-<日付>.png` になることを単体テストで確認（design.md - D2）

## 2. ボード画像の組み立て

- [x] 2.1 象限ごとのラベルとチップ本文配列を返す純粋関数を追加し、視覚配置が左上 Q2・右上 Q1・左下 Q3・右下 Q4、追加順、空象限も含むことを単体テストで確認（design.md - D1・D5。spec の「ラベルと本文が画面と同じ象限配置」）
- [x] 2.2 レイアウトから `HTMLCanvasElement` へ描画し `toDataURL('image/png')` で同期的に `File` を返す関数を実装する（design.md - D2）。外部画像は描かない。生成結果の `type` が `image/png` であることを単体テストで確認
- [x] 2.3 メモ 0 件でも PNG が返り、エラーにならないことを単体テストで確認

## 3. メモ画面の導線

- [x] 3.1 メモ画面上部（ボード直上）に「画像で共有」ボタンを追加する。ヘッダー・マイクボタン・入力バーの位置は変えない（design.md - D4）。特定アプリ名をラベルに含めない
- [x] 3.2 クリックハンドラ内でストアの現状から PNG を同期生成し、`await` を挟まず `shareFile` を呼ぶ（design.md - D2）。失敗時は既存トーストで案内し、キャンセル（AbortError）は案内しない。チップが変わらないことを手動確認
- [x] 3.3 オフライン（機内モード相当）でもボタンから共有またはダウンロードに進めることを手元ブラウザで確認

## E2Eテスト実装タスク(必須)

実装規約は `.claude/skills/e2e-conventions/SKILL.md` に従う（getByRole / getByLabel / getByText 優先、`page.locator()`・XPath 禁止、`waitForTimeout` 禁止、1 テスト = 1 検証意図）。すべてのテストに `@add-quadmemo-board-image-share` を付与する。

- [x] E1 `tests/e2e/mocks/web-share.ts` が共有ファイルの `name` と `type` を記録するよう更新し、既存の JSON エクスポート E2E（`@add-quadmemo-dictionaries`）が回帰しないことを確認（design.md - D5）
- [x] E2 fixture `env:web-share-abort`（`navigator.share` が `AbortError` で拒否）を実装し `tests/e2e/fixtures/README.md` へ登録
- [x] E3 fixture `env:web-share-failure`（`navigator.share` が AbortError 以外で失敗）を実装し README へ登録
- [x] E4 `tests/e2e/pages/MemoBoardPage.ts` に「画像で共有」操作のアクセサを追加
- [x] E5 TP-001: メモ画面に「画像で共有」があり特定アプリ名を含まない（tag: `@TP-001`）
- [x] E6 TP-002: メモ 0 件で PNG 共有が呼ばれエラー案内が出ない（tag: `@TP-002`）
- [x] E7 TP-003: チップがある状態で `image/png` を含む共有が呼び出される（tag: `@TP-003`）
- [x] E8 TP-004: 共有無効時に PNG がダウンロードとして受け取れる（tag: `@TP-004`）
- [x] E9 TP-005: 共有キャンセルでエラー案内が出ずチップが変わらない（tag: `@TP-005`）
- [x] E10 TP-006: 画像共有後も各象限のチップが同一である（tag: `@TP-006`）
- [x] E11 TP-007: 受け渡し失敗で案内が出てチップが変わらない（tag: `@TP-007`）
- [x] E12 TP-008: オフライン（`pwa` プロジェクト）で PNG 共有が呼び出される（tag: `@TP-008`）
- [x] E13 `npx playwright test --grep @add-quadmemo-board-image-share` を実行し全件パス（フレーク 0 件）を確認。TP-008 は `pwa` プロジェクトで実行する
- [x] E14 既存タグ（`@add-quadmemo-quadrant-ui` / `@add-quadmemo-classification` / `@add-quadmemo-dictionaries` / `@add-quadmemo-pwa-offline`）の回帰が無いことを確認
- [x] E15 `bash scripts/check-test-plan.sh --change add-quadmemo-board-image-share` が通ることを確認

## 4. 実機確認

- [x] 4.1 iPhone 実機で「画像で共有」から共有シートが開き、LINE を選んで画像が送れることを確認
- [x] 4.2 送った画像で 4 象限のラベルとチップ本文が読めること、入力バーやヘッダーが写っていないことを確認
