# grocery_manager

買い出し食材管理アプリケーション

## QuadMemo

iPhone のホーム画面から使うメモ PWA。現在は M0 のホスティング基盤と「準備中」のプレースホルダーを実装しています。メモ UI・分類・辞書・オフライン対応は後続の OpenSpec change で実装します。

## ローカルでの確認

Node.js 22 以上と npm を用意し、リポジトリのルートで実行します。

```bash
npm ci
npm run build
npx playwright install chromium webkit
```

`public/placeholder/index.html` をブラウザで開くと QuadMemo / 準備中を表示します。`npm run build` はこのディレクトリを `dist/` にコピーします。後続の UI change で Vite ビルドに置き換えます。

## 配信構成

独自サブドメイン → CloudFront（HTTPS・TLS 1.2 以上）→ OAC → 非公開 S3（東京）の構成です。ACM 証明書は us-east-1 で作成します。DNS は外部レジストラで手動管理し、Route 53 は使用しません。本番 1 環境のみです。

- HTTP は HTTPS にリダイレクトします。403/404 は `index.html` の 200 応答へ変換します。
- カスタムキャッシュポリシーは最低・既定 TTL 0 秒、最大 TTL 31536000 秒です。エントリポイントは `no-cache`、ハッシュ付きアセットは 1 年 `immutable` で配信します。
- S3 フォールバックに限り、エラー TTL を 0 秒に設定しても AWS の最小 1 秒のエッジキャッシュを許容します。通常のエントリポイントにこの例外は適用しません。
- S3 はパブリックアクセスを全ブロックし、対象ディストリビューションの OAC に `s3:GetObject` だけを許可します。CloudFront はマネージドのセキュリティヘッダーを付与します。

実装は `infra/` の Terraform（>= 1.10、AWS Provider 6.x）です。状態はバージョニング有効の別 S3 バケットに保存し、S3 ネイティブロックを使います。

### 本番環境の設定

| 項目 | 設定値 |
|------|--------|
| 配信 URL | `https://groc.sudabon.com` |
| AWS プロファイル | `sudabon` |
| tfstate バケット | `quadmemo-tfstate-groc-sudabon-com` |
| tfstate キー | `quadmemo/terraform.tfstate` |
| 配信用バケット | `quadmemo-app-<sudabon プロファイルの AWS アカウント ID>`（Terraform が決定） |
| S3 リージョン | `ap-northeast-1` |
| ACM リージョン | `us-east-1` |

2026-09-08 時点ではローカル設定を反映済みです。作業環境に `sudabon` プロファイルが未登録のため、AWS リソースはまだ作成していません。tfstate バケット名の利用可否は初回作成時に確認します。

## 初回構築

AWS CLI v2、Terraform、`dig`、外部レジストラでの DNS 編集権限を用意してください。以下は上記の本番環境用のコマンドです。事前に AWS の認証方式に応じて `sudabon` プロファイルを設定し、接続できることを確認してください。

```bash
export AWS_PROFILE=sudabon
export AWS_REGION=ap-northeast-1
export QUADMEMO_TFSTATE_BUCKET=quadmemo-tfstate-groc-sudabon-com
aws sts get-caller-identity
```

作成先アカウントを確認し、tfstate 用バケットを作成します。既存の指定バケットを利用する場合は作成を省き、所有者とバージョニング設定を確認します。

```bash
aws s3api create-bucket --bucket "$QUADMEMO_TFSTATE_BUCKET" \
  --region ap-northeast-1 \
  --create-bucket-configuration LocationConstraint=ap-northeast-1
aws s3api put-bucket-versioning --bucket "$QUADMEMO_TFSTATE_BUCKET" \
  --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket "$QUADMEMO_TFSTATE_BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api get-bucket-versioning --bucket "$QUADMEMO_TFSTATE_BUCKET"
```

`infra/versions.tf` の `backend "s3"` には `bucket = "quadmemo-tfstate-groc-sudabon-com"` を設定済みです。バケット名をリポジトリに残さない運用へ変更する場合は、この設定を外し、初回 `init` へ `-backend-config="bucket=$QUADMEMO_TFSTATE_BUCKET"` を渡せます。認証情報はコードへ書かず、AWS プロファイルを使用してください。

`infra/terraform.tfvars` はローカルに設定済みです。gitignore 対象のため、新しく clone した環境では以下の内容で作成します。

```hcl
domain_name = "groc.sudabon.com"
```

まず全体の plan を確認し、**初回だけ証明書を先行作成**します。

```bash
terraform -chdir=infra init
terraform -chdir=infra plan
terraform -chdir=infra apply -target=aws_acm_certificate.app
terraform -chdir=infra output -json acm_validation_records
```

