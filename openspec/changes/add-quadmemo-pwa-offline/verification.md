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

## PR レビュー指摘対応後の再検証が必要な項目

2026-09-09、2 周目の修正時点の追記。上記の既存記録は実行当時の一次記録として保持する。

- 1 周目の `injectRegister` 削除により `registerSW.js` は出力されなくなった。今回の `npm run build` でも非出力を確認した。SW 登録は `virtual:pwa-register` を使う。
- アイコンは `public/icons/icon-192.png` / `icon-512.png` / `apple-touch-icon-180.png` の PNG 3 枚と生成元 `design/icon.svg`。512 px は any / maskable 共用。生成元 SVG は配信対象ではない。
- `no-cache` の対象は `index.html` / `sw.js` / `manifest.webmanifest` / `icons/icon-192.png` / `icons/icon-512.png` / `icons/apple-touch-icon-180.png` の計 6 パス。存在しない `/registerSW.js` の SPA フォールバック応答を合格の根拠にしない。
- 今回の依頼で共有された 1 周目修正後の実測値は `npm test` 153 件 / `test:scripts` 86 件 / pwa 16 件。今回の回帰テスト追加後の結果は下表に区別して記録する。

| 今回の検証 | 結果 |
|---|---|
| `npm run build` | 成功（`tsc --noEmit` を含む）。`sw.js` / `manifest.webmanifest` と PNG 3 枚を出力し、`registerSW.js` は非出力 |
| `npm run test` | 161 件成功（既存 153 件＋回帰テスト 8 件） |
| `npm run test:scripts` | 86 件成功 |
| `E2E_BASE_URL` / `E2E_PWA_BASE_URL` の 4 組み合わせ | dev / preview の個別起動制御、各 baseURL、preview の再利用禁止・180 秒 timeout を確認 |
| `npx playwright test --project=pwa --grep @add-quadmemo-pwa-offline` | 17 件を実行対象として検出（既存 16 件＋TP-007 の否定検証 1 件）。全件が Chromium 起動時の `bootstrap_check_in ... Permission denied (1100)` で失敗し、テスト本体に未到達。今回の成功実測値としては扱わず、ブラウザを起動できる環境で再実行が必要 |

構成が変わったため、上記のオフライン再読み込み時の `fromServiceWorker: true` 観測は現在の成果物に対して再実行が必要。
HTML / CSS / アプリ JS / Workbox Window JS を改めて観測し、現在は存在しない `registerSW.js` を対象に含めない。
実機受け入れ（tasks §6、6.1〜6.12）と配信後のヘッダー実測（4.2〜4.4）も現在の構成で実行する必要がある。今回これらを完了扱いにはしない。

R-01 の `git add design/icon.svg` は実行を試みたが、この環境の `.git` 書き込み制限により
`index.lock: Operation not permitted` で拒否された。SVG の内容は変更していないが未追跡のため、書き込み可能な環境で同コマンドを実行する必要がある。


## 2026-09-09 残存指摘その2（C-01〜C-02 / B-01〜B-23）

「その1」の適用済み作業ツリーへ反映。B-03 は既に適用済みの型制約を維持。
C-01 のテーマ色はコード変更せず D3-2 に記録。C-02 は hosting の delta spec / design と proposal に反映。
B-22 の複数タブのトレードオフは D7-2、B-23 の pendingWrites の副作用は dismissInstallHint のコメントに記録。

- `npm run build`: PASS（`tsc --noEmit` を含む）。precache 8 entries。
- B-08: `includeManifestIcons` の削除時は PNG 2件が重複して 10 entries となったため、指定の例外に従い `false` を維持し、重複防止のコメントに変更。
- `npm run test`: PASS（18 files / 171 tests）。追加した repository テスト2件は初回の入力辞書が空配列で形式検証に失敗したため、正規の4辞書へ修正し再実行。アサーションは維持。
- `npm run test:scripts`: PASS（91 tests）。B-19 の未実装 TP-ID 列挙、実行時タグ、別 change の混入防止、一覧取得エラーを含む。
- `bash scripts/check-test-plan.sh --change add-quadmemo-pwa-offline`: PASS（TP-ID 13/13）。通常の `--list` にはタグが出ないため、`--reporter=json` の実行時 tags を照合。
- `npx playwright test --project=pwa`: 環境制限で未検証。18件すべてが Chromium 起動時の `bootstrap_check_in ... Permission denied (1100)` / SIGTRAP で停止し、テスト本体へ未到達。B-18 のバナー2枚同時表示を含め、ブラウザ起動可能な環境で実行確認が必要。
- B-10: standalone 用 state / 購読を削除。保存失敗時にも案内を即時に閉じる「その1」の closed state は維持。
- B-11: `.git/index.lock` への書き込み制限で `git mv` が失敗したため、通常のファイル改名で UpdateBanner と対応テストへ変更。コミット・push は未実施。
- B-20: `.claude/skills/e2e-conventions/SKILL.md` の例外を追記済み。このファイルは既存の `.gitignore` の `.claude/` により追跡対象外。

既存の verification 記録は変更せず、本節のみ追記。検証意図は維持し、B-04 / B-15 / B-16 / B-17 の明示指定に従って検証方法を変更。
