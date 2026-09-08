## 1. アイコンとマニフェスト

- [ ] 1.1 `public/icons/icon.svg`（生成元）を追加し、`icon-192.png` / `icon-512.png` / `maskable-512.png` / `apple-touch-icon-180.png` を生成してコミット。各ファイルのサイズが宣言どおりであることを確認（design.md - D3）
- [ ] 1.2 マスカブルアイコンのモチーフが中央 80% のセーフゾーンに収まっていることを目視確認
- [ ] 1.3 `index.html` に `apple-touch-icon`（180px）と `theme-color` を追加し、ブラウザで参照が解決することを確認
- [ ] 1.4 `README.md` にアイコンの生成コマンド（ローカルツール使用・ビルド依存にしない）を記載

## 2. Service Worker と PWA 化

- [ ] 2.1 `vite-plugin-pwa` を dev 依存に追加し、`npm ls --depth=0` で解決できることを確認
- [ ] 2.2 `vite.config.ts` に `VitePWA` を設定（`registerType: 'prompt'`、manifest（`name` / `short_name` / `display: standalone` / `orientation: portrait` / `start_url: '/'` / `scope: '/'` / `theme_color` / `background_color` / 3 種のアイコン）、precache 対象は HTML・JS・CSS・アイコン、ランタイムキャッシュなし）（仕様書 §9.1・design.md - D1）
- [ ] 2.3 `npm run build` を実行し、`dist/` に `sw.js` / `registerSW.js` / `manifest.webmanifest` が出力されることを確認
- [ ] 2.4 `npm run preview` でビルド成果物を配信し、Service Worker が登録されること・2 回目の読み込みがキャッシュから配信されることを DevTools で確認
- [ ] 2.5 外部ホストへの資産要求が 0 件であること（システムフォントのみ使用）を DevTools のネットワークタブで確認

## 3. 更新導線とインストール導線

- [ ] 3.1 `src/pwa/registerSW.ts` を実装（`subscribeUpdates(onNeedRefresh)` と `update()` を公開する薄い層）（design.md - D2）。ユニットテストでコールバック購読と更新実行の呼び出しを確認
- [ ] 3.2 `src/components/UpdateToast.tsx` を実装（画面上部に「新しいバージョンがあります [更新]」を表示し、消えないバナーとして維持。更新操作で `update()` を呼ぶ）
- [ ] 3.3 更新操作なしでは表示中のバージョンが切り替わらないこと（入力途中のテキストが失われないこと）を手動確認
- [ ] 3.4 `src/components/InstallHintBanner.tsx` を実装（`matchMedia('(display-mode: standalone)')` と `navigator.standalone` で standalone 判定し、ブラウザ表示かつ未案内のときのみ表示）（design.md - D4）
- [ ] 3.5 案内の「表示済み」フラグを `settings` レコードの内部項目として保存し、再訪時に再表示されないことを確認。保存不可環境では毎回表示される挙動を許容する旨をコメントに残す
- [ ] 3.6 `src/pages/SettingsPage.tsx` のアプリ情報欄に Service Worker の状態（登録済み / 更新待機中 / 未登録）を追加（design.md - D5）

## 4. 配信とキャッシュ制御の確認

- [ ] 4.1 `npm run build` の実出力ファイル名と `scripts/deploy.sh` の除外リスト（`index.html` / `sw.js` / `registerSW.js` / `manifest.webmanifest`）を突き合わせ、差異があれば除外リストを修正（design.md - D8）
- [ ] 4.2 `./scripts/deploy.sh` を実行し、`curl -sI https://<配信サブドメイン>/sw.js` が `cache-control: no-cache` を返すことを確認（最重要）
- [ ] 4.3 `curl -sI https://<配信サブドメイン>/manifest.webmanifest` と `/registerSW.js` も `no-cache` であることを確認
- [ ] 4.4 ハッシュ付きアセットが `public, max-age=31536000, immutable` で配信されていることを `curl -sI` で確認（`setup-quadmemo-hosting` test-plan で委譲された観点）
- [ ] 4.5 `README.md` に Service Worker のロールバック手順（旧成果物での再デプロイ、SW 撤去時は空 SW を配る）を記載（design.md - Migration Plan）

## 5. E2E 実行環境の拡張

- [ ] 5.1 `playwright.config.ts` の `webServer` を配列化し、preview サーバー（`npm run build && npm run preview -- --port 3001`、ポート 3001）を追加。`E2E_BASE_URL` 設定時はいずれも起動しないことを確認（design.md - D6）
- [ ] 5.2 `pwa` プロジェクト（iPhone デバイスプリセット、`baseURL` はポート 3001）を追加し、`npx playwright test --list` に表示されることを確認
- [ ] 5.3 Service Worker の登録完了を待つための観測可能な状態（「オフライン利用可」を表す表示）をアプリに実装し、E2E から待てることを確認（`waitForTimeout` を使わないため）

