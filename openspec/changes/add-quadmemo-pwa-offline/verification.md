# 実装・検証記録（2026-09-09）

## 実装済み

- コミット済み SVG / PNG 4 種（アイコンコミット `02d2fac`）。PNG の実寸・取得・マスカブルの安全領域を確認。
- manifest と Workbox precache、利用者操作による更新通知、ホーム画面追加の案内、IndexedDB の案内記録、設定の SW 状態。
- 全データインポートで端末固有の案内記録を保持し、エクスポートからは除外。
- 固定名のアイコン 5 ファイルも deploy.sh の no-cache 対象へ追加。ハッシュ付き資産は従来の immutable。
- preview / pwa プロジェクト、6 状態の fixture、TP-001〜013 に対応する 15 テスト、README の生成・検証・ロールバック手順。

## 成功した検証

| 検証 | 結果 |
|---|---|
| `npm ls --depth=0` | 依存解決成功。vite-plugin-pwa 1.3.0 |
| `npm run build` | 型検査成功。sw.js / registerSW.js / manifest.webmanifest とハッシュ付き資産を出力 |
| `npm test` | 149 件成功 |
| `npm run test:scripts` | 87 件成功 |
| 既存 3 change の E2E（Chromium / mobile-safari） | 166 件成功、フレーク 0 |
| 正式 `pwa` プロジェクト（Chromium + iPhone 13 表示条件） | 15 件成功、フレーク 0 |
| 全 4 change の E2E（chromium / mobile-safari / pwa） | 181 件成功、失敗・スキップ・フレーク 0。E19・E20 完了 |
| `bash scripts/check-test-plan.sh` | exit 0。ただしコミット済み change 差分がなく skip |
| `bash scripts/check-test-plan.sh --change add-quadmemo-pwa-offline` | 対象 change の作業ツリーを検査し成功 |
| `openspec validate add-quadmemo-pwa-offline --strict` | 成功 |
| `git diff --check` | 成功 |

Chromium DevTools Protocol の Network イベントでも、オフライン再読み込み時の HTML・CSS・
registerSW.js・アプリ JS・Workbox Window JS がすべて `fromServiceWorker: true`、status 200 と確認。
初回訪問からの外部 origin への要求は 0。メモ復元と更新バナー、未確定入力が残る画面を画像でも確認した。
更新バナー表示中に操作しても `performance.timeOrigin` は変化せず、入力途中のテキストも維持された。

## 設計 D6 の更新（2026-09-09 利用者承認）

[Playwright の公式 Service Workers ガイド](https://playwright.dev/docs/service-workers) は Chromium 系のみをサポート対象としている。
WebKit でのオフライン再読み込みの内部エラーを受け、利用者承認により正式な `pwa` プロジェクトを
iPhone 13 の表示・タッチ条件＋Chromium に変更した。設計 D6・test-plan・tasks・fixture 一覧・README も同期した。
既存の `mobile-safari` は WebKit を維持し、Safari 固有の SW・オフライン動作は既存の実機受け入れで確認する。

正式な設定で `npx playwright test --grep '@add-quadmemo-(quadrant-ui|classification|dictionaries|pwa-offline)'` を実行。
`test-results/e2e-results.json` の内訳は chromium 83 件、mobile-safari 83 件、pwa 15 件がすべて expected。
実行時のビルド・型チェックも成功した。進捗は 41/56 タスク完了。

## 未完了：本番配信と実機

この作業環境には `.env` がなく、AWS_PROFILE / TF_VAR_domain_name / QUADMEMO_TFSTATE_BUCKET / E2E_BASE_URL も未設定。
`terraform -chdir=infra output -json` は backend initialization required となる。
`setup-quadmemo-hosting` の実環境構築タスクも未完了のため、本番配信と curl によるヘッダー実測（4.2〜4.4）は未実施。
配信先を推測した AWS 操作は行っていない。

iPhone 実機を操作できないため 6.1〜6.12 は未実施。特に共有シート、音声入力、実キーボード、
機内モードでの起動とバックアップ、2 世代の更新適用をエミュレーション結果で完了扱いにしていない。
