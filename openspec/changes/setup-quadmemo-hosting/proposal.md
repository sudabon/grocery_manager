## Why

QuadMemo は iPhone のホーム画面に追加した PWA として使う前提のアプリであり、Service Worker の登録・`display: standalone` での起動・ホーム画面追加の導線はいずれも HTTPS 配信を必須とする。したがってアプリ実装より先に、独自サブドメインでの HTTPS 配信基盤（仕様書 §16）と、そこへ成果物を届けるデプロイ経路を用意する。

配信基盤は後続の全 change（UI・分類・辞書・PWA）の検証環境になるため、最初に固定しておくことで「ローカルでは動くが実機 standalone では動かない」という手戻りを避けられる。

## What Changes

- `infra/` に Terraform 一式を追加し、**S3（非公開・OAC 経由）+ CloudFront + ACM（us-east-1）** の構成を IaC 化する（仕様書 §16.2）
- CloudFront に SPA フォールバック（403/404 → `/index.html` を 200 で返す）を設定し、`/dictionaries` などの直リンク・リロードを成立させる
- キャッシュポリシーは最低・既定 TTL 0 秒、最大 TTL 1 年のカスタムポリシーとする。S3 のエラーからのフォールバックに限り AWS の最小 1 秒のエッジキャッシュを許容する
- `scripts/deploy.sh` を追加し、ビルド → S3 同期（キャッシュヘッダー付与）→ CloudFront 無効化までを 1 コマンドにする
- M0 時点の配信物として、ビルド成果物の代わりにプレースホルダーページを用意する（アプリ実体は次 change 以降）
- リポジトリを npm プロジェクトとして初期化し、`playwright.config.ts` に `chromium` と `mobile-safari`（WebKit / iPhone プリセット）の 2 プロジェクトを定義する
- `.gitignore` を追加し、`node_modules` / `dist` / `test-results` / `.terraform` / `*.tfvars` をコミット対象外にする

前提（仕様書 §16.1 のとおり）:

- DNS は外部レジストラで管理し、**ACM の DNS 検証 CNAME と配信用 CNAME の 2 レコードはレジストラ側で手動登録**する（Terraform 管理外・Route 53 不使用）
- tfstate 用 S3 バケットは事前に手動作成し、S3 ネイティブロック（`use_lockfile = true`）を使う
- 環境は本番 1 面のみ。workspace による環境分割は行わない

## Capabilities

### New Capabilities

- `static-hosting`: アプリを独自サブドメインの HTTPS で配信し、SPA の直リンクを解決し、更新を確実に配信するための静的ホスティング基盤の外部観測可能な振る舞い

### Modified Capabilities

（なし。既存 spec は存在しない）

## Impact

- **新規**: `infra/*.tf`、`scripts/deploy.sh`、`public/placeholder/`（M0 の配信物）、`package.json`、`.gitignore`
- **変更**: `playwright.config.ts`（実行プロジェクト定義の追加）
- **外部システム**: AWS（S3・CloudFront・ACM）に課金対象リソースが作成される。ドメインのレジストラ側 DNS レコードを人手で 2 件登録する運用が発生する
- **後続 change への影響**: `npm run build` の実体は本 change ではプレースホルダーのコピーだが、`add-quadmemo-quadrant-ui` で Vite ビルドへ差し替える。`deploy.sh` の除外リストは `vite-plugin-pwa` 導入時（`add-quadmemo-pwa-offline`）に成果物名と突き合わせて見直す
- **セキュリティ**: S3 バケットはパブリックアクセス全ブロックとし、CloudFront OAC からの `s3:GetObject` のみを許可する