## E2Eテスト実装タスク(必須)

実装規約は `.claude/skills/e2e-conventions/SKILL.md` に従う（getByRole / getByLabel / getByText 優先、`page.locator()`・XPath 禁止、`waitForTimeout` 禁止、1 テスト = 1 検証意図）。すべてのテストに `@add-quadmemo-pwa-offline` を付与し、`pwa` プロジェクトで実行する。

- [ ] E1 fixture `env:built-app`（preview サーバーのアプリを開き、Service Worker 登録完了まで待つ）を実装し `tests/e2e/fixtures/README.md` へ登録
- [ ] E2 fixture `env:built-app-offline`（`env:built-app` の後にコンテキストをオフラインへ切り替える）を実装し README へ登録
- [ ] E3 fixture `env:built-app-offline-first-visit`（キャッシュ無しでオフラインのまま開く）を実装し README へ登録
- [ ] E4 fixture `env:sw-update-available`（更新イベントを注入し更新待機状態を作る）を実装し README へ登録
- [ ] E5 fixture `env:display-mode-browser` / `env:display-mode-standalone`（`matchMedia` と `navigator.standalone` を上書きして表示モードを固定）を実装し README へ登録
- [ ] E6 TP-001: マニフェストが standalone・スコープ・3 種アイコンを宣言している（tag: `@TP-001`）
- [ ] E7 TP-002: マニフェストのアイコンと iOS 用アイコンが取得でき宣言どおりのサイズである（tag: `@TP-002`）
- [ ] E8 TP-003: オフラインで再読み込みしても起動しチップが復元される（tag: `@TP-003`）
- [ ] E9 TP-004: オフラインでコミット・移動・編集・削除ができ再読み込み後も保持される（tag: `@TP-004`）
- [ ] E10 TP-005: オフラインで辞書編集・設定画面へ遷移し編集できる（tag: `@TP-005`）
- [ ] E11 TP-006: オフラインでレイアウトが崩れず外部ホストへの要求が 0 件（tag: `@TP-006`）
- [ ] E12 TP-007: 更新待機状態で更新通知と更新導線が表示される（tag: `@TP-007`）
- [ ] E13 TP-008: 更新せずに操作を続けても表示と入力が維持される（tag: `@TP-008`）
- [ ] E14 TP-009: ブラウザ表示でホーム画面追加の案内が表示される（tag: `@TP-009`）
- [ ] E15 TP-010: 案内を閉じた後は再表示されない（tag: `@TP-010`）
- [ ] E16 TP-011: standalone では案内が表示されない（tag: `@TP-011`）
- [ ] E17 TP-012: 設定画面で Service Worker の状態が読める（tag: `@TP-012`）
- [ ] E18 TP-013: キャッシュ無しのオフライン初回訪問ではアプリシェルが未キャッシュであることを確認（tag: `@TP-013`）
- [ ] E19 `npx playwright test --grep @add-quadmemo-pwa-offline` を `pwa` プロジェクトで実行し全件パス（フレーク 0 件）を確認
- [ ] E20 全タグのテスト（`@add-quadmemo-quadrant-ui` / `@add-quadmemo-classification` / `@add-quadmemo-dictionaries` / `@add-quadmemo-pwa-offline`）を実行し回帰が無いことを確認
- [ ] E21 `bash scripts/check-test-plan.sh` が通ることを確認

## 6. 実機受け入れ検証（仕様書 §15）

- [ ] 6.1 iPhone 実機で共有ボタン →「ホーム画面に追加」でインストールでき、アイコンとアプリ名が正しいことを確認
- [ ] 6.2 ホーム画面から起動し、ブラウザ UI なしの全画面（standalone）で表示されることを確認
- [ ] 6.3 機内モードで起動し、全機能（コミット・分類・チップ操作・辞書編集・設定・エクスポート）が動作することを確認
- [ ] 6.4 🎤ボタン → キーボードのマイクキー → 発話で、単語が正しい象限に配置されることを確認
- [ ] 6.5 カタカナ/ひらがな・全角/半角のゆらぎがある発話結果でもマッチすることを確認
- [ ] 6.6 連続発話（コミット後にフォーカス再タップなし）ができることを確認
- [ ] 6.7 キーボード出現時に入力バーが隠れないこと、セーフエリアにマイクボタンが被らないことを確認
- [ ] 6.8 チップのタップ → 移動 / 編集 / 削除がリロード後も反映されていることを確認
- [ ] 6.9 エクスポートした JSON をメモ全削除後にインポートして完全復元できることを確認
- [ ] 6.10 2 世代を `deploy.sh` で配信し、更新トーストから新バージョンへ更新できることを確認（design.md - D7 で委譲した観点）
- [ ] 6.11 `https://<サブドメイン>/dictionaries` の直リンク・リロードで画面が正しく表示されることを確認
- [ ] 6.12 standalone 起動時にホーム画面追加の案内が表示されないことを確認
