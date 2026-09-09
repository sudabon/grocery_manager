## Context

`add-quadmemo-dictionaries` までで、メモ・分類・永続化・辞書編集・設定・エクスポート/インポートが揃っている。まだ Service Worker と manifest が無いため、ホーム画面追加もオフライン起動もできない。

`setup-quadmemo-hosting` の配信側は既に「エントリポイント（`index.html` / `sw.js` / `manifest.webmanifest` / `icons/` 固定名 3 ファイル）は `no-cache`、ハッシュ付きアセットは 1 年 immutable」で構成済みで、本 change で初めて `sw.js` 系が実体化する（同 change design - D4 の宿題を回収する）。

動機は proposal.md - Why を参照。要求の原本は specs/pwa-shell/spec.md。PWA 要件は仕様書 §9、iOS 固有の注意は §10。

## Goals / Non-Goals

**Goals:**

- オフラインで「起動し、全機能が動く」ことを E2E で回帰検証できる状態にする
- Service Worker の更新が確実に届く経路を作り、古い SW が固着する事故を仕組みで防ぐ
- インストール前（ブラウザ表示）と インストール後（standalone）で、案内の出方を作り分ける

**Non-Goals:**

- 付録 A（Whisper 系 API によるクラウド音声認識）
- プッシュ通知・バックグラウンド同期（外部送信ゼロ方針と矛盾する）
- ランタイムキャッシュ戦略の作り込み（外部リソースに依存しないため precache のみで足りる）
- Android / デスクトップでのインストール体験の最適化（対象は iPhone）

## Decisions

### D1: `vite-plugin-pwa` + `registerType: 'prompt'`

- **採用**: Workbox の precache でアプリシェル（HTML / JS / CSS / アイコン）をキャッシュ。戦略は CacheFirst。ランタイムキャッシュは設定しない
- **`prompt` を選ぶ理由**: `autoUpdate` は利用者の操作なしにページを差し替える。QuadMemo は入力途中の未コミットテキストを持つため、勝手なリロードで入力が失われる。spec の「利用者の操作なしに表示中のバージョンを切り替えてはならない」はこの判断を明文化したもの
- **代替案**: 自前の Service Worker（Workbox の precache manifest 生成を手書きすることになり、ビルド成果物のハッシュ管理を自分で持つ必要がある）

### D2: 更新通知は `registerSW` のコールバックを購読するだけの薄い層に閉じる

```ts
// src/pwa/registerSW.ts
export function subscribeUpdates(onNeedRefresh: () => void): { update(): Promise<void> }
```

- UI（`UpdateBanner`）は「通知を出す」「更新を実行する」しか知らない。これにより E2E とユニットテストから更新イベントを注入しやすくなる
- 更新実行は `updateServiceWorker(true)`（`skipWaiting` → `clients.claim` → リロード）

### D3: アイコンはコミット済み PNG + 生成元 SVG（ビルド時生成にしない）

- `public/icons/` に `icon-192.png` / `icon-512.png` / `apple-touch-icon-180.png` の PNG 3 枚を置く。512 px は any / maskable 共用とし、生成元は `design/icon.svg` に置く
- **理由**: 画像変換ツール（sharp 等）をビルド依存に加えたくない（仕様書 §4 の依存最小方針）。アイコンは頻繁に変わらないため、生成コマンドを README に書いて手動更新で足りる
- マスカブルアイコンはセーフゾーン（中央 80%）にモチーフを収める

### D3-2: テーマ色は仕様の `#1a1a2e` を採用し、起動時のフラッシュを許容する

`quadmemo-spec.md` がマニフェストの `theme_color` / `background_color` を `#1a1a2e` と規定しているため
この値を採用する。アプリ実面の背景は `src/styles.css` の `#f6f5f0`、アイコン背景は `#295642` で、
standalone 起動時は `background_color` の濃紺スプラッシュからクリームのアプリ画面へ切り替わる
視覚的なフラッシュが毎回発生する。仕様値を正としてこれを許容する。
`index.html` の `meta[name=theme-color]` もマニフェストと揃えて `#1a1a2e` にする。
配色を一致させる場合は仕様側の変更が必要であり、本 change の範囲外とする。

### D4: インストール案内の「初回のみ」フラグは端末内保存（`settings` レコードの内部項目）

- 仕様書 §4 が `localStorage` 不使用を明示しているため、`settings` ストアのレコードへ内部項目（利用者が編集しない項目）として持たせる
- standalone 判定は `matchMedia('(display-mode: standalone)')`。iOS 特有の `navigator.standalone` も併用して判定漏れを防ぐ
- **トレードオフ**: 端末内保存が使えない環境（保存不可の案内が出ている状態）では「初回のみ」を記録できず、毎回案内が出る。保存不可の案内が既に出ている状況なので許容する

### D5: Service Worker 状態の表示は設定画面のアプリ情報欄へ追記

`add-quadmemo-dictionaries` が作ったアプリ情報欄に「Service Worker: 確認中 / 登録済み / 更新待機中 / 未登録」を足す。取得元は D2 の購読状態（`usePwaState()`）。registration を直接問い合わせないため、登録完了までは「確認中」として表示される。

### D6: PWA 系 E2E はビルド成果物（preview サーバー）に対して実行する

