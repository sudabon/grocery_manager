## 1. 辞書編集画面

- [x] 1.1 `src/core/dictEntries.ts` に `sanitizeEntries(rawText)` を実装（行分割 → trim → 空行除去 → 正規化重複除去（先着優先））（design.md - D2）
- [x] 1.2 `src/core/__tests__/dictEntries.test.ts` を追加（空行・前後空白・正規化重複・先着優先・空入力）。`npm test` が全通過することを確認
- [x] 1.3 `src/pages/DictionariesPage.tsx` に Q1〜Q4 の切替（タブ）とラベル入力欄、単語リストのテキストエリア、保存ボタン、未保存インジケータを実装（design.md - D1）。ラベルとリストを編集できることを手動確認
- [x] 1.4 保存処理を実装（整形 → `dictionaries` ストアへ保存 → 正規化済みキャッシュ再構築。`memos` へは書き込まない）（design.md - D3）。保存後にメモ画面のラベルが変わることを手動確認
- [x] 1.5 運用ヘルプを表示（複合語は分割後の単位で登録する / 正規化して同じになる表記は 1 件に統合される）
- [x] 1.6 保存失敗時のエラー通知を実装（`add-quadmemo-classification` のトースト基盤を再利用）。保存失敗を注入した状態でエラーが出ることを手動確認
- [x] 1.7 メモ画面に「辞書未設定時の導線」を実装（4 象限すべてのエントリが空のときのみ表示し、辞書編集画面へ移動できる）。1 語登録で消えることを手動確認

## 2. 設定画面

- [x] 2.1 `src/pages/SettingsPage.tsx` に 4 設定のコントロールを実装（部分一致・重複許可・ヒント表示はトグル、自動コミット待機時間は `range`（500〜5000、step 100））。変更が即時保存されることを手動確認（design.md - D1・D7）
- [x] 2.2 スライダーは `change` で保存し、ドラッグ中（`input`）は保存しないことを実装（design.md - Risks）
- [x] 2.3 設定値のクランプを共通関数として実装し、UI とインポート経路の双方で通す。単体テストで範囲外入力が丸められることを確認
- [x] 2.4 `src/components/ConfirmDialog.tsx` を実装（`<dialog showModal>` ベース、破壊的操作の明示、非対応環境のフォールバックは `ChipActionSheet` と共通化）（design.md - D6）
- [x] 2.5 メモ全削除を実装（2 段階確認 → `memos` のみ削除。辞書・設定は変更しない）。中止経路で削除されないことを手動確認
- [x] 2.6 アプリ情報の表示を実装（ビルド時に埋め込んだバージョン（design.md - D8）、ストレージ永続化の要求結果、外部送信を行わない旨、定期バックアップ推奨）
- [x] 2.7 メモ画面のディクテーションヒントが `showDictationHint` 設定に追従することを実装・確認

## 3. エクスポート / インポート

- [x] 3.1 `src/core/portability.ts` に辞書エクスポート形式（`version` + 4 象限）と全データエクスポート形式（`app` / `schemaVersion` / `exportedAt` / `dictionaries` / `memos` / `settings`。仕様書 §8.3）の組み立てを実装
- [x] 3.2 同ファイルにインポート検証（型ガード）を実装（`schemaVersion` 判定、4 象限の存在と型、メモの必須フィールドと `quadrant` 値域、設定の型と範囲クランプ）（design.md - D4）
- [x] 3.3 `src/core/__tests__/portability.test.ts` を追加（正常・壊れた JSON・版数不一致・フィールド欠損・型不一致・象限値域外・設定範囲外のクランプ・メモ ID 衝突のスキップ）。`npm test` が全通過することを確認
- [x] 3.4 `src/db/repository.ts` に全データの一括読み出しと、単一トランザクションでの一括適用を追加（検証通過後にのみ適用、途中失敗でロールバック）。リポジトリ単体テストで確認
- [x] 3.5 エクスポートの受け渡しを実装（`navigator.canShare?.({ files })` が真なら `navigator.share`、偽なら `<a download>`。ユーザージェスチャ内で同期的に呼ぶ）（design.md - D5）
- [x] 3.6 辞書編集画面にエクスポート / インポートの導線を実装（インポートは検証失敗時にエラー表示のみで無変更）
- [x] 3.7 設定画面に全データのエクスポート / インポートの導線を実装（辞書・設定の上書きは `ConfirmDialog` で確認、メモは ID 衝突をスキップして追加）
- [x] 3.8 エクスポートファイル名（`quadmemo-export-<日付>.json` / `quadmemo-dictionaries-<日付>.json`）を実装し、単体テストで命名を確認

## E2Eテスト実装タスク(必須)

実装規約は `.claude/skills/e2e-conventions/SKILL.md` に従う（getByRole / getByLabel / getByText 優先、`page.locator()`・XPath 禁止、`waitForTimeout` 禁止、1 テスト = 1 検証意図）。すべてのテストに `@add-quadmemo-dictionaries` を付与する。

