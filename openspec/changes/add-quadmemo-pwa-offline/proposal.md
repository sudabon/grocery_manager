## Why

QuadMemo は「iPhone のホーム画面から開いて、その場で発話してメモする」使い方を前提としている（仕様書 §1）。ブラウザのタブから開く限り、起動の速さ・全画面表示・オフライン動作という前提が満たされず、アプリとして成立しない。

また、端末内保存のみで動くアプリはネットワークに依存しないはずだが、アプリシェル自体をキャッシュしていなければ圏外では起動すらできない。M4 でここを閉じることで、仕様書 §15 の受け入れ基準（オフライン起動・全機能動作）を満たせる状態にする。

同時に、更新を確実に届ける仕組みを入れる。Service Worker は「一度配ったら古いまま残り続ける」という固有の事故があるため、更新検知と適用の導線を最初から用意する。

## What Changes

- `vite-plugin-pwa`（Workbox）を導入し、アプリシェル（HTML / JS / CSS / アイコン）を事前キャッシュする。更新方式は `registerType: 'prompt'`
- `manifest.webmanifest` を生成する（`name` / `short_name` / `display: standalone` / `orientation: portrait` / `start_url` / `scope` / `theme_color` / `background_color` / 192・512・maskable-512 のアイコン）（仕様書 §9.1）
- `public/icons/` にアイコン一式（192 / 512 / maskable 512 / apple-touch-icon 180）と生成元 SVG を追加し、`index.html` に `apple-touch-icon` を設置する
- 新バージョン検知時に画面上部へ更新通知を表示し、操作で新しい Service Worker を有効化して再読み込みする
- ブラウザ表示（standalone でない）かつ未インストール時に、初回のみホーム画面追加の案内バナーを表示する（仕様書 §9.3）
- 設定画面に Service Worker の登録・更新状態を表示する（`add-quadmemo-dictionaries` で作った設定画面へ追記）
- 外部リソース（Web フォント等）へ依存しないことを担保する（システムフォントのみ使用）
- `playwright.config.ts` にビルド成果物を配信する preview サーバーと、それを使う `pwa` プロジェクトを追加する（Service Worker は開発サーバーでは検証にならないため）
- `scripts/deploy.sh` の除外リストを実際のビルド成果物（`sw.js` / `registerSW.js` / `manifest.webmanifest`）と突き合わせ、`sw.js` が長期キャッシュされないことを確認する（`setup-quadmemo-hosting` design - D4 の宿題）

本 change をもって Phase 1（仕様書 §14 の M0〜M4）が完了する。付録 A（Phase 2 / クラウド音声認識）は本 change の範囲外。

## Capabilities

### New Capabilities

- `pwa-shell`: ホーム画面へインストールして standalone で起動できること、オフラインで起動・全機能が動作すること、更新を検知して適用できること、インストール導線とアプリ状態の提示に関する振る舞い

### Modified Capabilities

（なし。`static-hosting` の「更新が届くキャッシュ制御」は既に `sw.js` を対象に含めて定義しており、本 change はその対象ファイルを初めて実体化する）

## Impact

- **新規**: `public/icons/`（アイコン一式と生成元 SVG）、`src/components/UpdateToast.tsx`、`src/components/InstallHintBanner.tsx`、`src/pwa/registerSW.ts`（更新検知の購読）
- **変更**: `vite.config.ts`（`vite-plugin-pwa` 設定）、`index.html`（`apple-touch-icon`、`theme-color`）、`src/pages/SettingsPage.tsx`（Service Worker 状態の表示）、`playwright.config.ts`（preview サーバーと `pwa` プロジェクト）、`README.md`（PWA の検証手順）
- **依存追加**: `vite-plugin-pwa`（dev 依存）
- **データ**: インストール案内の表示済みフラグを端末内保存（`settings` レコードの内部項目）に追加する。利用者が編集する設定項目ではない
- **配信**: `dist/` に `sw.js` / `registerSW.js` / `manifest.webmanifest` が出力される。これらは `no-cache` で配信されなければならない（`static-hosting` の要求）
- **運用上の注意**: Service Worker を配信し始めると、以後は「古い SW が残る」事故が起こり得る。ロールバック時も新しい SW を配る（SW を消す）操作が必要になる