- 開発サーバーでは Service Worker の precache が本番と同じにならないため、Service Worker とオフラインの検証は `npm run build` 済みの成果物を配信する preview サーバーに対して行う
- `playwright.config.ts` の `webServer` を配列にし、既存の dev サーバー（ポート 3000）に加えて preview サーバー（ポート 3001）を起動する。`pwa` プロジェクトだけが 3001 を `baseURL` として使う
- `pwa` は iPhone 13 プリセットの画面・タッチ等の条件を維持し、`browserName: 'chromium'` で実行する。Playwright の Service Worker 検証は Chromium 系がサポート対象であり、WebKit ではオフライン再読み込みが内部エラーになることを確認したため（2026-09-09 利用者承認）。既存の `mobile-safari` プロジェクトは WebKit を維持する
- Safari 固有の Service Worker・オフライン動作は既存の iPhone 実機受け入れ（6.1〜6.12）で確認する。Chromium のデバイスエミュレーションを実機検証の代替にしない
- `E2E_BASE_URL` の指定時は dev の起動を省き、既存プロジェクトで指定先を使う。`E2E_PWA_BASE_URL` の指定時は preview の起動を省き、`pwa` で指定先を使う。各サーバーは個別に制御し、両変数を指定すると両方とも起動しない（`setup-quadmemo-hosting` の配信先 E2E と共存させる）。preview は `reuseExistingServer: false` とし、3001 が使用中なら失敗させて古いビルドの再利用を防ぐ
- **トレードオフ**: E2E 全体の実行前にビルドが 1 回走るため起動が遅くなる。PWA の検証を本番相当で行う価値の方が大きい

### D7: 更新フローの E2E は「通知の表示」までを対象にし、適用は実機へ委譲

- 新しいビルドを配信し直して SW の更新を発火させる E2E は、ビルド 2 世代の用意と SW のライフサイクル待ちが必要で、フレークの温床になる
- そこで E2E では、更新イベントを注入する fixture（`env:sw-update-available`）で「通知と更新導線が出ること」「更新しなければ表示が維持されること」を検証する
- 実際の `skipWaiting` → リロードによる差し替えは、`deploy.sh` で 2 世代を配信して実機で確認する（仕様書 §15 の受け入れ基準）

### D7-2: `clientsClaim: true` と `skipWaiting: false` の併用による非同意タブの扱い

同意したタブが `skipWaiting` を送ると新 SW が activate し、`clientsClaim` により
同意していないタブも新 SW の管理下に入る。非同意タブは `update()` の同意フラグが立っていないため
再読み込みせず、旧 JS のまま新しい precache を参照する。現在アプリが動的 import するのは
既ロードの `workbox-window` チャンクのみで実害は小さいが、ルート分割を導入した場合は
非同意タブで旧ハッシュ資産の取得が失敗しうる。その時点で `clientsClaim` の見直しが必要。
iOS の standalone は単一ウィンドウのため、当面はこのトレードオフを許容する。

### D8: `sw.js` のキャッシュ制御を配信後に実測する

`setup-quadmemo-hosting` design - D4 の宿題。`npm run build` の実出力ファイル名（`index.html` / `sw.js` / `manifest.webmanifest` / `icons/` 固定名 3 ファイル）と `scripts/deploy.sh` の除外リストを突き合わせ、デプロイ後に `curl -I` で `cache-control: no-cache` を実測する。ここが崩れると以後の更新が一切届かなくなるため、受け入れタスクとして明示する。

## Risks / Trade-offs

- **`sw.js` が長期キャッシュされ、更新が永久に届かなくなる**（最も復旧が難しい） → D8 の実測を受け入れ条件にする。加えて `static-hosting` の要求として `no-cache` が spec 化されている
- **古い SW が残り、新しいアセットと組み合わさって壊れる** → precache は世代ごとに独立したキャッシュ名を使う（Workbox の既定）。更新時は `skipWaiting` + `clients.claim` で一括切り替えする
- **`prompt` 方式で利用者が更新しないまま古い版を使い続ける** → 通知は消えないバナーとして表示し続ける。強制更新はしない（入力途中の消失を避ける判断）
- **iOS の standalone PWA でストレージが回収される** → 対処は `add-quadmemo-dictionaries` のエクスポート。設定画面のバックアップ推奨文言で運用に落とす
- **Service Worker が絡む E2E のフレーク** → SW 登録完了を明示的な状態（アプリが「オフライン利用可」を表す状態を持つ）で待つ。`waitForTimeout` は使わない
- **preview サーバー導入で E2E 起動が遅くなる** → PWA プロジェクトのみが preview を使う構成にし、他プロジェクトは dev サーバーのままにする
- **ロールバック時に SW を消す操作が必要** → 手順を README に残す（前バージョンの `sw.js` を配り直す＝`deploy.sh` を旧成果物で再実行する）

## Migration Plan

- 初回の SW 配信時、既存の利用者（ブラウザで開いていた人）は次回アクセス時に SW が登録される。以後は更新通知経由で新版を受け取る
- ロールバック: 旧ビルドで `deploy.sh` を再実行する。SW も旧版に戻るため、利用者は更新通知を経て旧版へ切り替わる。SW 自体を撤去する場合は、空の SW（`self.skipWaiting()` のみ）を配って登録解除する手順を README に記載する

## Open Questions

- なし（Phase 2 の音声認識モードは本 change の範囲外であり、仕様・タスク分割に影響しない）