- [x] E1 fixture `seed:dict-all-empty`（4 象限すべてエントリ空・ラベルは初期値）を実装し `tests/e2e/fixtures/README.md` へ登録
- [x] E2 fixture `env:no-web-share`（`navigator.share` / `canShare` を無効化）を実装し README へ登録
- [x] E3 fixture `env:web-share-stub`（`navigator.share` / `canShare` をスタブし呼び出し内容を記録）を実装し README へ登録
- [x] E4 インポート用の固定ファイルを `tests/e2e/fixtures/files/` に追加（正常な辞書 JSON / 壊れた JSON / 版数不一致の全データ JSON / 既存 ID と衝突するメモを含む全データ JSON）し、README へ用途を登録
- [x] E5 `tests/e2e/pages/DictionariesPage.ts` を作成（象限タブ、ラベル入力、単語リスト、保存ボタン、ヘルプ、エクスポート / インポート導線のアクセサ）
- [x] E6 `tests/e2e/pages/SettingsPage.ts` を作成（各設定コントロール、メモ全削除、確認ダイアログ、アプリ情報、エクスポート / インポート導線のアクセサ）
- [x] E7 TP-001: ラベル変更がメモ画面へ反映される（tag: `@TP-001`）
- [x] E8 TP-002: 語の追加が次のコミットから分類に効く（tag: `@TP-002`）
- [x] E9 TP-003: 未保存の編集は分類に影響しない（tag: `@TP-003`）
- [x] E10 TP-004: 語の削除で分類されなくなる（tag: `@TP-004`）
- [x] E11 TP-005: 空行と前後空白が除去される（tag: `@TP-005`）
- [x] E12 TP-006: 正規化同一の語が 1 件に統合される（tag: `@TP-006`）
- [x] E13 TP-007: 辞書変更後も既存チップの象限が変わらない（tag: `@TP-007`）
- [x] E14 TP-008: 登録単位のヘルプが読める（tag: `@TP-008`）
- [x] E15 TP-009: 辞書全空で設定導線が表示され辞書編集へ移動できる（tag: `@TP-009`）
- [x] E16 TP-010: 1 語登録で導線が消える（tag: `@TP-010`）
- [x] E17 TP-011: 部分一致 ON の設定変更が分類に反映される（tag: `@TP-011`）
- [x] E18 TP-012: 待機時間の変更が自動コミットに反映される（tag: `@TP-012`）
- [x] E19 TP-013: 待機時間が範囲内に収まる（tag: `@TP-013`）
- [x] E20 TP-014: 重複許可 OFF の設定変更が反映される（tag: `@TP-014`）
- [x] E21 TP-015: ヒント表示 OFF でヒントが出ない（tag: `@TP-015`）
- [x] E22 TP-016: 設定が再読み込み後も保持される（tag: `@TP-016`）
- [x] E23 TP-017: 2 段階確認でメモが全削除され、ラベルと設定は変わらない（tag: `@TP-017`）
- [x] E24 TP-018: 確認中止でメモが削除されない（tag: `@TP-018`）
- [x] E25 TP-019: バージョンとストレージ永続化結果が表示される（tag: `@TP-019`）
- [x] E26 TP-020: プライバシー方針とバックアップ推奨が表示される（tag: `@TP-020`）
- [x] E27 TP-021: 辞書エクスポートで版数と 4 象限を含む JSON が得られる（tag: `@TP-021`）
- [x] E28 TP-022: 壊れた JSON のインポートで無変更・エラー表示（tag: `@TP-022`）
- [x] E29 TP-023: 正しい辞書 JSON のインポートで置き換わり分類に反映される（tag: `@TP-023`）
- [x] E30 TP-024: 全データのエクスポート → 全削除 → インポートで復元される（tag: `@TP-024`）
- [x] E31 TP-025: 版数不一致のインポートが拒否され無変更（tag: `@TP-025`）
- [x] E32 TP-026: ID 衝突メモが追加されない（tag: `@TP-026`）
- [x] E33 TP-027: 上書き確認の中止で無変更（tag: `@TP-027`）
- [x] E34 TP-028: 共有非対応環境でダウンロードとして受け取れる（tag: `@TP-028`）
- [x] E35 TP-029: 共有対応環境で共有が呼び出される（tag: `@TP-029`）
- [x] E36 TP-030: 保存ボタン連打でエントリが重複しない（tag: `@TP-030`）
- [x] E37 `npx playwright test --grep @add-quadmemo-dictionaries` を chromium / mobile-safari の両プロジェクトで実行し全件パス（フレーク 0 件）を確認
- [x] E38 既存タグ（`@add-quadmemo-quadrant-ui`、`@add-quadmemo-classification`）も併せて実行し回帰が無いことを確認
- [x] E39 `bash scripts/check-test-plan.sh` が通ることを確認

## 4. 実機手動検証（E2E 対象外の受け入れ）

- [ ] 4.1 iPhone 実機でエクスポートから共有シートが開き、ファイルアプリ等へ保存できることを確認
- [ ] 4.2 保存したファイルを iPhone 実機でインポートし、メモ・辞書・設定が復元されることを確認（仕様書 §15 の受け入れ基準）
- [ ] 4.3 設定画面のストレージ永続化結果が実機の状態を反映していることを確認
- [ ] 4.4 数千語規模の単語リストを保存し、保存操作の応答が実用範囲であることを確認
