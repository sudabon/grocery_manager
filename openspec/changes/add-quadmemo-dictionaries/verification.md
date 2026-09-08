# 検証記録（2026-09-08）

実装タスク 1〜3 と E1〜E39 を完了。実機受け入れ 4.1〜4.4 は未実施。

## 自動検証

| コマンド | 結果 |
|---|---|
| `npm run build` | TypeScript と Vite のビルド成功 |
| `npm test` | 14 ファイル、130 テスト成功 |
| `npx playwright test --grep @add-quadmemo-dictionaries --workers 4` | Chromium / mobile-safari 合計60件成功、フレーク0件 |
| `npx playwright test --grep '@add-quadmemo-quadrant-ui\|@add-quadmemo-classification' --workers 4` | 同2プロジェクト合計106件成功、フレーク0件 |
| `bash scripts/check-test-plan.sh` | コミット済み差分なしのため skip |
| `bash scripts/check-test-plan.sh --change add-quadmemo-dictionaries` | 作業ツリーの対象changeを検証、成功 |
| `openspec validate add-quadmemo-dictionaries --strict` | 成功 |
| `git diff --check` | 成功 |

最初の E2E 起動はサンドボックスのブラウザ起動制限で失敗。制限外で再実行した。
実装検証で発見した設定トグルの表示の戻りを修正し、確定時間テストでは時計を明示的に停止した。
上表は修正後の実行結果。期待値の緩和・削除は行っていない。

## ブラウザでの操作・目視確認

隔離した agent-browser セッション、localhost:3000、390×844 の画面で確認。

- ラベルを「企画」、単語リストを `orange / パン / ぱん` に編集。保存後に `orange / パン` となり、メモ画面の Q1 ラベルも「企画」へ変わる。
- `__QUADMEMO_FAIL_WRITES__` を注入し、辞書保存でエラートーストと未保存表示が残ることを確認。検証後にフラグを解除。
- 全象限の単語を空にすると辞書設定リンクが出現。そのリンクから編集して1語保存するとリンクが消える。
- 3設定のトグル変更と待機時間のキーボード操作（1500→1600ms）が再読み込み後も保持される。
- ヒントOFFでメモ入力バーを開いたときヒントが表示されない。
- テスト用メモの全削除で2段階目の「中止」はメモを保持。両段階を承認すると再読み込み後も0件、ラベルを保持。
- 設定画面と2段階目の確認ダイアログのスマートフォン幅での表示を画像で確認。

## 未実施の実機受け入れ

mobile-safari は Playwright の WebKit エミュレーションであり、iPhone の実共有シートや実ストレージ許可の確認を代替しない。

1. **4.1** iPhone で設定画面の「全データをエクスポート」をタップし、共有シートから「ファイルに保存」で JSON を保存する。
2. **4.2** 検証用メモ・独自ラベル・変更した設定を含むバックアップを作成し、メモ全削除後に保存した JSON をインポートする。上書き確認を承認し、メモ・辞書・設定の復元と再起動後の保持を確認する。
3. **4.3** 設定画面のストレージ永続化表示を実機の `navigator.storage.persist()` の結果と照合する。端末・iOS版・Safari/ホーム画面起動の別を記録する。
4. **4.4** 検証用辞書に数千語（例:5000語）を貼り付けて保存し、完了までの時間と操作感を記録する。

実機の結果を得るまでは tasks.md の4項目を未チェックとし、changeをアーカイブしない。