出力された `name`・`type`・`value` をレジストラの DNS に CNAME として登録します。レジストラがドメインを自動補完する場合は二重に付けないようにします。発行後もこの検証レコードを削除しないでください。証明書の自動更新に必要です。

```bash
dig '<出力された検証レコード名>' CNAME
```

応答の CNAME が出力値と一致したら全体を適用します。ACM が ISSUED になるのを Terraform が待ち、その後 CloudFront を作成します。検証用 DNS が未登録だと待機が長時間続くため、先に `dig` で確認してください。

```bash
terraform -chdir=infra apply
terraform -chdir=infra output -raw cloudfront_domain_name
```

CloudFront のドメイン名を配信用サブドメインの CNAME の値としてレジストラに登録します。

```bash
dig groc.sudabon.com CNAME
terraform -chdir=infra plan
```

向き先が一致し、再実行した plan が `No changes.` であることを確認します。**`-target` は初回の証明書作成限定**です。通常の更新では `terraform -chdir=infra apply` を使います。

## デプロイ

初回構築と DNS 伝播の完了後、同じ AWS プロファイルで実行します。

```bash
./scripts/deploy.sh
```

Terraform の出力から配信先を取得し、ビルド → S3 同期 → 無効化完了待ちまで実行します。ビルド失敗や空の `index.html` ではアップロードしません。

`sync --delete` で古いアセットを削除します。`index.html` / `sw.js` / `registerSW.js` / `manifest.webmanifest` は `no-cache` で個別アップロードし、成果物に存在しないものは S3 から削除します。通常はこの 4 パスだけを無効化し、削除がある場合は `/*` も無効化して古いファイルが CDN に残らないようにします。

デプロイ権限は配信用バケットの一覧取得・書き込み・削除、対象 CloudFront の無効化作成・完了照会、および Terraform 出力を読むための tfstate 読み取りが必要です。AWS の課金条件は利用アカウントの現行プランで確認してください。

```bash
curl -sI https://groc.sudabon.com/
curl -sI http://groc.sudabon.com/
```

HTTPS は 200、`Cache-Control: no-cache`、`X-Content-Type-Options: nosniff`、HSTS、`X-Frame-Options` を確認します。HTTP は HTTPS へのリダイレクトを確認します。`terraform -chdir=infra output -raw app_bucket` で取得したバケット名を用い、`http://<バケット名>.s3.ap-northeast-1.amazonaws.com/index.html` への匿名アクセスが 403 になることも確認します。

更新確認はプレースホルダーの本文を 1 行変更して再デプロイし、ルートと `/settings` のリロードで変更を確認します。削除確認は不要になった検証用ファイルを成果物から削除して再デプロイし、`aws s3 ls` で削除を確認します。SPA フォールバックがあるため、削除 URL は 404 ではなくアプリシェルの 200 になります。ハッシュ付きアセット導入後は `aws s3api head-object --bucket <バケット名> --key <アセットのキー>` で長期キャッシュヘッダーも確認します。

## 検証

配信 E2E は Playwright / TypeScript で実装し、Chromium と WebKit（iPhone 13 プリセット）を使います。実際の配信サブドメインを指定してください。

```bash
E2E_BASE_URL=https://groc.sudabon.com npx playwright test --grep @setup-quadmemo-hosting
E2E_BASE_URL=https://groc.sudabon.com npx playwright test --project=chromium --grep @setup-quadmemo-hosting
E2E_BASE_URL=https://groc.sudabon.com npx playwright test --project=mobile-safari --grep @setup-quadmemo-hosting
```

URL 未指定・HTTP 指定の場合はホスティング E2E をスキップします。スキップは本番受け入れの成功を意味しません。WebKit のエミュレーションは iPhone 実機検証の代替ではありません。

AWS 接続なしでのコード検証:

```bash
terraform -chdir=infra init -backend=false
terraform -chdir=infra validate
terraform fmt -check -recursive infra
bash -n scripts/deploy.sh
node --test tests/scripts/*.test.mjs
bash scripts/check-test-plan.sh --change setup-quadmemo-hosting
```

`check-test-plan.sh` は引数なしなら `origin/main...HEAD` の差分を確認します。未コミットの change を確認する場合は `--change` を使います。Terraform の backend 無効での検証後、実環境へ適用する際は通常の `terraform init` を実行してください。

## 仕様

- [製品仕様](quadmemo-spec.md)
- [ホスティングの設計](openspec/changes/setup-quadmemo-hosting/design.md)
- [受け入れ仕様](openspec/changes/setup-quadmemo-hosting/specs/static-hosting/spec.md)
- [E2E 検証計画](openspec/changes/setup-quadmemo-hosting/test-plan.md)
- [実装・実環境検証の進捗](openspec/changes/setup-quadmemo-hosting/tasks.md)
